import { useState } from 'react';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import TaskForm from '../../components/tasks/TaskForm.jsx';
import TaskTable from '../../components/tasks/TaskTable.jsx';
import { useApi } from '../../hooks/useApi.js';
import { listEmployees } from '../../services/employeeService.js';
import { createTask, deleteTask, listTasks, updateTask } from '../../services/taskService.js';
import { TASK_STATUSES } from '../../utils/constants.js';

/** Task assignment and tracking for managers and admins. */
export default function TasksPage() {
  const [status, setStatus] = useState('');
  const [actionError, setActionError] = useState(null);
  const employees = useApi((signal) => listEmployees({ signal }));
  const tasks = useApi((signal) => listTasks({ status }, { signal }), [status]);

  async function run(action) {
    setActionError(null);
    try {
      await action();
      tasks.reload();
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Work" title="Tasks">
        Assign work and compare expected with actual time.
      </PageHeading>

      <article className="panel section-gap">
        <PanelHeader title="New task" />
        {employees.data && <TaskForm employees={employees.data.filter((employee) => employee.status === 'active')} onSubmit={async (task) => run(() => createTask(task))} />}
      </article>

      <article className="panel">
        <PanelHeader title="All tasks" subtitle={tasks.data ? `${tasks.data.length} tasks` : undefined}>
          <select className="inline-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {TASK_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </PanelHeader>
        {actionError && <p className="form-error" role="alert">{actionError.message}</p>}
        <StatusMessage loading={tasks.loading && !tasks.data} error={tasks.error} empty={tasks.data?.length === 0} emptyText="No tasks match this filter." onRetry={tasks.reload} />
        {tasks.data?.length > 0 && (
          <TaskTable
            tasks={tasks.data}
            onStatusChange={(task, next) => run(() => updateTask(task.id, { status: next }))}
            onDelete={(task) => window.confirm(`Delete "${task.title}"?`) && run(() => deleteTask(task.id))}
          />
        )}
      </article>
    </>
  );
}
