
'use client';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpenCheck, Plus, ArrowRight } from "lucide-react";
import { useUser, useFirestore, useCollection } from "@/firebase";
import { useEffect, useState, useMemo } from "react";
import { doc, getDoc, collection, query, where, getDocs, DocumentData } from "firebase/firestore";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

type Quiz = {
  id: string;
  title: string;
  description?: string;
  creatorId: string;
  questionCount?: number;
  classIds?: string[];
};

type Class = {
    id: string;
    studentIds: string[];
}

export default function QuizzesPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [role, setRole] = useState<'student' | 'teacher' | null>(null);
  
  const [userQuizzes, setUserQuizzes] = useState<Quiz[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);

  // Fetch user profile to determine role
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

  // Fetch quizzes based on role
  useEffect(() => {
    if (!role || !user || !firestore) return;

    const fetchQuizzes = async () => {
        setQuizzesLoading(true);
        let finalQuizzes: Quiz[] = [];

        if (role === 'teacher') {
            // Teachers see quizzes they created
            const q = query(collection(firestore, 'quizzes'), where('creatorId', '==', user.uid));
            const querySnapshot = await getDocs(q);
            finalQuizzes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz));
        } else {
            // Students see quizzes for their classes + public quizzes
            // 1. Find all classes the student is in
            const classesQuery = query(collection(firestore, 'classes'), where('studentIds', 'array-contains', user.uid));
            const classesSnapshot = await getDocs(classesQuery);
            const studentClassIds = classesSnapshot.docs.map(doc => doc.id);

            // 2. Find all quizzes assigned to those classes OR public quizzes (classIds is empty)
            const assignedQuizzesQuery = studentClassIds.length > 0
                ? query(collection(firestore, 'quizzes'), where('classIds', 'array-contains-any', studentClassIds))
                : null;
            
            const publicQuizzesQuery = query(collection(firestore, 'quizzes'), where('classIds', '==', []));

            const [assignedQuizzesSnapshot, publicQuizzesSnapshot] = await Promise.all([
              assignedQuizzesQuery ? getDocs(assignedQuizzesQuery) : Promise.resolve(null),
              getDocs(publicQuizzesQuery)
            ]);

            const assignedQuizzes = assignedQuizzesSnapshot?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz)) || [];
            const publicQuizzes = publicQuizzesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz));

            // Combine and remove duplicates
            const allStudentQuizzes = [...assignedQuizzes, ...publicQuizzes];
            const uniqueQuizzes = Array.from(new Set(allStudentQuizzes.map(q => q.id)))
               .map(id => allStudentQuizzes.find(q => q.id === id)!);
            finalQuizzes = uniqueQuizzes;
        }
        
        // Fetch question counts for all filtered quizzes
        const quizzesWithCountsPromises = finalQuizzes.map(async (quiz) => {
            const questionsQuery = query(collection(firestore, 'quizzes', quiz.id, 'questions'));
            const questionsSnapshot = await getDocs(questionsQuery);
            return { ...quiz, questionCount: questionsSnapshot.size };
        });

        const resolvedQuizzes = await Promise.all(quizzesWithCountsPromises);
        setUserQuizzes(resolvedQuizzes);
        setQuizzesLoading(false);
    }
    
    fetchQuizzes();

  }, [role, user, firestore]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Quizzes</h1>
        {role === 'teacher' && (
          <Button asChild>
            <Link href="/dashboard/quizzes/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Quiz
            </Link>
          </Button>
        )}
      </div>

      {quizzesLoading ? (
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
         </div>
      ) : userQuizzes && userQuizzes.length > 0 ? (
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {userQuizzes.map((quiz) => (
            <Card key={quiz.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{quiz.title}</CardTitle>
                <CardDescription>{quiz.description || 'No description available.'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                 <p className="text-sm text-muted-foreground">{quiz.questionCount ?? 0} Questions</p>
              </CardContent>
              <CardFooter>
                 <Button asChild className="w-full">
                    <Link href={`/dashboard/quizzes/${quiz.id}`}>
                      {role === 'teacher' ? 'View Results' : 'Take Quiz'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center text-center p-10 min-h-[400px] border-2 border-dashed">
          <CardHeader>
            <div className="mx-auto bg-secondary rounded-full p-6 w-fit mb-4">
              <BookOpenCheck className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">No Active Quizzes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground max-w-sm">
              {role === 'teacher'
                ? "Create a quiz and assign it to your students. Your created quizzes will be listed here."
                : "Quizzes assigned to you by your teachers will be listed here."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
