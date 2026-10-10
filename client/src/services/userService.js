import { request } from './api.js';

// Account administration (admins only).
export const listAllManagers = (options) => request('/users/managers', options).then((data) => data.managers);
export const createManager = (manager) => request('/users/managers', { method: 'POST', body: manager }).then((data) => data.manager);
export const updateManager = (id, changes) => request(`/users/managers/${id}`, { method: 'PATCH', body: changes }).then((data) => data.manager);
export const resetPassword = (userId, password) => request(`/users/${userId}/password`, { method: 'POST', body: { password } });
