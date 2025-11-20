'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useMemo, useEffect, useState } from "react";
import { doc, getDoc, collection, updateDoc, query, orderBy, limit, Query } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useUser, useAuth, useFirestore, useCollection } from "@/firebase";
import { timeAgo } from "@/lib/time";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Icons } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  BookOpenCheck,
  Video,
  MessagesSquare,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Upload,
  Bell,
  Moon,
  Sun,
  CheckCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type UserProfile = {
  name: string;
  email: string;
  role: 'student' | 'teacher';
};

type Notification = {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  } | null;
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && firestore) {
      const fetchProfile = async () => {
        setProfileLoading(true);
        const userDocRef = doc(firestore, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile({
            name: data.fullName,
            email: data.email,
            role: data.role,
          });
        } else {
          setProfile({
            name: user.displayName || "User",
            email: user.email || "",
            role: 'student',
          });
        }
        setProfileLoading(false);
      };
      fetchProfile();
    }
  }, [user, firestore]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  const notificationsCollectionRef = useMemo(() => {
    if (!user || !firestore) return null;
    const collectionRef = collection(firestore, "users", user.uid, "notifications");
    return query(collectionRef, orderBy('createdAt', 'desc'), limit(10));
  }, [user, firestore]);

  const { data: notifications } = useCollection<Notification>(notificationsCollectionRef as Query);
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const handleNotificationClick = async (notification: Notification) => {
    if (!firestore || !user) return;
    try {
      const notifRef = doc(firestore, "users", user.uid, "notifications", notification.id);
      await updateDoc(notifRef, { read: true });
      router.push(notification.link);
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!firestore || !user || !notifications) return;
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      await Promise.all(
        unreadNotifications.map(notif =>
          updateDoc(doc(firestore, "users", user.uid, "notifications", notif.id), { read: true })
        )
      );
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login');
    }
  };

  const loading = authLoading || profileLoading;

  const navItems = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      roles: ['student', 'teacher'],
      description: "Overview and stats"
    },
    {
      href: "/dashboard/classes",
      label: "Classes",
      icon: Video,
      roles: ['student', 'teacher'],
      description: "Manage classes"
    },
    {
      href: "/dashboard/quizzes",
      label: "Quizzes",
      icon: BookOpenCheck,
      roles: ['student', 'teacher'],
      description: "Assessments"
    },
    {
      href: "/dashboard/chat",
      label: "Chat",
      icon: MessagesSquare,
      roles: ['student', 'teacher'],
      description: "Messages"
    },
    {
      href: "/dashboard/students",
      label: "Students",
      icon: Users,
      roles: ['teacher'],
      description: "Student management"
    },
    {
      href: "/dashboard/files",
      label: "Files",
      icon: Upload,
      roles: ['teacher'],
      description: "File uploads"
    },
  ];

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
        <div className="hidden md:flex flex-col gap-4 w-64 border-r p-4 bg-background/50 backdrop-blur">
          <Skeleton className="h-10 w-40" />
          <div className="flex flex-col gap-2 mt-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1">
          <header className="flex h-16 items-center justify-end border-b px-6 bg-background/50 backdrop-blur">
            <Skeleton className="h-9 w-40 rounded-full" />
          </header>
          <main className="p-6">
            <Skeleton className="h-96 w-full" />
          </main>
        </div>
      </div>
    );
  }

  const isLiveClass = pathname.endsWith('/live');

  if (isLiveClass) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-background">
        {children}
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-2">
        <SidebarHeader className="border-b-2 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-2 group"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg group-hover:shadow-primary/50 transition-shadow">
              <Icons.Logo className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                City School Hub
              </span>
              <p className="text-xs text-muted-foreground capitalize">{profile.role} Portal</p>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4">
          <SidebarMenu>
            <div className="space-y-1">
              {navItems
                .filter(item => item.roles.includes(profile.role))
                .map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={cn(
                          "h-12 transition-all",
                          isActive && "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                        )}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className="h-5 w-5" />
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{item.label}</span>
                            <span className="text-xs opacity-70">{item.description}</span>
                          </div>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </div>
          </SidebarMenu>
          <Separator className="my-4" />
          {/* Profile Card in Sidebar */}
          <div className="mt-auto px-2">
            <Card className="border-2 bg-gradient-to-br from-primary/5 to-secondary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                    <AvatarImage src={`https://avatar.vercel.sh/${profile.email}.png`} />
                    <AvatarFallback>{profile.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm">{profile.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="w-full justify-center">
                  {profile.role === 'teacher' ? '👨‍🏫 Teacher' : '🎓 Student'}
                </Badge>
              </CardContent>
            </Card>
          </div>
        </SidebarContent>
        <SidebarFooter className="border-t-2 p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="h-12"
                tooltip={{ children: "Settings", side: 'right' }}
              >
                <Link href="/dashboard/settings" className="flex items-center gap-3">
                  <Settings className="h-5 w-5" />
                  <span className="font-medium">Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 items-center justify-between border-b-2 bg-background/95 backdrop-blur-md px-6 sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="hidden md:block">
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Notifications Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative hover:bg-secondary"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 w-5 justify-center p-0 text-xs animate-pulse"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-96">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleMarkAllAsRead}
                      className="h-7 text-xs"
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="h-96">
                  <DropdownMenuGroup>
                    {notifications && notifications.length > 0 ? (
                      notifications.map(notif => (
                        <DropdownMenuItem
                          key={notif.id}
                          onSelect={() => handleNotificationClick(notif)}
                          className={cn(
                            "flex flex-col items-start gap-2 cursor-pointer p-4 m-1 rounded-lg",
                            !notif.read && "bg-primary/5 border border-primary/20"
                          )}
                        >
                          <div className="flex items-start justify-between w-full gap-2">
                            <p className="font-semibold text-sm flex-1">{notif.title}</p>
                            {!notif.read && (
                              <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {notif.body}
                          </p>
                          {notif.createdAt && (
                            <p className="text-xs text-muted-foreground/60">
                              {timeAgo(notif.createdAt.seconds * 1000)}
                            </p>
                          )}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="px-4 py-12 text-center">
                        <div className="mx-auto h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                          <Bell className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium mb-1">No notifications</p>
                        <p className="text-xs text-muted-foreground">
                          You're all caught up!
                        </p>
                      </div>
                    )}
                  </DropdownMenuGroup>
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="hover:bg-secondary"
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            {/* User Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 h-auto py-2 px-3 hover:bg-secondary"
                >
                  <Avatar className="h-8 w-8 border-2 border-primary/20">
                    <AvatarImage
                      src={`https://avatar.vercel.sh/${profile.email}.png`}
                      alt={profile.name}
                    />
                    <AvatarFallback className="text-xs">
                      {profile.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium">{profile.name.split(' ')[0]}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {profile.role}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarImage src={`https://avatar.vercel.sh/${profile.email}.png`} />
                      <AvatarFallback>{profile.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{profile.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-background via-background to-secondary/5 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
