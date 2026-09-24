/**
 * The one source of "what time is it".
 *
 * Everything that needs the current date — services, the seed, dashboards,
 * ageing — reads it from here rather than calling `new Date()`. That keeps
 * business logic testable (freeze the clock) and lets the seed lay its data out
 * relative to whatever day the demo is given on, so "today's DPR" and the
 * ageing colours always make sense.
 *
 * Parsing a date that is already a string (`new Date(isoDate)`) is not the
 * clock's business and stays where it is.
 */

let frozen: string | null = null;

/** Current instant as an ISO-8601 timestamp. */
export function now(): string {
  return frozen ?? new Date().toISOString();
}

/** Current calendar date, yyyy-mm-dd. */
export function today(): string {
  return now().slice(0, 10);
}

/** Midnight UTC on the current date, for date arithmetic. */
export function todayUtc(): Date {
  return new Date(`${today()}T00:00:00.000Z`);
}

/** The calendar date `days` before today. Negative values look forward. */
export function daysAgoDate(days: number): string {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The calendar date `days` after today. */
export function daysAheadDate(days: number): string {
  return daysAgoDate(-days);
}

/**
 * Timestamp `days` before today at `hour` IST, so seeded rows land at a
 * plausible time of day rather than all at midnight.
 */
export function daysAgoIso(days: number, hour = 10): string {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour - 5, 30, 0, 0);
  return d.toISOString();
}

/** Timestamp `days` after today. */
export function daysAheadIso(days: number, hour = 10): string {
  return daysAgoIso(-days, hour);
}

/** Whole days between an ISO date or timestamp and today. Past dates are positive. */
export function ageInDays(isoDateOrTimestamp: string | null | undefined): number {
  if (!isoDateOrTimestamp) return 0;
  const then = new Date(
    isoDateOrTimestamp.length <= 10
      ? `${isoDateOrTimestamp}T00:00:00.000Z`
      : isoDateOrTimestamp,
  );
  if (Number.isNaN(then.getTime())) return 0;
  const diff = todayUtc().getTime() - Date.UTC(
    then.getUTCFullYear(),
    then.getUTCMonth(),
    then.getUTCDate(),
  );
  return Math.round(diff / 86_400_000);
}

/** Days from today until a future date. Past dates are negative. */
export function daysUntil(isoDate: string | null | undefined): number {
  return -ageInDays(isoDate);
}

/** Add days to an arbitrary ISO date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First day of the current calendar month. */
export function startOfMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

/** True when the date falls in the current calendar month. */
export function isThisMonth(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false;
  return isoDate.slice(0, 7) === today().slice(0, 7);
}

/**
 * Pin the clock, for tests and for anything that needs a reproducible run.
 * Pass a full ISO timestamp.
 */
export function freezeClock(iso: string): void {
  frozen = iso;
}

export function unfreezeClock(): void {
  frozen = null;
}
