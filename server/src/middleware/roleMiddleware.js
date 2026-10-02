import { Employee } from '../models/Employee.js';
import { HttpError } from './errorMiddleware.js';

/** Allows the request only when the authenticated user has one of `roles`. */
export function authorize(...roles) {
  return (request, _response, next) => {
    if (!roles.includes(request.user?.role)) throw new HttpError(403, 'You do not have access to this resource');
    next();
  };
}

/**
 * Mongo filter for the Employee documents a user may see:
 * admins see everyone, managers their assigned team, employees only themselves.
 */
export function employeeScope(user) {
  if (user.role === 'admin') return {};
  if (user.role === 'manager') return { manager: user._id };
  return { user: user._id };
}

/** Ids of every employee visible to `user`. */
export async function visibleEmployeeIds(user) {
  const employees = await Employee.find(employeeScope(user)).select('_id').lean();
  return employees.map(({ _id }) => _id);
}

/** Loads one employee and throws 404 when it's outside the user's scope. */
export async function findEmployeeInScope(user, employeeId) {
  const employee = await Employee.findOne({ _id: employeeId, ...employeeScope(user) }).populate('user', 'name email role');
  if (!employee) throw new HttpError(404, 'Employee not found');
  return employee;
}

/** The Employee profile of the signed-in employee. */
export async function currentEmployee(user) {
  const employee = await Employee.findOne({ user: user._id });
  if (!employee) throw new HttpError(403, 'No employee profile is linked to this account');
  return employee;
}
