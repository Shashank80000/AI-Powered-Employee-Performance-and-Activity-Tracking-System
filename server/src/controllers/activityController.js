import { z } from 'zod';
import { Activity } from '../models/Activity.js';
import { currentEmployee, findEmployeeInScope } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { capturedWhileNotTracking } from './trackingController.js';
import { getActivitySummary, recordSnapshots } from '../services/activityService.js';
import { periodRange } from '../utils/dateUtils.js';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const snapshotSchema = z
  .object({
    capturedAt: z.coerce.date().refine((date) => date.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, 'capturedAt is in the future'),
    intervalSeconds: z.number().int().min(1).max(3600),
    activeSeconds: z.number().min(0),
    idleSeconds: z.number().min(0),
    mouseEvents: z.number().int().min(0).default(0),
    keyboardEvents: z.number().int().min(0).default(0),
    taskId: z.string().regex(/^[a-f\d]{24}$/i).optional()
  })
  .refine((s) => s.activeSeconds + s.idleSeconds <= s.intervalSeconds + 5, 'active + idle exceeds the interval');

const batchSchema = z.object({
  snapshots: z.array(snapshotSchema).min(1).max(500),
  applications: z
    .array(
      z.object({
        application: z.string().min(1).max(120),
        durationSeconds: z.number().min(0).max(3600),
        capturedAt: z.coerce.date()
      })
    )
    .max(2000)
    .default([])
});

const querySchema = z.object({
  employeeId: z.string().optional(),
  period: z.enum(['day', 'week', 'month']).default('week')
});

async function resolveEmployee(user, employeeId) {
  return user.role === 'employee' || !employeeId ? currentEmployee(user) : findEmployeeInScope(user, employeeId);
}

/** Desktop agent upload endpoint (employee accounts only). */
export async function uploadSnapshots(request, response) {
  const batch = batchSchema.parse(request.body);
  const employee = await currentEmployee(request.user);
  const { consent } = employee;
  if (!consent?.acceptedAt || !consent.activity) throw new HttpError(403, 'Tracking consent has not been given');

  // Drop anything recorded while tracking was paused or stopped. The grace period keeps the
  // snapshot that closes the interval in which the pause happened.
  const graceMs = 90 * 1000;
  const whileTracking = (item) => !capturedWhileNotTracking(employee, item.capturedAt, graceMs);

  // Drop anything the person did not agree to share, even if an old agent sends it.
  const snapshots = batch.snapshots.filter(whileTracking).map((snapshot) => (consent.keyboard ? snapshot : { ...snapshot, keyboardEvents: 0 }));
  const applications = consent.apps ? batch.applications.filter(whileTracking) : [];
  const stored = snapshots.length ? await recordSnapshots(employee, { snapshots, applications }) : 0;
  response.status(201).json({ stored });
}

export async function listActivity(request, response) {
  const { employeeId, period } = querySchema.parse(request.query);
  const employee = await resolveEmployee(request.user, employeeId);
  const { start, end } = periodRange(period);
  const activity = await Activity.find({ employee: employee._id, capturedAt: { $gte: start, $lt: end } })
    .sort({ capturedAt: -1 })
    .limit(500)
    .lean();
  response.json({
    activity: activity.map(({ _id, capturedAt, intervalSeconds, activeSeconds, idleSeconds, mouseEvents, keyboardEvents }) => ({
      id: _id.toString(),
      capturedAt,
      intervalSeconds,
      activeSeconds,
      idleSeconds,
      mouseEvents,
      keyboardEvents
    }))
  });
}

export async function activitySummary(request, response) {
  const { employeeId, period } = querySchema.parse(request.query);
  const employee = await resolveEmployee(request.user, employeeId);
  response.json({ summary: await getActivitySummary(employee._id, periodRange(period)) });
}
