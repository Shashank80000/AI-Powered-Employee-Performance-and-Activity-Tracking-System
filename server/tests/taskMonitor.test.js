import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareTasks } from '../src/utils/agentMetrics.js';
import { MONITOR_THRESHOLDS as T, describeSpan, forEmployee, monitorTasks } from '../src/utils/taskMonitor.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// A fixed instant, so nothing depends on the machine's clock or time zone.
const NOW = new Date('2026-11-10T12:00:00.000Z');
const at = (offsetMs) => new Date(NOW.getTime() + offsetMs);

let counter = 0;
function task(fields = {}) {
  counter += 1;
  return {
    _id: `t${counter}`,
    title: `Task ${counter}`,
    assignedTo: 'e1',
    createdBy: 'u1',
    status: 'todo',
    priority: 'medium',
    expectedMinutes: 60,
    actualMinutes: 0,
    createdAt: at(-1 * HOUR),
    updatedAt: at(-1 * HOUR),
    history: [],
    ...fields
  };
}
const run = (tasks, options = {}) => monitorTasks(tasks, { now: NOW, ...options });
const rulesOf = (tasks, options) => run(tasks, options).flags.map((flag) => flag.rule);
const only = (rule, tasks, options) => run(tasks, options).flags.filter((flag) => flag.rule === rule);

test('a healthy task raises no flags', () => {
  assert.deepEqual(rulesOf([task({ dueDate: at(5 * DAY) })]), []);
  assert.deepEqual(rulesOf([task({ status: 'in-progress', dueDate: at(5 * DAY), actualMinutes: 30 })]), []);
  const done = task({ status: 'done', createdAt: at(-5 * DAY), submittedAt: at(-2 * DAY), completedAt: at(-1 * DAY), dueDate: at(-3 * DAY) });
  assert.deepEqual(rulesOf([done]), [], 'finished work is not overdue, even if it was late');
});

test('overdue: boundary, severity and evidence', () => {
  assert.deepEqual(only('overdue', [task({ dueDate: NOW })]), [], 'due exactly now is not yet overdue');
  const [justLate] = only('overdue', [task({ dueDate: at(-1) })]);
  assert.equal(justLate.severity, 'warning');
  assert.equal(justLate.attention, 'assignee');

  const lateMedium = (ms) => only('overdue', [task({ status: 'in-progress', dueDate: at(-ms), createdAt: at(-ms - DAY), updatedAt: NOW })])[0];
  assert.equal(lateMedium(T.overdueCriticalDays * DAY - 1).severity, 'warning');
  const critical = lateMedium(T.overdueCriticalDays * DAY);
  assert.equal(critical.severity, 'critical');
  assert.equal(critical.evidence.daysLate, 3);
  assert.equal(critical.evidence.hoursLate, 72);
  assert.equal(critical.evidence.dueDate, at(-3 * DAY).toISOString());
  assert.match(critical.message, /Due 3 days ago/);

  const [high] = only('overdue', [task({ priority: 'high', dueDate: at(-HOUR) })]);
  assert.equal(high.severity, 'critical', 'high priority work is critical as soon as it is late');
});

test('overdue never applies to submitted or approved work (the review is the manager’s part)', () => {
  const inReview = task({ status: 'review', dueDate: at(-5 * DAY), submittedAt: at(-6 * DAY), createdAt: at(-9 * DAY) });
  assert.deepEqual(only('overdue', [inReview]), []);
  const doneLate = task({ status: 'done', dueDate: at(-5 * DAY), submittedAt: at(-1 * DAY), completedAt: at(-HOUR), createdAt: at(-9 * DAY) });
  assert.deepEqual(only('overdue', [doneLate]), []);
});

test('due soon and not started: boundaries', () => {
  const edge = T.dueSoonHours * HOUR;
  assert.equal(only('due-soon-not-started', [task({ dueDate: at(edge) })]).length, 1, 'exactly at the threshold counts');
  assert.equal(only('due-soon-not-started', [task({ dueDate: at(edge + 1) })]).length, 0);
  assert.equal(only('due-soon-not-started', [task({ dueDate: NOW })]).length, 1, 'due right now, not yet overdue');
  assert.equal(only('due-soon-not-started', [task({ status: 'in-progress', dueDate: at(HOUR) })]).length, 0, 'started work is not flagged');
  const [flag] = only('due-soon-not-started', [task({ dueDate: at(5 * HOUR), priority: 'high' })]);
  assert.equal(flag.severity, 'critical');
  assert.equal(flag.evidence.hoursLeft, 5);
  assert.match(flag.message, /Due in 5 hours/);
});

