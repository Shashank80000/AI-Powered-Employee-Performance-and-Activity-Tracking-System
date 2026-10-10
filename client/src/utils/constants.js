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
  { value: 'todo', label: 'To do', tone: 'neutral' },
  { value: 'in-progress', label: 'In progress', tone: 'blue' },
  { value: 'review', label: 'Waiting for review', tone: 'amber' },
  { value: 'done', label: 'Done', tone: 'teal' }
];
export const TASK_STATUS_BY_VALUE = Object.fromEntries(TASK_STATUSES.map((status) => [status.value, status]));

/** Past its due date and not yet done. */
export const isOverdue = (task, now = new Date()) => task.status !== 'done' && Boolean(task.dueDate) && new Date(task.dueDate) < now;

/** The manager's last review sent the task back and the employee hasn't resubmitted yet. */
export const wasSentBack = (task) => task.status === 'in-progress' && task.history?.findLast((event) => event.kind !== 'comment')?.kind === 'changes-requested';

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
