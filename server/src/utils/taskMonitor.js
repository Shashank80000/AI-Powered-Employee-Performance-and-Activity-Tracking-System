/**
 * Task monitor: checks every task against fixed rules and flags the ones that are not on track, so a manager sees
 * problems early. Plain rules on stored fields (no AI); every flag names its rule and carries the numbers that
 * triggered it. Pure: the caller passes the tasks, the current time and (optionally) the assignees and creators.
 *
 * Definitions shared with agentMetrics (the AI agent and the employee report use the same ones):
 * - open:     any status except done
 * - overdue:  to do or in progress, and the due date has passed. Submitted work waiting for review is the
 *             manager's to act on, so it is never the employee's overdue work (agentMetrics "overdue").
 * - the data checks done-without-completion-time, completion-time-on-open-task, completed-before-created and
 *   due-before-created flag exactly the tasks prepareTasks() reports (a test keeps the two in step).
 *
 * All comparisons are on instants (milliseconds), and messages use durations ("2 days"), never calendar dates,
 * so the result is the same in every time zone.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Every threshold in one place. Calendar time, not working time: see the notes for why each is that long. */
export const MONITOR_THRESHOLDS = Object.freeze({
  // Overdue becomes critical this many days after the due date (or straight away for high priority work).
  overdueCriticalDays: 3,
  // A task still "To do" this close to its due date is flagged. Due dates are set at 18:00, so 48 hours covers
  // "due tomorrow evening" from this morning, with at least a working day left to act.
  dueSoonHours: 48,
  // In progress with no update (status change, comment, logged time, review) for longer than this. Four calendar
  // days is about two working days even across a weekend, so a Friday update isn't stalled on Monday.
  stalledDays: 4,
  // Still "To do", with nothing happening, this long after it was assigned (and not already due soon or overdue).
  notStartedDays: 7,
  // Submitted and waiting for the manager's review longer than this (calendar days; a Friday submission is not
  // flagged before Monday evening). Critical at the second threshold.
  reviewWaitDays: 3,
  reviewWaitCriticalDays: 7,
  // Logged time above this multiple of the estimate on an open task. 1.5 leaves room for normal estimating error;
  // twice the estimate is critical.
  overBudgetFactor: 1.5,
  overBudgetCriticalFactor: 2,
  // Sent back for changes this many times or more.
  reworkCount: 2
});

export const SEVERITIES = ['critical', 'warning', 'info'];

/**
 * What each rule means. `attention` is who is expected to act: the assignee, the reviewer (manager or admin),
 * or an administrator fixing the records. Reviewer flags never count against the employee.
 */
export const MONITOR_RULES = Object.freeze({
  overdue: { category: 'progress', attention: 'assignee', title: 'Overdue' },
  'due-soon-not-started': { category: 'progress', attention: 'assignee', title: 'Due soon, not started' },
  stalled: { category: 'progress', attention: 'assignee', title: 'No recent progress' },
  'not-started': { category: 'progress', attention: 'assignee', title: 'Not started' },
  'review-waiting': { category: 'review', attention: 'reviewer', title: 'Waiting for review' },
  'over-budget': { category: 'effort', attention: 'reviewer', title: 'Over the time estimate' },
  'repeated-rework': { category: 'review', attention: 'reviewer', title: 'Sent back repeatedly' },
  'done-without-completion-time': { category: 'data', attention: 'admin', title: 'Done without a completion time' },
  'completion-time-on-open-task': { category: 'data', attention: 'admin', title: 'Completion time on an open task' },
  'review-without-submission-time': { category: 'data', attention: 'admin', title: 'In review without a submission time' },
  'completed-before-created': { category: 'data', attention: 'admin', title: 'Completed before it was created' },
  'due-before-created': { category: 'data', attention: 'admin', title: 'Due before it was created' },
  'invalid-time-logged': { category: 'data', attention: 'admin', title: 'Invalid logged time' },
  'assignee-missing': { category: 'data', attention: 'admin', title: 'Assignee no longer exists' },
  'assignee-inactive': { category: 'data', attention: 'reviewer', title: 'Assigned to a deactivated employee' },
  'organization-mismatch': { category: 'data', attention: 'admin', title: 'Assignee in another organization' }
});

