import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Employee } from '../models/Employee.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { WorkSession } from '../models/WorkSession.js';
import { isAgentRequest, signToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { emailField, nameField, passwordField } from '../utils/accountRules.js';
import { createLimiter } from '../utils/rateLimit.js';
import { closeSessions } from '../utils/sessions.js';

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1)
});

// Compared when the email is unknown, so a wrong password takes as long for an unknown account as for a real one.
const NO_ACCOUNT_HASH = bcrypt.hashSync('no-account-placeholder', 12);
// Failed sign-ins per account and network address: 10 in 15 minutes, then wait.
const failedLogins = createLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

export async function login(request, response) {
  const { email, password } = loginSchema.parse(request.body);
  const attemptKey = `${email}|${request.ip}`;
  if (failedLogins.exceeded(attemptKey)) throw new HttpError(429, 'Too many failed sign-ins. Wait 15 minutes and try again.');
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same message, and the same work, for an unknown email and a wrong password, so accounts can't be discovered.
  const matches = await bcrypt.compare(password, user?.passwordHash ?? NO_ACCOUNT_HASH);
  if (!user || !user.isActive || !matches) {
    failedLogins.hit(attemptKey);
    throw new HttpError(401, 'Invalid email or password');
  }
  failedLogins.reset(attemptKey);

  user.lastLoginAt = new Date();
  await user.save();

  // Only employees run the desktop agent, so only they get its longer sign-in.
  const agent = isAgentRequest(request) && user.role === 'employee';
  const session = await startSession(user, agent ? 'agent' : 'web', user.lastLoginAt);
  response.json({ token: signToken(user, { agent, sessionId: session._id }), user: user.toPublic() });
}

/** Records a sign-in, so sign-in/sign-out history can be analysed. */
async function startSession(user, client, loginAt = new Date()) {
  const employee = user.role === 'employee' ? await Employee.findOne({ user: user._id }).select('_id').lean() : null;
  return WorkSession.create({ user: user._id, employee: employee?._id, client, loginAt });
}

/** Records the sign-out time of this token's session. Signing out always succeeds, recorded or not. */
export async function logout(request, response) {
  if (request.sessionId && mongoose.isValidObjectId(request.sessionId)) {
    await WorkSession.updateOne({ _id: request.sessionId, user: request.user._id, logoutAt: null }, { logoutAt: new Date() });
  }
  response.status(204).end();
}

// Registration: anyone can create an administrator account, which gets its own organization (a separate workspace).
// Administrators only see their own organization, so a new account never sees anyone else's data.
const registerSchema = z.object({
  organizationName: z.string().trim().min(2, 'Enter an organization name of at least 2 characters').max(80, 'Keep the organization name under 80 characters'),
  name: nameField,
  email: emailField,
  password: passwordField
});

// Accounts created per network address per hour, against automated sign-ups. Only successful ones count.
const registrations = createLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/** Public: whether this installation has no administrator at all yet (the sign-in page then suggests registering). */
export async function setupStatus(_request, response) {
  response.json({ needed: !(await User.exists({ role: 'admin' })) });
}

/** Public: creates an organization and its administrator, and signs them in. */
export async function register(request, response) {
  const input = registerSchema.parse(request.body);
  if (registrations.exceeded(request.ip)) throw new HttpError(429, 'Too many accounts were created from this network. Try again in an hour.');
  // Checked first so a taken email doesn't leave an empty organization behind; the unique index still decides races.
  if (await User.exists({ email: input.email })) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');

  const organization = await Organization.create({ name: input.organizationName });
  let admin;
  try {
    admin = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: 'admin',
      organization: organization._id,
      lastLoginAt: new Date()
    });
  } catch (error) {
    await organization.deleteOne();
    throw error;
  }
  registrations.hit(request.ip);
  await Organization.updateOne({ _id: organization._id }, { createdBy: admin._id });
  const session = await startSession(admin, 'web', admin.lastLoginAt);
  response.status(201).json({ token: signToken(admin, { sessionId: session._id }), user: admin.toPublic() });
}

export function me(request, response) {
  response.json({ user: request.user.toPublic() });
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordField
});

/**
 * The signed-in person changes their own password; required after an admin set a temporary one.
 * Every other session (another browser, the desktop agent) ends; this one continues with the returned token.
 */
export async function changePassword(request, response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
  const user = await User.findById(request.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Your current password is not correct');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a new password that is different from the current one');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.endSessions();
  await user.save();
  await closeSessions(user._id, { except: request.sessionId });
  // The same sign-in continues with the new token.
  response.json({ token: signToken(user, { agent: isAgentRequest(request), sessionId: request.sessionId }), user: user.toPublic() });
}

// Seeded demo accounts (see scripts/seed.js), one per role.
export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@workplus.dev', description: 'Whole organisation: employees, tasks, reports, daily analysis' },
  manager: { email: 'manager@workplus.dev', description: 'One team: dashboards, tasks, AI reports, screenshots of the team' },
  employee: { email: 'akash@workplus.dev', description: 'One person: own activity, tasks, daily analysis, screenshots' }
};

/** Whether demo sign-in is available, and which roles can be explored. */
export function demoInfo(_request, response) {
  response.json({
    enabled: env.DEMO_MODE,
    roles: env.DEMO_MODE ? Object.entries(DEMO_ACCOUNTS).map(([role, { description }]) => ({ role, description })) : []
  });
}

/** One-click sign-in as a seeded demo account. Only when DEMO_MODE=true. */
export async function demoLogin(request, response) {
  if (!env.DEMO_MODE) throw new HttpError(404, 'Demo mode is not enabled on this server');
  const { role } = z.object({ role: z.enum(['admin', 'manager', 'employee']) }).parse(request.body);
  const user = await User.findOne({ email: DEMO_ACCOUNTS[role].email, isActive: true });
  if (!user) throw new HttpError(404, 'Demo accounts are missing. Run `npm run seed` to create them.');
  const session = await startSession(user, 'web');
  response.json({ token: signToken(user, { sessionId: session._id }), user: user.toPublic(), demo: true });
}
