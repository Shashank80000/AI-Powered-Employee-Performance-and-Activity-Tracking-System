/*
 * PRIVACY CONTRACT (applies to every tracker in this agent):
 *   - Collect ONLY counts and durations.
 *   - NEVER record key values/codes, window titles, URLs or file names.
 *   - Screenshots are taken ONLY by screenshotTracker.js, only with the person's explicit consent.
 *   - Nothing runs before the person has accepted the consent screen (consentStore.js), and each
 *     optional data type (keyboard count, app names, screenshots) runs only if the person enabled it.
 *   - Tracking is always visible to the employee (tray tooltip + status window) and can be
 *     paused/resumed by the employee at any time.
 *
 * This module orchestrates the individual trackers. Every SNAPSHOT_INTERVAL (default 60 s)
 * it collects counts/durations from each tracker, builds one snapshot in the server's
 * format and hands it to activityService. Nothing is collected while paused, signed out,
 * or before consent was accepted. Optional trackers are gated by the person's consent:
 *   keyboardTracker    only if consent.keyboard   (otherwise keyboardEvents is 0)
 *   applicationTracker only if consent.apps       (otherwise no applications[] records)
 *   screenshotTracker  only if consent.screenshots AND the OS granted screen capture
 * setConsent() reconfigures them live.
 */
import { CAPABILITIES } from './platform.js';
import fs from 'node:fs';
import path from 'node:path';
import { createIdleTracker } from './idleTracker.js';
import { createMouseTracker } from './mouseTracker.js';
import { createKeyboardTracker } from './keyboardTracker.js';
import { createApplicationTracker } from './applicationTracker.js';
import { createTaskTracker } from './taskTracker.js';
import { createScreenshotTracker } from './screenshotTracker.js';
import { appUsageToRecords, dayKey } from '../utils/activityUtils.js';

/** @typedef {'stopped'|'tracking'|'paused'} TrackingState */

/**
 * Create the activity orchestrator.
 * @param {object} opts
 * @param {ReturnType<import('../services/activityService.js').createActivityService>} [opts.activityService]
 *   may also be attached later with setActivityService()
 * @param {number} [opts.snapshotIntervalSeconds=60]
 * @param {number} [opts.idleThresholdSeconds=120]
 * @param {string} [opts.stateDir] directory for the small "today's totals" file (counts only)
 * @param {number} [opts.screenshotIntervalSeconds=300]
 * @param {() => boolean} [opts.canCaptureScreen] whether the OS granted screen capture
 * @param {ReturnType<import('../services/screenshotService.js').createScreenshotService>} [opts.screenshotService]
 *   may also be attached later with setScreenshotService()
 * @param {() => void} [opts.onChange] called when visible state changes
 */
