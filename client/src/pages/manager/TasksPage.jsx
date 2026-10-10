import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HelpCallout from '../../components/common/HelpCallout.jsx';
import Notice from '../../components/common/Notice.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import TaskDetails from '../../components/tasks/TaskDetails.jsx';
import TaskForm from '../../components/tasks/TaskForm.jsx';
import TaskList from '../../components/tasks/TaskList.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { listEmployees } from '../../services/employeeService.js';
import { createTask, deleteTask, listTasks } from '../../services/taskService.js';
import { ROLE_HOME } from '../../utils/constants.js';
import { errorMessage } from '../../utils/formatters.js';

/** Task assignment, tracking and review for managers (their team) and admins (everyone). */
export default function TasksPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const employees = useApi((signal) => listEmployees({ signal }));
  const tasks = useApi((signal) => listTasks({}, { signal }));
  const clearNotice = useCallback(() => setNotice(null), []);

  const assignable = employees.data?.filter((employee) => employee.status !== 'inactive') ?? [];
  const openTask = tasks.data?.find((task) => task.id === openId);
  const home = ROLE_HOME[user.role];

  async function handleCreate(input) {
    const task = await createTask(input);
    tasks.setData((previous) => [task, ...(previous ?? [])]);
    setNotice(`"${task.title}" is assigned to ${task.assigneeName}. They will see it on their My tasks page.`);
  }

  async function handleDelete(task) {
    if (!window.confirm(`Delete "${task.title}"? Its history and feedback are deleted too. This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteTask(task.id);
      tasks.setData((previous) => previous.filter((item) => item.id !== task.id));
      setNotice(`"${task.title}" was deleted.`);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  function handleChanged(updated) {
    tasks.setData((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
    if (updated.status === 'done') setNotice(`"${updated.title}" is approved and marked done.`);
  }

  return (
    <>
      <PageHeading eyebrow="Work" title="Tasks">
        Assign work, follow its progress and review what your {user.role === 'admin' ? 'employees' : 'team'} submit.
      </PageHeading>

      <HelpCallout title="How tasks move">
        <ol className="flow-steps">
          <li><b>You assign</b> a task. It starts as <em>To do</em>.</li>
          <li><b>The employee starts</b> it (<em>In progress</em>), then <b>submits</b> it (<em>Waiting for review</em>).</li>
          <li><b>You review</b>: approve it (<em>Done</em>) or send it back with feedback (<em>In progress</em> again).</li>
        </ol>
      </HelpCallout>

      <Notice onDismiss={clearNotice}>{notice}</Notice>

      <article className="panel section-gap">
        <PanelHeader title="Assign a new task" subtitle="The employee is shown the task as soon as you assign it." />
        <StatusMessage loading={employees.loading} error={employees.error} onRetry={employees.reload} />
        {employees.data && assignable.length === 0 && (
          <p className="status-message">
            {user.role === 'admin' ? (
              <>There is no one to assign work to yet. <Link to={`${home}/employees`}>Add an employee</Link> first.</>
            ) : (
              'No employees are assigned to you yet. Ask your administrator to add employees to your team.'
            )}
          </p>
        )}
        {assignable.length > 0 && <TaskForm employees={assignable} onSubmit={handleCreate} />}
      </article>

      <article className="panel">
        <PanelHeader title={user.role === 'admin' ? 'All tasks' : 'Team tasks'} subtitle="Select a task to see its details, history and feedback." />
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        <StatusMessage loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={tasks.reload} />
        {tasks.data && (
          <TaskList
            tasks={tasks.data}
            reviewer
            filter={params.get('filter') ?? 'all'}
            onFilterChange={(value) => setParams(value === 'all' ? {} : { filter: value }, { replace: true })}
            onOpen={(task) => setOpenId(task.id)}
            onDelete={handleDelete}
          />
        )}
      </article>

      {openTask && <TaskDetails task={openTask} reviewer onClose={() => setOpenId(null)} onChanged={handleChanged} />}
    </>
  );
}
