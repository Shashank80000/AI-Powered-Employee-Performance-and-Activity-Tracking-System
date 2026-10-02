/*
 * SERVER ADDRESS
 *
 * Which WorkPlus server this agent talks to. In order of priority:
 *   1. the address the person saved on the sign-in screen (userData/server.json)
 *   2. AGENT_API_URL (development)
 *   3. "workplus.apiUrl" in package.json, set when building an installer for an
 *      organisation:  npm run dist -- -c.extraMetadata.workplus.apiUrl=https://workplus.example.com/api
 *   4. http://localhost:4000/api
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInsecureRemote, normalizeServerUrl } from '../utils/serverUrl.js';

export { isInsecureRemote, normalizeServerUrl };

const SETTINGS_FILE = 'server.json';
const FALLBACK_URL = 'http://localhost:4000/api';
const CHECK_TIMEOUT_MS = 6000;
const PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');

const settingsPath = () => path.join(app.getPath('userData'), SETTINGS_FILE);

function builtInUrl() {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'))?.workplus?.apiUrl || null;
  } catch {
    return null;
  }
}

/** The address used when the person hasn't chosen one. */
export function defaultServerUrl() {
  return normalizeServerUrl(process.env.AGENT_API_URL || builtInUrl() || FALLBACK_URL);
}

/** The saved address, or the default. */
export function loadServerUrl() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (saved?.apiUrl) return normalizeServerUrl(saved.apiUrl);
  } catch {
    /* no saved address */
  }
  return defaultServerUrl();
}

export function saveServerUrl(apiUrl) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ apiUrl }, null, 2));
}

/** Confirms the address is a WorkPlus server before switching to it. */
export async function checkServer(apiUrl) {
  let response;
  try {
    response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  } catch {
    throw new Error(`Could not reach ${apiUrl}. Check the address and that the server is running.`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.service !== 'performance-tracker-api') {
    throw new Error(`${apiUrl} answered, but it is not a WorkPlus server.`);
  }
}
