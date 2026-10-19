import { toDateKey } from './dateUtils.js';

/**
 * Verified metrics for the AI agent. Everything here is plain arithmetic on database records, so it can be unit
 * tested and so the language model never calculates a number itself: it only interprets these results.
 *
 * Definitions (for one period [start, end), "as of" = the earlier of now and the period end):
 * - workload:        tasks that existed during the period and weren't already done before it started
 * - completed:       tasks approved as done (completedAt) inside the period
 * - completion rate: completed / workload
 * - pending:         workload tasks not done as of the "as of" time
 * - overdue:         pending tasks whose due date has passed
 * - on-time rate:    completed tasks with a due date, finished at or before it / completed tasks with a due date
 * Signed-in time and desktop activity are recorded presence and input, never a measure of productive work.
 */

/** Rates over fewer tasks than this are reported but not compared between periods. */
export const MIN_TASKS_FOR_RATE = 3;
/** Sessions longer than this are flagged: usually someone who never signed out. */
export const LONG_SESSION_HOURS = 16;
/** Pending tasks due within this many days are "due soon". */
export const DUE_SOON_DAYS = 3;
/** Evidence lists sent to the model and the page are capped at this many records. */
export const EVIDENCE_LIMIT = 10;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ISSUES = {
  DONE_WITHOUT_COMPLETION_TIME: ['warning', 'Tasks marked done without a completion time: left out of completion and on-time rates.'],
  COMPLETION_TIME_ON_OPEN_TASK: ['warning', 'Tasks that are not done but carry a completion time: the completion time was ignored.'],
  COMPLETED_BEFORE_CREATED: ['error', 'Tasks completed before they were created: left out of completion and on-time rates.'],
  DUE_BEFORE_CREATED: ['info', 'Tasks whose due date is earlier than their creation date.'],
  MISSING_CREATED_AT: ['warning', 'Tasks without a creation date: assumed to exist for the whole period.'],
  POSSIBLE_DUPLICATE_TASK: ['warning', 'Tasks with the same title, assignee and due date: possibly entered twice. Both are still counted.'],
  MISSING_LOGIN_TIME: ['error', 'Sign-in records without a sign-in time: ignored.'],
  LOGOUT_BEFORE_LOGIN: ['error', 'Sign-in records whose sign-out is earlier than the sign-in: ignored.'],
  DUPLICATE_SESSION: ['warning', 'Duplicate sign-in records (same sign-in and sign-out time): counted once.'],
  MISSING_LOGOUT: ['warning', 'Sign-ins with no recorded sign-out (the browser was closed or the session expired): no duration counted.'],
  LONG_SESSION: ['warning', `Sessions longer than ${LONG_SESSION_HOURS} hours: probably not signed out. Counted as recorded, not as work.`]
};

