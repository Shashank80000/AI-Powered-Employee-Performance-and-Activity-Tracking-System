/*
 * START AT LOGIN
 *
 * Lets the person choose whether the agent opens when they sign in to their computer.
 *   macOS / Windows: Electron login items (app.setLoginItemSettings).
 *   Linux: a freedesktop autostart entry in ~/.config/autostart (Electron has no API there).
 * The agent starts with --hidden so it goes straight to the tray (or minimised on Linux).
 * Only available in packaged builds: in development it would register the bare Electron binary.
 */
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HIDDEN_FLAG = '--hidden';
const DESKTOP_FILE = 'workplus-agent.desktop';

function linuxAutostartPath() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'autostart', DESKTOP_FILE);
}

/** AppImages run from a temporary mount, so their stable path is in $APPIMAGE. */
function linuxExecutable() {
  return process.env.APPIMAGE || process.execPath;
}

function quoteExec(value) {
  return `"${value.replace(/(["\\`$])/g, '\\$1')}"`;
}

export function isAutoStartSupported() {
  return app.isPackaged;
}

/** @returns {boolean} whether the agent is set to open at login */
export function getAutoStart() {
  if (!isAutoStartSupported()) return false;
  if (process.platform === 'linux') return fs.existsSync(linuxAutostartPath());
  return app.getLoginItemSettings({ args: [HIDDEN_FLAG] }).openAtLogin;
}

/** @param {boolean} enabled */
export function setAutoStart(enabled) {
  if (!isAutoStartSupported()) throw new Error('Start at login is only available in the installed app.');

  if (process.platform === 'linux') {
    const file = linuxAutostartPath();
    if (!enabled) {
      fs.rmSync(file, { force: true });
      return false;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=WorkPlus Agent',
        'Comment=Activity tracking you agreed to (open the app to pause or change what is shared)',
        `Exec=${quoteExec(linuxExecutable())} ${HIDDEN_FLAG}`,
        'X-GNOME-Autostart-enabled=true',
        'Terminal=false',
        ''
      ].join('\n')
    );
    return true;
  }

  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: [HIDDEN_FLAG] });
  return getAutoStart();
}

/** True when this launch came from start-at-login (so the window should start hidden). */
export function launchedHidden() {
  if (process.argv.includes(HIDDEN_FLAG)) return true;
  try {
    return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
  } catch {
    return false;
  }
}
