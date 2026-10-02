/**
 * Buffers activity snapshots and ships them to the server.
 *
 * - Flushes every FLUSH_INTERVAL (default 300 s) or as soon as the buffer holds >= 10 snapshots.
 * - On failure the snapshots stay queued (oldest dropped beyond 500) and are retried with
 *   exponential backoff, plus on every regular flush tick.
 * - Also sends task time as PATCH /tasks/:id { actualMinutesDelta } using the task tracker.
 *
 * Payloads only ever contain counts and durations (see tracker privacy contracts).
 */

const DEFAULT_FLUSH_SECONDS = 300;
const FLUSH_THRESHOLD = 10;
const MAX_QUEUE = 500;
const MAX_BATCH = 100;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Create the activity upload service.
 * @param {object} opts
 * @param {ReturnType<import('./apiService.js').createApiService>} opts.api
 * @param {ReturnType<import('../main/taskTracker.js').createTaskTracker>} [opts.taskTracker]
 * @param {number} [opts.flushIntervalSeconds=300]
 * @param {() => void} [opts.onChange] called whenever queue/sync state changes
 */
export function createActivityService({ api, taskTracker, flushIntervalSeconds = DEFAULT_FLUSH_SECONDS, onChange }) {
  /** @type {Array<{snapshot: object, applications: object[]}>} */
  let queue = [];
  let timer = null;
  let retryTimer = null;
  let backoffMs = 0;
  let flushing = null;
  let lastSyncAt = null;
  let lastError = null;
  let dropped = 0;

  const notify = () => onChange?.();

  function scheduleRetry() {
    if (retryTimer) return;
    backoffMs = backoffMs ? Math.min(backoffMs * 2, MAX_BACKOFF_MS) : 15000;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush().catch(() => {});
    }, backoffMs);
  }

  async function sendTaskDeltas() {
    if (!taskTracker) return;
    const deltas = taskTracker.drainMinuteDeltas();
    const failed = [];
    for (const delta of deltas) {
      try {
        await api.updateTask(delta.taskId, { actualMinutesDelta: delta.minutes });
      } catch (err) {
        // 404/403 means the task is gone or reassigned: drop it rather than retry forever.
        if (err?.status === 404 || err?.status === 403) continue;
        failed.push(delta);
        lastError = err?.message ?? String(err);
      }
    }
    if (failed.length) {
      taskTracker.restoreMinuteDeltas(failed);
      throw new Error(lastError);
    }
  }

  async function sendSnapshots() {
    while (queue.length) {
      const batch = queue.slice(0, MAX_BATCH);
      const payload = {
        snapshots: batch.map((item) => item.snapshot),
        applications: batch.flatMap((item) => item.applications),
      };
      await api.postSnapshots(payload);
      // Only remove what we sent; new snapshots may have been enqueued meanwhile.
      queue.splice(0, batch.length);
    }
  }

  /**
   * Send everything buffered now. Concurrent calls share the same in-flight flush.
   * @returns {Promise<boolean>} true when fully flushed
   */
  function flush() {
    if (flushing) return flushing;
    if (!api.hasToken()) return Promise.resolve(false);
    flushing = (async () => {
      try {
        await sendSnapshots();
        await sendTaskDeltas();
        lastSyncAt = new Date().toISOString();
        lastError = null;
        backoffMs = 0;
        return true;
      } catch (err) {
        lastError = err?.message ?? String(err);
        // 401 is handled by apiService.onUnauthorized; don't hammer the server meanwhile.
        if (err?.status !== 401) scheduleRetry();
        return false;
      } finally {
        flushing = null;
        notify();
      }
    })();
    return flushing;
  }

  return {
    /** Start the periodic flush timer. */
    start() {
      if (timer) return;
      timer = setInterval(() => flush().catch(() => {}), flushIntervalSeconds * 1000);
    },

    /** Stop timers (queued data is kept in memory). */
    stop() {
      if (timer) clearInterval(timer);
      if (retryTimer) clearTimeout(retryTimer);
      timer = null;
      retryTimer = null;
    },

    /**
     * Buffer one snapshot together with its application usage records.
     * @param {object} snapshot
     * @param {object[]} [applications]
     */
    enqueue(snapshot, applications = []) {
      queue.push({ snapshot, applications });
      if (queue.length > MAX_QUEUE) {
        const overflow = queue.length - MAX_QUEUE;
        queue.splice(0, overflow);
        dropped += overflow;
      }
      notify();
      if (queue.length >= FLUSH_THRESHOLD) flush().catch(() => {});
    },

    flush,

    /** Discard everything queued (used on logout after a final flush attempt). */
    clear() {
      queue = [];
      notify();
    },

    /** Sync state for the status window. */
    getState() {
      return { queued: queue.length, lastSyncAt, lastError, dropped };
    },
  };
}
