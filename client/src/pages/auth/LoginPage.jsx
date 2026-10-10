import { Building2, Sparkles, User, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { getDemoInfo } from '../../services/authService.js';
import { ROLE_HOME, ROLE_LABELS } from '../../utils/constants.js';

const DEMO_ICONS = { admin: Building2, manager: Users, employee: User };

export default function LoginPage() {
  const { user, login, loginDemo } = useAuth();
  const [demoRoles, setDemoRoles] = useState([]);

  useEffect(() => {
    getDemoInfo().then((info) => setDemoRoles(info.enabled ? info.roles : []));
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  async function explore(role) {
    setBusy(true);
    setError(null);
    try {
      const signedIn = await loginDemo(role);
      navigate(ROLE_HOME[signedIn.role], { replace: true });
    } catch (demoError) {
      setError(demoError);
      setBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await login(email, password);
      const home = ROLE_HOME[signedIn.role];
      const from = location.state?.from;
      navigate(from?.startsWith(home) ? from : home, { replace: true });
    } catch (loginError) {
      setError(loginError);
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
        <h1>Sign in</h1>
        <p className="muted">Use the work email and password your administrator gave you. First time here? You will be asked to choose your own password.</p>

        <label>
          Work email
          <input type="email" required autoComplete="username" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error.status === 401 ? 'The email or password is not correct, or the account is deactivated. Check them and try again.' : error.message}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-help">
          Forgot your password? Ask your administrator to reset it. New to WorkPlus? Read the <Link to="/help">user guide</Link>.
        </p>

        {demoRoles.length > 0 && (
          <section className="demo-explore" aria-labelledby="demo-heading">
            <h2 id="demo-heading">Or explore the demo</h2>
            <p className="muted">No password needed. Sample data for a team of four.</p>
            {demoRoles.map(({ role, description }) => {
              const Icon = DEMO_ICONS[role];
              return (
                <button type="button" key={role} className="demo-role" disabled={busy} onClick={() => explore(role)}>
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    <strong>Explore as {ROLE_LABELS[role]}</strong>
                    <span>{description}</span>
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </form>
    </div>
  );
}
