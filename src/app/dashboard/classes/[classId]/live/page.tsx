import React, { useState, useEffect, useRef } from 'react';
import { Video, MessageSquare, Users, Send, AlertCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from "@/firebase/config"
// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
let app, db;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// JWT Token Generator for Jaas
const generateJaaSToken = (roomName, userName, userEmail) => {
  const APP_ID = 'vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d';
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const payload = {
    aud: 'jitsi',
    iss: APP_ID,
    sub: '8x8.vc',
    room: roomName,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 2), // 2 hours
    context: {
      user: {
        name: userName,
        email: userEmail,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}`
      }
    }
  };
  
  // For demo purposes - in production, generate JWT on your backend
  const base64Header = btoa(JSON.stringify(header));
  const base64Payload = btoa(JSON.stringify(payload));
  
  return `${base64Header}.${base64Payload}.demo-signature`;
};

const LiveClassPage = () => {
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [participantCount, setParticipantCount] = useState(0);
  const [firebaseError, setFirebaseError] = useState(false);
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const unsubscribeRef = useRef(null);

  const initializeJitsi = () => {
    const normalizedRoomName = roomName.toLowerCase().replace(/\s+/g, '-');
    const jwt = generateJaaSToken(normalizedRoomName, userName, userEmail);
    
    const domain = '8x8.vc';
    const options = {
      roomName: `vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/${normalizedRoomName}`,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      jwt: jwt,
      configOverwrite: {
        startWithAudioMuted: true,
        startWithVideoMuted: false,
        enableWelcomePage: false,
        prejoinPageEnabled: false
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'hangup', 'chat', 'raisehand', 'participants-pane'
        ],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false
      },
      userInfo: {
        displayName: userName,
        email: userEmail
      }
    };

    const api = new window.JitsiMeetExternalAPI(domain, options);
    jitsiApiRef.current = api;

    api.addEventListener('participantJoined', () => {
      setParticipantCount(prev => prev + 1);
    });

    api.addEventListener('participantLeft', () => {
      setParticipantCount(prev => Math.max(0, prev - 1));
    });

    api.addEventListener('videoConferenceJoined', () => {
      setParticipantCount(1);
    });

    api.addEventListener('readyToClose', () => {
      setIsJoined(false);
      api.dispose();
    });
  };

  const handleJoinClass = (e) => {
    e.preventDefault();
    if (roomName.trim() && userName.trim()) {
      setIsJoined(true);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (newComment.trim()) {
      try {
        if (db) {
          // Add to Firestore
          await addDoc(collection(db, 'comments', roomName.toLowerCase(), 'messages'), {
            user: userName,
            text: newComment,
            timestamp: serverTimestamp(),
            roomName: roomName.toLowerCase()
          });
          setNewComment('');
        } else {
          // Fallback to local state if Firebase not configured
          const comment = {
            id: Date.now(),
            user: userName,
            text: newComment,
            timestamp: new Date().toLocaleTimeString()
          };
          setComments([...comments, comment]);
          setNewComment('');
        }
      } catch (error) {
        console.error("Error adding comment:", error);
        setFirebaseError(true);
      }
    }
  };

  useEffect(() => {
    if (isJoined) {
      const script = document.createElement('script');
      script.src = 'https://8x8.vc/vpaas-magic-cookie-7bb0b1ee8df54facb392382c0007102d/external_api.js';
      script.async = true;
      script.onload = () => initializeJitsi();
      document.body.appendChild(script);

      // Subscribe to Firestore comments
      if (db) {
        try {
          const q = query(
            collection(db, 'comments', roomName.toLowerCase(), 'messages'),
            orderBy('timestamp', 'asc')
          );
          
          unsubscribeRef.current = onSnapshot(q, (snapshot) => {
            const fetchedComments = snapshot.docs.map(doc => ({
              id: doc.id,
              user: doc.data().user,
              text: doc.data().text,
              timestamp: doc.data().timestamp?.toDate().toLocaleTimeString() || 'Just now'
            }));
            setComments(fetchedComments);
          });
        } catch (error) {
          console.error("Error subscribing to comments:", error);
          setFirebaseError(true);
        }
      }

      return () => {
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
        }
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
        document.body.removeChild(script);
      };
    }
  }, [isJoined]);

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Video className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Join Live Class</h1>
            <p className="text-gray-600">Enter your details to join the session</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g., math-101"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
              />
              <p className="text-xs text-gray-500 mt-1">Room name will be converted to lowercase</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
              />
            </div>

            <button
              onClick={handleJoinClass}
              disabled={!roomName.trim() || !userName.trim()}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition duration-200 shadow-lg hover:shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Join Class
            </button>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800 mb-2">
              <strong>Setup Instructions:</strong>
            </p>
            <ol className="text-xs text-yellow-800 space-y-1 list-decimal list-inside">
              <li>Replace Firebase config values in the code with your project credentials</li>
              <li>Enable Firestore in your Firebase console</li>
              <li>Set up Firestore rules to allow read/write access</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex flex-col lg:flex-row h-screen">
        {/* Video Container */}
        <div className="flex-1 bg-black relative">
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-gray-800">{participantCount} Participants</span>
            </div>
          </div>
          <div ref={jitsiContainerRef} className="w-full h-full" />
        </div>

        {/* Comments Section */}
        <div className="lg:w-96 bg-white flex flex-col h-64 lg:h-full">
          <div className="bg-indigo-600 text-white p-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <h2 className="font-semibold text-lg">Class Comments</h2>
            {firebaseError && (
              <div className="ml-auto" title="Firebase connection error - using local storage">
                <AlertCircle className="w-5 h-5 text-yellow-300" />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 ? (
              <div className="text-center text-gray-400 mt-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No comments yet. Start the conversation!</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-indigo-600">{comment.user}</span>
                    <span className="text-xs text-gray-500">{comment.timestamp}</span>
                  </div>
                  <p className="text-gray-700 text-sm">{comment.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t bg-gray-50">
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newComment.trim()) {
                    handleAddComment(e);
                  }
                }}
                placeholder="Type a comment..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveClassPage;
