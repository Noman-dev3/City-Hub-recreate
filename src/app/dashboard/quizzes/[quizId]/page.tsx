'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, collection, Query, DocumentData, setDoc, serverTimestamp, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useFirestore, useDoc, useCollection, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { sendNotification } from '@/lib/notifications';
import { gradeShortAnswer } from '@/ai/flows/grade-short-answer-flow';


import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { SubmissionResult } from '@/components/quiz/SubmissionResult';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

type Question = {
    id: string;
    text: string;
    type: 'mcq' | 'true_false' | 'short_answer';
    options?: string[];
    correctAnswer: string;
};

type Quiz = {
    id: string;
    title: string;
    description?: string;
    creatorId: string;
};

type Submission = {
    id: string;
    studentId: string;
    answers: Record<string, string>;
    score: number;
    totalQuestions: number;
    submittedAt: any;
    studentName?: string; // Will be added
};

type UserProfile = {
    id: string;
    role: 'student' | 'teacher';
    fullName: string;
}

export default function QuizPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const quizId = params.quizId as string;
    const firestore = useFirestore();
    const { user } = useUser();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Data fetching
    const quizDocRef = useMemo(() => firestore ? doc(firestore, 'quizzes', quizId) : null, [firestore, quizId]);
    const { data: quiz, loading: quizLoading } = useDoc<Quiz>(quizDocRef);

    const questionsCollectionRef = useMemo(() => firestore ? collection(firestore, 'quizzes', quizId, 'questions') : null, [firestore, quizId]);
    const { data: questions, loading: questionsLoading } = useCollection<Question>(questionsCollectionRef as Query);
    
    const submissionsCollectionRef = useMemo(() => firestore ? collection(firestore, 'quizzes', quizId, 'submissions') : null, [firestore, quizId]);
    const { data: submissions, loading: submissionsLoading } = useCollection<Submission>(submissionsCollectionRef as Query);

    const userSubmissionRef = useMemo(() => (firestore && user) ? doc(firestore, 'quizzes', quizId, 'submissions', user.uid) : null, [firestore, quizId, user]);
    const { data: userSubmission, loading: userSubmissionLoading } = useDoc<Submission>(userSubmissionRef);

    const [submissionsWithNames, setSubmissionsWithNames] = useState<Submission[]>([]);
    const [namesLoading, setNamesLoading] = useState(false);

    useEffect(() => {
        if (user && firestore) {
            const userDocRef = doc(firestore, 'users', user.uid);
            const unsub = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    setProfile({ id: doc.id, ...doc.data() } as UserProfile);
                }
                setProfileLoading(false);
            });
            return () => unsub();
        }
    }, [user, firestore]);

    // Fetch student names for submissions
    useEffect(() => {
        const fetchNames = async () => {
            if (submissions && firestore) {
                setNamesLoading(true);
                const enrichedSubmissions = await Promise.all(
                    submissions.map(async (sub) => {
                        const userDoc = await getDoc(doc(firestore, 'users', sub.studentId));
                        return {
                            ...sub,
                            studentName: userDoc.exists() ? userDoc.data().fullName : 'Unknown Student',
                        };
                    })
                );
                setSubmissionsWithNames(enrichedSubmissions);
                setNamesLoading(false);
            }
        };
        if (profile?.role === 'teacher') {
            fetchNames();
        }
    }, [submissions, firestore, profile?.role]);


    const handleAnswerChange = (questionId: string, answer: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !quiz || !questions || !firestore) return;

        setIsSubmitting(true);
        let score = 0;

        // Use Promise.all to grade all questions concurrently, especially the AI ones
        const gradingPromises = questions.map(async (q) => {
            const studentAnswer = answers[q.id] || '';
            if (q.type === 'short_answer') {
                 if (studentAnswer.trim() === '') {
                    return 0; // Not answered is incorrect
                 }
                const gradingResult = await gradeShortAnswer({
                    questionText: q.text,
                    correctAnswer: q.correctAnswer,
                    studentAnswer: studentAnswer,
                });
                return gradingResult.isCorrect ? 1 : 0;
            } else {
                // Logic for non-short-answer questions
                if (studentAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()) {
                    return 1;
                }
                return 0;
            }
        });

        const results = await Promise.all(gradingPromises);
        score = results.reduce((total, current) => total + current, 0);
        
        const submissionData = {
            quizId: quiz.id,
            studentId: user.uid,
            answers,
            score,
            totalQuestions: questions.length,
            submittedAt: serverTimestamp(),
        };

        try {
            const submissionRef = doc(firestore, 'quizzes', quizId, 'submissions', user.uid);
            await setDoc(submissionRef, submissionData);

            toast({
                title: "Quiz Submitted!",
                description: `You scored ${score} out of ${questions.length}. You can now review your answers.`,
            });

            if (quiz.creatorId) {
                await sendNotification(firestore, quiz.creatorId, {
                    title: "New Quiz Submission",
                    body: `${user.displayName || 'A student'} scored ${score}/${questions.length} on "${quiz.title}"`,
                    link: `/dashboard/quizzes/${quizId}`,
                });
            }
            // No need to redirect, page will auto-update to show results
        } catch (error) {
            console.error("Error submitting quiz:", error);
            toast({
                variant: 'destructive',
                title: "Submission Failed",
                description: "There was an error submitting your quiz. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSendFeedback = async (studentId: string, feedback: string) => {
        if (!firestore || !feedback.trim() || !quiz) return;
        try {
            await sendNotification(firestore, studentId, {
                title: `Feedback for "${quiz.title}"`,
                body: feedback,
                link: `/dashboard/quizzes/${quizId}`
            });
            toast({
                title: "Feedback Sent!",
                description: "The student has been notified."
            });
        } catch (error) {
            console.error("Error sending feedback:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Could not send feedback.'
            });
        }
    };

    const handleRecheckSubmission = async (submission: Submission) => {
        if (!quiz || !questions || !firestore) return;

        const originalScore = submission.score;
        let newScore = 0;

        const gradingPromises = questions.map(async (q) => {
            const studentAnswer = submission.answers[q.id] || '';
            if (q.type === 'short_answer') {
                 if (studentAnswer.trim() === '') {
                    return 0; // Not answered is incorrect
                 }
                const gradingResult = await gradeShortAnswer({
                    questionText: q.text,
                    correctAnswer: q.correctAnswer,
                    studentAnswer: studentAnswer,
                });
                return gradingResult.isCorrect ? 1 : 0;
            } else {
                if (studentAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()) {
                    return 1;
                }
                return 0;
            }
        });

        const results = await Promise.all(gradingPromises);
        newScore = results.reduce((total, current) => total + current, 0);

        try {
            const submissionRef = doc(firestore, 'quizzes', quizId, 'submissions', submission.studentId);
            await updateDoc(submissionRef, { score: newScore });

            let description = `Re-check complete. The score remains ${newScore}/${submission.totalQuestions}.`;
            if (newScore > originalScore) {
                description = `Score updated from ${originalScore} to ${newScore}. Good news for the student!`;
            } else if (newScore < originalScore) {
                description = `Score updated from ${originalScore} to ${newScore}.`;
            }

            toast({
                title: `Re-checked ${submission.studentName}'s quiz`,
                description: description,
            });
        } catch (error) {
            console.error("Error re-checking submission:", error);
            toast({
                variant: 'destructive',
                title: "Re-check Failed",
                description: "Could not update the score. Please try again.",
            });
        }
    };


    const isLoading = quizLoading || questionsLoading || profileLoading || submissionsLoading || namesLoading || userSubmissionLoading;

    if (isLoading) {
        return (
            <div className="space-y-8">
                <Skeleton className="h-12 w-1/2" />
                <Skeleton className="h-6 w-3/4" />
                <div className="space-y-6">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        );
    }
    
    if (!quiz) return <div>Quiz not found.</div>;

    // TEACHER VIEW
    if (profile?.role === 'teacher') {
        return (
            <div className="max-w-4xl mx-auto">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-3xl">{quiz.title} - Submissions</CardTitle>
                        <CardDescription>{quiz.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {submissionsWithNames.length > 0 ? (
                             <Accordion type="single" collapsible className="w-full">
                                {submissionsWithNames.map(submission => (
                                    <AccordionItem value={submission.id} key={submission.id}>
                                        <AccordionTrigger className="text-lg">
                                            <div className="flex items-center gap-4">
                                                <span>{submission.studentName}</span>
                                                <Badge variant={submission.score / submission.totalQuestions >= 0.7 ? 'default' : 'destructive'}>
                                                    Score: {submission.score} / {submission.totalQuestions}
                                                </Badge>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <SubmissionResult 
                                                submission={submission}
                                                questions={questions ?? []}
                                                onSendFeedback={handleSendFeedback}
                                                onRecheckSubmission={handleRecheckSubmission}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                             </Accordion>
                        ) : (
                            <p className="text-muted-foreground text-center py-8">No students have submitted this quiz yet.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        )
    }

    // STUDENT VIEW - ALREADY SUBMITTED
    if (userSubmission) {
        return (
            <div className="max-w-4xl mx-auto space-y-6">
                 <Alert>
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>You have completed this quiz!</AlertTitle>
                    <AlertDescription>
                       You scored <Badge variant="secondary">{userSubmission.score}/{userSubmission.totalQuestions}</Badge>. You can review your answers below.
                    </AlertDescription>
                </Alert>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-3xl">{quiz.title} - Your Result</CardTitle>
                        <CardDescription>{quiz.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <SubmissionResult
                            submission={userSubmission}
                            questions={questions ?? []}
                            onSendFeedback={async () => {}} // No-op for students
                            onRecheckSubmission={async () => {}} // No-op for students
                            isStudentView={true}
                        />
                    </CardContent>
                </Card>
            </div>
        )
    }


    // STUDENT VIEW - NOT SUBMITTED YET
    return (
        <div className="max-w-4xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle className="text-3xl">{quiz.title}</CardTitle>
                    <CardDescription>{quiz.description}</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-8">
                        {questions?.map((question, index) => (
                            <Card key={question.id} className="p-6 bg-secondary/50 shadow-none">
                                <p className="font-semibold mb-4 text-lg">
                                    Question {index + 1}: {question.text}
                                </p>
                                {question.type === 'mcq' && (
                                    <RadioGroup onValueChange={(value) => handleAnswerChange(question.id, value)} value={answers[question.id] || ''}>
                                        {question.options?.map((option, i) => (
                                            <div key={i} className="flex items-center space-x-3">
                                                <RadioGroupItem value={option} id={`${question.id}-option-${i}`} />
                                                <Label htmlFor={`${question.id}-option-${i}`} className="text-base font-normal">{option}</Label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                )}
                                {question.type === 'true_false' && (
                                     <RadioGroup onValueChange={(value) => handleAnswerChange(question.id, value)} value={answers[question.id] || ''}>
                                        <div className="flex items-center space-x-3">
                                            <RadioGroupItem value="true" id={`${question.id}-true`} />
                                            <Label htmlFor={`${question.id}-true`} className="text-base font-normal">True</Label>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <RadioGroupItem value="false" id={`${question.id}-false`} />
                                            <Label htmlFor={`${question.id}-false`} className="text-base font-normal">False</Label>
                                        </div>
                                    </RadioGroup>
                                )}
                                {question.type === 'short_answer' && (
                                    <Input
                                        placeholder="Your answer..."
                                        value={answers[question.id] || ''}
                                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                    />
                                )}
                            </Card>
                        ))}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}

    