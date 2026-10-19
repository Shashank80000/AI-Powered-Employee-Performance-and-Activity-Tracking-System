import { Check, Circle, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PasswordField from '../../components/common/PasswordField.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getSetupStatus } from '../../services/authService.js';
import { ROLE_HOME } from '../../utils/constants.js';
import { errorMessage } from '../../utils/formatters.js';
import { PASSWORD_RULES, passwordProblem } from '../../utils/password.js';

/** First run only: the first visitor creates the administrator account. Closed for good once an administrator exists. */
export default function SetupPage() {
  const { user, setupAdmin } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ loading: true });
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Set when this page just created the admin, so the redirect below carries the welcome message.
  const created = useRef(false);
  // Editing a field clears the last error, so a message never outlives the problem it describes.
  const change = (patch) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setError(null);
  };

  useEffect(() => {
    getSetupStatus()
      .then(({ needed }) => setStatus({ needed }))
      .catch((statusError) => setStatus({ error: statusError }));
  }, []);

  // Already signed in (or just created): straight to that person's dashboard.
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace state={created.current ? { welcome: true } : undefined} />;
  if (status.needed === false) return <Navigate to="/login" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = passwordProblem(form.password) ?? (form.password !== form.confirm ? 'The two passwords do not match' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      created.current = true;
      // Signing in re-renders this page, and the redirect above takes the new admin to their dashboard.
      await setupAdmin({ name: form.name.trim(), email: form.email.trim(), password: form.password });
    } catch (setupError) {
      created.current = false;
      // Someone else finished setup first: there is nothing left to create.
      if (setupError.status === 409) return navigate('/login', { replace: true });
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
        {status.loading || status.error ? (
          <StatusMessage loading={status.loading} error={status.error} />
        ) : (
          <>
            <p className="muted">
              Welcome! This site has no administrator yet. Create your own administrator account. You can then add managers and employees. This page
              closes as soon as the account exists.
            </p>
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
              {busy ? 'Creating your account…' : 'Create administrator and sign in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
