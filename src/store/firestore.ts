import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { CompletionOutcome } from '../domain/economy.js';
import { conflict, notFound } from '../domain/errors.js';
import { now } from '../domain/clock.js';
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
import type { PostPage, Store } from './store.js';

/**
 * Layout:
 *   users/{uid}                     profile, coins, streak
 *   users/{uid}/moods/{id}
 *   users/{uid}/tasks/{date_templateId}
 *   users/{uid}/transactions/{id}
 *   posts/{id}  + likes/{uid}, reports/{uid}, comments/{id}
 *   bookings/{consultantId_slot}    id makes double-booking impossible
 *
 * Clients never write users/, tasks/ or transactions/ (see firestore.rules):
 * only this server, through the Admin SDK, changes coins.
 */
export class FirestoreStore implements Store {
  constructor(private readonly db: Firestore) {}

  private user(uid: string) {
    return this.db.collection('users').doc(uid);
  }

  async getUser(uid: string) {
    const snap = await this.user(uid).get();
    return snap.exists ? (snap.data() as UserProfile) : null;
  }

  async ensureUser(initial: UserProfile) {
    const ref = this.user(initial.uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as UserProfile;
      tx.set(ref, initial);
      return initial;
    });
  }

  async updateUser(uid: string, patch: Partial<Pick<UserProfile, 'displayName' | 'onboarded'>>) {
    const ref = this.user(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound('User');
      const updated = { ...(snap.data() as UserProfile), ...patch };
      tx.set(ref, updated);
      return updated;
    });
  }

  async deleteUserData(uid: string) {
    // Comments elsewhere: decrement counts and delete.
    const myComments = await this.db.collectionGroup('comments').where('uid', '==', uid).get();
    for (const c of myComments.docs) {
      const postRef = c.ref.parent.parent;
      await this.db.runTransaction(async (tx) => {
        if (postRef) {
          const p = await tx.get(postRef);
          if (p.exists) tx.update(postRef, { commentCount: Math.max(0, (p.get('commentCount') as number) - 1) });
        }
        tx.delete(c.ref);
      });
    }
    // Likes on other posts.
    const myLikes = await this.db.collectionGroup('likes').where('uid', '==', uid).get();
    for (const l of myLikes.docs) {
      const postRef = l.ref.parent.parent;
      await this.db.runTransaction(async (tx) => {
        if (postRef) {
          const p = await tx.get(postRef);
          if (p.exists) tx.update(postRef, { likeCount: Math.max(0, (p.get('likeCount') as number) - 1) });
        }
        tx.delete(l.ref);
      });
    }
    const posts = await this.db.collection('posts').where('uid', '==', uid).get();
    for (const p of posts.docs) await this.db.recursiveDelete(p.ref);
    const bookings = await this.db.collection('bookings').where('uid', '==', uid).get();
    for (const b of bookings.docs) await b.ref.delete();
    await this.db.recursiveDelete(this.user(uid));
  }

  async addMood(entry: MoodEntry) {
    await this.user(entry.uid).collection('moods').doc(entry.id).set(entry);
  }

  async listMoodsSince(uid: string, since: DateKey) {
    const snap = await this.user(uid).collection('moods').where('date', '>=', since).get();
    return snap.docs.map((d) => d.data() as MoodEntry).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async assignTasksIfAbsent(uid: string, date: DateKey, tasks: AssignedTask[]) {
    const col = this.user(uid).collection('tasks');
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(col.where('date', '==', date));
      if (!existing.empty) return existing.docs.map((d) => d.data() as AssignedTask);
      for (const t of tasks) tx.create(col.doc(t.id), t);
      return tasks;
    });
  }

  async listTasksForDate(uid: string, date: DateKey) {
    const snap = await this.user(uid).collection('tasks').where('date', '==', date).get();
    return snap.docs.map((d) => d.data() as AssignedTask);
  }

  async clearUntouchedTasks(uid: string, date: DateKey) {
    const col = this.user(uid).collection('tasks');
    await this.db.runTransaction(async (tx) => {
      const day = await tx.get(col.where('date', '==', date));
      if (day.empty || day.docs.some((d) => d.get('status') !== 'pending')) return;
      for (const d of day.docs) tx.delete(d.ref);
    });
  }

  async listTasksSince(uid: string, since: DateKey) {
    const snap = await this.user(uid).collection('tasks').where('date', '>=', since).get();
    return snap.docs.map((d) => d.data() as AssignedTask);
  }

  async completeTask(uid: string, taskId: string, apply: (user: UserProfile, task: AssignedTask) => CompletionOutcome) {
    const userRef = this.user(uid);
    const taskRef = userRef.collection('tasks').doc(taskId);
    return this.db.runTransaction(async (tx) => {
      const [u, t] = await Promise.all([tx.get(userRef), tx.get(taskRef)]);
      if (!u.exists) throw notFound('User');
      if (!t.exists) throw notFound('Task');
      const task = t.data() as AssignedTask;
      const outcome = apply(u.data() as UserProfile, task);
      tx.set(userRef, outcome.user);
      tx.set(taskRef, outcome.task);
      if (outcome.coinsAwarded > 0) {
        const id = randomUUID();
        const txn: CoinTransaction = { id, uid, amount: outcome.coinsAwarded, kind: 'task', refId: taskId, note: task.title, createdAt: outcome.task.completedAt ?? now().toISOString() };
        tx.set(userRef.collection('transactions').doc(id), txn);
      }
      return outcome;
    });
  }

  async skipTask(uid: string, taskId: string) {
    const ref = this.user(uid).collection('tasks').doc(taskId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound('Task');
      const task = snap.data() as AssignedTask;
      if (task.status === 'completed') throw conflict('already_completed', 'Task already completed');
      const updated: AssignedTask = { ...task, status: 'skipped' };
      tx.set(ref, updated);
      return updated;
    });
  }

  async listTransactions(uid: string, limit: number) {
    const snap = await this.user(uid).collection('transactions').orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as CoinTransaction);
  }

  async redeem(uid: string, reward: Reward, apply: (user: UserProfile) => UserProfile) {
    const userRef = this.user(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw notFound('User');
      const updated = apply(snap.data() as UserProfile);
      tx.set(userRef, updated);
      const id = randomUUID();
      const txn: CoinTransaction = { id, uid, amount: -reward.cost, kind: 'redeem', refId: reward.id, note: reward.title, createdAt: now().toISOString() };
      tx.set(userRef.collection('transactions').doc(id), txn);
      return updated;
    });
  }

  async createPost(post: Post) {
    await this.db.collection('posts').doc(post.id).set(post);
  }

  async getPost(id: string) {
    const snap = await this.db.collection('posts').doc(id).get();
    return snap.exists ? (snap.data() as Post) : null;
  }

  async listPosts(limit: number, before: string | null): Promise<PostPage> {
    let q = this.db.collection('posts').where('status', '==', 'visible').orderBy('createdAt', 'desc');
    if (before) q = q.startAfter(before);
    const snap = await q.limit(limit + 1).get();
    const all = snap.docs.map((d) => d.data() as Post);
    const page = all.slice(0, limit);
    return { posts: page, nextBefore: all.length > limit ? page[page.length - 1]!.createdAt : null };
  }

  async likedBy(uid: string, postIds: string[]) {
    if (postIds.length === 0) return new Set<string>();
    const refs = postIds.map((id) => this.db.collection('posts').doc(id).collection('likes').doc(uid));
    const snaps = await this.db.getAll(...refs);
    return new Set(snaps.filter((s) => s.exists).map((s) => s.ref.parent.parent!.id));
  }

  async toggleLike(postId: string, uid: string) {
    const postRef = this.db.collection('posts').doc(postId);
    const likeRef = postRef.collection('likes').doc(uid);
    return this.db.runTransaction(async (tx) => {
      const [p, l] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
      if (!p.exists || p.get('status') !== 'visible') throw notFound('Post');
      const count = p.get('likeCount') as number;
      if (l.exists) {
        tx.delete(likeRef);
        tx.update(postRef, { likeCount: Math.max(0, count - 1) });
        return { liked: false, likeCount: Math.max(0, count - 1) };
      }
      tx.set(likeRef, { uid, createdAt: now().toISOString() });
      tx.update(postRef, { likeCount: count + 1 });
      return { liked: true, likeCount: count + 1 };
    });
  }

  async reportPost(postId: string, uid: string, hideAt: number) {
    const postRef = this.db.collection('posts').doc(postId);
    const reportRef = postRef.collection('reports').doc(uid);
    return this.db.runTransaction(async (tx) => {
      const [p, r] = await Promise.all([tx.get(postRef), tx.get(reportRef)]);
      if (!p.exists) throw notFound('Post');
      const post = p.data() as Post;
      if (r.exists) return post;
      const reportCount = post.reportCount + 1;
      const status = reportCount >= hideAt && post.status === 'visible' ? 'hidden' : post.status;
      tx.set(reportRef, { uid, createdAt: now().toISOString() });
      tx.update(postRef, { reportCount, status });
      return { ...post, reportCount, status };
    });
  }

  async addComment(comment: Comment) {
    const postRef = this.db.collection('posts').doc(comment.postId);
    await this.db.runTransaction(async (tx) => {
      const p = await tx.get(postRef);
      if (!p.exists || p.get('status') !== 'visible') throw notFound('Post');
      tx.set(postRef.collection('comments').doc(comment.id), comment);
      tx.update(postRef, { commentCount: (p.get('commentCount') as number) + 1 });
    });
  }

  async listComments(postId: string) {
    const snap = await this.db.collection('posts').doc(postId).collection('comments').orderBy('createdAt').get();
    return snap.docs.map((d) => d.data() as Comment);
  }

  async createBooking(booking: Booking) {
    const ref = this.db.collection('bookings').doc(`${booking.consultantId}_${booking.slot.replace(/[:.]/g, '-')}`);
    try {
      await ref.create(booking);
    } catch (e) {
      // ALREADY_EXISTS
      if ((e as { code?: number }).code === 6) throw conflict('slot_taken', 'That slot was just booked. Please pick another.');
      throw e;
    }
  }

  async listBookings(uid: string) {
    const snap = await this.db.collection('bookings').where('uid', '==', uid).get();
    return snap.docs.map((d) => d.data() as Booking).sort((a, b) => a.slot.localeCompare(b.slot));
  }
}
