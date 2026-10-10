import { AlertTriangle, CheckCircle2, ClipboardCheck, Hourglass, ListTodo, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { listTasks } from '../../services/taskService.js';
import { isOverdue, wasSentBack } from '../../utils/constants.js';

/** Task counts that need attention, each linking to the matching filter on the Tasks page. */
export default function WorkSummary({ basePath, personal = false }) {
  const { data } = useApi((signal) => listTasks(personal ? { assignedTo: 'me' } : {}, { signal }));
  if (!data) return null;

  const count = (test) => data.filter(test).length;
  const tasksPath = `${basePath}/tasks`;
  const tiles = personal
    ? [
        { label: 'To do', value: count((task) => task.status === 'todo'), filter: 'todo', icon: ListTodo, tone: 'blue', hint: 'Start these when you are ready' },
        { label: 'Changes requested', value: count(wasSentBack), filter: 'in-progress', icon: RotateCcw, tone: 'coral', hint: 'Read the feedback and resubmit' },
        { label: 'Waiting for review', value: count((task) => task.status === 'review'), filter: 'review', icon: Hourglass, tone: 'amber', hint: 'Your manager is checking these' },
        { label: 'Overdue', value: count((task) => isOverdue(task)), filter: 'overdue', icon: AlertTriangle, tone: 'coral', hint: 'Past their due date' }
      ]
    : [
        { label: 'Waiting for your review', value: count((task) => task.status === 'review'), filter: 'review', icon: ClipboardCheck, tone: 'amber', hint: 'Approve or send back' },
        { label: 'Overdue', value: count((task) => isOverdue(task)), filter: 'overdue', icon: AlertTriangle, tone: 'coral', hint: 'Follow up with the person' },
        { label: 'In progress', value: count((task) => task.status === 'in-progress'), filter: 'in-progress', icon: ListTodo, tone: 'blue', hint: 'Being worked on' },
        { label: 'Done', value: count((task) => task.status === 'done'), filter: 'done', icon: CheckCircle2, tone: 'teal', hint: 'Approved work' }
      ];

  return (
    <section className="work-summary section-gap" aria-label="Tasks that need attention">
      {tiles.map(({ label, value, filter, icon: Icon, tone, hint }) => (
        <Link key={label} to={`${tasksPath}?filter=${filter}`} className={`work-tile ${value && (tone === 'coral' || tone === 'amber') ? `work-tile-${tone}` : ''}`}>
          <span className={`metric-icon ${tone}`}><Icon size={17} aria-hidden="true" /></span>
          <span>
            <strong>{value}</strong>
            <b>{label}</b>
            <small>{hint}</small>
          </span>
        </Link>
      ))}
    </section>
  );
}
