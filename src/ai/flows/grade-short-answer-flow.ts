
'use server';
/**
 * @fileOverview A flow for grading short answer questions using AI.
 *
 * - gradeShortAnswer - A function that calls the Genkit flow to grade an answer.
 */

import { ai } from '@/ai/genkit';
import {
  GradeShortAnswerInputSchema,
  GradeShortAnswerInput,
  GradeShortAnswerOutputSchema,
  GradeShortAnswerOutput,
} from '@/ai/schemas';


export async function gradeShortAnswer(
  input: GradeShortAnswerInput
): Promise<GradeShortAnswerOutput> {
  return gradeShortAnswerFlow(input);
}

const prompt = ai.definePrompt({
  name: 'gradeShortAnswerPrompt',
  input: { schema: GradeShortAnswerInputSchema },
  output: { schema: GradeShortAnswerOutputSchema },
  prompt: `
    You are an AI assistant designed to grade a student's short answer question.
    Your task is to determine if the student's answer is semantically correct based on the provided correct answer. The student does not need to use the exact same words, but their answer should convey the same meaning.

    Question: "{{{questionText}}}"
    Correct Answer: "{{{correctAnswer}}}"
    Student's Answer: "{{{studentAnswer}}}"

    Evaluate the student's answer and determine if it is correct.
    Respond with only the JSON object with the 'isCorrect' field.
  `,
});

const gradeShortAnswerFlow = ai.defineFlow(
  {
    name: 'gradeShortAnswerFlow',
    inputSchema: GradeShortAnswerInputSchema,
    outputSchema: GradeShortAnswerOutputSchema,
  },
  async (input) => {
    // If the student didn't answer, it's incorrect.
    if (!input.studentAnswer || input.studentAnswer.trim() === '') {
        return { isCorrect: false };
    }
    
    // Always use AI to check for semantic correctness.
    const { output } = await prompt(input);
    if (!output) {
      // If AI fails, fallback to a stricter check as a safeguard.
      return { isCorrect: false };
    }

    return output;
  }
);