test('stalled: in progress with no update for more than the threshold', () => {
  const quietFor = (ms, extra = {}) => task({ status: 'in-progress', createdAt: at(-ms - DAY), updatedAt: at(-ms), dueDate: at(30 * DAY), ...extra });
  assert.equal(only('stalled', [quietFor(T.stalledDays * DAY)]).length, 0, 'exactly the threshold is not "more than"');
  const [flag] = only('stalled', [quietFor(T.stalledDays * DAY + 1)]);
  assert.equal(flag.severity, 'warning');
  assert.equal(flag.evidence.thresholdDays, T.stalledDays);
  assert.equal(flag.evidence.lastActivityAt, at(-T.stalledDays * DAY - 1).toISOString());

  // A recent comment or review counts as activity even when the task document itself is older.
  const commented = quietFor(10 * DAY, { history: [{ kind: 'comment', createdAt: at(-DAY) }] });
  assert.equal(only('stalled', [commented]).length, 0);
  // Only in-progress work stalls; to do is "not started", review is the manager's.
  assert.equal(only('stalled', [quietFor(10 * DAY, { status: 'review', submittedAt: at(-10 * DAY) })]).length, 0);
});

test('not started: old to-do work, not doubled up with overdue or due soon', () => {
  const old = (extra) => task({ createdAt: at(-(T.notStartedDays + 1) * DAY), updatedAt: at(-(T.notStartedDays + 1) * DAY), ...extra });
  assert.equal(only('not-started', [old({})]).length, 1);
  assert.equal(only('not-started', [old({})])[0].severity, 'info');
  assert.equal(only('not-started', [old({ dueDate: at(-DAY) })]).length, 0, 'already flagged as overdue');
  assert.equal(only('not-started', [old({ dueDate: at(DAY) })]).length, 0, 'already flagged as due soon');
  assert.equal(only('not-started', [task({ createdAt: at(-T.notStartedDays * DAY), updatedAt: at(-T.notStartedDays * DAY) })]).length, 0);
});

test('waiting for review is the reviewer’s flag and neutral', () => {
  const waiting = (ms, extra) => task({ status: 'review', createdAt: at(-20 * DAY), updatedAt: at(-ms), submittedAt: at(-ms), ...extra });
  assert.equal(only('review-waiting', [waiting(T.reviewWaitDays * DAY)]).length, 0);
  const [flag] = only('review-waiting', [waiting(T.reviewWaitDays * DAY + 1, { dueDate: at(-T.reviewWaitDays * DAY + HOUR) })]);
  assert.equal(flag.attention, 'reviewer');
  assert.equal(flag.severity, 'warning');
  assert.equal(flag.evidence.submittedOnTime, true, 'submitted before the due date, so the employee was on time');
  assert.doesNotMatch(flag.message, /late|overdue/i);
  assert.equal(only('review-waiting', [waiting(T.reviewWaitCriticalDays * DAY + 1)])[0].severity, 'critical');
  // Shown to the employee too (so they know where it stands), but never as their overdue work.
  assert.deepEqual(forEmployee(run([waiting(10 * DAY, { dueDate: at(-5 * DAY) })]).flags).map((f) => f.rule), ['review-waiting']);
});

test('over budget: factor boundary and missing estimates', () => {
  const logged = (actual, expected = 100, status = 'in-progress') => only('over-budget', [task({ status, actualMinutes: actual, expectedMinutes: expected, updatedAt: NOW })]);
  assert.equal(logged(150).length, 0, 'exactly 1.5× is within budget');
  const [flag] = logged(151);
  assert.equal(flag.severity, 'warning');
  assert.deepEqual(flag.evidence, { actualMinutes: 151, expectedMinutes: 100, ratio: 1.5, thresholdFactor: 1.5, criticalFactor: 2 });
  assert.equal(logged(200)[0].severity, 'critical');
  assert.equal(logged(500, 0).length, 0, 'no estimate, nothing to compare with');
  assert.equal(logged(500, 100, 'done').length, 0, 'only open tasks are monitored for effort');
});

