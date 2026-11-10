import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_RANGE_DAYS,
  buildEmployeeOverview,
  buildObservations,
  dailyTrend,
  resolveRange,
  summariseActivity,
  summariseCamera,
  summariseScreens,
  summariseTasks
} from '../src/utils/employeeOverview.js';
import { dayStart, toDateKey } from '../src/utils/dateUtils.js';

// Pure aggregation for the whole-employee report. Days are UTC here (APP_TIMEZONE unset).
const range = { start: dayStart('2026-10-01'), end: dayStart('2026-10-08') }; // 1–7 October
const now = new Date('2026-10-08T12:00:00Z');
const at = (iso) => new Date(iso);
let nextId = 0;
const task = (fields) => ({ _id: `t${(nextId += 1)}`, title: `Task ${nextId}`, assignedTo: 'e1', priority: 'medium', createdAt: at('2026-09-28T09:00:00Z'), history: [], ...fields });

test('resolveRange: preset periods and custom ranges', () => {
  const week = resolveRange({ period: 'week' }, now);
  assert.equal(toDateKey(week.start), '2026-10-02');
  assert.equal(toDateKey(week.end), '2026-10-09', 'end is exclusive: tomorrow');
  assert.equal(toDateKey(resolveRange({ period: 'month' }, now).start), '2026-09-09');

  const custom = resolveRange({ from: '2026-10-01', to: '2026-10-07' });
  assert.deepEqual([toDateKey(custom.start), toDateKey(custom.end)], ['2026-10-01', '2026-10-08']);
  assert.throws(() => resolveRange({ from: '2026-10-01' }), RangeError);
  assert.throws(() => resolveRange({ from: '2026-10-07', to: '2026-10-01' }), RangeError);
  assert.throws(() => resolveRange({ from: '2025-01-01', to: '2026-10-01' }), new RegExp(`${MAX_RANGE_DAYS}`));
});

test('activity: missing data is reported as unavailable, not zero', () => {
  const empty = summariseActivity([], range);
  assert.equal(empty.available, false);
  assert.match(empty.note, /No desktop activity/);
  assert.equal(empty.productivityScore, undefined);

  const records = [
    { date: dayStart('2026-10-01'), activeSeconds: 3 * 3600, idleSeconds: 3600, productiveAppSeconds: 2 * 3600, productivityScore: 80 },
    { date: dayStart('2026-10-02'), activeSeconds: 3600, idleSeconds: 3600, productiveAppSeconds: 0, productivityScore: 40 },
    { date: dayStart('2026-10-03'), activeSeconds: 0, idleSeconds: 0, productivityScore: 0 }, // untracked: not averaged
    { date: dayStart('2026-10-09'), activeSeconds: 9999, idleSeconds: 0, productivityScore: 100 } // outside the period
  ];
  const activity = summariseActivity(records, range);
  assert.equal(activity.available, true);
  assert.equal(activity.daysTracked, 2);
  assert.equal(activity.activeHours, 4);
  assert.equal(activity.idleHours, 2);
  assert.equal(activity.trackedHours, 6);
  assert.equal(activity.activeShare, 66.7);
  assert.equal(activity.idleShare, 33.3);
  assert.equal(activity.productiveAppHours, 2);
  assert.equal(activity.productivityScore, 60, 'the dashboard score: average of tracked days');
});

test('screens: categories are summed generically, including ones the UI has never seen', () => {
  const analyses = [
    { date: dayStart('2026-10-01'), screenshotCount: 10, analyzedCount: 9, categoryMinutes: new Map([['coding', 60], ['entertainment', 20]]), productiveMinutes: 60 },
    { date: dayStart('2026-10-02'), screenshotCount: 6, analyzedCount: 6, categoryMinutes: { work: 40, gaming: 20, coding: -5 }, productiveMinutes: 40 },
    { date: dayStart('2026-10-20'), screenshotCount: 99, analyzedCount: 99, categoryMinutes: { coding: 999 }, productiveMinutes: 999 }
  ];
  const screen = summariseScreens(analyses, range);
  assert.equal(screen.available, true);
  assert.equal(screen.daysAnalysed, 2);
  assert.equal(screen.screenshotCount, 16);
  assert.equal(screen.analyzedCount, 15);
  assert.equal(screen.observedMinutes, 140, 'negative values are ignored');
  assert.equal(screen.productiveMinutes, 100);
  assert.equal(screen.productiveShare, 71.4);
  assert.deepEqual(
    screen.categories.map(({ category, minutes }) => [category, minutes]),
    [['coding', 60], ['work', 40], ['entertainment', 20], ['gaming', 20]]
  );

  assert.match(summariseScreens([], range).note, /No screenshots were analysed/);
  const unclassified = summariseScreens([{ date: dayStart('2026-10-01'), screenshotCount: 4, analyzedCount: 0, categoryMinutes: {} }], range);
  assert.equal(unclassified.available, false);
  assert.match(unclassified.note, /no screenshots were classified/);
});

