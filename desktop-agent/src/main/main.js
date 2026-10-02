/*
 * WorkPlus Agent - Electron main process.
 *
 * PRIVACY CONTRACT: the agent collects only counts and durations (active/idle seconds,
 * mouse-move count, keydown count, foreground app NAME + seconds, selected-task seconds).
 * It never records key values, window titles or URLs. Screenshots are taken ONLY by
 * screenshotTracker.js, only with the person's explicit consent (OFF by default).
 * Tracking only runs after the person signs in AND accepts the consent screen; each
 * optional data type (keyboard count, app names, screenshots) runs only if they enabled it.
 * Tracking is always shown in the tray tooltip and status window, and can be paused/resumed,
 * reconfigured or withdrawn by the person at any time.
 */
import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createActivityTracker } from './activityTracker.js';
import { createApiService } from '../services/apiService.js';
import { createActivityService } from '../services/activityService.js';
import { createScreenshotService } from '../services/screenshotService.js';
import { CONSENT_VERSION, loadConsent, normalizeConsent, savedConsentVersion, saveConsent, toServerConsent, withdrawConsent } from './consentStore.js';
import { getAutoStart, isAutoStartSupported, launchedHidden, setAutoStart } from './autoStart.js';
import { CAPABILITIES, supportedChoices } from './platform.js';
import { checkServer, isInsecureRemote, loadServerUrl, normalizeServerUrl, saveServerUrl } from './serverConfig.js';
import {
  PERMISSION_KINDS,
  getPermissionStatus,
  isScreenCaptureGranted,
  requestPermission,
  setKeyboardAvailabilityProbe,
} from './permissions.js';
import { clamp, envSeconds, formatDuration } from '../utils/activityUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ID = 'com.hmr.workplus.agent'; // must match appId in electron-builder.yml

// Windows only shows notifications for apps with an AppUserModelID. Installed builds use the
// installer's ID; development runs use the Electron binary path.
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath);

const START_HIDDEN = launchedHidden();
const APP_ROOT = path.join(__dirname, '..', '..');

