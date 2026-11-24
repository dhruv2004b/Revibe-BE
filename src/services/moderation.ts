import { detectCrisis } from './crisis.js';

export type ModerationVerdict = 'allow' | 'block';

export interface ModerationResult {
  verdict: ModerationVerdict;
  /** Shown to the author when blocked. */
  reason: string | null;
  /** The author may be at risk: the app shows helplines. The post is still allowed. */
  supportNeeded: boolean;
}

/**
 * Abuse aimed at others: blocked outright. Words people use about
 * themselves ("I feel stupid") are not listed alone on purpose: blocking
 * self-talk would silence the people the forum is for.
 */
const ABUSE = [
  'you idiot', 'you are stupid', "you're stupid", 'you loser', 'kill yourself', 'kys', 'go die', 'retard', 'moron',
  'chutiya', 'bhosdi', 'madarchod', 'behenchod', 'gandu', 'harami', 'kamina',
  'fuck you', 'bitch', 'bastard', 'asshole',
];

const CONTACT = [
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // email
  /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/, // Indian mobile
  /\bhttps?:\/\/\S+/i, // links
  /\b(?:insta|instagram|snap|telegram|whatsapp)\s*[:@]/i,
];

/** Hidden automatically after this many distinct reports. */
export const REPORT_HIDE_THRESHOLD = 3;

export function moderate(text: string): ModerationResult {
  const lower = text.toLowerCase();
  const supportNeeded = detectCrisis(text);

  if (ABUSE.some((w) => new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower))) {
    return { verdict: 'block', reason: 'Please keep the community kind. Your post contains words we do not allow.', supportNeeded };
  }
  if (CONTACT.some((r) => r.test(text))) {
    return { verdict: 'block', reason: 'To keep everyone anonymous and safe, posts cannot include phone numbers, emails, links or social handles.', supportNeeded };
  }
  return { verdict: 'allow', reason: null, supportNeeded };
}
