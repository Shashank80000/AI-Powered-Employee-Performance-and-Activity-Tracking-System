import { Activity } from '../models/Activity.js';
import { ApplicationUsage } from '../models/ApplicationUsage.js';
import { startOfDay, toDateKey } from '../utils/dateUtils.js';
import { recalculateDay } from './performanceService.js';
import { categorizeApplication } from './productivityService.js';

/**
 * Stores a batch of agent snapshots and refreshes the affected daily Performance records.
 * @returns {Promise<number>} number of snapshots stored
 */
export async function recordSnapshots(employee, { snapshots, applications = [] }) {
  const activityDocs = snapshots.map((snapshot) => ({
    employee: employee._id,
    capturedAt: snapshot.capturedAt,
    intervalSeconds: snapshot.intervalSeconds,
    activeSeconds: snapshot.activeSeconds,
    idleSeconds: snapshot.idleSeconds,
    mouseEvents: snapshot.mouseEvents,
    keyboardEvents: snapshot.keyboardEvents,
    task: snapshot.taskId
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
