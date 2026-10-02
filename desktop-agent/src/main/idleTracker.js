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
 * This tracker: reads the OS "seconds since last input" value via
 * powerMonitor.getSystemIdleTime() once per second and classifies each elapsed second as
 * active or idle. It never sees what the input was.
 */
import { powerMonitor } from 'electron';

const TICK_MS = 1000;
/** Gaps longer than this between ticks mean the machine was asleep; they are not counted. */
const MAX_TICK_GAP_SECONDS = 10;

/**
 * Create an idle tracker.
 * @param {object} [opts]
 * @param {number} [opts.idleThresholdSeconds=120] seconds without input before the user is idle
 * @param {(deltaSeconds: number, isActive: boolean) => void} [opts.onTick] called every tick
 * @returns {{start(): void, stop(): void, collect(): {activeSeconds: number, idleSeconds: number}, peek(): {activeSeconds: number, idleSeconds: number}, isIdle(): boolean}}
 */
export function createIdleTracker({ idleThresholdSeconds = 120, onTick } = {}) {
  let timer = null;
  let lastTick = 0;
  let activeSeconds = 0;
  let idleSeconds = 0;
  let idle = false;
  let screenLocked = false;

  const onLock = () => { screenLocked = true; };
  const onUnlock = () => { screenLocked = false; };
  const onResume = () => { lastTick = Date.now(); }; // drop the sleep gap

  function tick() {
    const now = Date.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    if (delta <= 0 || delta > MAX_TICK_GAP_SECONDS) return;

    let systemIdle = 0;
    try {
      systemIdle = powerMonitor.getSystemIdleTime();
    } catch {
      systemIdle = 0;
    }
    idle = screenLocked || systemIdle >= idleThresholdSeconds;
    if (idle) idleSeconds += delta;
    else activeSeconds += delta;
    onTick?.(delta, !idle);
  }

  return {
    /** Begin sampling. */
    start() {
      if (timer) return;
      lastTick = Date.now();
      powerMonitor.on('lock-screen', onLock);
      powerMonitor.on('unlock-screen', onUnlock);
      powerMonitor.on('resume', onResume);
      timer = setInterval(tick, TICK_MS);
    },
    /** Stop sampling (accumulated values are kept until collect()). */
    stop() {
      if (!timer) return;
      tick();
      clearInterval(timer);
      timer = null;
      powerMonitor.removeListener('lock-screen', onLock);
      powerMonitor.removeListener('unlock-screen', onUnlock);
      powerMonitor.removeListener('resume', onResume);
    },
    /** Return active/idle seconds for the interval and reset. */
    collect() {
      const result = { activeSeconds: Math.round(activeSeconds), idleSeconds: Math.round(idleSeconds) };
      activeSeconds = 0;
      idleSeconds = 0;
      return result;
    },
    /** Current interval totals without resetting. */
    peek() {
      return { activeSeconds: Math.round(activeSeconds), idleSeconds: Math.round(idleSeconds) };
    },
    /** Whether the most recent sample was idle. */
    isIdle() {
      return idle;
    },
    /** Whether the OS reported the screen as locked (screenshots are skipped then). */
    isScreenLocked() {
      return screenLocked;
    },
  };
}