export function createActivityTracker({
  activityService = null,
  screenshotService = null,
  snapshotIntervalSeconds = 60,
  idleThresholdSeconds = 120,
  screenshotIntervalSeconds = 300,
  canCaptureScreen = () => false,
  stateDir,
  onChange,
} = {}) {
  const taskTracker = createTaskTracker();
  const idleTracker = createIdleTracker({
    idleThresholdSeconds,
    onTick: (delta, isActive) => {
      if (isActive) taskTracker.addActiveSeconds(delta);
    },
  });
  const mouseTracker = createMouseTracker();
  const keyboardTracker = createKeyboardTracker();
  const applicationTracker = createApplicationTracker({ shouldCount: () => !idleTracker.isIdle() });

  /** @type {TrackingState} */
  let state = 'stopped';
  /** Nothing optional is allowed until the main process passes the person's consent. */
  let consent = { acceptedAt: null, activity: false, keyboard: false, apps: false, screenshots: false };

  const screenshotsAllowed = () => {
    try {
      return state === 'tracking' && Boolean(consent.acceptedAt && consent.screenshots) && Boolean(canCaptureScreen());
    } catch {
      return false;
    }
  };
  const screenshotTracker = createScreenshotTracker({
    intervalSeconds: screenshotIntervalSeconds,
    isAllowed: screenshotsAllowed,
    isIdle: () => idleTracker.isIdle(),
    isScreenLocked: () => idleTracker.isScreenLocked(),
    onCapture: (shot) => screenshotService?.enqueue(shot),
  });
  let userId = null;
  let snapshotTimer = null;
  let intervalStartedAt = null;
  let today = { day: dayKey(), activeSeconds: 0, idleSeconds: 0 };

  const statePath = () => (stateDir && userId ? path.join(stateDir, `today-${userId}.json`) : null);

  function loadToday() {
    const file = statePath();
    today = { day: dayKey(), activeSeconds: 0, idleSeconds: 0 };
    if (!file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved?.day === today.day) {
        today.activeSeconds = Number(saved.activeSeconds) || 0;
        today.idleSeconds = Number(saved.idleSeconds) || 0;
      }
    } catch {
      /* first run or unreadable: start from zero */
    }
  }

  function saveToday() {
    const file = statePath();
    if (!file) return;
    try {
      fs.writeFileSync(file, JSON.stringify(today));
    } catch {
      /* non-critical */
    }
  }

  function rollDay() {
    const key = dayKey();
    if (today.day !== key) today = { day: key, activeSeconds: 0, idleSeconds: 0 };
  }

  /** Start/stop the optional trackers so they match the person's consent. */
  function applyOptionalTrackers() {
    if (state !== 'tracking') return;
    // Optional native trackers load asynchronously and never throw.
    if (consent.keyboard && CAPABILITIES.keyboard.supported) keyboardTracker.start().then(() => onChange?.());
    else keyboardTracker.stop();
    if (consent.apps && CAPABILITIES.apps.supported) applicationTracker.start().then(() => onChange?.());
    else applicationTracker.stop();
    if (screenshotsAllowed()) screenshotTracker.start();
    else screenshotTracker.stop();
  }

  function startTrackers() {
    idleTracker.start();
    mouseTracker.start();
    applyOptionalTrackers();
    intervalStartedAt = Date.now();
    snapshotTimer = setInterval(takeSnapshot, snapshotIntervalSeconds * 1000);
  }

  function stopTrackers() {
    if (snapshotTimer) clearInterval(snapshotTimer);
    snapshotTimer = null;
    idleTracker.stop();
    mouseTracker.stop();
    keyboardTracker.stop();
    applicationTracker.stop();
    screenshotTracker.stop();
  }

  /** Collect from every tracker, build a snapshot and enqueue it. */
  function takeSnapshot() {
    const { activeSeconds, idleSeconds } = idleTracker.collect();
    const mouseEvents = mouseTracker.collect();
    // Always drain the counters; only report what the person currently allows.
    const keyboardCount = keyboardTracker.collect();
    const keyboardEvents = consent.keyboard ? keyboardCount : 0;
    const appCollected = applicationTracker.collect();
    const appUsage = consent.apps ? appCollected : {};
    const intervalSeconds = activeSeconds + idleSeconds;
    intervalStartedAt = Date.now();

    if (intervalSeconds <= 0) return null;

    rollDay();
    today.activeSeconds += activeSeconds;
    today.idleSeconds += idleSeconds;
    saveToday();

    const capturedAt = new Date().toISOString();
    const task = taskTracker.getCurrentTask();
    const snapshot = {
      capturedAt,
      intervalSeconds,
      activeSeconds,
      idleSeconds,
      mouseEvents,
      keyboardEvents,
      ...(task ? { taskId: task.id } : {}),
    };
    activityService?.enqueue(snapshot, appUsageToRecords(appUsage, capturedAt));
    onChange?.();
    return snapshot;
  }

  function stopAll() {
    if (state === 'stopped') return;
    if (state === 'tracking') takeSnapshot();
    stopTrackers();
    state = 'stopped';
    onChange?.();
  }

  return {
    taskTracker,

    /** Attach the upload service (if not given at construction). */
    setActivityService(service) {
      activityService = service;
    },

    /** Attach the screenshot upload service (if not given at construction). */
    setScreenshotService(service) {
      screenshotService = service;
    },

    /**
     * Apply the person's consent. Reconfigures optional trackers live while tracking.
     * If consent is withdrawn (acceptedAt null) tracking stops.
     * @param {{acceptedAt: string|null, activity: boolean, keyboard: boolean, apps: boolean, screenshots: boolean}} next
     */
    setConsent(next) {
      consent = {
        acceptedAt: next?.acceptedAt ?? null,
        activity: Boolean(next?.activity),
        keyboard: Boolean(next?.keyboard),
        apps: Boolean(next?.apps),
        screenshots: Boolean(next?.screenshots),
      };
      if (!consent.acceptedAt || !consent.activity) {
        stopAll();
        return;
      }
      applyOptionalTrackers();
      onChange?.();
    },

    /** Re-evaluate permission-dependent trackers (e.g. after screen capture was granted). */
    refreshPermissions() {
      applyOptionalTrackers();
    },

    /** Change how often screenshots are taken (seconds, >= 60). */
    setScreenshotInterval(seconds) {
      screenshotTracker.setIntervalSeconds(seconds);
    },

    /** Whether the keyboard hook is running (evidence of macOS Input Monitoring permission). */
    isKeyboardAvailable() {
      return keyboardTracker.isAvailable();
    },

    /**
     * Begin tracking for a signed-in employee. Refuses to start before consent was accepted.
     * @param {{id: string}} user
     * @returns {boolean} true if tracking started
     */
    start(user) {
      if (state !== 'stopped') return state === 'tracking' || state === 'paused';
      if (!consent.acceptedAt || !consent.activity) return false;
      userId = user?.id != null ? String(user.id).replace(/[^\w-]/g, '_') : null;
      loadToday();
      state = 'tracking';
      startTrackers();
      onChange?.();
      return true;
    },

    /** Pause collection: the partial interval is snapshotted, then all trackers stop. */
    pause() {
      if (state !== 'tracking') return;
      takeSnapshot();
      stopTrackers();
      state = 'paused';
      onChange?.();
    },

    /** Resume collection after pause. */
    resume() {
      if (state !== 'paused' || !consent.acceptedAt) return;
      state = 'tracking';
      startTrackers();
      onChange?.();
    },

    /** Stop completely (logout/quit/withdrawal). Takes a final partial snapshot first. */
    stop: stopAll,

    /** Forget per-user state (after logout). */
    reset() {
      taskTracker.reset();
      userId = null;
      today = { day: dayKey(), activeSeconds: 0, idleSeconds: 0 };
    },

    /**
     * Select the task the employee is working on.
     * @param {{id: string, title?: string}|null} task
     * @returns {boolean} true if the selection changed
     */
    setTask(task) {
      const prev = taskTracker.getCurrentTask();
      const nextId = task?.id != null ? String(task.id) : null;
      if ((prev?.id ?? null) === nextId) return false;
      taskTracker.setTask(task);
      onChange?.();
      return true;
    },

    /** Live tracking status (counts/durations only). */
    getStatus() {
      rollDay();
      const live = state === 'tracking' ? idleTracker.peek() : { activeSeconds: 0, idleSeconds: 0 };
      return {
        tracking: state,
        isIdle: state === 'tracking' && idleTracker.isIdle(),
        today: {
          activeSeconds: today.activeSeconds + live.activeSeconds,
          idleSeconds: today.idleSeconds + live.idleSeconds,
        },
        currentTask: taskTracker.getCurrentTask(),
        currentTaskSeconds: taskTracker.getCurrentTaskSeconds(),
        intervalStartedAt: intervalStartedAt ? new Date(intervalStartedAt).toISOString() : null,
        capabilities: {
          keyboard: keyboardTracker.isAvailable(),
          applications: applicationTracker.isAvailable(),
        },
        screenshots: screenshotTracker.getState(),
        config: { snapshotIntervalSeconds, idleThresholdSeconds },
      };
    },
  };
}
