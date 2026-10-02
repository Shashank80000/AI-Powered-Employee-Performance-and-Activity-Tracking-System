import { request } from './api.js';

export const getDashboard = (period, options) => request('/performance/dashboard', { ...options, query: { period } });
export const getEmployeePerformance = (id, period, options) => request(`/performance/employees/${id}`, { ...options, query: { period } });
