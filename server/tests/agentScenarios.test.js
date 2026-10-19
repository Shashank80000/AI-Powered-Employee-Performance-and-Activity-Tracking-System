import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENARIOS } from '../evaluation/agentScenarios.js';
import { evaluateScenarios } from '../evaluation/scenarioContext.js';

// Expected values were worked out by hand; see evaluation/agentScenarios.js.
for (const scenario of SCENARIOS) {
  test(`${scenario.id} ${scenario.category}: ${scenario.description}`, () => {
    for (const row of evaluateScenarios([scenario])) {
      assert.deepEqual(row.actual, row.expected, row.label);
    }
  });
}
