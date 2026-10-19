import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { AgentRun } from '../models/AgentRun.js';
import { aiConfigured, getMetrics, runAgent } from '../services/agentService.js';
import { objectId } from '../utils/accountRules.js';

const scopeSchema = z.object({
  scope: z.enum(['employee', 'team']).default('employee'),
  // Ignored for employees, who always get their own data.
  employeeId: objectId.optional(),
  period: z.enum(['day', 'week', 'month']).default('week')
});

const askSchema = scopeSchema.extend({
  question: z.string().trim().max(500, 'Keep the question under 500 characters').optional()
});

const feedbackSchema = z.object({
  rating: z.number().int().min(1, 'Rate from 1 to 5').max(5, 'Rate from 1 to 5'),
  comment: z.string().trim().max(1000, 'Keep the comment under 1000 characters').optional()
});

// Requests per person in the last hour. In memory: enough for one server process, resets on restart.
const recentRequests = new Map();
const HOUR_MS = 60 * 60 * 1000;

function checkRateLimit(user) {
  const now = Date.now();
  const key = user._id.toString();
  const recent = (recentRequests.get(key) ?? []).filter((at) => now - at < HOUR_MS);
  if (recent.length >= env.AGENT_RATE_LIMIT_PER_HOUR) {
    throw new HttpError(429, `You can ask the assistant ${env.AGENT_RATE_LIMIT_PER_HOUR} times an hour. Try again later.`);
  }
  recent.push(now);
  recentRequests.set(key, recent);
}

/** Whether Claude is configured (otherwise answers come from fixed rules). */
export function status(_request, response) {
  response.json({ aiConfigured: aiConfigured(), model: aiConfigured() ? env.AGENT_MODEL : null });
}

/** The verified numbers only, with no model call. */
export async function metrics(request, response) {
  response.json(await getMetrics(request.user, scopeSchema.parse(request.query)));
}

/** Runs the agent: verified metrics, then Claude's interpretation, checked against the evidence. */
export async function ask(request, response) {
  const input = askSchema.parse(request.body ?? {});
  checkRateLimit(request.user);
  response.status(201).json(await runAgent(request.user, input));
}

/** Earlier runs: your own, or everyone's for administrators (for evaluation). */
export async function listRuns(request, response) {
  const filter = request.user.role === 'admin' && request.query.all === 'true' ? {} : { user: request.user._id };
  const runs = await AgentRun.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .select('user role scope employee period periodStart periodEnd question source model fallbackReason validation latencyMs feedback createdAt')
    .populate({ path: 'employee', select: 'user employeeCode', populate: { path: 'user', select: 'name' } })
    .lean();
  response.json({
    runs: runs.map((run) => ({
      id: run._id.toString(),
      scope: run.scope,
      employeeName: run.employee?.user?.name ?? null,
      period: run.period,
      question: run.question ?? null,
      source: run.source,
      model: run.model ?? null,
      fallbackReason: run.fallbackReason ?? null,
      accepted: run.validation?.accepted ?? null,
      rejected: run.validation?.rejected?.length ?? 0,
      latencyMs: run.latencyMs,
      feedback: run.feedback?.rating ? run.feedback : null,
      createdAt: run.createdAt
    }))
  });
}

/** The asker rates how useful an answer was (1-5), for evaluating the agent. */
export async function rateRun(request, response) {
  const { rating, comment } = feedbackSchema.parse(request.body ?? {});
  const run = await AgentRun.findOneAndUpdate(
    { _id: objectId.parse(request.params.id), user: request.user._id },
    { feedback: { rating, comment: comment || undefined, at: new Date() } },
    { new: true }
  );
  if (!run) throw new HttpError(404, 'Answer not found');
  response.json({ feedback: run.feedback });
}
