import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { WorkSession } from '../models/WorkSession.js';
import { HttpError } from './errorMiddleware.js';

/** The desktop agent identifies itself with this header; its sign-ins last longer (AGENT_JWT_EXPIRES_IN). */
export const isAgentRequest = (request) => request.get('X-Client') === 'agent';

/** `sessionId` links the token to its WorkSession, so signing out records the sign-out time. */
export function signToken(user, { agent = false, sessionId } = {}) {
  const payload = { sub: user._id.toString(), role: user.role, ver: user.tokenVersion ?? 0, ...(sessionId && { sid: String(sessionId) }) };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: agent ? env.AGENT_JWT_EXPIRES_IN : env.JWT_EXPIRES_IN
  });
}

// What someone still on an administrator's temporary password may do: see who they are and choose their own password.
const ALLOWED_WITH_TEMPORARY_PASSWORD = new Set(['GET /api/auth/me', 'POST /api/auth/password', 'POST /api/auth/logout']);

/** Requires a valid `Authorization: Bearer <token>` header and attaches `request.user`. */
export async function protect(request, _response, next) {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  // Re-read the user so deactivated accounts and role changes take effect immediately.
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new HttpError(401, 'Account is not active');
  // Tokens from before a password change or reset, or a deactivation, no longer count.
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
    throw new HttpError(401, 'Your password or account was changed. Sign in again.', undefined, 'SESSION_ENDED');
  }

  // Signing out ends the token's sign-in for good, even though the token itself hasn't expired.
  if (payload.sid && mongoose.isValidObjectId(payload.sid) && (await WorkSession.exists({ _id: payload.sid, logoutAt: { $ne: null } }))) {
    throw new HttpError(401, 'You signed out. Sign in again.', undefined, 'SESSION_ENDED');
  }

  // Enforced here, not only on the website, so the desktop agent and direct API calls follow the same rule.
  const route = `${request.method} ${request.baseUrl}${request.path}`.replace(/\/+$/, '');
  if (user.mustChangePassword && !ALLOWED_WITH_TEMPORARY_PASSWORD.has(route)) {
    throw new HttpError(403, 'Choose your own password before continuing.', undefined, 'PASSWORD_CHANGE_REQUIRED');
  }

  request.user = user;
  // Tokens issued before sessions were recorded have no session id.
  request.sessionId = payload.sid;
  next();
}

/** Protects /api/internal routes used by analysis-agent with the shared SERVICE_API_KEY. */
export function requireServiceKey(request, _response, next) {
  if (!env.SERVICE_API_KEY) throw new HttpError(503, 'Internal API is disabled: SERVICE_API_KEY is not set');
  const given = Buffer.from(request.get('X-Service-Key') ?? '');
  const expected = Buffer.from(env.SERVICE_API_KEY);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, 'Invalid service key');
  next();
}
