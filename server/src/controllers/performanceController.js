import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { findEmployeeInScope } from '../middleware/roleMiddleware.js';
import { getDashboard, getEmployeePerformance, recalculateDay } from '../services/performanceService.js';
import { addDays, lastNDays } from '../utils/dateUtils.js';

const periodSchema = z.object({ period: z.enum(['day', 'week', 'month']).default('week') });

export async function dashboard(request, response) {
  const { period } = periodSchema.parse(request.query);
  response.json(await getDashboard(request.user, period));
}

export async function employeePerformance(request, response) {
  const { period } = periodSchema.parse(request.query);
  const employee = await findEmployeeInScope(request.user, request.params.id);
  response.json(await getEmployeePerformance(employee, period));
}

/** Admin maintenance: rebuild daily records for the last N days. */
export async function recalculate(request, response) {
  const { days } = z.object({ days: z.number().int().min(1).max(90).default(7) }).parse(request.body ?? {});
  const employees = await Employee.find().select('_id').lean();
  const { start } = lastNDays(days);
  for (const { _id } of employees) {
    for (let day = 0; day < days; day += 1) await recalculateDay(_id, addDays(start, day));
  }
  response.json({ employees: employees.length, days });
}
