import { Activity } from '../models/Activity.js';
import { ApplicationUsage } from '../models/ApplicationUsage.js';
import { Task } from '../models/Task.js';
import { startOfDay, toDateKey } from '../utils/dateUtils.js';
import { recalculateDay } from './performanceService.js';
import { categorizeApplication } from './productivityService.js';

/**
 * Stores a batch of agent snapshots and refreshes the affected daily Performance records.
 * @returns {Promise<number>} number of snapshots stored
 */
export async function recordSnapshots(employee, { snapshots: received, applications: receivedApps = [] }) {
  // The agent re-sends a batch when an upload times out after the server already stored it. A snapshot is
  // identified by its capture time (app usage shares it), so anything already stored is skipped, not counted twice.
  const time = (value) => new Date(value).getTime();
  const stored = await Activity.find({ employee: employee._id, capturedAt: { $in: received.map((snapshot) => new Date(snapshot.capturedAt)) } }, 'capturedAt').lean();
  const seen = new Set(stored.map(({ capturedAt }) => time(capturedAt)));
  const resent = new Set(seen);
  const snapshots = received.filter((snapshot) => !seen.has(time(snapshot.capturedAt)) && seen.add(time(snapshot.capturedAt)));
  const applications = receivedApps.filter((usage) => !resent.has(time(usage.capturedAt)));
  if (snapshots.length === 0) return 0;

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

  await Promise.all([Activity.insertMany(activityDocs), usageDocs.length && ApplicationUsage.insertMany(usageDocs)]);

  const days = new Map([...activityDocs, ...usageDocs].map(({ capturedAt }) => [toDateKey(capturedAt), startOfDay(capturedAt)]));
  await Promise.all([...days.values()].map((day) => recalculateDay(employee._id, day)));

  return activityDocs.length;
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
