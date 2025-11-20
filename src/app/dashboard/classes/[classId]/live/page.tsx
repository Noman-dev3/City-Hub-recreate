'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Power,
  PhoneOff,
  Mic,
  MicOff,
  ShieldCheck,
  Video,
  Users,
  Wifi,
  Loader2,
  LayoutTemplate,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// --- CONFIGURATION ---
const JAAS_APP_ID = 'vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d';

// YOUR REAL JWT (Used only for the Teacher to grant Moderator rights)
const TEACHER_JWT = "eyJraWQiOiJ2cGFhcy1tYWdpYy1jb29raWUtN2JiMGIxZWU4ZGY1NGZhY2IzOTIzODJjMDAwNzEwMmQvNTgxNzZiLVNBTVBMRV9BUFAiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJqaXRzaSIsImlzcyI6ImNoYXQiLCJpYXQiOjE3NjM2NTczMTMsImV4cCI6MTc2MzY2NDUxMywibmJmIjoxNzYzNjU3MzA4LCJzdWIiOiJ2cGFhcy1tYWdpYy1jb29raWUtN2JiMGIxZWU4ZGY1NGZhY2IzOTIzODJjMDAwNzEwMmQiLCJjb250ZXh0Ijp7ImZlYXR1cmVzIjp7ImxpdmVzdHJlYW1pbmciOnRydWUsImZpbGUtdXBsb2FkIjp0cnVlLCJvdXRib3VuZC1jYWxsIjp0cnVlLCJzaXAtb3V0Ym91bmQtY2FsbCI6ZmFsc2UsInRyYW5zY3JpcHRpb24iOnRydWUsImxpc3QtdmlzaXRvcnMiOmZhbHNlLCJyZWNvcmRpbmciOnRydWUsImZsaXAiOmZhbHNlfSwidXNlciI6eyJoaWRkZW4tZnJvbS1yZWNvcmRlciI6ZmFsc2UsIm1vZGVyYXRvciI6dHJ1ZSwibmFtZSI6Im5vbWFuLmRldjMiLCJpZCI6Imdvb2dsZS1vYXV0aDJ8MTA3ODE4MTg3NDI2MjYxNTM0OTU2IiwiYXZhdGFyIjoiIiwiZW1haWwiOiJub21hbi5kZXYzQGdtYWlsLmNvbSJ9fSwicm9vbSI6IioifQ.KjuPMEIP3LYlXrjX0OgiGc-ECb1swke0M03gN6WnNuq7mzXPUNFS4tpcAWXObj5TOkiiQsn-9AamRWPTZNnnF-AwjGsT44q5h-yQiPOOaUuBqGNysd4hDma3SY2ES8luUuMy2vQNQcqamtarGXhNR14R0IcTdYXE5lTvM-o55OyakeMN3dgbhYUwsU5oVlXLkJswuaQEJlDOI9NhCytXlgyEyb8QP8qniVvr-b8xalv6NIUe1ZKwIH0SqKxjMIitHZGc9dOBZ9XSyNh4_OMKc-PKQjCi2NjPgNwP8aCdyEJpAaCVOIfwDGLAuiN0aXvLho_dV9zE8qMvkxrLMaMpfw";

// --- TYPES ---
type UserProfile = { fullName: string; role: 'student' | 'teacher' };
type ClassDetails = { id: string; name: string; teacherId: string };
type SessionData = {
  jitsiRoom?: string;
  isActive: boolean;
  recording?: boolean;
};

