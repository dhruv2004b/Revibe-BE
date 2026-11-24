import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { HELPLINES } from '../../domain/catalog.js';
import { addDays, dateKey, now } from '../../domain/clock.js';
import type { MoodEntry } from '../../domain/types.js';
import { detectCrisis } from '../../services/crisis.js';
import { buildInsights } from '../../services/insights.js';
import { analyzeSentiment } from '../../services/sentiment.js';
import { uidOf } from '../auth.js';
import type { Deps } from '../deps.js';
import { parse } from '../errors.js';

const NewMood = z
  .object({
    mood: z.number().int().min(1).max(5),
    stress: z.number().int().min(1).max(5),
    note: z.string().max(2000).default(''),
    screenTimeHours: z.number().min(0).max(24).nullable().default(null),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(24)).max(8).default([]),
  })
  .strict();

const Days = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

function replyFor(entry: MoodEntry): string {
  if (entry.crisis) return 'It sounds like you are going through a lot right now. You do not have to face it alone: please reach out to one of these helplines.';
  if (entry.stress >= 4 || entry.mood <= 2) return 'Thanks for checking in. Today looks heavy, so your tasks will focus on slowing down.';
  if (entry.mood >= 4 && entry.stress <= 2) return 'Love that energy. Your tasks today will help you use it well.';
  return 'Thanks for checking in. Small steps count.';
}

export function moodRoutes(deps: Deps): Router {
  const r = Router();

  r.post('/moods', async (req, res) => {
    const input = parse(NewMood, req.body);
    const uid = uidOf(req);
    const ts = now();
    // Crisis check is local and first: helplines must never wait on the AI.
    const crisis = detectCrisis(input.note);
    const sentiment = crisis
      ? { label: 'negative' as const, score: -1, source: 'lexicon' as const }
      : await analyzeSentiment(input.note, deps.sentiment);

    const entry: MoodEntry = {
      id: randomUUID(),
      uid,
      ...input,
      sentiment,
      crisis,
      date: dateKey(ts, deps.timeZone),
      createdAt: ts.toISOString(),
    };
    // First check-in of the day: if tasks were picked before it and none is
    // started yet, drop them so the next request picks for this mood.
    const earlier = await deps.store.listMoodsSince(uid, entry.date);
    if (!earlier.some((m) => m.date === entry.date)) await deps.store.clearUntouchedTasks(uid, entry.date);
    await deps.store.addMood(entry);
    res.status(201).json({ entry, crisis, helplines: crisis ? HELPLINES : [], message: replyFor(entry) });
  });

  r.get('/moods', async (req, res) => {
    const { days } = parse(Days, req.query);
    const today = dateKey(now(), deps.timeZone);
    const moods = await deps.store.listMoodsSince(uidOf(req), addDays(today, -(days - 1)));
    res.json({ moods });
  });

  r.get('/insights', async (req, res) => {
    const { days } = parse(Days, req.query);
    const today = dateKey(now(), deps.timeZone);
    const moods = await deps.store.listMoodsSince(uidOf(req), addDays(today, -(days - 1)));
    res.json(buildInsights(moods, today, days));
  });

  return r;
}
