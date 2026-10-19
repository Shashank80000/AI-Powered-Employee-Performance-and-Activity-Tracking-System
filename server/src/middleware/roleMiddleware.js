import { Employee } from '../models/Employee.js';
import { sameOrganization } from '../utils/organization.js';
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
 * admins see everyone in their organization, managers their assigned team, employees only themselves.
 */
export function employeeScope(user) {
  if (user.role === 'admin') return sameOrganization(user);
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
  const employee = await Employee.findOne({ _id: employeeId, ...employeeScope(user) }).populate('user', 'name email role mustChangePassword');
  if (!employee) throw new HttpError(404, 'Employee not found');
  return employee;
}

/**
 * Whose data a request is about: an employee always gets their own (any employeeId is ignored);
 * managers and admins must name someone in their scope.
 */
export async function employeeForRequest(user, employeeId) {
  if (user.role === 'employee') return currentEmployee(user);
  if (!employeeId) throw new HttpError(400, 'Choose an employee (employeeId is required)');
  return findEmployeeInScope(user, employeeId);
}

/** The Employee profile of the signed-in employee. */
export async function currentEmployee(user) {
  const employee = await Employee.findOne({ user: user._id });
  if (!employee) throw new HttpError(403, 'No employee profile is linked to this account');
  return employee;
}
