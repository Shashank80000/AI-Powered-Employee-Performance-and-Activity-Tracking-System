import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import HelpCallout from '../../components/common/HelpCallout.jsx';
import Notice from '../../components/common/Notice.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import TaskDetails from '../../components/tasks/TaskDetails.jsx';
import TaskList from '../../components/tasks/TaskList.jsx';
import { useApi } from '../../hooks/useApi.js';
import { listTasks } from '../../services/taskService.js';

const NOTICES = {
  'in-progress': (task) => `You started "${task.title}". Submit it for review when it is finished.`,
  review: (task) => `"${task.title}" is submitted. Your manager will review it.`
};

export default function MyTasksPage() {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState(null);
  const tasks = useApi((signal) => listTasks({ assignedTo: 'me' }, { signal }));
  const clearNotice = useCallback(() => setNotice(null), []);
  const openTask = tasks.data?.find((task) => task.id === openId);

  function handleChanged(updated) {
    const previous = tasks.data.find((task) => task.id === updated.id);
    tasks.setData((list) => list.map((task) => (task.id === updated.id ? updated : task)));
    if (previous?.status !== updated.status && NOTICES[updated.status]) {
      setNotice(NOTICES[updated.status](updated));
      setOpenId(null);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Work" title="My tasks">
        Work your manager assigned to you. Select a task to see what to do, start it, and submit it when it is finished.
      </PageHeading>

      <HelpCallout title="How to complete a task">
        <ol className="flow-steps">
          <li>Select <b>Start</b> when you begin. Select the task in the desktop agent too, so your time is logged.</li>
          <li>When it is finished, select <b>Submit</b> and add a note for your manager.</li>
          <li>Your manager approves it, or sends it back with feedback marked <em>Changes requested</em>.</li>
        </ol>
      </HelpCallout>

      <Notice onDismiss={clearNotice}>{notice}</Notice>

      <article className="panel">
        <StatusMessage loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={tasks.reload} />
        {tasks.data && (
          <TaskList
            tasks={tasks.data}
            filter={params.get('filter') ?? 'all'}
            onFilterChange={(value) => setParams(value === 'all' ? {} : { filter: value }, { replace: true })}
            onOpen={(task) => setOpenId(task.id)}
          />
        )}
      </article>

      {openTask && <TaskDetails task={openTask} onClose={() => setOpenId(null)} onChanged={handleChanged} />}
    </>
  );
}
