import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { Screenshot } from '../models/Screenshot.js';
import { cloudinaryEnabled, destroyImage, downloadImage, uploadImage } from './cloudinaryStorage.js';
import { toDateKey } from '../utils/dateUtils.js';
import { workStatus } from '../utils/workStatus.js';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export function isJpeg(buffer) {
  return Buffer.isBuffer(buffer) && JPEG_MAGIC.every((byte, index) => buffer[index] === byte);
}

const IMAGE_FIELDS = '+filePath +cloudinaryId';

/**
 * Stores the image in Cloudinary when CLOUDINARY_URL is set, otherwise under SCREENSHOT_DIR, both as
 * <employee>/<date>/<uuid>, and records its metadata.
 */
export async function storeScreenshot(employee, capturedAt, buffer) {
  const key = path.join(employee._id.toString(), toDateKey(capturedAt), randomUUID());
  const record = { employee: employee._id, capturedAt, bytes: buffer.length, consentVersion: employee.consent?.version ?? 1 };
  if (!cloudinaryEnabled) {
    const filePath = path.join(env.SCREENSHOT_DIR, `${key}.jpg`);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, buffer, { mode: 0o600 });
    return Screenshot.create({ ...record, filePath });
  }
  const cloudinaryId = await uploadImage(key.split(path.sep).join('/'), buffer);
  try {
    return await Screenshot.create({ ...record, cloudinaryId });
  } catch (error) {
    // No record means nothing would ever delete the image, so remove it now.
    await destroyImage(cloudinaryId).catch(() => {});
    throw error;
  }
}

/** Image bytes, or null when the image has already been deleted. */
export async function readImage(screenshotId) {
  const screenshot = await Screenshot.findById(screenshotId).select(IMAGE_FIELDS);
  if (screenshot?.cloudinaryId) return downloadImage(screenshot.cloudinaryId);
  if (!screenshot?.filePath) return null;
  try {
    return await readFile(screenshot.filePath);
  } catch {
    return null;
  }
}

/** Deletes the image but keeps the metadata row (category labels). */
export async function deleteImage(screenshot) {
  const stored =
    screenshot.filePath === undefined && screenshot.cloudinaryId === undefined
      ? await Screenshot.findById(screenshot._id).select(IMAGE_FIELDS)
      : screenshot;
  if (stored?.cloudinaryId) await destroyImage(stored.cloudinaryId);
  if (stored?.filePath) await rm(stored.filePath, { force: true });
  await Screenshot.updateOne({ _id: screenshot._id }, { $unset: { filePath: 1, cloudinaryId: 1 }, imageDeletedAt: new Date() });
}

/** Removes a screenshot completely (image and record). */
export async function deleteScreenshot(screenshot) {
  await deleteImage(screenshot);
  await Screenshot.deleteOne({ _id: screenshot._id });
}

/** Deletes every screenshot of an employee, e.g. when they turn screenshots off or withdraw consent. */
export async function deleteAllForEmployee(employeeId) {
  const screenshots = await Screenshot.find({ employee: employeeId }).select(IMAGE_FIELDS);
  await Promise.all(screenshots.map(deleteScreenshot));
  return screenshots.length;
}

// Loading the same image again within this window (a re-render, a double click) is the same viewing.
const SAME_VIEW_MS = 60 * 1000;

/** Records that `user` opened this screenshot's image, once per viewing. */
export async function recordView(screenshot, user) {
  const now = new Date();
  const since = new Date(now.getTime() - SAME_VIEW_MS);
  // One atomic update, so two requests arriving together can't both add an entry.
  await Screenshot.updateOne(
    { _id: screenshot._id, views: { $not: { $elemMatch: { user: user._id, at: { $gte: since } } } } },
    { $push: { views: { user: user._id, at: now } } }
  );
}

export function retentionCutoff(now = new Date(), days = env.SCREENSHOT_RETENTION_DAYS) {
  return new Date(now.getTime() - days * 24 * 3600 * 1000);
}

/**
 * Removes image folders for days older than the cutoff, catching files whose record is gone
 * (e.g. after a crash between writing the file and saving the record).
 */
async function sweepOldFolders(cutoff) {
  const cutoffKey = toDateKey(cutoff);
  let removed = 0;
  const employees = await readdir(env.SCREENSHOT_DIR, { withFileTypes: true }).catch(() => []);
  for (const employeeDir of employees.filter((entry) => entry.isDirectory())) {
    const employeePath = path.join(env.SCREENSHOT_DIR, employeeDir.name);
    const days = await readdir(employeePath, { withFileTypes: true }).catch(() => []);
    for (const dayDir of days) {
      // Folder names are YYYY-MM-DD, so string order is date order.
      if (!dayDir.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dayDir.name)) continue;
      const dayPath = path.join(employeePath, dayDir.name);
      const empty = (await readdir(dayPath).catch(() => [null])).length === 0;
      if (dayDir.name < cutoffKey || empty) {
        await rm(dayPath, { recursive: true, force: true });
        removed += 1;
      }
    }
    if ((await readdir(employeePath).catch(() => [null])).length === 0) await rm(employeePath, { recursive: true, force: true });
  }
  return removed;
}

/**
 * Deletes every screenshot (image and record) taken more than SCREENSHOT_RETENTION_DAYS ago,
 * whether or not it was analysed. Runs at server start and every hour.
 * @returns {Promise<number>} number of screenshots deleted
 */
export async function purgeExpiredScreenshots(now = new Date()) {
  const cutoff = retentionCutoff(now);
  const expired = await Screenshot.find({ capturedAt: { $lt: cutoff } }).select(IMAGE_FIELDS);
  let deleted = 0;
  for (const screenshot of expired) {
    try {
      await deleteScreenshot(screenshot);
      deleted += 1;
    } catch (error) {
      // The record stays, so the next run tries again.
      console.error(`Could not delete screenshot ${screenshot._id}: ${error.message}`);
    }
  }
  await sweepOldFolders(cutoff);
  return deleted;
}

function toAnalysis({ category, activity, productive, confidence }) {
  return { category, activity, productive, confidence, status: workStatus({ category, productive }) };
}

export function toScreenshotResponse(screenshot, { includeViews = false } = {}) {
  return {
    id: screenshot._id.toString(),
    capturedAt: screenshot.capturedAt,
    status: screenshot.status,
    hasImage: !screenshot.imageDeletedAt,
    analysis: screenshot.analysis?.category ? toAnalysis(screenshot.analysis) : null,
    ...(includeViews && {
      views: (screenshot.views ?? []).map((view) => ({ name: view.user?.name ?? 'Deleted user', role: view.user?.role, at: view.at }))
    })
  };
}
