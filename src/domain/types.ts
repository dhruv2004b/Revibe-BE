/** Calendar day in the app's time zone, formatted YYYY-MM-DD. */
export type DateKey = string;

export interface UserProfile {
  uid: string;
  displayName: string;
  /** Public name used in the community; never the real name. */
  anonHandle: string;
  coins: number;
  streak: number;
  bestStreak: number;
  lastActiveDate: DateKey | null;
  coinsEarnedDate: DateKey | null;
  coinsEarnedToday: number;
  unlockedRewards: string[];
  onboarded: boolean;
  createdAt: string;
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface Sentiment {
  label: SentimentLabel;
  /** -1 (very negative) .. 1 (very positive) */
  score: number;
  source: 'hf' | 'lexicon' | 'none';
}

export interface MoodEntry {
  id: string;
  uid: string;
  /** 1 (awful) .. 5 (great) */
  mood: number;
  /** 1 (calm) .. 5 (overwhelmed) */
  stress: number;
  note: string;
  screenTimeHours: number | null;
  tags: string[];
  sentiment: Sentiment;
  crisis: boolean;
  date: DateKey;
  createdAt: string;
}

export type TaskCategory =
  | 'breathing'
  | 'mindfulness'
  | 'movement'
  | 'focus'
  | 'social'
  | 'sleep'
  | 'digital'
  | 'journaling'
  | 'gratitude';

/** calm: for high stress, balanced: middle, energize: for low stress / good mood */
export type TaskIntensity = 'calm' | 'balanced' | 'energize';

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  intensity: TaskIntensity;
  durationMin: number;
  reward: number;
}

export type TaskStatus = 'pending' | 'completed' | 'skipped';

export interface AssignedTask {
  id: string;
  uid: string;
  templateId: string;
  title: string;
  description: string;
  category: TaskCategory;
  durationMin: number;
  reward: number;
  date: DateKey;
  status: TaskStatus;
  /** Why this task was picked, shown to the user. */
  reason: string;
  completedAt: string | null;
  coinsAwarded: number;
}

export interface CoinTransaction {
  id: string;
  uid: string;
  amount: number;
  kind: 'task' | 'redeem' | 'bonus';
  refId: string;
  note: string;
  createdAt: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  kind: 'ebook' | 'audio' | 'theme' | 'premium';
  cost: number;
  /** Where the unlocked content lives (public/open-licensed for the demo). */
  url: string | null;
}

export type PostStatus = 'visible' | 'hidden' | 'blocked';

export interface Post {
  id: string;
  uid: string;
  anonHandle: string;
  text: string;
  topic: string;
  status: PostStatus;
  likeCount: number;
  commentCount: number;
  reportCount: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  uid: string;
  anonHandle: string;
  text: string;
  createdAt: string;
}

export interface Consultant {
  id: string;
  name: string;
  title: string;
  languages: string[];
  specialties: string[];
  /** Demo data only: not a real practitioner. */
  demo: true;
}

export interface Booking {
  id: string;
  uid: string;
  consultantId: string;
  slot: string;
  note: string;
  status: 'requested' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface Helpline {
  name: string;
  phone: string;
  hours: string;
  description: string;
}
