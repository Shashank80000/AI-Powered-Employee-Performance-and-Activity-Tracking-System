import { Employee } from '../models/Employee.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { currentEmployee, findEmployeeInScope, visibleEmployeeIds } from '../middleware/roleMiddleware.js';
import { sameOrganization } from '../utils/organization.js';
import { forEmployee, monitorTasks, summarise } from '../utils/taskMonitor.js';

// The rules read status, dates, time and the kind/time of history entries: descriptions and comment text stay in the database.
const FIELDS = 'title assignedTo createdBy status priority expectedMinutes actualMinutes dueDate completedAt submittedAt createdAt updatedAt history.kind history.createdAt';

/**
 * Tasks an admin's organization created whose assignee record no longer exists. They match no employee, so the
 * normal scope (tasks of visible employees) never returns them; the creator's organization places them instead.
 */
async function orphanedTasks(user) {
  const creators = await User.find(sameOrganization(user)).select('_id').lean();
  const assignees = await Task.distinct('assignedTo', { createdBy: { $in: creators.map(({ _id }) => _id) } });
  if (!assignees.length) return [];
  const existing = new Set((await Employee.find({ _id: { $in: assignees } }).select('_id').lean()).map(({ _id }) => String(_id)));
  const missing = assignees.filter((id) => !existing.has(String(id)));
  if (!missing.length) return [];
  return Task.find({ assignedTo: { $in: missing }, createdBy: { $in: creators.map(({ _id }) => _id) } }).select(FIELDS).lean();
}

/**
 * Task health for whoever asks: admins their organization, managers their team, employees their own tasks.
 * `employeeId` narrows it to one employee in the caller's scope (ignored for employees, like the other reports).
 * Computed on every request from the stored tasks, so it is never stale and nothing is written.
 */
export async function taskHealth(user, { employeeId } = {}, now = new Date()) {
  let assigneeIds;
  if (user.role === 'employee') assigneeIds = [(await currentEmployee(user))._id];
  else if (employeeId) assigneeIds = [(await findEmployeeInScope(user, employeeId))._id];
  else assigneeIds = await visibleEmployeeIds(user);

  const tasks = await Task.find({ assignedTo: { $in: assigneeIds } }).select(FIELDS).lean();
  if (user.role === 'admin' && !employeeId) tasks.push(...(await orphanedTasks(user)));

  const [employees, creators] = await Promise.all([
    Employee.find({ _id: { $in: [...new Set(tasks.map((task) => String(task.assignedTo)))] } }).select('status organization user').populate('user', 'name').lean(),
    User.find({ _id: { $in: [...new Set(tasks.map((task) => String(task.createdBy)))] } }).select('organization').lean()
  ]);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const creatorById = new Map(creators.map((creator) => [String(creator._id), creator]));

  const result = monitorTasks(tasks, { now, employees: employeeById, creators: creatorById });
  const flags = user.role === 'employee' ? forEmployee(result.flags) : result.flags;
  const taskById = new Map(tasks.map((task) => [String(task._id), task]));

  return {
    generatedAt: new Date(now).toISOString(),
    scope: user.role === 'employee' ? 'own' : employeeId ? 'employee' : user.role === 'admin' ? 'organization' : 'team',
    summary: summarise(tasks, flags),
    thresholds: result.thresholds,
    flags: flags.map((flag) => {
      const task = taskById.get(flag.taskId);
      const assignee = employeeById.get(String(task.assignedTo));
      return {
        ...flag,
        taskTitle: task.title,
        taskStatus: task.status,
        employeeId: String(task.assignedTo),
        assigneeName: assignee?.user?.name ?? null
      };
    })
  };
}
