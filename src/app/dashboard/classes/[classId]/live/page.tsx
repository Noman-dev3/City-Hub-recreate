import React, { useEffect, useRef, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBPU3a9uRkMkC4V760cqmBaeshR3Vo9nG0",
  authDomain: "nomans-nexus.firebaseapp.com",
  projectId: "nomans-nexus",
  storageBucket: "nomans-nexus.appspot.com",
  messagingSenderId: "676808495030",
  appId: "1:676808495030:web:2c81c5f154cc228fe6bb17"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: any;
}

const LiveClassPage: React.FC = () => {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<any>(null);
  const [isHost, setIsHost] = useState(false);
  const [roomName] = useState('live-class-room');
  const [userName] = useState('User-' + Math.floor(Math.random() * 10000));
  const [isRecording, setIsRecording] = useState(false);
  const sessionDocRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const JAAS_APP_ID = 'vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d';
  const JWT_TOKEN = 'eyJraWQiOiJ2cGFhcy1tYWdpYy1jb29raWUtN2JiMGIxZWU4ZGY1NGZhY2IzOTIzODJjMDAwNzEwMmQvNTgxNzZiLVNBTVBMRV9BUFAiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJqaXRzaSIsImlzcyI6ImNoYXQiLCJpYXQiOjE3NjM3MDAyNDgsImV4cCI6MTc2MzcwNzQ0OCwibmJmIjoxNzYzNzAwMjQzLCJzdWIiOiJ2cGFhcy1tYWdpYy1jb29raWUtN2JiMGIxZWU4ZGY1NGZhY2IzOTIzODJjMDAwNzEwMmQiLCJjb250ZXh0Ijp7ImZlYXR1cmVzIjp7ImxpdmVzdHJlYW1pbmciOnRydWUsImZpbGUtdXBsb2FkIjp0cnVlLCJvdXRib3VuZC1jYWxsIjp0cnVlLCJzaXAtb3V0Ym91bmQtY2FsbCI6ZmFsc2UsInRyYW5zY3JpcHRpb24iOnRydWUsImxpc3QtdmlzaXRvcnMiOmZhbHNlLCJyZWNvcmRpbmciOnRydWUsImZsaXAiOmZhbHNlfSwidXNlciI6eyJoaWRkZW4tZnJvbS1yZWNvcmRlciI6ZmFsc2UsIm1vZGVyYXRvciI6dHJ1ZSwibmFtZSI6Im5vbWFuLmRldjMiLCJpZCI6Imdvb2dsZS1vYXV0aDJ8MTA3ODE4MTg3NDI2MjYxNTM0OTU2IiwiYXZhdGFyIjoiIiwiZW1haWwiOiJub21hbi5kZXYzQGdtYWlsLmNvbSJ9fSwicm9vbSI6IioifQ.dc2HinGO3SytwsIwkC89-duPLAd19Bc0hjfclcXRZVI4E4FEiuvi_D4nnt1qd7wQquXDAYnfwQHc3BBVe5ERZp6SJBFBXCSt4tjuBqldvtP2RxAnHVwkveCoL5O38NJIjAVpRVR55MInJvsqK4uLS2c8PdHYQB9cbUaA1bF0zOahFz3IzC4aXTcI0vuJfBKpSYhzawDDHiTfwefwwfc-x42bUbQIIYZJ0CvxJCSv1E_Zju2zav5udUoTZlNIROBOiVOzfZZQjXaQEoKhdDNqwig7n949HDgEyu1gRCvN5wAmCrU32APPuSwthc0l3SbT3bKNyIyqTf_LNcF52RKUkw';

  // Check if user is host based on JWT
  useEffect(() => {
    try {
      const payload = JSON.parse(atob(JWT_TOKEN.split('.')[1]));
      const isModerator = payload.context?.user?.moderator || false;
      setIsHost(isModerator);
    } catch (error) {
      console.error('Error parsing JWT:', error);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    // Add participant to Firestore
    const addParticipant = async () => {
      try {
        const docRef = await addDoc(collection(db, 'sessions'), {
          name: userName,
          roomName: roomName,
          isHost: isHost,
          joinedAt: serverTimestamp(),
        });
        sessionDocRef.current = docRef;
      } catch (error) {
        console.error('Error adding participant:', error);
      }
    };

    addParticipant();

    // Load JaaS script
    const script = document.createElement('script');
    script.src = `https://8x8.vc/${JAAS_APP_ID}/external_api.js`;
    script.async = true;
    script.onload = () => initializeJitsi();
    document.body.appendChild(script);

    return () => {
      if (api) {
        api.dispose();
      }
    };
  }, []);

  const initializeJitsi = () => {
    if (!jitsiContainerRef.current || !window.JitsiMeetExternalAPI) return;

    const domain = '8x8.vc';
    const options = {
      roomName: `${JAAS_APP_ID}/${roomName}`,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      jwt: JWT_TOKEN,
      lang: 'en',
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: true,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
      },
      userInfo: {
        displayName: userName,
        email: 'noman.dev3@gmail.com'
      }
    };

    const jitsiApi = new window.JitsiMeetExternalAPI(domain, options);

    // Listen for recording events
    jitsiApi.addListener('recordingStatusChanged', ({ on, mode }: { on: boolean, mode: string }) => {
      if (mode === 'stream' || mode === 'file') {
        setIsRecording(on);
        
        // Update Firestore
        if (sessionDocRef.current) {
          updateDoc(sessionDocRef.current, {
            recording: on,
            recordingTime: serverTimestamp()
          });
        }
      }
    });

    jitsiApi.addListener('readyToClose', async () => {
      if (sessionDocRef.current) {
        await updateDoc(sessionDocRef.current, { 
          leftAt: serverTimestamp(),
          active: false 
        });
      }
    });

    setApi(jitsiApi);
  };

  return (
    <div className="relative w-full h-screen bg-gray-900">
      <div ref={jitsiContainerRef} className="w-full h-full" />
    </div>
  );
};

export default LiveClassPage;
