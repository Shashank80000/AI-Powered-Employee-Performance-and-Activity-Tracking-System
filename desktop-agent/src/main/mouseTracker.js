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
 * This tracker: polls the cursor position about once per second and increments a counter
 * when it has moved. Only the COUNT leaves this module; the previous position is held in
 * memory solely to detect movement and is never stored or sent.
 */
import { screen } from 'electron';

const POLL_MS = 1000;
/** Minimum movement (px, Manhattan distance) to count, filters sensor jitter. */
const MIN_DELTA_PX = 3;

/**
 * Create a mouse movement counter.
 * @returns {{start(): void, stop(): void, collect(): number, peek(): number}}
 */
export function createMouseTracker() {
  let timer = null;
  let last = null;
  let count = 0;

  function poll() {
    let point;
    try {
      point = screen.getCursorScreenPoint();
    } catch {
      return;
    }
    if (last && Math.abs(point.x - last.x) + Math.abs(point.y - last.y) >= MIN_DELTA_PX) {
      count += 1;
    }
    last = point;
  }

  return {
    /** Begin polling the cursor. */
    start() {
      if (timer) return;
      last = null;
      timer = setInterval(poll, POLL_MS);
    },
    /** Stop polling and forget the last position. */
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      last = null;
    },
    /** Return the movement count for the interval and reset it. */
    collect() {
      const c = count;
      count = 0;
      return c;
    },
    /** Current count without resetting. */
    peek() {
      return count;
    },
  };
}
