import { TASKS } from '../domain/catalog.js';
import type { MoodEntry, TaskIntensity, TaskTemplate } from '../domain/types.js';

export type WellbeingState = 'struggling' | 'steady' | 'thriving';

export interface TaskHistoryStats {
  /** templateId -> times completed in the window */
  completed: Record<string, number>;
  /** templateId -> times assigned in the window */
  assigned: Record<string, number>;
  /** templateIds given yesterday, to avoid repeats */
  yesterday: string[];
}

export interface Recommendation {
  state: WellbeingState;
  picks: { template: TaskTemplate; reason: string }[];
  suggestConsult: boolean;
}

/** Map the latest check-in to a state. No check-in yet means steady. */
export function classify(latest: MoodEntry | undefined): WellbeingState {
  if (!latest) return 'steady';
  if (latest.stress >= 4 || latest.mood <= 2 || latest.sentiment.score <= -0.4) return 'struggling';
  if (latest.stress <= 2 && latest.mood >= 4) return 'thriving';
  return 'steady';
}

/** How many tasks of each intensity to give per state. */
const MIX: Record<WellbeingState, [TaskIntensity, number][]> = {
  struggling: [['calm', 3], ['balanced', 1]],
  steady: [['balanced', 2], ['calm', 1], ['energize', 1]],
  thriving: [['energize', 2], ['balanced', 2]],
};

const REASONS: Record<TaskIntensity, Record<WellbeingState, string>> = {
  calm: {
    struggling: 'Your stress looks high today, so this one helps you slow down.',
    steady: 'A short reset to keep your day balanced.',
    thriving: 'A small calm moment to protect your good day.',
  },
  balanced: {
    struggling: 'A gentle step that is easy to finish.',
    steady: 'Builds a steady habit without draining you.',
    thriving: 'Keeps your momentum going.',
  },
  energize: {
    struggling: 'Only when you feel ready.',
    steady: 'A small push toward your goals.',
    thriving: 'You are in a good place, a great time for focused work.',
  },
};

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Rule-based recommender with a feedback loop: tasks the user tends to
 * finish rank higher, repeats from yesterday rank lower. Deterministic
 * for a given user and day so re-requests return the same set.
 */
export function recommend(
  recentMoods: MoodEntry[],
  history: TaskHistoryStats,
  seed: string,
  count = 4,
): Recommendation {
  const sorted = [...recentMoods].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0];
  const state = classify(latest);
  const rand = seededRandom(seed);

  const score = (t: TaskTemplate): number => {
    const assigned = history.assigned[t.id] ?? 0;
    const completed = history.completed[t.id] ?? 0;
    const completionRate = assigned > 0 ? completed / assigned : 0.5;
    const repeatPenalty = history.yesterday.includes(t.id) ? 0.6 : 0;
    return rand() + 0.8 * completionRate - repeatPenalty;
  };

  const chosen: { template: TaskTemplate; reason: string }[] = [];
  const used = new Set<string>();
  const scores = new Map(TASKS.map((t) => [t.id, score(t)]));
  const take = (intensity: TaskIntensity, n: number) => {
    for (let i = 0; i < n; i++) {
      // Re-rank each pick so a category already chosen is less likely to repeat.
      const usedCategories = new Set(chosen.map((c) => c.template.category));
      const best = TASKS.filter((t) => t.intensity === intensity && !used.has(t.id))
        .map((t) => ({ t, s: scores.get(t.id)! - (usedCategories.has(t.category) ? 1 : 0) }))
        .sort((a, b) => b.s - a.s)[0];
      if (!best) return;
      used.add(best.t.id);
      chosen.push({ template: best.t, reason: REASONS[intensity][state] });
    }
  };
  for (const [intensity, n] of MIX[state]) take(intensity, n);

  // Heavy screen time: make sure one digital-wellness task is in the set.
  if (latest?.screenTimeHours != null && latest.screenTimeHours >= 5 && !chosen.some((c) => c.template.category === 'digital')) {
    const digital = TASKS.filter((t) => t.category === 'digital' && !used.has(t.id) && (state !== 'struggling' || t.intensity !== 'energize'))
      .sort((a, b) => score(b) - score(a))[0];
    if (digital) {
      chosen[chosen.length - 1] = {
        template: digital,
        reason: `You logged ${latest.screenTimeHours}h of screen time, so here is a small digital break.`,
      };
    }
  }

  const week = sorted.slice(0, 7);
  const avgStress = week.length ? week.reduce((s, m) => s + m.stress, 0) / week.length : 0;
  const suggestConsult = week.some((m) => m.crisis) || (week.length >= 3 && avgStress >= 4);

  return { state, picks: chosen.slice(0, count), suggestConsult };
}
