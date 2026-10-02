/*
 * CONSENT STORE
 *
 * The person who runs the agent decides what it may collect. Their choices are kept in
 * app.getPath('userData')/consent.json:
 *
 *   { version: 2, acceptedAt: ISO|null, activity: true, keyboard: bool, apps: bool,
 *     screenshots: bool, userId?: string }
 *
 *   - activity     REQUIRED. Active/idle time and mouse-movement count. If the person does
 *                  not accept this, tracking cannot run at all.
 *   - keyboard     key-press COUNT only (never which keys).          default ON
 *   - apps         foreground application NAME + seconds only.       default ON
 *   - screenshots  one JPEG of the primary screen every few minutes. default OFF
 *   - managerViewScreenshots  explicit agreement that the manager and admins may view the
 *                  screenshots. Required for screenshots; without it screenshots stay off.
 *
 * acceptedAt === null means "no consent yet" (or withdrawn): nothing is tracked.
 * userId records which signed-in account accepted on this computer, so one account's
 * consent is never applied to another account. The file contains choices only, no data.
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// Version 2: the person's manager (and admins) can view their screenshots; every view is logged.
// A file saved under an older version counts as "no consent yet", so the person is asked again.
export const CONSENT_VERSION = 2;
const CONSENT_FILE = 'consent.json';

/** Defaults shown on first launch. Screenshots are OFF unless the person turns them on. */
export const DEFAULT_CONSENT = Object.freeze({
  version: CONSENT_VERSION,
  acceptedAt: null,
  activity: true,
  keyboard: true,
  apps: true,
  screenshots: false,
  managerViewScreenshots: false,
});

const consentPath = () => path.join(app.getPath('userData'), CONSENT_FILE);

/**
 * Coerce any input into a valid consent object. Unknown fields are dropped.
 * @param {object} [input]
 * @returns {{version: number, acceptedAt: string|null, activity: true, keyboard: boolean, apps: boolean, screenshots: boolean, userId?: string}}
 */
export function normalizeConsent(input = {}) {
  const pick = (key) => (typeof input?.[key] === 'boolean' ? input[key] : DEFAULT_CONSENT[key]);
  const acceptedAt =
    typeof input?.acceptedAt === 'string' && !Number.isNaN(Date.parse(input.acceptedAt)) ? input.acceptedAt : null;
  return {
    version: CONSENT_VERSION,
    acceptedAt,
    activity: true, // required; declining it means not accepting at all
    keyboard: pick('keyboard'),
    apps: pick('apps'),
    // Screenshots only count as on together with the explicit manager-viewing agreement.
    screenshots: pick('screenshots') && pick('managerViewScreenshots'),
    managerViewScreenshots: pick('screenshots') && pick('managerViewScreenshots'),
    ...(input?.userId != null ? { userId: String(input.userId) } : {}),
  };
}

/**
 * Body for PUT /consent (server contract).
 * @param {object} consent
 * @returns {{activity: true, keyboard: boolean, apps: boolean, screenshots: boolean, version: number}}
 */
export function toServerConsent(consent) {
  const c = normalizeConsent(consent);
  return {
    activity: true,
    keyboard: c.keyboard,
    apps: c.apps,
    screenshots: c.screenshots,
    managerViewScreenshots: c.managerViewScreenshots,
    version: CONSENT_VERSION,
  };
}

/**
 * Load the saved consent. Returns defaults (acceptedAt null) when there is no file, the file
 * is unreadable, it was written for an older consent version, or it belongs to another account.
 * @param {string|null} [userId] the signed-in account
 */
export function loadConsent(userId = null) {
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync(consentPath(), 'utf8'));
  } catch {
    saved = null;
  }
  if (!saved || saved.version !== CONSENT_VERSION) {
    return normalizeConsent({ ...(userId != null ? { userId } : {}) });
  }
  const consent = normalizeConsent(saved);
  if (userId != null && consent.userId !== String(userId)) {
    // Another account accepted on this computer: this person must decide for themselves.
    return normalizeConsent({ userId });
  }
  return consent;
}

/**
 * Persist consent (choices only). Never throws; returns the normalized object.
 * @param {object} consent
 */
export function saveConsent(consent) {
  const c = normalizeConsent(consent);
  try {
    fs.writeFileSync(consentPath(), JSON.stringify(c, null, 2), { mode: 0o600 });
  } catch (err) {
    console.warn('[consentStore] could not save consent:', err?.message ?? err);
  }
  return c;
}

/**
 * Withdraw consent: keeps the person's toggle preferences but clears acceptedAt, so
 * nothing is tracked until they accept again.
 * @param {object} [current] current consent (defaults to what is on disk)
 */
export function withdrawConsent(current) {
  const base = current ?? loadConsent();
  return saveConsent({ ...base, acceptedAt: null });
}

/**
 * Consent version stored on this computer for this account, or null if none. Used to tell the
 * person why they're being asked again after the terms changed.
 * @param {string|null} [userId]
 */
export function savedConsentVersion(userId = null) {
  try {
    const saved = JSON.parse(fs.readFileSync(consentPath(), 'utf8'));
    if (!saved?.acceptedAt) return null;
    if (userId != null && saved.userId != null && String(saved.userId) !== String(userId)) return null;
    return Number(saved.version) || null;
  } catch {
    return null;
  }
}
