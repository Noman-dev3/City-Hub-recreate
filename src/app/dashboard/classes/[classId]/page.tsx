'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { useFirestore, useDoc, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { sendNotification } from '@/lib/notifications';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Users, UserPlus, ArrowLeft, BookOpenCheck, ArrowRight, Video, 
  AlertCircle, GraduationCap, FileText, Settings, Play
} from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type ClassDetails = {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  studentIds: string[];
  isLive?: boolean;
  jitsiRoomName: string;
  createdAt?: any;
};

type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  role: 'student' | 'teacher';
};

type Quiz = {
  id: string;
  title: string;
  description?: string;
  questionCount?: number;
};

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.classId as string;
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [teacher, setTeacher] = useState<UserProfile | null>(null);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [relatedUsersLoading, setRelatedUsersLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [assignedQuizzes, setAssignedQuizzes] = useState<Quiz[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [isLiveSessionLoading, setIsLiveSessionLoading] = useState(false);

  const classDocRef = useMemo(() => 
    firestore ? doc(firestore, 'classes', classId) : null, 
    [firestore, classId]
  );
  
  const { data: classDetails, loading: classLoading } = useDoc<ClassDetails>(classDocRef);
  
  const isUserStudent = user && students.some(s => s.id === user.uid);
  const isUserTeacher = user && classDetails?.teacherId === user.uid;

  useEffect(() => {
    const fetchRelatedUsers = async () => {
      if (!firestore || !classDetails) return;

      setRelatedUsersLoading(true);

      if (classDetails.teacherId) {
        const teacherDoc = await getDoc(doc(firestore, 'users', classDetails.teacherId));
        if (teacherDoc.exists()) {
          setTeacher({ id: teacherDoc.id, ...teacherDoc.data() } as UserProfile);
        }
      }

      if (classDetails.studentIds && classDetails.studentIds.length > 0) {
        const studentPromises = classDetails.studentIds.map(id => 
          getDoc(doc(firestore, 'users', id))
        );
        const studentDocs = await Promise.all(studentPromises);
        const studentProfiles = studentDocs
          .filter(doc => doc.exists())
          .map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
        setStudents(studentProfiles);
      } else {
        setStudents([]);
      }

      setRelatedUsersLoading(false);
    };

    fetchRelatedUsers();
  }, [firestore, classDetails]);

  useEffect(() => {
    const fetchQuizzes = async () => {
      if (!firestore) return;
      setQuizzesLoading(true);
      
      const quizzesQuery = query(
        collection(firestore, 'quizzes'),
        where('classIds', 'array-contains', classId)
      );
      
      const querySnapshot = await getDocs(quizzesQuery);
      const quizzes = querySnapshot.docs.map(doc => 
        ({ id: doc.id, ...doc.data() } as Quiz)
      );

      const quizzesWithCounts = await Promise.all(
        quizzes.map(async quiz => {
          const questionsSnapshot = await getDocs(
            collection(firestore, 'quizzes', quiz.id, 'questions')
          );
          return { ...quiz, questionCount: questionsSnapshot.size };
        })
      );

      setAssignedQuizzes(quizzesWithCounts);
      setQuizzesLoading(false);
    };

    fetchQuizzes();
  }, [firestore, classId]);

  const handleEnroll = async () => {
    if (!user || !firestore || !classDetails || !teacher) return;
    
    setIsEnrolling(true);
    try {
      const classRef = doc(firestore, 'classes', classId);
      await updateDoc(classRef, {
        studentIds: arrayUnion(user.uid)
      });

      toast({
        title: 'Successfully Enrolled! 🎉',
        description: `Welcome to "${classDetails.name}"`,
      });

      await sendNotification(firestore, teacher.id, {
        title: 'New Student Enrollment',
        body: `${user.displayName || 'A new student'} joined "${classDetails.name}"`,
        link: `/dashboard/classes/${classId}`
      });

    } catch (error) {
      console.error("Error enrolling:", error);
      toast({
        variant: 'destructive',
        title: 'Enrollment Failed',
        description: 'Please try again later',
      });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleGoLive = async () => {
    if (!user || !firestore || !classDetails) return;
    
    setIsLiveSessionLoading(true);
    try {
      const classRef = doc(firestore, 'classes', classId);
      await updateDoc(classRef, { isLive: true });

      const batch = writeBatch(firestore);
      classDetails.studentIds.forEach(studentId => {
        sendNotification(firestore, studentId, {
          title: `🎥 Class is Live!`,
          body: `${teacher?.fullName} started "${classDetails.name}"`,
          link: `/dashboard/classes/${classId}/live`
        });
      });
      await batch.commit();

      toast({
        title: 'Going Live!',
        description: 'Starting your class session...',
      });

      router.push(`/dashboard/classes/${classId}/live`);
    } catch (error) {
      console.error("Error starting live session:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not start live session',
      });
    } finally {
      setIsLiveSessionLoading(false);
    }
  };

  const isLoading = userLoading || classLoading || relatedUsersLoading;
  
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32 ml-auto" />
        </div>
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-full max-w-2xl" />
        <div className="grid md:grid-cols-3 gap-6 mt-8">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!classDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Class Not Found</h2>
        <p className="text-muted-foreground mb-6">This class doesn't exist or has been removed</p>
        <Button asChild>
          <Link href="/dashboard/classes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header Actions */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/classes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Link>
        </Button>
        
        <div className="flex gap-2">
          {isUserTeacher && (
            <>
              <Button variant="outline" disabled>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
              <Button 
                onClick={handleGoLive} 
                disabled={isLiveSessionLoading}
                size="lg"
                className={cn(
                  "shadow-lg",
                  classDetails.isLive && "bg-red-600 hover:bg-red-700 animate-pulse"
                )}
              >
                {isLiveSessionLoading ? (
                  <>Starting...</>
                ) : classDetails.isLive ? (
                  <>
                    <Video className="mr-2 h-4 w-4" />
                    Resume Live Class
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Live Class
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Class Header */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shadow-lg">
            <GraduationCap className="h-10 w-10 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold tracking-tight">
                {classDetails.name}
              </h1>
              {classDetails.isLive && (
                <Badge className="bg-red-500 hover:bg-red-600 animate-pulse shadow-lg">
                  <div className="h-2 w-2 rounded-full bg-white mr-1" />
                  LIVE
                </Badge>
              )}
            </div>
            <p className="text-lg text-muted-foreground mb-2">
              {classDetails.description || 'No description provided'}
            </p>
            {teacher && (
              <div className="flex items-center gap-2 text-sm">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={`https://avatar.vercel.sh/${teacher.email}.png`} />
                  <AvatarFallback>{teacher.fullName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground">
                  Taught by <span className="font-medium text-foreground">{teacher.fullName}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Alert */}
      {isUserStudent && classDetails.isLive && (
        <Alert className="bg-gradient-to-r from-red-500/10 via-orange-500/10 to-yellow-500/10 border-2 border-red-500/50 shadow-lg">
          <Video className="h-5 w-5 text-red-600 animate-pulse" />
          <AlertTitle className="font-bold text-lg">Class is Live Now! 🎥</AlertTitle>
          <AlertDescription className="flex justify-between items-center mt-2">
            <span>Your teacher has started the class. Join now to participate!</span>
            <Button asChild size="lg" className="bg-red-600 hover:bg-red-700 shadow-lg">
              <Link href={`/dashboard/classes/${classId}/live`}>
                <Play className="mr-2 h-4 w-4" />
                Join Live Class
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="md:col-span-2 space-y-6">
          {/* Quizzes */}
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenCheck className="h-5 w-5" />
                    Assigned Quizzes
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {assignedQuizzes.length} quiz{assignedQuizzes.length !== 1 ? 'zes' : ''} available
                  </CardDescription>
                </div>
                {isUserTeacher && (
                  <Button variant="outline" size="sm" disabled>
                    {/* <Plus className="h-4 w-4 mr-2" /> */}
                    Assign Quiz
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {quizzesLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : assignedQuizzes.length > 0 ? (
                <div className="space-y-3">
                  {assignedQuizzes.map(quiz => (
                    <Card key={quiz.id} className="hover:shadow-md transition-shadow border-2">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg mb-1">{quiz.title}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {quiz.questionCount ?? 0} Questions
                              </span>
                            </div>
                          </div>
                          <Button asChild variant="default" className="shadow-sm">
                            <Link href={`/dashboard/quizzes/${quiz.id}`}>
                              {isUserTeacher ? 'View Results' : 'Take Quiz'}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-10 border-2 border-dashed rounded-lg">
                  <BookOpenCheck className="h-12 w-12 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold mb-2">No Quizzes Yet</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">
                    {isUserTeacher 
                      ? "Assign quizzes to help your students practice and learn"
                      : "Your teacher hasn't assigned any quizzes yet"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resources */}
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Files & Resources
              </CardTitle>
              <CardDescription>Coming soon</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center text-center p-10 border-2 border-dashed rounded-lg">
                <FileText className="h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="text-lg font-semibold mb-2">Resources Coming Soon</h3>
                <p className="text-muted-foreground max-w-sm text-sm">
                  Shared files, notes, and learning materials will appear here
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Students */}
        <Card className="border-2 shadow-lg h-fit sticky top-6">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Students ({students.length})
            </CardTitle>
            <CardDescription>
              {isUserStudent ? "You're enrolled in this class" : 
               isUserTeacher ? "Your students" : 
               "Enroll to join"}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {students.length > 0 ? (
                students.map(student => (
                  <div 
                    key={student.id} 
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10 border-2 border-primary/20">
                      <AvatarImage 
                        src={`https://avatar.vercel.sh/${student.email}.png`} 
                        alt={student.fullName} 
                      />
                      <AvatarFallback className="bg-primary/10">
                        {student.fullName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {student.fullName}
                        {student.id === user?.uid && (
                          <span className="text-primary text-sm ml-1">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {student.email}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No students enrolled yet
                  </p>
                </div>
              )}
            </div>
          </CardContent>

          <Separator />

          <CardFooter className="pt-4">
            {isUserTeacher ? (
              <Button className="w-full" variant="outline" disabled>
                <Settings className="mr-2 h-4 w-4" />
                Manage Students
              </Button>
            ) : isUserStudent ? (
              <Button className="w-full" variant="outline" disabled>
                <Badge className="mr-2">✓</Badge>
                You're Enrolled
              </Button>
            ) : (
              <Button 
                className="w-full shadow-lg" 
                onClick={handleEnroll} 
                disabled={isEnrolling}
                size="lg"
              >
                {isEnrolling ? (
                  'Enrolling...'
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Enroll in Class
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}