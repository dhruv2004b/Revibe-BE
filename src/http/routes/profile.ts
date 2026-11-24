import { Router } from 'express';
import { z } from 'zod';
import { dateKey, now } from '../../domain/clock.js';
import type { UserProfile } from '../../domain/types.js';
import { randomHandle } from '../../services/handles.js';
import { uidOf } from '../auth.js';
import type { Deps } from '../deps.js';
import { parse } from '../errors.js';

const PatchMe = z
  .object({
    displayName: z.string().trim().min(1).max(40).optional(),
    onboarded: z.boolean().optional(),
  })
  .strict();

export function profileRoutes(deps: Deps): Router {
  const r = Router();

  /** Returns the profile, creating it on first sign-in. */
  r.get('/me', async (req, res) => {
    const uid = uidOf(req);
    const initial: UserProfile = {
      uid,
      displayName: req.user?.name?.split(' ')[0] ?? 'Friend',
      anonHandle: randomHandle(),
      coins: 0,
      streak: 0,
      bestStreak: 0,
      lastActiveDate: null,
      coinsEarnedDate: null,
      coinsEarnedToday: 0,
      unlockedRewards: [],
      onboarded: false,
      createdAt: now().toISOString(),
    };
    const user = await deps.store.ensureUser(initial);
    res.json({ user, today: dateKey(now(), deps.timeZone) });
  });

  r.patch('/me', async (req, res) => {
    const patch = parse(PatchMe, req.body);
    const uid = uidOf(req);
    const user = await deps.store.updateUser(uid, patch);
    res.json({ user });
  });

  /** "Delete my data": profile, moods, tasks, coins, posts, comments, bookings. */
  r.delete('/me', async (req, res) => {
    await deps.store.deleteUserData(uidOf(req));
    res.status(204).end();
  });

  return r;
}
