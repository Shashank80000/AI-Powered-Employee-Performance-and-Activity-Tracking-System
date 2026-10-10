import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { signToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { emailField, nameField, passwordField } from '../utils/accountRules.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function login(request, response) {
  const { email, password } = loginSchema.parse(request.body);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  response.json({ token: signToken(user), user: user.toPublic() });
}

// First-run setup: on a database without any administrator, the first visitor creates the administrator account.
// A marker document with a fixed _id makes the claim atomic, so two simultaneous requests can't both succeed.
const SETUP_MARKER = 'initial-admin';
const setupSchema = z.object({ name: nameField, email: emailField, password: passwordField });
const settings = () => mongoose.connection.collection('settings');

/** Public: whether this installation still needs its first administrator. */
export async function setupStatus(_request, response) {
  response.json({ needed: !(await User.exists({ role: 'admin' })) });
}

/** Public, once: creates the first administrator and signs them in. Refused as soon as any administrator exists. */
export async function setupAdmin(request, response) {
  const input = setupSchema.parse(request.body);
  if (await User.exists({ role: 'admin' })) throw new HttpError(409, 'Setup is already complete. Sign in instead.');

  // No admin exists, so a marker older than any in-flight request is stale (e.g. the admin was deleted from the database).
  await settings().deleteOne({ _id: SETUP_MARKER, createdAt: { $lt: new Date(Date.now() - 60_000) } });
  try {
    await settings().insertOne({ _id: SETUP_MARKER, createdAt: new Date() });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'Setup is already complete. Sign in instead.');
    throw error;
  }

  let admin;
  try {
    admin = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: 'admin',
      lastLoginAt: new Date()
    });
  } catch (error) {
    // Free the marker so setup can be retried, e.g. after "this email already exists".
    await settings().deleteOne({ _id: SETUP_MARKER });
    throw error;
  }
  response.status(201).json({ token: signToken(admin), user: admin.toPublic() });
}

export function me(request, response) {
  response.json({ user: request.user.toPublic() });
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordField
});

/** The signed-in person changes their own password; required after an admin set a temporary one. */
export async function changePassword(request, response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
  const user = await User.findById(request.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Your current password is not correct');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a new password that is different from the current one');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  await user.save();
  response.json({ user: user.toPublic() });
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
  response.json({ token: signToken(user), user: user.toPublic(), demo: true });
}
