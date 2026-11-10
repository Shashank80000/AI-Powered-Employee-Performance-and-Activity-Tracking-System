import { MIN_TASKS_FOR_RATE, analyseActivity, analyseSessions, analyseTasks, percent, prepareTasks } from './agentMetrics.js';
import { addDays, dayStart, lastNDays, secondsToHours, toDateKey } from './dateUtils.js';
import { averageScore, sumMetrics } from '../services/productivityService.js';

/**
 * The whole-employee report: one person over one period, built only from stored records (daily Performance,
 * DailyAnalysis, Task and WorkSession). Pure functions, so every number can be unit tested and nothing here needs a
 * language model. Task and sign-in metrics reuse agentMetrics (the AI assistant's definitions), and the score is the
 * dashboard's (average of the tracked days' productivityScore), so the three views never disagree.
 *
 * A section without data says so (`available: false` and a `note`) instead of reporting zeros as facts.
 */

/** Longest custom range, in days. */
export const MAX_RANGE_DAYS = 366;
/** Screen classification and estimate rules only apply above these amounts, so a few samples don't drive a remark. */
export const MIN_SCREEN_MINUTES = 60;
export const ON_TIME_GOOD = 80;
export const ON_TIME_LOW = 60;
export const PRODUCTIVE_SHARE_GOOD = 70;
export const PRODUCTIVE_SHARE_LOW = 40;
export const IDLE_SHARE_HIGH = 50;
export const ESTIMATE_OVER = 125;
export const ESTIMATE_UNDER = 80;

const PERIOD_DAYS = { week: 7, month: 30 };
const MINUTE_MS = 60_000;

