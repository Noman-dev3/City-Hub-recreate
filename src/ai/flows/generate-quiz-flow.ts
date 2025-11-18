
'use server';
/**
 * @fileOverview A flow for generating quizzes using AI.
 *
 * - generateQuiz - A function that calls the Genkit flow to generate a quiz.
 */

import { ai } from '@/ai/genkit';
import { GenerateQuizInputSchema, quizFormSchema } from '@/ai/schemas';
import { GenerateQuizInput } from '@/ai/schemas';
import { GenerateQuizOutput } from '@/ai/schemas';

export async function generateQuiz(
  input: GenerateQuizInput
): Promise<GenerateQuizOutput> {
  return generateQuizFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: { schema: GenerateQuizInputSchema },
  output: { schema: quizFormSchema },
  prompt: `
    You are an expert educator and quiz creator. Your task is to generate a quiz based on the provided topic, number of questions, and question types.

    Instructions:
    1.  Create a quiz titled "Quiz on {{{topic}}}".
    2.  The quiz must have exactly {{{numQuestions}}} questions.
    3.  Distribute the questions among the following types: {{{questionTypes}}}.
    4.  For Multiple Choice (mcq) questions:
        - Provide 4 distinct options.
        - The 'correctAnswer' field must be the full text of the correct option.
    5.  For True/False (true_false) questions:
        - The 'correctAnswer' field must be either "true" or "false".
    6.  For Short Answer (short_answer) questions:
        - Provide a concise and accurate answer for the 'correctAnswer' field.
    7.  Ensure the quiz is factually accurate and relevant to the topic.
    8.  Return the output in the specified JSON format.
  `,
});

const generateQuizFlow = ai.defineFlow(
  {
    name: 'generateQuizFlow',
    inputSchema: GenerateQuizInputSchema,
    outputSchema: quizFormSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('AI failed to generate quiz output.');
    }
    // The AI might return an option text for correctAnswer that isn't one of the options.
    // This will ensure that the correct answer is always one of the options.
    output.questions.forEach(q => {
        if (q.type === 'mcq') {
            const optionTexts = q.options.map(opt => opt.text);
            if (!optionTexts.includes(q.correctAnswer)) {
                // If the AI hallucinates a correct answer, just pick the first option.
                q.correctAnswer = optionTexts[0];
            }
        }
    });

    return output;
  }
);
    