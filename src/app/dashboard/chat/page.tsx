"use client";

import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Search, Send, Plus, X, MoreVertical, Phone, Video, Image as ImageIcon, Paperclip, Smile, Check, CheckCheck } from 'lucide-react';
import { io } from 'socket.io-client';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBPU3a9uRkMkC4V760cqmBaeshR3Vo9nG0",
  authDomain: "nomans-nexus.firebaseapp.com",
  projectId: "nomans-nexus",
  storageBucket: "nomans-nexus.appspot.com",
  messagingSenderId: "676808495030",
  appId: "1:676808495030:web:2c81c5f154cc228fe6bb17"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Socket.IO connection
const socket = io('https://your-socket-server.com', { 
  autoConnect: false,
  reconnection: true 
});

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  status?: 'online' | 'offline';
  lastSeen?: any;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  timestamp: any;
  read: boolean;
  delivered: boolean;
}

interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageTime?: any;
  unreadCount?: number;
  otherUser?: User;
}

const ChatPage: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize auth and socket
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data() as User;
        setCurrentUser({
          uid: user.uid,
          email: user.email!,
          displayName: userData?.displayName || user.email?.split('@')[0] || 'User',
          photoURL: userData?.photoURL || user.photoURL || undefined,
          status: 'online'
        });

        // Connect socket
        socket.connect();
        socket.emit('user-online', user.uid);

        // Update user status in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          displayName: userData?.displayName || user.email?.split('@')[0],
          status: 'online',
          lastSeen: serverTimestamp()
        }, { merge: true });
      }
    });

    return () => {
      socket.emit('user-offline', currentUser?.uid);
      socket.disconnect();
      unsubscribe();
    };
  }, []);

  // Listen to socket events
  useEffect(() => {
    if (!currentUser) return;

    socket.on('new-message', (message: Message) => {
      if (message.receiverId === currentUser.uid || message.senderId === currentUser.uid) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
      }
    });

    socket.on('message-read', ({ messageId, chatId }) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, read: true } : msg
      ));
    });

    socket.on('user-status-change', ({ userId, status }) => {
      setChats(prev => prev.map(chat => {
        if (chat.otherUser?.uid === userId) {
          return {
            ...chat,
            otherUser: { ...chat.otherUser, status }
          };
        }
        return chat;
      }));
    });

    return () => {
      socket.off('new-message');
      socket.off('message-read');
      socket.off('user-status-change');
    };
  }, [currentUser]);

  // Load chats
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatsList: Chat[] = [];
      
      for (const docSnap of snapshot.docs) {
        const chatData = docSnap.data();
        const otherUserId = chatData.participants.find((id: string) => id !== currentUser.uid);
        
        if (otherUserId) {
          const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
          const otherUserData = otherUserDoc.data() as User;
          
          chatsList.push({
            id: docSnap.id,
            participants: chatData.participants,
            lastMessage: chatData.lastMessage,
            lastMessageTime: chatData.lastMessageTime,
            unreadCount: chatData.unreadCount?.[currentUser.uid] || 0,
            otherUser: {
              uid: otherUserId,
              email: otherUserData?.email || '',
              displayName: otherUserData?.displayName || 'Unknown',
              photoURL: otherUserData?.photoURL,
              status: otherUserData?.status || 'offline'
            }
          });
        }
      }
      
      chatsList.sort((a, b) => {
        const timeA = a.lastMessageTime?.toMillis() || 0;
        const timeB = b.lastMessageTime?.toMillis() || 0;
        return timeB - timeA;
      });
      
      setChats(chatsList);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Load messages for selected chat
  useEffect(() => {
    if (!selectedChat || !currentUser) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', selectedChat.id),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesList: Message[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Message));
      
      setMessages(messagesList);
      scrollToBottom();

      // Mark messages as read
      messagesList.forEach(async (msg) => {
        if (msg.receiverId === currentUser.uid && !msg.read) {
          await updateDoc(doc(db, 'messages', msg.id), { read: true });
          socket.emit('mark-as-read', { messageId: msg.id, chatId: selectedChat.id });
        }
      });
    });

    return () => unsubscribe();
  }, [selectedChat, currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const searchUserByEmail = async () => {
    if (!searchEmail.trim()) return;
    
    setIsSearching(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('email', '==', searchEmail.toLowerCase().trim())
      );
      
      const snapshot = await getDocs(q);
      const results: User[] = [];
      
      snapshot.forEach((doc) => {
        const userData = doc.data() as User;
        if (doc.id !== currentUser?.uid) {
          results.push({
            uid: doc.id,
            email: userData.email,
            displayName: userData.displayName,
            photoURL: userData.photoURL
          });
        }
      });
      
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching user:', error);
      alert('User not found');
    } finally {
      setIsSearching(false);
    }
  };

  const startChat = async (otherUser: User) => {
    if (!currentUser) return;

    try {
      // Check if chat already exists
      const existingChat = chats.find(chat => 
        chat.participants.includes(otherUser.uid)
      );

      if (existingChat) {
        setSelectedChat(existingChat);
        setShowAddContact(false);
        return;
      }

      // Create new chat
      const chatRef = await addDoc(collection(db, 'chats'), {
        participants: [currentUser.uid, otherUser.uid],
        createdAt: serverTimestamp(),
        lastMessage: '',
        lastMessageTime: serverTimestamp(),
        unreadCount: { [currentUser.uid]: 0, [otherUser.uid]: 0 }
      });

      const newChat: Chat = {
        id: chatRef.id,
        participants: [currentUser.uid, otherUser.uid],
        otherUser
      };

      setSelectedChat(newChat);
      setShowAddContact(false);
      setSearchEmail('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error starting chat:', error);
      alert('Failed to start chat');
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedChat || !currentUser) return;

    try {
      const messageData = {
        chatId: selectedChat.id,
        text: messageText.trim(),
        senderId: currentUser.uid,
        receiverId: selectedChat.otherUser!.uid,
        timestamp: serverTimestamp(),
        read: false,
        delivered: true
      };

      await addDoc(collection(db, 'messages'), messageData);

      // Update chat's last message
      await updateDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: messageText.trim(),
        lastMessageTime: serverTimestamp(),
        [`unreadCount.${selectedChat.otherUser!.uid}`]: (selectedChat.unreadCount || 0) + 1
      });

      // Emit socket event
      socket.emit('send-message', messageData);

      setMessageText('');
      scrollToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 86400000) { // Less than 24 hours
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) { // Less than 7 days
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Chats List */}
      <div className="w-full md:w-96 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Chats</h1>
            <button
              onClick={() => setShowAddContact(true)}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Chats List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Plus className="w-16 h-16 mb-4" />
              <p>No chats yet</p>
              <p className="text-sm">Start a conversation by adding a contact</p>
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedChat?.id === chat.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {chat.otherUser?.displayName.charAt(0).toUpperCase()}
                    </div>
                    {chat.otherUser?.status === 'online' && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold truncate">{chat.otherUser?.displayName}</h3>
                      <span className="text-xs text-gray-500">{formatTime(chat.lastMessageTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 truncate">{chat.lastMessage || 'Start chatting'}</p>
                      {chat.unreadCount! > 0 && (
                        <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="bg-white p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {selectedChat.otherUser?.displayName.charAt(0).toUpperCase()}
                  </div>
                  {selectedChat.otherUser?.status === 'online' && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div>
                  <h2 className="font-semibold">{selectedChat.otherUser?.displayName}</h2>
                  <p className="text-xs text-gray-500">
                    {selectedChat.otherUser?.status === 'online' ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <Phone className="w-5 h-5 text-gray-600" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <Video className="w-5 h-5 text-gray-600" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <MoreVertical className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {messages.map((message) => {
                const isSent = message.senderId === currentUser.uid;
                return (
                  <div
                    key={message.id}
                    className={`flex mb-4 ${isSent ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${
                        isSent
                          ? 'bg-blue-500 text-white rounded-br-none'
                          : 'bg-white text-gray-800 rounded-bl-none'
                      }`}
                    >
                      <p className="break-words">{message.text}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className={`text-xs ${isSent ? 'text-blue-100' : 'text-gray-500'}`}>
                          {formatTime(message.timestamp)}
                        </span>
                        {isSent && (
                          message.read ? (
                            <CheckCheck className="w-4 h-4 text-blue-100" />
                          ) : (
                            <Check className="w-4 h-4 text-blue-100" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white p-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <Smile className="w-6 h-6 text-gray-600" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <Paperclip className="w-6 h-6 text-gray-600" />
                </button>
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  className="p-2 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors"
                >
                  <Send className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400">
              <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Search className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Select a chat</h2>
              <p>Choose a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Add Contact</h2>
                <button
                  onClick={() => {
                    setShowAddContact(false);
                    setSearchEmail('');
                    setSearchResults([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchUserByEmail()}
                    placeholder="user@example.com"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={searchUserByEmail}
                    disabled={isSearching}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-700">Results:</h3>
                  {searchResults.map((user) => (
                    <div
                      key={user.uid}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                      onClick={() => startChat(user)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold">{user.displayName}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                        </div>
                      </div>
                      <button className="px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-full">
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchEmail && !isSearching && (
                <p className="text-center text-gray-500 py-4">No user found with this email</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
