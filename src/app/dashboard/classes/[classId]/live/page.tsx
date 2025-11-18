'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, query, orderBy, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, where, getDocs } from 'firebase/firestore';
import { useWebRTC } from '@/hooks/useWebRTC';

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Power, Mic, MicOff, Video, VideoOff, ScreenShare, 
  Hand, Send, Users, MessageSquare, Grid3x3, Maximize2,
  PhoneOff, Monitor, MonitorOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'teacher';
  timestamp: { seconds: number; nanoseconds: number; } | null;
};

type ClassDetails = {
  id: string;
  name: string;
  teacherId: string;
};

type UserProfile = {
  fullName: string;
  role: 'student' | 'teacher';
};

type Participant = {
  id: string;
  userId: string;
  userName: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  handRaised: boolean;
};

export default function LiveClassPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isGridView, setIsGridView] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const classDocRef = useMemo(() => 
    firestore ? doc(firestore, 'classes', classId) : null, 
    [firestore, classId]
  );
  
  const { data: classDetails, loading: classLoading } = useDoc<ClassDetails>(classDocRef);
  const isTeacher = user?.uid === classDetails?.teacherId;

  // Initialize WebRTC
  const {
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
  } = useWebRTC(
    firestore,
    `class_${classId}`,
    user?.uid || '',
    profile?.fullName || '',
    isTeacher || false
  );

  const messagesCollectionRef = useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'classes', classId, 'messages');
  }, [firestore, classId]);

  const messagesQuery = useMemo(() => {
    if (!messagesCollectionRef) return null;
    return query(messagesCollectionRef, orderBy('timestamp', 'asc'));
  }, [messagesCollectionRef]);

  const { data: messages, loading: messagesLoading } = useCollection<ChatMessage>(messagesQuery);

  // Get user profile
  useEffect(() => {
    if (user && firestore) {
      const userDocRef = doc(firestore, 'users', user.uid);
      const unsub = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
          setProfile(doc.data() as UserProfile);
        }
      });
      return () => unsub();
    }
  }, [user, firestore]);

  // Initialize media when profile is loaded
  useEffect(() => {
    if (profile && !isInitialized && firestore) {
      initializeMedia().then(() => {
        setIsInitialized(true);
        toast({
          title: 'Connected',
          description: 'You have joined the live class',
        });
      }).catch((error) => {
        toast({
          variant: 'destructive',
          title: 'Media Error',
          description: 'Could not access camera/microphone. Please check permissions.',
        });
      });
    }
  }, [profile, isInitialized, initializeMedia, firestore, toast]);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !messagesCollectionRef || !profile || !message.trim()) return;

    await addDoc(messagesCollectionRef, {
      text: message,
      senderId: user.uid,
      senderName: profile.fullName,
      senderRole: profile.role,
      timestamp: serverTimestamp(),
    });
    setMessage('');
  };

  const handleToggleHand = async () => {
    if (!firestore || !user) return;
    
    const newHandState = !isHandRaised;
    setIsHandRaised(newHandState);
    
    const participantsRef = collection(firestore, 'rooms', `class_${classId}`, 'participants');
    const q = query(participantsRef, where('userId', '==', user.uid));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(doc => {
      updateDoc(doc.ref, { handRaised: newHandState });
    });

    if (newHandState && !isTeacher) {
      // Notify teacher
      await addDoc(messagesCollectionRef!, {
        text: `✋ ${profile?.fullName} raised their hand`,
        senderId: 'system',
        senderName: 'System',
        senderRole: 'teacher',
        timestamp: serverTimestamp(),
      });
    }
  };

  const handleEndSession = async () => {
    if (!classDocRef || !firestore) return;
    
    try {
      await updateDoc(classDocRef, { isLive: false });
      
      toast({
        title: 'Session Ended',
        description: 'The live class has been ended',
      });
      
      router.push(`/dashboard/classes/${classId}`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not end session',
      });
    }
  };

  const handleLeaveSession = () => {
    router.push(`/dashboard/classes/${classId}`);
  };

  const isLoading = userLoading || classLoading || !profile || !isInitialized;

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <p className="text-muted-foreground">Connecting to live class...</p>
        </div>
      </div>
    );
  }

  const participantsList = Array.from(participants.values()) as Participant[];
  const raisedHands = participantsList.filter(p => p.handRaised);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-br from-background to-secondary/20">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <div>
              <h1 className="text-xl font-bold">{classDetails?.name}</h1>
              <p className="text-sm text-muted-foreground">
                {participantsList.length} participant{participantsList.length !== 1 ? 's' : ''}
                {raisedHands.length > 0 && ` • ${raisedHands.length} raised hand${raisedHands.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowParticipants(!showParticipants)}
            >
              <Users className="h-4 w-4 mr-2" />
              Participants
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChat(!showChat)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </Button>
            {isTeacher ? (
              <Button variant="destructive" size="sm" onClick={handleEndSession}>
                <Power className="h-4 w-4 mr-2" />
                End For All
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleLeaveSession}>
                <PhoneOff className="h-4 w-4 mr-2" />
                Leave
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 flex flex-col gap-4">
          <div className={cn(
            "flex-1 grid gap-4 auto-rows-fr overflow-auto rounded-xl",
            isGridView 
              ? remoteStreams.size === 0 ? "grid-cols-1" 
              : remoteStreams.size === 1 ? "grid-cols-2" 
              : remoteStreams.size <= 4 ? "grid-cols-2"
              : "grid-cols-3"
              : "grid-cols-1"
          )}>
            {/* Local Video */}
            <Card className="relative overflow-hidden bg-black border-2 border-primary/50 shadow-xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur">
                  <Avatar className="h-24 w-24 border-4 border-primary">
                    <AvatarImage src={`https://avatar.vercel.sh/${user?.uid}.png`} />
                    <AvatarFallback className="text-2xl">
                      {profile?.fullName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <Badge className="bg-primary/90 backdrop-blur">
                  {profile?.fullName} (You)
                </Badge>
                <div className="flex gap-2">
                  {!isAudioEnabled && (
                    <Badge variant="destructive" className="backdrop-blur">
                      <MicOff className="h-3 w-3" />
                    </Badge>
                  )}
                  {isScreenSharing && (
                    <Badge className="bg-blue-500 backdrop-blur">
                      <Monitor className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            {/* Remote Videos */}
            {Array.from(remoteStreams.entries()).map(([peerId, stream]) => {
              const participant = participants.get(peerId) as Participant | undefined;
              return (
                <Card key={peerId} className="relative overflow-hidden bg-black shadow-xl">
                  <video
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    ref={(video) => {
                      if (video) video.srcObject = stream;
                    }}
                  />
                  {!participant?.videoEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary/20 to-primary/20 backdrop-blur">
                      <Avatar className="h-24 w-24 border-4 border-white/20">
                        <AvatarImage src={`https://avatar.vercel.sh/${peerId}.png`} />
                        <AvatarFallback className="text-2xl">
                          {participant?.userName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                    <Badge className="bg-black/70 backdrop-blur">
                      {participant?.userName}
                      {participant?.isHost && " 👑"}
                    </Badge>
                    <div className="flex gap-2">
                      {!participant?.audioEnabled && (
                        <Badge variant="destructive" className="backdrop-blur">
                          <MicOff className="h-3 w-3" />
                        </Badge>
                      )}
                      {participant?.handRaised && (
                        <Badge className="bg-yellow-500 backdrop-blur animate-bounce">
                          <Hand className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Controls */}
          <Card className="bg-background/95 backdrop-blur border-2">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button
                  size="lg"
                  onClick={toggleAudio}
                  variant={isAudioEnabled ? "default" : "destructive"}
                  className="rounded-full h-14 w-14 p-0"
                >
                  {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </Button>
                
                <Button
                  size="lg"
                  onClick={toggleVideo}
                  variant={isVideoEnabled ? "default" : "destructive"}
                  className="rounded-full h-14 w-14 p-0"
                >
                  {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </Button>
                
                <Button
                  size="lg"
                  onClick={toggleScreenShare}
                  variant={isScreenSharing ? "default" : "outline"}
                  className="rounded-full h-14 w-14 p-0"
                >
                  {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                </Button>
                
                <Button
                  size="lg"
                  onClick={handleToggleHand}
                  variant={isHandRaised ? "default" : "outline"}
                  className={cn("rounded-full h-14 w-14 p-0", isHandRaised && "animate-pulse")}
                >
                  <Hand className="h-5 w-5" />
                </Button>
                
                <Button
                  size="lg"
                  onClick={() => setIsGridView(!isGridView)}
                  variant="outline"
                  className="rounded-full h-14 w-14 p-0"
                >
                  {isGridView ? <Maximize2 className="h-5 w-5" /> : <Grid3x3 className="h-5 w-5" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        {(showChat || showParticipants) && (
          <div className="w-96 flex flex-col gap-4">
            {/* Participants Panel */}
            {showParticipants && (
              <Card className="flex-1 flex flex-col max-h-[50%]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Participants ({participantsList.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-3">
                      {participantsList.map(participant => (
                        <div key={participant.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={`https://avatar.vercel.sh/${participant.userId}.png`} />
                            <AvatarFallback>
                              {participant.userName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {participant.userName}
                              {participant.userId === user?.uid && " (You)"}
                            </p>
                            <div className="flex gap-1 mt-1">
                              {!participant.audioEnabled && (
                                <MicOff className="h-3 w-3 text-muted-foreground" />
                              )}
                              {!participant.videoEnabled && (
                                <VideoOff className="h-3 w-3 text-muted-foreground" />
                              )}
                              {participant.handRaised && (
                                <Hand className="h-3 w-3 text-yellow-500" />
                              )}
                            </div>
                          </div>
                          {participant.isHost && (
                            <Badge variant="secondary">Host</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Chat Panel */}
            {showChat && (
              <Card className="flex-1 flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Live Chat
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
                    <div className="space-y-3">
                      {messages?.map(msg => (
                        <div key={msg.id} className={cn(
                          'flex gap-2',
                          msg.senderId === user?.uid ? 'justify-end' : ''
                        )}>
                          {msg.senderId !== user?.uid && msg.senderId !== 'system' && (
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={`https://avatar.vercel.sh/${msg.senderId}.png`} />
                              <AvatarFallback>{msg.senderName.slice(0, 1)}</AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn(
                            'p-3 rounded-lg max-w-[80%]',
                            msg.senderId === 'system' ? 'bg-secondary/50 text-center w-full' :
                            msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                          )}>
                            {msg.senderId !== 'system' && (
                              <div className="text-xs font-bold flex items-center gap-2 mb-1">
                                {msg.senderName}
                                {msg.senderRole === 'teacher' && (
                                  <Badge variant="secondary" className="h-4 text-xs">Teacher</Badge>
                                )}
                              </div>
                            )}
                            <p className="text-sm break-words">{msg.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
                <CardFooter>
                  <form onSubmit={handleSendMessage} className="w-full flex gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1"
                    />
                    <Button type="submit" size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </CardFooter>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}