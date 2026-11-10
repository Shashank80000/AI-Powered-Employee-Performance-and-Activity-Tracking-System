import { env } from '../config/env.js';
import { employeeForRequest } from '../middleware/roleMiddleware.js';
import { DailyAnalysis } from '../models/DailyAnalysis.js';
import { Performance } from '../models/Performance.js';
import { Task } from '../models/Task.js';
import { WorkSession } from '../models/WorkSession.js';
import { durationMs } from '../utils/agentMetrics.js';
import { addDays } from '../utils/dateUtils.js';
import { buildEmployeeOverview } from '../utils/employeeOverview.js';

const DISCLAIMER =
  'Computed from stored records (desktop activity, daily screen analyses, camera labels, tasks and sign-ins); no AI is involved. ' +
  'Active, idle and signed-in time record presence and input, not the value of the work. Screen categories come from an automated classifier and can be wrong.';

/**
 * The whole-employee report for one person and period. Scope is checked first (employeeForRequest: employees always
 * get their own report; managers only their team; admins only their organization), then only that person's records
 * are loaded.
 */
export async function getEmployeeOverview(user, { employeeId, range, period }, now = new Date()) {
  const employee = await employeeForRequest(user, employeeId);
  await employee.populate('user', 'name');
  const id = employee._id;
  const inPeriod = { $gte: range.start, $lt: range.end };

  const [performance, analyses, tasks, sessions] = await Promise.all([
    Performance.find({ employee: id, date: inPeriod }).lean(),
    DailyAnalysis.find({ employee: id, date: inPeriod }).select('date screenshotCount analyzedCount categoryMinutes productiveMinutes camera').lean(),
    // Same selection as the AI assistant: anything open, finished in or after the period, or with no completion time.
    Task.find({ assignedTo: id, $or: [{ status: { $ne: 'done' } }, { completedAt: { $gte: range.start } }, { completedAt: null }] })
      .select('title status priority dueDate completedAt submittedAt createdAt assignedTo expectedMinutes actualMinutes history.kind history.createdAt')
      .lean(),
    // Sessions can't outlast a sign-in token, so a month before the period is enough.
    WorkSession.find({ employee: id, $or: [{ loginAt: { $gte: addDays(range.start, -31), $lt: range.end } }, { loginAt: null }] }).lean()
  ]);

  return {
    employee: {
      id: id.toString(),
      name: employee.user?.name ?? employee.employeeCode,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      status: employee.status
    },
    period: period ?? 'custom',
    generatedAt: now.toISOString(),
    ...buildEmployeeOverview({ performance, analyses, tasks, sessions }, { range, now, webLifetimeMs: durationMs(env.JWT_EXPIRES_IN) ?? undefined }),
    disclaimer: DISCLAIMER
  };
}
