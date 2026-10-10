import { ArrowDown, Building2, Check, User, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TASK_STATUSES } from '../../utils/constants.js';

export const HELP_ROLES = [
  { value: 'admin', label: 'Administrator', icon: Building2 },
  { value: 'manager', label: 'Manager', icon: Users },
  { value: 'employee', label: 'Employee', icon: User }
];

const WORKFLOW = [
  { who: 'Administrator', text: 'Creates a manager' },
  { who: 'Administrator', text: 'Adds employees and chooses their manager' },
  { who: 'Manager', text: 'Assigns a task to an employee' },
  { who: 'Employee', text: 'Starts the task and does the work' },
  { who: 'Employee', text: 'Submits the work for review' },
  { who: 'Manager', text: 'Approves it, or sends it back with feedback' },
  { who: 'Everyone', text: 'Dashboards and reports update' }
];

const STATUS_MEANING = {
  todo: 'Assigned, not started yet.',
  'in-progress': 'The employee is working on it. Also used when the manager sent it back for changes.',
  review: 'The employee submitted it. The manager needs to approve it or send it back.',
  done: 'The manager approved the work.'
};

// [action, admin, manager, employee]
const PERMISSIONS = [
  ['Create managers, reset passwords, deactivate accounts', true, false, false],
  ['Add employees and choose their manager', true, false, false],
  ['See employees', 'Everyone', 'Own team', 'Only themselves'],
  ['Edit job title, department and availability', true, 'Own team', false],
  ['Assign, edit and delete tasks', 'Anyone', 'Own team', false],
  ['Start a task and submit it for review', false, false, 'Own tasks'],
  ['Approve work or send it back', true, 'Own team', false],
  ['Comment on a task', true, 'Own team', 'Own tasks'],
  ['Reports and daily analysis', 'Everyone', 'Own team', 'Only themselves'],
  ['Change own password', true, true, true]
];

