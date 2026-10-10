import { z } from 'zod';
import { Task, TASK_PRIORITIES, TASK_STATUSES } from '../models/Task.js';
import { currentEmployee, findEmployeeInScope, visibleEmployeeIds } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { recalculateDay } from '../services/performanceService.js';
import { objectId } from '../utils/accountRules.js';

const listSchema = z.object({
  assignedTo: z.union([z.literal('me'), objectId]).optional(),
  status: z.enum(TASK_STATUSES).optional()
});

const createSchema = z.object({
  title: z.string().trim().min(2, 'Enter a task title of at least 2 characters').max(140, 'Keep the title under 140 characters'),
  description: z.string().trim().max(4000, 'Keep the description under 4000 characters').optional(),
  assignedTo: objectId,
  priority: z.enum(TASK_PRIORITIES).optional(),
  expectedMinutes: z.number().int().min(0, 'Expected time cannot be negative').max(100 * 60, 'Expected time is limited to 100 hours').optional(),
  dueDate: z.coerce.date().optional()
});

const managerUpdateSchema = createSchema.partial().extend({ status: z.enum(TASK_STATUSES).optional() });

// Employees move their own tasks along and log time; only a manager or admin marks work done.
const EMPLOYEE_STATUSES = ['todo', 'in-progress', 'review'];
const employeeUpdateSchema = z.object({
  status: z.enum(EMPLOYEE_STATUSES, { message: 'Submit the task for review; your manager marks it done' }).optional(),
  // Shown to the manager with the submission.
  note: z.string().trim().max(2000, 'Keep the note under 2000 characters').optional(),
  actualMinutesDelta: z.number().min(0).max(24 * 60).optional()
});

const commentSchema = z.object({ text: z.string().trim().min(1, 'Write a comment first').max(2000, 'Keep the comment under 2000 characters') });

const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'changes']),
    comment: z.string().trim().max(2000, 'Keep the feedback under 2000 characters').optional()
  })
  .refine((review) => review.decision === 'approve' || (review.comment?.length ?? 0) >= 2, {
    message: 'Explain what needs to change, so the employee knows what to do',
    path: ['comment']
  });

const POPULATE = [
  { path: 'assignedTo', select: 'user', populate: { path: 'user', select: 'name' } },
  { path: 'createdBy', select: 'name' }
];

function toResponse(task) {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedTo: task.assignedTo?._id?.toString() ?? task.assignedTo?.toString(),
    assigneeName: task.assignedTo?.user?.name,
    createdByName: task.createdBy?.name,
    status: task.status,
    priority: task.priority,
    expectedMinutes: task.expectedMinutes,
    actualMinutes: Math.round(task.actualMinutes),
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    history: (task.history ?? []).map((event) => ({
      id: event._id.toString(),
      authorName: event.authorName,
      authorRole: event.authorRole,
      kind: event.kind,
      text: event.text ?? '',
      createdAt: event.createdAt
    }))
  };
}

function addEvent(task, user, kind, text) {
  task.history.push({ author: user._id, authorName: user.name, authorRole: user.role, kind, text: text || undefined });
}

async function findTaskInScope(user, taskId) {
  const ids = await visibleEmployeeIds(user);
  const task = await Task.findOne({ _id: objectId.parse(taskId), assignedTo: { $in: ids } });
  if (!task) throw new HttpError(404, 'Task not found');
  return task;
}

/** Work can only go to someone who can sign in to see it. */
async function findAssignableEmployee(user, employeeId) {
  const employee = await findEmployeeInScope(user, employeeId);
  if (employee.status === 'inactive') throw new HttpError(400, `${employee.user.name} is deactivated. Choose an active employee.`);
  return employee;
}

async function respond(response, task, status = 200) {
  await task.populate(POPULATE);
  response.status(status).json({ task: toResponse(task) });
}

export async function listTasks(request, response) {
  const { assignedTo, status } = listSchema.parse(request.query);
  const filter = { assignedTo: { $in: await visibleEmployeeIds(request.user) } };

  if (assignedTo === 'me') filter.assignedTo = (await currentEmployee(request.user))._id;
  else if (assignedTo) filter.assignedTo = (await findEmployeeInScope(request.user, assignedTo))._id;
  if (status) filter.status = status;

  const tasks = await Task.find(filter).sort({ dueDate: 1, createdAt: -1 }).populate(POPULATE);
  response.json({ tasks: tasks.map(toResponse) });
}

export async function createTask(request, response) {
  const input = createSchema.parse(request.body);
  await findAssignableEmployee(request.user, input.assignedTo);
  const task = await Task.create({ ...input, createdBy: request.user._id });
  await respond(response, task, 201);
}

export async function updateTask(request, response) {
  const task = await findTaskInScope(request.user, request.params.id);

  if (request.user.role === 'employee') {
    const { status, note, actualMinutesDelta } = employeeUpdateSchema.parse(request.body);
    if (status && status !== task.status) {
      if (task.status === 'done') throw new HttpError(409, 'This task is approved and closed. Ask your manager if it needs more work.');
      task.status = status;
      if (status === 'review') addEvent(task, request.user, 'submitted', note);
    }
    if (actualMinutesDelta) task.actualMinutes += actualMinutesDelta;
  } else {
    const changes = managerUpdateSchema.parse(request.body);
    if (changes.assignedTo) await findAssignableEmployee(request.user, changes.assignedTo);
    task.set(changes);
  }

  const statusChanged = task.isModified('status');
  await task.save();
  if (statusChanged) await recalculateDay(task.assignedTo, new Date());
  await respond(response, task);
}

/** Anyone who can see the task can comment on it: questions, progress notes, answers. */
export async function addComment(request, response) {
  const { text } = commentSchema.parse(request.body);
  const task = await findTaskInScope(request.user, request.params.id);
  addEvent(task, request.user, 'comment', text);
  await task.save();
  await respond(response, task, 201);
}

/** Manager or admin: accept submitted work (done) or send it back with feedback (in progress). */
export async function reviewTask(request, response) {
  const { decision, comment } = reviewSchema.parse(request.body);
  const task = await findTaskInScope(request.user, request.params.id);
  if (task.status !== 'review') throw new HttpError(409, 'Only tasks that are waiting for review can be approved or sent back');

  task.status = decision === 'approve' ? 'done' : 'in-progress';
  addEvent(task, request.user, decision === 'approve' ? 'approved' : 'changes-requested', comment);
  await task.save();
  await recalculateDay(task.assignedTo, new Date());
  await respond(response, task);
}

export async function deleteTask(request, response) {
  const task = await findTaskInScope(request.user, request.params.id);
  await task.deleteOne();
  response.status(204).end();
}
