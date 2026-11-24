import type { Consultant, Helpline, Reward, TaskTemplate } from './types.js';

export const TASKS: readonly TaskTemplate[] = [
  // calm: picked when stress is high or mood is low
  { id: 'box-breathing', title: 'Box breathing', description: 'Breathe in 4s, hold 4s, out 4s, hold 4s. Repeat for 3 minutes.', category: 'breathing', intensity: 'calm', durationMin: 3, reward: 10 },
  { id: '478-breathing', title: '4-7-8 breathing', description: 'In through the nose for 4, hold for 7, slowly out for 8. Four rounds.', category: 'breathing', intensity: 'calm', durationMin: 2, reward: 8 },
  { id: 'body-scan', title: '5-minute body scan', description: 'Close your eyes and slowly notice each part of your body, from toes to head.', category: 'mindfulness', intensity: 'calm', durationMin: 5, reward: 12 },
  { id: 'grounding-54321', title: '5-4-3-2-1 grounding', description: 'Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.', category: 'mindfulness', intensity: 'calm', durationMin: 3, reward: 10 },
  { id: 'brain-dump', title: 'Brain dump', description: 'Write every worry on paper for 5 minutes. No editing, just empty your head.', category: 'journaling', intensity: 'calm', durationMin: 5, reward: 12 },
  { id: 'slow-walk', title: 'Slow 10-minute walk', description: 'Walk without your phone. Notice the air, sounds and your steps.', category: 'movement', intensity: 'calm', durationMin: 10, reward: 15 },
  { id: 'reach-out', title: 'Message someone you trust', description: 'Send a short message to a friend or family member. Just say hi.', category: 'social', intensity: 'calm', durationMin: 2, reward: 10 },
  { id: 'warm-drink', title: 'Mindful cup of tea', description: 'Make a warm drink and sip it slowly, with no screen.', category: 'mindfulness', intensity: 'calm', durationMin: 5, reward: 8 },
  { id: 'wind-down', title: 'Screen-free wind-down', description: 'Put the phone away 30 minutes before bed tonight.', category: 'sleep', intensity: 'calm', durationMin: 30, reward: 15 },

  // balanced
  { id: 'gratitude-3', title: 'Three good things', description: 'Write three things that went well today and why.', category: 'gratitude', intensity: 'balanced', durationMin: 5, reward: 12 },
  { id: 'stretch', title: 'Desk stretch break', description: 'Neck rolls, shoulder shrugs and a forward fold. 5 minutes.', category: 'movement', intensity: 'balanced', durationMin: 5, reward: 10 },
  { id: 'mood-reflect', title: 'Mood reflection', description: 'Write two lines: what affected your mood today, and one thing you can control.', category: 'journaling', intensity: 'balanced', durationMin: 4, reward: 10 },
  { id: 'tidy-space', title: 'Tidy one small space', description: 'Clear your desk or one shelf. Small order, calmer mind.', category: 'focus', intensity: 'balanced', durationMin: 10, reward: 12 },
  { id: 'hydrate', title: 'Water check', description: 'Drink a full glass of water and refill your bottle.', category: 'movement', intensity: 'balanced', durationMin: 1, reward: 5 },
  { id: 'notif-cleanup', title: 'Mute three apps', description: 'Turn off notifications for three apps that distract you.', category: 'digital', intensity: 'balanced', durationMin: 3, reward: 10 },
  { id: 'kind-act', title: 'One small kindness', description: 'Help someone, compliment someone, or thank someone today.', category: 'social', intensity: 'balanced', durationMin: 5, reward: 12 },

  // energize: picked when stress is low and mood is good
  { id: 'pomodoro-1', title: 'One focus sprint', description: '25 minutes on one task, phone in another room, then a 5-minute break.', category: 'focus', intensity: 'energize', durationMin: 30, reward: 20 },
  { id: 'pomodoro-2', title: 'Double focus sprint', description: 'Two 25-minute sprints on your most important task.', category: 'focus', intensity: 'energize', durationMin: 60, reward: 30 },
  { id: 'plan-tomorrow', title: 'Plan tomorrow', description: 'Write your top 3 tasks for tomorrow and when you will do them.', category: 'focus', intensity: 'energize', durationMin: 5, reward: 12 },
  { id: 'learn-15', title: 'Learn for 15 minutes', description: 'Read, watch or practise something that grows a skill you care about.', category: 'focus', intensity: 'energize', durationMin: 15, reward: 15 },
  { id: 'brisk-walk', title: '20-minute brisk walk', description: 'Walk fast enough to feel your heart rate rise.', category: 'movement', intensity: 'energize', durationMin: 20, reward: 20 },
  { id: 'social-detox', title: '2-hour social media break', description: 'Log out of social apps for two hours.', category: 'digital', intensity: 'energize', durationMin: 120, reward: 20 },
  { id: 'hard-thing-first', title: 'Do the hard thing first', description: 'Spend 15 minutes on the task you have been avoiding.', category: 'focus', intensity: 'energize', durationMin: 15, reward: 18 },
] as const;

export const REWARDS: readonly Reward[] = [
  { id: 'theme-ocean', title: 'Ocean theme', description: 'A calm blue colour theme for the app.', kind: 'theme', cost: 60, url: null },
  { id: 'theme-sunset', title: 'Sunset theme', description: 'A warm peach and lilac colour theme.', kind: 'theme', cost: 60, url: null },
  { id: 'audio-sleep', title: 'Sleep wind-down audio', description: 'A 10-minute guided relaxation track.', kind: 'audio', cost: 120, url: null },
  { id: 'audio-focus', title: 'Deep focus soundscape', description: 'Ambient sound for focus sprints.', kind: 'audio', cost: 120, url: null },
  { id: 'ebook-habits', title: 'Summary: building tiny habits', description: 'A short summary on starting habits that stick.', kind: 'ebook', cost: 200, url: null },
  { id: 'ebook-stress', title: 'Summary: understanding stress', description: 'What stress does to the body and simple ways to cope.', kind: 'ebook', cost: 200, url: null },
  { id: 'premium-week', title: '7 days of Premium', description: 'Extra daily tasks and full insights for a week.', kind: 'premium', cost: 500, url: null },
] as const;

/** Demo consultants for the booking mock-up. Not real practitioners. */
export const CONSULTANTS: readonly Consultant[] = [
  { id: 'c-ananya', name: 'Ananya (demo)', title: 'Counselling psychologist', languages: ['English', 'Hindi'], specialties: ['Stress', 'Exam anxiety'], demo: true },
  { id: 'c-rohan', name: 'Rohan (demo)', title: 'Clinical psychologist', languages: ['English', 'Gujarati'], specialties: ['Burnout', 'Sleep'], demo: true },
  { id: 'c-meera', name: 'Meera (demo)', title: 'Wellness coach', languages: ['English', 'Hindi', 'Gujarati'], specialties: ['Habits', 'Focus'], demo: true },
] as const;

/**
 * India helplines. Verify numbers before a public release; they are shown
 * on the crisis screen and must be correct.
 */
export const HELPLINES: readonly Helpline[] = [
  { name: 'Tele-MANAS', phone: '14416', hours: '24x7', description: 'Government of India mental health helpline, free, many languages.' },
  { name: 'Tele-MANAS (toll-free)', phone: '18008914416', hours: '24x7', description: 'Same service, alternate toll-free number.' },
  { name: 'Emergency', phone: '112', hours: '24x7', description: 'National emergency number for immediate danger.' },
] as const;
