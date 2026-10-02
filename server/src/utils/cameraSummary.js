import { AT_DESK_STATES } from './cameraStates.js';

/** Minutes per camera state, plus at-desk and away totals. Each observation stands for `intervalMinutes`. */
export function summarizeCameraDay(observations, intervalMinutes) {
  const stateMinutes = {};
  let atDeskMinutes = 0;
  let awayMinutes = 0;
  for (const { state } of observations) {
    stateMinutes[state] = (stateMinutes[state] ?? 0) + intervalMinutes;
    if (AT_DESK_STATES.has(state)) atDeskMinutes += intervalMinutes;
    else if (state === 'away_from_desk') awayMinutes += intervalMinutes;
  }
  return { observationCount: observations.length, stateMinutes, atDeskMinutes, awayMinutes };
}
