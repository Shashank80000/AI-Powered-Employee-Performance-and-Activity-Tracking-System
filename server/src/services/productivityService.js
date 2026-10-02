import { calculateProductivity } from '../utils/productivityCalculator.js';

// Application names are matched case-insensitively. Anything unknown is "neutral".
const CATEGORY_RULES = {
  productive: ['code', 'visual studio', 'intellij', 'webstorm', 'pycharm', 'xcode', 'terminal', 'iterm', 'warp', 'figma', 'postman', 'docker', 'excel', 'word', 'powerpoint', 'notion', 'jira'],
  unproductive: ['netflix', 'spotify', 'steam', 'games', 'tv']
};

export function categorizeApplication(application) {
  const name = application.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((keyword) => name.includes(keyword))) return category;
  }
  return 'neutral';
}

/** Sums a list of daily Performance records into one metrics object. */
export function sumMetrics(records) {
  const keys = ['activeSeconds', 'idleSeconds', 'productiveAppSeconds', 'tasksAssigned', 'tasksCompleted', 'onTimeTasks'];
  return Object.fromEntries(keys.map((key) => [key, records.reduce((total, record) => total + (record[key] ?? 0), 0)]));
}

/** Score for a set of daily records taken together. */
export function scoreRecords(records) {
  return calculateProductivity(sumMetrics(records));
}

export function averageScore(records) {
  const scored = records.filter((record) => record.activeSeconds + record.idleSeconds > 0);
  if (scored.length === 0) return 0;
  return Math.round((scored.reduce((total, record) => total + record.productivityScore, 0) / scored.length) * 10) / 10;
}
