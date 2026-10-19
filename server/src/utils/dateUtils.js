const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The organisation's time zone (APP_TIMEZONE, an IANA name such as "Asia/Kolkata"). A "day" everywhere in the
 * API (dashboards, daily records, screenshots, daily analyses) runs from midnight to midnight in this zone, and
 * a date like "2026-10-19" sent by the website or the analysis agent means that calendar day here.
 * Read from process.env directly so pure helpers and their tests don't need the full server configuration.
 */
export const TIME_ZONE = process.env.APP_TIMEZONE || 'UTC';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

/** Calendar fields of an instant as seen in TIME_ZONE. */
function zonedParts(instant) {
  const parts = Object.fromEntries(partsFormat.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  return parts;
}

/** Milliseconds TIME_ZONE is ahead of UTC at `instant` (e.g. +5:30 for Asia/Kolkata). */
function zoneOffset(instant) {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant local midnight starts on the given calendar day in TIME_ZONE. */
function midnight(year, month, day) {
  const guess = Date.UTC(year, month - 1, day);
  // Twice, so a day on which the offset changes (daylight saving) still lands on its own midnight.
  const first = guess - zoneOffset(new Date(guess));
  return new Date(guess - zoneOffset(new Date(first)));
}

/** Midnight (in TIME_ZONE) at the start of the day containing `date`. */
export function startOfDay(date = new Date()) {
  const p = zonedParts(new Date(date));
  return midnight(p.year, p.month, p.day);
}

/** Midnight (in TIME_ZONE) at the start of a "YYYY-MM-DD" calendar day. */
export function dayStart(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return midnight(year, month, day);
}

/** The same time of day `days` later; from a midnight, the midnight `days` calendar days later. */
export function addDays(date, days) {
  const from = new Date(date);
  const p = zonedParts(from);
  if (p.hour === 0 && p.minute === 0 && p.second === 0) return midnight(p.year, p.month, p.day + days);
  return new Date(from.getTime() + days * DAY_MS);
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

/** "YYYY-MM-DD" of the day containing `date`, in TIME_ZONE. */
export function toDateKey(date) {
  const p = zonedParts(new Date(date));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Day of the week (0 = Sunday) of `date` in TIME_ZONE. */
export function weekday(date) {
  const p = zonedParts(new Date(date));
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

export function secondsToHours(seconds) {
  return Math.round((seconds / 3600) * 10) / 10;
}