test('repeated rework from the review history', () => {
  const sent = (n, status = 'in-progress') =>
    task({ status, updatedAt: NOW, history: Array.from({ length: n }, (_, i) => ({ kind: 'changes-requested', createdAt: at(-(n - i) * HOUR) })) });
  assert.equal(only('repeated-rework', [sent(1)]).length, 0);
  const [flag] = only('repeated-rework', [sent(2)]);
  assert.equal(flag.evidence.changesRequested, 2);
  assert.equal(flag.evidence.lastSentBackAt, at(-HOUR).toISOString());
  assert.equal(flag.attention, 'reviewer');
  assert.equal(only('repeated-rework', [sent(3, 'done')]).length, 0);
});

test('data integrity checks', () => {
  const rules = (fields) => rulesOf([task({ dueDate: at(10 * DAY), ...fields })]);
  assert.ok(rules({ status: 'done', completedAt: undefined, submittedAt: at(-HOUR) }).includes('done-without-completion-time'));
  assert.ok(rules({ status: 'in-progress', completedAt: at(-HOUR) }).includes('completion-time-on-open-task'));
  assert.ok(rules({ status: 'review', submittedAt: undefined }).includes('review-without-submission-time'));
  assert.ok(rules({ status: 'done', createdAt: at(-HOUR), completedAt: at(-2 * HOUR), submittedAt: at(-3 * HOUR) }).includes('completed-before-created'));
  assert.ok(rules({ createdAt: at(-HOUR), dueDate: at(-HOUR - DAY - 1) }).includes('due-before-created'));
  assert.ok(!rules({ createdAt: at(-HOUR), dueDate: at(-HOUR - DAY) }).includes('due-before-created'), 'one day of slack, as in agentMetrics');
  assert.ok(rules({ actualMinutes: -5 }).includes('invalid-time-logged'));
  assert.ok(rules({ actualMinutes: 'abc' }).includes('invalid-time-logged'));
  for (const flag of run([task({ actualMinutes: -5 })]).flags) assert.equal(flag.attention, 'admin');
});

test('no false "completed before created" on legitimate or seeded data', () => {
  // Completed the instant it was created (created and approved in one go) is fine.
  const instant = task({ status: 'done', createdAt: at(-HOUR), completedAt: at(-HOUR), submittedAt: at(-HOUR) });
  // The seed's shape: created 3–6 days before the due date, handed in two hours before approval.
  const due = at(-2 * DAY);
  const seeded = task({ status: 'done', createdAt: new Date(due.getTime() - 3 * DAY), dueDate: due, completedAt: new Date(due.getTime() - 3 * HOUR), submittedAt: new Date(due.getTime() - 5 * HOUR), updatedAt: NOW });
  assert.deepEqual(rulesOf([instant, seeded]), []);
});

test('assignee and organization checks need the employee and creator records', () => {
  const t1 = task({ assignedTo: 'e1', createdBy: 'u1', dueDate: at(9 * DAY) });
  const t2 = task({ assignedTo: 'gone', createdBy: 'u1', dueDate: at(9 * DAY) });
  const t3 = task({ assignedTo: 'e2', createdBy: 'u1', dueDate: at(9 * DAY) });
  const t4 = task({ assignedTo: 'e3', createdBy: 'u1', dueDate: at(9 * DAY) });
  const t5 = task({ assignedTo: 'e2', createdBy: 'u1', status: 'done', completedAt: at(-HOUR), submittedAt: at(-HOUR) });
  const employees = new Map([
    ['e1', { status: 'active' }],
    ['e2', { status: 'inactive' }],
    ['e3', { status: 'active', organization: 'org-b' }]
  ]);
  const creators = { u1: { organization: null } };
  const flags = run([t1, t2, t3, t4, t5], { employees, creators }).flags;
  const by = (rule) => flags.filter((flag) => flag.rule === rule).map((flag) => flag.taskId);
  assert.deepEqual(by('assignee-missing'), [t2._id]);
  assert.deepEqual(by('assignee-inactive'), [t3._id], 'finished work of a deactivated employee is fine');
  assert.deepEqual(by('organization-mismatch'), [t4._id], 'a missing organization is the original organization on both sides');
  assert.equal(flags.find((flag) => flag.rule === 'organization-mismatch').evidence.sameOrganization, false);
  // Without the records the checks are skipped rather than guessed.
  assert.deepEqual(rulesOf([t2, t4]), []);
});

