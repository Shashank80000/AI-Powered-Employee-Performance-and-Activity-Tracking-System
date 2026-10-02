import { useState } from 'react';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import TaskTable from '../../components/tasks/TaskTable.jsx';
import { useApi } from '../../hooks/useApi.js';
import { listTasks, updateTask } from '../../services/taskService.js';

export default function MyTasksPage() {
  const tasks = useApi((signal) => listTasks({ assignedTo: 'me' }, { signal }));
  const [actionError, setActionError] = useState(null);

  async function handleStatusChange(task, status) {
    setActionError(null);
    try {
      const updated = await updateTask(task.id, { status });
      tasks.setData((previous) => previous.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Work" title="My tasks">
        Time is logged automatically by the desktop agent while a task is selected.
      </PageHeading>
      <article className="panel">
        {actionError && <p className="form-error" role="alert">{actionError.message}</p>}
        <StatusMessage loading={tasks.loading} error={tasks.error} empty={tasks.data?.length === 0} emptyText="No tasks assigned to you." onRetry={tasks.reload} />
        {tasks.data?.length > 0 && <TaskTable tasks={tasks.data} showAssignee={false} onStatusChange={handleStatusChange} />}
      </article>
    </>
  );
}
