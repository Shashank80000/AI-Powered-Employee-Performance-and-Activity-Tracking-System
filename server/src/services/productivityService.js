
// Application names are matched case-insensitively, on whole words ("Microsoft Word" is a work app, "1Password" and
// "Wordle" are not). Anything unknown is "neutral", e.g. a web browser, which could be used for anything.
// Communication tools count as work apps: meetings and chat are work for most roles.
const CATEGORY_RULES = {
  productive: [
    'code', 'visual studio', 'intellij', 'webstorm', 'pycharm', 'xcode', 'terminal', 'iterm', 'warp', 'figma', 'postman', 'docker',
    'excel', 'word', 'powerpoint', 'notion', 'jira', 'slack', 'teams', 'zoom', 'outlook', 'mail', 'meet', 'calendar'
  ],
  unproductive: ['netflix', 'spotify', 'steam', 'games', 'tv']
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CATEGORY_PATTERNS = Object.entries(CATEGORY_RULES).map(([category, keywords]) => [
  category,
  new RegExp(`(^|[^a-z0-9])(${keywords.map(escape).join('|')})([^a-z0-9]|$)`)
]);

export function categorizeApplication(application) {
  const name = application.toLowerCase();
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(name)) return category;
  }
  return 'neutral';
}

/** Sums a list of daily Performance records into one metrics object. */
export function sumMetrics(records) {
  const keys = ['activeSeconds', 'idleSeconds', 'productiveAppSeconds', 'tasksAssigned', 'tasksCompleted', 'onTimeTasks'];
  return Object.fromEntries(keys.map((key) => [key, records.reduce((total, record) => total + (record[key] ?? 0), 0)]));
}

export function averageScore(records) {
  const scored = records.filter((record) => record.activeSeconds + record.idleSeconds > 0);
  if (scored.length === 0) return 0;
  return Math.round((scored.reduce((total, record) => total + record.productivityScore, 0) / scored.length) * 10) / 10;
}
