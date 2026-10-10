import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PasswordField from '../../components/common/PasswordField.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getSetupStatus } from '../../services/authService.js';
import { ROLE_HOME } from '../../utils/constants.js';
import { errorMessage } from '../../utils/formatters.js';
import { passwordProblem } from '../../utils/password.js';

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

  useEffect(() => {
    getSetupStatus()
      .then(({ needed }) => setStatus({ needed }))
      .catch((statusError) => setStatus({ error: statusError }));
  }, []);

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
        <h1>Create the administrator</h1>
        {status.loading || status.error ? (
          <StatusMessage loading={status.loading} error={status.error} />
        ) : (
          <>
            <p className="muted">
              Welcome! This site has no administrator yet. Create your own administrator account. You can then add managers and employees. This page
              closes as soon as the account exists.
            </p>
            <label>
              Your full name
              <input required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Work email
              <input type="email" required autoComplete="username" placeholder="name@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <PasswordField label="Password" value={form.password} onChange={(password) => setForm({ ...form, password })} help="At least 8 characters, with a letter and a number." />
            <PasswordField label="Repeat password" value={form.confirm} onChange={(confirm) => setForm({ ...form, confirm })} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy}>
              {busy ? 'Creating…' : 'Create administrator and sign in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