// Optional .env next to package.json (Node 20.12+ / Electron 30+). Real env vars win.
try {
  const envFile = path.join(APP_ROOT, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
} catch (err) {
  console.warn('[main] could not load .env:', err?.message ?? err);
}

const SNAPSHOT_INTERVAL = envSeconds('SNAPSHOT_INTERVAL_SECONDS', 60);
const FLUSH_INTERVAL = envSeconds('FLUSH_INTERVAL_SECONDS', 300);
const IDLE_THRESHOLD = envSeconds('IDLE_THRESHOLD_SECONDS', 120);
const SCREENSHOT_INTERVAL = envSeconds('SCREENSHOT_INTERVAL_SECONDS', 300);
/** An explicit env value wins over the server's screenshotIntervalMinutes. */
const SCREENSHOT_INTERVAL_FROM_ENV = Boolean(process.env.SCREENSHOT_INTERVAL_SECONDS);
const STATUS_PUSH_MS = 5000;
/** How often the agent checks the website's start/pause state. */
const TRACKING_POLL_MS = 15000;
const TASK_REFRESH_MS = 10 * 60 * 1000;
const QUIT_FLUSH_TIMEOUT_MS = 4000;

/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {Tray|null} */
let tray = null;
let currentUser = null;
let lastUserId = null;
let authError = null;
let tasks = [];
let statusTimer = null;
let taskTimer = null;
let quitting = false;
let readyToQuit = false;
/** The signed-in person's consent (acceptedAt null = nothing may be tracked). */
let consent = normalizeConsent({});
/** One-line message for the person (e.g. the server turned screenshots off). */
let notice = null;
/**
 * Start/pause state shared with the website. Tracking runs only while it is 'active':
 * signing in on the website starts it, signing out stops it, either side can pause.
 */
let webControl = { state: 'stopped', changedBy: null };
/** A Pause/Resume made here that hasn't reached the server yet. */
let pendingControl = null;
let controlTimer = null;
/** Days the server keeps screenshots (from GET /consent). */
let screenshotRetentionDays = 3;
/** DELETE /consent failed; retried on the next server sync. */
let withdrawPending = false;

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const api = createApiService({
  baseUrl: loadServerUrl(),
  onUnauthorized: () => {
    if (!currentUser) return;
    // Token expired/revoked: stop tracking and ask the employee to sign in again.
    authError = 'Your session expired. Please sign in again.';
    endSession({ keepQueue: true }).catch(() => {});
  },
});

let tracker = null;
let activityService = null;
let screenshotService = null;

function initServices() {
  tracker = createActivityTracker({
    snapshotIntervalSeconds: SNAPSHOT_INTERVAL,
    idleThresholdSeconds: IDLE_THRESHOLD,
    screenshotIntervalSeconds: SCREENSHOT_INTERVAL,
    canCaptureScreen: isScreenCaptureGranted,
    stateDir: app.getPath('userData'),
    onChange: pushStatus,
  });
  activityService = createActivityService({
    api,
    taskTracker: tracker.taskTracker,
    flushIntervalSeconds: FLUSH_INTERVAL,
    onChange: pushStatus,
  });
  screenshotService = createScreenshotService({
    api,
    onForbidden: handleScreenshotsForbidden,
    onChange: pushStatus,
  });
  tracker.setActivityService(activityService);
  tracker.setScreenshotService(screenshotService);
  setKeyboardAvailabilityProbe(() => tracker.isKeyboardAvailable());
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/** Consent as shown to the renderer (no internal fields). */
function publicConsent(c = consent) {
  const { userId, ...rest } = c;
  return rest;
}

function showSystemNotification(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
  } catch {
    /* best effort */
  }
}

/** Apply consent to the trackers and start tracking if the person has accepted. */
function applyConsent(next) {
  consent = next;
  tracker.setConsent(consent);
  followWebControl();
  pushStatus();
}

/** Make the trackers match the website's state (consent is still required). */
function followWebControl() {
  if (!currentUser || !consent.acceptedAt) return;
  const current = tracker.getStatus().tracking;
  if (webControl.state === 'active') {
    if (current === 'stopped') tracker.start(currentUser);
    else if (current === 'paused') tracker.resume();
  } else if (current === 'tracking') {
    tracker.pause();
    activityService.flush().catch(() => {});
  }
}

/** Send any local Pause/Resume, then read the latest state. Offline: keep the current state. */
async function syncTrackingControl() {
  if (!currentUser) return;
  try {
    webControl = pendingControl ? await api.setTracking(pendingControl) : await api.getTracking();
    pendingControl = null;
  } catch (err) {
    if (err?.status !== 401) console.warn('[main] could not reach the tracking state:', err?.message ?? err);
    return;
  }
  followWebControl();
  pushStatus();
}

/** Pause/Resume from this agent (window or tray). Resuming needs a website sign-in first. */
function controlFromAgent(state) {
  if (!currentUser) throw new Error('Not signed in.');
  if (state === 'active' && webControl.state === 'stopped') {
    throw new Error('Sign in on the WorkPlus website to start tracking.');
  }
  webControl = { ...webControl, state, changedBy: 'agent' };
  pendingControl = state;
  followWebControl();
  syncTrackingControl();
}

/** Server returned 403 for a screenshot: turn screenshots off here too and tell the person. */
function handleScreenshotsForbidden() {
  if (!consent.screenshots) return;
  notice = 'Screenshots were turned off because the server has them disabled for your account. You can turn them on again in Settings.';
  screenshotService.clear();
  applyConsent(saveConsent({ ...consent, screenshots: false }));
  showSystemNotification('Screenshots turned off', notice);
}

/**
 * Reconcile local consent with GET /consent. The server can only NARROW what this computer
 * collects (or withdraw it); it can never turn on something the person did not accept here.
 */
async function syncConsentFromServer() {
  if (!currentUser) return;
  if (withdrawPending) {
    try {
      await api.deleteConsent();
      withdrawPending = false;
    } catch {
      return; // still offline: keep local state (already withdrawn)
    }
  }
  let remote;
  try {
    remote = await api.getConsent();
  } catch (err) {
    if (err?.status !== 401) console.warn('[main] could not load consent from server:', err?.message ?? err);
    return; // offline: local consent stands
  }
  if (!currentUser) return;

  if (remote.screenshotRetentionDays > 0) screenshotRetentionDays = remote.screenshotRetentionDays;
  if (!SCREENSHOT_INTERVAL_FROM_ENV && remote.screenshotIntervalMinutes > 0) {
    tracker.setScreenshotInterval(clamp(remote.screenshotIntervalMinutes * 60, 60, 24 * 3600));
  }

  const server = remote.consent;
  if (!server?.acceptedAt) {
    if (consent.acceptedAt) {
      // Withdrawn elsewhere (e.g. web dashboard): stop and ask again.
      tracker.stop();
      screenshotService.clear();
      notice = 'Your consent was withdrawn on the server, so tracking stopped. Review your choices to continue.';
      applyConsent(withdrawConsent(consent));
    }
    return;
  }

  if (!consent.acceptedAt) {
    // Pre-fill the onboarding toggles with the person's earlier choices; nothing starts.
    consent = normalizeConsent({
      ...consent,
      keyboard: server.keyboard !== false,
      apps: server.apps !== false,
      screenshots: server.screenshots === true,
      acceptedAt: null,
    });
    pushStatus();
    return;
  }

  const narrowed = {
    ...consent,
    keyboard: consent.keyboard && server.keyboard !== false,
    apps: consent.apps && server.apps !== false,
    screenshots: consent.screenshots && server.screenshots === true && server.managerViewScreenshots === true,
  };
  narrowed.managerViewScreenshots = narrowed.screenshots;
  if (narrowed.keyboard !== consent.keyboard || narrowed.apps !== consent.apps || narrowed.screenshots !== consent.screenshots) {
    if (!narrowed.screenshots) screenshotService.clear();
    notice = 'Some data types were turned off to match your choices on the server.';
    applyConsent(saveConsent(narrowed));
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function permissionSummary() {
  try {
    return getPermissionStatus();
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}

function safeGetAutoStart() {
  try {
    return getAutoStart();
  } catch {
    return false;
  }
}

function buildStatus() {
  const t = tracker?.getStatus() ?? { tracking: 'stopped' };
  const shots = screenshotService?.getState() ?? { queued: 0, lastError: null, dropped: 0, lastScreenshot: null };
  return {
    ...t,
    user: currentUser,
    authError,
    notice,
    tasks,
    consent: publicConsent(),
    permissions: permissionSummary(),
    lastScreenshot: shots.lastScreenshot,
    screenshotSync: { queued: shots.queued, lastError: shots.lastError, dropped: shots.dropped },
    sync: activityService?.getState() ?? { queued: 0, lastSyncAt: null, lastError: null, dropped: 0 },
    apiBaseUrl: api.baseUrl,
    serverInsecure: isInsecureRemote(api.baseUrl),
    platform: process.platform,
    webControl: { state: webControl.state, changedBy: webControl.changedBy },
    // What this OS allows (platform.js). Not `capabilities`: that is the tracker's live state.
    osSupport: CAPABILITIES,
    screenshotRetentionDays,
    autoStart: { supported: isAutoStartSupported(), enabled: safeGetAutoStart() },
  };
}

function pushStatus() {
  const status = buildStatus();
  updateTray(status);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent:status', status);
}

// ---------------------------------------------------------------------------
// Tray (always visible while the app runs -> tracking is never hidden)
// ---------------------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Build a small filled-circle PNG so the agent ships without binary icon assets. */
function makeDotIcon([r, g, b]) {
  const size = 32;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - c, y - c);
      const alpha = Math.max(0, Math.min(1, 12.5 - d)); // anti-aliased edge, radius ~12
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png, { scaleFactor: 2 });
}

const ICONS = {};
function iconFor(state) {
  const colors = { tracking: [34, 160, 90], idle: [80, 140, 220], paused: [230, 160, 30], stopped: [140, 140, 140] };
  ICONS[state] ??= makeDotIcon(colors[state] ?? colors.stopped);
  return ICONS[state];
}

let lastTrayKey = '';
function updateTray(status) {
  if (!tray || tray.isDestroyed()) return;
  const visualState = status.tracking === 'tracking' && status.isIdle ? 'idle' : status.tracking;
  const label = {
    tracking: 'Tracking active',
    idle: 'Tracking active (you are idle)',
    paused: 'Tracking PAUSED',
    stopped: status.user ? 'Not tracking (waiting for your consent)' : 'Not tracking (signed out)',
  }[visualState];
  const shotsOn = Boolean(status.consent?.acceptedAt && status.consent?.screenshots);
  const shotMinutes = Math.round((status.screenshots?.intervalSeconds ?? SCREENSHOT_INTERVAL) / 60);
  const tooltip =
    `WorkPlus Agent - ${label}` +
    (status.user ? `\nToday: ${formatDuration(status.today?.activeSeconds)} active` : '') +
    '\nCounts and durations only. No keystrokes, titles or URLs.' +
    (shotsOn ? `\nScreenshots: ON (every ${shotMinutes} min, you chose this)` : '\nScreenshots: off');
  tray.setToolTip(tooltip);

  const key = `${visualState}|${status.user?.id ?? ''}|${status.consent?.acceptedAt ?? ''}`;
  if (key === lastTrayKey) return;
  lastTrayKey = key;
  tray.setImage(iconFor(visualState));
  if (process.platform === 'darwin') tray.setTitle(status.tracking === 'paused' ? 'Paused' : '');

  const menu = Menu.buildFromTemplate([
    { label: `WorkPlus Agent - ${label}`, enabled: false },
    { type: 'separator' },
    { label: 'Show status window', click: showWindow },
    status.tracking === 'tracking'
      ? { label: 'Pause tracking', click: () => runTrayControl('paused') }
      : { label: 'Resume tracking', enabled: status.tracking === 'paused' && webControl.state !== 'stopped', click: () => runTrayControl('active') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function runTrayControl(state) {
  try {
    controlFromAgent(state);
  } catch (err) {
    showSystemNotification('WorkPlus Agent', err?.message ?? String(err));
  }
}

function createTray() {
  tray = new Tray(iconFor('stopped'));
  tray.on('click', showWindow);
  lastTrayKey = '';
  updateTray(buildStatus());
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 720,
    minWidth: 380,
    minHeight: 560,
    title: 'WorkPlus Agent',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // The renderer never needs to open new windows or navigate away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    // Started at login: stay in the tray (macOS/Windows) or minimised (Linux) once signed in.
    if (START_HIDDEN && !CAPABILITIES.trayReliable) {
      mainWindow.showInactive();
      mainWindow.minimize();
    } else if (!START_HIDDEN) {
      mainWindow.show();
    }
  });
  // Closing the window keeps the agent in the tray (still visibly tracking).
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      // Linux tray icons can be invisible (e.g. GNOME without AppIndicator), so minimise there:
      // the agent must never keep tracking with no visible sign of it.
      if (CAPABILITIES.trayReliable) mainWindow.hide();
      else mainWindow.minimize();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(APP_ROOT, 'dist', 'renderer', 'index.html'));
}

function showWindow() {
  if (!mainWindow) createWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

async function refreshTasks() {
  if (!currentUser) return;
  try {
    tasks = await api.getMyTasks();
    // Drop the selection if the task is no longer assigned.
    const current = tracker.getStatus().currentTask;
    if (current && !tasks.some((t) => String(t.id) === current.id)) tracker.setTask(null);
  } catch (err) {
    console.warn('[main] could not load tasks:', err?.message ?? err);
  }
  pushStatus();
}

/**
 * Sign-in complete. Tracking starts only if this person already accepted consent on this
 * computer; otherwise the renderer shows the onboarding wizard and nothing is collected.
 */
async function beginSession(user) {
  if (lastUserId && lastUserId !== String(user.id)) {
    // Never upload one user's queued data under another user's token.
    activityService.clear();
    screenshotService.clear();
    tracker.reset();
  }
  currentUser = user;
  lastUserId = String(user.id);
  authError = null;
  notice = null;
  const previousVersion = savedConsentVersion(String(user.id));
  if (previousVersion && previousVersion < CONSENT_VERSION) {
    notice = 'WorkPlus has changed: your manager can now view screenshots, and every view is recorded. Tracking is paused until you review your choices.';
  }
  consent = loadConsent(String(user.id));
  tracker.setConsent(consent);
  await syncConsentFromServer();
  if (!currentUser) return;
  await syncTrackingControl();
  if (!currentUser) return;
  applyConsent(consent);
  controlTimer ??= setInterval(syncTrackingControl, TRACKING_POLL_MS);
  activityService.start();
  statusTimer ??= setInterval(pushStatus, STATUS_PUSH_MS);
  taskTimer ??= setInterval(() => {
    refreshTasks();
    syncConsentFromServer().catch(() => {});
  }, TASK_REFRESH_MS);
  await refreshTasks();
  activityService.flush().catch(() => {}); // send anything left from a previous session
  screenshotService.flush().catch(() => {});
}

/** Stop tracking. With keepQueue the buffered data survives for the same user's next login. */
async function endSession({ keepQueue = false } = {}) {
  tracker.stop();
  if (!keepQueue) {
    await withTimeout(Promise.all([activityService.flush(), screenshotService.flush()]), QUIT_FLUSH_TIMEOUT_MS);
  }
  activityService.stop();
  screenshotService.stop();
  if (statusTimer) clearInterval(statusTimer);
  if (taskTimer) clearInterval(taskTimer);
  if (controlTimer) clearInterval(controlTimer);
  controlTimer = null;
  webControl = { state: 'stopped', changedBy: null };
  pendingControl = null;
  statusTimer = null;
  taskTimer = null;
  currentUser = null;
  tasks = [];
  if (!keepQueue) {
    activityService.clear();
    screenshotService.clear();
    tracker.reset();
    lastUserId = null;
  }
  consent = normalizeConsent({});
  tracker.setConsent(consent);
  notice = null;
  await api.clearToken();
  pushStatus();
}

function withTimeout(promise, ms) {
  return Promise.race([promise.catch(() => false), new Promise((resolve) => setTimeout(() => resolve(false), ms))]);
}

/** Try to resume a previous session from the encrypted stored token. */
async function restoreSession() {
  await restoreStoredSession();
  // A hidden start that can't resume tracking (signed out, or consent needed) must show the window.
  if (START_HIDDEN && (!currentUser || !consent.acceptedAt)) showWindow();
}

async function restoreStoredSession() {
  if (!(await api.loadStoredToken())) return;
  try {
    const user = await api.me();
    if (user?.role === 'employee') await beginSession(user);
    else await api.clearToken();
  } catch (err) {
    if (err?.isNetworkError) {
      authError = 'Server unreachable. Sign in again when you are back online.';
    }
    api.setToken(null);
    pushStatus();
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    // Only our own window may drive the agent.
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'Forbidden' };
    try {
      const result = await fn(...args);
      return { ok: true, status: buildStatus(), ...(result || {}) };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err), status: buildStatus() };
    }
  });
}

