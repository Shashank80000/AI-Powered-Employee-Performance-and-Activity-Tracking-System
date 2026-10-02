export const ROLE_HOME = {
  admin: '/admin',
  manager: '/manager',
  employee: '/employee'
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Manager',
  employee: 'Employee'
};

export const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'Last 30 days' }
];

export const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'review', label: 'In review' },
  { value: 'done', label: 'Done' }
];

export const TASK_PRIORITIES = ['low', 'medium', 'high'];

export const SCREEN_CATEGORIES = {
  coding: { label: 'Coding', tone: 'teal' },
  documents: { label: 'Documents', tone: 'teal' },
  design: { label: 'Design', tone: 'teal' },
  research: { label: 'Research', tone: 'blue' },
  communication: { label: 'Communication', tone: 'blue' },
  meeting: { label: 'Meetings', tone: 'blue' },
  admin: { label: 'Admin', tone: 'amber' },
  entertainment: { label: 'Entertainment', tone: 'coral' },
  social_media: { label: 'Social media', tone: 'coral' },
  idle_or_locked: { label: 'Idle / locked', tone: 'neutral' },
  other: { label: 'Other', tone: 'neutral' },
  unclassified: { label: 'Unclassified', tone: 'neutral' }
};

// Generic webcam labels from camera-agent (no images are ever stored).
export const CAMERA_STATES = {
  working_at_computer: { label: 'At the computer', tone: 'teal' },
  reading_or_writing: { label: 'Reading / writing', tone: 'teal' },
  present_at_desk: { label: 'At the desk', tone: 'teal' },
  on_a_call: { label: 'On a call', tone: 'blue' },
  talking_with_someone: { label: 'Talking with someone', tone: 'blue' },
  using_phone: { label: 'Using phone', tone: 'amber' },
  eating_or_drinking: { label: 'Eating / drinking', tone: 'amber' },
  taking_a_break: { label: 'Taking a break', tone: 'amber' },
  away_from_desk: { label: 'Away from desk', tone: 'neutral' },
  camera_blocked: { label: 'Camera blocked', tone: 'neutral' },
  other: { label: 'Other', tone: 'neutral' },
  unclassified: { label: 'Unclassified', tone: 'neutral' }
};
