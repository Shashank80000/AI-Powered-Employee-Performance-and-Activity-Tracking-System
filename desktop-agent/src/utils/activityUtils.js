/**
 * Small pure helpers shared by the trackers and services.
 * Nothing here touches Electron, so it can be unit-tested with plain Node.
 */

/**
 * Clamp a number into [min, max]. Non-finite input becomes `min`.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Sum a list of durations (seconds). Ignores non-numeric / negative entries.
 * @param {Array<number>} durations
 * @returns {number}
 */
export function sumDurations(durations = []) {
  return durations.reduce((total, d) => {
    const n = Number(d);
    return Number.isFinite(n) && n > 0 ? total + n : total;
  }, 0);
}

/**
 * ISO timestamp truncated to the minute (seconds and ms zeroed), e.g. "2026-10-01T09:15:00.000Z".
 * @param {Date|number|string} [date]
 * @returns {string}
 */
export function toIsoMinute(date = new Date()) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/**
 * Merge per-application usage maps by summing seconds.
 * Accepts plain objects or Maps of { appName: seconds }.
 * @param {...(Object<string, number>|Map<string, number>)} usages
 * @returns {Object<string, number>}
 */
export function mergeAppUsage(...usages) {
  const out = {};
  for (const usage of usages) {
    if (!usage) continue;
    const entries = usage instanceof Map ? usage.entries() : Object.entries(usage);
    for (const [app, seconds] of entries) {
      const n = Number(seconds);
      if (!app || !Number.isFinite(n) || n <= 0) continue;
      out[app] = (out[app] || 0) + n;
    }
  }
  return out;
}

/**
 * Convert an app usage map into the API's `applications` array shape.
 * @param {Object<string, number>} usage
 * @param {string} capturedAt ISO timestamp
 * @returns {Array<{application: string, durationSeconds: number, capturedAt: string}>}
 */
export function appUsageToRecords(usage, capturedAt) {
  return Object.entries(usage || {})
    .filter(([, s]) => s > 0)
    .map(([application, s]) => ({ application, durationSeconds: Math.round(s), capturedAt }));
}

/**
 * Sanitize an application owner name: trim, strip path components and file extensions,
 * and cap length. Defensive only -- callers must never pass window titles or URLs.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeAppName(name) {
  if (typeof name !== 'string') return 'Unknown';
  const base = name.split(/[\\/]/).pop().replace(/\.(exe|app)$/i, '').trim();
  return base.slice(0, 64) || 'Unknown';
}

/**
 * Read a positive integer from env, falling back to a default.
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
export function envSeconds(key, fallback) {
  const n = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Scale a size down (never up) so its width is at most maxWidth, keeping the aspect ratio.
 * Used for screenshot thumbnails.
 * @param {{width: number, height: number}} size
 * @param {number} [maxWidth=1280]
 * @returns {{width: number, height: number}}
 */
export function scaleToMaxWidth(size, maxWidth = 1280) {
  const w = Math.max(1, Math.round(Number(size?.width) || 0));
  const h = Math.max(1, Math.round(Number(size?.height) || 0));
  if (w <= maxWidth) return { width: w, height: h };
  return { width: maxWidth, height: Math.max(1, Math.round((h * maxWidth) / w)) };
}

/**
 * Format seconds as "1h 05m" / "4m 10s" for display.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Local calendar day key (YYYY-MM-DD), used to reset "today" totals at midnight.
 * @param {Date} [date]
 * @returns {string}
 */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
