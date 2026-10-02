/** "+4.2%", "−3.0%" or "0%" — handles negative changes correctly. */
export function formatChange(value) {
  if (!value) return '0%';
  const sign = value > 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function formatPercent(value, digits = 0) {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function formatHours(seconds) {
  const hours = seconds / 3600;
  return `${hours >= 100 ? Math.round(hours) : hours.toFixed(1)}h`;
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

export function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  return value ? new Date(value).toLocaleDateString(undefined, options) : '—';
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60]
];

export function formatRelativeTime(value) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** Local time range for an hour reported in UTC, e.g. "10:00 – 11:00". */
export function formatUtcHourRange(hour) {
  const time = (h) => new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${time(hour)} – ${time(hour + 1)}`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Today's date as YYYY-MM-DD in local time, for <input type="date">. */
export function todayKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
