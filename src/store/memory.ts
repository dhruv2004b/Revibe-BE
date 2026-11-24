import { randomUUID } from 'node:crypto';
import type { CompletionOutcome } from '../domain/economy.js';
import { conflict, notFound } from '../domain/errors.js';
import type {
  AssignedTask,
  Booking,
  CoinTransaction,
  Comment,
  DateKey,
  MoodEntry,
  Post,
  Reward,
  UserProfile,
} from '../domain/types.js';
import { now } from '../domain/clock.js';
import type { PostPage, Store } from './store.js';

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-process store for local development and tests. Every method does its
 * read-modify-write without awaiting in between, so each is atomic.
 */
export class MemoryStore implements Store {
  private users = new Map<string, UserProfile>();
  private moods: MoodEntry[] = [];
  private tasks = new Map<string, AssignedTask>();
  private txns: CoinTransaction[] = [];
  private posts = new Map<string, Post>();
  private likes = new Map<string, Set<string>>();
  private reports = new Map<string, Set<string>>();
  private comments: Comment[] = [];
  private bookings: Booking[] = [];

  async getUser(uid: string) {
    const u = this.users.get(uid);
    return u ? clone(u) : null;
  }

  async ensureUser(initial: UserProfile) {
    if (!this.users.has(initial.uid)) this.users.set(initial.uid, clone(initial));
    return clone(this.users.get(initial.uid)!);
  }

  async updateUser(uid: string, patch: Partial<Pick<UserProfile, 'displayName' | 'onboarded'>>) {
    const u = this.users.get(uid);
    if (!u) throw notFound('User');
    Object.assign(u, patch);
    return clone(u);
  }

  async deleteUserData(uid: string) {
    this.users.delete(uid);
    this.moods = this.moods.filter((m) => m.uid !== uid);
    for (const [id, t] of this.tasks) if (t.uid === uid) this.tasks.delete(id);
    this.txns = this.txns.filter((t) => t.uid !== uid);
    this.bookings = this.bookings.filter((b) => b.uid !== uid);
    for (const [id, p] of this.posts) {
      if (p.uid === uid) {
        this.posts.delete(id);
        this.likes.delete(id);
        this.reports.delete(id);
        this.comments = this.comments.filter((c) => c.postId !== id);
      }
    }
    for (const c of this.comments.filter((c) => c.uid === uid)) {
      const p = this.posts.get(c.postId);
      if (p) p.commentCount = Math.max(0, p.commentCount - 1);
    }
    this.comments = this.comments.filter((c) => c.uid !== uid);
    for (const [postId, set] of this.likes) {
      if (set.delete(uid)) {
        const p = this.posts.get(postId);
        if (p) p.likeCount = Math.max(0, p.likeCount - 1);
      }
    }
  }

  async addMood(entry: MoodEntry) {
    this.moods.push(clone(entry));
  }

