'use client';

import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, addDoc, setDoc, deleteDoc, onSnapshot, query, where, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useUser } from '@/firebase/auth/use-user';
import { Camera, Mic, MicOff, VideoOff, ScreenShare, Hand, Users, MessageSquare, Settings, PhoneOff } from 'lucide-react';
// Import other UI components as needed from '@/components/ui/*'

interface Participant {
  id: string;
  name: string;
  role: 'host' | 'participant';
  video: boolean;
  audio: boolean;
  handRaised?: boolean;
}

const LivePage = ({ params }: { params: { classId: string } }) => {
  const roomId = params.classId;
  const { user } = useUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [role, setRole] = useState<'host' | 'participant' | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker'>('gallery');
  const [ended, setEnded] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const prevParticipantsRef = useRef<Participant[]>([]);

  useEffect(() => {
    if (user) {
      setUserId(user.uid);
      setUserName(user.displayName || 'Anonymous');
    }
  }, [user]);

  // Determine role and join room
  useEffect(() => {
    if (!userId) return;

    const determineRoleAndJoin = async () => {
      const classRef = doc(db, `classes/${roomId}`);
      const classSnap = await getDoc(classRef);
      if (!classSnap.exists()) {
        console.error('Class not found');
        return;
      }
      const classData = classSnap.data();
      const userRole = classData.teacherId === userId ? 'host' : 'participant';
      setRole(userRole);

      // Join room
      const participantRef = doc(db, `rooms/${roomId}/participants/${userId}`);
      await setDoc(participantRef, {
        name: userName,
        role: userRole,
        audio: isAudioEnabled,
        video: isVideoEnabled,
        handRaised: isHandRaised,
      });

      // Get existing participants and create connections
      const participantsSnapshot = await getDocs(collection(db, `rooms/${roomId}/participants`));
      const existing: Participant[] = [];
      participantsSnapshot.forEach((d) => {
        if (d.id !== userId) {
          existing.push({ id: d.id, ...d.data() as Omit<Participant, 'id'> });
        }
      });
      existing.forEach((u) => createPeerConnection(u.id, true));

      prevParticipantsRef.current = existing;
    };

    determineRoleAndJoin();
  }, [userId, roomId, userName, isAudioEnabled, isVideoEnabled, isHandRaised]);

  // Initialize local stream
  useEffect(() => {
    const initStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    };
    initStream();

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Watch participants
  useEffect(() => {
    if (!role) return;

    const participantsCol = collection(db, `rooms/${roomId}/participants`);
    const unsubscribeParticipants = onSnapshot(participantsCol, (snap) => {
      const parts: Participant[] = [];
      snap.forEach((d) => {
        if (d.id !== userId) {
          parts.push({ id: d.id, ...d.data() as Omit<Participant, 'id'> });
        }
      });
      setParticipants(parts);
    });

    // Watch signals
    const signalsQ = query(collection(db, `rooms/${roomId}/signals`), where('to', '==', userId));
    const unsubscribeSignals = onSnapshot(signalsQ, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const from = data.from;
          if (data.type === 'offer') {
            const peer = createPeerConnection(from, false);
            await peer.setRemoteDescription(new RTCSessionDescription(data.signal));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await addDoc(collection(db, `rooms/${roomId}/signals`), {
              type: 'answer',
              from: userId,
              to: from,
              signal: { type: answer.type, sdp: answer.sdp },
            });
          } else if (data.type === 'answer') {
            const peer = peersRef.current.get(from);
            if (peer) {
              await peer.setRemoteDescription(new RTCSessionDescription(data.signal));
            }
          }
        }
      });
    });

    // Watch candidates
    const candidatesQ = query(collection(db, `rooms/${roomId}/candidates`), where('to', '==', userId));
    const unsubscribeCandidates = onSnapshot(candidatesQ, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const from = data.from;
          const peer = peersRef.current.get(from);
          if (peer && data.candidate) {
            peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }
      });
    });

    // Watch room for end
    const roomRef = doc(db, `rooms/${roomId}`);
    const unsubscribeRoom = onSnapshot(roomRef, (snap) => {
      if (snap.exists() && snap.data()?.ended) {
        setEnded(true);
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        peersRef.current.forEach((p) => p.close());
        peersRef.current.clear();
        // Optionally redirect
      }
    });

    return () => {
      if (userId) {
        const participantRef = doc(db, `rooms/${roomId}/participants/${userId}`);
        deleteDoc(participantRef);
      }
      unsubscribeParticipants();
      unsubscribeSignals();
      unsubscribeCandidates();
      unsubscribeRoom();
      peersRef.current.forEach((p) => p.close());
      peersRef.current.clear();
    };
  }, [role, roomId, userId]);

  // Handle participant changes
  useEffect(() => {
    const currentIds = participants.map((p) => p.id);
    const prevIds = prevParticipantsRef.current.map((p) => p.id);
    const newUsers = participants.filter((p) => !prevIds.includes(p.id));
    const leftUsers = prevParticipantsRef.current.filter((p) => !currentIds.includes(p.id));

    leftUsers.forEach((u) => {
      const peer = peersRef.current.get(u.id);
      if (peer) {
        peer.close();
        peersRef.current.delete(u.id);
      }
    });

    newUsers.forEach((u) => {
      createPeerConnection(u.id, false);
    });

    prevParticipantsRef.current = participants;
  }, [participants]);

  const createPeerConnection = (targetId: string, createOffer: boolean): RTCPeerConnection => {
    if (peersRef.current.has(targetId)) return peersRef.current.get(targetId)!;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current!);
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, `rooms/${roomId}/candidates`), {
          from: userId,
          to: targetId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peer.ontrack = (event) => {
      const remoteVideo = document.getElementById(`video-${targetId}`) as HTMLVideoElement;
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    peersRef.current.set(targetId, peer);

    if (createOffer) {
      peer.createOffer().then((offer) => {
        peer.setLocalDescription(offer);
        addDoc(collection(db, `rooms/${roomId}/signals`), {
          type: 'offer',
          from: userId,
          to: targetId,
          signal: { type: offer.type, sdp: offer.sdp },
        });
      });
    }

    return peer;
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const enabled = !isVideoEnabled;
    localStreamRef.current.getVideoTracks()[0].enabled = enabled;
    setIsVideoEnabled(enabled);
    if (userId) {
      await setDoc(doc(db, `rooms/${roomId}/participants/${userId}`), { video: enabled }, { merge: true });
    }
  };

  const toggleAudio = async () => {
    if (!localStreamRef.current) return;
    const enabled = !isAudioEnabled;
    localStreamRef.current.getAudioTracks()[0].enabled = enabled;
    setIsAudioEnabled(enabled);
    if (userId) {
      await setDoc(doc(db, `rooms/${roomId}/participants/${userId}`), { audio: enabled }, { merge: true });
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' as const },
          audio: true,
        });
        const videoTrack = screenStream.getVideoTracks()[0];
        peersRef.current.forEach((peer) => {
          const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        setIsScreenSharing(true);
        videoTrack.onended = () => toggleScreenShare();
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = cameraStream.getVideoTracks()[0];
      peersRef.current.forEach((peer) => {
        const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      });
      localStreamRef.current?.addTrack(videoTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setIsScreenSharing(false);
    }
  };

  const toggleHandRaise = async () => {
    const raised = !isHandRaised;
    setIsHandRaised(raised);
    if (userId) {
      await setDoc(doc(db, `rooms/${roomId}/participants/${userId}`), { handRaised: raised }, { merge: true });
    }
  };

  const endCall = async () => {
    if (role === 'host') {
      await setDoc(doc(db, `rooms/${roomId}`), { ended: true }, { merge: true });
    }
  };

  if (ended) {
    return <div className="h-screen flex items-center justify-center text-white bg-gray-900">Session Ended</div>;
  }

  if (!role) {
    return <div className="h-screen flex items-center justify-center text-white bg-gray-900">Loading...</div>;
  }

  // Determine main participant (host)
  let mainParticipant: Participant | null = null;
  if (role === 'host') {
    mainParticipant = {
      id: userId!,
      name: userName,
      role: 'host',
      video: isVideoEnabled,
      audio: isAudioEnabled,
      handRaised: isHandRaised,
    };
  } else {
    mainParticipant = participants.find((p) => p.role === 'host') || null;
  }

  const otherParticipants = participants.filter((p) => p.id !== mainParticipant?.id);

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-black/30 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Live Class Session
          </h1>
          <span className="text-sm text-gray-400">{participants.length + 1} participants</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-all">
            <Users className="w-4 h-4 inline mr-2" />
            Participants
          </button>
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-all">
            <MessageSquare className="w-4 h-4 inline mr-2" />
            Chat
          </button>
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-all">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 p-6 overflow-hidden">
        {viewMode === 'gallery' ? (
          <div className="grid grid-cols-3 gap-4 h-full">
            {/* Main Speaker */}
            <div className="col-span-2 relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl border border-white/20 shadow-2xl">
              {mainParticipant && (
                <>
                  <video
                    id={mainParticipant.id === userId ? 'local-video' : `video-${mainParticipant.id}`}
                    ref={mainParticipant.id === userId ? localVideoRef : null}
                    autoPlay
                    playsInline
                    muted={mainParticipant.id === userId}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-black/50 backdrop-blur-lg rounded-full px-4 py-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="font-medium">{mainParticipant.name} (Host)</span>
                  </div>
                  {!mainParticipant.video && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
                      <Camera className="w-20 h-20 text-white/50" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Participants Grid */}
            <div className="space-y-4 overflow-y-auto">
              {otherParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-xl border border-white/20 shadow-xl hover:scale-105 transition-transform"
                >
                  <video
                    id={`video-${participant.id}`}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {!participant.video && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                          <span className="text-2xl font-bold">{participant.name[0]}</span>
                        </div>
                        <p className="text-sm font-medium">{participant.name}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="text-xs font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                      {participant.name}
                    </span>
                    <div className="flex gap-1">
                      {!participant.audio && (
                        <div className="bg-red-500 rounded-full p-1">
                          <MicOff className="w-3 h-3" />
                        </div>
                      )}
                      {!participant.video && (
                        <div className="bg-red-500 rounded-full p-1">
                          <VideoOff className="w-3 h-3" />
                        </div>
                      )}
                      {participant.handRaised && (
                        <div className="bg-yellow-500 rounded-full p-1">
                          <Hand className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Speaker View (simplified, adjust as needed)
          <div className="h-full flex gap-4">
            <div className="flex-1 relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl border border-white/20 shadow-2xl">
              {mainParticipant && (
                <video
                  id={mainParticipant.id === userId ? 'local-video' : `video-${mainParticipant.id}`}
                  ref={mainParticipant.id === userId ? localVideoRef : null}
                  autoPlay
                  playsInline
                  muted={mainParticipant.id === userId}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="w-64 space-y-2 overflow-y-auto">
              {otherParticipants.slice(0, 8).map((participant) => (
                <div
                  key={participant.id}
                  className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10"
                >
                  <video
                    id={`video-${participant.id}`}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {!participant.video && (
                    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                      <span className="text-2xl font-bold">{participant.name[0]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-black/50 backdrop-blur-xl border-t border-white/10 px-6 py-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-all ${
              isAudioEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isAudioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all ${
              isVideoEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isVideoEnabled ? <Camera className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
          <button
            onClick={toggleScreenShare}
            className={`p-4 rounded-full transition-all ${
              isScreenSharing ? 'bg-green-500 hover:bg-green-600' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <ScreenShare className="w-6 h-6" />
          </button>
          <button
            onClick={toggleHandRaise}
            className={`p-4 rounded-full transition-all ${
              isHandRaised ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <Hand className="w-6 h-6" />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'gallery' ? 'speaker' : 'gallery')}
            className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-all"
          >
            <Users className="w-6 h-6" /> {/* Adjusted icon for view mode */}
          </button>
          <button onClick={endCall} className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-all ml-8">
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LivePage;
