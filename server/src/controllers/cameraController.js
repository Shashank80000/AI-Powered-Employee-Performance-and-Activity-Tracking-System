import { z } from 'zod';
import { env } from '../config/env.js';
import { CameraObservation, CAMERA_STATES } from '../models/CameraObservation.js';
import { currentEmployee, findEmployeeInScope } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { capturedWhileNotTracking } from './trackingController.js';
import { summarizeCameraDay } from '../utils/cameraSummary.js';
import { addDays, startOfDay } from '../utils/dateUtils.js';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
// An observation closes the interval it was taken in, so allow it right after a pause.
const PAUSE_GRACE_MS = 60 * 1000;

const consentSchema = z.object({
  // The person typed their agreement in camera-agent; nothing is recorded without it.
  agreed: z.literal(true, { errorMap: () => ({ message: 'Camera checks require your explicit agreement' }) }),
  mode: z.enum(['local', 'vision'])
});

export const observationSchema = z.object({
  observedAt: z.coerce.date(),
  state: z.enum(CAMERA_STATES),
  activity: z.string().trim().max(80).optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['local', 'vision'])
});

const dateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const teamQuerySchema = dateSchema.extend({ employeeId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid employeeId') });

function toConsentResponse(employee) {
  const consent = employee.cameraConsent ?? {};
  return {
    given: Boolean(consent.given),
    mode: consent.given ? consent.mode : null,
    acceptedAt: consent.given ? consent.acceptedAt : null,
    intervalMinutes: env.CAMERA_INTERVAL_MINUTES,
    retentionDays: env.CAMERA_RETENTION_DAYS
  };
}

function toObservationResponse({ _id, observedAt, state, activity, confidence, source }) {
  return { id: _id.toString(), observedAt, state, activity: activity ?? null, confidence: confidence ?? null, source };
}

function dayRange(date) {
  const start = startOfDay(date ? new Date(`${date}T00:00:00Z`) : new Date());
  return { $gte: start, $lt: addDays(start, 1) };
}

async function dayResponse(employee, date) {
  const observations = await CameraObservation.find({ employee: employee._id, observedAt: dayRange(date) }).sort({ observedAt: 1 }).lean();
  return {
    observations: observations.map(toObservationResponse),
    summary: summarizeCameraDay(observations, env.CAMERA_INTERVAL_MINUTES),
    intervalMinutes: env.CAMERA_INTERVAL_MINUTES,
    retentionDays: env.CAMERA_RETENTION_DAYS
  };
}

/** Deletes every camera observation of an employee (consent withdrawn). */
export function deleteAllCameraObservations(employeeId) {
  return CameraObservation.deleteMany({ employee: employeeId });
}

export async function getCameraConsent(request, response) {
  response.json({ consent: toConsentResponse(await currentEmployee(request.user)) });
}

export async function saveCameraConsent(request, response) {
  const { mode } = consentSchema.parse(request.body);
  const employee = await currentEmployee(request.user);
  if (employee.status === 'inactive') throw new HttpError(403, 'Account is inactive');
  employee.cameraConsent = { given: true, mode, acceptedAt: new Date(), withdrawnAt: undefined };
  await employee.save();
  response.json({ consent: toConsentResponse(employee) });
}

/** Turns camera checks off and deletes every observation already recorded. */
export async function withdrawCameraConsent(request, response) {
  const employee = await currentEmployee(request.user);
  employee.cameraConsent = { given: false, withdrawnAt: new Date() };
  await employee.save();
  await deleteAllCameraObservations(employee._id);
  response.status(204).end();
}

/** camera-agent reports one observation: a label, never an image. */
export async function recordObservation(request, response) {
  const input = observationSchema.parse(request.body);
  const employee = await currentEmployee(request.user);
  if (!employee.cameraConsent?.given) throw new HttpError(403, 'Camera consent has not been given');
  if (input.source === 'vision' && employee.cameraConsent.mode !== 'vision') {
    throw new HttpError(403, 'Camera consent covers on-device checks only');
  }
  if (input.observedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) throw new HttpError(400, 'observedAt must not be in the future');
  if (input.observedAt < employee.cameraConsent.acceptedAt) throw new HttpError(409, 'Observed before camera consent was given');
  if (capturedWhileNotTracking(employee, input.observedAt, PAUSE_GRACE_MS)) {
    throw new HttpError(409, 'Tracking was paused at that time, so the observation was not stored');
  }

  const observation = await CameraObservation.create({ employee: employee._id, ...input });
  response.status(201).json({ observation: toObservationResponse(observation) });
}

/** The person's own camera observations for a day. */
export async function listOwnObservations(request, response) {
  const { date } = dateSchema.parse(request.query);
  response.json(await dayResponse(await currentEmployee(request.user), date));
}

/** Managers (own team) and admins: one employee's camera labels for a day. Only if that person consented. */
export async function listTeamObservations(request, response) {
  const { employeeId, date } = teamQuerySchema.parse(request.query);
  const employee = await findEmployeeInScope(request.user, employeeId);
  response.json({ cameraConsent: Boolean(employee.cameraConsent?.given), ...(await dayResponse(employee, date)) });
}
