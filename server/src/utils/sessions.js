import { WorkSession } from '../models/WorkSession.js';

/**
 * Records the end of a person's open sign-ins: when they are signed out everywhere (password change or reset,
 * deactivation). `except` keeps the session that continues, e.g. the one that just changed the password.
 */
export function closeSessions(userId, { except } = {}) {
  return WorkSession.updateMany({ user: userId, logoutAt: null, ...(except && { _id: { $ne: except } }) }, { logoutAt: new Date() });
}
