import { useState } from 'react';
import PrivacyNotice from '../components/PrivacyNotice.jsx';

/** Employee sign-in. Tracking starts only after a successful employee login. */
export default function LoginPage({ status, onStatus }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await window.agent.login(email, password);
      if (res?.status) onStatus(res.status);
      if (!res?.ok) setError(res?.error || 'Sign-in failed.');
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted small">Use your employee account. Tracking starts after you sign in.</p>
        {status.authError && <p className="warning">{status.authError}</p>}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="muted small">Server: {status.apiBaseUrl}</p>
      </form>
      <PrivacyNotice />
    </>
  );
}
