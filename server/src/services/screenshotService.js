import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { Screenshot } from '../models/Screenshot.js';
import { toDateKey } from '../utils/dateUtils.js';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export function isJpeg(buffer) {
  return Buffer.isBuffer(buffer) && JPEG_MAGIC.every((byte, index) => buffer[index] === byte);
}

/** Writes the image under SCREENSHOT_DIR/<employee>/<date>/ and records its metadata. */
export async function storeScreenshot(employee, capturedAt, buffer) {
  const directory = path.join(env.SCREENSHOT_DIR, employee._id.toString(), toDateKey(capturedAt));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, `${randomUUID()}.jpg`);
  await writeFile(filePath, buffer, { mode: 0o600 });
  return Screenshot.create({ employee: employee._id, capturedAt, bytes: buffer.length, filePath, consentVersion: employee.consent?.version ?? 1 });
}

/** Image bytes, or null when the file has already been deleted. */
export async function readImage(screenshotId) {
  const screenshot = await Screenshot.findById(screenshotId).select('+filePath');
  if (!screenshot?.filePath) return null;
  try {
    return await readFile(screenshot.filePath);
  } catch {
    return null;
  }
}

/** Deletes the image file but keeps the metadata row (category labels). */
export async function deleteImage(screenshot) {
  const withPath = screenshot.filePath === undefined ? await Screenshot.findById(screenshot._id).select('+filePath') : screenshot;
  if (withPath?.filePath) await rm(withPath.filePath, { force: true });
  await Screenshot.updateOne({ _id: screenshot._id }, { $unset: { filePath: 1 }, imageDeletedAt: new Date() });
}

/** Removes a screenshot completely (image and record). */
export async function deleteScreenshot(screenshot) {
  await deleteImage(screenshot);
  await Screenshot.deleteOne({ _id: screenshot._id });
}

/** Deletes every screenshot of an employee, e.g. when they turn screenshots off or withdraw consent. */
export async function deleteAllForEmployee(employeeId) {
  const screenshots = await Screenshot.find({ employee: employeeId }).select('+filePath');
  await Promise.all(screenshots.map(deleteScreenshot));
  return screenshots.length;
}

/** Records that `user` opened this screenshot's image. */
export async function recordView(screenshot, user) {
  await Screenshot.updateOne({ _id: screenshot._id }, { $push: { views: { user: user._id, at: new Date() } } });
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
 * Deletes every screenshot (image file and record) taken more than SCREENSHOT_RETENTION_DAYS ago,
 * whether or not it was analysed. Runs at server start and every hour.
 * @returns {Promise<number>} number of screenshots deleted
 */
export async function purgeExpiredScreenshots(now = new Date()) {
  const cutoff = retentionCutoff(now);
  const expired = await Screenshot.find({ capturedAt: { $lt: cutoff } }).select('+filePath');
  for (const screenshot of expired) await deleteScreenshot(screenshot);
  await sweepOldFolders(cutoff);
  return expired.length;
}

export function toScreenshotResponse(screenshot, { includeViews = false } = {}) {
  return {
    id: screenshot._id.toString(),
    capturedAt: screenshot.capturedAt,
    status: screenshot.status,
    hasImage: !screenshot.imageDeletedAt,
    analysis: screenshot.analysis?.category ? screenshot.analysis : null,
    ...(includeViews && {
      views: (screenshot.views ?? []).map((view) => ({ name: view.user?.name ?? 'Deleted user', role: view.user?.role, at: view.at }))
    })
  };
}
