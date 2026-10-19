import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENARIOS } from '../evaluation/agentScenarios.js';
import { scenarioContext } from '../evaluation/scenarioContext.js';
import { checkClaim, groundOutput, numbersIn } from '../src/utils/agentGrounding.js';

// S1: 2 of 4 tasks completed (50%), 1 overdue ("Update seed data", due 2026-10-14).
const { facts, rules } = scenarioContext(SCENARIOS.find((scenario) => scenario.id === 'S1'));
const factById = new Map(facts.map((fact) => [fact.id, fact]));
const fallbackAnswer = { text: 'Fallback', factIds: ['tasks.workload'] };

test('numbersIn reads integers, decimals and thousands separators', () => {
  assert.deepEqual(numbersIn('3 of 4 tasks (66.7%), 1,250 minutes'), [3, 4, 66.7, 1250]);
  assert.deepEqual(numbersIn('no numbers'), []);
});

test('a claim backed by the facts it cites is accepted', () => {
  assert.equal(checkClaim('2 of 4 tasks were completed (50%).', ['tasks.completed', 'tasks.workload', 'tasks.completionRate'], factById), null);
});

test('a claim may name dates and titles from the cited evidence', () => {
  assert.equal(checkClaim('"Update seed data" was due on 2026-10-14 and is overdue.', ['tasks.overdue'], factById), null);
});

test('a claim without evidence is rejected', () => {
  assert.equal(checkClaim('The employee is doing well.', [], factById), 'Cites no evidence');
});

test('a claim citing a fact that does not exist is rejected', () => {
  assert.match(checkClaim('Productivity score is high.', ['tasks.productivityScore'], factById), /do not exist: tasks.productivityScore/);
});

test('an invented number is rejected, even when the cited fact exists', () => {
  assert.match(checkClaim('5 tasks are overdue.', ['tasks.overdue'], factById), /not found in the cited facts: 5/);
});

test('a number from a fact the claim does not cite is rejected', () => {
  // 50 is the completion rate, but the claim only cites the overdue count.
  assert.match(checkClaim('1 task is overdue, which is 50% of the work.', ['tasks.overdue'], factById), /: 50/);
});

test('rounded forms of a fact value are accepted', () => {
  const rate = [{ id: 'r', label: 'Rate', value: 66.7, unit: '%' }];
  assert.equal(checkClaim('About 67% were completed.', ['r'], new Map(rate.map((f) => [f.id, f]))), null);
});

test('groundOutput keeps supported claims, removes the rest and replaces an unsupported answer', () => {
  const output = {
    answer: { text: 'The employee finished 9 tasks.', factIds: ['tasks.completed'] },
    observations: [
      { statement: '2 of 4 tasks were completed.', factIds: ['tasks.completed', 'tasks.workload'], kind: 'neutral' },
      { statement: 'They were very productive.', factIds: [], kind: 'strength' }
    ],
    recommendations: [{ action: 'Discuss the overdue task.', rationale: '1 task is overdue.', factIds: ['tasks.overdue'] }],
    limitations: ['Sign-in time is not productive work.', 'Only 12 of 40 records were checked.']
  };
  const result = groundOutput(output, facts, { fallbackAnswer });
  assert.equal(result.observations.length, 1);
  assert.equal(result.recommendations.length, 1);
  assert.deepEqual(result.limitations, ['Sign-in time is not productive work.']);
  assert.equal(result.answer, fallbackAnswer);
  assert.equal(result.validation.answerReplaced, true);
  assert.equal(result.validation.checked, 6);
  assert.equal(result.validation.accepted, 3);
  assert.deepEqual(result.validation.rejected.map((item) => item.type).sort(), ['answer', 'limitation', 'observation']);
});

test('numbers from the question and the period length are allowed', () => {
  assert.equal(checkClaim('Over the last 7 days, 1 task is overdue.', ['tasks.overdue'], factById, [7]), null);
});

test('the rule-based answer for S1 passes its own evidence check', () => {
  const result = groundOutput(rules, facts, { extraNumbers: [7, 3], fallbackAnswer: rules.answer });
  assert.deepEqual(result.validation.rejected, []);
});
