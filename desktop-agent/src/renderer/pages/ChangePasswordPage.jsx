import { useState } from 'react';

/**
 * Shown after signing in with the temporary password the administrator created. The server
 * accepts nothing else until the person chooses their own; after that the agent continues
 * like a normal sign-in (choose what to share, then tracking starts).
 */
export default function ChangePasswordPage({ status, onStatus }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const person = status.passwordChange;

  async function submit(e) {
    e.preventDefault();
    // Same rules as the server and the website, checked here only to save a round trip.
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      setError('Use at least 8 characters, with a letter and a number.');
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await window.agent.changePassword(current, next);
      if (res?.status) onStatus(res.status);
      if (!res?.ok) setError(res?.error || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>Choose your own password</h1>
      <p className="muted small">
        {person.name} ({person.email}), you signed in with a temporary password from your administrator. Choose a
        password only you know. Use it here and on the WorkPlus website.
      </p>
      <label htmlFor="current">Temporary password</label>
      <input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      <label htmlFor="next">New password</label>
      <input id="next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
      <label htmlFor="confirm">Confirm new password</label>
      <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <p className="muted small">At least 8 characters, with a letter and a number.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Saving...' : 'Save password and continue'}
      </button>
      <button type="button" className="ghost" disabled={busy} onClick={() => window.agent.logout().then((res) => res?.status && onStatus(res.status))}>
        Sign out
      </button>
    </form>
  );
}