const GUIDES = {
  admin: [
    {
      title: 'Create a manager',
      steps: [
        <>Open <b>Managers</b> in the menu.</>,
        <>Fill in <b>Create a manager</b>: their name, work email and a temporary password (select the wand icon to suggest a strong one).</>,
        <>Select <b>Create manager</b>. Give them the email and temporary password in person or through a private channel.</>,
        'At their first sign-in, they are asked to choose their own password.'
      ]
    },
    {
      title: 'Add employees and assign them to a manager',
      steps: [
        <>Open <b>Employees</b>. Fill in <b>Add an employee</b>, and choose their <b>Manager</b>.</>,
        <>The employee code is your own ID for the person (for example EMP-005) and must be unique.</>,
        <>Select <b>Add employee</b>, then share the email and temporary password with them privately.</>,
        <>Ask them to install the desktop agent from the <Link to="/download">Download page</Link>.</>
      ]
    },
    {
      title: 'Manage accounts',
      steps: [
        <><b>Move someone to another team</b>: on Employees, select <b>Edit</b> and choose a different manager.</>,
        <><b>Someone forgot their password</b>: select <b>Reset password</b> on the Employees or Managers page and give them the new temporary password.</>,
        <><b>Someone leaves</b>: select <b>Deactivate</b>. They are signed out at once and can&apos;t sign in. Their history stays, and <b>Reactivate</b> restores access.</>,
        'A manager with employees can only be deactivated after their employees are moved to another manager.',
        <>Use the search box and the <b>Manager</b> and <b>Status</b> filters to find people. <b>No manager</b> shows who still needs one.</>
      ]
    },
    {
      title: 'Follow the work',
      steps: [
        <><b>Overview</b> shows productivity across the whole organisation.</>,
        <><b>Tasks</b> works like a manager&apos;s, for every team: you can assign, review and approve any task.</>,
        <><b>Reports</b> and <b>Daily analysis</b> summarise each person&apos;s work.</>
      ]
    }
  ],
  manager: [
    {
      title: 'See your team',
      steps: [
        <><b>My team</b> lists the employees your administrator assigned to you. Select <b>Edit</b> to update a job title, department or set someone <b>On leave</b>.</>,
        'To add people or move someone to another team, ask your administrator.'
      ]
    },
    {
      title: 'Assign a task',
      steps: [
        <>Open <b>Tasks</b>. In <b>Assign a new task</b>, write a clear title and description: what should be done, and what finished looks like.</>,
        <>Choose the employee, a priority, your time estimate and, if needed, a due date.</>,
        <>Select <b>Assign task</b>. The employee sees it on their <b>My tasks</b> page straight away.</>
      ]
    },
    {
      title: 'Track progress',
      steps: [
        <>Use the filters above the list: <b>Waiting for review</b> shows work to check, <b>Overdue</b> shows tasks past their due date.</>,
        <>The <b>Overview</b> page shows how many tasks need your review and how many are overdue.</>,
        'Select a task to see its description, time spent, history and comments. Use the comment box to ask a question or follow up.'
      ]
    },
    {
      title: 'Review submitted work',
      steps: [
        <>Open a task marked <b>Waiting for review</b> and read the employee&apos;s note.</>,
        <><b>Approve</b> marks it <b>Done</b>. You can add a short comment.</>,
        <><b>Send back for changes</b> returns it to the employee as <b>In progress</b>, marked <b>Changes requested</b>. Explain exactly what needs to change.</>,
        <>Need to reopen approved work? Use <b>Change status</b> in the task.</>
      ]
    }
  ],
  employee: [
    {
      title: 'First steps',
      steps: [
        'Sign in with the email and temporary password your administrator gave you, then choose your own password.',
        <>Install the desktop agent from the <Link to="/download">Download page</Link> and sign in with the same email and password. It records only what you choose to share.</>,
        <>Your manager&apos;s name is on <b>My account</b>.</>
      ]
    },
    {
      title: 'Complete your tasks',
      steps: [
        <>Open <b>My tasks</b>. Select a task to read its description and due date.</>,
        <>Select <b>Start</b> when you begin. In the desktop agent, select the same task so your time is logged.</>,
        <>When it is finished, select <b>Submit</b>, add a note (for example where to find the result) and confirm.</>,
        <>If your manager sends it back, it shows <b>Changes requested</b>. Open it to read the feedback, fix it and submit again.</>,
        <>Use the comment box on a task to ask your manager a question. Only you, your manager and administrators see it.</>
      ]
    },
    {
      title: 'Your activity and privacy',
      steps: [
        <><b>Overview</b> and <b>My activity</b> show exactly what your manager sees about you.</>,
        <>If you turned screenshots on, <b>My screenshots</b> lists them. You can delete any of them, and see who viewed each one.</>,
        'Pause tracking at any time from the button at the top of the page or in the desktop agent.'
      ]
    }
  ]
};

const FAQ = [
  ['I can’t sign in', 'Check the email address and password (passwords are case-sensitive). If it still fails, your administrator can reset your password, or your account may have been deactivated. Only an administrator can fix either.'],
  ['I forgot my password', 'Ask your administrator to reset it. They give you a temporary password, and you choose a new one when you sign in.'],
  ['The page says my session expired, or sends me back to Sign in', 'Sessions end after a few days, or at once if your account was deactivated. Sign in again.'],
  ['The website takes a long time to open', 'The server sleeps after a quiet period and needs up to a minute to wake up. Wait, then reload the page.'],
  ['As a manager, I don’t see an employee', 'You only see employees assigned to you. Ask your administrator to choose you as their manager on the Employees page.'],
  ['As an employee, I can’t mark a task done', 'That is expected: submit it for review instead. Your manager marks it done when they approve it.'],
  ['My time isn’t logged against a task', 'Make sure the desktop agent is running, you are signed in, tracking isn’t paused, and the task is selected in the agent.'],
  ['The desktop agent won’t install on Windows', 'If “Windows protected your PC” appears, select More info, then Run anyway. If antivirus blocks it, ask your IT team to allow it. See the Download page for each system’s steps.'],
  ['I see “You do not have access”', 'That page or action belongs to another role. Use the menu on the left: it only shows what your role can use.']
];

function Mark({ value }) {
  if (value === true) return <Check size={16} className="text-good" aria-label="Yes" />;
  if (value === false) return <X size={16} className="muted" aria-label="No" />;
  return <span>{value}</span>;
}

