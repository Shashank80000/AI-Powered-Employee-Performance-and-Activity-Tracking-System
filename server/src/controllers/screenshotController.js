import { z } from 'zod';
import { env } from '../config/env.js';
import { Screenshot } from '../models/Screenshot.js';
import { currentEmployee, findEmployeeInScope, visibleEmployeeIds } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { deleteScreenshot, isJpeg, readImage, recordView, storeScreenshot, toScreenshotResponse } from '../services/screenshotService.js';
import { CONSENT_VERSION } from './consentController.js';
import { capturedWhileNotTracking } from './trackingController.js';
import { addDays, startOfDay } from '../utils/dateUtils.js';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const dateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Desktop agent upload: raw JPEG body, capture time in X-Captured-At. */
export async function uploadScreenshot(request, response) {
  const employee = await currentEmployee(request.user);
  if (!employee.consent?.acceptedAt || !employee.consent.screenshots) {
    throw new HttpError(403, 'Screenshot consent has not been given');
  }
  if ((employee.consent.version ?? 1) < CONSENT_VERSION || !employee.consent.managerViewScreenshots) {
    throw new HttpError(403, 'Agree that your manager can view screenshots in the desktop agent before screenshots are taken');
  }
  if (!isJpeg(request.body)) throw new HttpError(400, 'Body must be a JPEG image');

  const capturedAt = new Date(request.get('X-Captured-At') ?? '');
  if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
    throw new HttpError(400, 'X-Captured-At must be a valid, non-future ISO date');
  }

  if (capturedWhileNotTracking(employee, capturedAt)) {
    throw new HttpError(409, 'Tracking was paused when this screenshot was taken, so it was not stored');
  }

  const screenshot = await storeScreenshot(employee, capturedAt, request.body);
  response.status(201).json({ screenshot: { id: screenshot._id.toString(), capturedAt: screenshot.capturedAt } });
}

/** The person's own screenshots for a day, including who viewed each one. */
export async function listOwnScreenshots(request, response) {
  const { date } = dateSchema.parse(request.query);
  const employee = await currentEmployee(request.user);
  const start = startOfDay(date ? new Date(`${date}T00:00:00Z`) : new Date());
  const screenshots = await Screenshot.find({ employee: employee._id, capturedAt: { $gte: start, $lt: addDays(start, 1) } })
    .sort({ capturedAt: 1 })
    .populate('views.user', 'name role');
  response.json({
    screenshots: screenshots.map((screenshot) => toScreenshotResponse(screenshot, { includeViews: true })),
    retentionDays: env.SCREENSHOT_RETENTION_DAYS
  });
}

async function findOwn(request) {
  const employee = await currentEmployee(request.user);
  const screenshot = await Screenshot.findOne({ _id: request.params.id, employee: employee._id });
  if (!screenshot) throw new HttpError(404, 'Screenshot not found');
  return screenshot;
}

export async function getOwnImage(request, response) {
  const screenshot = await findOwn(request);
  const image = await readImage(screenshot._id);
  if (!image) throw new HttpError(410, 'This image has already been deleted');
  response.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' }).send(image);
}

export async function deleteOwnScreenshot(request, response) {
  await deleteScreenshot(await findOwn(request));
  response.status(204).end();
}

// First consent version that lets managers and admins view screenshots.
const MANAGER_VIEW_VERSION = 2;

const teamQuerySchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid employeeId'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

/** Managers (own team) and admins: one employee's screenshots for a day. Listing is not logged; opening an image is. */
export async function listTeamScreenshots(request, response) {
  const { employeeId, date } = teamQuerySchema.parse(request.query);
  const employee = await findEmployeeInScope(request.user, employeeId);
  const start = startOfDay(date ? new Date(`${date}T00:00:00Z`) : new Date());
  const screenshots = await Screenshot.find({
    employee: employee._id,
    capturedAt: { $gte: start, $lt: addDays(start, 1) },
    consentVersion: { $gte: MANAGER_VIEW_VERSION }
  }).sort({ capturedAt: 1 });
  response.json({ screenshots: screenshots.map((screenshot) => toScreenshotResponse(screenshot)), retentionDays: env.SCREENSHOT_RETENTION_DAYS });
}

/** Managers (own team) and admins: open one image. Every call is recorded and shown to the person. */
export async function getTeamImage(request, response) {
  const screenshot = await Screenshot.findOne({
    _id: request.params.id,
    employee: { $in: await visibleEmployeeIds(request.user) },
    consentVersion: { $gte: MANAGER_VIEW_VERSION }
  });
  if (!screenshot) throw new HttpError(404, 'Screenshot not found');
  const image = await readImage(screenshot._id);
  if (!image) throw new HttpError(410, 'This image has already been deleted');
  await recordView(screenshot, request.user);
  response.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' }).send(image);
}
