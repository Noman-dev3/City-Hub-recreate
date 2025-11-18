import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI({apiKey: "AIzaSyCKR4_NX_xt8WLZs-vdtjQPCHUIC1YAF5Y"})],
  model: 'googleai/gemini-2.5-flash',
});
