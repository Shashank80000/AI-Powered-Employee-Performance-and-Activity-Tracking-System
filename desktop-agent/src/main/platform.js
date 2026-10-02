/*
 * PLATFORM CAPABILITIES
 *
 * What each tracker can actually do on this operating system, so the agent never promises
 * (or silently fails at) something the OS doesn't allow.
 *
 *   feature       macOS                      Windows      Linux X11    Linux Wayland
 *   ------------  -------------------------  -----------  -----------  ------------------------------
 *   idle time     yes                        yes          yes          limited (may always read active)
 *   keyboard      yes (Input Monitoring)     yes          yes          no: Wayland blocks global hooks
 *   app names     yes                        yes          yes          no: no active-window API
 *   screenshots   yes (Screen Recording)     yes          yes          no: needs a portal prompt each time
 *   tray icon     yes                        yes          usually*     usually*
 *   start at login  login items              registry     ~/.config/autostart
 *
 *   * GNOME needs the AppIndicator extension to show tray icons, so on Linux the window
 *     minimises to the taskbar instead of hiding (tracking must stay visible).
 *
 * Pure function of (platform, env): no Electron imports, so it is unit-tested in plain Node.
 */

/** @typedef {{ supported: boolean, reason?: string }} Capability */

const WAYLAND_REASONS = {
  keyboard: 'Wayland does not let apps count key presses system-wide. Log in with an "Xorg"/X11 session to enable this.',
  apps: 'Wayland does not let apps see which application is in front. Log in with an "Xorg"/X11 session to enable this.',
  screenshots: 'Wayland only allows screen capture after a prompt each time, so automatic screenshots are not possible. Log in with an "Xorg"/X11 session to enable this.',
  idle: 'On Wayland the system idle timer may not be available, so idle time can be under-counted.'
};

const NO_DISPLAY_REASON = 'No graphical session was detected.';

/**
 * Linux session type: 'wayland', 'x11' or 'unknown'. Prefers XDG_SESSION_TYPE because an
 * app running through XWayland still sees DISPLAY.
 * @param {Record<string, string | undefined>} env
 */
export function linuxSessionType(env) {
  const declared = (env.XDG_SESSION_TYPE || '').toLowerCase();
  if (declared === 'wayland' || declared === 'x11') return declared;
  if (env.WAYLAND_DISPLAY) return 'wayland';
  if (env.DISPLAY) return 'x11';
  return 'unknown';
}

/**
 * @param {string} [platform=process.platform]
 * @param {Record<string, string | undefined>} [env=process.env]
 */
export function detectCapabilities(platform = process.platform, env = process.env) {
  const os = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
  const sessionType = os === 'linux' ? linuxSessionType(env) : null;

  /** @type {(key: keyof typeof WAYLAND_REASONS) => Capability} */
  const linuxCapability = (key) => {
    if (sessionType === 'x11') return { supported: true };
    if (sessionType === 'wayland') return { supported: false, reason: WAYLAND_REASONS[key] };
    return { supported: false, reason: NO_DISPLAY_REASON };
  };
  const yes = { supported: true };

  return {
    os,
    sessionType,
    keyboard: os === 'linux' ? linuxCapability('keyboard') : yes,
    apps: os === 'linux' ? linuxCapability('apps') : yes,
    screenshots: os === 'linux' ? linuxCapability('screenshots') : yes,
    // Idle time is required, so it is never "unsupported"; it may only be less accurate.
    idle: os === 'linux' && sessionType !== 'x11' ? { supported: true, limited: true, reason: WAYLAND_REASONS.idle } : { supported: true },
    // Linux trays aren't guaranteed to be visible, so closing the window minimises instead of hiding.
    trayReliable: os !== 'linux'
  };
}

/** Capabilities of the running system, computed once. */
export const CAPABILITIES = Object.freeze(detectCapabilities());

/** Turns off any choice this system can't support (e.g. screenshots on Wayland). */
export function supportedChoices(choices, caps = CAPABILITIES) {
  return {
    ...choices,
    keyboard: Boolean(choices.keyboard) && caps.keyboard.supported,
    apps: Boolean(choices.apps) && caps.apps.supported,
    screenshots: Boolean(choices.screenshots) && caps.screenshots.supported
  };
}
