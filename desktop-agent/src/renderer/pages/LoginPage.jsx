import { useState } from 'react';
import PrivacyNotice from '../components/PrivacyNotice.jsx';

/** Employee sign-in with the account the administrator created. Tracking starts once the person has agreed. */
export default function LoginPage({ status, onStatus }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const [serverInput, setServerInput] = useState('');
  const [serverError, setServerError] = useState('');

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

  async function saveServer(e) {
    e.preventDefault();
    setBusy(true);
    setServerError('');
    try {
      const res = await window.agent.setServerUrl(serverInput);
      if (res?.status) onStatus(res.status);
      if (res?.ok) setEditingServer(false);
      else setServerError(res?.error || 'Could not use that server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted small">
          Use the work email and password your administrator gave you. The first time, you choose your own password
          and what to share; tracking starts after that.
        </p>
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
        {!editingServer && (
          <p className="muted small">
            Server: {status.apiBaseUrl}{' '}
            <button
              type="button"
              className="secondary inline"
              disabled={busy}
              onClick={() => {
                setServerInput(status.apiBaseUrl || '');
                setServerError('');
                setEditingServer(true);
              }}
            >
              Change
            </button>
          </p>
        )}
      </form>
      {editingServer && (
        <form className="card" onSubmit={saveServer}>
          <h2>Server address</h2>
          <p className="muted small">
            Only change this if your administrator gave you a different address, for example http://192.168.1.20:4000
            for a server on your office network. The agent checks the address before using it; a sleeping server can
            take up to a minute to answer.
          </p>
          <label htmlFor="server">Address</label>
          <input id="server" value={serverInput} onChange={(e) => setServerInput(e.target.value)} required />
          {serverError && <p className="error" role="alert">{serverError}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Checking...' : 'Save'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setEditingServer(false)}>
            Cancel
          </button>
        </form>
      )}
      <PrivacyNotice />
    </>
  );
}
