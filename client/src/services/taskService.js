import { request } from './api.js';

/** @param {{assignedTo?: 'me' | string, status?: string}} [filters] */
export const listTasks = (filters, options) => request('/tasks', { ...options, query: filters }).then((data) => data.tasks);
export const createTask = (task) => request('/tasks', { method: 'POST', body: task }).then((data) => data.task);
export const updateTask = (id, changes) => request(`/tasks/${id}`, { method: 'PATCH', body: changes }).then((data) => data.task);
export const deleteTask = (id) => request(`/tasks/${id}`, { method: 'DELETE' });
export const addComment = (id, text) => request(`/tasks/${id}/comments`, { method: 'POST', body: { text } }).then((data) => data.task);
/** decision: 'approve' (marks it done) or 'changes' (back to in progress, comment required). */
export const reviewTask = (id, decision, comment) => request(`/tasks/${id}/review`, { method: 'POST', body: { decision, comment } }).then((data) => data.task);
/**
 * Rule-based task health ("is every task on track?") within the caller's scope: admins their organization, managers
 * their team, employees their own tasks. Optional employeeId narrows it to one person in scope.
 */
export const getTaskHealth = (filters, options) => request('/tasks/monitor', { ...options, query: filters });
