import { CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { listEmployees } from '../../services/employeeService.js';
import { listTasks } from '../../services/taskService.js';
import { listAllManagers } from '../../services/userService.js';

const HIDE_KEY = 'workplus.gettingStartedHidden';

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Admin setup checklist, ticked from real data. Disappears once everything is done, or when hidden. */
export default function GettingStarted() {
  const [hidden, setHidden] = useState(readHidden);
  const data = useApi(async (signal) => {
    const [managers, employees, tasks] = await Promise.all([listAllManagers({ signal }), listEmployees({ signal }), listTasks({}, { signal })]);
    return { managers, employees: employees.filter((employee) => employee.status !== 'inactive'), tasks };
  });
  if (hidden || !data.data) return null;

  const { managers, employees, tasks } = data.data;
  const steps = [
    { done: managers.some((manager) => manager.isActive), to: '/admin/managers', label: 'Create a manager', hint: 'Managers assign tasks and review their team’s work.' },
    { done: employees.length > 0, to: '/admin/employees', label: 'Add your first employee', hint: 'Create their account and give them the temporary password.' },
    {
      done: employees.length > 0 && employees.every((employee) => employee.manager),
      to: '/admin/employees?manager=none',
      label: 'Give every employee a manager',
      hint: 'Employees without a manager have no one to review their work.'
    },
    { done: tasks.length > 0, to: '/admin/tasks', label: 'Assign the first task', hint: 'Or let a manager do it from their own Tasks page.' },
    {
      done: employees.some((employee) => employee.consent?.acceptedAt),
      to: '/download',
      label: 'Ask employees to install the desktop agent',
      hint: 'It logs time against tasks. Share the Download page link with them.'
    }
  ];
  const remaining = steps.filter((step) => !step.done).length;
  if (remaining === 0) return null;

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      // Storage unavailable: hidden until the next reload.
    }
    setHidden(true);
  }

  return (
    <article className="panel section-gap getting-started" aria-labelledby="getting-started-title">
      <div className="panel-header">
        <div>
          <h2 id="getting-started-title">Getting started</h2>
          <p>{steps.length - remaining} of {steps.length} done. Each step links to the page where you do it.</p>
        </div>
        <button className="text-button" onClick={hide}>Hide this</button>
      </div>
      <ol className="checklist">
        {steps.map((step) => (
          <li key={step.label} className={step.done ? 'checklist-done' : undefined}>
            {step.done ? <CheckCircle2 size={18} aria-label="Done" /> : <Circle size={18} aria-label="To do" />}
            <div>
              {step.done ? <strong>{step.label}</strong> : <Link to={step.to}><strong>{step.label}</strong></Link>}
              <span>{step.hint}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="muted">New here? The <Link to="/admin/help">user guide</Link> explains every step.</p>
    </article>
  );
}
