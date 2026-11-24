import { addDays } from './clock.js';
import { badRequest, conflict } from './errors.js';
import type { AssignedTask, DateKey, Reward, UserProfile } from './types.js';

/** Streak after the user is active on `today`. */
export function nextStreak(lastActive: DateKey | null, streak: number, today: DateKey): number {
  if (lastActive === today) return Math.max(streak, 1);
  if (lastActive === addDays(today, -1)) return streak + 1;
  return 1;
}

export interface CompletionOutcome {
  coinsAwarded: number;
  /** Set when the daily cap reduced the award. */
  capped: boolean;
  user: UserProfile;
  task: AssignedTask;
}

/**
 * Pure rule for completing a task. Stores call this inside their atomic
 * read-modify-write, so the logic lives in one tested place.
 */
export function applyTaskCompletion(
  user: UserProfile,
  task: AssignedTask,
  today: DateKey,
  dailyCap: number,
  completedAt: string,
): CompletionOutcome {
  if (task.uid !== user.uid) throw badRequest('wrong_owner', 'Task belongs to another user');
  if (task.status === 'completed') throw conflict('already_completed', 'Task already completed');
  if (task.date !== today) throw badRequest('task_expired', 'This task was for another day');

  const earnedToday = user.coinsEarnedDate === today ? user.coinsEarnedToday : 0;
  const coinsAwarded = Math.max(0, Math.min(task.reward, dailyCap - earnedToday));
  const streak = nextStreak(user.lastActiveDate, user.streak, today);

  return {
    coinsAwarded,
    capped: coinsAwarded < task.reward,
    user: {
      ...user,
      coins: user.coins + coinsAwarded,
      coinsEarnedDate: today,
      coinsEarnedToday: earnedToday + coinsAwarded,
      streak,
      bestStreak: Math.max(user.bestStreak, streak),
      lastActiveDate: today,
    },
    task: { ...task, status: 'completed', completedAt, coinsAwarded },
  };
}

export function applyRedeem(user: UserProfile, reward: Reward): UserProfile {
  if (user.unlockedRewards.includes(reward.id)) throw conflict('already_owned', 'You already unlocked this');
  if (user.coins < reward.cost) throw badRequest('insufficient_coins', `Needs ${reward.cost} coins, you have ${user.coins}`);
  return { ...user, coins: user.coins - reward.cost, unlockedRewards: [...user.unlockedRewards, reward.id] };
}
