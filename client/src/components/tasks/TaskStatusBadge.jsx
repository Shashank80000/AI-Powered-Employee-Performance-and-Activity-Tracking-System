import { TASK_STATUS_BY_VALUE, isOverdue, wasSentBack } from '../../utils/constants.js';

/** One consistent label for a task's state, plus "Overdue" and "Changes requested" when they apply. */
export default function TaskStatusBadge({ task }) {
  const status = TASK_STATUS_BY_VALUE[task.status] ?? { label: task.status, tone: 'neutral' };
  return (
    <span className="badge-row">
      <span className={`category-chip chip-${status.tone}`}>{status.label}</span>
      {wasSentBack(task) && <span className="category-chip chip-coral">Changes requested</span>}
      {isOverdue(task) && <span className="category-chip chip-coral">Overdue</span>}
    </span>
  );
}
