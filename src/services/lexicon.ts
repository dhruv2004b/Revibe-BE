import type { Sentiment } from '../domain/types.js';

/**
 * Small, offline sentiment scorer. Used when Hugging Face is not
 * configured, slow or down, so mood analysis always returns something.
 */
const POSITIVE: Record<string, number> = {
  happy: 2, great: 2, good: 1, calm: 1.5, relaxed: 1.5, peaceful: 1.5, grateful: 2, thankful: 2,
  excited: 2, proud: 2, productive: 1.5, focused: 1.5, motivated: 1.5, energetic: 1.5, better: 1,
  hopeful: 1.5, love: 2, loved: 2, fun: 1.5, enjoyed: 1.5, okay: 0.5, fine: 0.5, rested: 1,
  confident: 1.5, accomplished: 2, content: 1, cheerful: 2, amazing: 2.5, awesome: 2.5, nice: 1,
  khush: 2, accha: 1, mast: 1.5,
};

const NEGATIVE: Record<string, number> = {
  sad: -2, stressed: -2, stress: -1.5, anxious: -2, anxiety: -2, worried: -1.5, tired: -1, exhausted: -2,
  angry: -2, upset: -1.5, lonely: -2, alone: -1, depressed: -2.5, hopeless: -2.5, overwhelmed: -2,
  bad: -1.5, terrible: -2.5, awful: -2.5, hate: -2, scared: -1.5, afraid: -1.5, nervous: -1.5,
  burnout: -2, burnt: -1.5, frustrated: -1.5, cry: -1.5, crying: -1.5, hurt: -1.5, panic: -2,
  bored: -0.5, sick: -1, pressure: -1, failed: -1.5, failure: -1.5, worthless: -2.5, empty: -1.5,
  dukhi: -2, pareshan: -1.5, tension: -1.5, udaas: -2,
};

const NEGATORS = new Set(['not', 'no', 'never', "don't", 'dont', "didn't", 'didnt', "isn't", 'isnt', "wasn't", 'wasnt', 'nahi', 'nahin']);
const INTENSIFIERS: Record<string, number> = { very: 1.5, really: 1.5, so: 1.3, extremely: 2, too: 1.3, bahut: 1.5 };

export function lexiconSentiment(text: string): Sentiment {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return { label: 'neutral', score: 0, source: 'none' };

  let total = 0;
  let hits = 0;
  words.forEach((w, i) => {
    const base = POSITIVE[w] ?? NEGATIVE[w];
    if (base === undefined) return;
    let value = base;
    const prev = words[i - 1];
    const prev2 = words[i - 2];
    if (prev && INTENSIFIERS[prev]) value *= INTENSIFIERS[prev];
    if ((prev && NEGATORS.has(prev)) || (prev2 && NEGATORS.has(prev2))) value *= -0.7;
    total += value;
    hits += 1;
  });

  if (hits === 0) return { label: 'neutral', score: 0, source: 'lexicon' };
  // squash into -1..1
  const score = Math.max(-1, Math.min(1, total / (hits * 2.5)));
  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { label, score: Math.round(score * 100) / 100, source: 'lexicon' };
}
