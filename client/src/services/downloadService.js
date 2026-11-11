import { API_BASE_URL, request } from './api.js';

/** Desktop agent installers published on this server: { version, installers: [...] }. */
export const getDownloads = (options) => request('/downloads', options);

/** Where the installers are published, for when this server is asleep or unreachable. */
export const RELEASES_URL =
  import.meta.env.VITE_DOWNLOADS_URL || 'https://github.com/Shashank80000/AI-Powered-Employee-Performance-and-Activity-Tracking-System/releases/latest';

/** Full address of an installer (the API may live on another origin in production). */
export const installerUrl = (installer) => `${API_BASE_URL}/downloads/${encodeURIComponent(installer.file)}`;