test('the shared data checks flag exactly the tasks agentMetrics reports', () => {
  const tasks = [
    task({ status: 'done', completedAt: undefined }),
    task({ status: 'todo', completedAt: at(-HOUR) }),
    task({ status: 'done', createdAt: at(-HOUR), completedAt: at(-3 * HOUR), submittedAt: at(-4 * HOUR) }),
    task({ createdAt: at(-HOUR), dueDate: at(-3 * DAY) }),
    task({ status: 'done', createdAt: at(-5 * DAY), completedAt: at(-DAY), submittedAt: at(-DAY), dueDate: at(-2 * DAY) })
  ];
  const codes = {
    DONE_WITHOUT_COMPLETION_TIME: 'done-without-completion-time',
    COMPLETION_TIME_ON_OPEN_TASK: 'completion-time-on-open-task',
    COMPLETED_BEFORE_CREATED: 'completed-before-created',
    DUE_BEFORE_CREATED: 'due-before-created'
  };
  const fromMetrics = prepareTasks(tasks).issues.filter((issue) => codes[issue.code]);
  const flags = run(tasks).flags;
  for (const [code, rule] of Object.entries(codes)) {
    const expected = (fromMetrics.find((issue) => issue.code === code)?.records ?? []).map((record) => record.id).sort();
    const actual = flags.filter((flag) => flag.rule === rule).map((flag) => flag.taskId).sort();
    assert.deepEqual(actual, expected, code);
    assert.equal(actual.length, 1, `${code} has a fixture`);
  }
});

test('time-zone safe: the same instants give the same flags, whatever offset they were written with', () => {
  const utc = task({ _id: 'z', dueDate: '2026-11-08T12:30:00.000Z', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
  const kolkata = { ...utc, dueDate: '2026-11-08T18:00:00.000+05:30', createdAt: '2026-11-01T05:30:00+05:30', updatedAt: '2026-11-01T05:30:00+05:30' };
  const newYork = { ...utc, dueDate: '2026-11-08T07:30:00.000-05:00', createdAt: '2026-10-31T19:00:00-05:00', updatedAt: '2026-10-31T19:00:00-05:00' };
  const results = [utc, kolkata, newYork].map((t) => run([t]).flags);
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  assert.equal(results[0][0].evidence.dueDate, '2026-11-08T12:30:00.000Z');
  // Messages describe durations, not calendar dates, so they don't depend on APP_TIMEZONE.
  for (const flag of results[0]) assert.doesNotMatch(flag.message, /\d{4}-\d{2}-\d{2}/);
  // Across a daylight-saving change (US, 1 Nov 2026) a "day" is still 24 real hours.
  const dst = task({ status: 'in-progress', createdAt: '2026-10-31T12:00:00-04:00', updatedAt: '2026-10-31T12:00:00-04:00', dueDate: '2026-12-31T00:00:00Z' });
  assert.equal(only('stalled', [dst], { now: new Date('2026-11-04T11:00:00-05:00') }).length, 0, 'exactly 4 × 24 hours later');
  assert.equal(only('stalled', [dst], { now: new Date('2026-11-04T11:00:01-05:00') }).length, 1);
});

test('summary, ordering and the employee view', () => {
  const tasks = [
    task({ dueDate: at(-DAY) }), // overdue (warning)
    task({ priority: 'high', dueDate: at(-DAY), actualMinutes: -1 }), // overdue (critical) + invalid time
    task({ status: 'done', completedAt: at(-HOUR), submittedAt: at(-HOUR) })
  ];
  const { flags, summary, thresholds } = run(tasks);
  assert.deepEqual(flags.map((f) => f.severity), ['critical', 'warning', 'warning']);
  assert.equal(summary.tasksChecked, 3);
  assert.equal(summary.openTasks, 2);
  assert.equal(summary.flaggedTasks, 2);
  assert.deepEqual(summary.bySeverity, { critical: 1, warning: 2, info: 0 });
  assert.deepEqual(summary.byRule, { overdue: 2, 'invalid-time-logged': 1 });
  assert.equal(thresholds, T);
  assert.deepEqual(forEmployee(flags).map((f) => f.rule), ['overdue', 'overdue']);
  for (const flag of flags) {
    assert.ok(flag.title && flag.message && flag.evidence && flag.category, 'every flag explains itself');
  }
});

test('durations are described in whole, rounded-down units', () => {
  assert.equal(describeSpan(59 * 60 * 1000), 'less than an hour');
  assert.equal(describeSpan(HOUR), '1 hour');
  assert.equal(describeSpan(47.9 * HOUR), '47 hours');
  assert.equal(describeSpan(2 * DAY), '2 days');
  assert.equal(describeSpan(3.9 * DAY), '3 days');
});
