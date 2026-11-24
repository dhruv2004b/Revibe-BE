import { addDays } from '../domain/clock.js';
import type { DateKey, MoodEntry } from '../domain/types.js';

export interface DayPoint {
  date: DateKey;
  mood: number | null;
  stress: number | null;
}

export interface Insights {
  days: DayPoint[];
  checkIns: number;
  avgMood: number | null;
  avgStress: number | null;
  /** Mood change between the first and second half of the window */
  moodTrend: 'up' | 'down' | 'flat' | null;
  bestDay: DateKey | null;
  toughestDay: DateKey | null;
  topTags: { tag: string; avgMood: number; count: number }[];
  summary: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Plain statistics over the user's check-ins; no AI needed. */
export function buildInsights(moods: MoodEntry[], today: DateKey, windowDays: number): Insights {
  const start = addDays(today, -(windowDays - 1));
  const inWindow = moods.filter((m) => m.date >= start && m.date <= today);

  const byDay = new Map<DateKey, MoodEntry[]>();
  for (const m of inWindow) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);

  const days: DayPoint[] = [];
  for (let i = 0; i < windowDays; i++) {
    const date = addDays(start, i);
    const entries = byDay.get(date) ?? [];
    const mood = avg(entries.map((e) => e.mood));
    const stress = avg(entries.map((e) => e.stress));
    days.push({ date, mood: mood === null ? null : round1(mood), stress: stress === null ? null : round1(stress) });
  }

  const logged = days.filter((d) => d.mood !== null) as (DayPoint & { mood: number; stress: number })[];
  const avgMood = avg(logged.map((d) => d.mood));
  const avgStress = avg(logged.map((d) => d.stress));

  let moodTrend: Insights['moodTrend'] = null;
  if (logged.length >= 4) {
    const half = Math.floor(logged.length / 2);
    const diff = (avg(logged.slice(half).map((d) => d.mood)) ?? 0) - (avg(logged.slice(0, half).map((d) => d.mood)) ?? 0);
    moodTrend = diff > 0.3 ? 'up' : diff < -0.3 ? 'down' : 'flat';
  }

  const best = [...logged].sort((a, b) => b.mood - a.mood || a.stress - b.stress)[0];
  const toughest = [...logged].sort((a, b) => a.mood - b.mood || b.stress - a.stress)[0];

  const tagMap = new Map<string, number[]>();
  for (const m of inWindow) for (const t of m.tags) tagMap.set(t, [...(tagMap.get(t) ?? []), m.mood]);
  const topTags = [...tagMap.entries()]
    .map(([tag, ms]) => ({ tag, avgMood: round1(avg(ms) ?? 0), count: ms.length }))
    .sort((a, b) => b.count - a.count || b.avgMood - a.avgMood)
    .slice(0, 5);

  return {
    days,
    checkIns: inWindow.length,
    avgMood: avgMood === null ? null : round1(avgMood),
    avgStress: avgStress === null ? null : round1(avgStress),
    moodTrend,
    bestDay: best?.date ?? null,
    toughestDay: toughest?.date ?? null,
    topTags,
    summary: summarize(inWindow.length, moodTrend, avgStress, topTags),
  };
}

function summarize(count: number, trend: Insights['moodTrend'], avgStress: number | null, tags: Insights['topTags']): string {
  if (count === 0) return 'Check in for a few days and your patterns will show up here.';
  if (count < 3) return 'Nice start. A few more check-ins and we can spot your patterns.';
  const parts: string[] = [];
  if (trend === 'up') parts.push('Your mood has been improving.');
  else if (trend === 'down') parts.push('Your mood has dipped lately. Be gentle with yourself.');
  else parts.push('Your mood has been fairly steady.');
  if (avgStress !== null && avgStress >= 3.5) parts.push('Stress has been high, so calming tasks will come first.');
  const lift = [...tags].filter((t) => t.count >= 2).sort((a, b) => b.avgMood - a.avgMood)[0];
  if (lift && lift.avgMood >= 3.5) parts.push(`Days tagged "${lift.tag}" tend to feel better.`);
  return parts.join(' ');
}
