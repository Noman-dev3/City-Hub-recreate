'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpenCheck, Award, TrendingUp, ArrowRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Submission = {
  id: string;
  quizId: string;
  studentId: string;
  score: number;
  totalQuestions: number;
  submittedAt: {
    seconds: number;
    nanoseconds: number;
  };
  answers: any[];
};

type QuizInfo = {
  id: string;
  title: string;
  description?: string;
};

type SubmissionWithQuiz = Submission & {
  quizTitle: string;
  percentage: number;
};

export function StudentRecentSubmissions({ userId }: { userId: string }) {
  const firestore = useFirestore();
  const [submissions, setSubmissions] = useState<SubmissionWithQuiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !userId) return;

    const fetchRecentSubmissions = async () => {
      setLoading(true);
      try {
        // Get all quizzes first
        const quizzesSnapshot = await getDocs(collection(firestore, 'quizzes'));
        const quizzes = new Map<string, QuizInfo>();
        
        quizzesSnapshot.docs.forEach(doc => {
          quizzes.set(doc.id, {
            id: doc.id,
            title: doc.data().title || 'Untitled Quiz',
            description: doc.data().description,
          });
        });

        // Fetch submissions for each quiz
        const allSubmissions: SubmissionWithQuiz[] = [];
        
        for (const [quizId, quizInfo] of quizzes.entries()) {
          try {
            const submissionsQuery = query(
              collection(firestore, 'quizzes', quizId, 'submissions'),
              where('studentId', '==', userId),
              orderBy('submittedAt', 'desc'),
              limit(1)
            );
            
            const submissionsSnapshot = await getDocs(submissionsQuery);
            
            submissionsSnapshot.docs.forEach(doc => {
              const data = doc.data() as Omit<Submission, 'id'>;
              const percentage = data.totalQuestions > 0 
                ? Math.round((data.score / data.totalQuestions) * 100) 
                : 0;
              
              allSubmissions.push({
                id: doc.id,
                quizId,
                ...data,
                quizTitle: quizInfo.title,
                percentage,
              });
            });
          } catch (error) {
            // Skip quizzes that don't have submissions collection or have permission issues
            console.warn(`Could not fetch submissions for quiz ${quizId}:`, error);
          }
        }

        // Sort by submission date and take the 5 most recent
        allSubmissions.sort((a, b) => b.submittedAt.seconds - a.submittedAt.seconds);
        setSubmissions(allSubmissions.slice(0, 5));
      } catch (error) {
        console.error('Error fetching submissions:', error);
      }
      setLoading(false);
    };

    fetchRecentSubmissions();
  }, [firestore, userId]);

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 bg-green-500/10 border-green-500/20';
    if (percentage >= 80) return 'text-blue-600 bg-blue-500/10 border-blue-500/20';
    if (percentage >= 70) return 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20';
    if (percentage >= 60) return 'text-orange-600 bg-orange-500/10 border-orange-500/20';
    return 'text-red-600 bg-red-500/10 border-red-500/20';
  };

  const getGradeLetter = (percentage: number) => {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  if (loading) {
    return (
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5" />
            Recent Submissions
          </CardTitle>
          <CardDescription>Loading your recent quiz results...</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (submissions.length === 0) {
    return (
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5" />
            Recent Submissions
          </CardTitle>
          <CardDescription>Your recent quiz results will appear here</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <div className="mx-auto h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <BookOpenCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-2">No submissions yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Complete your first quiz to see your results here
            </p>
            <Button asChild size="sm">
              <Link href="/dashboard/quizzes">
                Browse Quizzes
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const averageScore = submissions.reduce((acc, sub) => acc + sub.percentage, 0) / submissions.length;

  return (
    <Card className="border-2 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Recent Submissions
            </CardTitle>
            <CardDescription className="mt-1">
              Your latest quiz results and performance
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-muted-foreground">Average</div>
            <div className="text-2xl font-bold text-primary">{Math.round(averageScore)}%</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {submissions.map((submission) => {
            // Create a unique key using both submission ID and quiz ID
            const uniqueKey = `${submission.quizId}-${submission.id}`;
            const gradeColor = getGradeColor(submission.percentage);
            const gradeLetter = getGradeLetter(submission.percentage);

            return (
              <div
                key={uniqueKey}
                className="group flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-all border-2 border-transparent hover:border-primary/20"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Grade Badge */}
                  <div className={cn(
                    "h-14 w-14 rounded-xl flex flex-col items-center justify-center shrink-0 border-2",
                    gradeColor
                  )}>
                    <div className="text-2xl font-bold">{gradeLetter}</div>
                    <div className="text-xs font-medium">{submission.percentage}%</div>
                  </div>

                  {/* Quiz Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate mb-1">
                      {submission.quizTitle}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {submission.score}/{submission.totalQuestions} correct
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(submission.submittedAt.seconds * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* View Button */}
                <Button 
                  asChild 
                  variant="ghost" 
                  size="sm" 
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Link href={`/dashboard/quizzes/${submission.quizId}`}>
                    View
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        {/* View All Button */}
        <div className="mt-6 pt-4 border-t">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/quizzes">
              View All Submissions
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}