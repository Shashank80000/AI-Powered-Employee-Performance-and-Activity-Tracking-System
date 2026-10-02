import { Activity } from '../models/Activity.js';
import { ApplicationUsage } from '../models/ApplicationUsage.js';
import { Employee } from '../models/Employee.js';
import { Performance } from '../models/Performance.js';
import { Task } from '../models/Task.js';
import { employeeScope } from '../middleware/roleMiddleware.js';
import { addDays, periodRange, previousRange, secondsToHours, startOfDay, toDateKey } from '../utils/dateUtils.js';
import { calculateProductivity, percentChange } from '../utils/productivityCalculator.js';
import { averageScore, sumMetrics } from './productivityService.js';

const ON_TRACK_SCORE = 75;

/** Rebuilds the daily Performance record for one employee from raw activity and tasks. */
export async function recalculateDay(employeeId, date) {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  const inDay = { $gte: start, $lt: end };

  const [[activity], [apps], tasks] = await Promise.all([
    Activity.aggregate([
      { $match: { employee: employeeId, capturedAt: inDay } },
      { $group: { _id: null, activeSeconds: { $sum: '$activeSeconds' }, idleSeconds: { $sum: '$idleSeconds' } } }
    ]),
    ApplicationUsage.aggregate([
      { $match: { employee: employeeId, capturedAt: inDay, category: 'productive' } },
      { $group: { _id: null, seconds: { $sum: '$durationSeconds' } } }
    ]),
    Task.find({ assignedTo: employeeId, $or: [{ dueDate: inDay }, { completedAt: inDay }] }).lean()
  ]);

  const completed = tasks.filter((task) => task.completedAt >= start && task.completedAt < end);
  const metrics = {
    activeSeconds: activity?.activeSeconds ?? 0,
    idleSeconds: activity?.idleSeconds ?? 0,
    productiveAppSeconds: Math.min(apps?.seconds ?? 0, activity?.activeSeconds ?? 0),
    tasksAssigned: tasks.length,
    tasksCompleted: completed.length,
    onTimeTasks: completed.filter((task) => !task.dueDate || task.completedAt <= task.dueDate).length
  };
  const { score } = calculateProductivity(metrics);

  return Performance.findOneAndUpdate(
    { employee: employeeId, date: start },
    { ...metrics, productivityScore: score },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function describeTask(task) {
  const verbs = { done: 'completed', review: 'moved to review', 'in-progress': 'started', todo: 'was assigned' };
  return `${verbs[task.status]} "${task.title}"`;
}

function summarise(records, employeesWithActivity) {
  const totals = sumMetrics(records);
  return {
    activeEmployees: employeesWithActivity,
    averageProductivity: averageScore(records),
    trackedHours: secondsToHours(totals.activeSeconds + totals.idleSeconds),
    tasksCompleted: totals.tasksCompleted
  };
}

function activeEmployeeCount(records) {
  return new Set(records.filter((r) => r.activeSeconds > 0).map((r) => r.employee.toString())).size;
}

/** Everything the dashboard needs, scoped to what `user` may see. */
export async function getDashboard(user, period = 'week') {
  const range = periodRange(period);
  const previous = previousRange(range);
  const employees = await Employee.find({ ...employeeScope(user), status: 'active' }).populate('user', 'name').lean();
  const employeeIds = employees.map(({ _id }) => _id);

  const [records, previousRecords, recentTasks, [peak]] = await Promise.all([
    Performance.find({ employee: { $in: employeeIds }, date: { $gte: range.start, $lt: range.end } }).lean(),
    Performance.find({ employee: { $in: employeeIds }, date: { $gte: previous.start, $lt: previous.end } }).lean(),
    Task.find({ assignedTo: { $in: employeeIds } }).sort({ updatedAt: -1 }).limit(5).populate({ path: 'assignedTo', populate: { path: 'user', select: 'name' } }).lean(),
    Activity.aggregate([
      { $match: { employee: { $in: employeeIds }, capturedAt: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: { $hour: '$capturedAt' }, activeSeconds: { $sum: '$activeSeconds' } } },
      { $sort: { activeSeconds: -1 } },
      { $limit: 1 }
    ])
  ]);

  const current = summarise(records, activeEmployeeCount(records));
  const before = summarise(previousRecords, activeEmployeeCount(previousRecords));
  const changes = Object.fromEntries(Object.keys(current).map((key) => [key, percentChange(current[key], before[key])]));

  const trend = [];
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    const key = toDateKey(day);
    const dayRecords = records.filter((record) => toDateKey(record.date) === key && record.activeSeconds + record.idleSeconds > 0);
    // null = nothing tracked that day (e.g. weekends), so charts can skip it rather than plot 0.
    trend.push({ date: key, score: dayRecords.length ? averageScore(dayRecords) : null });
  }

  const totals = sumMetrics(records);
  const team = employees
    .map((employee) => {
      const own = records.filter((record) => record.employee.toString() === employee._id.toString());
      const score = averageScore(own);
      const tracked = own.some((record) => record.activeSeconds + record.idleSeconds > 0);
      return {
        id: employee._id.toString(),
        name: employee.user.name,
        initials: initials(employee.user.name),
        designation: employee.designation,
        score,
        tasksCompleted: sumMetrics(own).tasksCompleted,
        status: !tracked ? 'no-data' : score >= ON_TRACK_SCORE ? 'on-track' : 'needs-focus'
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    period,
    range: { start: toDateKey(range.start), end: toDateKey(addDays(range.end, -1)) },
    summary: { ...current, changes },
    trend,
    focus: {
      focusedSeconds: totals.productiveAppSeconds,
      otherActiveSeconds: totals.activeSeconds - totals.productiveAppSeconds,
      idleSeconds: totals.idleSeconds
    },
    peakHourUtc: peak?._id ?? null,
    team,
    recentActivity: recentTasks.map((task) => ({
      id: task._id.toString(),
      name: task.assignedTo?.user?.name ?? 'Unknown',
      action: describeTask(task),
      status: task.status,
      at: task.updatedAt
    }))
  };
}

/** Daily Performance records for one employee in a period. */
export async function getEmployeePerformance(employee, period = 'month') {
  const range = periodRange(period);
  const records = await Performance.find({ employee: employee._id, date: { $gte: range.start, $lt: range.end } }).sort({ date: 1 }).lean();
  return {
    employeeId: employee._id.toString(),
    period,
    averageScore: averageScore(records),
    days: records.map((record) => ({
      date: toDateKey(record.date),
      score: record.productivityScore,
      activeHours: secondsToHours(record.activeSeconds),
      idleHours: secondsToHours(record.idleSeconds),
      tasksCompleted: record.tasksCompleted
    }))
  };
}
