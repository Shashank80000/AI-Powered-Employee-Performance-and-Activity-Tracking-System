import { request } from './api.js';

export const listActivity = (query, options) => request('/activity', { ...options, query }).then((data) => data.activity);
export const getActivitySummary = (query, options) => request('/activity/summary', { ...options, query }).then((data) => data.summary);
