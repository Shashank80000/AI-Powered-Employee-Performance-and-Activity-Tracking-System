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
 * This tracker: counts keydown events system-wide using the OPTIONAL native module
 * 'uiohook-napi'. The event object is deliberately ignored -- the handler takes no
 * arguments, so no keycode, character or modifier state is ever read, stored or sent.
 * If the module is missing (or the OS denies input-monitoring permission) the tracker
 * logs one warning and reports 0; the agent keeps working.
 */

/**
 * Create a keystroke counter (count only).
 * @returns {{start(): Promise<void>, stop(): void, collect(): number, peek(): number, isAvailable(): boolean}}
 */
export function createKeyboardTracker() {
  let hook = null;
  let available = false;
  let loadAttempted = false;
  let running = false;
  let wanted = false; // guards against stop() racing the async load
  let count = 0;

  // Intentionally takes no parameters: the key event is never inspected.
  const onKeydown = () => {
    if (running) count += 1;
  };

  async function load() {
    if (loadAttempted) return hook;
    loadAttempted = true;
    try {
      const mod = await import('uiohook-napi');
      hook = mod.uIOhook ?? mod.default?.uIOhook ?? null;
      if (!hook) throw new Error('uIOhook export not found');
      hook.on('keydown', onKeydown);
    } catch (err) {
      hook = null;
      console.warn(
        '[keyboardTracker] uiohook-napi unavailable; keyboard counts will be reported as 0.',
        err?.message ?? err,
      );
    }
    return hook;
  }

  return {
    /** Load the optional hook (once) and start counting. Never throws. */
    async start() {
      wanted = true;
      const h = await load();
      if (!h || running || !wanted) return;
      try {
        h.start();
        running = true;
        available = true;
      } catch (err) {
        available = false;
        console.warn('[keyboardTracker] could not start input hook (permission?):', err?.message ?? err);
      }
    },
    /** Stop counting and release the OS hook. */
    stop() {
      wanted = false;
      if (!hook || !running) return;
      running = false;
      try {
        hook.stop();
      } catch {
        /* ignore */
      }
    },
    /** Return the keydown count for the interval and reset it. */
    collect() {
      const c = count;
      count = 0;
      return c;
    },
    /** Current count without resetting. */
    peek() {
      return count;
    },
    /** True when the native hook is loaded and running. */
    isAvailable() {
      return available;
    },
  };
}
