import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { HELPLINES } from './domain/catalog.js';
import { now } from './domain/clock.js';
import { requireAuth } from './http/auth.js';
import type { Deps } from './http/deps.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { coinRoutes } from './http/routes/coins.js';
import { communityRoutes } from './http/routes/community.js';
import { moodRoutes } from './http/routes/moods.js';
import { profileRoutes } from './http/routes/profile.js';
import { supportRoutes } from './http/routes/support.js';
import { taskRoutes } from './http/routes/tasks.js';

export function createApp(deps: Deps): Express {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind one proxy
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins.includes('*') ? true : deps.corsOrigins }));
  app.use(express.json({ limit: '32kb' }));

  // Public
  app.get('/health', (_req, res) => {
    res.json({ ok: true, time: now().toISOString(), ai: deps.sentiment ? 'huggingface' : 'lexicon' });
  });
  app.get('/helplines', (_req, res) => {
    res.json({ helplines: HELPLINES });
  });

  // Signed-in
  const api = express.Router();
  if (deps.rateLimit) {
    api.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  }
  api.use(requireAuth(deps.verify));
  api.use(profileRoutes(deps));
  api.use(moodRoutes(deps));
  api.use(taskRoutes(deps));
  api.use(coinRoutes(deps));
  api.use(communityRoutes(deps));
  api.use(supportRoutes(deps));
  app.use('/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
