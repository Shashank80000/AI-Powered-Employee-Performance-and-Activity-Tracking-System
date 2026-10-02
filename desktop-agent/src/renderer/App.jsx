import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import StatusPage from './pages/StatusPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

/**
 * Root: LoginPage until an employee is signed in; then OnboardingPage until they accepted
 * consent; then StatusPage (with SettingsPage reachable from it).
 */
export default function App() {
  const agent = window.agent;
  const [status, setStatus] = useState(null);
  const [page, setPage] = useState('status');

  useEffect(() => {
    if (!agent) return undefined;
    let alive = true;
    agent.getStatus().then((res) => {
      if (alive && res?.status) setStatus(res.status);
    });
    const unsubscribe = agent.onStatus((s) => setStatus(s));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [agent]);

  // After withdrawal (or sign-out) the next accepted session starts on the status view.
  const accepted = Boolean(status?.user && status?.consent?.acceptedAt);
  useEffect(() => {
    if (!accepted) setPage('status');
  }, [accepted]);

  if (!agent) {
    return (
      <main className="shell">
        <p className="error">This page must be opened inside the WorkPlus Agent desktop app.</p>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="shell">
        <p className="muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="brand">
        <span className="brand-dot" aria-hidden="true" />
        <span>WorkPlus Agent</span>
      </header>
      {!status.user ? (
        <LoginPage status={status} onStatus={setStatus} />
      ) : !status.consent?.acceptedAt ? (
        <OnboardingPage key={status.user.id} status={status} onStatus={setStatus} />
      ) : page === 'settings' ? (
        <SettingsPage status={status} onStatus={setStatus} onBack={() => setPage('status')} />
      ) : (
        <StatusPage status={status} onStatus={setStatus} onOpenSettings={() => setPage('settings')} />
      )}
    </main>
  );
}
