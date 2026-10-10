import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { signToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { passwordField } from '../utils/accountRules.js';

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
