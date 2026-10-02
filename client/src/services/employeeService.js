import { request } from './api.js';

export const listEmployees = (options) => request('/employees', options).then((data) => data.employees);
export const getEmployee = (id) => request(`/employees/${id}`).then((data) => data.employee);
export const createEmployee = (employee) => request('/employees', { method: 'POST', body: employee }).then((data) => data.employee);
export const updateEmployee = (id, changes) => request(`/employees/${id}`, { method: 'PATCH', body: changes }).then((data) => data.employee);
export const deactivateEmployee = (id) => request(`/employees/${id}`, { method: 'DELETE' });
export const listManagers = () => request('/employees/managers').then((data) => data.managers);
