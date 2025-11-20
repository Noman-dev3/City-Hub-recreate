'use client';

import { useEffect, useState, useRef } from 'react';
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
  deleteDoc,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Power,
  PhoneOff,
  Monitor,
  MonitorOff,
  Circle,
  Pencil,
  Eraser,
  Square,
  CircleIcon,
  Type,
  Trash2,
  Download,
  Undo,
  Redo,
  Camera,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// RecordRTC (install: npm install recordrtc)
import RecordRTC from 'recordrtc';

type UserProfile = { fullName: string; role: 'student' | 'teacher' };
type ClassDetails = { id: string; name: string; teacherId: string };
type SessionData = { jitsiRoom?: string; isActive: boolean; recording?: boolean };

type DrawElement = {
  id: string;
  type: 'path' | 'rect' | 'circle' | 'text';
  data: any;
  color: string;
  lineWidth: number;
  userId: string;
  userName: string;
  timestamp: number;
};

export default function LiveClassPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  // User & Class State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  // UI State
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [error, setError] = useState('');

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState<RecordRTC | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  // Whiteboard State
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser' | 'rect' | 'circle' | 'text'>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [undoStack, setUndoStack] = useState<DrawElement[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isTeacher = user?.uid === classDetails?.teacherId;
  const jitsiRoom = `Class_${classId}`.replace(/[^a-zA-Z0-9-_]/g, '_');

  // ==================== FIREBASE LISTENERS ====================
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
      }
    });
    return () => unsub();
  }, [firestore, classId]);

  // Listen to whiteboard elements
  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(
      collection(firestore, 'classes', classId, 'whiteboard'),
      (snapshot) => {
        const els: DrawElement[] = [];
        snapshot.forEach((doc) => {
          els.push({ id: doc.id, ...doc.data() } as DrawElement);
        });
        els.sort((a, b) => a.timestamp - b.timestamp);
        setElements(els);
      }
    );
    return () => unsub();
  }, [firestore, classId]);

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

  // ==================== SESSION MANAGEMENT ====================
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
      if (isRecording && recorder) {
        stopRecording();
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
      await updateDoc(doc(firestore, 'classes', classId, 'participants', user.uid), {
        active: false,
      });
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

  // ==================== RECORDING (RecordRTC) ====================
  const startRecording = async () => {
    try {
      // Get display + audio stream
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: true,
      });

      streamRef.current = displayStream;

      const recordRTC = new RecordRTC(displayStream, {
        type: 'video',
        mimeType: 'video/webm',
        bitsPerSecond: 128000,
      });

      recordRTC.startRecording();
      setRecorder(recordRTC);
      setIsRecording(true);
      toast({ title: 'Recording started!' });

      if (firestore) {
        await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
          recording: true,
          recordingStartedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Recording failed',
        description: 'Please allow screen sharing',
      });
    }
  };

  const stopRecording = () => {
    if (!recorder) return;

    recorder.stopRecording(() => {
      const blob = recorder.getBlob();
      setRecordedChunks([blob]);
      setIsRecording(false);

      // Download automatically
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `class-recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Recording saved!' });

      if (firestore) {
        updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
          recording: false,
          recordingStoppedAt: serverTimestamp(),
        });
      }

      // Clean up stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    });
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ==================== WHITEBOARD DRAWING ====================
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and redraw all elements
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    elements.forEach((el) => {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'path') {
        ctx.beginPath();
        el.data.forEach((pt: { x: number; y: number }, i: number) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      } else if (el.type === 'rect') {
        ctx.strokeRect(el.data.x, el.data.y, el.data.w, el.data.h);
      } else if (el.type === 'circle') {
        ctx.beginPath();
        ctx.arc(el.data.x, el.data.y, el.data.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.type === 'text') {
        ctx.font = '20px Arial';
        ctx.fillStyle = el.color;
        ctx.fillText(el.data.text, el.data.x, el.data.y);
      }
    });
  }, [elements]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!user || !profile) return;
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (currentTool === 'pen' || currentTool === 'eraser') {
      setCurrentPath([pos]);
    } else if (currentTool === 'text') {
      const text = prompt('Enter text:');
      if (text && firestore) {
        addDoc(collection(firestore, 'classes', classId, 'whiteboard'), {
          type: 'text',
          data: { text, x: pos.x, y: pos.y },
          color: currentColor,
          lineWidth: lineWidth,
          userId: user.uid,
          userName: profile.fullName,
          timestamp: Date.now(),
        });
      }
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !user || !profile) return;
    const pos = getMousePos(e);

    if (currentTool === 'pen' || currentTool === 'eraser') {
      setCurrentPath((prev) => [...prev, pos]);
    }
  };

  const handleMouseUp = async () => {
    if (!isDrawing || !user || !profile || !firestore) return;
    setIsDrawing(false);

    if (currentTool === 'pen' || currentTool === 'eraser') {
      if (currentPath.length > 1) {
        await addDoc(collection(firestore, 'classes', classId, 'whiteboard'), {
          type: 'path',
          data: currentPath,
          color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
          lineWidth: currentTool === 'eraser' ? 20 : lineWidth,
          userId: user.uid,
          userName: profile.fullName,
          timestamp: Date.now(),
        });
      }
      setCurrentPath([]);
    }
  };

  const clearWhiteboard = async () => {
    if (!firestore) return;
    const snapshot = await getDocs(collection(firestore, 'classes', classId, 'whiteboard'));
    snapshot.forEach((doc) => deleteDoc(doc.ref));
    toast({ title: 'Whiteboard cleared' });
  };

  const downloadWhiteboard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${Date.now()}.png`;
    a.click();
    toast({ title: 'Whiteboard saved!' });
  };

  const captureWhiteboard = () => {
    if (!canvasRef.current) return;
    
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whiteboard-snapshot-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Snapshot captured!' });
      }
    });
  };

  // ==================== RENDER ====================
  const isLoading = userLoading || !profile || !classDetails || (!isInitialized && !showJoinDialog);
  const jitsiUrl = `https://8x8.vc/vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/${jitsiRoom}#config.startWithVideoMuted=false&config.startWithAudioMuted=false`;

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
            <div className="flex gap-3 mt-6">
              <Button size="lg" onClick={() => handleJoin(false)} className="flex-1">
                {isTeacher ? 'Start Class' : 'Join'}
              </Button>
              {!isTeacher && (
                <Button size="lg" variant="outline" onClick={() => handleJoin(true)}>
                  Observer
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between z-10">
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
            {isTeacher && (
              <>
                <Button
                  size="sm"
                  variant={isRecording ? 'destructive' : 'default'}
                  onClick={toggleRecording}
                  className="gap-2"
                >
                  <Circle className="w-4 h-4" />
                  {isRecording ? 'Stop Rec' : 'Record'}
                </Button>

                <Button
                  size="sm"
                  variant={showWhiteboard ? 'default' : 'outline'}
                  onClick={() => setShowWhiteboard(!showWhiteboard)}
                  className="gap-2"
                >
                  {showWhiteboard ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                  Board
                </Button>

                <Button size="sm" variant="destructive" onClick={handleEndSession}>
                  <Power className="w-4 h-4 mr-2" /> End
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
          {/* Jitsi Video */}
          <div
            className={`transition-all duration-300 ${
              showWhiteboard ? 'w-1/2' : 'w-full'
            } h-full`}
          >
            {error && (
              <Alert variant="destructive" className="m-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <iframe
              ref={iframeRef}
              src={sessionData?.isActive ? jitsiUrl : undefined}
              className="w-full h-full"
              allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
              allowFullScreen
              title="Jitsi Meet"
            />

            {!sessionData?.isActive && (
              <div className="w-full h-full bg-gray-900 flex items-center justify-center text-white text-xl">
                Waiting for teacher to start...
              </div>
            )}
          </div>

          {/* Whiteboard Panel */}
          {showWhiteboard && (
            <div className="w-1/2 h-full bg-white shadow-2xl flex flex-col">
              {/* Whiteboard Toolbar */}
              <div className="bg-gray-800 text-white p-3 flex justify-between items-center">
                <h3 className="font-bold">Collaborative Whiteboard</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={currentTool === 'pen' ? 'default' : 'ghost'}
                    onClick={() => setCurrentTool('pen')}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool === 'eraser' ? 'default' : 'ghost'}
                    onClick={() => setCurrentTool('eraser')}
                  >
                    <Eraser className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool === 'rect' ? 'default' : 'ghost'}
                    onClick={() => setCurrentTool('rect')}
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool === 'circle' ? 'default' : 'ghost'}
                    onClick={() => setCurrentTool('circle')}
                  >
                    <CircleIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool === 'text' ? 'default' : 'ghost'}
                    onClick={() => setCurrentTool('text')}
                  >
                    <Type className="w-4 h-4" />
                  </Button>

                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => setCurrentColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                  />

                  <select
                    value={lineWidth}
                    onChange={(e) => setLineWidth(Number(e.target.value))}
                    className="bg-gray-700 text-white rounded px-2"
                  >
                    <option value={1}>Thin</option>
                    <option value={2}>Normal</option>
                    <option value={5}>Thick</option>
                    <option value={10}>Extra</option>
                  </select>

                  <Button size="sm" variant="ghost" onClick={captureWhiteboard}>
                    <Camera className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={downloadWhiteboard}>
                    <Download className="w-4 h-4" />
                  </Button>
                  {isTeacher && (
                    <Button size="sm" variant="ghost" onClick={clearWhiteboard}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowWhiteboard(false)}
                  >
                    ✕
                  </Button>
                </div>
              </div>

              {/* Canvas */}
              <div className="flex-1 overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={1200}
                  height={800}
                  className="w-full h-full cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
                }
