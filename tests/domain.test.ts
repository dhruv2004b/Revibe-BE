import { describe, expect, it } from 'vitest';
import { addDays, dateKey } from '../src/domain/clock.js';
import { applyRedeem, applyTaskCompletion, nextStreak } from '../src/domain/economy.js';
import type { AssignedTask, MoodEntry, UserProfile } from '../src/domain/types.js';
import { detectCrisis } from '../src/services/crisis.js';
import { parseHfResponse } from '../src/services/huggingface.js';
import { buildInsights } from '../src/services/insights.js';
import { lexiconSentiment } from '../src/services/lexicon.js';
import { moderate } from '../src/services/moderation.js';
import { classify, recommend } from '../src/services/recommender.js';
import { analyzeSentiment } from '../src/services/sentiment.js';

const user = (over: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'u1', displayName: 'A', anonHandle: 'CalmOtter1', coins: 0, streak: 0, bestStreak: 0,
  lastActiveDate: null, coinsEarnedDate: null, coinsEarnedToday: 0, unlockedRewards: [], onboarded: true,
  createdAt: '2026-01-01T00:00:00Z', ...over,
});

const task = (over: Partial<AssignedTask> = {}): AssignedTask => ({
  id: 't1', uid: 'u1', templateId: 'box-breathing', title: 'Box', description: '', category: 'breathing',
  durationMin: 3, reward: 10, date: '2026-11-24', status: 'pending', reason: '', completedAt: null, coinsAwarded: 0, ...over,
});

const mood = (over: Partial<MoodEntry> = {}): MoodEntry => ({
  id: 'm', uid: 'u1', mood: 3, stress: 3, note: '', screenTimeHours: null, tags: [],
  sentiment: { label: 'neutral', score: 0, source: 'none' }, crisis: false, date: '2026-11-24',
  createdAt: '2026-11-24T10:00:00Z', ...over,
});

