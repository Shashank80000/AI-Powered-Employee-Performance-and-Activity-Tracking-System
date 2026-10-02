/**
 * Uploads consented screenshots to the server.
 *
 * - Images live in MEMORY ONLY. They are never written to disk; once uploaded (or discarded)
 *   the buffer is zeroed and dropped.
 * - Each capture is uploaded right away (POST /screenshots, raw JPEG). If that fails the image
 *   waits in an in-memory queue (at most 12; the oldest is dropped beyond that) and is retried
 *   with backoff and on the next capture.
 * - 403 means the server has screenshots consent OFF for this person: the queue is discarded
 *   and onForbidden() lets the main process turn screenshots off locally and tell the person.
 * - The person can delete their latest screenshot (DELETE /screenshots/:id), or drop it before
 *   it was uploaded.
 */

const MAX_QUEUE = 12;
const MAX_BYTES = 2 * 1024 * 1024;
const FIRST_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Create the screenshot upload service.
 * @param {object} opts
 * @param {ReturnType<import('./apiService.js').createApiService>} opts.api
 * @param {() => void} [opts.onForbidden] server rejected screenshots (consent off server-side)
 * @param {() => void} [opts.onChange] called whenever queue/last-screenshot state changes
 */
export function createScreenshotService({ api, onForbidden, onChange }) {
  /** @type {Array<{buffer: Buffer, capturedAt: string}>} */
  let queue = [];
  let flushing = null;
  let retryTimer = null;
  let backoffMs = 0;
  let lastError = null;
  let dropped = 0;
  /** Most recent capture: { item, id } — id is null until uploaded. */
  let last = null;

  const notify = () => onChange?.();

  function discard(item) {
    try {
      item.buffer.fill(0);
    } catch {
      /* ignore */
    }
  }

  function scheduleRetry() {
    if (retryTimer || !queue.length) return;
    backoffMs = backoffMs ? Math.min(backoffMs * 2, MAX_BACKOFF_MS) : FIRST_BACKOFF_MS;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush().catch(() => {});
    }, backoffMs);
  }

  function clearQueue() {
    for (const item of queue) discard(item);
    queue = [];
    if (last && last.id == null) last = null;
  }

  /**
   * Upload everything queued. Concurrent calls share one in-flight flush.
   * @returns {Promise<boolean>} true when the queue is empty afterwards
   */
  function flush() {
    if (flushing) return flushing;
    if (!api.hasToken() || !queue.length) return Promise.resolve(queue.length === 0);
    flushing = (async () => {
      try {
        while (queue.length) {
          const item = queue[0];
          try {
            const res = await api.postScreenshot(item.buffer, item.capturedAt);
            if (queue[0] === item) queue.shift();
            if (last?.item === item) last = { item: null, id: res?.screenshot?.id ?? null, capturedAt: item.capturedAt };
            discard(item);
          } catch (err) {
            if (err?.status === 403) {
              clearQueue();
              lastError = 'The server has screenshots turned off for your account.';
              onForbidden?.(err);
              return false;
            }
            // 409: taken while tracking was paused; the server will never accept it.
            if (err?.status === 400 || err?.status === 409 || err?.status === 413 || err?.status === 422) {
              // The server will never accept this image: drop it instead of retrying forever.
              if (queue[0] === item) queue.shift();
              if (last?.item === item) last = null;
              discard(item);
              dropped += 1;
              continue;
            }
            throw err;
          }
        }
        lastError = null;
        backoffMs = 0;
        return true;
      } catch (err) {
        lastError = err?.message ?? String(err);
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
    /**
     * Accept a fresh capture (in memory) and try to upload it.
     * @param {{buffer: Buffer, capturedAt: string}} shot
     */
    enqueue(shot) {
      if (!shot?.buffer?.length || shot.buffer.length > MAX_BYTES) return;
      const item = { buffer: shot.buffer, capturedAt: shot.capturedAt };
      queue.push(item);
      while (queue.length > MAX_QUEUE) {
        const old = queue.shift();
        if (last?.item === old) last = null;
        discard(old);
        dropped += 1;
      }
      last = { item, id: null, capturedAt: item.capturedAt };
      notify();
      flush().catch(() => {});
    },

    flush,

    /** Stop retry timers (queued images stay in memory). */
    stop() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    },

    /** Discard every image not yet uploaded and forget the last screenshot reference. */
    clear() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      clearQueue();
      last = null;
      lastError = null;
      notify();
    },

    /**
     * Delete the most recent screenshot: drop it from memory if it was not uploaded yet,
     * otherwise DELETE /screenshots/:id on the server.
     * @returns {Promise<boolean>} true if something was deleted
     */
    async deleteLast() {
      if (!last) return false;
      if (last.item) {
        const idx = queue.indexOf(last.item);
        if (idx >= 0) queue.splice(idx, 1);
        discard(last.item);
        last = null;
        notify();
        return true;
      }
      if (last.id == null) {
        last = null;
        notify();
        return false;
      }
      await api.deleteScreenshot(last.id);
      last = null;
      notify();
      return true;
    },

    /** State for the status window (never image data). */
    getState() {
      return {
        queued: queue.length,
        lastError,
        dropped,
        lastScreenshot: last
          ? { id: last.id, capturedAt: last.capturedAt, ...(last.item ? { pending: true } : {}) }
          : null,
      };
    },
  };
}
