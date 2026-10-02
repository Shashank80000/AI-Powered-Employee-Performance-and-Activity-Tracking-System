import { TASK_STATUSES } from '../../utils/constants.js';
import { formatDate, formatMinutes } from '../../utils/formatters.js';

export default function TaskTable({ tasks, onStatusChange, onDelete, showAssignee = true }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Task</th>
            {showAssignee && <th scope="col">Assignee</th>}
            <th scope="col">Priority</th>
            <th scope="col">Due</th>
            <th scope="col">Time (actual / expected)</th>
            <th scope="col">Status</th>
            {onDelete && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const overdue = task.status !== 'done' && task.dueDate && new Date(task.dueDate) < new Date();
            const overTime = task.actualMinutes > task.expectedMinutes;
            return (
              <tr key={task.id}>
                <td>
                  <strong className="cell-title">{task.title}</strong>
                </td>
                {showAssignee && <td>{task.assigneeName}</td>}
                <td>
                  <span className={`priority priority-${task.priority}`}>{task.priority}</span>
                </td>
                <td className={overdue ? 'text-danger' : undefined}>{formatDate(task.dueDate)}</td>
                <td className={overTime ? 'text-danger' : undefined}>
                  {formatMinutes(task.actualMinutes)} / {formatMinutes(task.expectedMinutes)}
                </td>
                <td>
                  <select className="inline-select" value={task.status} aria-label={`Status of ${task.title}`} onChange={(event) => onStatusChange(task, event.target.value)}>
                    {TASK_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </td>
                {onDelete && (
                  <td>
                    <button className="text-button danger" onClick={() => onDelete(task)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
