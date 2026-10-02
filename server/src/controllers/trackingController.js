import { z } from 'zod';
import { Employee } from '../models/Employee.js';
import { currentEmployee } from '../middleware/roleMiddleware.js';

// The agent counts as connected if it checked in within this window (it polls every 15 s).
const AGENT_ONLINE_MS = 60 * 1000;

const updateSchema = z.object({
  state: z.enum(['active', 'paused', 'stopped']),
  source: z.enum(['web', 'agent'])
});

const isAgent = (request) => request.get('X-Client') === 'agent';

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
  if (employee.tracking?.state !== state) {
    employee.tracking = { state, changedAt: new Date(), changedBy: source };
  }
  if (isAgent(request)) employee.agentLastSeenAt = new Date();
  await employee.save();
  response.json({ tracking: toTrackingResponse(employee) });
}

/**
 * True when something captured at `capturedAt` falls inside a pause or stop, i.e. it should
 * not have been recorded. `graceMs` allows for the snapshot that closes an interval.
 */
export function capturedWhileNotTracking(employee, capturedAt, graceMs = 0) {
  const tracking = employee.tracking;
  if (!tracking || tracking.state === 'active') return false;
  // Never started (still the account's initial state): nothing was ever allowed.
  if (tracking.changedBy === 'system') return true;
  return new Date(capturedAt).getTime() > new Date(tracking.changedAt).getTime() + graceMs;
}
