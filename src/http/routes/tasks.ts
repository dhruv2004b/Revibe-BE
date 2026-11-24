import { Router } from 'express';
import { addDays, dateKey, now } from '../../domain/clock.js';
import { applyTaskCompletion } from '../../domain/economy.js';
import type { AssignedTask } from '../../domain/types.js';
import { recommend, type TaskHistoryStats } from '../../services/recommender.js';
import { uidOf } from '../auth.js';
import type { Deps } from '../deps.js';

function historyStats(tasks: AssignedTask[], yesterday: string): TaskHistoryStats {
  const stats: TaskHistoryStats = { completed: {}, assigned: {}, yesterday: [] };
  for (const t of tasks) {
    stats.assigned[t.templateId] = (stats.assigned[t.templateId] ?? 0) + 1;
    if (t.status === 'completed') stats.completed[t.templateId] = (stats.completed[t.templateId] ?? 0) + 1;
    if (t.date === yesterday) stats.yesterday.push(t.templateId);
  }
  return stats;
}

export function taskRoutes(deps: Deps): Router {
  const r = Router();

  /**
   * Today's tasks. Picked once per day from the latest check-in and the
   * user's completion history; later calls return the same set.
   */
  r.get('/tasks/today', async (req, res) => {
    const uid = uidOf(req);
    const today = dateKey(now(), deps.timeZone);
    const [moods, history] = await Promise.all([
      deps.store.listMoodsSince(uid, addDays(today, -6)),
      deps.store.listTasksSince(uid, addDays(today, -14)),
    ]);
    const rec = recommend(moods, historyStats(history.filter((t) => t.date !== today), addDays(today, -1)), `${uid}:${today}`);

    const fresh: AssignedTask[] = rec.picks.map(({ template, reason }) => ({
      id: `${today}_${template.id}`,
      uid,
      templateId: template.id,
      title: template.title,
      description: template.description,
      category: template.category,
      durationMin: template.durationMin,
      reward: template.reward,
      date: today,
      status: 'pending',
      reason,
      completedAt: null,
      coinsAwarded: 0,
    }));
    const tasks = await deps.store.assignTasksIfAbsent(uid, today, fresh);
    const hasCheckIn = moods.some((m) => m.date === today);
    res.json({ date: today, state: rec.state, suggestConsult: rec.suggestConsult, hasCheckIn, tasks });
  });

  r.post('/tasks/:id/complete', async (req, res) => {
    const uid = uidOf(req);
    const ts = now();
    const today = dateKey(ts, deps.timeZone);
    const outcome = await deps.store.completeTask(uid, req.params.id, (user, task) =>
      applyTaskCompletion(user, task, today, deps.dailyCoinCap, ts.toISOString()),
    );
    res.json({
      task: outcome.task,
      coinsAwarded: outcome.coinsAwarded,
      capped: outcome.capped,
      balance: outcome.user.coins,
      streak: outcome.user.streak,
    });
  });

  r.post('/tasks/:id/skip', async (req, res) => {
    const task = await deps.store.skipTask(uidOf(req), req.params.id);
    res.json({ task });
  });

  return r;
}
