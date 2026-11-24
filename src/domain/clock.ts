import type { DateKey } from './types.js';

let override: (() => Date) | null = null;

/** Current time; tests can pin it with setClock. */
export function now(): Date {
  return override ? override() : new Date();
}

export function setClock(fn: (() => Date) | null): void {
  override = fn;
}

/** YYYY-MM-DD of `d` in the given IANA time zone. */
export function dateKey(d: Date, timeZone: string): DateKey {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Calendar arithmetic on date keys, independent of time zone. */
export function addDays(key: DateKey, days: number): DateKey {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
