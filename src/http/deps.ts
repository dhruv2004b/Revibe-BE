import type { SentimentProvider } from '../services/huggingface.js';
import type { Store } from '../store/store.js';
import type { TokenVerifier } from './auth.js';

export interface Deps {
  store: Store;
  verify: TokenVerifier;
  sentiment: SentimentProvider | null;
  timeZone: string;
  dailyCoinCap: number;
  corsOrigins: string[];
  /** Disable rate limits in tests. */
  rateLimit: boolean;
}
