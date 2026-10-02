import { request } from './api.js';

/** Tracking state shared with the desktop agent: { state, changedAt, changedBy, agentConnected, consentGiven }. */
export const getTracking = (options) => request('/tracking', options).then((data) => data.tracking);

/** @param {'active' | 'paused' | 'stopped'} state */
export const setTracking = (state) => request('/tracking', { method: 'PUT', body: { state, source: 'web' } }).then((data) => data.tracking);
