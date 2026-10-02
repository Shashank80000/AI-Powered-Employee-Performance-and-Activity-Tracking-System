import { Performance } from '../models/Performance.js';
import { Report } from '../models/Report.js';
import { periodRange, toDateKey, addDays } from '../utils/dateUtils.js';
import { requestReport } from './aiService.js';
import { scoreRecords } from './productivityService.js';

const DISCLAIMER = 'AI-generated from aggregated activity metrics. Review before acting on it.';

function toDailyMetrics(record) {
  return {
    date: toDateKey(record.date),
    activeSeconds: record.activeSeconds,
    idleSeconds: record.idleSeconds,
    productiveAppSeconds: record.productiveAppSeconds,
    tasksCompleted: record.tasksCompleted,
    tasksAssigned: record.tasksAssigned,
    onTimeTasks: record.onTimeTasks
  };
}

/** Used when the AI service is unreachable, so reports still work offline. */
function fallbackReport(records) {
  const { score } = scoreRecords(records);
  const half = Math.floor(records.length / 2);
  const firstHalf = scoreRecords(records.slice(0, half)).score;
  const secondHalf = scoreRecords(records.slice(half)).score;
  const trend = secondHalf - firstHalf > 2 ? 'up' : firstHalf - secondHalf > 2 ? 'down' : 'flat';
  return {
    score,
    trend,
    summary: `Average productivity score for the period was ${score}. Trend: ${trend}.`,
    highlights: [],
    recommendations: ['Start the AI service for detailed recommendations.'],
    anomalies: [],
    disclaimer: 'Basic summary computed without the AI service.'
  };
}

/** Generates and stores a report for one employee over `period`. */
export async function generateReport({ employee, generatedBy, period = 'week' }) {
  const range = periodRange(period);
  const records = await Performance.find({ employee: employee._id, date: { $gte: range.start, $lt: range.end } }).sort({ date: 1 }).lean();
  const periodStart = toDateKey(range.start);
  const periodEnd = toDateKey(addDays(range.end, -1));

  let result;
  let source = 'ai-service';
  try {
    if (records.length === 0) throw new Error('No performance data for this period');
    result = await requestReport({
      employeeId: employee._id.toString(),
      employeeName: employee.user?.name,
      periodStart,
      periodEnd,
      days: records.map(toDailyMetrics)
    });
  } catch (error) {
    console.warn(`Falling back to basic report: ${error.message}`);
    result = fallbackReport(records);
    source = 'fallback';
  }

  return Report.create({
    employee: employee._id,
    generatedBy: generatedBy._id,
    periodStart: range.start,
    periodEnd: addDays(range.end, -1),
    score: result.score,
    trend: result.trend,
    summary: result.summary,
    highlights: result.highlights,
    recommendations: result.recommendations,
    anomalies: result.anomalies,
    source,
    disclaimer: result.disclaimer ?? DISCLAIMER
  });
}
