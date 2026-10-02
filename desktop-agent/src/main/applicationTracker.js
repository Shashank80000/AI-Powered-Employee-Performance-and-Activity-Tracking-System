/*
 * PRIVACY CONTRACT (applies to every tracker in this agent):
 *   - Collect ONLY counts and durations.
 *   - NEVER record key values/codes, window titles, URLs or file names.
 *   - Screenshots are taken ONLY by screenshotTracker.js, only with the person's explicit consent.
 *   - Nothing runs before the person has accepted the consent screen (consentStore.js), and each
 *     optional data type (keyboard count, app names, screenshots) runs only if the person enabled it.
 *   - Tracking is always visible to the employee (tray tooltip + status window) and can be
 *     paused/resumed by the employee at any time.
 *
 * This tracker: uses the OPTIONAL module 'get-windows' to learn which application is in
 * the foreground and accumulates seconds per application OWNER NAME only (e.g. "Code",
 * "Slack"). The window title, URL, path and process id returned by get-windows are
 * discarded immediately and never stored or sent. On macOS the accessibility and
 * screen-recording permission flags are turned off so titles are not even requested.
 * If the module is unavailable the tracker is a silent no-op.
 */
import { sanitizeAppName } from '../utils/activityUtils.js';

const POLL_MS = 5000;
/** Longer gaps (sleep, long pause) are not attributed to any app. */
const MAX_GAP_SECONDS = 30;

/**
 * Create a foreground-application time tracker.
 * @param {object} [opts]
 * @param {() => boolean} [opts.shouldCount] return false to skip time (e.g. while idle)
 * @returns {{start(): Promise<void>, stop(): void, collect(): Object<string, number>, isAvailable(): boolean}}
 */
export function createApplicationTracker({ shouldCount = () => true } = {}) {
  let activeWindow = null;
  let loadAttempted = false;
  let timer = null;
  let inFlight = false;
  let wanted = false; // guards against stop() racing the async load
  let lastPoll = 0;
  /** @type {Map<string, number>} app owner name -> seconds */
  let usage = new Map();

  async function load() {
    if (loadAttempted) return activeWindow;
    loadAttempted = true;
    try {
      const mod = await import('get-windows');
      activeWindow = mod.activeWindow ?? mod.default?.activeWindow ?? null;
      if (typeof activeWindow !== 'function') throw new Error('activeWindow export not found');
    } catch (err) {
      activeWindow = null;
      console.warn('[applicationTracker] get-windows unavailable; application usage disabled.', err?.message ?? err);
    }
    return activeWindow;
  }

  async function poll() {
    if (inFlight || !activeWindow) return;
    inFlight = true;
    const now = Date.now();
    const delta = (now - lastPoll) / 1000;
    lastPoll = now;
    try {
      if (delta <= 0 || delta > MAX_GAP_SECONDS || !shouldCount()) return;
      const win = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
      // Read ONLY the owner application name. Title/url/path are ignored on purpose.
      const ownerName = win?.owner?.name;
      if (!ownerName) return;
      const app = sanitizeAppName(ownerName);
      usage.set(app, (usage.get(app) || 0) + delta);
    } catch {
      /* transient OS errors are ignored */
    } finally {
      inFlight = false;
    }
  }

  return {
    /** Load the optional module (once) and start polling. Never throws. */
    async start() {
      wanted = true;
      const fn = await load();
      if (!fn || timer || !wanted) return;
      lastPoll = Date.now();
      timer = setInterval(poll, POLL_MS);
    },
    /** Stop polling. */
    stop() {
      wanted = false;
      if (timer) clearInterval(timer);
      timer = null;
    },
    /** Return { appName: seconds } for the interval and reset. */
    collect() {
      const out = {};
      for (const [app, seconds] of usage) out[app] = Math.round(seconds);
      usage = new Map();
      return out;
    },
    /** True when get-windows loaded successfully. */
    isAvailable() {
      return Boolean(activeWindow);
    },
  };
}
