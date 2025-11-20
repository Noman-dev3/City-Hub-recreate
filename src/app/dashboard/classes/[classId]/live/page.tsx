'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
  arrayUnion,
  getFirestore,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  getStorage,
} from 'firebase/storage';
import { getAuth } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Power,
  PhoneOff,
  Pencil,
  Trash2,
  Square,
  Play,
  Monitor,
  X,
  Circle,
  RectangleHorizontal,
  Triangle,
  Type,
  Image as ImageIcon,
  MousePointer2,
  Move,
  Palette,
  Download,
  ArrowRight,
} from 'lucide-react';

// JWT Configuration for JaaS (8x8)
const JWT_TOKEN = "eyJraWQiOiJ2cGFhcy1tYWdpYy1jb29raWUtN2JiMGIxZWU4ZGY1NGZhY2IzOTIzODJjMDAwNzEwMmQvNTgxNzZiLVNBTVBMRV9BUFAiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJqaXRzaSIsImlzcyI6ImNoYXQiLCJpYXQiOjE3NjM2NTA0MDYsImV4cCI6MTc2MzY1NzYwNiwibmJmIjoxNzYzNjUwNDAxLCJzdWIiOiJ2cGFhcy1tYWdpYy1jb29raWUtN2JiMGIxZWU4ZGY1NGZhY2IzOTIzODJjMDAwNzEwMmQiLCJjb250ZXh0Ijp7ImZlYXR1cmVzIjp7ImxpdmVzdHJlYW1pbmciOnRydWUsImZpbGUtdXBsb2FkIjp0cnVlLCJvdXRib3VuZC1jYWxsIjp0cnVlLCJzaXAtb3V0Ym91bmQtY2FsbCI6ZmFsc2UsInRyYW5zY3JpcHRpb24iOnRydWUsImxpc3QtdmlzaXRvcnMiOmZhbHNlLCJyZWNvcmRpbmciOnRydWUsImZsaXAiOmZhbHNlfSwidXNlciI6eyJoaWRkZW4tZnJvbS1yZWNvcmRlciI6ZmFsc2UsIm1vZGVyYXRvciI6dHJ1ZSwibmFtZSI6Im5vbWFuLmRldjMiLCJpZCI6Imdvb2dsZS1vYXV0aDJ8MTA3ODE4MTg3NDI2MjYxNTM0OTU2IiwiYXZhdGFyIjoiIiwiZW1haWwiOiJub21hbi5kZXYzQGdtYWlsLmNvbSJ9fSwicm9vbSI6IioifQ.pDpa9o-2IKBdOVhMJ_T2R9K4bLhBcs6gAVNYmY9YJac5iF6QrL4N9dTGpMpzq5GIxBoQ55Ko1r8lAwi6exPyb1HEvPGoKiD0FhsohGPL8oh002B3acuUoelXp-hadeC_C2yjx4N1aCLT2ojor9XCXe8Q5RoSAEAY27_Zpqwftm4wkXd7Mws8LECg2ebxSx38GfyPaV2hgU62MKN98T2qd6S39fiba7_4F9cWJ3K21Q2mpNBxLv9wyqFRG_-k7zePsZLlAInRB1_nu8ybWHM49QQ8UUuMr90Q4BGsdZ6iKRXlLOBk89X1cio7ld42P2y70b3h59u5Mbw8y6YYMXp3SQ";

