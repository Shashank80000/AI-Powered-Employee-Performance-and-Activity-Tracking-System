const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api`;

/** Absolute API address, e.g. "https://workplus.example.com/api". The desktop agent signs in here too. */
export const API_BASE_URL = new URL(BASE_URL, window.location.origin).toString().replace(/\/+$/, '');
const TOKEN_KEY = 'workplus.token';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage can be unavailable (private mode); the session then lasts until reload.
    }
  }
};

/** Fetches a binary resource (e.g. a screenshot) with the auth header and returns a Blob. */
export async function requestBlob(path, { signal } = {}) {
  const token = tokenStore.get();
  const response = await fetch(`${BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error?.message ?? `Request failed (${response.status})`);
  }
  return response.blob();
}

/**
 * Calls the API and returns the parsed JSON body.
 * Fires a `workplus:unauthorized` window event on 401 so AuthContext can sign out.
 */
export async function request(path, { method = 'GET', body, query, signal } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Cannot reach the server. Check that the API is running.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('workplus:unauthorized'));
    throw new ApiError(response.status, data?.error?.message ?? `Request failed (${response.status})`, data?.error?.details);
  }
  return data;
}
