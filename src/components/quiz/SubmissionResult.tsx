'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { Icons } from '../icons';

type Question = {
    id: string;
    text: string;
    type: 'mcq' | 'true_false' | 'short_answer';
    options?: string[];
    correctAnswer: string;
};

type Submission = {
    id: string;
    studentId: string;
    answers: Record<string, string>;
    score: number;
    totalQuestions: number;
    submittedAt: any;
    studentName?: string;
};

type SubmissionResultProps = {
    submission: Submission;
    questions: Question[];
    onSendFeedback: (studentId: string, feedback: string) => Promise<void>;
    onRecheckSubmission: (submission: Submission) => Promise<void>;
    isStudentView?: boolean;
};

export function SubmissionResult({ submission, questions, onSendFeedback, onRecheckSubmission, isStudentView = false }: SubmissionResultProps) {
    const [feedback, setFeedback] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isRechecking, setIsRechecking] = useState(false);

    const handleSendClick = async () => {
        setIsSending(true);
        await onSendFeedback(submission.studentId, feedback);
        setFeedback(''); // Clear feedback after sending
        setIsSending(false);
    };

    const handleRecheckClick = async () => {
        setIsRechecking(true);
        await onRecheckSubmission(submission);
        setIsRechecking(false);
    }
    
    // This is a temporary client-side check to show AI grading status.
    // The actual grading happens on submission.
    const isCorrectShortAnswer = (studentAnswer: string, correctAnswer: string) => {
        if (!studentAnswer) return false;
        // This is a simplified check. The real check is with AI on submit.
        return studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    }

    return (
        <div className="space-y-8 p-4">
            {questions.map((question, index) => {
                const studentAnswer = submission.answers[question.id] || 'Not Answered';
                let isCorrect = false;

                if (question.type === 'short_answer') {
                    // For short answers, the `score` from the submission is the source of truth,
                    // but we can't easily tie a single point to a single question here.
                    // This visual check is an approximation. We assume if the score is not full, some short answer might be wrong.
                    // A more robust solution would store per-question correctness in the submission.
                    isCorrect = isCorrectShortAnswer(studentAnswer, question.correctAnswer);
                } else {
                    isCorrect = studentAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
                }

                return (
                    <Card key={question.id} className="p-6 bg-background shadow-md">
                        <div className="flex justify-between items-start">
                            <p className="font-semibold mb-4 text-lg">
                                Question {index + 1}: {question.text}
                            </p>
                            {isCorrect ? (
                                <CheckCircle className="h-6 w-6 text-green-500" />
                            ) : (
                                <XCircle className="h-6 w-6 text-red-500" />
                            )}
                        </div>

                        {question.type === 'mcq' && (
                            <RadioGroup value={studentAnswer} disabled>
                                {question.options?.map((option, i) => {
                                    const isStudentChoice = studentAnswer === option;
                                    const isCorrectChoice = question.correctAnswer === option;
                                    
                                    let colorClass = '';
                                    if (isStudentChoice && !isCorrectChoice) {
                                        colorClass = 'text-red-500 font-bold'; // Incorrectly chosen by student
                                    } else if (isCorrectChoice) {
                                        colorClass = 'text-green-500 font-bold'; // The correct answer
                                    }

                                    return (
                                        <div key={i} className="flex items-center space-x-3">
                                            <RadioGroupItem value={option} id={`sub-${submission.studentId}-${question.id}-option-${i}`} />
                                            <Label htmlFor={`sub-${submission.studentId}-${question.id}-option-${i}`} className={cn("text-base font-normal", colorClass)}>
                                                {option}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </RadioGroup>
                        )}

                        {question.type === 'true_false' && (
                            <RadioGroup value={studentAnswer.toLowerCase()} disabled>
                                <div className="flex items-center space-x-3">
                                    <RadioGroupItem value="true" id={`sub-${submission.studentId}-${question.id}-true`} />
                                    <Label htmlFor={`sub-${submission.studentId}-${question.id}-true`} className={cn("text-base font-normal", studentAnswer.toLowerCase() === 'true' && !isCorrect && 'text-red-500 font-bold', question.correctAnswer === 'true' && 'text-green-500 font-bold')}>True</Label>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <RadioGroupItem value="false" id={`sub-${submission.studentId}-${question.id}-false`} />
                                    <Label htmlFor={`sub-${submission.studentId}-${question.id}-false`} className={cn("text-base font-normal", studentAnswer.toLowerCase() === 'false' && !isCorrect && 'text-red-500 font-bold', question.correctAnswer === 'false' && 'text-green-500 font-bold')}>False</Label>
                                </div>
                            </RadioGroup>
                        )}
                        
                        {question.type === 'short_answer' && (
                             <div className="space-y-2">
                                <Label>Your Answer</Label>
                                <Input value={studentAnswer} disabled className={!isCorrect ? 'border-red-500' : 'border-green-500'} />
                                {!isCorrect && (
                                  <>
                                    <Label>Correct Answer</Label>
                                    <Input value={question.correctAnswer} disabled className="border-green-500" />
                                  </>
                                )}
                                 <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>Graded with AI. If your answer was semantically correct but marked wrong, ask your teacher to recheck.</span>
                                </div>
                            </div>
                        )}
                    </Card>
                );
            })}
            
            {!isStudentView && (
                <div className="space-y-4 pt-8 border-t">
                    <div className="flex flex-col sm:flex-row gap-4 justify-between">
                         <div className="flex-1 space-y-2">
                            <h3 className="text-xl font-semibold">Send Feedback</h3>
                            <Textarea 
                                placeholder="Provide constructive feedback for the student..."
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                            />
                            <Button onClick={handleSendClick} disabled={!feedback.trim() || isSending}>
                                {isSending && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
                                Send Feedback
                            </Button>
                        </div>
                         <div className="flex-1 sm:text-right space-y-2">
                             <h3 className="text-xl font-semibold">Grading Actions</h3>
                             <p className="text-sm text-muted-foreground pb-2">If you suspect an AI grading error, you can re-run the evaluation.</p>
                             <Button variant="secondary" onClick={handleRecheckClick} disabled={isRechecking}>
                                {isRechecking ? (
                                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Recheck Result
                             </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
