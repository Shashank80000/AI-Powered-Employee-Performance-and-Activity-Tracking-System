import { Activity } from '../models/Activity.js';
import { ApplicationUsage } from '../models/ApplicationUsage.js';
import { Task } from '../models/Task.js';
import { startOfDay, toDateKey } from '../utils/dateUtils.js';
import { recalculateDay } from './performanceService.js';
import { categorizeApplication } from './productivityService.js';

// Two snapshots may share this much time (clock jitter between intervals) without counting as overlapping.
const OVERLAP_TOLERANCE_MS = 5 * 1000;

/**
 * Stores a batch of agent snapshots and refreshes the affected daily Performance records.
 * A snapshot covers the `intervalSeconds` before its `capturedAt`. Anything already stored (a re-sent batch)
 * is skipped silently; a snapshot whose time overlaps one already stored or earlier in the batch is rejected,
 * so the same minutes can't be counted twice.
 * @returns {Promise<{stored: number, overlapping: number}>}
 */
export async function recordSnapshots(employee, { snapshots: received, applications: receivedApps = [] }) {
  const time = (value) => new Date(value).getTime();
  const span = (snapshot) => [time(snapshot.capturedAt) - snapshot.intervalSeconds * 1000, time(snapshot.capturedAt)];
  const ends = received.map((snapshot) => time(snapshot.capturedAt));
  // Stored snapshots that could touch this batch (each covers at most an hour).
  const existing = await Activity.find(
    { employee: employee._id, capturedAt: { $gte: new Date(Math.min(...ends) - 3600 * 1000), $lte: new Date(Math.max(...ends) + 3600 * 1000) } },
    'capturedAt intervalSeconds'
  ).lean();
  const resent = new Set(existing.map(({ capturedAt }) => time(capturedAt)));
  const taken = existing.map(span);
  const overlaps = ([start, end]) => taken.some(([s, e]) => start < e - OVERLAP_TOLERANCE_MS && s < end - OVERLAP_TOLERANCE_MS);

  let overlapping = 0;
  const snapshots = [];
  for (const snapshot of [...received].sort((a, b) => time(a.capturedAt) - time(b.capturedAt))) {
    if (resent.has(time(snapshot.capturedAt))) continue;
    const interval = span(snapshot);
    if (overlaps(interval)) {
      overlapping += 1;
      continue;
    }
    taken.push(interval);
    snapshots.push(snapshot);
  }
  const kept = new Set(snapshots.map((snapshot) => time(snapshot.capturedAt)));
  // App usage shares its snapshot's capture time: keep only usage belonging to a stored snapshot's interval.
  const applications = receivedApps.filter((usage) => !resent.has(time(usage.capturedAt)) && (kept.has(time(usage.capturedAt)) || !ends.includes(time(usage.capturedAt))));
  if (snapshots.length === 0) return { stored: 0, overlapping };

  // Time is only logged against the person's own tasks.
  const taskIds = [...new Set(snapshots.map((snapshot) => snapshot.taskId).filter(Boolean))];
  const ownTasks = new Set(
    taskIds.length ? (await Task.find({ _id: { $in: taskIds }, assignedTo: employee._id }, '_id').lean()).map(({ _id }) => _id.toString()) : []
  );
  const activityDocs = snapshots.map((snapshot) => ({
    employee: employee._id,
    capturedAt: snapshot.capturedAt,
    intervalSeconds: snapshot.intervalSeconds,
    activeSeconds: snapshot.activeSeconds,
    idleSeconds: snapshot.idleSeconds,
    mouseEvents: snapshot.mouseEvents,
    keyboardEvents: snapshot.keyboardEvents,
    task: ownTasks.has(snapshot.taskId?.toLowerCase()) ? snapshot.taskId : undefined
  }));
  const usageDocs = applications.map((usage) => ({
    employee: employee._id,
    application: usage.application,
    category: categorizeApplication(usage.application),
    durationSeconds: usage.durationSeconds,
    capturedAt: usage.capturedAt
  }));

  // The unique index on (employee, capturedAt) stops a batch sent twice at the same moment from being stored twice.
  let insertedActivity = activityDocs;
  try {
    await Activity.insertMany(activityDocs, { ordered: false });
  } catch (error) {
    if (error.code !== 11000 && !error.writeErrors) throw error;
    const failed = new Set((error.writeErrors ?? []).map((writeError) => writeError.index ?? writeError.err?.index));
    insertedActivity = activityDocs.filter((_doc, index) => !failed.has(index));
  }
  if (usageDocs.length) await ApplicationUsage.insertMany(usageDocs);

  const days = new Map([...activityDocs, ...usageDocs].map(({ capturedAt }) => [toDateKey(capturedAt), startOfDay(capturedAt)]));
  await Promise.all([...days.values()].map((day) => recalculateDay(employee._id, day)));

  return { stored: insertedActivity.length, overlapping };
}

/** Active/idle totals and top applications for one employee in a date range. */
export async function getActivitySummary(employeeId, { start, end }) {
  const match = { employee: employeeId, capturedAt: { $gte: start, $lt: end } };
  const [[totals], applications] = await Promise.all([
    Activity.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          activeSeconds: { $sum: '$activeSeconds' },
          idleSeconds: { $sum: '$idleSeconds' },
          mouseEvents: { $sum: '$mouseEvents' },
          keyboardEvents: { $sum: '$keyboardEvents' }
        }
      }
    ]),
    ApplicationUsage.aggregate([
      { $match: match },
      { $group: { _id: '$application', category: { $first: '$category' }, durationSeconds: { $sum: '$durationSeconds' } } },
      { $sort: { durationSeconds: -1 } },
      { $limit: 10 }
    ])
  ]);

  return {
    activeSeconds: totals?.activeSeconds ?? 0,
    idleSeconds: totals?.idleSeconds ?? 0,
    mouseEvents: totals?.mouseEvents ?? 0,
    keyboardEvents: totals?.keyboardEvents ?? 0,
    applications: applications.map(({ _id, category, durationSeconds }) => ({ application: _id, category, durationSeconds }))
  };
}
