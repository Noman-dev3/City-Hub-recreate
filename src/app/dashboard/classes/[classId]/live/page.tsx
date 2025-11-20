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
  Monitor,
  MonitorOff,
  Mic,
  MicOff,
  Circle,
  Presentation,
  Video,
  VideoOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CanvasEditor as EnhancedCanvasEditor } from '@/components/whiteboard/CanvasEditor';

type UserProfile = { fullName: string; role: 'student' | 'teacher' };
type ClassDetails = { id: string; name: string; teacherId: string };
type SessionData = {
  jitsiRoom?: string;
  isActive: boolean;
  recording?: boolean;
  whiteboardActive?: boolean;
};
type ViewMode = 'video-only' | 'whiteboard-only' | 'split-view';

export default function LiveClassPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('video-only');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
 
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const isTeacher = user?.uid === classDetails?.teacherId;
  const jitsiRoom = useMemo(() => `Class_${classId}`.replace(/[^a-zA-Z0-9-_]/g, '_'), [classId]);

  // Firebase listeners
  useEffect(() => {
    if (!user || !firestore) return;
    const unsub = onSnapshot(doc(firestore, 'users', user.uid), (doc) => {
      if (doc.exists()) setProfile(doc.data() as UserProfile);
    });
    return () => unsub();
  }, [user, firestore]);

  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'classes', classId), (doc) => {
      if (doc.exists()) setClassDetails(doc.data() as ClassDetails);
    });
    return () => unsub();
  }, [firestore, classId]);

  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'classes', classId, 'session', 'current'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as SessionData;
        setSessionData(data);
        setIsRecording(!!data.recording);
       
        // Sync whiteboard state across all users
        if (data.whiteboardActive && viewMode === 'video-only') {
          setViewMode('split-view');
        } else if (!data.whiteboardActive && viewMode !== 'video-only') {
          setViewMode('video-only');
        }
      }
    });
    return () => unsub();
  }, [firestore, classId]);

  // Initialize Jitsi API for better control
  useEffect(() => {
    if (!sessionData?.isActive || !iframeRef.current) return;
    // Wait for iframe to load
    const timer = setTimeout(() => {
      try {
        jitsiApiRef.current = (iframeRef.current?.contentWindow as any)?.JitsiMeetExternalAPI;
      } catch (e) {
        console.error('Jitsi API not ready:', e);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [sessionData?.isActive]);

  // Auto-open join dialog
  useEffect(() => {
    if (profile && classDetails && !isInitialized) {
      if (!sessionData?.isActive) {
        setShowJoinDialog(isTeacher);
      } else {
        setIsInitialized(true);
      }
    }
  }, [profile, classDetails, sessionData, isInitialized, isTeacher]);

  const handleJoin = async (asObserver = false) => {
    if (!firestore || !user || !profile) return;
    try {
      setError('');
      setShowJoinDialog(false);
      if (isTeacher) {
        await setDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
          jitsiRoom,
          isActive: true,
          startedAt: serverTimestamp(),
          recording: false,
          whiteboardActive: false,
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
        await toggleRecording(); // Stop recording and auto-download before ending session
      }
      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        isActive: false,
        endedAt: serverTimestamp(),
      });
      await updateDoc(doc(firestore, 'classes', classId), { isLive: false });
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
        await toggleRecording(); // If teacher leaves while recording, stop and download
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
      // Stop local recording
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      // Update Firebase (optional, since this is local recording)
      await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), {
        recording: false,
        recordingStoppedAt: serverTimestamp(),
      });
      setIsRecording(false);
      toast({ title: 'Recording stopped and downloading...' });
    } else {
      try {
        // Prompt user to share screen/window/tab with audio
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true, // This enables system/tab audio capture depending on browser selection
        });

        // Handle stream end (e.g., user stops sharing)
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (isRecording) {
              toggleRecording();
            }
          };
        });

        // Determine supported MIME type, preferring MP4
        const mimeTypes = [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=opus',
          'video/webm',
        ];
        const supportedMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
        const fileExtension = supportedMime.includes('mp4') ? 'mp4' : 'webm';

        // Set up MediaRecorder
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

        recorderRef.current.onerror = (e) => {
          console.error('Recording error:', e);
          toast({ variant: 'destructive', title: 'Recording error', description: 'An error occurred during recording.' });
        };

        // Start recording with 1-second chunks to avoid memory issues
        recorderRef.current.start(1000);

        // Update Firebase (optional, to sync recording state visually)
        await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), {
          recording: true,
          recordingStartedAt: serverTimestamp(),
        });

        setIsRecording(true);
        toast({ 
          title: 'Recording started!', 
          description: `Recording in ${fileExtension.toUpperCase()} format. Share the browser window or tab containing the class video for best results.` 
        });
      } catch (err) {
        console.error('Failed to start recording:', err);
        toast({ variant: 'destructive', title: 'Failed to start recording', description: 'Please allow screen and audio sharing.' });
      }
    }
  };

  const toggleWhiteboard = async () => {
    if (!isTeacher || !firestore) return;
    const newMode: ViewMode = viewMode === 'video-only' ? 'split-view' : 'video-only';
    setViewMode(newMode);
    // Sync whiteboard state to all participants
    await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
      whiteboardActive: newMode !== 'video-only',
    });
    toast({
      title: newMode === 'video-only' ? 'Whiteboard hidden' : 'Whiteboard shown',
      description: newMode !== 'video-only' ? 'All participants can now see the whiteboard' : undefined
    });
  };

  const cycleViewMode = () => {
    const modes: ViewMode[] = ['video-only', 'split-view', 'whiteboard-only'];
    const currentIndex = modes.indexOf(viewMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setViewMode(nextMode);
  };

  const isLoading = userLoading || !profile || !classDetails || (!isInitialized && !showJoinDialog);
  const jitsiUrl = `https://8x8.vc/vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/${jitsiRoom}#config.startWithVideoMuted=true&config.startWithAudioMuted=false&interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false`;

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
      <div className="flex flex-col h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-lg">{classDetails?.name}</span>
            {isRecording && (
              <div className="flex items-center gap-2 text-red-600 font-medium">
                <Circle className="w-4 h-4 fill-current animate-pulse" />
                <span>Recording</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle (for all users) */}
            {sessionData?.whiteboardActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={cycleViewMode}
                className="gap-2"
              >
                {viewMode === 'video-only' && <><Video className="w-4 h-4" /> Video Only</>}
                {viewMode === 'split-view' && <><Monitor className="w-4 h-4" /> Split View</>}
                {viewMode === 'whiteboard-only' && <><Presentation className="w-4 h-4" /> Whiteboard</>}
              </Button>
            )}
            {isTeacher && (
              <>
                <Button
                  size="sm"
                  variant={isRecording ? 'destructive' : 'default'}
                  onClick={toggleRecording}
                  className="gap-2"
                >'use client';
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
  Monitor,
  MonitorOff,
  Mic,
  MicOff,
  Circle,
  Presentation,
  Video,
  VideoOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CanvasEditor as EnhancedCanvasEditor } from '@/components/whiteboard/CanvasEditor';

type UserProfile = { fullName: string; role: 'student' | 'teacher' };
type ClassDetails = { id: string; name: string; teacherId: string };
type SessionData = {
  jitsiRoom?: string;
  isActive: boolean;
  recording?: boolean;
  whiteboardActive?: boolean;
};
type ViewMode = 'video-only' | 'whiteboard-only' | 'split-view';

export default function LiveClassPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('video-only');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
 
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const isTeacher = user?.uid === classDetails?.teacherId;
  const jitsiRoom = useMemo(() => `Class_${classId}`.replace(/[^a-zA-Z0-9-_]/g, '_'), [classId]);

  // Firebase listeners
  useEffect(() => {
    if (!user || !firestore) return;
    const unsub = onSnapshot(doc(firestore, 'users', user.uid), (doc) => {
      if (doc.exists()) setProfile(doc.data() as UserProfile);
    });
    return () => unsub();
  }, [user, firestore]);

  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'classes', classId), (doc) => {
      if (doc.exists()) setClassDetails(doc.data() as ClassDetails);
    });
    return () => unsub();
  }, [firestore, classId]);

  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'classes', classId, 'session', 'current'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as SessionData;
        setSessionData(data);
        setIsRecording(!!data.recording);
       
        // Sync whiteboard state across all users
        if (data.whiteboardActive && viewMode === 'video-only') {
          setViewMode('split-view');
        } else if (!data.whiteboardActive && viewMode !== 'video-only') {
          setViewMode('video-only');
        }
      }
    });
    return () => unsub();
  }, [firestore, classId]);

  // Initialize Jitsi API for better control
  useEffect(() => {
    if (!sessionData?.isActive || !iframeRef.current) return;
    // Wait for iframe to load
    const timer = setTimeout(() => {
      try {
        jitsiApiRef.current = (iframeRef.current?.contentWindow as any)?.JitsiMeetExternalAPI;
      } catch (e) {
        console.error('Jitsi API not ready:', e);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [sessionData?.isActive]);

  // Auto-open join dialog
  useEffect(() => {
    if (profile && classDetails && !isInitialized) {
      if (!sessionData?.isActive) {
        setShowJoinDialog(isTeacher);
      } else {
        setIsInitialized(true);
      }
    }
  }, [profile, classDetails, sessionData, isInitialized, isTeacher]);

  const handleJoin = async (asObserver = false) => {
    if (!firestore || !user || !profile) return;
    try {
      setError('');
      setShowJoinDialog(false);
      if (isTeacher) {
        await setDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
          jitsiRoom,
          isActive: true,
          startedAt: serverTimestamp(),
          recording: false,
          whiteboardActive: false,
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
        await toggleRecording(); // Stop recording and auto-download before ending session
      }
      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        isActive: false,
        endedAt: serverTimestamp(),
      });
      await updateDoc(doc(firestore, 'classes', classId), { isLive: false });
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
        await toggleRecording(); // If teacher leaves while recording, stop and download
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
      // Stop local recording
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      // Update Firebase (optional, since this is local recording)
      await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), {
        recording: false,
        recordingStoppedAt: serverTimestamp(),
      });
      setIsRecording(false);
      toast({ title: 'Recording stopped and downloading...' });
    } else {
      try {
        // Prompt user to share screen/window/tab with audio
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true, // This enables system/tab audio capture depending on browser selection
        });

        // Handle stream end (e.g., user stops sharing)
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (isRecording) {
              toggleRecording();
            }
          };
        });

        // Determine supported MIME type, preferring MP4
        const mimeTypes = [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=opus',
          'video/webm',
        ];
        const supportedMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
        const fileExtension = supportedMime.includes('mp4') ? 'mp4' : 'webm';

        // Set up MediaRecorder
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

        recorderRef.current.onerror = (e) => {
          console.error('Recording error:', e);
          toast({ variant: 'destructive', title: 'Recording error', description: 'An error occurred during recording.' });
        };

        // Start recording with 1-second chunks to avoid memory issues
        recorderRef.current.start(1000);

        // Update Firebase (optional, to sync recording state visually)
        await updateDoc(doc(firestore!, 'classes', classId, 'session', 'current'), {
          recording: true,
          recordingStartedAt: serverTimestamp(),
        });

        setIsRecording(true);
        toast({ 
          title: 'Recording started!', 
          description: `Recording in ${fileExtension.toUpperCase()} format. Share the browser window or tab containing the class video for best results.` 
        });
      } catch (err) {
        console.error('Failed to start recording:', err);
        toast({ variant: 'destructive', title: 'Failed to start recording', description: 'Please allow screen and audio sharing.' });
      }
    }
  };

  const toggleWhiteboard = async () => {
    if (!isTeacher || !firestore) return;
    const newMode: ViewMode = viewMode === 'video-only' ? 'split-view' : 'video-only';
    setViewMode(newMode);
    // Sync whiteboard state to all participants
    await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
      whiteboardActive: newMode !== 'video-only',
    });
    toast({
      title: newMode === 'video-only' ? 'Whiteboard hidden' : 'Whiteboard shown',
      description: newMode !== 'video-only' ? 'All participants can now see the whiteboard' : undefined
    });
  };

  const cycleViewMode = () => {
    const modes: ViewMode[] = ['video-only', 'split-view', 'whiteboard-only'];
    const currentIndex = modes.indexOf(viewMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setViewMode(nextMode);
  };

  const isLoading = userLoading || !profile || !classDetails || (!isInitialized && !showJoinDialog);
  const jitsiUrl = `https://8x8.vc/vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/${jitsiRoom}#config.startWithVideoMuted=true&config.startWithAudioMuted=false&interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false`;

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
      <div className="flex flex-col h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-lg">{classDetails?.name}</span>
            {isRecording && (
              <div className="flex items-center gap-2 text-red-600 font-medium">
                <Circle className="w-4 h-4 fill-current animate-pulse" />
                <span>Recording</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle (for all users) */}
            {sessionData?.whiteboardActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={cycleViewMode}
                className="gap-2"
              >
                {viewMode === 'video-only' && <><Video className="w-4 h-4" /> Video Only</>}
                {viewMode === 'split-view' && <><Monitor className="w-4 h-4" /> Split View</>}
                {viewMode === 'whiteboard-only' && <><Presentation className="w-4 h-4" /> Whiteboard</>}
              </Button>
            )}
            {isTeacher && (
              <>
                <Button
                  size="sm"
                  variant={isRecording ? 'destructive' : 'default'}
                  onClick={toggleRecording}
                  className="gap-2"
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isRecording ? 'Stop Recording' : 'Record'}
                </Button>
                <Button
                  size="sm"
                  variant={viewMode !== 'video-only' ? 'default' : 'outline'}
                  onClick={toggleWhiteboard}
                  className="gap-2"
                >
                  {viewMode !== 'video-only' ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                  {viewMode !== 'video-only' ? 'Hide Board' : 'Show Board'}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleEndSession}>
                  <Power className="w-4 h-4 mr-2" /> End for All
                </Button>
              </>
            )}
           
            {!isTeacher && (
              <Button size="sm" variant="destructive" onClick={handleLeaveSession}>
                <PhoneOff className="w-4 h-4 mr-2" /> Leave
              </Button>
            )}
          </div>
        </header>
        {/* Main Content */}
        <div className="flex-1 flex relative overflow-hidden">
          {/* Jitsi Video Container */}
          <div
            className={`transition-all duration-300 ${
              viewMode === 'video-only' ? 'w-full' :
              viewMode === 'split-view' ? 'w-1/2' :
              'w-0 opacity-0'
            }`}
          >
            {error && (
              <Alert variant="destructive" className="m-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
           
            {sessionData?.isActive ? (
              <iframe
                ref={iframeRef}
                src={jitsiUrl}
                className="w-full h-full"
                allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
                allowFullScreen
                title="Jitsi Meet"
              />
            ) : (
              <div className="w-full h-full bg-gray-900 flex items-center justify-center text-white text-xl">
                Waiting for teacher to start the session...
              </div>
            )}
          </div>
          {/* Whiteboard Container */}
          <div
            className={`transition-all duration-300 bg-white ${
              viewMode === 'video-only' ? 'w-0 opacity-0' :
              viewMode === 'split-view' ? 'w-1/2 border-l-2' :
              'w-full'
            }`}
          >
            {viewMode !== 'video-only' && user && (
              <EnhancedCanvasEditor
                classId={classId}
                isTeacher={isTeacher}
                userId={user.uid}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isRecording ? 'Stop Recording' : 'Record'}
                </Button>
                <Button
                  size="sm"
                  variant={viewMode !== 'video-only' ? 'default' : 'outline'}
                  onClick={toggleWhiteboard}
                  className="gap-2"
                >
                  {viewMode !== 'video-only' ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                  {viewMode !== 'video-only' ? 'Hide Board' : 'Show Board'}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleEndSession}>
                  <Power className="w-4 h-4 mr-2" /> End for All
                </Button>
              </>
            )}
           
            {!isTeacher && (
              <Button size="sm" variant="destructive" onClick={handleLeaveSession}>
                <PhoneOff className="w-4 h-4 mr-2" /> Leave
              </Button>
            )}
          </div>
        </header>
        {/* Main Content */}
        <div className="flex-1 flex relative overflow-hidden">
          {/* Jitsi Video Container */}
          <div
            className={`transition-all duration-300 ${
              viewMode === 'video-only' ? 'w-full' :
              viewMode === 'split-view' ? 'w-1/2' :
              'w-0 opacity-0'
            }`}
          >
            {error && (
              <Alert variant="destructive" className="m-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
           
            {sessionData?.isActive ? (
              <iframe
                ref={iframeRef}
                src={jitsiUrl}
                className="w-full h-full"
                allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
                allowFullScreen
                title="Jitsi Meet"
              />
            ) : (
              <div className="w-full h-full bg-gray-900 flex items-center justify-center text-white text-xl">
                Waiting for teacher to start the session...
              </div>
            )}
          </div>
          {/* Whiteboard Container */}
          <div
            className={`transition-all duration-300 bg-white relative z-10 ${
              viewMode === 'video-only' ? 'w-0 opacity-0' :
              viewMode === 'split-view' ? 'w-1/2 border-l-2' :
              'w-full'
            }`}
          >
            {viewMode !== 'video-only' && user && (
              <EnhancedCanvasEditor
                classId={classId}
                isTeacher={isTeacher}
                userId={user.uid}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
