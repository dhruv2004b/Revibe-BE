import type { CompletionOutcome } from '../domain/economy.js';
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

export interface PostPage {
  posts: Post[];
  /** createdAt of the last post, pass as `before` for the next page */
  nextBefore: string | null;
}

/**
 * Persistence boundary. Business rules live in domain/ and services/;
 * stores only load, save, and make multi-document updates atomic.
 */
export interface Store {
  getUser(uid: string): Promise<UserProfile | null>;
  /** Creates the profile if missing; returns the stored one either way. */
  ensureUser(initial: UserProfile): Promise<UserProfile>;
  updateUser(uid: string, patch: Partial<Pick<UserProfile, 'displayName' | 'onboarded'>>): Promise<UserProfile>;
  /** Removes the user's profile, moods, tasks, coins, bookings, posts and comments. */
  deleteUserData(uid: string): Promise<void>;

  addMood(entry: MoodEntry): Promise<void>;
  listMoodsSince(uid: string, since: DateKey): Promise<MoodEntry[]>;

  /** Saves `tasks` for (uid, date) unless that day already has tasks; returns the day's tasks. */
  assignTasksIfAbsent(uid: string, date: DateKey, tasks: AssignedTask[]): Promise<AssignedTask[]>;
  listTasksForDate(uid: string, date: DateKey): Promise<AssignedTask[]>;
  /** Deletes the day's tasks if none was completed or skipped, so they can be re-picked. */
  clearUntouchedTasks(uid: string, date: DateKey): Promise<void>;
  listTasksSince(uid: string, since: DateKey): Promise<AssignedTask[]>;
  /** Atomically applies `apply`, saves user and task, and records the coin transaction. */
  completeTask(uid: string, taskId: string, apply: (user: UserProfile, task: AssignedTask) => CompletionOutcome): Promise<CompletionOutcome>;
  skipTask(uid: string, taskId: string): Promise<AssignedTask>;

  listTransactions(uid: string, limit: number): Promise<CoinTransaction[]>;
  /** Atomically applies `apply`, saves the user, and records the spend. */
  redeem(uid: string, reward: Reward, apply: (user: UserProfile) => UserProfile): Promise<UserProfile>;

  createPost(post: Post): Promise<void>;
  getPost(id: string): Promise<Post | null>;
  listPosts(limit: number, before: string | null): Promise<PostPage>;
  /** Returns which of `postIds` the user has liked. */
  likedBy(uid: string, postIds: string[]): Promise<Set<string>>;
  toggleLike(postId: string, uid: string): Promise<{ liked: boolean; likeCount: number }>;
  /** One report per user; hides the post at `hideAt` reports. */
  reportPost(postId: string, uid: string, hideAt: number): Promise<Post>;
  addComment(comment: Comment): Promise<void>;
  listComments(postId: string): Promise<Comment[]>;

  /** Fails with conflict if the consultant's slot is taken. */
  createBooking(booking: Booking): Promise<void>;
  listBookings(uid: string): Promise<Booking[]>;
}
