import { Compass } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_HOME, ROLE_LABELS } from '../../utils/constants.js';

// What to try on each page while exploring the demo. Keys are paths without the role prefix.
const TIPS = {
  admin: {
    '': 'This is the whole organisation. Change the period (top right) to Today or Last 30 days, and see everyone ranked in Team performance.',
    employees: 'Add an employee with the form, and see what each person chose to share in the table.',
    tasks: 'Create a task, then change a status — Recent activity on the Overview updates.',
    reports: 'Generate a report for Riya Kapoor. The AI service writes it from her daily numbers.',
    analysis: 'Pick Akash Yadav or Shashank Pandey to see a sample day: time per category and a timeline.'
  },
  manager: {
    '': 'This is Neha Verma’s team. Change the period (top right), and compare people in Team performance.',
    employees: 'Your team, and what each person agreed to share from the desktop agent.',
    tasks: 'Assign a task to someone, or filter by status.',
    reports: 'Generate a report for Riya Kapoor. It’s written from her daily numbers and labelled AI-generated.',
    analysis: 'Pick Akash Yadav or Shashank Pandey to see a sample day. Screenshots appear here once a real desktop agent sends them.'
  },
  employee: {
    '': 'This is Akash’s own view, the same data his manager sees. The top bar controls tracking in the desktop agent.',
    tasks: 'Change a task’s status, e.g. move one to Done.',
    activity: 'Everything the desktop agent recorded, in the form it’s stored: time, counts and app names.',
    analysis: 'A sample day built from screenshot labels. Try earlier dates too.',
    screenshots: 'Screenshots appear here when the desktop agent takes them, with who viewed each one. The demo data has none.'
  }
};

/** Shown on every page during a demo session: who you are, what to try, and a role switcher. */
export default function DemoBanner() {
  const { user, loginDemo } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const section = location.pathname.split('/')[2] ?? '';
  const tip = TIPS[user.role]?.[section] ?? TIPS[user.role]?.[''];

  async function switchRole(role) {
    setBusy(true);
    try {
      await loginDemo(role);
      navigate(ROLE_HOME[role], { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="demo-banner" aria-label="Demo guide">
      <Compass size={17} aria-hidden="true" />
      <div className="demo-text">
        <strong>
          Demo · exploring as {ROLE_LABELS[user.role]} ({user.name})
        </strong>
        <span>{tip}</span>
      </div>
      <label className="demo-switch">
        <span className="visually-hidden">Switch demo role</span>
        <select value={user.role} disabled={busy} onChange={(event) => switchRole(event.target.value)}>
          {['admin', 'manager', 'employee'].map((role) => (
            <option key={role} value={role}>
              View as {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}
