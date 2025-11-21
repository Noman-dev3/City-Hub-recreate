import React, { useEffect, useRef, useState } from 'react';
import { Video, Mic, MicOff, VideoOff, PhoneOff, Users, Shield, Circle, Monitor, MonitorOff } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [roomName, setRoomName] = useState('live-class-room');
  const [userName, setUserName] = useState('');
  const [joined, setJoined] = useState(false);
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

  // Listen to participants from Firestore
  useEffect(() => {
    if (!joined) return;

    const q = query(
      collection(db, 'sessions'),
      where('roomName', '==', roomName)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const participantsList: Participant[] = [];
      snapshot.forEach((doc) => {
        participantsList.push({ id: doc.id, ...doc.data() } as Participant);
      });
      setParticipants(participantsList);
    });

    return () => unsubscribe();
  }, [joined, roomName]);

  const joinMeeting = async () => {
    if (!userName.trim()) {
      alert('Please enter your name');
      return;
    }

    setIsLoading(true);

    // Add participant to Firestore
    try {
      const docRef = await addDoc(collection(db, 'sessions'), {
        name: userName,
        roomName: roomName,
        isHost: isHost,
        joinedAt: serverTimestamp(),
        isMuted: false,
        isVideoOff: false
      });
      sessionDocRef.current = docRef;
    } catch (error) {
      console.error('Error adding participant:', error);
    }

    // Load Jitsi script
    const script = document.createElement('script');
    script.src = 'https://8x8.vc/vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/external_api.js';
    script.async = true;
    script.onload = () => initializeJitsi();
    document.body.appendChild(script);
    
    setJoined(true);
  };

  const initializeJitsi = () => {
    if (!jitsiContainerRef.current || !window.JitsiMeetExternalAPI) return;

    const domain = '8x8.vc';
    const options = {
      roomName: `${JAAS_APP_ID}/${roomName}`,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      jwt: JWT_TOKEN,
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        toolbarButtons: [
          'microphone',
          'camera',
          'closedcaptions',
          'desktop',
          'fullscreen',
          'hangup',
          'chat',
          'recording',
          'livestreaming',
          'settings',
          'raisehand',
          'videoquality',
          'filmstrip',
          'stats',
          'shortcuts',
          'tileview',
          'help'
        ]
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        BRAND_WATERMARK_LINK: '',
        TOOLBAR_ALWAYS_VISIBLE: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
        DISABLE_VIDEO_BACKGROUND: false,
        FILM_STRIP_MAX_HEIGHT: 120
      },
      userInfo: {
        displayName: userName
      }
    };

    const jitsiApi = new window.JitsiMeetExternalAPI(domain, options);

    jitsiApi.addListener('videoConferenceJoined', () => {
      setIsLoading(false);
    });

    jitsiApi.addListener('audioMuteStatusChanged', ({ muted }: { muted: boolean }) => {
      setIsMuted(muted);
      updateParticipantStatus({ isMuted: muted });
    });

    jitsiApi.addListener('videoMuteStatusChanged', ({ muted }: { muted: boolean }) => {
      setIsVideoOff(muted);
      updateParticipantStatus({ isVideoOff: muted });
    });

    jitsiApi.addListener('readyToClose', () => {
      handleLeave();
    });

    setApi(jitsiApi);
  };

  const updateParticipantStatus = async (updates: any) => {
    if (sessionDocRef.current) {
      try {
        await updateDoc(sessionDocRef.current, updates);
      } catch (error) {
        console.error('Error updating participant:', error);
      }
    }
  };

  const toggleRecording = async () => {
    if (!isHost) {
      alert('Only the host can control recording');
      return;
    }

    if (isRecording) {
      // Stop recording
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      setIsRecording(false);
      
      // Update Firestore
      try {
        const q = query(collection(db, 'sessions'), where('roomName', '==', roomName));
        const snapshot = await getDocs(q);
        snapshot.forEach(async (document) => {
          await updateDoc(doc(db, 'sessions', document.id), {
            recording: false,
            recordingStoppedAt: serverTimestamp()
          });
        });
      } catch (error) {
        console.error('Error updating recording status:', error);
      }
    } else {
      try {
        // Request screen capture with audio
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        // Handle stream end
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (isRecording) {
              toggleRecording();
            }
          };
        });

        // Determine supported MIME type
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

        // Create MediaRecorder
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
          a.download = `class_${roomName}_recording_${Date.now()}.${fileExtension}`;
          a.click();
          URL.revokeObjectURL(url);
          recordingChunksRef.current = [];
          recorderRef.current = null;
          
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };

        recorderRef.current.onerror = (e) => {
          console.error('Recording error:', e);
          alert('An error occurred during recording');
        };

        // Start recording with 1-second chunks
        recorderRef.current.start(1000);
        setIsRecording(true);

        // Update Firestore
        try {
          const q = query(collection(db, 'sessions'), where('roomName', '==', roomName));
          const snapshot = await getDocs(q);
          snapshot.forEach(async (document) => {
            await updateDoc(doc(db, 'sessions', document.id), {
              recording: true,
              recordingStartedAt: serverTimestamp()
            });
          });
        } catch (error) {
          console.error('Error updating recording status:', error);
        }

        alert(`Recording started in ${fileExtension.toUpperCase()} format! Share the browser window/tab with audio for best results.`);
      } catch (err) {
        console.error('Failed to start recording:', err);
        alert('Failed to start recording. Please allow screen and audio sharing.');
      }
    }
  };

  const handleLeave = async () => {
    // Stop recording if active
    if (isRecording && isHost) {
      await toggleRecording();
    }

    if (api) {
      api.dispose();
    }
    
    if (sessionDocRef.current) {
      await updateDoc(sessionDocRef.current, { 
        leftAt: serverTimestamp(),
        active: false 
      });
    }
    
    window.location.reload();
  };

  const toggleMute = () => {
    if (api) {
      api.executeCommand('toggleAudio');
    }
  };

  const toggleVideo = () => {
    if (api) {
      api.executeCommand('toggleVideo');
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-md border border-white/20">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Video className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Join Live Class</h1>
            <p className="text-purple-200">Enter your details to join the session</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Room Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name"
                className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>

            {isHost && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/20 border border-yellow-400/30 rounded-xl">
                <Shield className="w-5 h-5 text-yellow-300" />
                <span className="text-sm text-yellow-100 font-medium">
                  You're joining as Host (Moderator)
                </span>
              </div>
            )}

            <button
              onClick={joinMeeting}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Join Meeting
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gray-900">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg">Connecting to live class...</p>
          </div>
        </div>
      )}

      <div ref={jitsiContainerRef} className="w-full h-full" />

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600/90 backdrop-blur-lg rounded-full px-4 py-2 shadow-xl border border-red-500">
          <Circle className="w-4 h-4 fill-white text-white animate-pulse" />
          <span className="text-white font-semibold text-sm">Recording</span>
        </div>
      )}

      {/* Participants Panel */}
      <div className="absolute top-4 right-4 bg-gray-800/90 backdrop-blur-lg rounded-2xl p-4 shadow-xl border border-gray-700 max-w-xs">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-purple-400" />
          <h3 className="text-white font-semibold">Participants ({participants.length})</h3>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between p-2 bg-gray-700/50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {participant.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-white text-sm">{participant.name}</span>
              </div>
              {participant.isHost && (
                <Shield className="w-4 h-4 text-yellow-400" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-800/90 backdrop-blur-lg rounded-full px-6 py-4 shadow-2xl border border-gray-700">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full transition-all duration-200 ${
              isMuted
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all duration-200 ${
              isVideoOff
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isVideoOff ? 'Start Video' : 'Stop Video'}
          >
            {isVideoOff ? (
              <VideoOff className="w-6 h-6 text-white" />
            ) : (
              <Video className="w-6 h-6 text-white" />
            )}
          </button>

          {isHost && (
            <button
              onClick={toggleRecording}
              className={`p-4 rounded-full transition-all duration-200 ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              title={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              {isRecording ? (
                <MonitorOff className="w-6 h-6 text-white" />
              ) : (
                <Monitor className="w-6 h-6 text-white" />
              )}
            </button>
          )}

          <button
            onClick={handleLeave}
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-all duration-200"
            title="Leave Meeting"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveClassPage;