test('camera: totals only from days with camera checks', () => {
  assert.equal(summariseCamera([{ date: dayStart('2026-10-01'), camera: { observationCount: 0 } }], range).available, false);
  const camera = summariseCamera(
    [
      { date: dayStart('2026-10-01'), camera: { observationCount: 12, atDeskMinutes: 50, awayMinutes: 10, stateMinutes: { working_at_computer: 50, away_from_desk: 10 } } },
      { date: dayStart('2026-10-02'), camera: { observationCount: 6, atDeskMinutes: 30, awayMinutes: 0, stateMinutes: new Map([['on_a_call', 30]]) } }
    ],
    range
  );
  assert.equal(camera.daysObserved, 2);
  assert.equal(camera.observationCount, 18);
  assert.equal(camera.atDeskMinutes, 80);
  assert.equal(camera.awayMinutes, 10);
  assert.equal(camera.atDeskShare, 88.9);
  assert.deepEqual(camera.states[0], { state: 'working_at_computer', minutes: 50 });
});

test('tasks: on time = submitted by the due date; review cycles and estimates', () => {
  const tasks = [
    // Submitted before the due date, approved after it: on time (a slow review never makes the employee late).
    task({ status: 'done', dueDate: at('2026-10-03T17:00:00Z'), submittedAt: at('2026-10-03T10:00:00Z'), completedAt: at('2026-10-05T10:00:00Z'), expectedMinutes: 60, actualMinutes: 90,
      history: [{ kind: 'submitted', createdAt: at('2026-10-03T10:00:00Z') }, { kind: 'approved', createdAt: at('2026-10-05T10:00:00Z') }] }),
    // Submitted after the due date: late. Sent back once before.
    task({ status: 'done', dueDate: at('2026-10-02T17:00:00Z'), submittedAt: at('2026-10-04T10:00:00Z'), completedAt: at('2026-10-04T12:00:00Z'), expectedMinutes: 60, actualMinutes: 60,
      history: [
        { kind: 'submitted', createdAt: at('2026-10-02T09:00:00Z') },
        { kind: 'changes-requested', createdAt: at('2026-10-02T12:00:00Z') },
        { kind: 'submitted', createdAt: at('2026-10-04T10:00:00Z') },
        { kind: 'approved', createdAt: at('2026-10-04T12:00:00Z') }
      ] }),
    // Done, no due date, no logged time.
    task({ status: 'done', completedAt: at('2026-10-06T10:00:00Z'), expectedMinutes: 30, actualMinutes: 0 }),
    // Open and overdue.
    task({ status: 'in-progress', dueDate: at('2026-10-04T17:00:00Z'), createdAt: at('2026-10-02T09:00:00Z') }),
    // Submitted past its due date, waiting for the manager: not the employee's overdue work.
    task({ status: 'review', dueDate: at('2026-10-05T17:00:00Z'), submittedAt: at('2026-10-06T09:00:00Z') }),
    // Done before the period: not in the workload.
    task({ status: 'done', completedAt: at('2026-09-29T10:00:00Z'), dueDate: at('2026-09-30T10:00:00Z') })
  ];
  const summary = summariseTasks(tasks, range, now);
  assert.equal(summary.available, true);
  assert.equal(summary.workload, 5);
  assert.equal(summary.completed, 3);
  assert.equal(summary.completionRate, 60);
  assert.equal(summary.assignedInPeriod, 1);
  assert.equal(summary.completedWithDeadline, 2);
  assert.equal(summary.onTime, 1);
  assert.equal(summary.late, 1);
  assert.equal(summary.onTimeRate, 50);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.reviewOverdue, 1);
  assert.deepEqual(summary.review, { submissions: 3, approvals: 2, changesRequested: 1, tasksSentBack: 1, approvedFirstTime: 2 });
  assert.deepEqual(summary.effort, { tasksWithTime: 2, completedWithoutTime: 1, expectedMinutes: 120, actualMinutes: 150, actualVsExpected: 125 });

  const none = summariseTasks([], range, now);
  assert.equal(none.available, false);
  assert.equal(none.onTimeRate, null, 'no rate without tasks, rather than 0%');
});

