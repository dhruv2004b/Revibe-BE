import type { Sentiment, SentimentLabel } from '../domain/types.js';

export interface SentimentProvider {
  analyze(text: string): Promise<Sentiment | null>;
}

interface HfLabelScore {
  label: string;
  score: number;
}

const LABEL_MAP: Record<string, SentimentLabel> = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
  label_0: 'negative',
  label_1: 'neutral',
  label_2: 'positive',
};

/**
 * Calls a Hugging Face text-classification model. Returns null on any
 * failure (no token, timeout, cold model, bad response) so callers fall
 * back to the lexicon instead of failing the request.
 */
export class HuggingFaceSentiment implements SentimentProvider {
  constructor(
    private readonly token: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async analyze(text: string): Promise<Sentiment | null> {
    if (!this.token || !text.trim()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`https://router.huggingface.co/hf-inference/models/${this.model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: text.slice(0, 1000) }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      return parseHfResponse(body);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** HF returns either [[{label,score}...]] or [{label,score}...]. */
export function parseHfResponse(body: unknown): Sentiment | null {
  const list = Array.isArray(body) && Array.isArray(body[0]) ? body[0] : body;
  if (!Array.isArray(list)) return null;
  const scores: Partial<Record<SentimentLabel, number>> = {};
  for (const item of list as HfLabelScore[]) {
    const label = LABEL_MAP[String(item?.label).toLowerCase()];
    if (label && typeof item.score === 'number') scores[label] = item.score;
  }
  if (Object.keys(scores).length === 0) return null;
  const pos = scores.positive ?? 0;
  const neg = scores.negative ?? 0;
  const top = (Object.entries(scores) as [SentimentLabel, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return { label: top[0], score: Math.round((pos - neg) * 100) / 100, source: 'hf' };
}
