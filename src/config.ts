import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = (process.env[name] ?? fallback) as T;
  if (!allowed.includes(raw)) throw new Error(`${name} must be one of ${allowed.join(', ')}`);
  return raw;
}

export const config = {
  port: num('PORT', 8080),
  isProduction: process.env.NODE_ENV === 'production',
  authMode: oneOf('AUTH_MODE', ['mock', 'firebase'] as const, 'mock'),
  storeMode: oneOf('STORE_MODE', ['memory', 'firestore'] as const, 'memory'),
  firebaseCredentials: process.env.FIREBASE_CREDENTIALS ?? '',
  hfToken: process.env.HF_TOKEN ?? '',
  hfSentimentModel: process.env.HF_SENTIMENT_MODEL || 'cardiffnlp/twitter-roberta-base-sentiment-latest',
  hfTimeoutMs: num('HF_TIMEOUT_MS', 8000),
  timeZone: process.env.APP_TIME_ZONE || 'Asia/Kolkata',
  dailyCoinCap: num('DAILY_COIN_CAP', 60),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean),
  /**
   * Lets a production deploy run with mock auth and the in-memory store, for
   * testing before Firebase exists. Anyone can act as any user, and data is
   * lost whenever the instance restarts or sleeps. Never use with real users.
   */
  allowDemoMode: process.env.ALLOW_DEMO_MODE === 'true',
  /** Public URL to ping so the free instance never sleeps. Render sets RENDER_EXTERNAL_URL itself. */
  keepAliveUrl: process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '',
  keepAlive: process.env.KEEP_ALIVE !== 'false',
  /** Under Render's 15-minute idle limit, with margin for a slow or missed ping. */
  keepAliveIntervalMs: num('KEEP_ALIVE_INTERVAL_MIN', 10) * 60_000,
};

export type AppConfig = typeof config;

/** True when production runs with local-only shortcuts that ALLOW_DEMO_MODE permitted. */
export function isDemoDeploy(c: AppConfig): boolean {
  return c.isProduction && (c.authMode === 'mock' || c.storeMode === 'memory');
}

/** Refuse to boot production with local-only shortcuts unless demo mode is explicitly on. */
export function assertSafeConfig(c: AppConfig): void {
  if (!c.isProduction || c.allowDemoMode) return;
  if (c.authMode === 'mock') throw new Error('AUTH_MODE=mock is not allowed in production (set ALLOW_DEMO_MODE=true for a test deploy)');
  if (c.storeMode === 'memory') throw new Error('STORE_MODE=memory is not allowed in production (set ALLOW_DEMO_MODE=true for a test deploy)');
}