test('daily trend: one row per day, null where nothing was recorded', () => {
  const trend = dailyTrend(
    {
      performance: [{ date: dayStart('2026-10-02'), activeSeconds: 7200, idleSeconds: 1800, productivityScore: 72 }],
      analyses: [{ date: dayStart('2026-10-02'), categoryMinutes: { coding: 90 }, productiveMinutes: 90, camera: { observationCount: 3, atDeskMinutes: 15 } }],
      tasks: [task({ status: 'done', completedAt: at('2026-10-02T15:00:00Z') })],
      sessions: [{ loginAt: at('2026-10-02T08:00:00Z'), client: 'web' }, { loginAt: at('2026-10-03T08:00:00Z'), client: 'agent' }]
    },
    range
  );
  assert.equal(trend.length, 7);
  assert.deepEqual(trend[1], { date: '2026-10-02', score: 72, activeHours: 2, idleHours: 0.5, screenMinutes: 90, productiveMinutes: 90, atDeskMinutes: 15, tasksCompleted: 1, signedIn: true });
  assert.deepEqual(trend[2], { date: '2026-10-03', score: null, activeHours: null, idleHours: null, screenMinutes: null, productiveMinutes: null, atDeskMinutes: null, tasksCompleted: 0, signedIn: false });
});

test('observations cite the numbers they rest on and stay quiet on thin data', () => {
  const baseTasks = summariseTasks([], range, now);
  const quiet = buildObservations({ activity: { available: false }, screen: { available: false }, tasks: baseTasks, sessions: { missingLogout: 0 } });
  assert.deepEqual(quiet.map((o) => o.id), ['tasks.none']);

  const notes = buildObservations({
    activity: { available: true, idleShare: 62.5, idleHours: 5, trackedHours: 8 },
    screen: { available: true, observedMinutes: 300, productiveMinutes: 90, productiveShare: 30 },
    tasks: {
      ...baseTasks,
      workload: 6,
      completed: 4,
      completedWithDeadline: 4,
      onTime: 1,
      late: 3,
      onTimeRate: 25,
      overdue: 2,
      review: { submissions: 6, approvals: 4, changesRequested: 3, tasksSentBack: 2, approvedFirstTime: 2 },
      effort: { tasksWithTime: 4, expectedMinutes: 200, actualMinutes: 300, actualVsExpected: 150 }
    },
    sessions: { missingLogout: 1 }
  });
  const byId = Object.fromEntries(notes.map((note) => [note.id, note]));
  assert.deepEqual(Object.keys(byId).sort(), ['activity.idle', 'screen.lowProductive', 'sessions.missingLogout', 'tasks.changesRequested', 'tasks.effortOver', 'tasks.late', 'tasks.overdue'].sort());
  assert.equal(byId['tasks.late'].kind, 'concern');
  assert.deepEqual(byId['tasks.late'].basis, { late: 3, completedWithDeadline: 4, onTimeRate: 25 });
  assert.match(byId['tasks.late'].text, /3 of 4 .* \(on time: 25%\)/);
  assert.match(byId['tasks.overdue'].text, /^2 open tasks are past/);
  assert.equal(byId['sessions.missingLogout'].kind, 'data-quality');
  assert.match(byId['sessions.missingLogout'].text, /^1 sign-in has/);
  for (const note of notes) {
    for (const value of Object.values(note.basis)) assert.ok(note.text.includes(String(value)), `${note.id} states ${value}`);
  }

  const good = buildObservations({
    activity: { available: true, idleShare: 20 },
    screen: { available: true, observedMinutes: 30, productiveShare: 90 }, // too few minutes to remark on
    tasks: { ...baseTasks, workload: 3, completed: 3, completedWithDeadline: 3, onTime: 3, onTimeRate: 100, review: { changesRequested: 0, approvedFirstTime: 3 }, effort: { tasksWithTime: 3, expectedMinutes: 100, actualMinutes: 105, actualVsExpected: 105 } },
    sessions: { missingLogout: 0 }
  });
  assert.deepEqual(good.map((o) => [o.id, o.kind]), [['tasks.onTime', 'strength'], ['tasks.approvedFirstTime', 'strength'], ['tasks.effortOnEstimate', 'strength']]);
});

test('buildEmployeeOverview: an empty period is all "no data", never zeros presented as facts', () => {
  const overview = buildEmployeeOverview({}, { range, now });
  assert.deepEqual(overview.range, { start: '2026-10-01', end: '2026-10-07', days: 7 });
  assert.equal(overview.daysWithRecords, 0);
  for (const section of ['activity', 'screen', 'camera', 'tasks', 'sessions']) {
    assert.equal(overview[section].available, false, section);
    assert.ok(overview[section].note, `${section} explains why`);
  }
  assert.ok(overview.trend.every((row) => row.score === null && row.screenMinutes === null));
  assert.deepEqual(overview.dataQuality, []);
  assert.equal(overview.tasks.dataQuality, undefined, 'issues are listed once, at the top level');
});
