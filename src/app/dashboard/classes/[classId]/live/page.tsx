'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Power,
  PhoneOff,
  Mic,
  MicOff,
  Circle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// --- Types ---
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
  
  // Firebase & User Hooks
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  // State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  // Derived State
  const isTeacher = user?.uid === classDetails?.teacherId;
  const jitsiRoom = useMemo(() => `Class_${classId}`.replace(/[^a-zA-Z0-9-_]/g, '_'), [classId]);

  // --- 1. Fetch User Profile ---
  useEffect(() => {
    if (!user || !firestore) return;
    const unsub = onSnapshot(doc(firestore, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) setProfile(docSnap.data() as UserProfile);
    });
    return () => unsub();
  }, [user, firestore]);

  // --- 2. Fetch Class Details ---
  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'classes', classId), (docSnap) => {
      if (docSnap.exists()) setClassDetails(docSnap.data() as ClassDetails);
    });
    return () => unsub();
  }, [firestore, classId]);

  // --- 3. Sync Session Data ---
  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'classes', classId, 'session', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SessionData;
        setSessionData(data);
        setIsRecording(!!data.recording);
      }
    });
    return () => unsub();
  }, [firestore, classId]);

  // --- 4. Jitsi API Initialization ---
  useEffect(() => {
    if (!sessionData?.isActive || !iframeRef.current) return;
    
    // Small delay to ensure iframe is mounted in DOM
    const timer = setTimeout(() => {
      try {
        // Accessing Jitsi API from the iframe window
        jitsiApiRef.current = (iframeRef.current?.contentWindow as any)?.JitsiMeetExternalAPI;
      } catch (e) {
        console.error('Jitsi API not ready:', e);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [sessionData?.isActive]);

  // --- 5. Join Dialog Logic ---
  useEffect(() => {
    if (profile && classDetails && !isInitialized) {
      // If session isn't active, show dialog only to teacher to start it
      // If session IS active, auto-join logic is handled via dialog normally
      if (!sessionData?.isActive) {
        setShowJoinDialog(isTeacher);
      } else {
        // If student loads page and session is active, we could auto-join or show dialog
        // Current logic: mark initialized to prevent loops, but wait for user action via dialog if not handled
        // Note: Logic adjusted to ensure dialog shows if not joined yet
        if (!isTeacher) setShowJoinDialog(true); 
      }
    }
  }, [profile, classDetails, sessionData, isInitialized, isTeacher]);

  // --- Handlers ---

  const handleJoin = async (asObserver = false) => {
    if (!firestore || !user || !profile) return;
    try {
      setError('');
      setShowJoinDialog(false);

      if (isTeacher) {
        // Initialize Session
        await setDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
          jitsiRoom,
          isActive: true,
          startedAt: serverTimestamp(),
          recording: false,
        });
        await updateDoc(doc(firestore, 'classes', classId), { isLive: true });
      }

      // Add Participant
      await setDoc(doc(firestore, 'classes', classId, 'participants', user.uid), {
        userId: user.uid,
        userName: profile.fullName,
        isHost: isTeacher,
        joinedAt: serverTimestamp(),
        isObserver: asObserver,
        active: true,
      });

      // System Message
      await addDoc(collection(firestore, 'classes', classId, 'messages'), {
        text: `${profile.fullName} ${asObserver ? 'joined as observer' : 'joined the class'}`,
        senderId: 'system',
        senderName: 'System',
        timestamp: serverTimestamp(),
      });

      setIsInitialized(true);
      toast({ title: 'Joined successfully!' });
    } catch (err: any) {
      setError(err.message || 'Failed to join');
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const handleEndSession = async () => {
    if (!firestore) return;
    try {
      if (isRecording) {
        await toggleRecording();
      }

      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        isActive: false,
        endedAt: serverTimestamp(),
      });
      await updateDoc(doc(firestore, 'classes', classId), { isLive: false });

      // Deactivate all participants
      const parts = await getDocs(collection(firestore, 'classes', classId, 'participants'));
      parts.forEach((d) => updateDoc(d.ref, { active: false }));

      toast({ title: 'Session ended' });
      router.push(`/dashboard/classes/${classId}`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to end session' });
    }
  };

  const handleLeaveSession = async () => {
    if (!user || !firestore || !profile) return;
    try {
      if (isTeacher && isRecording) {
        await toggleRecording();
      }
      await updateDoc(doc(firestore, 'classes', classId, 'participants', user.uid), { active: false });
      
      await addDoc(collection(firestore, 'classes', classId, 'messages'), {
        text: `${profile.fullName} left the class`,
        senderId: 'system',
        senderName: 'System',
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
    }
    router.push(`/dashboard/classes/${classId}`);
  };

  const toggleRecording = async () => {
    if (!isTeacher) {
      toast({ variant: 'destructive', title: 'Only teachers can control recording' });
      return;
    }

    if (isRecording) {
      // STOP RECORDING
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), {
        recording: false,
        recordingStoppedAt: serverTimestamp(),
      });
      setIsRecording(false);
      toast({ title: 'Recording stopped and downloading...' });
    } else {
      // START RECORDING
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        // Handle user stopping share via browser UI
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (isRecording) toggleRecording();
          };
        });

        // Detect best mime type
        const mimeTypes = [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm',
        ];
        const supportedMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
        const fileExtension = supportedMime.includes('mp4') ? 'mp4' : 'webm';

        recorderRef.current = new MediaRecorder(stream, { mimeType: supportedMime });
        recordingChunksRef.current = [];

        recorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordingChunksRef.current.push(e.data);
          }
        };

        recorderRef.current.onstop = () => {
          const blob = new Blob(recordingChunksRef.current, { type: supportedMime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `class_${classId}_recording.${fileExtension}`;
          a.click();
          URL.revokeObjectURL(url);
          recordingChunksRef.current = [];
          recorderRef.current = null;
        };

        recorderRef.current.start(1000);

        await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), {
          recording: true,
          recordingStartedAt: serverTimestamp(),
        });

        setIsRecording(true);
        toast({ 
          title: 'Recording started!', 
          description: `Recording in ${fileExtension.toUpperCase()}. Keep this tab open.` 
        });
      } catch (err) {
        console.error('Failed to start recording:', err);
        toast({ variant: 'destructive', title: 'Failed to start recording', description: 'Please allow screen and audio sharing.' });
      }
    }
  };

  const isLoading = userLoading || !profile || !classDetails || (!isInitialized && !showJoinDialog && sessionData?.isActive);
  // JaaS URL - configured to be cleaner
  const jitsiUrl = `https://8x8.vc/vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/${jitsiRoom}#config.startWithVideoMuted=true&config.startWithAudioMuted=false&interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false&config.prejoinPageEnabled=false`;

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <Skeleton className="h-16 w-16 rounded-full mx-auto" />
        <p className="text-muted-foreground mt-4">Connecting to live class...</p>
      </div>
    );
  }

  return (
    <>
      {/* Join Dialog */}
      {showJoinDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">
              {isTeacher ? 'Start Live Class' : 'Join Class'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {isTeacher
                ? 'Start the live session for your students'
                : 'Join the ongoing live class session'}
            </p>
            <div className="flex gap-3 mt-6">
              <Button size="lg" onClick={() => handleJoin(false)} className="flex-1">
                {isTeacher ? 'Start Class' : 'Join'}
              </Button>
              {!isTeacher && (
                <Button size="lg" variant="outline" onClick={() => handleJoin(true)}>
                  Observer Mode
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-950">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 shadow-sm border-b px-4 py-3 flex items-center justify-between z-20 h-16">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-lg">{classDetails?.name}</span>
            {isRecording && (
              <div className="flex items-center gap-2 text-red-600 font-medium ml-4">
                <Circle className="w-4 h-4 fill-current animate-pulse" />
                <span>Recording</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isTeacher ? (
              <>
                <Button
                  size="sm"
                  variant={isRecording ? 'destructive' : 'secondary'}
                  onClick={toggleRecording}
                  className="gap-2"
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isRecording ? 'Stop Rec' : 'Record'}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleEndSession}>
                  <Power className="w-4 h-4 mr-2" /> End Class
                </Button>
              </>
            ) : (
              <Button size="sm" variant="destructive" onClick={handleLeaveSession}>
                <PhoneOff className="w-4 h-4 mr-2" /> Leave
              </Button>
            )}
          </div>
        </header>

        {/* Main Content - Full Screen Video */}
        <div className="flex-1 relative overflow-hidden bg-gray-900">
          {error && (
            <Alert variant="destructive" className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-auto">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {sessionData?.isActive ? (
            <iframe
              ref={iframeRef}
              src={jitsiUrl}
              className="w-full h-full border-0"
              allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
              allowFullScreen
              title="Jitsi Meet"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white">
              <div className="text-xl font-medium">Waiting for teacher to start...</div>
              <p className="text-gray-400 mt-2">The video feed will appear here automatically.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
