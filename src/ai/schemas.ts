
import { z } from 'zod';

export const GenerateQuizInputSchema = z.object({
  topic: z.string().describe('The topic for the quiz (e.g., "The Solar System").'),
  numQuestions: z.number().describe('The number of questions to generate for the quiz.'),
  questionTypes: z
    .array(z.enum(['mcq', 'true_false', 'short_answer']))
    .describe('An array of question types to include.'),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;


const optionSchema = z.object({
  text: z.string().min(1, "Option text cannot be empty."),
});

// Using a single object with z.enum for the type, as discriminatedUnion with literal
// was causing issues with the Gemini API's schema parsing.
const questionSchema = z.object({
    type: z.enum(["mcq", "true_false", "short_answer"]),
    text: z.string().min(1, "Question text is required."),
    options: z.array(optionSchema).optional(),
    correctAnswer: z.string().min(1, "A correct answer is required."),
  }).superRefine((data, ctx) => {
    // Add custom validation based on the question type
    if (data.type === 'mcq') {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Multiple choice questions must have at least two options.',
        });
      }
       if (data.options && !data.options.map(o => o.text).includes(data.correctAnswer)) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['correctAnswer'],
            message: 'Correct answer must be one of the options.',
         });
       }
    }
    if (data.type === 'true_false') {
        if (data.correctAnswer !== 'true' && data.correctAnswer !== 'false') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['correctAnswer'],
                message: 'Correct answer for True/False must be "true" or "false".',
            });
        }
    }
  });


export const quizFormSchema = z.object({
  title: z.string().min(1, "Quiz title is required."),
  description: z.string().optional(),
  questions: z.array(questionSchema).min(1, "At least one question is required."),
  classIds: z.array(z.string()).optional(),
});

export type QuizFormValues = z.infer<typeof quizFormSchema>;
export type GenerateQuizOutput = z.infer<typeof quizFormSchema>;


export const aiFormSchema = z.object({
  topic: z.string().min(3, "Topic must be at least 3 characters long."),
  numQuestions: z.coerce.number().min(1, "Must have at least 1 question.").max(10, "Cannot generate more than 10 questions."),
});

export type AiFormValues = z.infer<typeof aiFormSchema>;


// Schemas for grading short answer questions
export const GradeShortAnswerInputSchema = z.object({
  questionText: z.string().describe('The text of the question that was asked.'),
  correctAnswer: z.string().describe('The teacher-provided correct answer.'),
  studentAnswer: z.string().describe("The student's submitted answer."),
});
export type GradeShortAnswerInput = z.infer<typeof GradeShortAnswerInputSchema>;

export const GradeShortAnswerOutputSchema = z.object({
  isCorrect: z.boolean().describe('Whether the student answer is semantically correct.'),
});
export type GradeShortAnswerOutput = z.infer<typeof GradeShortAnswerOutputSchema>;
