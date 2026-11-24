/**
 * Detects text that may signal risk of self-harm. Deliberately broad:
 * a false positive shows helplines, a false negative can cost a life.
 * Runs before any AI call and never depends on the network.
 */
const PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm|cut)(ting)?\s+my\s*self\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend\s+(it\s+all|my\s+life|everything)\b/i,
  /\b(want|wanna|going)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|exist)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
  /\bself[-\s]?harm\b/i,
  // Hinglish
  /\bmar(na|\s*jana)\s+chaht[aie]\b/i,
  /\bkhud\s*(ko)?\s+khatam\b/i,
  /\bjeena\s+nahi\s+chaht[ai]\b/i,
];

export function detectCrisis(text: string): boolean {
  if (!text) return false;
  return PATTERNS.some((p) => p.test(text));
}
