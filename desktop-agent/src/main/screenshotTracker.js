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
 * This tracker: OFF by default. Runs only when the person enabled "Screenshots" AND the OS
 * granted screen capture. Every SCREENSHOT_INTERVAL_SECONDS (default 300) it captures the
 * PRIMARY display only, scaled to at most 1280 px wide, as a JPEG (quality 60). A capture is
 * skipped while tracking is paused, while the person is idle, while the screen is locked, or
 * when consent/permission is missing. Each capture shows a (silent) notification so it is
 * never hidden. The image stays in memory only and is handed to screenshotService for upload;
 * it is NEVER written to disk.
 */
import { desktopCapturer, Notification, screen } from 'electron';
import { scaleToMaxWidth } from '../utils/activityUtils.js';

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 60;
const FALLBACK_JPEG_QUALITY = 40;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Create the screenshot tracker.
 * @param {object} opts
 * @param {number} [opts.intervalSeconds=300]
 * @param {() => boolean} opts.isAllowed consent on, permission granted and tracking (not paused)
 * @param {() => boolean} [opts.isIdle]
 * @param {() => boolean} [opts.isScreenLocked]
 * @param {(shot: {buffer: Buffer, capturedAt: string}) => void} opts.onCapture
 * @returns {{start(): void, stop(): void, setIntervalSeconds(s: number): void, isRunning(): boolean, getState(): object}}
 */
export function createScreenshotTracker({
  intervalSeconds = 300,
  isAllowed,
  isIdle = () => false,
  isScreenLocked = () => false,
  onCapture,
}) {
  let timer = null;
  let capturing = false;
  let lastSkipReason = null;

  const allowed = () => {
    try {
      return Boolean(isAllowed?.());
    } catch {
      return false;
    }
  };

  function notifyCaptured() {
    try {
      if (!Notification.isSupported()) return;
      new Notification({
        title: 'Screenshot captured',
        body: 'WorkPlus captured your primary screen. You can view or delete it in the web dashboard, or pause tracking from the tray.',
        silent: true,
      }).show();
    } catch {
      /* notifications are best effort */
    }
  }

  /** Capture the primary display; resolves the JPEG buffer or null. */
  async function capturePrimary() {
    const primary = screen.getPrimaryDisplay();
    const scale = primary.scaleFactor || 1;
    const thumbnailSize = scaleToMaxWidth(
      { width: primary.size.width * scale, height: primary.size.height * scale },
      MAX_WIDTH,
    );
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    // Other displays' thumbnails are never read; only the primary display is kept.
    const source = sources.find((s) => String(s.display_id) === String(primary.id)) ?? sources[0];
    const image = source?.thumbnail;
    if (!image || image.isEmpty()) return null; // e.g. permission denied, Wayland
    let buffer = image.toJPEG(JPEG_QUALITY);
    if (buffer.length > MAX_BYTES) buffer = image.toJPEG(FALLBACK_JPEG_QUALITY);
    return buffer.length > MAX_BYTES ? null : buffer;
  }

  async function tick() {
    if (capturing) return;
    if (!allowed()) return void (lastSkipReason = 'not-allowed');
    if (isScreenLocked()) return void (lastSkipReason = 'locked');
    if (isIdle()) return void (lastSkipReason = 'idle');

    capturing = true;
    try {
      const buffer = await capturePrimary();
      if (!buffer) return void (lastSkipReason = 'empty');
      // Re-check: the person may have paused or withdrawn while the capture was running.
      if (!timer || !allowed()) return void (lastSkipReason = 'not-allowed');
      lastSkipReason = null;
      onCapture?.({ buffer, capturedAt: new Date().toISOString() });
      notifyCaptured();
    } catch (err) {
      lastSkipReason = 'error';
      console.warn('[screenshotTracker] capture failed:', err?.message ?? err);
    } finally {
      capturing = false;
    }
  }

  return {
    /** Start the capture timer (first capture after one full interval). */
    start() {
      if (timer) return;
      timer = setInterval(tick, intervalSeconds * 1000);
    },
    /** Stop capturing. */
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    /** Change the interval (restarts the timer if running). */
    setIntervalSeconds(seconds) {
      const s = Number(seconds);
      if (!Number.isFinite(s) || s < 60 || s === intervalSeconds) return;
      intervalSeconds = Math.round(s);
      if (timer) {
        clearInterval(timer);
        timer = setInterval(tick, intervalSeconds * 1000);
      }
    },
    /** Whether the capture timer is running. */
    isRunning() {
      return Boolean(timer);
    },
    /** State for the status window (no image data). */
    getState() {
      return { running: Boolean(timer), intervalSeconds, lastSkipReason };
    },
  };
}
