import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { isAgentRequest as isAgent } from '../middleware/authMiddleware.js';
import { currentEmployee } from '../middleware/roleMiddleware.js';

// The agent counts as connected if it checked in within this window (it polls every 15 s).
const AGENT_ONLINE_MS = 60 * 1000;

const updateSchema = z.object({
  state: z.enum(['active', 'paused', 'stopped']),
  source: z.enum(['web', 'agent'])
});

export function toTrackingResponse(employee, now = new Date()) {
  const lastSeen = employee.agentLastSeenAt;
  return {
    state: employee.tracking?.state ?? 'stopped',
    changedAt: employee.tracking?.changedAt ?? null,
    changedBy: employee.tracking?.changedBy ?? 'system',
    agentConnected: Boolean(lastSeen && now - lastSeen < AGENT_ONLINE_MS),
    agentLastSeenAt: lastSeen ?? null,
    consentGiven: Boolean(employee.consent?.acceptedAt && employee.consent.activity)
  };
}

/** Current tracking state. The desktop agent polls this (and is marked as seen). */
export async function getTracking(request, response) {
  const employee = await currentEmployee(request.user);
  if (isAgent(request)) {
    employee.agentLastSeenAt = new Date();
    await Employee.updateOne({ _id: employee._id }, { agentLastSeenAt: employee.agentLastSeenAt });
  }
  response.json({ tracking: toTrackingResponse(employee) });
}

/**
 * Start, pause or stop tracking. The website starts it at sign-in and stops it at sign-out;
 * either the website or the agent can pause and resume.
 */
export async function setTracking(request, response) {
  const { state, source } = updateSchema.parse(request.body);
  const employee = await currentEmployee(request.user);
  changeTracking(employee, state, source);
  if (isAgent(request)) employee.agentLastSeenAt = new Date();
  await employee.save();
  response.json({ tracking: toTrackingResponse(employee) });
}

const HISTORY_LIMIT = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back an upload may be dated: the desktop agent keeps unsent data while offline, but not for weeks. */
export const MAX_UPLOAD_AGE_MS = 7 * DAY_MS;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Starts, pauses or stops tracking and records the change in the history. Call before save().
 * `force` re-records the state (with its time and source) even when it doesn't change, e.g. on deactivation.
 */
export function changeTracking(employee, state, changedBy, { force = false } = {}) {
  const previous = employee.tracking?.state ?? 'stopped';
  if (previous === state && !force) return;
  const at = new Date();
  employee.tracking = { state, changedAt: at, changedBy };
  if (previous !== state) employee.trackingHistory = [...(employee.trackingHistory ?? []), { state, previous, at }].slice(-HISTORY_LIMIT);
}

/** Tracking state at a moment, from the history; null when there is no history (accounts from before it existed). */
function stateAt(employee, at) {
  const history = employee.trackingHistory ?? [];
  if (!history.length) return null;
  let state = history[0].previous;
  for (const change of history) {
    if (new Date(change.at).getTime() > at) break;
    state = change.state;
  }
  return state;
}

/**
 * True when something captured at `capturedAt` falls inside a pause or stop, i.e. it should not have been
 * recorded, including pauses that have since ended. `graceMs` works both ways: it keeps the item that closes the
 * interval in which a pause happened, and allows for an agent clock slightly behind the server's at a start.
 */
export function capturedWhileNotTracking(employee, capturedAt, graceMs = 0) {
  const at = new Date(capturedAt).getTime();
  const state = stateAt(employee, at);
  if (state === null) {
    // No history yet: only the current state is known.
    const tracking = employee.tracking;
    if (!tracking || tracking.state === 'active') return false;
    // Never started (still the account's initial state): nothing was ever allowed.
    if (tracking.changedBy === 'system') return true;
    return at > new Date(tracking.changedAt).getTime() + graceMs;
  }
  if (state === 'active') return false;
  return stateAt(employee, at - graceMs) !== 'active' && stateAt(employee, at + graceMs) !== 'active';
}

/**
 * Why an upload captured at `capturedAt` can't be stored, or null when it can: in the future, before the
 * person agreed (`consentAt`), older than the desktop agent could have kept it, or inside a pause or stop.
 */
export function uploadTimeProblem(employee, capturedAt, { consentAt, graceMs = 0 } = {}) {
  const at = new Date(capturedAt).getTime();
  if (!Number.isFinite(at)) return 'The capture time is not a valid date';
  if (at > Date.now() + MAX_CLOCK_SKEW_MS) return 'The capture time is in the future';
  if (at < Date.now() - MAX_UPLOAD_AGE_MS) return 'The capture time is more than 7 days ago';
  if (consentAt && at < new Date(consentAt).getTime() - graceMs) return 'It was captured before consent was given';
  if (capturedWhileNotTracking(employee, at, graceMs)) return 'Tracking was paused or stopped at that time';
  return null;
}
