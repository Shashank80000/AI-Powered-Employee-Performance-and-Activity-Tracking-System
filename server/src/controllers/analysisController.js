import { z } from 'zod';
import { DailyAnalysis } from '../models/DailyAnalysis.js';
import { employeeForRequest } from '../middleware/roleMiddleware.js';
import { addDays, dayStart, startOfDay, toDateKey } from '../utils/dateUtils.js';

const querySchema = z.object({
  employeeId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export function toAnalysisResponse(analysis) {
  return {
    id: analysis._id.toString(),
    employeeId: analysis.employee.toString(),
    date: toDateKey(analysis.date),
    screenshotCount: analysis.screenshotCount,
    analyzedCount: analysis.analyzedCount,
    categoryMinutes: Object.fromEntries(analysis.categoryMinutes ?? []),
    productiveMinutes: analysis.productiveMinutes,
    timeline: analysis.timeline,
    camera: {
      observationCount: analysis.camera?.observationCount ?? 0,
      stateMinutes: Object.fromEntries(analysis.camera?.stateMinutes ?? []),
      atDeskMinutes: analysis.camera?.atDeskMinutes ?? 0,
      awayMinutes: analysis.camera?.awayMinutes ?? 0
    },
    summary: analysis.summary,
    highlights: analysis.highlights,
    suggestions: analysis.suggestions,
    model: analysis.model,
    generatedAt: analysis.generatedAt
  };
}

/** One day's analysis. Contains category labels only, never images. */
export async function getDailyAnalysis(request, response) {
  const { employeeId, date } = querySchema.parse(request.query);
  const employee = await employeeForRequest(request.user, employeeId);
  const day = date ? dayStart(date) : startOfDay();
  // A range, so analyses stored before a change of APP_TIMEZONE are still found.
  const analysis = await DailyAnalysis.findOne({ employee: employee._id, date: { $gte: day, $lt: addDays(day, 1) } });
  response.json({ dailyAnalysis: analysis ? toAnalysisResponse(analysis) : null });
}
