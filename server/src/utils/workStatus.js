// One plain answer per screenshot: was the person working, on entertainment, or not working?
// Derived from the analysis agent's category + productive flag, so it needs no extra AI call and
// applies to screenshots that were classified before this existed.
//
//   entertainment, social_media          -> entertainment
//   idle_or_locked                       -> not_working
//   any other category, productive true  -> working
//   any other category, productive false -> not_working   (e.g. personal browsing labelled "other")
//   unclassified / not analysed yet      -> null          (unknown, counted nowhere)

export const WORK_STATUSES = ['working', 'entertainment', 'not_working'];

const ENTERTAINMENT = new Set(['entertainment', 'social_media']);

export function workStatus(analysis) {
  const category = analysis?.category;
  if (!category || category === 'unclassified') return null;
  if (ENTERTAINMENT.has(category)) return 'entertainment';
  if (category === 'idle_or_locked') return 'not_working';
  if (analysis.productive === true) return 'working';
  if (analysis.productive === false) return 'not_working';
  return null;
}

export function emptyStatusMinutes() {
  return { working: 0, entertainment: 0, not_working: 0 };
}

/** Minutes per status from per-screenshot statuses (each screenshot stands for one capture interval). */
export function countStatusMinutes(statuses, intervalMinutes) {
  const totals = emptyStatusMinutes();
  for (const status of statuses) if (status) totals[status] += intervalMinutes;
  return totals;
}

function numberOf(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function categoryValue(categoryMinutes, key) {
  const value = categoryMinutes instanceof Map ? categoryMinutes.get(key) : categoryMinutes?.[key];
  return numberOf(value);
}

/**
 * A day's minutes per status. Uses the exact totals stored with the analysis; analyses stored before
 * those existed get an estimate from category minutes and productive minutes (`estimated: true`).
 */
export function dayStatusMinutes(analysis) {
  const stored = analysis?.statusMinutes;
  if (stored && Number.isFinite(stored.working)) {
    return { working: numberOf(stored.working), entertainment: numberOf(stored.entertainment), not_working: numberOf(stored.not_working), estimated: false };
  }
  const categories = analysis?.categoryMinutes;
  const entries = categories instanceof Map ? [...categories.entries()] : Object.entries(categories ?? {});
  const classified = entries.filter(([key]) => key !== 'unclassified').reduce((sum, [, value]) => sum + numberOf(value), 0);
  const entertainment = categoryValue(categories, 'entertainment') + categoryValue(categories, 'social_media');
  const idle = categoryValue(categories, 'idle_or_locked');
  const working = Math.min(numberOf(analysis?.productiveMinutes), Math.max(0, classified - entertainment - idle));
  return { working, entertainment, not_working: Math.max(0, classified - entertainment - working), estimated: true };
}