function registerIpc() {
  handle('agent:login', async (payload) => {
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    const password = typeof payload?.password === 'string' ? payload.password : '';
    if (!email || !password) throw new Error('Email and password are required.');
    if (currentUser) await endSession();

    const { user } = await api.login(email, password);
    if (user.role !== 'employee') {
      await api.clearToken();
      throw new Error('Only employee accounts can run the activity agent.');
    }
    await api.saveToken();
    await beginSession(user);
  });

  handle('agent:logout', async () => {
    authError = null;
    if (currentUser) await endSession();
    else await api.clearToken();
  });

  handle('agent:getStatus', async (options) => {
    if (options?.refreshTasks) await refreshTasks();
  });

  handle('agent:pause', async () => controlFromAgent('paused'));

  handle('agent:resume', async () => controlFromAgent('active'));

  handle('agent:getConsent', async () => ({ consent: publicConsent() }));

  /**
   * Accept (onboarding) or update (settings) the person's choices. The server must record
   * them first (PUT /consent); only then are they saved here and applied to the trackers.
   */
  /** Change the server address (signed out only). Tested before it's saved. */
  handle('agent:setServerUrl', async (input) => {
    if (currentUser) throw new Error('Sign out before changing the server.');
    const apiUrl = normalizeServerUrl(input);
    await checkServer(apiUrl);
    if (apiUrl !== api.baseUrl) {
      // A sign-in belongs to one server, and queued data must never go to another one.
      await api.clearToken();
      activityService.clear();
      screenshotService.clear();
      api.setBaseUrl(apiUrl);
    }
    saveServerUrl(apiUrl);
    authError = null;
    return { apiBaseUrl: apiUrl, insecure: isInsecureRemote(apiUrl) };
  });

  handle('agent:setAutoStart', async (enabled) => {
    setAutoStart(Boolean(enabled));
    return { autoStart: { supported: isAutoStartSupported(), enabled: safeGetAutoStart() } };
  });

  handle('agent:saveConsent', async (choices) => {
    if (!currentUser) throw new Error('Not signed in.');
    if (choices?.activity === false) {
      throw new Error('Activity time is required for tracking. To stop tracking, withdraw consent instead.');
    }
    const bool = (key) => (typeof choices?.[key] === 'boolean' ? choices[key] : consent[key]);
    // Never record consent for something this OS can't do (e.g. screenshots on Wayland).
    const allowed = supportedChoices({ keyboard: bool('keyboard'), apps: bool('apps'), screenshots: bool('screenshots') });
    if (allowed.screenshots && choices?.managerViewScreenshots !== true) {
      throw new Error('To turn on screenshots, agree that your manager and administrators can view them.');
    }
    allowed.managerViewScreenshots = allowed.screenshots;
    const next = normalizeConsent({
      ...allowed,
      acceptedAt: new Date().toISOString(),
      userId: String(currentUser.id),
    });
    try {
      await api.putConsent(toServerConsent(next));
    } catch (err) {
      if (err?.isNetworkError) {
        throw new Error('Could not reach the server to record your choices. Nothing was changed; please try again.');
      }
      throw new Error(`The server did not accept your choices: ${err?.message ?? err}`);
    }
    if (!next.screenshots) screenshotService.clear(); // discard any image not yet uploaded
    notice = null;
    applyConsent(saveConsent(next));
    return { consent: publicConsent() };
  });

  /** Withdraw consent: stop everything, discard unsent screenshots, tell the server. */
  handle('agent:withdrawConsent', async () => {
    if (!currentUser) throw new Error('Not signed in.');
    tracker.stop(); // final partial snapshot of data collected under consent
    screenshotService.clear();
    await withTimeout(activityService.flush(), QUIT_FLUSH_TIMEOUT_MS);
    activityService.clear(); // anything still unsent is dropped
    applyConsent(withdrawConsent({ ...consent, userId: String(currentUser.id) }));
    try {
      await api.deleteConsent();
      withdrawPending = false;
      notice = null;
    } catch (err) {
      if (err?.status === 401) throw err;
      withdrawPending = true;
      notice = 'Tracking stopped on this computer. The server could not be told yet; the agent will retry.';
    }
    return { consent: publicConsent() };
  });

  handle('agent:getPermissions', async () => {
    tracker.refreshPermissions();
    return { permissions: getPermissionStatus() };
  });

  handle('agent:requestPermission', async (kind) => {
    if (!PERMISSION_KINDS.includes(kind)) throw new Error('Unknown permission.');
    const permission = await requestPermission(kind);
    tracker.refreshPermissions();
    return { permission, permissions: getPermissionStatus() };
  });

  handle('agent:deleteLastScreenshot', async () => {
    if (!currentUser) throw new Error('Not signed in.');
    const deleted = await screenshotService.deleteLast();
    return { deleted };
  });

  handle('agent:setTask', async (taskId) => {
    if (!currentUser) throw new Error('Not signed in.');
    const task = taskId == null ? null : tasks.find((t) => String(t.id) === String(taskId));
    if (taskId != null && !task) throw new Error('Task not found in your assigned tasks.');
    // Time is accumulated per task id, so switching never misattributes minutes; flushing
    // here just sends the previous task's actualMinutesDelta promptly.
    if (tracker.setTask(task ? { id: String(task.id), title: task.title } : null)) {
      activityService.flush().catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    initServices();
    registerIpc();
    createTray();
    createWindow();
    await restoreSession();
  });

  // Tray app: keep running when the window is closed.
  app.on('window-all-closed', () => {});
  app.on('activate', showWindow);

  app.on('before-quit', (event) => {
    quitting = true;
    if (readyToQuit || !tracker) return;
    event.preventDefault();
    tracker.stop(); // final partial snapshot
    withTimeout(Promise.all([activityService.flush(), screenshotService.flush()]), QUIT_FLUSH_TIMEOUT_MS).finally(() => {
      readyToQuit = true;
      activityService.stop();
      screenshotService.clear(); // in-memory images are never persisted
      tray?.destroy();
      app.quit();
    });
  });
}
