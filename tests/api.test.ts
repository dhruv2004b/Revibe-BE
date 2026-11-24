import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { setClock } from '../src/domain/clock.js';
import { mockVerifier } from '../src/http/auth.js';
import { MemoryStore } from '../src/store/memory.js';

let clock = new Date('2026-11-24T06:00:00Z'); // 11:30 IST

function makeApp(cap = 60) {
  return createApp({
    store: new MemoryStore(),
    verify: mockVerifier,
    sentiment: null,
    timeZone: 'Asia/Kolkata',
    dailyCoinCap: cap,
    corsOrigins: ['*'],
    rateLimit: false,
  });
}

const as = (uid: string) => ({ Authorization: `Bearer dev:${uid}` });

beforeEach(() => {
  clock = new Date('2026-11-24T06:00:00Z');
  setClock(() => clock);
});
afterEach(() => setClock(null));

describe('public routes', () => {
  it('health and helplines work without auth', async () => {
    const app = makeApp();
    expect((await request(app).get('/health')).body.ok).toBe(true);
    const h = await request(app).get('/helplines');
    expect(h.body.helplines.some((x: { phone: string }) => x.phone === '14416')).toBe(true);
  });
  it('rejects missing or bad tokens', async () => {
    const app = makeApp();
    expect((await request(app).get('/v1/me')).status).toBe(401);
    expect((await request(app).get('/v1/me').set({ Authorization: 'Bearer nope' })).status).toBe(401);
  });
  it('returns JSON 404s', async () => {
    const res = await request(makeApp()).get('/v1/nope').set(as('a'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('route_not_found');
  });
});

describe('profile', () => {
  it('creates once, updates, deletes', async () => {
    const app = makeApp();
    const first = await request(app).get('/v1/me').set(as('alice'));
    expect(first.body.user.coins).toBe(0);
    expect(first.body.today).toBe('2026-11-24');
    const again = await request(app).get('/v1/me').set(as('alice'));
    expect(again.body.user.anonHandle).toBe(first.body.user.anonHandle);

    const patched = await request(app).patch('/v1/me').set(as('alice')).send({ displayName: 'Alice', onboarded: true });
    expect(patched.body.user.displayName).toBe('Alice');
    expect((await request(app).patch('/v1/me').set(as('alice')).send({ coins: 9999 })).status).toBe(400);

    expect((await request(app).delete('/v1/me').set(as('alice'))).status).toBe(204);
    const fresh = await request(app).get('/v1/me').set(as('alice'));
    expect(fresh.body.user.onboarded).toBe(false);
  });
});

describe('moods', () => {
  it('saves a check-in with sentiment', async () => {
    const app = makeApp();
    const res = await request(app).post('/v1/moods').set(as('a')).send({ mood: 2, stress: 5, note: 'so stressed about exams', tags: ['Exam'] });
    expect(res.status).toBe(201);
    expect(res.body.entry.sentiment.label).toBe('negative');
    expect(res.body.entry.tags).toEqual(['exam']);
    expect(res.body.crisis).toBe(false);
    const list = await request(app).get('/v1/moods?days=7').set(as('a'));
    expect(list.body.moods).toHaveLength(1);
  });
  it('returns helplines for crisis text', async () => {
    const res = await request(makeApp()).post('/v1/moods').set(as('a')).send({ mood: 1, stress: 5, note: 'I want to end my life' });
    expect(res.body.crisis).toBe(true);
    expect(res.body.helplines.length).toBeGreaterThan(0);
  });
  it('validates input', async () => {
    const res = await request(makeApp()).post('/v1/moods').set(as('a')).send({ mood: 9, stress: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/mood/);
  });
  it('builds insights', async () => {
    const app = makeApp();
    await request(app).post('/v1/moods').set(as('a')).send({ mood: 4, stress: 2 });
    const res = await request(app).get('/v1/insights?days=7').set(as('a'));
    expect(res.body.days).toHaveLength(7);
    expect(res.body.checkIns).toBe(1);
  });
  it('keeps users apart', async () => {
    const app = makeApp();
    await request(app).post('/v1/moods').set(as('a')).send({ mood: 4, stress: 2 });
    expect((await request(app).get('/v1/moods').set(as('b'))).body.moods).toHaveLength(0);
  });
});

describe('tasks and coins', () => {
  it('assigns tasks once per day, awards coins, blocks double claims', async () => {
    const app = makeApp();
    await request(app).get('/v1/me').set(as('a'));
    await request(app).post('/v1/moods').set(as('a')).send({ mood: 2, stress: 5 });

    const t1 = await request(app).get('/v1/tasks/today').set(as('a'));
    expect(t1.body.state).toBe('struggling');
    expect(t1.body.tasks).toHaveLength(4);
    const t2 = await request(app).get('/v1/tasks/today').set(as('a'));
    expect(t2.body.tasks.map((t: { id: string }) => t.id)).toEqual(t1.body.tasks.map((t: { id: string }) => t.id));

    const task = t1.body.tasks[0];
    const done = await request(app).post(`/v1/tasks/${task.id}/complete`).set(as('a'));
    expect(done.body.coinsAwarded).toBe(task.reward);
    expect(done.body.streak).toBe(1);
    expect((await request(app).post(`/v1/tasks/${task.id}/complete`).set(as('a'))).status).toBe(409);

    const coins = await request(app).get('/v1/coins').set(as('a'));
    expect(coins.body.balance).toBe(task.reward);
    expect(coins.body.transactions).toHaveLength(1);
  });

  it('re-picks untouched tasks after the first check-in of the day', async () => {
    const app = makeApp();
    await request(app).get('/v1/me').set(as('a'));
    const before = await request(app).get('/v1/tasks/today').set(as('a'));
    expect(before.body.state).toBe('steady');
    await request(app).post('/v1/moods').set(as('a')).send({ mood: 1, stress: 5 });
    const after = await request(app).get('/v1/tasks/today').set(as('a'));
    expect(after.body.state).toBe('struggling');
    expect(after.body.tasks.filter((t: { templateId: string }) => ['pomodoro-1', 'pomodoro-2', 'brisk-walk', 'learn-15', 'social-detox', 'hard-thing-first', 'plan-tomorrow'].includes(t.templateId))).toHaveLength(0);

    // once a task is done, a second check-in keeps the set
    await request(app).post(`/v1/tasks/${after.body.tasks[0].id}/complete`).set(as('a'));
    await request(app).post('/v1/moods').set(as('a')).send({ mood: 5, stress: 1 });
    const again = await request(app).get('/v1/tasks/today').set(as('a'));
    expect(again.body.tasks.map((t: { id: string }) => t.id)).toEqual(after.body.tasks.map((t: { id: string }) => t.id));
  });

  it('does not let another user complete my task', async () => {
    const app = makeApp();
    await request(app).get('/v1/me').set(as('a'));
    await request(app).get('/v1/me').set(as('b'));
    const t = await request(app).get('/v1/tasks/today').set(as('a'));
    expect((await request(app).post(`/v1/tasks/${t.body.tasks[0].id}/complete`).set(as('b'))).status).toBe(404);
  });

  it('enforces the daily cap and grows the streak across days', async () => {
    const app = makeApp(15);
    await request(app).get('/v1/me').set(as('a'));
    const t = await request(app).get('/v1/tasks/today').set(as('a'));
    let total = 0;
    for (const task of t.body.tasks) total += (await request(app).post(`/v1/tasks/${task.id}/complete`).set(as('a'))).body.coinsAwarded;
    expect(total).toBe(15);

    clock = new Date('2026-11-25T06:00:00Z');
    const next = await request(app).get('/v1/tasks/today').set(as('a'));
    expect(next.body.date).toBe('2026-11-25');
    const done = await request(app).post(`/v1/tasks/${next.body.tasks[0].id}/complete`).set(as('a'));
    expect(done.body.streak).toBe(2);
    // yesterday's task can no longer be claimed
    expect((await request(app).post(`/v1/tasks/${t.body.tasks[0].id}/complete`).set(as('a'))).status).toBe(409);
  });

  it('skips a task', async () => {
    const app = makeApp();
    await request(app).get('/v1/me').set(as('a'));
    const t = await request(app).get('/v1/tasks/today').set(as('a'));
    const res = await request(app).post(`/v1/tasks/${t.body.tasks[1].id}/skip`).set(as('a'));
    expect(res.body.task.status).toBe('skipped');
  });
});

describe('rewards', () => {
  it('redeems when affordable', async () => {
    const app = makeApp(1000);
    await request(app).get('/v1/me').set(as('a'));
    expect((await request(app).post('/v1/rewards/theme-ocean/redeem').set(as('a'))).body.error.code).toBe('insufficient_coins');

    // earn enough over a few days
    for (let d = 24; d <= 30; d++) {
      clock = new Date(`2026-11-${d}T06:00:00Z`);
      const t = await request(app).get('/v1/tasks/today').set(as('a'));
      for (const task of t.body.tasks) await request(app).post(`/v1/tasks/${task.id}/complete`).set(as('a'));
    }
    const res = await request(app).post('/v1/rewards/theme-ocean/redeem').set(as('a'));
    expect(res.status).toBe(200);
    expect(res.body.unlockedRewards).toContain('theme-ocean');
    const list = await request(app).get('/v1/rewards').set(as('a'));
    expect(list.body.rewards.find((r: { id: string }) => r.id === 'theme-ocean').owned).toBe(true);
    expect((await request(app).post('/v1/rewards/theme-ocean/redeem').set(as('a'))).status).toBe(409);
    expect((await request(app).post('/v1/rewards/nope/redeem').set(as('a'))).status).toBe(404);
  });
});

describe('community', () => {
  it('posts anonymously, likes, comments, hides after reports', async () => {
    const app = makeApp();
    for (const u of ['a', 'b', 'c', 'd']) await request(app).get('/v1/me').set(as(u));

    const created = await request(app).post('/v1/community/posts').set(as('a')).send({ text: 'Exams are tough this week', topic: 'study' });
    expect(created.status).toBe(201);
    expect(created.body.post.uid).toBeUndefined();
    expect(created.body.post.mine).toBe(true);
    const id = created.body.post.id;

    const feed = await request(app).get('/v1/community/posts').set(as('b'));
    expect(feed.body.posts[0].mine).toBe(false);
    expect(JSON.stringify(feed.body)).not.toContain('"a"');

    expect((await request(app).post(`/v1/community/posts/${id}/like`).set(as('b'))).body).toEqual({ liked: true, likeCount: 1 });
    expect((await request(app).post(`/v1/community/posts/${id}/like`).set(as('b'))).body).toEqual({ liked: false, likeCount: 0 });

    await request(app).post(`/v1/community/posts/${id}/comments`).set(as('b')).send({ text: 'You got this' });
    const comments = await request(app).get(`/v1/community/posts/${id}/comments`).set(as('a'));
    expect(comments.body.comments).toHaveLength(1);
    expect(comments.body.comments[0].uid).toBeUndefined();

    for (const u of ['b', 'b', 'c']) await request(app).post(`/v1/community/posts/${id}/report`).set(as(u));
    expect((await request(app).get('/v1/community/posts').set(as('a'))).body.posts).toHaveLength(1);
    const last = await request(app).post(`/v1/community/posts/${id}/report`).set(as('d'));
    expect(last.body.hidden).toBe(true);
    expect((await request(app).get('/v1/community/posts').set(as('a'))).body.posts).toHaveLength(0);
  });

  it('blocks abuse and contact details, supports at-risk authors', async () => {
    const app = makeApp();
    await request(app).get('/v1/me').set(as('a'));
    const abuse = await request(app).post('/v1/community/posts').set(as('a')).send({ text: 'you are stupid' });
    expect(abuse.status).toBe(422);
    const phone = await request(app).post('/v1/community/posts').set(as('a')).send({ text: 'dm me 9876543210' });
    expect(phone.status).toBe(422);
    const risk = await request(app).post('/v1/community/posts').set(as('a')).send({ text: 'I want to die, nothing helps' });
    expect(risk.status).toBe(201);
    expect(risk.body.supportNeeded).toBe(true);
    expect(risk.body.helplines.length).toBeGreaterThan(0);
  });

  it('paginates', async () => {
    const app = makeApp();
    await request(app).get('/v1/me').set(as('a'));
    for (let i = 0; i < 5; i++) {
      clock = new Date(Date.UTC(2026, 10, 24, 6, i));
      await request(app).post('/v1/community/posts').set(as('a')).send({ text: `post number ${i}` });
    }
    const p1 = await request(app).get('/v1/community/posts?limit=3').set(as('a'));
    expect(p1.body.posts).toHaveLength(3);
    const p2 = await request(app).get(`/v1/community/posts?limit=3&before=${encodeURIComponent(p1.body.nextBefore)}`).set(as('a'));
    expect(p2.body.posts).toHaveLength(2);
    expect(p2.body.nextBefore).toBeNull();
  });
});

describe('consultations', () => {
  it('books a free slot once', async () => {
    const app = makeApp();
    const list = await request(app).get('/v1/consultants').set(as('a'));
    const c = list.body.consultants[0];
    const slot = c.slots[0];
    const ok = await request(app).post('/v1/bookings').set(as('a')).send({ consultantId: c.id, slot });
    expect(ok.status).toBe(201);
    expect((await request(app).post('/v1/bookings').set(as('b')).send({ consultantId: c.id, slot })).status).toBe(409);
    expect((await request(app).post('/v1/bookings').set(as('a')).send({ consultantId: c.id, slot: '2020-01-01T10:00:00+05:30' })).status).toBe(400);
    expect((await request(app).get('/v1/bookings').set(as('a'))).body.bookings).toHaveLength(1);
  });
});
