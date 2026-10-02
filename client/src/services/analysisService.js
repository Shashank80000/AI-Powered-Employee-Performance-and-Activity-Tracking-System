import { request } from './api.js';

/** The analysis agent's whole-day analysis (category labels only, never images). */
export const getDailyAnalysis = ({ employeeId, date }, options) =>
  request('/analysis/daily', { ...options, query: { employeeId, date } }).then((data) => data.dailyAnalysis);
