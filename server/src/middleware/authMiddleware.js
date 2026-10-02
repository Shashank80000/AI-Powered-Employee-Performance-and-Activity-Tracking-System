import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from './errorMiddleware.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

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

  request.user = user;
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
