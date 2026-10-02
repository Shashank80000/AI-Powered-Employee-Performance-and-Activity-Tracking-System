import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { signToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';

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