const toMs = (value) => {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const has = (ms) => ms !== null;
const iso = (ms) => (has(ms) ? new Date(ms).toISOString() : null);
const round1 = (value) => Math.round(value * 10) / 10;
const idOf = (value) => (value === null || value === undefined ? null : String(value._id ?? value.id ?? value));
const lookup = (collection, key) => (collection instanceof Map ? collection.get(key) : collection?.[key]);
const orgKey = (organization) => (organization ? String(organization) : 'original');

/** "less than an hour", "5 hours", "3 days": whole units, rounded down, so it never overstates. */
export function describeSpan(ms) {
  if (ms < HOUR_MS) return 'less than an hour';
  if (ms < 2 * DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${Math.floor(ms / DAY_MS)} days`;
}

/** The latest moment anything happened to the task: created, saved (status, logged time, edits) or a history entry. */
function lastActivity(task) {
  const times = [toMs(task.createdAt), toMs(task.updatedAt), ...(task.history ?? []).map((event) => toMs(event.createdAt))].filter(has);
  return times.length ? Math.max(...times) : null;
}

/**
 * Flags for every task given.
 * @param {object[]} tasks Task documents (or lean objects).
 * @param {object} [options]
 * @param {Date} [options.now]
 * @param {Map|object} [options.employees] assignee id -> { status, organization }. When given, a task whose assignee
 *   is missing from it is flagged as assigned to someone who no longer exists. Leave it out to skip those checks.
 * @param {Map|object} [options.creators] creator user id -> { organization }, for the organization check.
 * @returns {{ flags: object[], summary: object, thresholds: object }}
 */
export function monitorTasks(tasks, { now = new Date(), employees, creators } = {}) {
  const nowMs = new Date(now).getTime();
  const T = MONITOR_THRESHOLDS;
  const flags = [];

  for (const task of tasks) {
    const taskId = idOf(task);
    const flag = (rule, severity, message, evidence) => flags.push({ taskId, rule, severity, ...MONITOR_RULES[rule], message, evidence });
    const status = task.status;
    const open = status !== 'done';
    const priority = task.priority ?? 'medium';
    const created = toMs(task.createdAt);
    const due = toMs(task.dueDate);
    const completed = toMs(task.completedAt);
    const submitted = toMs(task.submittedAt);
    const expected = Number(task.expectedMinutes);
    const actual = task.actualMinutes === undefined || task.actualMinutes === null ? 0 : Number(task.actualMinutes);
    const history = task.history ?? [];

    // ---- Progress (the assignee's part) ----
    let overdue = false;
    let dueSoon = false;
    if ((status === 'todo' || status === 'in-progress') && has(due) && due < nowMs) {
      overdue = true;
      const lateMs = nowMs - due;
      const daysLate = round1(lateMs / DAY_MS);
      const critical = priority === 'high' || lateMs >= T.overdueCriticalDays * DAY_MS;
      flag('overdue', critical ? 'critical' : 'warning', `Due ${describeSpan(lateMs)} ago and not submitted yet (${priority} priority).`, {
        dueDate: iso(due),
        hoursLate: round1(lateMs / HOUR_MS),
        daysLate,
        priority,
        status,
        criticalAfterDays: T.overdueCriticalDays
      });
    }
    if (status === 'todo' && has(due) && due >= nowMs && due - nowMs <= T.dueSoonHours * HOUR_MS) {
      dueSoon = true;
      flag('due-soon-not-started', priority === 'high' ? 'critical' : 'warning', `Due in ${describeSpan(due - nowMs)} and not started yet.`, {
        dueDate: iso(due),
        hoursLeft: round1((due - nowMs) / HOUR_MS),
        thresholdHours: T.dueSoonHours,
        priority,
        status
      });
    }
    const last = lastActivity(task);
    if (status === 'in-progress' && has(last) && nowMs - last > T.stalledDays * DAY_MS) {
      flag('stalled', 'warning', `In progress with no update for ${describeSpan(nowMs - last)}.`, {
        lastActivityAt: iso(last),
        daysSinceActivity: round1((nowMs - last) / DAY_MS),
        thresholdDays: T.stalledDays,
        status
      });
    }
    if (status === 'todo' && !overdue && !dueSoon && has(created) && has(last) && nowMs - last > T.notStartedDays * DAY_MS) {
      flag('not-started', 'info', `Assigned ${describeSpan(nowMs - created)} ago and not started yet.`, {
        createdAt: iso(created),
        lastActivityAt: iso(last),
        daysSinceActivity: round1((nowMs - last) / DAY_MS),
        thresholdDays: T.notStartedDays,
        status
      });
    }

    // ---- Review and effort (the reviewer's part; worded neutrally, never counted against the employee) ----
    if (status === 'review' && has(submitted) && nowMs - submitted > T.reviewWaitDays * DAY_MS) {
      const waitMs = nowMs - submitted;
      flag('review-waiting', waitMs > T.reviewWaitCriticalDays * DAY_MS ? 'critical' : 'warning', `Submitted ${describeSpan(waitMs)} ago and waiting for review.`, {
        submittedAt: iso(submitted),
        daysWaiting: round1(waitMs / DAY_MS),
        thresholdDays: T.reviewWaitDays,
        criticalAfterDays: T.reviewWaitCriticalDays,
        ...(has(due) && { dueDate: iso(due), submittedOnTime: submitted <= due })
      });
    }
    if (open && Number.isFinite(expected) && expected > 0 && Number.isFinite(actual) && actual > expected * T.overBudgetFactor) {
      const ratio = actual / expected;
      flag(
        'over-budget',
        ratio >= T.overBudgetCriticalFactor ? 'critical' : 'warning',
        `${Math.round(actual)} minutes logged against an estimate of ${Math.round(expected)} (${round1(ratio)}×). Check the scope or the estimate.`,
        { actualMinutes: Math.round(actual), expectedMinutes: Math.round(expected), ratio: round1(ratio), thresholdFactor: T.overBudgetFactor, criticalFactor: T.overBudgetCriticalFactor }
      );
    }
    const sentBack = history.filter((event) => event.kind === 'changes-requested');
    if (open && sentBack.length >= T.reworkCount) {
      flag('repeated-rework', 'warning', `Sent back for changes ${sentBack.length} times. The requirements may need clarifying.`, {
        changesRequested: sentBack.length,
        threshold: T.reworkCount,
        lastSentBackAt: iso(Math.max(...sentBack.map((event) => toMs(event.createdAt) ?? 0)) || null)
      });
    }

    // ---- Data integrity (the "is the record itself right" checks) ----
    if (status === 'done' && !has(completed)) {
      flag('done-without-completion-time', 'warning', 'Marked done but has no completion time, so it is left out of completion and on-time rates.', { status, completedAt: null });
    }
    if (open && has(completed)) {
      flag('completion-time-on-open-task', 'info', 'Not done but carries a completion time; the completion time is ignored.', { status, completedAt: iso(completed) });
    }
    if (status === 'review' && !has(submitted)) {
      flag('review-without-submission-time', 'warning', 'Waiting for review but has no submission time, so the review wait and on-time status cannot be measured.', { status, submittedAt: null });
    }
    if (has(completed) && has(created) && completed < created) {
      flag('completed-before-created', 'critical', `Completion time is ${describeSpan(created - completed)} before the creation time.`, { createdAt: iso(created), completedAt: iso(completed) });
    }
    // One day of slack, as in agentMetrics: a task created in the evening may be due earlier that same day.
    if (has(due) && has(created) && due < created - DAY_MS) {
      flag('due-before-created', 'info', `Due date is ${describeSpan(created - due)} before the task was created.`, { createdAt: iso(created), dueDate: iso(due), toleranceHours: 24 });
    }
    if (!Number.isFinite(actual) || actual < 0) {
      flag('invalid-time-logged', 'warning', 'Logged time is negative or not a number.', { actualMinutes: task.actualMinutes ?? null });
    }

    const assigneeId = idOf(task.assignedTo);
    if (employees) {
      const assignee = lookup(employees, assigneeId);
      if (!assignee) {
        flag('assignee-missing', open ? 'critical' : 'info', 'Assigned to an employee record that no longer exists, so nobody can see or finish it.', { assignedTo: assigneeId, status });
      } else {
        if (open && assignee.status === 'inactive') {
          flag('assignee-inactive', 'warning', 'Assigned to a deactivated employee, who can no longer sign in to finish it. Reassign it.', { assignedTo: assigneeId, employeeStatus: assignee.status, status });
        }
        const creator = creators && lookup(creators, idOf(task.createdBy));
        if (creator && orgKey(creator.organization) !== orgKey(assignee.organization)) {
          // Neither the creator nor the other organization is named: the point is only that the two differ.
          flag('organization-mismatch', 'critical', 'Created by someone in a different organization from the assignee.', { assignedTo: assigneeId, sameOrganization: false });
        }
      }
    }
  }

  const rank = (severity) => SEVERITIES.indexOf(severity);
  flags.sort((a, b) => rank(a.severity) - rank(b.severity) || a.rule.localeCompare(b.rule) || String(a.taskId).localeCompare(String(b.taskId)));
  return { flags, summary: summarise(tasks, flags), thresholds: MONITOR_THRESHOLDS };
}

/** Counts for the panel header: how many tasks were checked and flagged, by severity and by rule. */
export function summarise(tasks, flags) {
  const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  const byRule = {};
  for (const flag of flags) {
    bySeverity[flag.severity] += 1;
    byRule[flag.rule] = (byRule[flag.rule] ?? 0) + 1;
  }
  return {
    tasksChecked: tasks.length,
    openTasks: tasks.filter((task) => task.status !== 'done').length,
    flaggedTasks: new Set(flags.map((flag) => flag.taskId)).size,
    flags: flags.length,
    bySeverity,
    byRule
  };
}

/** What an employee sees about their own tasks: their part and the reviewer's (neutral), not the record checks. */
export const forEmployee = (flags) => flags.filter((flag) => flag.attention !== 'admin');