/** The user guide. `role` picks which role's guide is shown below the shared sections. */
export default function HelpContent({ role, onRoleChange, signedIn }) {
  const origin = window.location.origin;
  return (
    <div className="help-content">
      <section className="panel section-gap" aria-labelledby="getting-started">
        <h2 id="getting-started">Getting started</h2>
        <ol className="numbered-steps">
          <li><b>Open the website</b> at <a href={origin}>{origin.replace(/^https?:\/\//, '')}</a> and select <b>Open workspace</b>, or go straight to the <Link to="/login">sign-in page</Link>.</li>
          <li><b>Sign in</b> with the work email and temporary password your administrator gave you. There is no self sign-up: accounts are created by an administrator.</li>
          <li><b>Brand-new site?</b> The very first visit opens <b>Create the administrator</b> instead of Sign in. Whoever completes it becomes the administrator, and the page then closes for good.</li>
          <li><b>Choose your own password</b> when asked. You can change it later on <b>My account</b>.</li>
          <li><b>Use the menu</b> on the left to move between pages. On a phone, open it with the ☰ button at the top left. It only shows the pages your role can use.</li>
          <li><b>Sign out</b> with the <b>Sign out</b> button under your name at the bottom of the menu. On a shared computer, always sign out.</li>
        </ol>
      </section>

      <section className="panel section-gap" aria-labelledby="workflow">
        <h2 id="workflow">How the work flows</h2>
        <ol className="workflow-diagram">
          {WORKFLOW.map((step, index) => (
            <li key={step.text}>
              <span className={`workflow-who who-${step.who.toLowerCase()}`}>{step.who}</span>
              <span>{step.text}</span>
              {index < WORKFLOW.length - 1 && <ArrowDown size={14} className="workflow-arrow" aria-hidden="true" />}
            </li>
          ))}
        </ol>
        <p className="muted">If work is sent back, the employee fixes it and submits it again, until the manager approves it.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Task status</th><th scope="col">Meaning</th></tr></thead>
            <tbody>
              {TASK_STATUSES.map((status) => (
                <tr key={status.value}>
                  <td><span className={`category-chip chip-${status.tone}`}>{status.label}</span></td>
                  <td>{STATUS_MEANING[status.value]}</td>
                </tr>
              ))}
              <tr><td><span className="category-chip chip-coral">Overdue</span></td><td>Past its due date and not done yet.</td></tr>
              <tr><td><span className="category-chip chip-coral">Changes requested</span></td><td>The manager sent the work back. Open it to read the feedback.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel section-gap" aria-labelledby="role-guide">
        <div className="panel-header">
          <h2 id="role-guide">Guide for your role</h2>
        </div>
        <div className="filter-tabs" role="group" aria-label="Choose a role">
          {HELP_ROLES.map(({ value, label, icon: Icon }) => (
            <button key={value} className={`filter-tab ${value === role ? 'filter-tab-active' : ''}`} aria-pressed={value === role} onClick={() => onRoleChange(value)}>
              <Icon size={14} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className="guide-grid">
          {GUIDES[role].map((guide) => (
            <article key={guide.title} className="guide-card">
              <h3>{guide.title}</h3>
              <ol>
                {guide.steps.map((step, index) => <li key={index}>{step}</li>)}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="panel section-gap" aria-labelledby="permissions">
        <h2 id="permissions">Who can do what</h2>
        <p className="muted">The server checks every request, so hidden buttons are not the only protection: a request for something outside your role is refused.</p>
        <div className="table-wrap">
          <table className="permission-table">
            <thead>
              <tr><th scope="col">Action</th><th scope="col">Administrator</th><th scope="col">Manager</th><th scope="col">Employee</th></tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(([action, ...marks]) => (
                <tr key={action}>
                  <td>{action}</td>
                  {marks.map((mark, index) => <td key={index}><Mark value={mark} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="troubleshooting">
        <h2 id="troubleshooting">Troubleshooting</h2>
        <div className="faq">
          {FAQ.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        {!signedIn && <p className="muted">Still stuck? Contact your administrator: only they can create accounts and reset passwords.</p>}
      </section>
    </div>
  );
}
