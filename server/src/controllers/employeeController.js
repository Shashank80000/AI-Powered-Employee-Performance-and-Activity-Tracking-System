import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { employeeScope, findEmployeeInScope } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  employeeCode: z.string().min(1),
  designation: z.string().optional(),
  department: z.string().optional(),
  manager: objectId.optional()
});

const updateSchema = z
  .object({
    designation: z.string(),
    department: z.string(),
    manager: objectId.nullable(),
    status: z.enum(['active', 'on-leave', 'inactive'])
  })
  .partial();

function toResponse(employee) {
  return {
    id: employee._id.toString(),
    userId: employee.user._id.toString(),
    name: employee.user.name,
    email: employee.user.email,
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    department: employee.department,
    manager: employee.manager?.toString() ?? null,
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
  const employees = await Employee.find(employeeScope(request.user)).populate('user', 'name email').sort({ employeeCode: 1 });
  response.json({ employees: employees.map(toResponse) });
}

export async function listManagers(_request, response) {
  const managers = await User.find({ role: 'manager', isActive: true }).sort({ name: 1 });
  response.json({ managers: managers.map((manager) => manager.toPublic()) });
}

export async function getEmployee(request, response) {
  const employee = await findEmployeeInScope(request.user, request.params.id);
  response.json({ employee: toResponse(employee) });
}

export async function createEmployee(request, response) {
  const input = createSchema.parse(request.body);
  if (input.manager && !(await User.exists({ _id: input.manager, role: 'manager' }))) {
    throw new HttpError(400, 'manager must be the id of a manager account');
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    role: 'employee'
  });

  try {
    const employee = await Employee.create({
      user: user._id,
      employeeCode: input.employeeCode,
      designation: input.designation,
      department: input.department,
      manager: input.manager
    });
    await employee.populate('user', 'name email');
    response.status(201).json({ employee: toResponse(employee) });
  } catch (error) {
    await user.deleteOne();
    throw error;
  }
}

export async function updateEmployee(request, response) {
  const changes = updateSchema.parse(request.body);
  const employee = await findEmployeeInScope(request.user, request.params.id);

  // Managers may update profile details but not reassign employees to other teams.
  if (request.user.role !== 'admin' && 'manager' in changes) throw new HttpError(403, 'Only admins can change managers');

  employee.set(changes);
  await employee.save();
  response.json({ employee: toResponse(employee) });
}

export async function deactivateEmployee(request, response) {
  const employee = await findEmployeeInScope(request.user, request.params.id);
  employee.status = 'inactive';
  await Promise.all([employee.save(), User.updateOne({ _id: employee.user._id }, { isActive: false })]);
  response.status(204).end();
}
