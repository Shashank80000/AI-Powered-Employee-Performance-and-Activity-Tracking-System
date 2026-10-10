import { request, tokenStore } from './api.js';

export async function login(email, password) {
  const { token, user } = await request('/auth/login', { method: 'POST', body: { email, password } });
  tokenStore.set(token);
  setDemoFlag(false);
  return user;
}

/** Changes the signed-in person's password and returns the updated user. */
export async function changePassword(currentPassword, newPassword) {
  const { user } = await request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
  return user;
}

export async function getCurrentUser() {
  if (!tokenStore.get()) return null;
  const { user } = await request('/auth/me');
  return user;
}

const DEMO_KEY = 'workplus.demo';

function setDemoFlag(on) {
  try {
    if (on) localStorage.setItem(DEMO_KEY, '1');
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    // Storage unavailable: the demo banner simply won't survive a reload.
  }
}

export function isDemoSession() {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

/** { needed }: true until the first administrator has been created. */
export const getSetupStatus = () => request('/auth/setup');

/** Creates the first administrator (only possible while none exists) and signs them in. */
export async function setupAdmin(admin) {
  const { token, user } = await request('/auth/setup', { method: 'POST', body: admin });
  tokenStore.set(token);
  setDemoFlag(false);
  return user;
}

/** { enabled, roles: [{ role, description }] } — demo sign-in is only offered when the server allows it. */
export const getDemoInfo = () => request('/auth/demo').catch(() => ({ enabled: false, roles: [] }));

/** One-click sign-in as the demo admin, manager or employee. */
export async function demoLogin(role) {
  const { token, user } = await request('/auth/demo', { method: 'POST', body: { role } });
  tokenStore.set(token);
  setDemoFlag(true);
  return user;
}

export function logout() {
  tokenStore.set(null);
  setDemoFlag(false);
}