describe('dates', () => {
  it('uses the app time zone for the day boundary', () => {
    // 20:00 UTC on the 23rd is 01:30 on the 24th in India
    expect(dateKey(new Date('2026-11-23T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-24');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('streaks', () => {
  it('continues from yesterday, holds on the same day, resets after a gap', () => {
    expect(nextStreak('2026-11-23', 4, '2026-11-24')).toBe(5);
    expect(nextStreak('2026-11-24', 5, '2026-11-24')).toBe(5);
    expect(nextStreak('2026-11-20', 9, '2026-11-24')).toBe(1);
    expect(nextStreak(null, 0, '2026-11-24')).toBe(1);
  });
});

describe('task completion', () => {
  it('awards coins and updates the streak', () => {
    const out = applyTaskCompletion(user({ streak: 2, lastActiveDate: '2026-11-23' }), task(), '2026-11-24', 60, 'now');
    expect(out.coinsAwarded).toBe(10);
    expect(out.user.coins).toBe(10);
    expect(out.user.streak).toBe(3);
    expect(out.task.status).toBe('completed');
  });
  it('caps daily earnings', () => {
    const out = applyTaskCompletion(user({ coinsEarnedDate: '2026-11-24', coinsEarnedToday: 55 }), task(), '2026-11-24', 60, 'now');
    expect(out.coinsAwarded).toBe(5);
    expect(out.capped).toBe(true);
  });
  it('resets the cap on a new day', () => {
    const out = applyTaskCompletion(user({ coinsEarnedDate: '2026-11-23', coinsEarnedToday: 60 }), task(), '2026-11-24', 60, 'now');
    expect(out.coinsAwarded).toBe(10);
  });
  it('refuses double completion and old tasks', () => {
    expect(() => applyTaskCompletion(user(), task({ status: 'completed' }), '2026-11-24', 60, 'now')).toThrow(/already/);
    expect(() => applyTaskCompletion(user(), task({ date: '2026-11-23' }), '2026-11-24', 60, 'now')).toThrow(/another day/);
  });
});

describe('redeem', () => {
  const reward = { id: 'r', title: 'R', description: '', kind: 'theme' as const, cost: 50, url: null };
  it('spends coins once', () => {
    const u = applyRedeem(user({ coins: 80 }), reward);
    expect(u.coins).toBe(30);
    expect(() => applyRedeem(u, reward)).toThrow(/already/);
  });
  it('refuses when short', () => {
    expect(() => applyRedeem(user({ coins: 10 }), reward)).toThrow(/Needs 50/);
  });
});

describe('crisis detection', () => {
  it.each(['I want to die', 'thinking about suicide', "I don't want to live anymore", 'I want to end it all', 'mar jana chahta hu', 'everyone is better off without me'])(
    'flags "%s"',
    (t) => expect(detectCrisis(t)).toBe(true),
  );
  it.each(['this exam is killing me lol', 'I am tired', 'had a great day', ''])('does not flag "%s"', (t) => expect(detectCrisis(t)).toBe(false));
});

describe('sentiment', () => {
  it('scores positive, negative and negated text', () => {
    expect(lexiconSentiment('I feel really happy and grateful today').label).toBe('positive');
    expect(lexiconSentiment('so stressed and anxious, exams are awful').label).toBe('negative');
    expect(lexiconSentiment('not happy at all').label).toBe('negative');
    expect(lexiconSentiment('went to class').label).toBe('neutral');
  });
  it('parses both Hugging Face response shapes', () => {
    const nested = [[{ label: 'negative', score: 0.8 }, { label: 'neutral', score: 0.15 }, { label: 'positive', score: 0.05 }]];
    expect(parseHfResponse(nested)).toEqual({ label: 'negative', score: -0.75, source: 'hf' });
    expect(parseHfResponse([{ label: 'LABEL_2', score: 0.9 }])?.label).toBe('positive');
    expect(parseHfResponse({ error: 'loading' })).toBeNull();
  });
  it('falls back to the lexicon when the AI fails', async () => {
    const failing = { analyze: async () => null };
    expect((await analyzeSentiment('very happy', failing)).source).toBe('lexicon');
    const working = { analyze: async () => ({ label: 'positive' as const, score: 0.9, source: 'hf' as const }) };
    expect((await analyzeSentiment('very happy', working)).source).toBe('hf');
    expect((await analyzeSentiment('   ', working)).source).toBe('none');
  });
});

describe('recommender', () => {
  const empty = { completed: {}, assigned: {}, yesterday: [] };
  it('classifies states', () => {
    expect(classify(undefined)).toBe('steady');
    expect(classify(mood({ stress: 5 }))).toBe('struggling');
    expect(classify(mood({ mood: 5, stress: 1 }))).toBe('thriving');
  });
  it('gives calming tasks when stressed', () => {
    const rec = recommend([mood({ stress: 5, mood: 2 })], empty, 'seed');
    expect(rec.state).toBe('struggling');
    expect(rec.picks).toHaveLength(4);
    expect(rec.picks.filter((p) => p.template.intensity === 'calm').length).toBeGreaterThanOrEqual(3);
    expect(rec.picks.some((p) => p.template.intensity === 'energize')).toBe(false);
  });
  it('varies categories when it can', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const cats = recommend([mood({ stress: 5 })], empty, seed).picks.map((p) => p.template.category);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });
  it('is deterministic for the same seed and has no duplicates', () => {
    const a = recommend([], empty, 'u1:2026-11-24').picks.map((p) => p.template.id);
    const b = recommend([], empty, 'u1:2026-11-24').picks.map((p) => p.template.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
  it('adds a digital break for heavy screen time', () => {
    const rec = recommend([mood({ screenTimeHours: 8 })], empty, 's');
    expect(rec.picks.some((p) => p.template.category === 'digital')).toBe(true);
  });
  it('suggests a consultation after a stressful week', () => {
    const week = [1, 2, 3].map((i) => mood({ id: `m${i}`, stress: 5, createdAt: `2026-11-2${i}T10:00:00Z` }));
    expect(recommend(week, empty, 's').suggestConsult).toBe(true);
    expect(recommend([mood()], empty, 's').suggestConsult).toBe(false);
  });
});

describe('moderation', () => {
  it('allows self-talk but blocks insults at others', () => {
    expect(moderate('I feel so stupid after my exam').verdict).toBe('allow');
    expect(moderate('you are stupid').verdict).toBe('block');
  });
  it('blocks contact details', () => {
    expect(moderate('call me 9876543210').verdict).toBe('block');
    expect(moderate('mail me a@b.com').verdict).toBe('block');
    expect(moderate('see https://x.com').verdict).toBe('block');
  });
  it('flags support needs without blocking', () => {
    const r = moderate('I want to die, nothing helps');
    expect(r.verdict).toBe('allow');
    expect(r.supportNeeded).toBe(true);
  });
});

describe('insights', () => {
  it('summarises a window with gaps', () => {
    const moods = [
      mood({ date: '2026-11-18', mood: 2, stress: 4, tags: ['exam'] }),
      mood({ date: '2026-11-20', mood: 2, stress: 4, tags: ['exam'] }),
      mood({ date: '2026-11-22', mood: 4, stress: 2, tags: ['gym'] }),
      mood({ date: '2026-11-24', mood: 5, stress: 1, tags: ['gym'] }),
    ];
    const ins = buildInsights(moods, '2026-11-24', 7);
    expect(ins.days).toHaveLength(7);
    expect(ins.days[1]!.mood).toBeNull();
    expect(ins.moodTrend).toBe('up');
    expect(ins.bestDay).toBe('2026-11-24');
    expect(ins.summary).toMatch(/gym/);
  });
});
