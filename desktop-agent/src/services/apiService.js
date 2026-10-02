/**
 * Fetch-based client for the WorkPlus server API.
 *
 * The JWT is held in memory. If Electron's safeStorage encryption is available the token
 * is also persisted (encrypted, OS keychain-backed) so the employee stays signed in across
 * restarts. If encryption is NOT available the token is never written to disk.
 */
import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'http://localhost:4000/api';
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_FILE = 'session.bin';

/** Error thrown for non-2xx responses or network failures. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status HTTP status, or 0 for network errors
   * @param {unknown} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** True when the request never reached the server (offline, DNS, timeout). */
  get isNetworkError() {
    return this.status === 0;
  }
}

/**
 * Create an API client.
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] defaults to env AGENT_API_URL or http://localhost:4000/api
 * @param {(err: ApiError) => void} [opts.onUnauthorized] called on any 401 response
 */
export function createApiService({ baseUrl, onUnauthorized } = {}) {
  let base = (baseUrl || process.env.AGENT_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  let token = null;

  const tokenPath = () => path.join(app.getPath('userData'), TOKEN_FILE);
  const canEncrypt = () => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      // Linux without a keyring falls back to a hard-coded key; treat that as unavailable.
      if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false;
      return true;
    } catch {
      return false;
    }
  };

  /**
   * @param {string} method
   * @param {string} pathname
   * @param {unknown} [body] JSON body
   * @param {{raw?: Buffer, contentType?: string, headers?: Record<string, string>}} [opts]
   *   raw: send these bytes as-is instead of a JSON body
   */
  async function request(method, pathname, body, opts = {}) {
    const headers = { Accept: 'application/json', ...(opts.headers || {}) };
    let payload;
    if (opts.raw) {
      headers['Content-Type'] = opts.contentType || 'application/octet-stream';
      payload = opts.raw;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${base}${pathname}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ApiError(`Cannot reach server at ${base} (${err?.message ?? 'network error'})`, 0);
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
    if (!res.ok) {
      // The server sends { error: { message } }.
      const message =
        data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || `Request failed with status ${res.status}`;
      const error = new ApiError(message, res.status, data);
      if (res.status === 401) onUnauthorized?.(error);
      throw error;
    }
    return data;
  }

  return {
    get baseUrl() {
      return base;
    },

    /** Point the agent at another server (only while signed out). */
    setBaseUrl(url) {
      base = String(url).replace(/\/+$/, '');
    },

    /** Whether a token is currently held. */
    hasToken() {
      return Boolean(token);
    },

    /** Replace the in-memory token. */
    setToken(value) {
      token = value || null;
    },

    /**
     * POST /auth/login. Stores the token in memory on success.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{token: string, user: {id: string, name: string, email: string, role: string}}>}
     */
    async login(email, password) {
      const data = await request('POST', '/auth/login', { email, password });
      if (!data?.token || !data?.user) throw new ApiError('Malformed login response', 500, data);
      token = data.token;
      return data;
    },

    /** GET /auth/me -> user. */
    async me() {
      const data = await request('GET', '/auth/me');
      return data?.user ?? null;
    },

    /** GET /tasks?assignedTo=me -> tasks[]. */
    async getMyTasks() {
      const data = await request('GET', '/tasks?assignedTo=me');
      return Array.isArray(data?.tasks) ? data.tasks : [];
    },

    /**
     * PATCH /tasks/:id
     * @param {string} id
     * @param {{status?: string, actualMinutesDelta?: number}} patch
     */
    async updateTask(id, patch) {
      const data = await request('PATCH', `/tasks/${encodeURIComponent(id)}`, patch);
      return data?.task ?? null;
    },

    /**
     * POST /activity/snapshots
     * @param {{snapshots: object[], applications: object[]}} payload
     * @returns {Promise<{stored: number}>}
     */
    async postSnapshots(payload) {
      return request('POST', '/activity/snapshots', payload);
    },

    /**
     * GET /tracking: the start/pause state set on the website (or by this agent).
     * The X-Client header tells the server the agent is running.
     * @returns {Promise<{state: 'active'|'paused'|'stopped', changedBy: string, changedAt: string}>}
     */
    async getTracking() {
      const data = await request('GET', '/tracking', undefined, { headers: { 'X-Client': 'agent' } });
      return data?.tracking;
    },

    /** PUT /tracking from the agent (Pause/Resume here is shown on the website too). */
    async setTracking(state) {
      const data = await request('PUT', '/tracking', { state, source: 'agent' }, { headers: { 'X-Client': 'agent' } });
      return data?.tracking;
    },

    /**
     * GET /consent
     * @returns {Promise<{consent: object|null, screenshotIntervalMinutes: number|null}>}
     */
    async getConsent() {
      const data = await request('GET', '/consent');
      return {
        consent: data?.consent ?? null,
        screenshotIntervalMinutes: Number.isFinite(Number(data?.screenshotIntervalMinutes))
          ? Number(data.screenshotIntervalMinutes)
          : null,
      };
    },

    /**
     * PUT /consent
     * @param {{activity: true, keyboard: boolean, apps: boolean, screenshots: boolean, version: number}} consent
     * @returns {Promise<object|null>} the server's consent record
     */
    async putConsent(consent) {
      const data = await request('PUT', '/consent', consent);
      return data?.consent ?? null;
    },

    /** DELETE /consent (server marks consent withdrawn; 204). */
    async deleteConsent() {
      await request('DELETE', '/consent');
    },

    /**
     * POST /screenshots with the raw JPEG bytes (never JSON/base64, never stored locally).
     * @param {Buffer} jpeg at most 2 MB
     * @param {string} capturedAt ISO timestamp
     * @returns {Promise<{screenshot: {id: string, capturedAt: string}}>}
     */
    async postScreenshot(jpeg, capturedAt) {
      return request('POST', '/screenshots', undefined, {
        raw: jpeg,
        contentType: 'image/jpeg',
        headers: { 'X-Captured-At': capturedAt },
      });
    },

    /**
     * DELETE /screenshots/:id (the person deletes their own screenshot; 204).
     * @param {string} id
     */
    async deleteScreenshot(id) {
      await request('DELETE', `/screenshots/${encodeURIComponent(id)}`);
    },

    /** Persist the current token encrypted with safeStorage (no-op if unavailable). */
    async saveToken() {
      if (!token || !canEncrypt()) return false;
      try {
        await fs.writeFile(tokenPath(), safeStorage.encryptString(token), { mode: 0o600 });
        return true;
      } catch (err) {
        console.warn('[apiService] could not persist token:', err?.message ?? err);
        return false;
      }
    },

    /** Load a previously persisted token into memory. Returns true if one was found. */
    async loadStoredToken() {
      if (!canEncrypt()) return false;
      try {
        const buf = await fs.readFile(tokenPath());
        token = safeStorage.decryptString(buf);
        return Boolean(token);
      } catch {
        return false;
      }
    },

    /** Forget the token in memory and on disk. */
    async clearToken() {
      token = null;
      await fs.rm(tokenPath(), { force: true }).catch(() => {});
    },
  };
}