const toMs = (value) => {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const minutes = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
const round1 = (value) => Math.round(value * 10) / 10;
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
/** Map (a hydrated document) or plain object (lean) of numbers, as entries. */
const entriesOf = (value) => (value instanceof Map ? [...value.entries()] : Object.entries(value ?? {}));
const inRange = (ms, { start, end }) => ms !== null && ms >= start.getTime() && ms < end.getTime();

/**
 * The period a request asks for: `from`/`to` (inclusive "YYYY-MM-DD" calendar days) or `period` (last 7 or 30 days,
 * ending today). Returns { start, end } with `end` exclusive, as everywhere else in the API.
 */
export function resolveRange({ period = 'week', from, to } = {}, now = new Date()) {
  if (from || to) {
    if (!from || !to) throw new RangeError('Give both from and to, or neither');
    const start = dayStart(from);
    const end = addDays(dayStart(to), 1);
    if (end <= start) throw new RangeError('from must be on or before to');
    if (Math.round((end - start) / (24 * 60 * MINUTE_MS)) > MAX_RANGE_DAYS) throw new RangeError(`Choose at most ${MAX_RANGE_DAYS} days`);
    return { start, end };
  }
  return lastNDays(PERIOD_DAYS[period] ?? 7, now);
}

/** Calendar days ("YYYY-MM-DD") from start (inclusive) to end (exclusive). */
export function daysIn({ start, end }) {
  const days = [];
  for (let day = start; day < end; day = addDays(day, 1)) days.push(toDateKey(day));
  return days;
}

/** Desktop agent activity and the dashboard's score, from the daily Performance records. */
export function summariseActivity(performance, range) {
  const records = performance.filter((record) => inRange(toMs(record.date), range));
  const tracked = records.filter((record) => (record.activeSeconds ?? 0) + (record.idleSeconds ?? 0) > 0);
  const activity = analyseActivity(records, range);
  if (tracked.length === 0) {
    return { available: false, note: 'No desktop activity was recorded in this period.', daysTracked: 0 };
  }
  const totals = sumMetrics(tracked);
  return {
    available: true,
    daysTracked: activity.daysTracked,
    activeHours: activity.activeHours,
    idleHours: activity.idleHours,
    trackedHours: secondsToHours(totals.activeSeconds + totals.idleSeconds),
    activeShare: activity.activeShare,
    idleShare: activity.activeShare === null ? null : round1(100 - activity.activeShare),
    productiveAppHours: secondsToHours(totals.productiveAppSeconds),
    productivityScore: averageScore(tracked)
  };
}

/**
 * Screen classification minutes from the analysis agent's DailyAnalysis records. Categories are read generically, so
 * a new classifier's categories (work, gaming, ...) appear without code changes here.
 */
export function summariseScreens(analyses, range) {
  const days = analyses.filter((analysis) => inRange(toMs(analysis.date), range));
  const byCategory = new Map();
  let screenshotCount = 0;
  let analyzedCount = 0;
  let productiveMinutes = 0;
  let daysAnalysed = 0;
  for (const analysis of days) {
    screenshotCount += minutes(analysis.screenshotCount);
    analyzedCount += minutes(analysis.analyzedCount);
    productiveMinutes += minutes(analysis.productiveMinutes);
    let dayMinutes = 0;
    for (const [category, value] of entriesOf(analysis.categoryMinutes)) {
      byCategory.set(category, (byCategory.get(category) ?? 0) + minutes(value));
      dayMinutes += minutes(value);
    }
    if (dayMinutes > 0 || minutes(analysis.analyzedCount) > 0) daysAnalysed += 1;
  }
  const observedMinutes = [...byCategory.values()].reduce((sum, value) => sum + value, 0);
  if (observedMinutes === 0 && analyzedCount === 0) {
    return {
      available: false,
      note: days.length ? 'Daily analyses exist, but no screenshots were classified in this period.' : 'No screenshots were analysed in this period.',
      daysAnalysed: 0,
      screenshotCount
    };
  }
  return {
    available: true,
    daysAnalysed,
    screenshotCount,
    analyzedCount,
    observedMinutes: round1(observedMinutes),
    productiveMinutes: round1(observedMinutes ? Math.min(productiveMinutes, observedMinutes) : productiveMinutes),
    productiveShare: percent(Math.min(productiveMinutes, observedMinutes), observedMinutes),
    categories: [...byCategory.entries()]
      .filter(([, value]) => value > 0)
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .map(([category, value]) => ({ category, minutes: round1(value), share: percent(value, observedMinutes) }))
  };
}

/** Camera at-desk and away totals, from the camera labels summarised into DailyAnalysis. */
export function summariseCamera(analyses, range) {
  const days = analyses.filter((analysis) => inRange(toMs(analysis.date), range) && minutes(analysis.camera?.observationCount) > 0);
  if (days.length === 0) return { available: false, note: 'No camera checks were recorded in this period (camera checks are optional).', daysObserved: 0 };
  const stateMinutes = new Map();
  let atDeskMinutes = 0;
  let awayMinutes = 0;
  let observationCount = 0;
  for (const { camera } of days) {
    observationCount += minutes(camera.observationCount);
    atDeskMinutes += minutes(camera.atDeskMinutes);
    awayMinutes += minutes(camera.awayMinutes);
    for (const [state, value] of entriesOf(camera.stateMinutes)) stateMinutes.set(state, (stateMinutes.get(state) ?? 0) + minutes(value));
  }
  return {
    available: true,
    daysObserved: days.length,
    observationCount,
    atDeskMinutes: round1(atDeskMinutes),
    awayMinutes: round1(awayMinutes),
    atDeskShare: percent(atDeskMinutes, atDeskMinutes + awayMinutes),
    states: [...stateMinutes.entries()]
      .filter(([, value]) => value > 0)
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .map(([state, value]) => ({ state, minutes: round1(value) }))
  };
}

/**
 * Task metrics (agentMetrics definitions) plus review cycles and estimate accuracy.
 * - assignedInPeriod: tasks created in the period
 * - review cycles: submissions, approvals and change requests recorded in the task history during the period
 * - approvedFirstTime: tasks completed in the period whose history never asked for changes
 * - effort: completed tasks with an estimate and logged time; actual vs expected minutes
 */
export function summariseTasks(tasks, range, now = new Date()) {
  const prepared = prepareTasks(tasks);
  const metrics = analyseTasks(prepared.tasks, { ...range, now });
  const completedItems = prepared.tasks.filter((item) => item.timingKnown && item.done && inRange(item.completed, range));

  let submissions = 0;
  let approvals = 0;
  let changesRequested = 0;
  const sentBack = new Set();
  for (const task of tasks) {
    for (const event of task.history ?? []) {
      if (!inRange(toMs(event.createdAt), range)) continue;
      if (event.kind === 'submitted') submissions += 1;
      else if (event.kind === 'approved') approvals += 1;
      else if (event.kind === 'changes-requested') {
        changesRequested += 1;
        sentBack.add(String(task._id ?? task.id));
      }
    }
  }
  const approvedFirstTime = completedItems.filter((item) => !(item.task.history ?? []).some((event) => event.kind === 'changes-requested')).length;

  const logged = completedItems.filter((item) => minutes(item.task.expectedMinutes) > 0 && minutes(item.task.actualMinutes) > 0);
  const expectedMinutes = logged.reduce((sum, item) => sum + item.task.expectedMinutes, 0);
  const actualMinutes = logged.reduce((sum, item) => sum + item.task.actualMinutes, 0);

  return {
    available: metrics.workload > 0 || completedItems.length > 0,
    ...(metrics.workload === 0 && { note: 'No tasks were assigned or open in this period.' }),
    assignedInPeriod: tasks.filter((task) => inRange(toMs(task.createdAt), range)).length,
    workload: metrics.workload,
    completed: metrics.completed,
    completionRate: metrics.completionRate,
    pending: metrics.pending,
    inReview: metrics.inReview,
    overdue: metrics.overdue,
    reviewOverdue: metrics.reviewOverdue,
    noDeadline: metrics.noDeadline,
    completedWithDeadline: metrics.completedWithDeadline,
    onTime: metrics.onTime,
    late: metrics.late,
    onTimeRate: metrics.onTimeRate,
    excludedFromRates: metrics.excludedFromRates,
    review: { submissions, approvals, changesRequested, tasksSentBack: sentBack.size, approvedFirstTime },
    effort: {
      tasksWithTime: logged.length,
      completedWithoutTime: completedItems.length - logged.length,
      expectedMinutes: Math.round(expectedMinutes),
      actualMinutes: Math.round(actualMinutes),
      actualVsExpected: percent(actualMinutes, expectedMinutes)
    },
    evidence: { overdue: metrics.evidence.overdue, late: metrics.evidence.late, reviewOverdue: metrics.evidence.reviewOverdue },
    dataQuality: prepared.issues
  };
}

/** Website sign-ins (agentMetrics definitions). */
export function summariseSessions(sessions, range, { now = new Date(), webLifetimeMs } = {}) {
  const result = analyseSessions(sessions, { ...range, now, webLifetimeMs });
  return {
    available: result.total > 0,
    ...(result.total === 0 && { note: 'No website sign-ins were recorded in this period.' }),
    total: result.total,
    closed: result.closed,
    missingLogout: result.missingLogout,
    stillOpen: result.stillOpen,
    recordedHours: result.recordedHours,
    averageSessionMinutes: result.averageSessionMinutes,
    daysWithSignIn: result.daysWithSignIn,
    longSessions: result.longSessions,
    agentSignIns: result.agentSignIns,
    dataQuality: result.issues
  };
}

/** One row per calendar day. null = nothing recorded that day, so it isn't shown as 0. */
export function dailyTrend({ performance = [], analyses = [], tasks = [], sessions = [] }, range) {
  const rows = new Map(daysIn(range).map((date) => [date, { date, score: null, activeHours: null, idleHours: null, screenMinutes: null, productiveMinutes: null, atDeskMinutes: null, tasksCompleted: 0, signedIn: false }]));
  for (const record of performance) {
    const row = rows.get(toDateKey(record.date));
    if (!row || (record.activeSeconds ?? 0) + (record.idleSeconds ?? 0) <= 0) continue;
    row.score = record.productivityScore ?? null;
    row.activeHours = secondsToHours(record.activeSeconds ?? 0);
    row.idleHours = secondsToHours(record.idleSeconds ?? 0);
  }
  for (const analysis of analyses) {
    const row = rows.get(toDateKey(analysis.date));
    if (!row) continue;
    const observed = entriesOf(analysis.categoryMinutes).reduce((sum, [, value]) => sum + minutes(value), 0);
    if (observed > 0) {
      row.screenMinutes = round1(observed);
      row.productiveMinutes = round1(Math.min(minutes(analysis.productiveMinutes), observed));
    }
    if (minutes(analysis.camera?.observationCount) > 0) row.atDeskMinutes = round1(minutes(analysis.camera.atDeskMinutes));
  }
  for (const task of tasks) {
    const completed = toMs(task.completedAt);
    if (task.status === 'done' && inRange(completed, range)) {
      const row = rows.get(toDateKey(completed));
      if (row) row.tasksCompleted += 1;
    }
  }
  for (const session of sessions) {
    const login = toMs(session.loginAt);
    if (session.client === 'agent' || !inRange(login, range)) continue;
    const row = rows.get(toDateKey(login));
    if (row) row.signedIn = true;
  }
  return [...rows.values()];
}

/**
 * Rule-based observations. Each one states the numbers it is based on (`basis`), so a reader can check it.
 * Kinds match the AI assistant's: strength, concern, neutral, data-quality. Supportive wording, never disciplinary.
 */
export function buildObservations({ activity, screen, tasks, sessions }) {
  const notes = [];
  const add = (id, kind, text, basis) => notes.push({ id, kind, text, basis });

  if (tasks.completedWithDeadline >= MIN_TASKS_FOR_RATE && tasks.onTimeRate !== null) {
    if (tasks.onTimeRate >= ON_TIME_GOOD) {
      add('tasks.onTime', 'strength', `${tasks.onTime} of ${tasks.completedWithDeadline} completed tasks with a due date were submitted on time (${tasks.onTimeRate}%).`, {
        onTime: tasks.onTime,
        completedWithDeadline: tasks.completedWithDeadline,
        onTimeRate: tasks.onTimeRate
      });
    } else if (tasks.onTimeRate < ON_TIME_LOW) {
      add(
        'tasks.late',
        'concern',
        `${tasks.late} of ${tasks.completedWithDeadline} completed tasks with a due date were submitted after it (on time: ${tasks.onTimeRate}%). A conversation about workload or due dates may help.`,
        { late: tasks.late, completedWithDeadline: tasks.completedWithDeadline, onTimeRate: tasks.onTimeRate }
      );
    }
  }
  if (tasks.overdue > 0) {
    add('tasks.overdue', 'concern', `${plural(tasks.overdue, 'open task is', 'open tasks are')} past the due date and not yet submitted. Worth checking for blockers or agreeing new dates.`, {
      overdue: tasks.overdue
    });
  }
  if (tasks.reviewOverdue > 0) {
    add('tasks.reviewOverdue', 'neutral', `${plural(tasks.reviewOverdue, 'submitted task is', 'submitted tasks are')} past the due date and waiting for review; the next step is the reviewer's.`, {
      reviewOverdue: tasks.reviewOverdue
    });
  }
  if (tasks.review.changesRequested >= 2) {
    add(
      'tasks.changesRequested',
      'neutral',
      `Reviews asked for changes ${tasks.review.changesRequested} times on ${plural(tasks.review.tasksSentBack, 'task')}. Agreeing what "done" looks like before starting can shorten review rounds.`,
      { changesRequested: tasks.review.changesRequested, tasksSentBack: tasks.review.tasksSentBack }
    );
  } else if (tasks.completed >= MIN_TASKS_FOR_RATE && tasks.review.approvedFirstTime === tasks.completed) {
    add('tasks.approvedFirstTime', 'strength', `All ${tasks.completed} completed tasks were approved without being sent back for changes.`, {
      completed: tasks.completed,
      approvedFirstTime: tasks.review.approvedFirstTime
    });
  }
  const { effort } = tasks;
  if (effort.tasksWithTime >= MIN_TASKS_FOR_RATE && effort.actualVsExpected !== null) {
    const basis = { tasksWithTime: effort.tasksWithTime, expectedMinutes: effort.expectedMinutes, actualMinutes: effort.actualMinutes, actualVsExpected: effort.actualVsExpected };
    if (effort.actualVsExpected > ESTIMATE_OVER) {
      add('tasks.effortOver', 'neutral', `${effort.tasksWithTime} completed tasks took ${effort.actualMinutes} minutes against ${effort.expectedMinutes} estimated (${effort.actualVsExpected}%). The estimates may need revisiting.`, basis);
    } else if (effort.actualVsExpected < ESTIMATE_UNDER) {
      add('tasks.effortUnder', 'neutral', `${effort.tasksWithTime} completed tasks took ${effort.actualMinutes} minutes against ${effort.expectedMinutes} estimated (${effort.actualVsExpected}%), quicker than planned.`, basis);
    } else {
      add('tasks.effortOnEstimate', 'strength', `${effort.tasksWithTime} completed tasks took ${effort.actualMinutes} minutes against ${effort.expectedMinutes} estimated (${effort.actualVsExpected}%), close to plan.`, basis);
    }
  }
  if (tasks.workload === 0) add('tasks.none', 'neutral', 'No tasks were assigned or open in this period, so task rates are not available.', { workload: 0 });

  if (screen.available && screen.observedMinutes >= MIN_SCREEN_MINUTES && screen.productiveShare !== null) {
    const basis = { productiveMinutes: screen.productiveMinutes, observedMinutes: screen.observedMinutes, productiveShare: screen.productiveShare };
    if (screen.productiveShare >= PRODUCTIVE_SHARE_GOOD) {
      add('screen.productive', 'strength', `${screen.productiveMinutes} of ${screen.observedMinutes} classified screen minutes (${screen.productiveShare}%) were work-related.`, basis);
    } else if (screen.productiveShare < PRODUCTIVE_SHARE_LOW) {
      add(
        'screen.lowProductive',
        'concern',
        `${screen.productiveMinutes} of ${screen.observedMinutes} classified screen minutes (${screen.productiveShare}%) were work-related. Screen classification is automated and can mislabel work, so check the daily analyses before drawing conclusions.`,
        basis
      );
    }
  }
  if (activity.available && activity.idleShare !== null && activity.idleShare > IDLE_SHARE_HIGH) {
    add('activity.idle', 'neutral', `Idle time was ${activity.idleHours} of ${activity.trackedHours} tracked hours (${activity.idleShare}%). Idle includes reading, meetings, calls and breaks, so it is not a measure of effort.`, {
      idleHours: activity.idleHours,
      trackedHours: activity.trackedHours,
      idleShare: activity.idleShare
    });
  }
  if (sessions.missingLogout > 0) {
    add('sessions.missingLogout', 'data-quality', `${plural(sessions.missingLogout, 'sign-in has', 'sign-ins have')} no recorded sign-out, so signed-in hours are understated.`, {
      missingLogout: sessions.missingLogout
    });
  }
  if (tasks.excludedFromRates > 0) {
    add('tasks.excluded', 'data-quality', `${plural(tasks.excludedFromRates, 'task has', 'tasks have')} inconsistent completion times and were left out of the task rates.`, {
      excludedFromRates: tasks.excludedFromRates
    });
  }
  return notes;
}

/** Everything in the report, from records already limited to one employee. */
export function buildEmployeeOverview({ performance = [], analyses = [], tasks = [], sessions = [] }, { range, now = new Date(), webLifetimeMs } = {}) {
  const activity = summariseActivity(performance, range);
  const screen = summariseScreens(analyses, range);
  const camera = summariseCamera(analyses, range);
  const { dataQuality: taskIssues, ...taskSummary } = summariseTasks(tasks, range, now);
  const { dataQuality: sessionIssues, ...sessionSummary } = summariseSessions(sessions, range, { now, webLifetimeMs });
  const trend = dailyTrend({ performance, analyses, tasks, sessions }, range);
  const daysWithRecords = trend.filter((row) => row.activeHours !== null || row.signedIn || row.screenMinutes !== null || row.tasksCompleted > 0).length;

  return {
    range: { start: toDateKey(range.start), end: toDateKey(addDays(range.end, -1)), days: trend.length },
    daysWithRecords,
    activity,
    screen,
    camera,
    tasks: taskSummary,
    sessions: sessionSummary,
    trend,
    observations: buildObservations({ activity, screen, tasks: taskSummary, sessions: sessionSummary }),
    dataQuality: [...taskIssues, ...sessionIssues]
  };
}
