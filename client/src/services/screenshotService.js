import { request, requestBlob } from './api.js';

// Screenshots belong to the signed-in person only; the server refuses other roles.
/** Resolves { screenshots, retentionDays }. */
export const listMyScreenshots = (date, options) => request('/screenshots', { ...options, query: { date } });
export const getScreenshotImage = (id, options) => requestBlob(`/screenshots/${id}/image`, options);
export const deleteScreenshot = (id) => request(`/screenshots/${id}`, { method: 'DELETE' });

// Managers (own team) and admins. Opening an image is recorded and shown to the person.
export const listTeamScreenshots = (employeeId, date, options) => request('/screenshots/team', { ...options, query: { employeeId, date } });
export const getTeamScreenshotImage = (id, options) => requestBlob(`/screenshots/team/${id}/image`, options);