export default function LiveClassPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  
  // --- HOOKS ---
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  // --- STATE ---
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');

  // --- REFS ---
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  // --- COMPUTED VALUES ---
  const isTeacher = user?.uid === classDetails?.teacherId;
  const jitsiRoom = useMemo(() => `Class_${classId}`.replace(/[^a-zA-Z0-9-_]/g, '_'), [classId]);

  // --- FIREBASE DATA SYNC ---
  useEffect(() => {
    if (!user || !firestore) return;
    
    // 1. User Profile
    const unsubUser = onSnapshot(doc(firestore, 'users', user.uid), (d) => {
      if (d.exists()) setProfile(d.data() as UserProfile);
    });

    // 2. Class Details
    const unsubClass = onSnapshot(doc(firestore, 'classes', classId), (d) => {
      if (d.exists()) setClassDetails(d.data() as ClassDetails);
    });

    // 3. Session Status
    const unsubSession = onSnapshot(doc(firestore, 'classes', classId, 'session', 'current'), (d) => {
      if (d.exists()) {
        const data = d.data() as SessionData;
        setSessionData(data);
        setIsRecording(!!data.recording);
      }
    });

    return () => { unsubUser(); unsubClass(); unsubSession(); };
  }, [user, firestore, classId]);

  // --- LOAD EXTERNAL JITSI SCRIPT ---
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.JitsiMeetExternalAPI) {
      const script = document.createElement('script');
      script.src = `https://8x8.vc/${JAAS_APP_ID}/external_api.js`;
      script.async = true;
      document.body.appendChild(script);
      return () => { document.body.removeChild(script); };
    }
  }, []);

  // --- INITIALIZE JITSI (FIXED) ---
  useEffect(() => {
    // FIX: Added !user check here to prevent "N is null" error
    if (!sessionData?.isActive || !jitsiContainerRef.current || !window.JitsiMeetExternalAPI || !profile || !user) return;
    if (jitsiApiRef.current) return; 

    const initJitsi = async () => {
      try {
        const token = isTeacher ? TEACHER_JWT : null;

        const options = {
          roomName: `${JAAS_APP_ID}/${jitsiRoom}`,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          jwt: token, 
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: true,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
              'fodeviceselection', 'hangup', 'profile', 'chat', 
              'raisehand', 'videoquality', 'tileview', 
              'videobackgroundblur', 'download', 'help', 'mute-everyone', 'security'
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_REMOTE_DISPLAY_NAME: 'Student',
          },
          userInfo: {
            displayName: profile.fullName, 
            email: user?.email || 'user@example.com' // FIX: Optional chaining + fallback
          }
        };

        const api = new window.JitsiMeetExternalAPI('8x8.vc', options);
        jitsiApiRef.current = api;

        api.addEventListeners({
          videoConferenceLeft: () => handleLeaveSession(),
          participantJoined: (participant: any) => console.log('User joined:', participant),
        });

      } catch (err) {
        console.error('Jitsi Error:', err);
        setError('Failed to load secure video stream.');
      }
    };

    setTimeout(initJitsi, 200);

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [sessionData?.isActive, profile, jitsiRoom, isTeacher, user]); // Added user to deps

  // --- AUTO DIALOG LOGIC ---
  useEffect(() => {
    if (profile && classDetails && !isInitialized) {
      if (!sessionData?.isActive) {
        setShowJoinDialog(isTeacher);
      } else if (!isTeacher) {
        setShowJoinDialog(true);
      }
    }
  }, [profile, classDetails, sessionData, isInitialized, isTeacher]);

  // --- HANDLERS ---
  const handleJoin = async (asObserver = false) => {
    if (!firestore || !user || !profile) return;
    try {
      setShowJoinDialog(false);
      
      if (isTeacher) {
        await setDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
          jitsiRoom,
          isActive: true,
          startedAt: serverTimestamp(),
          recording: false,
        });
        await updateDoc(doc(firestore, 'classes', classId), { isLive: true });
      }
      
      await setDoc(doc(firestore, 'classes', classId, 'participants', user.uid), {
        userId: user.uid,
        userName: profile.fullName,
        isHost: isTeacher,
        joinedAt: serverTimestamp(),
        isObserver: asObserver,
        active: true,
      });

      await addDoc(collection(firestore, 'classes', classId, 'messages'), {
        text: `${profile.fullName} joined the class`,
        senderId: 'system',
        senderName: 'System',
        timestamp: serverTimestamp(),
      });

      setIsInitialized(true);
      toast({ title: isTeacher ? 'Class Started' : 'Joined Successfully' });
    } catch (err: any) {
      setError(err.message);
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const toggleRecording = async () => {
    if (!isTeacher) return;
    if (isRecording) {
      recorderRef.current?.stop();
      await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), { recording: false });
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const mime = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
        recorderRef.current = new MediaRecorder(stream, { mimeType: mime });
        recordingChunksRef.current = [];
        recorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) recordingChunksRef.current.push(e.data);
        };
        recorderRef.current.onstop = () => {
          const blob = new Blob(recordingChunksRef.current, { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Recording_${classDetails?.name}.${mime === "video/mp4" ? "mp4" : "webm"}`;
          a.click();
          URL.revokeObjectURL(url);
        };
        recorderRef.current.start(1000);
        await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), { recording: true });
        setIsRecording(true);
        toast({ title: 'Recording Started' });
      } catch (e) {
        toast({ variant: 'destructive', title: 'Permission Denied' });
      }
    }
  };

  const handleEndSession = async () => {
    if (isRecording) await toggleRecording();
    if (jitsiApiRef.current) jitsiApiRef.current.dispose();
    await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), { isActive: false });
    await updateDoc(doc(firestore!, 'classes', classId), { isLive: false });
    router.push(`/dashboard/classes/${classId}`);
  };

  const handleLeaveSession = async () => {
    if (user) {
      await updateDoc(doc(firestore!, 'classes', classId, 'participants', user.uid), { active: false });
    }
    router.push(`/dashboard/classes/${classId}`);
  };

  // --- LOADING VIEW ---
  const isLoading = userLoading || !profile || !classDetails || (!isInitialized && !showJoinDialog && sessionData?.isActive);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-black" />
        <div className="z-10 flex flex-col items-center animate-in zoom-in duration-700 fade-in">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
          <h2 className="text-xl font-bold tracking-wide">Establishing Connection</h2>
          <p className="text-slate-500 text-sm mt-2">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 overflow-hidden">
      <header className="h-16 px-6 flex items-center justify-between z-30 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className={`relative flex h-3 w-3`}>
            {isRecording && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isRecording ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-slate-100">{classDetails.name}</h1>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-500">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              <span>Encrypted</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isTeacher ? (
            <>
              <Button 
                size="sm" 
                onClick={toggleRecording}
                className={`transition-all duration-300 border backdrop-blur-md font-medium ${isRecording ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-slate-800/50 text-slate-300 border-slate-700'}`}
              >
                {isRecording ? <MicOff className="w-4 h-4 mr-2 animate-pulse" /> : <Mic className="w-4 h-4 mr-2" />}
                {isRecording ? 'Stop Rec' : 'Record'}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleEndSession}>
                <Power className="w-4 h-4 mr-2" /> End Class
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={handleLeaveSession} className="border-red-900/30 text-red-400 bg-red-950/10">
              <PhoneOff className="w-4 h-4 mr-2" /> Leave
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 relative bg-black group overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none" />
        {error && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md animate-in slide-in-from-top-4 fade-in duration-500">
            <Alert variant="destructive" className="bg-red-950/80 border-red-900 text-red-200 backdrop-blur-md">
              <AlertDescription className="flex items-center justify-center font-medium">
                <Wifi className="w-4 h-4 mr-2" /> {error}
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          {sessionData?.isActive ? (
            <div ref={jitsiContainerRef} className="w-full h-full animate-in fade-in zoom-in-95 duration-700 ease-out" />
          ) : (
            <div className="flex flex-col items-center animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-slate-900/50 backdrop-blur-sm rounded-full flex items-center justify-center mb-6 border border-slate-800">
                <LayoutTemplate className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-200">Classroom Offline</h3>
              <p className="text-slate-500 mt-2 font-medium">Waiting for teacher...</p>
            </div>
          )}
        </div>
      </main>

      {showJoinDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 zoom-in-95 duration-500">
            <div className="h-36 bg-gradient-to-br from-indigo-600 to-purple-700 flex flex-col items-center justify-center relative">
               <Users className="w-10 h-10 text-white mb-2 drop-shadow-lg" />
               <div className="text-white font-bold text-lg tracking-wide">{isTeacher ? 'Teacher Console' : 'Student Entry'}</div>
            </div>
            <div className="p-6 space-y-3 pt-6">
              <Button size="lg" onClick={() => handleJoin(false)} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold h-12 rounded-xl">
                {isTeacher ? 'Launch Class' : 'Join Now'}
              </Button>
              {!isTeacher && (
                <Button variant="ghost" size="lg" onClick={() => handleJoin(true)} className="w-full text-slate-400 hover:text-white h-12 rounded-xl">
                  Join as Observer
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
