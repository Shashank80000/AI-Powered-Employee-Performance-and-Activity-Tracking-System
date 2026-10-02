import { env } from '../config/env.js';

const TIMEOUT_MS = 8000;

async function post(path, body) {
  const response = await fetch(`${env.AI_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`AI service responded ${response.status}`);
  return response.json();
}

/**
 * Sends aggregated daily metrics (never raw activity) to the AI service.
 * @param {{employeeId:string, employeeName?:string, periodStart:string, periodEnd:string, days:object[]}} payload
 */
export function requestReport(payload) {
  return post('/api/ai/report', payload);
}

export async function isAiServiceAvailable() {
  try {
    const response = await fetch(`${env.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
