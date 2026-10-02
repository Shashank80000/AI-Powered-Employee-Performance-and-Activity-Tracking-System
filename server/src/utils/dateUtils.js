const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the given date. */
export function startOfDay(date = new Date()) {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/** Inclusive date range covering the last `days` days, ending today. */
export function lastNDays(days, today = new Date()) {
  const end = startOfDay(today);
  return { start: addDays(end, -(days - 1)), end: addDays(end, 1) };
}

/** Converts a dashboard period keyword into a date range. */
export function periodRange(period = 'week', today = new Date()) {
  const lengths = { day: 1, week: 7, month: 30 };
  return lastNDays(lengths[period] ?? 7, today);
}

/** Same-length range immediately before the given one, for "vs. last period" deltas. */
export function previousRange({ start, end }) {
  const length = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - length), end: start };
}

export function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function secondsToHours(seconds) {
  return Math.round((seconds / 3600) * 10) / 10;
}
