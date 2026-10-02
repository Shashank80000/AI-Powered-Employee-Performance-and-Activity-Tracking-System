import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeCameraDay } from '../src/utils/cameraSummary.js';
import { AT_DESK_STATES, CAMERA_STATES } from '../src/utils/cameraStates.js';

test('no observations gives empty totals', () => {
  assert.deepEqual(summarizeCameraDay([], 5), { observationCount: 0, stateMinutes: {}, atDeskMinutes: 0, awayMinutes: 0 });
});

test('each observation counts for one interval', () => {
  const observations = ['working_at_computer', 'working_at_computer', 'on_a_call', 'away_from_desk'].map((state) => ({ state }));
  assert.deepEqual(summarizeCameraDay(observations, 5), {
    observationCount: 4,
    stateMinutes: { working_at_computer: 10, on_a_call: 5, away_from_desk: 5 },
    atDeskMinutes: 15,
    awayMinutes: 5
  });
});

test('a blocked camera or an unclassified frame counts as neither at the desk nor away', () => {
  const summary = summarizeCameraDay([{ state: 'camera_blocked' }, { state: 'unclassified' }], 10);
  assert.equal(summary.atDeskMinutes, 0);
  assert.equal(summary.awayMinutes, 0);
  assert.equal(summary.observationCount, 2);
});

test('at-desk states are a subset of the known states', () => {
  for (const state of AT_DESK_STATES) assert.ok(CAMERA_STATES.includes(state));
  assert.ok(!AT_DESK_STATES.has('away_from_desk'));
});