// Advanced Whiteboard Component
function AdvancedWhiteboard({ isTeacher, onClose, classId, firestore }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#1e1f25');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [objects, setObjects] = useState([]);
  const [selectedObj, setSelectedObj] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [currentPath, setCurrentPath] = useState(null);
  const imageInputRef = useRef(null);

  // Load whiteboard state from Firestore
  useEffect(() => {
    if (!firestore || !classId) return;
    
    const unsubscribe = onSnapshot(
      doc(firestore, 'classes', classId, 'session', 'current'),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.whiteboardObjects) {
            setObjects(data.whiteboardObjects);
          }
          if (data.whiteboardBgColor) {
            setBgColor(data.whiteboardBgColor);
          }
        }
      }
    );

    return () => unsubscribe();
  }, [firestore, classId]);

  // Draw all objects
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = containerRef.current.clientWidth;
    canvas.height = containerRef.current.clientHeight - 180;

    // Clear and draw background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all objects
    objects.forEach((obj, idx) => {
      drawObject(ctx, obj, idx === selectedObj);
    });
  }, [objects, bgColor, selectedObj]);

  const drawObject = (ctx, obj, isSelected) => {
    ctx.save();

    if (obj.type === 'path') {
      ctx.beginPath();
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (obj.points && obj.points.length > 0) {
        ctx.moveTo(obj.points[0].x, obj.points[0].y);
        for (let i = 1; i < obj.points.length; i++) {
          ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }
      }
      ctx.stroke();
    } else if (obj.type === 'circle') {
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.radius, 0, 2 * Math.PI);
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.strokeWidth;
      ctx.fillStyle = obj.fill || 'transparent';
      ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'rect') {
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.strokeWidth;
      ctx.fillStyle = obj.fill || 'transparent';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
    } else if (obj.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(obj.x, obj.y);
      ctx.lineTo(obj.x + obj.width / 2, obj.y + obj.height);
      ctx.lineTo(obj.x - obj.width / 2, obj.y + obj.height);
      ctx.closePath();
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.strokeWidth;
      ctx.fillStyle = obj.fill || 'transparent';
      ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'text') {
      ctx.font = `${obj.fontSize || 24}px Arial`;
      ctx.fillStyle = obj.color;
      ctx.fillText(obj.text, obj.x, obj.y);
    } else if (obj.type === 'image' && obj.imageData) {
      const img = new Image();
      img.src = obj.imageData;
      ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    } else if (obj.type === 'arrow') {
      const headlen = 15;
      const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      
      ctx.beginPath();
      ctx.moveTo(obj.x1, obj.y1);
      ctx.lineTo(obj.x2, obj.y2);
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.strokeWidth;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(obj.x2, obj.y2);
      ctx.lineTo(obj.x2 - headlen * Math.cos(angle - Math.PI / 6), obj.y2 - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(obj.x2 - headlen * Math.cos(angle + Math.PI / 6), obj.y2 - headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = obj.color;
      ctx.fill();
    }

    // Draw selection box
    if (isSelected && obj.type !== 'path') {
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      const bounds = getObjectBounds(obj);
      ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  const getObjectBounds = (obj) => {
    if (obj.type === 'circle') {
      return {
        x: obj.x - obj.radius,
        y: obj.y - obj.radius,
        width: obj.radius * 2,
        height: obj.radius * 2
      };
    } else if (obj.type === 'rect' || obj.type === 'image') {
      return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    } else if (obj.type === 'triangle') {
      return {
        x: obj.x - obj.width / 2,
        y: obj.y,
        width: obj.width,
        height: obj.height
      };
    } else if (obj.type === 'text') {
      return { x: obj.x, y: obj.y - 20, width: 200, height: 30 };
    } else if (obj.type === 'arrow') {
      return {
        x: Math.min(obj.x1, obj.x2),
        y: Math.min(obj.y1, obj.y2),
        width: Math.abs(obj.x2 - obj.x1),
        height: Math.abs(obj.y2 - obj.y1)
      };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
  };

  const isPointInObject = (x, y, obj) => {
    const bounds = getObjectBounds(obj);
    return x >= bounds.x && x <= bounds.x + bounds.width &&
           y >= bounds.y && y <= bounds.y + bounds.height;
  };

  const handleMouseDown = (e) => {
    if (!isTeacher) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'select') {
      // Find clicked object
      for (let i = objects.length - 1; i >= 0; i--) {
        if (isPointInObject(x, y, objects[i])) {
          setSelectedObj(i);
          setIsDragging(true);
          setDragStart({ x, y, objX: objects[i].x, objY: objects[i].y });
          return;
        }
      }
      setSelectedObj(null);
    } else if (tool === 'draw') {
      setCurrentPath({ type: 'path', points: [{ x, y }], color, strokeWidth });
    } else if (tool === 'arrow') {
      setCurrentPath({ type: 'arrow', x1: x, y1: y, x2: x, y2: y, color, strokeWidth });
    } else {
      setDragStart({ x, y });
    }
  };

  const handleMouseMove = (e) => {
    if (!isTeacher) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging && selectedObj !== null && dragStart) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      
      const newObjects = [...objects];
      const obj = { ...newObjects[selectedObj] };
      
      if (obj.type === 'path') return; // Can't move paths
      
      obj.x = dragStart.objX + dx;
      obj.y = dragStart.objY + dy;
      
      if (obj.type === 'arrow') {
        obj.x2 = obj.x2 + dx;
        obj.y2 = obj.y2 + dy;
      }
      
      newObjects[selectedObj] = obj;
      setObjects(newObjects);
    } else if (currentPath) {
      if (currentPath.type === 'path') {
        setCurrentPath({ ...currentPath, points: [...currentPath.points, { x, y }] });
      } else if (currentPath.type === 'arrow') {
        setCurrentPath({ ...currentPath, x2: x, y2: y });
      }
    } else if (dragStart) {
      if (tool === 'circle' || tool === 'rect' || tool === 'triangle') {
        // Preview shape while dragging
      }
    }
  };

  const handleMouseUp = async (e) => {
    if (!isTeacher) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentPath) {
      const newObjects = [...objects, currentPath];
      setObjects(newObjects);
      await updateFirestore(newObjects);
      setCurrentPath(null);
    } else if (isDragging) {
      await updateFirestore(objects);
      setIsDragging(false);
      setDragStart(null);
    } else if (dragStart && tool !== 'select' && tool !== 'draw') {
      let newObj = null;
      const width = Math.abs(x - dragStart.x);
      const height = Math.abs(y - dragStart.y);
      const centerX = (x + dragStart.x) / 2;
      const centerY = (y + dragStart.y) / 2;

      if (tool === 'circle') {
        const radius = Math.sqrt(width * width + height * height) / 2;
        newObj = { type: 'circle', x: centerX, y: centerY, radius, color, strokeWidth, fill: 'transparent' };
      } else if (tool === 'rect') {
        newObj = { type: 'rect', x: dragStart.x, y: dragStart.y, width, height, color, strokeWidth, fill: 'transparent' };
      } else if (tool === 'triangle') {
        newObj = { type: 'triangle', x: centerX, y: dragStart.y, width: width * 2, height, color, strokeWidth, fill: 'transparent' };
      } else if (tool === 'text') {
        const text = prompt('Enter text:');
        if (text) {
          newObj = { type: 'text', text, x: dragStart.x, y: dragStart.y, color, fontSize: 24 };
        }
      }

      if (newObj) {
        const newObjects = [...objects, newObj];
        setObjects(newObjects);
        await updateFirestore(newObjects);
      }
      setDragStart(null);
    }
  };

  const updateFirestore = async (newObjects) => {
    if (!firestore || !classId) return;
    
    try {
      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        whiteboardObjects: newObjects,
        lastUpdated: serverTimestamp()
      });
    } catch (err) {
      console.error('Error updating whiteboard:', err);
    }
  };

  const clearWhiteboard = async () => {
    setObjects([]);
    setSelectedObj(null);
    await updateFirestore([]);
  };

  const deleteSelected = async () => {
    if (selectedObj !== null) {
      const newObjects = objects.filter((_, idx) => idx !== selectedObj);
      setObjects(newObjects);
      setSelectedObj(null);
      await updateFirestore(newObjects);
    }
  };

  const changeBgColor = async (newColor) => {
    setBgColor(newColor);
    if (firestore && classId) {
      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        whiteboardBgColor: newColor
      });
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const newObj = {
          type: 'image',
          x: 100,
          y: 100,
          width: Math.min(img.width, 300),
          height: Math.min(img.height, 300),
          imageData: event.target?.result
        };
        const newObjects = [...objects, newObj];
        setObjects(newObjects);
        await updateFirestore(newObjects);
      };
      img.src = event.target?.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Header */}
      <div className="bg-gray-800 text-white p-3 flex justify-between items-center border-b border-gray-700">
        <h3 className="font-bold flex items-center gap-2">
          <Pencil className="w-5 h-5 text-blue-400" />
          Whiteboard
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Toolbar */}
      {isTeacher && (
        <div className="bg-gray-800 p-2 flex flex-wrap gap-2 border-b border-gray-700">
          <Button
            size="sm"
            variant={tool === 'select' ? 'default' : 'outline'}
            onClick={() => setTool('select')}
          >
            <MousePointer2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === 'draw' ? 'default' : 'outline'}
            onClick={() => setTool('draw')}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === 'text' ? 'default' : 'outline'}
            onClick={() => setTool('text')}
          >
            <Type className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === 'circle' ? 'default' : 'outline'}
            onClick={() => setTool('circle')}
          >
            <Circle className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === 'rect' ? 'default' : 'outline'}
            onClick={() => setTool('rect')}
          >
            <RectangleHorizontal className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === 'triangle' ? 'default' : 'outline'}
            onClick={() => setTool('triangle')}
          >
            <Triangle className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === 'arrow' ? 'default' : 'outline'}
            onClick={() => setTool('arrow')}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon className="w-4 h-4" />
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          
          <div className="flex-1" />
          
          {selectedObj !== null && (
            <Button size="sm" variant="destructive" onClick={deleteSelected}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={clearWhiteboard}>
            Clear All
          </Button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Color & Options Panel */}
      {isTeacher && (
        <div className="bg-gray-800 p-3 border-t border-gray-700">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm">Color:</span>
              <div className="flex gap-1">
                {['#ffffff', '#ff4d4f', '#52c41a', '#13c2c2', '#722ed1', '#fa8c16', '#1890ff', '#000000'].map(
                  (c) => (
                    <button
                      key={c}
                      className={`w-6 h-6 rounded-full border-2 ${
                        color === c ? 'border-blue-400 scale-110' : 'border-gray-600'
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  )
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-white text-sm">Stroke:</span>
              {[1, 2, 3, 5, 8].map((w) => (
                <button
                  key={w}
                  className={`w-6 h-6 rounded flex items-center justify-center text-xs ${
                    strokeWidth === w ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                  onClick={() => setStrokeWidth(w)}
                >
                  {w}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-white text-sm">BG:</span>
              <div className="flex gap-1">
                {['#1e1f25', '#ffffff', '#000000', '#2d3748', '#1a365d'].map((c) => (
                  <button
                    key={c}
                    className={`w-6 h-6 rounded-full border-2 ${
                      bgColor === c ? 'border-blue-400 scale-110' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => changeBgColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Screen Recorder Component
function ScreenRecorder({ onRecordingComplete, isRecording, onStatusChange }) {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: true
      });

      let audioStream = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn('Microphone not available:', e);
      }

      const tracks = [...screenStream.getVideoTracks()];
      if (audioStream) {
        tracks.push(...audioStream.getAudioTracks());
      }

      const combinedStream = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2500000
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecordingComplete(blob);
        combinedStream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      onStatusChange(true);

      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopRecording();
      });

    } catch (error) {
      console.error('Recording error:', error);
      alert('Failed to start recording. Please grant screen sharing permissions.');
      onStatusChange(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      onStatusChange(false);
    }
  };

  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else if (mediaRecorderRef.current) {
      stopRecording();
    }

    return () => {
      if (mediaRecorderRef.current) {
        stopRecording();
      }
    };
  }, [isRecording]);

  return null;
}

// Main Component
export default function LiveClassPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  
  // Firebase initialization
  const [firestore] = useState(() => getFirestore());
  const [storage] = useState(() => getStorage());
  const [auth] = useState(() => getAuth());

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingState, setRecordingState] = useState('idle');
  const [error, setError] = useState('');

  const jitsiApiRef = useRef(null);
  const jitsiContainerRef = useRef(null);

  const isTeacher = user?.uid === classDetails?.teacherId;
  const jitsiRoom = useMemo(() => `Class_${classId}`.replace(/[^a-zA-Z0-9-_]/g, '_'), [classId]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, [auth]);

  // Profile listener
  useEffect(() => {
    if (!user || !firestore) return;
    const unsubscribe = onSnapshot(doc(firestore, 'users', user.uid), (doc) => {
      if (doc.exists()) setProfile(doc.data());
    });
    return () => unsubscribe();
  }, [user, firestore]);

  // Class details listener
  useEffect(() => {
    if (!firestore) return;
    const unsubscribe = onSnapshot(doc(firestore, 'classes', classId), (doc) => {
      if (doc.exists()) setClassDetails(doc.data());
    });
    return () => unsubscribe();
  }, [firestore, classId]);

  // Session listener
  useEffect(() => {
    if (!firestore) return;
    const unsubscribe = onSnapshot(doc(firestore, 'classes', classId, 'session', 'current'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSessionData(data);
        setShowWhiteboard(!!data.showWhiteboard);
      }
    });
    return () => unsubscribe();
  }, [firestore, classId]);

  // Initialize Jitsi
  const initJitsi = useCallback(async () => {
    if (!jitsiContainerRef.current || !sessionData?.isActive) return;

    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }

    try {
      const domain = '8x8.vc';
      const options = {
        roomName: `vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/${jitsiRoom}`,
        jwt: JWT_TOKEN,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        configOverwrite: {
          startWithVideoMuted: true,
          startWithAudioMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
        },
      };

      // Load Jitsi script
      if (!(window as any).JitsiMeetExternalAPI) {
        const script = document.createElement('script');
        script.src = 'https://8x8.vc/external_api.js';
        script.async = true;
        script.onload = () => {
          jitsiApiRef.current = new (window as any).JitsiMeetExternalAPI(domain, options);
          
          jitsiApiRef.current.on('videoConferenceJoined', () => {
            console.log('Joined video conference');
          });

          jitsiApiRef.current.on('participantLeft', () => {
            console.log('Participant left');
          });
        };
        document.body.appendChild(script);
      } else {
        jitsiApiRef.current = new (window as any).JitsiMeetExternalAPI(domain, options);
      }
    } catch (err) {
      console.error('Jitsi error:', err);
      setError('Failed to initialize video conference');
    }
  }, [sessionData?.isActive, jitsiRoom]);

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

  // Initialize Jitsi when session is active
  useEffect(() => {
    if (sessionData?.isActive && isInitialized) {
      initJitsi();
    }
    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [sessionData?.isActive, isInitialized, initJitsi]);

  // Handle join
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
          showWhiteboard: false,
          whiteboardObjects: [],
          whiteboardBgColor: '#1e1f25',
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
    } catch (err) {
      setError(err.message || 'Failed to join');
    }
  };

  // Handle end session
  const handleEndSession = async () => {
    if (!firestore || !window.confirm('End this session for all participants?')) return;
    
    try {
      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        isActive: false,
        endedAt: serverTimestamp(),
        showWhiteboard: false,
      });
      
      await updateDoc(doc(firestore, 'classes', classId), { isLive: false });
      
      const parts = await getDocs(collection(firestore, 'classes', classId, 'participants'));
      parts.forEach((d) => updateDoc(d.ref, { active: false }));
      
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
      
      router.push(`/dashboard/classes/${classId}`);
    } catch (err) {
      setError('Failed to end session');
    }
  };

  // Handle leave
  const handleLeaveSession = async () => {
    if (!user || !firestore || !profile) return;
    
    try {
      await updateDoc(doc(firestore, 'classes', classId, 'participants', user.uid), { 
        active: false 
      });
      
      await addDoc(collection(firestore, 'classes', classId, 'messages'), {
        text: `${profile.fullName} left the class`,
        senderId: 'system',
        senderName: 'System',
        timestamp: serverTimestamp(),
      });
      
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    } catch (err) {
      console.error(err);
    }
    
    router.push(`/dashboard/classes/${classId}`);
  };

  // Recording functions
  const handleRecordingComplete = async (blob) => {
    setRecordingState('processing');
    
    try {
      const storagePath = `recordings/${classId}/${Date.now()}.webm`;
      const storageReference = storageRef(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageReference, blob);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress);
        },
        (error) => {
          console.error('Upload error:', error);
          setError('Failed to upload recording');
          setRecordingState('idle');
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
            recordingUrl: downloadURL,
            recordingStoppedAt: serverTimestamp(),
          });
          
          setRecordingState('idle');
          alert('Recording saved successfully!');
        }
      );
    } catch (err) {
      console.error('Processing error:', err);
      setRecordingState('idle');
      setError('Failed to save recording');
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const toggleWhiteboard = async () => {
    if (!isTeacher || !firestore) return;
    
    const newState = !showWhiteboard;
    
    try {
      await updateDoc(doc(firestore, 'classes', classId, 'session', 'current'), {
        showWhiteboard: newState,
      });
      setShowWhiteboard(newState);
    } catch (err) {
      setError('Failed to toggle whiteboard');
    }
  };

  const isLoading = !user || !profile || !classDetails || (!isInitialized && !showJoinDialog);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-900">
        <Skeleton className="h-16 w-16 rounded-full mx-auto bg-gray-700" />
        <p className="text-gray-400 mt-4">Connecting to live class...</p>
      </div>
    );
  }

  return (
    <>
      {/* Screen Recorder */}
      <ScreenRecorder
        isRecording={isRecording}
        onRecordingComplete={handleRecordingComplete}
        onStatusChange={setIsRecording}
      />

      {/* Join Dialog */}
      {showJoinDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
              {isTeacher ? 'Start Live Class' : 'Join Class'}
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {isTeacher 
                ? 'Start the live session for your students' 
                : 'Join the live class session'}
            </p>
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

      <div className="flex flex-col h-screen bg-gray-900">
        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-lg text-white">{classDetails?.name}</span>
            {isRecording && (
              <div className="flex items-center gap-2 text-red-400 font-medium">
                <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
                <span>Recording</span>
                {recordingState === 'processing' && (
                  <span className="text-yellow-400">(Processing...)</span>
                )}
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
                  disabled={recordingState === 'processing'}
                  className="gap-2"
                >
                  {isRecording ? (
                    <>
                      <Square className="w-4 h-4" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Record
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={showWhiteboard ? 'default' : 'outline'}
                  onClick={toggleWhiteboard}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Whiteboard
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
          {/* Jitsi Container */}
          <div
            ref={jitsiContainerRef}
            className={`absolute inset-0 transition-all duration-300 ${
              showWhiteboard ? 'w-1/2' : 'w-full'
            }`}
          >
            {!sessionData?.isActive && (
              <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-300 text-xl">
                <div className="text-center">
                  <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Waiting for teacher to start the session...</p>
                </div>
              </div>
            )}
          </div>

          {/* Whiteboard Panel */}
          {showWhiteboard && (
            <div className="absolute right-0 top-0 h-full w-1/2 border-l border-gray-700 shadow-2xl">
              <AdvancedWhiteboard
                isTeacher={isTeacher}
                onClose={() => toggleWhiteboard()}
                classId={classId}
                firestore={firestore}
              />
            </div>
          )}
        </div>

        {/* Recording Processing Indicator */}
        {recordingState === 'processing' && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-blue-900/90 text-blue-200 px-4 py-2 rounded-full shadow-lg border border-blue-800 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
            <span>Processing recording... Please keep this tab open</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="fixed bottom-4 right-4 z-50 max-w-xs">
            <Alert variant="destructive" className="animate-in fade-in slide-in-from-bottom-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </>
  );
}
