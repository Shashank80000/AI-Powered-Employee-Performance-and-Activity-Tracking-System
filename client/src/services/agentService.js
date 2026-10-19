import { request } from './api.js';

/** { aiConfigured, model }: whether answers come from Claude or from fixed rules. */
export const getAgentStatus = (options) => request('/agent/status', options);

/** Runs the agent: verified metrics, then an evidence-checked interpretation. */
export const askAgent = ({ scope, employeeId, period, question }) =>
  request('/agent/insights', { method: 'POST', body: { scope, employeeId: employeeId || undefined, period, question: question || undefined } });

/** Rates an answer from 1 to 5, for evaluating the agent. */
export const rateAnswer = (runId, rating) => request(`/agent/runs/${runId}/feedback`, { method: 'POST', body: { rating } }).then((data) => data.feedback);