const toMs = (value) => {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const has = (ms) => ms !== null;

/** Percentage with one decimal, or null when there is nothing to divide by. */
export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const hours = (ms) => Math.round((ms / HOUR_MS) * 10) / 10;
const normaliseTitle = (title) => String(title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** What the model and the page see of a task: no descriptions or comments. Dates are local calendar days. */
export function taskRef(task) {
  return {
    id: String(task._id ?? task.id),
    title: task.title,
    status: task.status,
    ...(task.priority && { priority: task.priority }),
    ...(has(toMs(task.dueDate)) && { due: toDateKey(task.dueDate) }),
    ...(has(toMs(task.completedAt)) && { completed: toDateKey(task.completedAt) })
  };
}

function sessionRef(session) {
  return {
    id: String(session._id ?? session.id),
    ...(has(toMs(session.loginAt)) && { signIn: new Date(session.loginAt).toISOString() }),
    ...(has(toMs(session.logoutAt)) && { signOut: new Date(session.logoutAt).toISOString() })
  };
}

/** Collects data-quality problems by kind, each with the affected records. */
class IssueLog {
  constructor() {
    this.byCode = new Map();
  }

  add(code, ref) {
    const entry = this.byCode.get(code) ?? { code, severity: ISSUES[code][0], message: ISSUES[code][1], count: 0, records: [] };
    entry.count += 1;
    if (entry.records.length < EVIDENCE_LIMIT) entry.records.push(ref);
    this.byCode.set(code, entry);
  }

  list() {
    return [...this.byCode.values()];
  }
}

/** Validates task records once, so every period is measured on the same cleaned data. */
export function prepareTasks(tasks) {
  const issues = new IssueLog();
  const prepared = tasks.map((task) => {
    const ref = taskRef(task);
    const created = toMs(task.createdAt);
    let completed = toMs(task.completedAt);
    const due = toMs(task.dueDate);
    let timingKnown = true;

    if (!has(created)) issues.add('MISSING_CREATED_AT', ref);
    if (task.status === 'done' && !has(completed)) {
      issues.add('DONE_WITHOUT_COMPLETION_TIME', ref);
      timingKnown = false;
    }
    if (task.status !== 'done' && has(completed)) {
      issues.add('COMPLETION_TIME_ON_OPEN_TASK', ref);
      completed = null;
    }
    if (has(completed) && has(created) && completed < created) {
      issues.add('COMPLETED_BEFORE_CREATED', ref);
      timingKnown = false;
    }
    if (has(due) && has(created) && due < created - DAY_MS) issues.add('DUE_BEFORE_CREATED', ref);

    return { task, ref, created, completed, due, done: task.status === 'done', timingKnown };
  });

  const groups = new Map();
  for (const item of prepared) {
    const key = [String(item.task.assignedTo ?? ''), normaliseTitle(item.task.title), has(item.due) ? toDateKey(item.task.dueDate) : '-'].join('|');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    if (group.length > 1) for (const item of group) issues.add('POSSIBLE_DUPLICATE_TASK', item.ref);
  }

  return { tasks: prepared, issues: issues.list() };
}

const refs = (items) => items.slice(0, EVIDENCE_LIMIT).map((item) => item.ref);

/** Task metrics for one period. `prepared` comes from prepareTasks(). */
export function analyseTasks(prepared, { start, end, now = new Date() }) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const asOf = Math.min(now.getTime(), endMs);
  const isCurrent = now.getTime() < endMs;

  // Tasks whose completion time is unknown or impossible can't be placed in a period; they're reported as issues.
  const measurable = prepared.filter((item) => item.timingKnown);
  const existed = (item, at) => !has(item.created) || item.created < at;
  const doneBefore = (item, at) => item.done && has(item.completed) && item.completed < at;

  const workload = measurable.filter((item) => existed(item, endMs) && !doneBefore(item, startMs));
  const completed = workload.filter((item) => item.done && item.completed >= startMs && item.completed < endMs);
  const pending = workload.filter((item) => existed(item, asOf) && !(item.done && item.completed <= asOf));
  const overdue = pending.filter((item) => has(item.due) && item.due < asOf);
  const dueSoon = pending.filter((item) => has(item.due) && item.due >= asOf && item.due < asOf + DUE_SOON_DAYS * DAY_MS);
  const noDeadline = workload.filter((item) => !has(item.due));
  const withDeadline = completed.filter((item) => has(item.due));
  const onTime = withDeadline.filter((item) => item.completed <= item.due);
  const late = withDeadline.filter((item) => item.completed > item.due);
  // Current status only describes the period that is still running.
  const inReview = isCurrent ? pending.filter((item) => item.task.status === 'review') : [];

  return {
    workload: workload.length,
    completed: completed.length,
    completionRate: percent(completed.length, workload.length),
    pending: pending.length,
    inReview: inReview.length,
    overdue: overdue.length,
    dueSoon: isCurrent ? dueSoon.length : null,
    noDeadline: noDeadline.length,
    completedWithDeadline: withDeadline.length,
    onTime: onTime.length,
    late: late.length,
    onTimeRate: percent(onTime.length, withDeadline.length),
    excludedFromRates: prepared.length - measurable.length,
    evidence: {
      completed: refs(completed),
      pending: refs(pending),
      overdue: refs(overdue),
      dueSoon: isCurrent ? refs(dueSoon) : [],
      inReview: refs(inReview),
      late: refs(late),
      noDeadline: refs(noDeadline)
    }
  };
}

/** Parses a token lifetime such as "3d", "12h" or "30m" (the format env.js accepts) into milliseconds. */
export function durationMs(text) {
  const match = /^(\d+)\s*(ms|s|m|h|d|w|y)?$/.exec(String(text).trim());
  if (!match) return null;
  const unit = { ms: 1, s: 1000, m: 60_000, h: HOUR_MS, d: DAY_MS, w: 7 * DAY_MS, y: 365.25 * DAY_MS }[match[2] ?? 'ms'];
  return Number(match[1]) * unit;
}

/**
 * Website sign-in/sign-out sessions in one period. A session without a sign-out is "missing" once its sign-in
 * token has expired (it can no longer be in use), and "possibly still signed in" before that.
 * Desktop agent sign-ins are only counted: they last for weeks and say nothing about the working day.
 */
export function analyseSessions(sessions, { start, end, now = new Date(), webLifetimeMs = 3 * DAY_MS }) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const issues = new IssueLog();
  const seen = new Set();
  const intervals = [];
  const missingLogout = [];
  const days = new Set();
  let stillOpen = 0;
  let agentSignIns = 0;
  let total = 0;
  let longSessions = 0;
  let rawClosedMs = 0;

  for (const session of sessions) {
    const ref = sessionRef(session);
    const login = toMs(session.loginAt);
    const logout = toMs(session.logoutAt);
    if (!has(login)) {
      issues.add('MISSING_LOGIN_TIME', ref);
      continue;
    }
    if (has(logout) && logout < login) {
      issues.add('LOGOUT_BEFORE_LOGIN', ref);
      continue;
    }
    if (login >= endMs || (has(logout) && logout <= startMs)) continue;

    // A duplicate is the same record stored twice: identical sign-in and sign-out. Two real sign-ins can share a second.
    const key = [session.client ?? 'web', String(session.user ?? session.employee ?? ''), login, logout ?? ''].join('|');
    if (seen.has(key)) {
      issues.add('DUPLICATE_SESSION', ref);
      continue;
    }
    seen.add(key);

    if (session.client === 'agent') {
      if (login >= startMs) agentSignIns += 1;
      continue;
    }

    total += 1;
    days.add(toDateKey(new Date(Math.max(login, startMs))));
    if (!has(logout)) {
      if (now.getTime() - login < webLifetimeMs) stillOpen += 1;
      else {
        issues.add('MISSING_LOGOUT', ref);
        missingLogout.push(ref);
      }
      continue;
    }
    if (logout - login > LONG_SESSION_HOURS * HOUR_MS) {
      issues.add('LONG_SESSION', ref);
      longSessions += 1;
    }
    rawClosedMs += logout - login;
    intervals.push([Math.max(login, startMs), Math.min(logout, endMs)]);
  }

  // Union of the closed sessions, so two browsers open at once aren't counted twice.
  intervals.sort((a, b) => a[0] - b[0]);
  let recordedMs = 0;
  let overlapping = 0;
  let current = null;
  for (const interval of intervals) {
    if (current && interval[0] < current[1]) {
      overlapping += 1;
      current[1] = Math.max(current[1], interval[1]);
    } else {
      if (current) recordedMs += current[1] - current[0];
      current = [...interval];
    }
  }
  if (current) recordedMs += current[1] - current[0];

  return {
    total,
    closed: intervals.length,
    missingLogout: missingLogout.length,
    stillOpen,
    recordedHours: hours(recordedMs),
    averageSessionMinutes: intervals.length ? Math.round(rawClosedMs / intervals.length / 60_000) : null,
    daysWithSignIn: days.size,
    overlapping,
    longSessions,
    agentSignIns,
    evidence: { missingLogout: missingLogout.slice(0, EVIDENCE_LIMIT) },
    issues: issues.list()
  };
}

