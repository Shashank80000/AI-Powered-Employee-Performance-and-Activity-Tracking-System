import { API_BASE_URL, request } from './api.js';

/** Desktop agent installers published on this server: { version, installers: [...] }. */
export const getDownloads = (options) => request('/downloads', options);

/** Full address of an installer (the API may live on another origin in production). */
export const installerUrl = (installer) => `${API_BASE_URL}/downloads/${encodeURIComponent(installer.file)}`;
