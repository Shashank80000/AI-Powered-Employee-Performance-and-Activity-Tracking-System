import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { emailField, nameField, objectId, passwordField } from '../utils/accountRules.js';

const createManagerSchema = z.object({ name: nameField, email: emailField, password: passwordField });
const updateManagerSchema = z.object({ name: nameField, isActive: z.boolean() }).partial();
const resetPasswordSchema = z.object({ password: passwordField });

async function findManager(id) {
  const manager = await User.findOne({ _id: objectId.parse(id), role: 'manager' });
  if (!manager) throw new HttpError(404, 'Manager not found');
  return manager;
}

async function toManagerResponse(manager) {
  const teamSize = await Employee.countDocuments({ manager: manager._id, status: { $ne: 'inactive' } });
  return { ...manager.toPublic(), isActive: manager.isActive, lastLoginAt: manager.lastLoginAt ?? null, createdAt: manager.createdAt, teamSize };
}

/** Admin: every manager account, active or not, with the size of their active team. */
export async function listAllManagers(_request, response) {
  const managers = await User.find({ role: 'manager' }).sort({ isActive: -1, name: 1 });
  response.json({ managers: await Promise.all(managers.map(toManagerResponse)) });
}

/** Admin: a new manager account. The manager is asked to choose their own password at first sign-in. */
export async function createManager(request, response) {
  const input = createManagerSchema.parse(request.body);
  const manager = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    role: 'manager',
    mustChangePassword: true
  });
  response.status(201).json({ manager: await toManagerResponse(manager) });
}

/** Admin: rename, deactivate or reactivate a manager. */
export async function updateManager(request, response) {
  const changes = updateManagerSchema.parse(request.body);
  const manager = await findManager(request.params.id);

  if (changes.isActive === false && manager.isActive) {
    const teamSize = await Employee.countDocuments({ manager: manager._id, status: { $ne: 'inactive' } });
    if (teamSize > 0) {
      throw new HttpError(409, `${manager.name} still manages ${teamSize} employee${teamSize === 1 ? '' : 's'}. Assign them to another manager first.`);
    }
  }
  manager.set(changes);
  await manager.save();
  response.json({ manager: await toManagerResponse(manager) });
}

/** Admin: set a temporary password for a manager or employee who can't sign in. Admin passwords are changed by their owner. */
export async function resetPassword(request, response) {
  const { password } = resetPasswordSchema.parse(request.body);
  const user = await User.findById(objectId.parse(request.params.id));
  if (!user) throw new HttpError(404, 'Account not found');
  if (user.role === 'admin') throw new HttpError(403, 'Administrators change their own password from My account');

  user.passwordHash = await bcrypt.hash(password, 12);
  user.mustChangePassword = true;
  await user.save();
  response.status(204).end();
}
