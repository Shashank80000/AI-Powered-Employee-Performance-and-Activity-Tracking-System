import { Check, Circle, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PasswordField from '../../components/common/PasswordField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_HOME } from '../../utils/constants.js';
import { errorMessage } from '../../utils/formatters.js';
import { PASSWORD_RULES, passwordProblem } from '../../utils/password.js';

/** Registration: anyone creates an administrator account with its own organization (a separate workspace). */
export default function SetupPage() {
  const { user, setupAdmin } = useAuth();
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Set when this page just created the admin, so the redirect below carries the welcome message.
  const created = useRef(false);
  // Editing a field clears the last error, so a message never outlives the problem it describes.
  const change = (patch) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setError(null);
  };

  // Already signed in (or just registered): straight to that person's dashboard.
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace state={created.current ? { welcome: true } : undefined} />;

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = passwordProblem(form.password) ?? (form.password !== form.confirm ? 'The two passwords do not match' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      created.current = true;
      // Signing in re-renders this page, and the redirect above takes the new admin to their dashboard.
      await setupAdmin({ organizationName: form.organizationName.trim(), name: form.name.trim(), email: form.email.trim(), password: form.password });
    } catch (setupError) {
      created.current = false;
      setError(errorMessage(setupError));
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand-row auth-brand">
          <div className="brand-mark">
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>workplus</strong>
            <span>performance OS</span>
          </div>
        </div>
        <h1>Create Your Administrator Account</h1>
        <p className="muted">
          Set up WorkPlus for your organization. You become its administrator and can then add managers and employees. Your organization&apos;s
          data is separate: no one else can see it.
        </p>
        <label>
          Organization name
          <input
            required
            minLength={2}
            maxLength={80}
            autoComplete="organization"
            placeholder="Your company or team"
            value={form.organizationName}
            onChange={(event) => change({ organizationName: event.target.value })}
          />
        </label>
        <label>
          Full name
          <input required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={(event) => change({ name: event.target.value })} />
        </label>
        <label>
          Email address
          <input type="email" required autoComplete="username" placeholder="name@company.com" value={form.email} onChange={(event) => change({ email: event.target.value })} />
        </label>
        <PasswordField label="Password" value={form.password} onChange={(password) => change({ password })} />
        <ul className="password-rules" aria-label="Password requirements">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(form.password);
            return (
              <li key={rule.label} className={met ? 'met' : undefined}>
                {met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
                {rule.label}
                <span className="visually-hidden">{met ? ' (done)' : ' (not yet)'}</span>
              </li>
            );
          })}
        </ul>
        <PasswordField label="Confirm password" value={form.confirm} onChange={(confirm) => change({ confirm })} />
        {form.confirm && form.confirm !== form.password && <small className="field-help field-warning">The passwords do not match yet.</small>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Creating your account…' : 'Create administrator account'}
        </button>
        <p className="muted auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
