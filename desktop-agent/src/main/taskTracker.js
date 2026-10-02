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
 * This tracker: remembers which assigned task the employee explicitly selected as
 * "working on" and accumulates ACTIVE seconds against it (idle and paused time are not
 * attributed). Pending seconds are drained as whole-minute deltas for
 * PATCH /tasks/:id { actualMinutesDelta }; the sub-minute remainder is carried over.
 */

/**
 * Create a task time tracker.
 * @returns {{
 *   setTask(task: {id: string, title?: string}|null): void,
 *   getCurrentTask(): {id: string, title?: string}|null,
 *   addActiveSeconds(seconds: number): void,
 *   getCurrentTaskSeconds(): number,
 *   drainMinuteDeltas(): Array<{taskId: string, minutes: number}>,
 *   restoreMinuteDeltas(deltas: Array<{taskId: string, minutes: number}>): void,
 *   reset(): void
 * }}
 */
export function createTaskTracker() {
  let current = null;
  /** @type {Map<string, number>} taskId -> unsent seconds */
  let pending = new Map();
  /** @type {Map<string, number>} taskId -> seconds this session (display only) */
  let sessionTotals = new Map();

  return {
    /** Select the task being worked on (null to clear). */
    setTask(task) {
      current = task && task.id != null ? { id: String(task.id), title: task.title ?? '' } : null;
    },
    /** Currently selected task or null. */
    getCurrentTask() {
      return current;
    },
    /** Attribute active seconds to the current task (no-op if none selected). */
    addActiveSeconds(seconds) {
      if (!current || !(seconds > 0)) return;
      pending.set(current.id, (pending.get(current.id) || 0) + seconds);
      sessionTotals.set(current.id, (sessionTotals.get(current.id) || 0) + seconds);
    },
    /** Active seconds on the current task during this session. */
    getCurrentTaskSeconds() {
      return current ? Math.round(sessionTotals.get(current.id) || 0) : 0;
    },
    /** Remove and return whole-minute deltas; remainders stay pending. */
    drainMinuteDeltas() {
      const deltas = [];
      for (const [taskId, seconds] of pending) {
        const minutes = Math.floor(seconds / 60);
        if (minutes <= 0) continue;
        deltas.push({ taskId, minutes });
        pending.set(taskId, seconds - minutes * 60);
      }
      return deltas;
    },
    /** Put back deltas that failed to send so they are retried later. */
    restoreMinuteDeltas(deltas = []) {
      for (const { taskId, minutes } of deltas) {
        pending.set(taskId, (pending.get(taskId) || 0) + minutes * 60);
      }
    },
    /** Clear everything (on logout). */
    reset() {
      current = null;
      pending = new Map();
      sessionTotals = new Map();
    },
  };
}
