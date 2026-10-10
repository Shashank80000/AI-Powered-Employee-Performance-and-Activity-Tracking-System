import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { employeeScope, findEmployeeInScope } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { emailField, nameField, objectId, passwordField } from '../utils/accountRules.js';

const optionalText = z.string().trim().max(80, 'Keep this under 80 characters').optional();

const createSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  employeeCode: z.string().trim().min(1, 'Enter an employee code, like EMP-005').max(30, 'Keep the employee code under 30 characters'),
  designation: optionalText,
  department: optionalText,
  manager: objectId.optional()
});

// 'inactive' is set by deactivating (which also blocks sign-in), not by editing.
const updateSchema = z
  .object({
    name: nameField,
    designation: z.string().trim().max(80, 'Keep this under 80 characters'),
    department: z.string().trim().max(80, 'Keep this under 80 characters'),
    manager: objectId.nullable(),
    status: z.enum(['active', 'on-leave'])
  })
  .partial();

/** Throws unless `id` is an active manager account, so employees are never assigned to someone who can't sign in. */
async function assertActiveManager(id) {
  if (!(await User.exists({ _id: id, role: 'manager', isActive: true }))) {
    throw new HttpError(400, 'Choose an active manager from the list');
  }
}

const POPULATE = [
  { path: 'user', select: 'name email' },
  { path: 'manager', select: 'name' }
];

function toResponse(employee) {
  return {
    id: employee._id.toString(),
    userId: employee.user._id.toString(),
    name: employee.user.name,
    email: employee.user.email,
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    department: employee.department,
    manager: employee.manager?._id?.toString() ?? employee.manager?.toString() ?? null,
    managerName: employee.manager?.name ?? null,
    status: employee.status,
    // Consent is given by the person in the desktop agent and can't be changed by admins.
    trackingConsent: employee.trackingConsent,
    consent: {
      keyboard: Boolean(employee.consent?.keyboard),
      apps: Boolean(employee.consent?.apps),
      screenshots: Boolean(employee.consent?.screenshots),
      managerViewScreenshots: Boolean(employee.consent?.managerViewScreenshots),
      acceptedAt: employee.consent?.acceptedAt ?? null
    },
    joinedAt: employee.joinedAt
  };
}

export async function listEmployees(request, response) {
  const employees = await Employee.find(employeeScope(request.user)).populate(POPULATE).sort({ employeeCode: 1 });
  response.json({ employees: employees.map(toResponse) });
}

/** The signed-in employee's own profile, including their manager's name. */
export async function getMyProfile(request, response) {
  const employee = await Employee.findOne({ user: request.user._id }).populate(POPULATE);
  if (!employee) throw new HttpError(404, 'No employee profile is linked to this account');
  response.json({ employee: toResponse(employee) });
}

export async function listManagers(_request, response) {
  const managers = await User.find({ role: 'manager', isActive: true }).sort({ name: 1 });
  response.json({ managers: managers.map((manager) => manager.toPublic()) });
}

export async function getEmployee(request, response) {
  const employee = await findEmployeeInScope(request.user, request.params.id);
  await employee.populate('manager', 'name');
  response.json({ employee: toResponse(employee) });
}

export async function createEmployee(request, response) {
  const input = createSchema.parse(request.body);
  if (input.manager) await assertActiveManager(input.manager);
  // Check before creating the account, so a taken code doesn't briefly leave an orphan user.
  if (await Employee.exists({ employeeCode: input.employeeCode })) {
    throw new HttpError(409, 'This employee code is already in use. Choose a different code.');
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    role: 'employee',
    mustChangePassword: true
  });

  try {
    const employee = await Employee.create({
      user: user._id,
      employeeCode: input.employeeCode,
      designation: input.designation,
      department: input.department,
      manager: input.manager
    });
    await employee.populate(POPULATE);
    response.status(201).json({ employee: toResponse(employee) });
  } catch (error) {
    await user.deleteOne();
    throw error;
  }
}

export async function updateEmployee(request, response) {
  const changes = updateSchema.parse(request.body);
  const employee = await findEmployeeInScope(request.user, request.params.id);

  // Managers may update profile details but not rename people or move them to other teams.
  if (request.user.role !== 'admin' && ('manager' in changes || 'name' in changes)) {
    throw new HttpError(403, 'Only administrators can change names and managers');
  }
  if (employee.status === 'inactive') throw new HttpError(409, 'Reactivate this employee before editing them');
  if (changes.manager) await assertActiveManager(changes.manager);

  const { name, ...profile } = changes;
  if (name) await User.updateOne({ _id: employee.user._id }, { name });
  employee.set(profile);
  await employee.save();
  await employee.populate(POPULATE);
  response.json({ employee: toResponse(employee) });
}

/** Admin: lets a deactivated employee sign in again. */
export async function reactivateEmployee(request, response) {
  const employee = await findEmployeeInScope(request.user, request.params.id);
  employee.status = 'active';
  await Promise.all([employee.save(), User.updateOne({ _id: employee.user._id }, { isActive: true })]);
  await employee.populate(POPULATE);
  response.json({ employee: toResponse(employee) });
}

export async function deactivateEmployee(request, response) {
  const employee = await findEmployeeInScope(request.user, request.params.id);
  employee.status = 'inactive';
  await Promise.all([employee.save(), User.updateOne({ _id: employee.user._id }, { isActive: false })]);
  response.status(204).end();
}
