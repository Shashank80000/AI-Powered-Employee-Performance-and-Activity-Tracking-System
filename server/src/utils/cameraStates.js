// Generic, non-identifying states the camera agent may report. Never an image, a face or a name.
export const CAMERA_STATES = [
  'working_at_computer',
  'reading_or_writing',
  'on_a_call',
  'talking_with_someone',
  'using_phone',
  'eating_or_drinking',
  'taking_a_break',
  'present_at_desk',
  'away_from_desk',
  'camera_blocked',
  'other',
  'unclassified'
];

// States in which the person is at their desk. 'camera_blocked' and 'unclassified' count as unknown.
export const AT_DESK_STATES = new Set(
  CAMERA_STATES.filter((state) => !['away_from_desk', 'camera_blocked', 'unclassified'].includes(state))
);
