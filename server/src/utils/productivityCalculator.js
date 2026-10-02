// Transparent weighted score so managers can see why a score is what it is.
// Must match ai-service/app/models/productivity_model.py.
export const WEIGHTS = {
  activeRatio: 0.3,
  productiveRatio: 0.3,
  completionRate: 0.25,
  onTimeRate: 0.15
};

function ratio(part, whole) {
  return whole > 0 ? Math.min(part / whole, 1) : 0;
}

/**
 * Factors without data (e.g. no tasks assigned) are left out and their weight is
 * shared among the rest, so nobody is penalised for missing data.
 * @param {{activeSeconds:number, idleSeconds:number, productiveAppSeconds:number,
 *          tasksAssigned:number, tasksCompleted:number, onTimeTasks:number}} metrics
 * @returns {{score:number, breakdown:Record<string, number>}}
 */
export function calculateProductivity(metrics) {
  const tracked = metrics.activeSeconds + metrics.idleSeconds;
  const factors = {
    activeRatio: [ratio(metrics.activeSeconds, tracked), tracked > 0],
    productiveRatio: [ratio(metrics.productiveAppSeconds, metrics.activeSeconds), metrics.activeSeconds > 0],
    completionRate: [ratio(metrics.tasksCompleted, metrics.tasksAssigned), metrics.tasksAssigned > 0],
    onTimeRate: [ratio(metrics.onTimeTasks, metrics.tasksCompleted), metrics.tasksCompleted > 0]
  };

  const used = Object.keys(factors).filter((key) => factors[key][1]);
  const totalWeight = used.reduce((total, key) => total + WEIGHTS[key], 0);
  const weighted = used.reduce((total, key) => total + WEIGHTS[key] * factors[key][0], 0);
  const score = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;

  const breakdown = Object.fromEntries(Object.entries(factors).map(([key, [value]]) => [key, Math.round(value * 10000) / 10000]));
  return { score: Math.round(score * 10) / 10, breakdown };
}

/** Percentage change between two values, rounded to one decimal. */
export function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
