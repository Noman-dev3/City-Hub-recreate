'use client';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Plus, Users, ArrowRight, BookOpen, Clock, GraduationCap } from "lucide-react";
import { useUser, useFirestore, useCollection } from "@/firebase";
import { useEffect, useState, useMemo } from "react";
import { doc, getDoc, collection, Query } from "firebase/firestore";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateClassDialog } from "@/components/class/CreateClassDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Class = {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  studentIds?: string[];
  isLive?: boolean;
  createdAt?: any;
};

export default function ClassesPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [role, setRole] = useState<'student' | 'teacher' | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'live' | 'enrolled'>('all');

  const classesCollectionRef = useMemo(() => {
    return firestore ? collection(firestore, 'classes') : null;
  }, [firestore]);

  const { data: classes, loading: classesLoading } = useCollection<Class>(classesCollectionRef as Query);

  useEffect(() => {
    if (user && firestore) {
      const fetchProfile = async () => {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setRole(userDoc.data().role);
        }
      };
      fetchProfile();
    }
  }, [user, firestore]);

  const filteredClasses = useMemo(() => {
    if (!classes) return [];
    
    let filtered = classes;
    
    if (filter === 'live') {
      filtered = classes.filter(cls => cls.isLive);
    } else if (filter === 'enrolled' && role === 'student') {
      filtered = classes.filter(cls => cls.studentIds?.includes(user?.uid || ''));
    }
    
    return filtered;
  }, [classes, filter, role, user?.uid]);

  const liveClassesCount = classes?.filter(cls => cls.isLive).length || 0;
  const enrolledClassesCount = role === 'student' 
    ? classes?.filter(cls => cls.studentIds?.includes(user?.uid || '')).length || 0 
    : 0;

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Classes
          </h1>
          <p className="text-muted-foreground mt-2">
            {role === 'teacher' 
              ? 'Manage your classes and live sessions' 
              : 'Browse and join available classes'}
          </p>
        </div>
        
        <div className="flex gap-3">
          {role === 'teacher' && (
            <>
              <Button onClick={() => setIsDialogOpen(true)} size="lg" className="shadow-lg">
                <Plus className="mr-2 h-4 w-4" />
                Create Class
              </Button>
              <CreateClassDialog isOpen={isDialogOpen} onOpenChange={setIsDialogOpen} />
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-2 hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classes?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Available to you
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-2 hover:border-green-500/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Now</CardTitle>
            <Video className="h-4 w-4 text-green-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{liveClassesCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active sessions
            </p>
          </CardContent>
        </Card>
        
        {role === 'student' && (
          <Card className="border-2 hover:border-blue-500/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrolled</CardTitle>
              <GraduationCap className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{enrolledClassesCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Your classes
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
          size="sm"
        >
          All Classes
        </Button>
        <Button
          variant={filter === 'live' ? 'default' : 'outline'}
          onClick={() => setFilter('live')}
          size="sm"
          className={cn(liveClassesCount > 0 && filter !== 'live' && 'border-green-500/50')}
        >
          <div className={cn("h-2 w-2 rounded-full mr-2", 
            filter === 'live' ? 'bg-white' : 'bg-green-500',
            liveClassesCount > 0 && 'animate-pulse'
          )} />
          Live Now ({liveClassesCount})
        </Button>
        {role === 'student' && (
          <Button
            variant={filter === 'enrolled' ? 'default' : 'outline'}
            onClick={() => setFilter('enrolled')}
            size="sm"
          >
            My Classes ({enrolledClassesCount})
          </Button>
        )}
      </div>

      {/* Classes Grid */}
      {classesLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClasses && filteredClasses.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredClasses.map((cls) => {
            const isEnrolled = cls.studentIds?.includes(user?.uid || '');
            const isTeacherClass = cls.teacherId === user?.uid;
            
            return (
              <Card 
                key={cls.id} 
                className={cn(
                  "flex flex-col overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1",
                  "border-2",
                  cls.isLive && "border-green-500/50 shadow-green-500/20",
                  isEnrolled && "border-blue-500/50 shadow-blue-500/20"
                )}
              >
                {/* Card Header with Gradient */}
                <div className="h-32 bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 relative overflow-hidden">
                  <div className="absolute inset-0 bg-grid-white/10" />
                  <div className="absolute top-4 right-4 flex gap-2">
                    {cls.isLive && (
                      <Badge className="bg-green-500 hover:bg-green-600 shadow-lg animate-pulse">
                        <div className="h-2 w-2 rounded-full bg-white mr-1 animate-ping" />
                        LIVE
                      </Badge>
                    )}
                    {isEnrolled && (
                      <Badge variant="secondary" className="shadow-lg">
                        Enrolled
                      </Badge>
                    )}
                    {isTeacherClass && (
                      <Badge variant="default" className="shadow-lg">
                        Your Class
                      </Badge>
                    )}
                  </div>
                  <div className="absolute bottom-4 left-4">
                    <div className="h-16 w-16 rounded-xl bg-background/90 backdrop-blur flex items-center justify-center shadow-lg">
                      <BookOpen className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                </div>

                <CardHeader className="pb-3">
                  <CardTitle className="line-clamp-1">{cls.name}</CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {cls.description || 'No description available.'}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-grow space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="mr-2 h-4 w-4" />
                    <span>{cls.studentIds?.length || 0} Student{(cls.studentIds?.length || 0) !== 1 ? 's' : ''}</span>
                  </div>
                  {cls.createdAt && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="mr-2 h-4 w-4" />
                      <span>Created {new Date(cls.createdAt.seconds * 1000).toLocaleDateString()}</span>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-4 border-t">
                  {cls.isLive ? (
                    <Button asChild className="w-full bg-green-600 hover:bg-green-700 shadow-lg" size="lg">
                      <Link href={`/dashboard/classes/${cls.id}/live`}>
                        <Video className="mr-2 h-4 w-4" />
                        Join Live Class
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild className="w-full" variant="outline" size="lg">
                      <Link href={`/dashboard/classes/${cls.id}`}>
                        View Class
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center text-center p-12 min-h-[400px] border-2 border-dashed">
          <div className="mx-auto bg-secondary/50 rounded-full p-8 w-fit mb-6">
            <Video className="h-16 w-16 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl mb-3">
            {filter === 'live' ? 'No Live Classes' : 
             filter === 'enrolled' ? 'Not Enrolled Yet' : 
             'No Classes Found'}
          </CardTitle>
          <p className="text-muted-foreground max-w-sm mb-6">
            {filter === 'live' ? 'There are no active live sessions at the moment. Check back later!' :
             filter === 'enrolled' ? 'You haven\'t enrolled in any classes yet. Browse available classes to get started.' :
             role === 'teacher' 
              ? "Create your first class to get started. All your classes will appear here." 
              : "No classes have been created yet. When a teacher creates a class, it will appear here."}
          </p>
          {role === 'teacher' && filter === 'all' && (
            <Button onClick={() => setIsDialogOpen(true)} size="lg">
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Class
            </Button>
          )}
          {filter !== 'all' && (
            <Button onClick={() => setFilter('all')} variant="outline" size="lg">
              View All Classes
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}