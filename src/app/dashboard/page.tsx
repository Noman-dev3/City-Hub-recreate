'use client';

import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpenCheck, Users, Video, TrendingUp, Clock, 
  Award, Target, Calendar, Activity, Sparkles,
  ArrowRight, Plus, Play
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserProfile = {
  role: 'student' | 'teacher';
  fullName: string;
  email: string;
};

type Class = {
  id: string;
  name: string;
  isLive: boolean;
  studentIds?: string[];
};

type Quiz = { 
  id: string;
  title: string;
  description?: string;
  createdAt?: { seconds: number };
  classIds?: string[];
};

type TeacherStats = {
  classCount: number;
  studentCount: number;
  quizCount: number;
  liveClassCount: number;
  recentQuizzes: Quiz[];
  liveClasses: Class[];
};

type StudentStats = {
  classCount: number;
  activeQuizzes: number;
  completedQuizzes: number;
  liveClassCount: number;
  enrolledClasses: Class[];
  upcomingQuizzes: Quiz[];
};

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [stats, setStats] = useState<TeacherStats | StudentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  // Fetch user profile
  useEffect(() => {
    if (user && firestore) {
      const fetchProfile = async () => {
        setProfileLoading(true);
        try {
          const userDocRef = doc(firestore, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
        setProfileLoading(false);
      };
      fetchProfile();
    }
  }, [user, firestore]);

  // Fetch stats based on role
  useEffect(() => {
    if (!profile || !user || !firestore) return;

    const fetchTeacherStats = async () => {
      setStatsLoading(true);
      try {
        const classesQuery = query(
          collection(firestore, 'classes'), 
          where('teacherId', '==', user.uid)
        );
        const quizzesQuery = query(
          collection(firestore, 'quizzes'), 
          where('creatorId', '==', user.uid)
        );

        const [classesSnapshot, quizzesSnapshot] = await Promise.all([
          getDocs(classesQuery),
          getDocs(quizzesQuery)
        ]);

        const classes = classesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Class));

        const liveClasses = classes.filter(cls => cls.isLive);
        const classCount = classes.length;
        const liveClassCount = liveClasses.length;

        const studentIds = new Set<string>();
        classes.forEach(cls => {
          cls.studentIds?.forEach((id: string) => studentIds.add(id));
        });

        const allQuizzes = quizzesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Quiz));

        const recentQuizzes = allQuizzes
          .filter(q => q.createdAt)
          .sort((a, b) => b.createdAt!.seconds - a.createdAt!.seconds)
          .slice(0, 5);

        setStats({
          classCount,
          studentCount: studentIds.size,
          quizCount: allQuizzes.length,
          liveClassCount,
          recentQuizzes,
          liveClasses
        });
      } catch (error) {
        console.error("Error fetching teacher stats:", error);
      }
      setStatsLoading(false);
    };

    const fetchStudentStats = async () => {
      setStatsLoading(true);
      try {
        const classesQuery = query(
          collection(firestore, 'classes'),
          where('studentIds', 'array-contains', user.uid)
        );
        const classesSnapshot = await getDocs(classesQuery);
        
        const enrolledClasses = classesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Class));

        const studentClassIds = enrolledClasses.map(cls => cls.id);
        const classCount = studentClassIds.length;
        const liveClassCount = enrolledClasses.filter(cls => cls.isLive).length;

        let activeQuizzes = 0;
        let completedQuizzes = 0;
        let upcomingQuizzes: Quiz[] = [];

        if (studentClassIds.length > 0) {
          const quizzesQuery = query(
            collection(firestore, 'quizzes'),
            where('classIds', 'array-contains-any', studentClassIds.slice(0, 10))
          );
          const quizzesSnapshot = await getDocs(quizzesQuery);
          const allQuizzes = quizzesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Quiz));

          const submissionChecks = await Promise.all(
            allQuizzes.map(async (quiz) => {
              const submissionQuery = query(
                collection(firestore, 'quizzes', quiz.id, 'submissions'),
                where('studentId', '==', user.uid)
              );
              const submissionSnapshot = await getDocs(submissionQuery);
              return {
                quiz,
                hasSubmitted: !submissionSnapshot.empty
              };
            })
          );

          submissionChecks.forEach(({ quiz, hasSubmitted }) => {
            if (hasSubmitted) {
              completedQuizzes++;
            } else {
              activeQuizzes++;
              upcomingQuizzes.push(quiz);
            }
          });

          upcomingQuizzes = upcomingQuizzes
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
            .slice(0, 5);
        }

        setStats({
          classCount,
          activeQuizzes,
          completedQuizzes,
          liveClassCount,
          enrolledClasses,
          upcomingQuizzes
        });
      } catch (error) {
        console.error("Error fetching student stats:", error);
      }
      setStatsLoading(false);
    };

    if (profile.role === 'teacher') {
      fetchTeacherStats();
    } else {
      fetchStudentStats();
    }
  }, [profile, user, firestore]);

  const isLoading = userLoading || profileLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-2">
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  const renderTeacherDashboard = () => {
    const teacherStats = stats as TeacherStats;
    const completionRate = teacherStats.quizCount > 0 
      ? Math.round((teacherStats.studentCount / (teacherStats.classCount || 1)) * 100) 
      : 0;

    return (
      <>
        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{teacherStats.classCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {teacherStats.liveClassCount > 0 && (
                  <span className="text-green-600 font-medium">
                    {teacherStats.liveClassCount} live now
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{teacherStats.studentCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all classes
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Quizzes</CardTitle>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <BookOpenCheck className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{teacherStats.quizCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Assessments created
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Engagement</CardTitle>
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{completionRate}%</div>
              <Progress value={completionRate} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Live Classes */}
          {teacherStats.liveClasses.length > 0 && (
            <Card className="border-2 border-green-500/50 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-green-500/10 to-emerald-500/10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                      Live Classes
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Active sessions right now
                    </CardDescription>
                  </div>
                  <Badge className="bg-green-500 hover:bg-green-600">
                    {teacherStats.liveClasses.length} Live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {teacherStats.liveClasses.map(cls => (
                    <div key={cls.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                          <Video className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-semibold">{cls.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {cls.studentIds?.length || 0} students enrolled
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" className="bg-green-600 hover:bg-green-700">
                        <Link href={`/dashboard/classes/${cls.id}/live`}>
                          <Play className="h-4 w-4 mr-2" />
                          Join
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Quizzes */}
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenCheck className="h-5 w-5" />
                    Recent Quizzes
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Your latest assessments
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/quizzes">
                    <Plus className="h-4 w-4 mr-2" />
                    Create
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {teacherStats.recentQuizzes.length > 0 ? (
                <div className="space-y-3">
                  {teacherStats.recentQuizzes.map(quiz => (
                    <div key={quiz.id} className="group flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-all">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpenCheck className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{quiz.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {quiz.createdAt && new Date(quiz.createdAt.seconds * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="ghost" size="sm" className="shrink-0">
                        <Link href={`/dashboard/quizzes/${quiz.id}`}>
                          View
                          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="mx-auto h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                    <BookOpenCheck className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-2">No quizzes yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Create your first quiz to get started</p>
                  <Button asChild size="sm">
                    <Link href="/dashboard/quizzes">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Quiz
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-2 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Button asChild variant="outline" className="h-auto p-4 flex-col items-start hover:border-primary">
                <Link href="/dashboard/classes">
                  <Video className="h-6 w-6 mb-2 text-primary" />
                  <span className="font-semibold">View Classes</span>
                  <span className="text-xs text-muted-foreground">Manage your classes</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto p-4 flex-col items-start hover:border-primary">
                <Link href="/dashboard/quizzes">
                  <BookOpenCheck className="h-6 w-6 mb-2 text-primary" />
                  <span className="font-semibold">Create Quiz</span>
                  <span className="text-xs text-muted-foreground">New assessment</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto p-4 flex-col items-start hover:border-primary">
                <Link href="/dashboard/students">
                  <Users className="h-6 w-6 mb-2 text-primary" />
                  <span className="font-semibold">View Students</span>
                  <span className="text-xs text-muted-foreground">Student management</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  const renderStudentDashboard = () => {
    const studentStats = stats as StudentStats;
    const completionRate = (studentStats.activeQuizzes + studentStats.completedQuizzes) > 0
      ? Math.round((studentStats.completedQuizzes / (studentStats.activeQuizzes + studentStats.completedQuizzes)) * 100)
      : 0;

    return (
      <>
        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrolled Classes</CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{studentStats.classCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {studentStats.liveClassCount > 0 && (
                  <span className="text-green-600 font-medium">
                    {studentStats.liveClassCount} live now
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Quizzes</CardTitle>
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{studentStats.activeQuizzes}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting submission
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Award className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{studentStats.completedQuizzes}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Quizzes finished
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Progress</CardTitle>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{completionRate}%</div>
              <Progress value={completionRate} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Live Classes */}
          {studentStats.enrolledClasses.filter(cls => cls.isLive).length > 0 && (
            <Card className="border-2 border-green-500/50 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-green-500/10 to-emerald-500/10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                      Live Classes
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Join active sessions now
                    </CardDescription>
                  </div>
                  <Badge className="bg-green-500 hover:bg-green-600 animate-pulse">
                    {studentStats.enrolledClasses.filter(cls => cls.isLive).length} Live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {studentStats.enrolledClasses
                    .filter(cls => cls.isLive)
                    .map(cls => (
                      <div key={cls.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500/5 to-emerald-500/5 rounded-lg border border-green-500/20">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Video className="h-5 w-5 text-green-600 animate-pulse" />
                          </div>
                          <div>
                            <p className="font-semibold">{cls.name}</p>
                            <p className="text-xs text-green-600 font-medium">Class is live now!</p>
                          </div>
                        </div>
                        <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 shadow-lg">
                          <Link href={`/dashboard/classes/${cls.id}/live`}>
                            <Play className="h-4 w-4 mr-2" />
                            Join Now
                          </Link>
                        </Button>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Quizzes */}
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenCheck className="h-5 w-5" />
                    Upcoming Quizzes
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Quizzes you need to complete
                  </CardDescription>
                </div>
                {studentStats.activeQuizzes > 0 && (
                  <Badge variant="destructive">{studentStats.activeQuizzes} Due</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {studentStats.upcomingQuizzes.length > 0 ? (
                <div className="space-y-3">
                  {studentStats.upcomingQuizzes.map(quiz => (
                    <div key={quiz.id} className="group flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-all">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpenCheck className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{quiz.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {quiz.description || 'No description'}
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" className="shrink-0">
                        <Link href={`/dashboard/quizzes/${quiz.id}`}>
                          Start
                          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                    <Award className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="text-sm font-medium mb-2">All caught up!</p>
                  <p className="text-xs text-muted-foreground">You've completed all your quizzes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Classes */}
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    My Classes
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Your enrolled classes
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/classes">
                    View All
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {studentStats.enrolledClasses.length > 0 ? (
                <div className="space-y-3">
                  {studentStats.enrolledClasses.slice(0, 5).map(cls => (
                    <Link
                      key={cls.id}
                      href={`/dashboard/classes/${cls.id}`}
                      className="group flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center",
                          cls.isLive ? "bg-green-500/10" : "bg-blue-500/10"
                        )}>
                          <Video className={cn(
                            "h-5 w-5",
                            cls.isLive ? "text-green-600" : "text-blue-600"
                          )} />
                        </div>
                        <div>
                          <p className="font-semibold">{cls.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {cls.studentIds?.length || 0} students
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="mx-auto h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                    <Video className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-2">No classes yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Enroll in a class to get started</p>
                  <Button asChild size="sm">
                    <Link href="/dashboard/classes">
                      Browse Classes
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-2 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Button asChild variant="outline" className="h-auto p-4 flex-col items-start hover:border-primary">
                <Link href="/dashboard/classes">
                  <Video className="h-6 w-6 mb-2 text-primary" />
                  <span className="font-semibold">My Classes</span>
                  <span className="text-xs text-muted-foreground">View all classes</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto p-4 flex-col items-start hover:border-primary">
                <Link href="/dashboard/quizzes">
                  <BookOpenCheck className="h-6 w-6 mb-2 text-primary" />
                  <span className="font-semibold">Take Quiz</span>
                  <span className="text-xs text-muted-foreground">Complete assessments</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto p-4 flex-col items-start hover:border-primary">
                <Link href="/dashboard/chat">
                  <Users className="h-6 w-6 mb-2 text-primary" />
                  <span className="font-semibold">Chat</span>
                  <span className="text-xs text-muted-foreground">Message teachers</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16 border-4 border-primary/20">
            <AvatarImage src={`https://avatar.vercel.sh/${profile?.email}.png`} />
            <AvatarFallback className="text-lg">
              {profile?.fullName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {greeting}, {profile?.fullName.split(' ')[0]}!
            </h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        </div>
      </div>

      {profile?.role === 'teacher' ? renderTeacherDashboard() : renderStudentDashboard()}
    </div>
  );
}