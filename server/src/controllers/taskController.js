import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { Task, TASK_PRIORITIES, TASK_STATUSES } from '../models/Task.js';
import { currentEmployee, findEmployeeInScope, visibleEmployeeIds } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { recalculateDay } from '../services/performanceService.js';
import { objectId } from '../utils/accountRules.js';
import { toDateKey } from '../utils/dateUtils.js';

const listSchema = z.object({
  assignedTo: z.union([z.literal('me'), objectId]).optional(),
  status: z.enum(TASK_STATUSES).optional()
});

// A real calendar date: null, 0 or false would otherwise become 1 January 1970.
const dueDateField = z
  .union([z.string().min(1), z.date()], { errorMap: () => ({ message: 'Choose a valid due date' }) })
  .pipe(z.coerce.date({ errorMap: () => ({ message: 'Choose a valid due date' }) }))
  .refine((date) => date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100, 'Choose a due date between the years 2000 and 2100');

const createSchema = z.object({
  title: z.string().trim().min(2, 'Enter a task title of at least 2 characters').max(140, 'Keep the title under 140 characters'),
  description: z.string().trim().max(4000, 'Keep the description under 4000 characters').optional(),
  assignedTo: objectId,
  priority: z.enum(TASK_PRIORITIES).optional(),
  expectedMinutes: z.number().int().min(0, 'Expected time cannot be negative').max(100 * 60, 'Expected time is limited to 100 hours').optional(),
  dueDate: dueDateField.optional()
});

// null removes the due date.
const managerUpdateSchema = createSchema.partial().extend({ status: z.enum(TASK_STATUSES).optional(), dueDate: dueDateField.nullable().optional() });
// Managers can move a task back (e.g. reopen approved work). It reaches review only by the employee
// submitting it, and done only through an approval, so every approval is recorded.
const MANAGER_STATUSES = ['todo', 'in-progress'];
const STATUS_LABELS = { todo: 'To do', 'in-progress': 'In progress', review: 'In review', done: 'Done' };

// Employees move their own tasks along and log time; only a manager or admin marks work done.
const EMPLOYEE_STATUSES = ['todo', 'in-progress', 'review'];
const employeeUpdateSchema = z.object({
  status: z.enum(EMPLOYEE_STATUSES, { message: 'Submit the task for review; your manager marks it done' }).optional(),
  // Shown to the manager with the submission.
  note: z.string().trim().max(2000, 'Keep the note under 2000 characters').optional(),
  actualMinutesDelta: z.number().min(0).max(24 * 60).optional()
});
const EMPLOYEE_FIELDS = new Set(Object.keys(employeeUpdateSchema.shape));
// More logged time than this on one task is almost certainly a mistake (about two working months).
const MAX_ACTUAL_MINUTES = 320 * 60;

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
    submittedAt: task.submittedAt,
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

/** Recalculates the daily records a task counted towards, for each employee and day given. */
async function recalculateTaskDays(entries) {
  const seen = new Set();
  for (const [employee, date] of entries) {
    if (!employee || !date) continue;
    const key = `${employee}|${toDateKey(date)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await recalculateDay(employee, new Date(date));
  }
}

/** Every day a task counts towards for its assignee: today, its due date and the day it was completed. */
const taskDays = (assignedTo, { dueDate, completedAt }) => [[assignedTo, new Date()], [assignedTo, dueDate], [assignedTo, completedAt]];

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
  // The new task counts towards today and its due date straight away.
  await recalculateTaskDays(taskDays(task.assignedTo, task));
  await respond(response, task, 201);
}

export async function updateTask(request, response) {
  const task = await findTaskInScope(request.user, request.params.id);
  const before = { assignedTo: task.assignedTo, dueDate: task.dueDate, completedAt: task.completedAt };

  if (request.user.role === 'employee') {
    // Refuse rather than silently ignore what an employee can't change.
    const other = Object.keys(request.body ?? {}).filter((field) => !EMPLOYEE_FIELDS.has(field));
    if (other.length) throw new HttpError(403, `Only your manager can change ${other.join(', ')}. You can change the status, log time and add a note.`);
    const { status, note, actualMinutesDelta } = employeeUpdateSchema.parse(request.body);
    if (task.status === 'done' && status && status !== task.status) {
      throw new HttpError(409, 'This task is approved and closed. Ask your manager if it needs more work.');
    }
    if (status && status !== task.status) {
      const withdrawn = task.status === 'review';
      task.status = status;
      if (status === 'review') addEvent(task, request.user, 'submitted', note);
      // Taking back a submission is part of the review record; starting work isn't worth an entry.
      else if (withdrawn) addEvent(task, request.user, 'status-changed', `Withdrew the submission (moved to ${STATUS_LABELS[status]})${note ? `: ${note}` : ''}`);
      else if (note) addEvent(task, request.user, 'comment', note);
    } else if (note) {
      addEvent(task, request.user, 'comment', note);
    }
    // The desktop agent sends the time it measured, also just after an approval (time worked before it). It keeps
    // and re-sends time the server refuses, so an implausible total is capped here rather than refused.
    if (actualMinutesDelta) task.actualMinutes = Math.min(task.actualMinutes + actualMinutesDelta, MAX_ACTUAL_MINUTES);
  } else {
    const changes = managerUpdateSchema.parse(request.body);
    // Submitted and approved work belongs to whoever did it: decide on it first.
    if (changes.assignedTo && changes.assignedTo !== String(task.assignedTo) && ['review', 'done'].includes(task.status)) {
      throw new HttpError(409, 'This task was already submitted by its assignee. Approve it or send it back before reassigning it.');
    }
    if (changes.assignedTo) await findAssignableEmployee(request.user, changes.assignedTo);
    if (changes.status && changes.status !== task.status) {
      if (!MANAGER_STATUSES.includes(changes.status)) {
        throw new HttpError(400, 'Work reaches review when the employee submits it, and is marked done when you approve it');
      }
      // A submission is answered with Approve or Send back (with feedback), never moved silently.
      if (task.status === 'review') throw new HttpError(409, 'This task is waiting for your review. Approve it or send it back with feedback.');
      addEvent(task, request.user, 'status-changed', `Moved to ${STATUS_LABELS[changes.status]}`);
    }
    if (changes.assignedTo && changes.assignedTo !== String(task.assignedTo)) {
      const [from, to] = await Promise.all([Employee.findById(task.assignedTo).populate('user', 'name'), Employee.findById(changes.assignedTo).populate('user', 'name')]);
      addEvent(task, request.user, 'updated', `Reassigned from ${from?.user?.name ?? 'someone'} to ${to?.user?.name ?? 'someone'}`);
    }
    if ('dueDate' in changes && String(changes.dueDate ?? '') !== String(task.dueDate ?? '')) {
      addEvent(task, request.user, 'updated', changes.dueDate ? `Due date set to ${toDateKey(changes.dueDate)}` : 'Due date removed');
    }
    const { dueDate, ...rest } = changes;
    task.set(rest);
    if ('dueDate' in changes) task.dueDate = dueDate ?? undefined;
  }

  const countsChanged = task.isModified('status') || task.isModified('assignedTo') || task.isModified('dueDate');
  await task.save();
  // Recount the old and the new assignee, on every day the task counted (or now counts) towards.
  if (countsChanged) await recalculateTaskDays([...taskDays(before.assignedTo, before), ...taskDays(task.assignedTo, task)]);
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
  await recalculateTaskDays(taskDays(task.assignedTo, task));
  response.status(204).end();
}