/** Desktop agent activity from the daily Performance records: input activity, not productive work. */
export function analyseActivity(records, { start, end }) {
  const inPeriod = records.filter((record) => {
    const day = toMs(record.date);
    return has(day) && day >= start.getTime() && day < end.getTime();
  });
  const active = inPeriod.reduce((sum, record) => sum + (record.activeSeconds ?? 0), 0);
  const idle = inPeriod.reduce((sum, record) => sum + (record.idleSeconds ?? 0), 0);
  return {
    daysTracked: inPeriod.filter((record) => (record.activeSeconds ?? 0) + (record.idleSeconds ?? 0) > 0).length,
    activeHours: hours(active * 1000),
    idleHours: hours(idle * 1000),
    activeShare: percent(active, active + idle)
  };
}

/**
 * Current vs previous period for one metric. Rates are only compared when both periods have at least
 * MIN_TASKS_FOR_RATE tasks behind them, so a change from 1 of 1 to 0 of 1 isn't reported as a 100-point drop.
 */
export function compare(current, previous, { currentBase, previousBase, minBase = 0 } = {}) {
  const enough = currentBase === undefined || (currentBase >= minBase && previousBase >= minBase);
  if (current === null || previous === null || !enough) {
    return { current, previous, change: null, comparable: false, reason: 'Not enough data in both periods to compare' };
  }
  return { current, previous, change: Math.round((current - previous) * 10) / 10, comparable: true };
}

/** Everything measured for one employee: current period, previous period, trends and data quality. */
export function analyseEmployee({ tasks = [], sessions = [], performance = [] }, { range, previous, now = new Date(), webLifetimeMs }) {
  const prepared = prepareTasks(tasks);
  const current = {
    tasks: analyseTasks(prepared.tasks, { ...range, now }),
    sessions: analyseSessions(sessions, { ...range, now, webLifetimeMs }),
    activity: analyseActivity(performance, range)
  };
  const before = {
    tasks: analyseTasks(prepared.tasks, { ...previous, now }),
    sessions: analyseSessions(sessions, { ...previous, now, webLifetimeMs }),
    activity: analyseActivity(performance, previous)
  };
  const trends = {
    completionRate: compare(current.tasks.completionRate, before.tasks.completionRate, {
      currentBase: current.tasks.workload,
      previousBase: before.tasks.workload,
      minBase: MIN_TASKS_FOR_RATE
    }),
    onTimeRate: compare(current.tasks.onTimeRate, before.tasks.onTimeRate, {
      currentBase: current.tasks.completedWithDeadline,
      previousBase: before.tasks.completedWithDeadline,
      minBase: MIN_TASKS_FOR_RATE
    }),
    completed: compare(current.tasks.completed, before.tasks.completed),
    overdue: compare(current.tasks.overdue, before.tasks.overdue),
    recordedSessionHours: compare(current.sessions.recordedHours, before.sessions.recordedHours, {
      currentBase: current.sessions.closed,
      previousBase: before.sessions.closed,
      minBase: 1
    })
  };
  return {
    current,
    previous: before,
    trends,
    dataQuality: [...prepared.issues, ...current.sessions.issues]
  };
}
