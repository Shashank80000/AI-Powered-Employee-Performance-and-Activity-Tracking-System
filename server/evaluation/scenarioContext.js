import { DUE_SOON_DAYS, analyseEmployee } from '../src/utils/agentMetrics.js';
import { employeeFacts, ruleInsights } from '../src/utils/agentFacts.js';
import { groundOutput } from '../src/utils/agentGrounding.js';
import { SCENARIO_OPTIONS } from './agentScenarios.js';

/** Runs one scenario through the same pipeline the API uses, without a database or a model. */
export function scenarioContext(scenario, audience = 'manager') {
  const analysis = analyseEmployee(scenario.data, SCENARIO_OPTIONS);
  const subject = { prefix: '', name: 'Test Employee', code: 'E-1', analysis };
  const facts = employeeFacts(subject);
  const rules = ruleInsights({ audience, subjects: [subject], totals: null });
  const grounded = groundOutput(rules, facts, { extraNumbers: [7, DUE_SOON_DAYS], fallbackAnswer: rules.answer });
  return { analysis, subject, facts, rules, grounded };
}

/** [{ scenario, label, expected, actual, pass }] for every check, plus the rules' own evidence check. */
export function evaluateScenarios(scenarios) {
  return scenarios.flatMap((scenario) => {
    const ctx = scenarioContext(scenario);
    const rows = scenario.checks.map(([label, read, expected]) => {
      const actual = read(ctx);
      return { scenario, label, expected, actual, pass: JSON.stringify(actual) === JSON.stringify(expected) };
    });
    const rejected = ctx.grounded.validation.rejected.length;
    rows.push({ scenario, label: 'Rule-based answer passes the evidence check (rejected claims)', expected: 0, actual: rejected, pass: rejected === 0 });
    return rows;
  });
}
