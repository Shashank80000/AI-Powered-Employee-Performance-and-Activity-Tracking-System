import { z } from 'zod';
import { env } from '../config/env.js';
import { CameraObservation, CAMERA_STATES } from '../models/CameraObservation.js';
import { DailyAnalysis } from '../models/DailyAnalysis.js';
import { Employee } from '../models/Employee.js';
import { Performance } from '../models/Performance.js';
import { Screenshot, SCREENSHOT_CATEGORIES } from '../models/Screenshot.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { readImage, toScreenshotResponse } from '../services/screenshotService.js';
import { addDays, startOfDay } from '../utils/dateUtils.js';
import { toAnalysisResponse } from './analysisController.js';

// Internal API for analysis-agent, protected by X-Service-Key (see authMiddleware.requireServiceKey).

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const analysisSchema = z.object({
  category: z.enum(SCREENSHOT_CATEGORIES),
  activity: z.string().max(80),
  productive: z.boolean(),
  confidence: z.number().min(0).max(1)
});

const resultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('analyzed'), analysis: analysisSchema }),
  z.object({ status: z.literal('failed') })
]);

const dailySchema = z.object({
  employeeId: objectId,
  date: dateString,
  screenshotCount: z.number().int().min(0),
  analyzedCount: z.number().int().min(0),
  categoryMinutes: z.record(z.enum(SCREENSHOT_CATEGORIES), z.number().min(0)),
  productiveMinutes: z.number().min(0),
  timeline: z.array(z.object({ capturedAt: z.coerce.date(), category: z.enum(SCREENSHOT_CATEGORIES), activity: z.string().max(80) })).max(1000),
  camera: z
    .object({
      observationCount: z.number().int().min(0),
      stateMinutes: z.record(z.enum(CAMERA_STATES), z.number().min(0)),
      atDeskMinutes: z.number().min(0),
      awayMinutes: z.number().min(0)
    })
    .optional(),
  summary: z.string().min(1).max(2000),
  highlights: z.array(z.string().max(300)).max(8),
  suggestions: z.array(z.string().max(300)).max(8),
  model: z.string().max(80),
  generatedAt: z.coerce.date()
});

function dayRange(date) {
  const start = startOfDay(new Date(`${date}T00:00:00Z`));
  return { $gte: start, $lt: addDays(start, 1) };
}

export async function listScreenshots(request, response) {
  const { date, status } = z.object({ date: dateString, status: z.enum(['pending', 'analyzed', 'failed']).default('pending') }).parse(request.query);
  const screenshots = await Screenshot.find({ capturedAt: dayRange(date), status }).sort({ capturedAt: 1 }).lean();
  response.json({
    screenshots: screenshots.map(({ _id, employee, capturedAt }) => ({ id: _id.toString(), employeeId: employee.toString(), capturedAt }))
  });
}

export async function getImage(request, response) {
  const image = await readImage(objectId.parse(request.params.id));
  if (!image) throw new HttpError(404, 'Image not found or already deleted');
  response.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(image);
}

/** Stores the classification. The image stays until the retention job deletes it. */
export async function saveResult(request, response) {
  const result = resultSchema.parse(request.body);
  const screenshot = await Screenshot.findById(objectId.parse(request.params.id));
  if (!screenshot) throw new HttpError(404, 'Screenshot not found');

  screenshot.status = result.status;
  if (result.status === 'analyzed') screenshot.analysis = result.analysis;
  screenshot.analyzedAt = new Date();
  await screenshot.save();

  response.json({ ok: true });
}

export async function getDay(request, response) {
  const employeeId = objectId.parse(request.params.employeeId);
  const { date } = z.object({ date: dateString }).parse(request.query);
  const employee = await Employee.findById(employeeId).populate('user', 'name');
  if (!employee) throw new HttpError(404, 'Employee not found');

  const range = dayRange(date);
  const [performance, screenshots, observations] = await Promise.all([
    Performance.findOne({ employee: employee._id, date: range.$gte }).lean(),
    Screenshot.find({ employee: employee._id, capturedAt: range }).sort({ capturedAt: 1 }),
    CameraObservation.find({ employee: employee._id, observedAt: range }).sort({ observedAt: 1 }).lean()
  ]);

  response.json({
    employee: { id: employee._id.toString(), name: employee.user.name },
    intervalMinutes: env.SCREENSHOT_INTERVAL_MINUTES,
    performance: performance && {
      activeSeconds: performance.activeSeconds,
      idleSeconds: performance.idleSeconds,
      productiveAppSeconds: performance.productiveAppSeconds,
      tasksAssigned: performance.tasksAssigned,
      tasksCompleted: performance.tasksCompleted,
      onTimeTasks: performance.onTimeTasks,
      productivityScore: performance.productivityScore
    },
    screenshots: screenshots.map(({ _id, capturedAt, status, analysis, imageDeletedAt }) => {
      const { hasImage, ...rest } = toScreenshotResponse({ _id, capturedAt, status, analysis, imageDeletedAt });
      return rest;
    }),
    cameraIntervalMinutes: env.CAMERA_INTERVAL_MINUTES,
    cameraObservations: observations.map(({ observedAt, state, activity }) => ({ observedAt, state, activity: activity ?? null }))
  });
}

/** Employees with camera observations on a date, so the agent also analyzes people without screenshots. */
export async function listCameraEmployees(request, response) {
  const { date } = z.object({ date: dateString }).parse(request.query);
  const ids = await CameraObservation.distinct('employee', { observedAt: dayRange(date) });
  response.json({ employeeIds: ids.map((id) => id.toString()) });
}

export async function upsertDailyAnalysis(request, response) {
  const input = dailySchema.parse(request.body);
  if (!(await Employee.exists({ _id: input.employeeId }))) throw new HttpError(404, 'Employee not found');
  const { employeeId, date, ...fields } = input;
  const analysis = await DailyAnalysis.findOneAndUpdate(
    { employee: employeeId, date: startOfDay(new Date(`${date}T00:00:00Z`)) },
    fields,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  response.json({ dailyAnalysis: toAnalysisResponse(analysis) });
}
