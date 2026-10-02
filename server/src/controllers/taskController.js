import { z } from 'zod';
import { Task, TASK_PRIORITIES, TASK_STATUSES } from '../models/Task.js';
import { currentEmployee, findEmployeeInScope, visibleEmployeeIds } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { recalculateDay } from '../services/performanceService.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const listSchema = z.object({
  assignedTo: z.union([z.literal('me'), objectId]).optional(),
  status: z.enum(TASK_STATUSES).optional()
});

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  assignedTo: objectId,
  priority: z.enum(TASK_PRIORITIES).optional(),
  expectedMinutes: z.number().int().min(0).optional(),
  dueDate: z.coerce.date().optional()
});

const managerUpdateSchema = createSchema.partial().extend({ status: z.enum(TASK_STATUSES).optional() });

// Employees may only move their own tasks along and log time against them.
const employeeUpdateSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  actualMinutesDelta: z.number().min(0).max(24 * 60).optional()
});

function toResponse(task) {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedTo: task.assignedTo?._id?.toString() ?? task.assignedTo?.toString(),
    assigneeName: task.assignedTo?.user?.name,
    status: task.status,
    priority: task.priority,
    expectedMinutes: task.expectedMinutes,
    actualMinutes: Math.round(task.actualMinutes),
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt
  };
}

async function findTaskInScope(user, taskId) {
  const ids = await visibleEmployeeIds(user);
  const task = await Task.findOne({ _id: taskId, assignedTo: { $in: ids } });
  if (!task) throw new HttpError(404, 'Task not found');
  return task;
}

export async function listTasks(request, response) {
  const { assignedTo, status } = listSchema.parse(request.query);
  const filter = { assignedTo: { $in: await visibleEmployeeIds(request.user) } };

  if (assignedTo === 'me') filter.assignedTo = (await currentEmployee(request.user))._id;
  else if (assignedTo) filter.assignedTo = (await findEmployeeInScope(request.user, assignedTo))._id;
  if (status) filter.status = status;

  const tasks = await Task.find(filter)
    .sort({ dueDate: 1, createdAt: -1 })
    .populate({ path: 'assignedTo', select: 'user', populate: { path: 'user', select: 'name' } });
  response.json({ tasks: tasks.map(toResponse) });
}

export async function createTask(request, response) {
  const input = createSchema.parse(request.body);
  await findEmployeeInScope(request.user, input.assignedTo);
  const task = await Task.create({ ...input, createdBy: request.user._id });
  response.status(201).json({ task: toResponse(task) });
}

export async function updateTask(request, response) {
  const task = await findTaskInScope(request.user, request.params.id);

  if (request.user.role === 'employee') {
    const { status, actualMinutesDelta } = employeeUpdateSchema.parse(request.body);
    if (status) task.status = status;
    if (actualMinutesDelta) task.actualMinutes += actualMinutesDelta;
  } else {
    const changes = managerUpdateSchema.parse(request.body);
    if (changes.assignedTo) await findEmployeeInScope(request.user, changes.assignedTo);
    task.set(changes);
  }

  const statusChanged = task.isModified('status');
  await task.save();
  if (statusChanged) await recalculateDay(task.assignedTo, new Date());

  response.json({ task: toResponse(task) });
}

export async function deleteTask(request, response) {
  const task = await findTaskInScope(request.user, request.params.id);
  await task.deleteOne();
  response.status(204).end();
}
