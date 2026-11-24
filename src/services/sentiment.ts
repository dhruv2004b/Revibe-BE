import type { Sentiment } from '../domain/types.js';
import type { SentimentProvider } from './huggingface.js';
import { lexiconSentiment } from './lexicon.js';

/** AI first, lexicon as fallback; empty text is neutral with no analysis. */
export async function analyzeSentiment(text: string, provider: SentimentProvider | null): Promise<Sentiment> {
  const trimmed = text.trim();
  if (!trimmed) return { label: 'neutral', score: 0, source: 'none' };
  const ai = provider ? await provider.analyze(trimmed) : null;
  return ai ?? lexiconSentiment(trimmed);
}
