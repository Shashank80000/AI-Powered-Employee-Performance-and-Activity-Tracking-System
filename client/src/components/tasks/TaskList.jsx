import { ClipboardList, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TASK_STATUSES, isOverdue, wasSentBack } from '../../utils/constants.js';
import { formatDate, formatMinutes } from '../../utils/formatters.js';
import EmptyState from '../common/EmptyState.jsx';
import TaskStatusBadge from './TaskStatusBadge.jsx';

const PAGE_SIZE = 15;

export const TASK_FILTERS = [
  { value: 'all', label: 'All', test: () => true },
  ...TASK_STATUSES.map(({ value, label }) => ({ value, label, test: (task) => task.status === value })),
  { value: 'overdue', label: 'Overdue', test: (task) => isOverdue(task) }
];

/** The button that opens a task, labelled with what the viewer would do next. */
function actionLabel(task, reviewer) {
  if (reviewer) return task.status === 'review' ? 'Review' : 'Open';
  if (task.status === 'todo') return 'Start';
  if (task.status === 'in-progress') return wasSentBack(task) ? 'See feedback' : 'Submit';
  return 'Open';
}

/**
 * Filterable, searchable task list. `reviewer` (managers and admins) adds the assignee column, search by person and delete.
 * The filter is controlled so dashboards can link straight to, say, the tasks waiting for review.
 */
export default function TaskList({ tasks, reviewer, filter, onFilterChange, onOpen, onDelete, emptyAction }) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  const counts = useMemo(() => Object.fromEntries(TASK_FILTERS.map((option) => [option.value, tasks.filter(option.test).length])), [tasks]);
  const active = TASK_FILTERS.find((option) => option.value === filter) ?? TASK_FILTERS[0];
  const needle = query.trim().toLowerCase();
  const visible = tasks.filter(
    (task) => active.test(task) && (!needle || task.title.toLowerCase().includes(needle) || task.assigneeName?.toLowerCase().includes(needle))
  );

  if (tasks.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title={reviewer ? 'No tasks yet' : 'No tasks assigned to you yet'} action={emptyAction}>
        {reviewer
          ? 'Create a task with the form above. The employee sees it on their My tasks page straight away.'
          : 'When your manager assigns you work, it appears here with its description and due date.'}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter tasks">
          {TASK_FILTERS.map((option) => (
            <button
              key={option.value}
              aria-pressed={option.value === active.value}
              className={`filter-tab ${option.value === active.value ? 'filter-tab-active' : ''}`}
              onClick={() => {
                onFilterChange(option.value);
                setShown(PAGE_SIZE);
              }}
            >
              {option.label} <span>{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={15} aria-hidden="true" />
          <span className="visually-hidden">Search tasks</span>
          <input type="search" placeholder={reviewer ? 'Search by task or person' : 'Search tasks'} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="status-message">No tasks match {needle ? `"${query.trim()}" in ` : ''}{active.label.toLowerCase()}. Try another filter.</p>
      ) : (
        <div className="table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th scope="col">Task</th>
                {reviewer && <th scope="col">Assigned to</th>}
                <th scope="col">Priority</th>
                <th scope="col">Due</th>
                <th scope="col">Time (actual / expected)</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, shown).map((task) => (
                <tr key={task.id}>
                  <td>
                    <button className="link-button cell-title" onClick={() => onOpen(task)}>{task.title}</button>
                    {task.description && <span className="cell-sub">{task.description}</span>}
                  </td>
                  {reviewer && <td>{task.assigneeName}</td>}
                  <td><span className={`priority priority-${task.priority}`}>{task.priority}</span></td>
                  <td className={isOverdue(task) ? 'text-danger' : undefined}>{formatDate(task.dueDate)}</td>
                  <td className={task.actualMinutes > task.expectedMinutes ? 'text-danger' : undefined}>
                    {formatMinutes(task.actualMinutes)} / {formatMinutes(task.expectedMinutes)}
                  </td>
                  <td><TaskStatusBadge task={task} /></td>
                  <td className="row-actions">
                    <button className="secondary-button small" onClick={() => onOpen(task)}>{actionLabel(task, reviewer)}</button>
                    {onDelete && (
                      <button className="text-button danger" onClick={() => onDelete(task)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > shown && (
        <button className="secondary-button show-more" onClick={() => setShown(shown + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, visible.length - shown)} more of {visible.length - shown}
        </button>
      )}
    </>
  );
}
