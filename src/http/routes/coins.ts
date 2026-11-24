import { Router } from 'express';
import { REWARDS } from '../../domain/catalog.js';
import { dateKey, now } from '../../domain/clock.js';
import { applyRedeem } from '../../domain/economy.js';
import { notFound } from '../../domain/errors.js';
import { uidOf } from '../auth.js';
import type { Deps } from '../deps.js';

export function coinRoutes(deps: Deps): Router {
  const r = Router();

  r.get('/coins', async (req, res) => {
    const uid = uidOf(req);
    const [user, transactions] = await Promise.all([deps.store.getUser(uid), deps.store.listTransactions(uid, 50)]);
    if (!user) throw notFound('User');
    const today = dateKey(now(), deps.timeZone);
    res.json({
      balance: user.coins,
      streak: user.streak,
      bestStreak: user.bestStreak,
      earnedToday: user.coinsEarnedDate === today ? user.coinsEarnedToday : 0,
      dailyCap: deps.dailyCoinCap,
      transactions,
    });
  });

  r.get('/rewards', async (req, res) => {
    const user = await deps.store.getUser(uidOf(req));
    if (!user) throw notFound('User');
    res.json({
      balance: user.coins,
      rewards: REWARDS.map((rw) => ({ ...rw, owned: user.unlockedRewards.includes(rw.id) })),
    });
  });

  r.post('/rewards/:id/redeem', async (req, res) => {
    const reward = REWARDS.find((rw) => rw.id === req.params.id);
    if (!reward) throw notFound('Reward');
    const user = await deps.store.redeem(uidOf(req), reward, (u) => applyRedeem(u, reward));
    res.json({ balance: user.coins, unlockedRewards: user.unlockedRewards, reward });
  });

  return r;
}