  async listMoodsSince(uid: string, since: DateKey) {
    return clone(this.moods.filter((m) => m.uid === uid && m.date >= since).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async assignTasksIfAbsent(uid: string, date: DateKey, tasks: AssignedTask[]) {
    const existing = [...this.tasks.values()].filter((t) => t.uid === uid && t.date === date);
    if (existing.length > 0) return clone(existing);
    for (const t of tasks) this.tasks.set(t.id, clone(t));
    return clone(tasks);
  }

  async listTasksForDate(uid: string, date: DateKey) {
    return clone([...this.tasks.values()].filter((t) => t.uid === uid && t.date === date));
  }

  async clearUntouchedTasks(uid: string, date: DateKey) {
    const day = [...this.tasks.values()].filter((t) => t.uid === uid && t.date === date);
    if (day.length === 0 || day.some((t) => t.status !== 'pending')) return;
    for (const t of day) this.tasks.delete(t.id);
  }

  async listTasksSince(uid: string, since: DateKey) {
    return clone([...this.tasks.values()].filter((t) => t.uid === uid && t.date >= since));
  }

  async completeTask(uid: string, taskId: string, apply: (user: UserProfile, task: AssignedTask) => CompletionOutcome) {
    const user = this.users.get(uid);
    const task = this.tasks.get(taskId);
    if (!user) throw notFound('User');
    if (!task || task.uid !== uid) throw notFound('Task');
    const outcome = apply(clone(user), clone(task));
    this.users.set(uid, clone(outcome.user));
    this.tasks.set(taskId, clone(outcome.task));
    if (outcome.coinsAwarded > 0) {
      this.txns.push({ id: randomUUID(), uid, amount: outcome.coinsAwarded, kind: 'task', refId: taskId, note: task.title, createdAt: outcome.task.completedAt ?? now().toISOString() });
    }
    return clone(outcome);
  }

  async skipTask(uid: string, taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || task.uid !== uid) throw notFound('Task');
    if (task.status === 'completed') throw conflict('already_completed', 'Task already completed');
    task.status = 'skipped';
    return clone(task);
  }

  async listTransactions(uid: string, limit: number) {
    return clone(this.txns.filter((t) => t.uid === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit));
  }

  async redeem(uid: string, reward: Reward, apply: (user: UserProfile) => UserProfile) {
    const user = this.users.get(uid);
    if (!user) throw notFound('User');
    const updated = apply(clone(user));
    this.users.set(uid, clone(updated));
    this.txns.push({ id: randomUUID(), uid, amount: -reward.cost, kind: 'redeem', refId: reward.id, note: reward.title, createdAt: now().toISOString() });
    return clone(updated);
  }

  async createPost(post: Post) {
    this.posts.set(post.id, clone(post));
  }

  async getPost(id: string) {
    const p = this.posts.get(id);
    return p ? clone(p) : null;
  }

  async listPosts(limit: number, before: string | null): Promise<PostPage> {
    const visible = [...this.posts.values()]
      .filter((p) => p.status === 'visible' && (!before || p.createdAt < before))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = visible.slice(0, limit);
    return { posts: clone(page), nextBefore: visible.length > limit ? page[page.length - 1]!.createdAt : null };
  }

  async likedBy(uid: string, postIds: string[]) {
    return new Set(postIds.filter((id) => this.likes.get(id)?.has(uid)));
  }

  async toggleLike(postId: string, uid: string) {
    const post = this.posts.get(postId);
    if (!post || post.status !== 'visible') throw notFound('Post');
    const set = this.likes.get(postId) ?? new Set<string>();
    this.likes.set(postId, set);
    const liked = !set.has(uid);
    if (liked) set.add(uid);
    else set.delete(uid);
    post.likeCount = set.size;
    return { liked, likeCount: post.likeCount };
  }

  async reportPost(postId: string, uid: string, hideAt: number) {
    const post = this.posts.get(postId);
    if (!post) throw notFound('Post');
    const set = this.reports.get(postId) ?? new Set<string>();
    this.reports.set(postId, set);
    set.add(uid);
    post.reportCount = set.size;
    if (post.reportCount >= hideAt && post.status === 'visible') post.status = 'hidden';
    return clone(post);
  }

  async addComment(comment: Comment) {
    const post = this.posts.get(comment.postId);
    if (!post || post.status !== 'visible') throw notFound('Post');
    this.comments.push(clone(comment));
    post.commentCount += 1;
  }

  async listComments(postId: string) {
    return clone(this.comments.filter((c) => c.postId === postId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async createBooking(booking: Booking) {
    const taken = this.bookings.some((b) => b.consultantId === booking.consultantId && b.slot === booking.slot && b.status !== 'cancelled');
    if (taken) throw conflict('slot_taken', 'That slot was just booked. Please pick another.');
    this.bookings.push(clone(booking));
  }

  async listBookings(uid: string) {
    return clone(this.bookings.filter((b) => b.uid === uid).sort((a, b) => a.slot.localeCompare(b.slot)));
  }
}
