/*
 * Preload (CommonJS: sandboxed preloads cannot be ES modules).
 * Exposes a minimal, explicit API to the renderer as window.agent. The renderer gets no
 * Node or Electron access beyond these calls.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agent', {
  /** Sign in; resolves { ok, status?, error? }. */
  login: (email, password) => ipcRenderer.invoke('agent:login', { email, password }),
  /** Sign out and stop tracking. */
  logout: () => ipcRenderer.invoke('agent:logout'),
  /** Current status; pass { refreshTasks: true } to reload the task list from the server. */
  getStatus: (options) => ipcRenderer.invoke('agent:getStatus', options ?? {}),
  /** Pause tracking. */
  pause: () => ipcRenderer.invoke('agent:pause'),
  /** Resume tracking. */
  resume: () => ipcRenderer.invoke('agent:resume'),
  /** Set the task being worked on (task id, or null to clear). */
  setTask: (taskId) => ipcRenderer.invoke('agent:setTask', taskId ?? null),
  /** The person's consent; resolves { ok, consent, status }. */
  getConsent: () => ipcRenderer.invoke('agent:getConsent'),
  /**
   * Accept/update consent ({ keyboard, apps, screenshots }; activity is always required).
   * Records it on the server first, then starts or reconfigures tracking.
   */
  saveConsent: (choices) =>
    ipcRenderer.invoke('agent:saveConsent', {
      activity: true,
      keyboard: Boolean(choices?.keyboard),
      apps: Boolean(choices?.apps),
      screenshots: Boolean(choices?.screenshots),
      managerViewScreenshots: Boolean(choices?.screenshots && choices?.managerViewScreenshots),
    }),
  /** Change which WorkPlus server to use (signed out only); the address is tested first. */
  setServerUrl: (url) => ipcRenderer.invoke('agent:setServerUrl', String(url ?? '')),
  /** Open the agent when the person signs in to the computer (installed app only). */
  setAutoStart: (enabled) => ipcRenderer.invoke('agent:setAutoStart', Boolean(enabled)),
  /** Withdraw consent: stops all tracking and tells the server. */
  withdrawConsent: () => ipcRenderer.invoke('agent:withdrawConsent'),
  /** OS permission status per kind; resolves { ok, permissions, status }. */
  getPermissions: () => ipcRenderer.invoke('agent:getPermissions'),
  /** Ask the OS for one permission: 'keyboard' | 'apps' | 'screenshots' | 'notifications'. */
  requestPermission: (kind) => ipcRenderer.invoke('agent:requestPermission', String(kind)),
  /** Delete the most recent screenshot (from memory if not uploaded yet, else on the server). */
  deleteLastScreenshot: () => ipcRenderer.invoke('agent:deleteLastScreenshot'),
  /**
   * Subscribe to status pushes; returns an unsubscribe function. The status includes
   * consent, permissions and lastScreenshot ({ id, capturedAt } | null).
   */
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('agent:status', listener);
    return () => ipcRenderer.removeListener('agent:status', listener);
  },
});
