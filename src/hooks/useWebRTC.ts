import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, doc, addDoc, onSnapshot, updateDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';

type PeerConnection = {
  id: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
};

type SignalData = {
  id: string;
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
  timestamp: any;
};

export const useWebRTC = (
  firestore: any,
  roomId: string,
  userId: string,
  userName: string,
  isHost: boolean
) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<Map<string, any>>(new Map());
  
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Initialize local media stream
  const initializeMedia = useCallback(async (isObserver: boolean = false) => {
    let stream: MediaStream;

    if (isObserver) {
      stream = new MediaStream();
      setIsAudioEnabled(false);
      setIsVideoEnabled(false);
    } else {
      let videoStream: MediaStream | undefined;
      let audioStream: MediaStream | undefined;

      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
      } catch (error) {
        console.error('Video access denied:', error);
      }

      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        console.error('Audio access denied:', error);
      }

      stream = new MediaStream();
      if (videoStream) {
        videoStream.getTracks().forEach(track => stream.addTrack(track));
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => stream.addTrack(track));
      }

      setIsAudioEnabled(stream.getAudioTracks().length > 0);
      setIsVideoEnabled(stream.getVideoTracks().length > 0);
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    // Add user to participants
    if (firestore) {
      await addDoc(collection(firestore, 'rooms', roomId, 'participants'), {
        userId,
        userName,
        isHost,
        joinedAt: new Date(),
        audioEnabled: stream.getAudioTracks().length > 0,
        videoEnabled: stream.getVideoTracks().length > 0,
        handRaised: false,
      });
    }

    return stream;
  }, [firestore, roomId, userId, userName, isHost]);

  // Create peer connection
  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(configuration);
    
    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.set(peerId, stream);
        return newMap;
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate && firestore) {
        await addDoc(collection(firestore, 'rooms', roomId, 'signals'), {
          from: userId,
          to: peerId,
          type: 'ice-candidate',
          data: event.candidate.toJSON(),
          timestamp: new Date(),
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        handlePeerDisconnection(peerId);
      }
    };

    peersRef.current.set(peerId, { id: peerId, connection: pc });
    return pc;
  }, [firestore, roomId, userId]);

  // Handle peer disconnection
  const handlePeerDisconnection = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(peerId);
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(peerId);
        return newMap;
      });
    }
  }, []);

  // Create and send offer
  const createOffer = useCallback(async (peerId: string) => {
    const pc = peersRef.current.get(peerId)?.connection || createPeerConnection(peerId);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (firestore) {
        await addDoc(collection(firestore, 'rooms', roomId, 'signals'), {
          from: userId,
          to: peerId,
          type: 'offer',
          data: offer,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }, [firestore, roomId, userId, createPeerConnection]);

  // Handle received offer
  const handleOffer = useCallback(async (signal: SignalData) => {
    const pc = peersRef.current.get(signal.from)?.connection || createPeerConnection(signal.from);
    
    try {
      if (pc.signalingState !== 'stable') {
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }),
          pc.setRemoteDescription(new RTCSessionDescription(signal.data))
        ]);
      } else {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      if (firestore) {
        await addDoc(collection(firestore, 'rooms', roomId, 'signals'), {
          from: userId,
          to: signal.from,
          type: 'answer',
          data: answer,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }, [firestore, roomId, userId, createPeerConnection]);

  // Handle received answer
  const handleAnswer = useCallback(async (signal: SignalData) => {
    const peer = peersRef.current.get(signal.from);
    if (peer) {
      try {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.data));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }, []);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (signal: SignalData) => {
    const peer = peersRef.current.get(signal.from);
    if (peer) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(signal.data));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length > 0) {
      const enabled = !audioTracks[0].enabled;
      audioTracks.forEach(track => { track.enabled = enabled; });
      setIsAudioEnabled(enabled);

      // Update participant status
      if (firestore) {
        const participantsRef = collection(firestore, 'rooms', roomId, 'participants');
        const q = query(participantsRef, where('userId', '==', userId));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
          updateDoc(doc.ref, { audioEnabled: enabled });
        });
      }
    } else {
      // Try to add audio if not present
      try {
        const newAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        newAudioStream.getTracks().forEach(track => {
          localStreamRef.current!.addTrack(track);
          // Add to all peers
          peersRef.current.forEach(({ connection }) => {
            connection.addTrack(track, localStreamRef.current!);
          });
        });
        setIsAudioEnabled(true);
        // Update participant status
        if (firestore) {
          const participantsRef = collection(firestore, 'rooms', roomId, 'participants');
          const q = query(participantsRef, where('userId', '==', userId));
          const snapshot = await getDocs(q);
          snapshot.forEach(doc => {
            updateDoc(doc.ref, { audioEnabled: true });
          });
        }
      } catch (error) {
        console.error('Failed to add audio:', error);
        throw error;
      }
    }
  }, [firestore, roomId, userId]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return;

    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length > 0) {
      const enabled = !videoTracks[0].enabled;
      videoTracks.forEach(track => { track.enabled = enabled; });
      setIsVideoEnabled(enabled);

      // Update participant status
      if (firestore) {
        const participantsRef = collection(firestore, 'rooms', roomId, 'participants');
        const q = query(participantsRef, where('userId', '==', userId));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
          updateDoc(doc.ref, { videoEnabled: enabled });
        });
      }
    } else {
      // Try to add video if not present
      try {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        newVideoStream.getTracks().forEach(track => {
          localStreamRef.current!.addTrack(track);
          // Add to all peers
          peersRef.current.forEach(({ connection }) => {
            connection.addTrack(track, localStreamRef.current!);
          });
        });
        setIsVideoEnabled(true);
        // Update participant status
        if (firestore) {
          const participantsRef = collection(firestore, 'rooms', roomId, 'participants');
          const q = query(participantsRef, where('userId', '==', userId));
          const snapshot = await getDocs(q);
          snapshot.forEach(doc => {
            updateDoc(doc.ref, { videoEnabled: true });
          });
        }
      } catch (error) {
        console.error('Failed to add video:', error);
        throw error;
      }
    }
  }, [firestore, roomId, userId]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        });
        
        screenStreamRef.current = screenStream;
        
        // Replace video track in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        peersRef.current.forEach(({ connection }) => {
          const sender = connection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });
        
        // Handle screen share end
        videoTrack.onended = () => {
          toggleScreenShare();
        };
        
        setIsScreenSharing(true);
      } else {
        // Stop screen sharing and restore camera
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }
        
        // Restore original video track
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          peersRef.current.forEach(({ connection }) => {
            const sender = connection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          });
        }
        
        setIsScreenSharing(false);
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  }, [isScreenSharing]);

  // Listen for signals
  useEffect(() => {
    if (!firestore) return;

    const signalsRef = collection(firestore, 'rooms', roomId, 'signals');
    const q = query(signalsRef, where('to', '==', userId));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const signal = { id: change.doc.id, ...change.doc.data() } as SignalData;
          
          switch (signal.type) {
            case 'offer':
              await handleOffer(signal);
              break;
            case 'answer':
              await handleAnswer(signal);
              break;
            case 'ice-candidate':
              await handleIceCandidate(signal);
              break;
          }
          
          // Delete processed signal
          await deleteDoc(change.doc.ref);
        }
      });
    });

    return () => unsubscribe();
  }, [firestore, roomId, userId, handleOffer, handleAnswer, handleIceCandidate]);

  // Listen for participants
  useEffect(() => {
    if (!firestore) return;

    const participantsRef = collection(firestore, 'rooms', roomId, 'participants');
    
    const unsubscribe = onSnapshot(participantsRef, (snapshot) => {
      const newParticipants = new Map();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        newParticipants.set(data.userId, { id: doc.id, ...data });
        
        // Create offer for new participants (if we're already in the room)
        if (data.userId !== userId && localStreamRef.current && !peersRef.current.has(data.userId)) {
          if (userId > data.userId) {
            createOffer(data.userId);
          }
        }
      });
      
      setParticipants(newParticipants);
      
      // Clean up disconnected peers
      peersRef.current.forEach((peer, peerId) => {
        if (!newParticipants.has(peerId)) {
          handlePeerDisconnection(peerId);
        }
      });
    });

    return () => unsubscribe();
  }, [firestore, roomId, userId, createOffer, handlePeerDisconnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop all tracks
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      screenStreamRef.current?.getTracks().forEach(track => track.stop());
      
      // Close all peer connections
      peersRef.current.forEach(({ connection }) => connection.close());
      
      // Remove participant from room
      if (firestore) {
        const participantsRef = collection(firestore, 'rooms', roomId, 'participants');
        getDocs(query(participantsRef, where('userId', '==', userId))).then(snapshot => {
          snapshot.forEach(doc => deleteDoc(doc.ref));
        });
      }
    };
  }, [firestore, roomId, userId]);

  return {
    localStream,
    remoteStreams,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    initializeMedia,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  };
};