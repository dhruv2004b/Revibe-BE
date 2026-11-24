import { createApp } from './app.js';
import { assertSafeConfig, config, isDemoDeploy } from './config.js';
import { firebaseVerifier, mockVerifier, type TokenVerifier } from './http/auth.js';
import { startKeepAlive } from './keepalive.js';
import { HuggingFaceSentiment } from './services/huggingface.js';
import { MemoryStore } from './store/memory.js';
import type { Store } from './store/store.js';

async function initFirebase(): Promise<void> {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  if (getApps().length) return;
  if (!config.firebaseCredentials) throw new Error('FIREBASE_CREDENTIALS is required for firebase auth or firestore store');
  initializeApp({ credential: cert(JSON.parse(config.firebaseCredentials)) });
}

async function main(): Promise<void> {
  assertSafeConfig(config);
  const needsFirebase = config.authMode === 'firebase' || config.storeMode === 'firestore';
  if (needsFirebase) await initFirebase();

  let store: Store;
  if (config.storeMode === 'firestore') {
    const { getFirestore } = await import('firebase-admin/firestore');
    const { FirestoreStore } = await import('./store/firestore.js');
    store = new FirestoreStore(getFirestore());
  } else {
    store = new MemoryStore();
  }

  const verify: TokenVerifier = config.authMode === 'firebase' ? await firebaseVerifier() : mockVerifier;
  const sentiment = config.hfToken ? new HuggingFaceSentiment(config.hfToken, config.hfSentimentModel, config.hfTimeoutMs) : null;

  const app = createApp({
    store,
    verify,
    sentiment,
    timeZone: config.timeZone,
    dailyCoinCap: config.dailyCoinCap,
    corsOrigins: config.corsOrigins,
    rateLimit: true,
  });

  if (isDemoDeploy(config)) {
    console.warn('WARNING: demo mode. Mock sign-in and/or in-memory data in production: anyone can act as any user, and data is lost on restart or sleep.');
  }

  // 0.0.0.0 so Render's router can reach the instance.
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`ReVibe API on :${config.port} (auth=${config.authMode}, store=${config.storeMode}, ai=${sentiment ? 'huggingface' : 'lexicon'})`);
  });

  // Keep the free instance awake by hitting our own public /health.
  const stopKeepAlive =
    config.keepAlive && config.keepAliveUrl
      ? startKeepAlive({ baseUrl: config.keepAliveUrl, intervalMs: config.keepAliveIntervalMs })
      : () => {};

  // Render sends SIGTERM on deploys and when a free instance spins down.
  // Finish in-flight requests, then exit before the platform kills us.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopKeepAlive();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
