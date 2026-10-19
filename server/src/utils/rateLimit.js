/**
 * In-memory sliding-window counter (one server process; resets on restart). Entries older than the window are
 * pruned as they are touched and in a periodic sweep, so memory stays bounded by recent activity.
 */
export function createLimiter({ limit, windowMs }) {
  const hits = new Map();
  const recent = (key, now = Date.now()) => {
    const kept = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  };
  const sweep = setInterval(() => {
    for (const key of hits.keys()) recent(key);
  }, windowMs);
  sweep.unref?.();

  return {
    /** True when `key` has used up its allowance. */
    exceeded: (key) => recent(key).length >= limit,
    /** Counts one use. */
    hit: (key) => hits.set(key, [...recent(key), Date.now()]),
    reset: (key) => hits.delete(key)
  };
}
