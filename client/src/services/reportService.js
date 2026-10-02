import { request } from './api.js';

export const listReports = (query, options) => request('/reports', { ...options, query }).then((data) => data.reports);
export const getReport = (id) => request(`/reports/${id}`).then((data) => data.report);
export const generateReport = (employeeId, period) =>
  request('/reports', { method: 'POST', body: { employeeId, period } }).then((data) => data.report);
