import { z } from 'zod';
import { Report } from '../models/Report.js';
import { findEmployeeInScope, visibleEmployeeIds } from '../middleware/roleMiddleware.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { getEmployeeOverview } from '../services/overviewService.js';
import { generateReport } from '../services/reportService.js';
import { dateKey, objectId } from '../utils/accountRules.js';
import { resolveRange } from '../utils/employeeOverview.js';

const createSchema = z.object({
  employeeId: z.string(),
  period: z.enum(['week', 'month']).default('week')
});

const overviewSchema = z.object({
  employeeId: objectId.optional(),
  period: z.enum(['week', 'month']).optional(),
  from: dateKey.optional(),
  to: dateKey.optional()
});

function toResponse(report) {
  return {
    id: report._id.toString(),
    employeeId: report.employee._id?.toString() ?? report.employee.toString(),
    employeeName: report.employee.user?.name,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    score: report.score,
    trend: report.trend,
    summary: report.summary,
    highlights: report.highlights,
    recommendations: report.recommendations,
    anomalies: report.anomalies,
    source: report.source,
    disclaimer: report.disclaimer,
    createdAt: report.createdAt
  };
}

const populateEmployee = { path: 'employee', select: 'user', populate: { path: 'user', select: 'name' } };

export async function listReports(request, response) {
  const filter = { employee: { $in: await visibleEmployeeIds(request.user) } };
  if (request.query.employeeId) filter.employee = (await findEmployeeInScope(request.user, request.query.employeeId))._id;
  const reports = await Report.find(filter).sort({ createdAt: -1 }).limit(50).populate(populateEmployee);
  response.json({ reports: reports.map(toResponse) });
}

export async function getReport(request, response) {
  const report = await Report.findOne({ _id: request.params.id, employee: { $in: await visibleEmployeeIds(request.user) } }).populate(populateEmployee);
  if (!report) throw new HttpError(404, 'Report not found');
  response.json({ report: toResponse(report) });
}

/**
 * Whole-employee report, computed on request from stored records (nothing is saved). Employees get their own
 * (employeeId is ignored), managers their team, admins their organization; anyone else is a 404.
 */
export async function employeeOverview(request, response) {
  const { employeeId, period, from, to } = overviewSchema.parse(request.query);
  let range;
  try {
    range = resolveRange({ period, from, to });
  } catch (error) {
    if (error instanceof RangeError) throw new HttpError(400, error.message);
    throw error;
  }
  response.json(await getEmployeeOverview(request.user, { employeeId, range, period: from ? undefined : (period ?? 'week') }));
}

/** Reports are only generated on an explicit manager/admin action. */
export async function createReport(request, response) {
  const { employeeId, period } = createSchema.parse(request.body);
  const employee = await findEmployeeInScope(request.user, employeeId);
  const report = await generateReport({ employee, generatedBy: request.user, period });
  await report.populate(populateEmployee);
  response.status(201).json({ report: toResponse(report) });
}
