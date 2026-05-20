// Pure metric + date math, with no database import.
//
// Kept separate from db.ts on purpose: these are the calculations QA needs to
// trust, and keeping them IO-free means they're trivially unit-testable
// (db.ts pulls in node:sqlite, which the test bundler can't load).
//
// Stored timestamps are ISO 8601 UTC ("…Z"). For UTC ISO strings, lexicographic
// comparison IS chronological order, so we compare `started_at` against an ISO
// bound directly — no SQLite date() calls, no timezone ambiguity.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO timestamp `days` before `now` — the start of a rolling window. */
export function windowStartIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

/** UTC calendar date (YYYY-MM-DD) of a timestamp. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The `days` calendar dates ending today (UTC), oldest first. Used to build the
 * fixed-length daily series the API promises (e.g. exactly 28 entries), so days
 * with zero calls still appear as zeros instead of being dropped.
 */
export function dayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    keys.push(isoDate(new Date(now.getTime() - offset * MS_PER_DAY)));
  }
  return keys;
}

/** Connect rate in [0,1]; 0 when there were no calls (no divide-by-zero). */
export function connectRate(connected: number, total: number): number {
  return total === 0 ? 0 : connected / total;
}

/** `meta` block shared by every API response. */
export function buildMeta(now: Date, days: number): {
  generated_at: string;
  window_start: string;
  window_end: string;
} {
  const keys = dayKeys(now, days);
  return {
    generated_at: now.toISOString(),
    window_start: keys[0],
    window_end: keys[keys.length - 1],
  };
}

/** Wrap a CSV field in quotes when it contains a comma, quote, or newline. */
export function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
