import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateProductivity, percentChange } from '../src/utils/productivityCalculator.js';
import { previousRange, periodRange } from '../src/utils/dateUtils.js';

const base = { activeSeconds: 0, idleSeconds: 0, productiveAppSeconds: 0, tasksAssigned: 0, tasksCompleted: 0, onTimeTasks: 0 };

test('no tracked time scores zero', () => {
  assert.equal(calculateProductivity(base).score, 0);
});

test('perfect metrics score 100', () => {
  const metrics = { ...base, activeSeconds: 3600, productiveAppSeconds: 3600, tasksAssigned: 2, tasksCompleted: 2, onTimeTasks: 2 };
  assert.equal(calculateProductivity(metrics).score, 100);
});

test('missing task data does not penalise the score', () => {
  const metrics = { ...base, activeSeconds: 3600, productiveAppSeconds: 3600 };
  assert.equal(calculateProductivity(metrics).score, 100);
});

test('weights are applied to each factor', () => {
  // active 0.5, productive 1, completion 0.5, on-time 1 -> (0.15 + 0.3 + 0.125 + 0.15) * 100
  const metrics = { activeSeconds: 1800, idleSeconds: 1800, productiveAppSeconds: 1800, tasksAssigned: 2, tasksCompleted: 1, onTimeTasks: 1 };
  assert.equal(calculateProductivity(metrics).score, 72.5);
});

test('percentChange handles zero and negative changes', () => {
  assert.equal(percentChange(0, 0), 0);
  assert.equal(percentChange(5, 0), 100);
  assert.equal(percentChange(90, 100), -10);
});

test('previousRange is the same length and ends where the range starts', () => {
  const range = periodRange('week', new Date('2026-10-01T12:00:00Z'));
  const previous = previousRange(range);
  assert.equal(previous.end.getTime(), range.start.getTime());
  assert.equal(range.end - range.start, previous.end - previous.start);
});
