/*
 * OS PERMISSIONS
 *
 * Reports and requests the operating-system permissions the agent needs for each data type
 * the person enabled. Disabled data types are never requested.
 *
 *   kind           macOS                                           Windows / Linux
 *   -------------  ----------------------------------------------  ----------------------
 *   screenshots    Screen Recording (systemPreferences status)     none needed*
 *   keyboard       Input Monitoring (uiohook-napi; no status API)  none needed
 *   apps           none: get-windows is called with                none needed
 *                  accessibilityPermission:false and
 *                  screenRecordingPermission:false (owner name only)
 *   notifications  Notification.isSupported()                     Notification.isSupported()
 *
 *   * Linux under Wayland may block or blank screen capture (desktopCapturer returns an empty
 *     image or asks through the desktop portal); the screenshot tracker skips empty images.
 *
 * Each permission is described as { kind, status, canRequest, settingsUrl? } where status is
 * 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' | 'unsupported' |
 * 'needs-settings' (the person must finish in System Settings).
 */
import { desktopCapturer, Notification, shell, systemPreferences } from 'electron';
import { CAPABILITIES } from './platform.js';

export const PERMISSION_KINDS = Object.freeze(['keyboard', 'apps', 'screenshots', 'notifications']);

const IS_MAC = process.platform === 'darwin';

const SETTINGS_URLS = {
  screenshots: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  keyboard: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
};

/** @type {() => boolean} */
let keyboardProbe = () => false;

/**
 * Tell this module how to ask whether the keyboard hook is running (keyboardTracker.isAvailable()).
 * macOS has no API to read Input Monitoring status, so a running hook is the only evidence.
 * @param {() => boolean} fn
 */
export function setKeyboardAvailabilityProbe(fn) {
  keyboardProbe = typeof fn === 'function' ? fn : () => false;
}

function screenAccessStatus() {
  try {
    return systemPreferences.getMediaAccessStatus('screen');
  } catch {
    return 'unknown';
  }
}

function notificationsSupported() {
  try {
    return Notification.isSupported();
  } catch {
    return false;
  }
}

/**
 * Describe one permission.
 * @param {'keyboard'|'apps'|'screenshots'|'notifications'} kind
 * @returns {{kind: string, status: string, canRequest: boolean, settingsUrl?: string}}
 */
export function getPermission(kind) {
  if (!PERMISSION_KINDS.includes(kind)) throw new Error(`Unknown permission kind: ${kind}`);

  if (kind === 'notifications') {
    // macOS asks the person the first time a notification is shown; nothing to request here.
    return { kind, status: notificationsSupported() ? 'granted' : 'unsupported', canRequest: false };
  }

  // Some systems can't do this at all (e.g. Linux Wayland): say so instead of claiming "granted".
  const capability = CAPABILITIES[kind];
  if (capability && !capability.supported) return { kind, status: 'unsupported', canRequest: false, reason: capability.reason };

  // Windows and Linux (X11) have no per-app permission for these APIs.
  if (!IS_MAC) return { kind, status: 'granted', canRequest: false };

  if (kind === 'screenshots') {
    const status = screenAccessStatus();
    return {
      kind,
      status,
      canRequest: status !== 'granted' && status !== 'restricted',
      settingsUrl: SETTINGS_URLS.screenshots,
    };
  }
  if (kind === 'keyboard') {
    let running = false;
    try {
      running = Boolean(keyboardProbe());
    } catch {
      running = false;
    }
    const status = running ? 'granted' : 'unknown';
    return { kind, status, canRequest: status !== 'granted', settingsUrl: SETTINGS_URLS.keyboard };
  }
  // apps: owner name only, no permission needed.
  return { kind, status: 'granted', canRequest: false };
}

/**
 * Status of every permission kind.
 * @returns {Record<string, {kind: string, status: string, canRequest: boolean, settingsUrl?: string}>}
 */
export function getPermissionStatus() {
  return Object.fromEntries(PERMISSION_KINDS.map((kind) => [kind, getPermission(kind)]));
}

/** True when a screenshot may be captured as far as the OS is concerned. */
export function isScreenCaptureGranted() {
  return getPermission('screenshots').status === 'granted';
}

async function openSettings(kind) {
  const url = SETTINGS_URLS[kind];
  if (!url) return;
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.warn(`[permissions] could not open settings for ${kind}:`, err?.message ?? err);
  }
}

/**
 * Ask the OS for a permission (only called for data types the person enabled).
 * @param {'keyboard'|'apps'|'screenshots'|'notifications'} kind
 * @returns {Promise<{kind: string, status: string, canRequest: boolean, settingsUrl?: string}>}
 */
export async function requestPermission(kind) {
  const current = getPermission(kind);
  if (current.status === 'granted' || !current.canRequest || !IS_MAC) return current;

  if (kind === 'screenshots') {
    // Asking for sources once makes macOS show its Screen Recording prompt. The 1x1
    // thumbnails are discarded immediately and never looked at.
    try {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    } catch {
      /* denied or unavailable: fall through to System Settings */
    }
    const after = getPermission('screenshots');
    if (after.status === 'granted') return after;
    await openSettings('screenshots');
    return { ...after, status: 'needs-settings' };
  }

  if (kind === 'keyboard') {
    // No prompt API for Input Monitoring: send the person to the right System Settings pane.
    await openSettings('keyboard');
    return { ...current, status: 'needs-settings' };
  }

  return current;
}
