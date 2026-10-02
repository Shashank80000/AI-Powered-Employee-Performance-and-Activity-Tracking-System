import { z } from 'zod';
import { env } from '../config/env.js';
import { currentEmployee } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { deleteAllForEmployee } from '../services/screenshotService.js';
import { deleteAllCameraObservations } from './cameraController.js';

// Version 2: the person's manager (and admins) can view their screenshots, and every view is logged.
// Consent given under version 1 ("managers never see screenshots") doesn't cover that.
export const CONSENT_VERSION = 2;

const consentSchema = z
  .object({
    activity: z.literal(true, { errorMap: () => ({ message: 'Activity time is required for tracking' }) }),
    keyboard: z.boolean(),
    apps: z.boolean(),
    screenshots: z.boolean(),
    managerViewScreenshots: z.boolean().default(false),
    version: z.literal(CONSENT_VERSION)
  })
  // Screenshots can only be turned on together with the explicit manager-viewing agreement.
  .refine((choices) => !choices.screenshots || choices.managerViewScreenshots, {
    message: 'Screenshots require agreeing that your manager and administrators can view them',
    path: ['managerViewScreenshots']
  });

function toResponse(consent) {
  return {
    version: consent?.version ?? CONSENT_VERSION,
    activity: Boolean(consent?.activity),
    keyboard: Boolean(consent?.keyboard),
    apps: Boolean(consent?.apps),
    screenshots: Boolean(consent?.screenshots),
    managerViewScreenshots: Boolean(consent?.screenshots && consent?.managerViewScreenshots),
    acceptedAt: consent?.acceptedAt ?? null
  };
}

export async function getConsent(request, response) {
  const employee = await currentEmployee(request.user);
  response.json({
    consent: toResponse(employee.consent),
    screenshotIntervalMinutes: env.SCREENSHOT_INTERVAL_MINUTES,
    screenshotRetentionDays: env.SCREENSHOT_RETENTION_DAYS
  });
}

/** Records the choices the person made in the desktop agent. */
export async function saveConsent(request, response) {
  const choices = consentSchema.parse(request.body);
  const employee = await currentEmployee(request.user);
  if (employee.status === 'inactive') throw new HttpError(403, 'Account is inactive');

  const turnedOffScreenshots = employee.consent?.screenshots && !choices.screenshots;
  employee.consent = {
    ...choices,
    managerViewScreenshots: choices.screenshots && choices.managerViewScreenshots,
    acceptedAt: new Date(),
    withdrawnAt: undefined
  };
  employee.trackingConsent = true;
  await employee.save();
  // Turning screenshots off deletes every screenshot already taken.
  if (turnedOffScreenshots) await deleteAllForEmployee(employee._id);

  response.json({ consent: toResponse(employee.consent) });
}

/** Withdraws all consent: tracking stops and all of the person's screenshots and camera observations are deleted. */
export async function withdrawConsent(request, response) {
  const employee = await currentEmployee(request.user);
  employee.consent = {
    version: CONSENT_VERSION,
    activity: false,
    keyboard: false,
    apps: false,
    screenshots: false,
    managerViewScreenshots: false,
    withdrawnAt: new Date()
  };
  employee.trackingConsent = false;
  employee.cameraConsent = { given: false, withdrawnAt: new Date() };
  await employee.save();
  await Promise.all([deleteAllForEmployee(employee._id), deleteAllCameraObservations(employee._id)]);
  response.status(204).end();
}
