import { useState } from 'react';
import ConsentToggles from '../components/ConsentToggles.jsx';
import PermissionList from '../components/PermissionList.jsx';

/** Change what is shared (applied live), check permissions, or withdraw consent entirely. */
export default function SettingsPage({ status, onStatus, onBack }) {
  const [choices, setChoices] = useState(() => ({
    keyboard: Boolean(status.consent?.keyboard),
    apps: Boolean(status.consent?.apps),
    screenshots: Boolean(status.consent?.screenshots),
    managerViewScreenshots: Boolean(status.consent?.managerViewScreenshots),
  }));
  const needsManagerAgreement = choices.screenshots && !choices.managerViewScreenshots;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const intervalMinutes = Math.round((status.screenshots?.intervalSeconds ?? 300) / 60);

  const dirty =
    choices.keyboard !== Boolean(status.consent?.keyboard) ||
    choices.apps !== Boolean(status.consent?.apps) ||
    choices.screenshots !== Boolean(status.consent?.screenshots) ||
    choices.managerViewScreenshots !== Boolean(status.consent?.managerViewScreenshots);

  async function call(fn) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const res = await fn();
      if (res?.status) onStatus(res.status);
      if (res && !res.ok) setError(res.error || 'Something went wrong.');
      return res;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const res = await call(() => window.agent.saveConsent(choices));
    if (res?.ok) setSaved(true);
  }

  async function withdraw() {
    const sure = window.confirm(
      'Withdraw consent and stop tracking? Nothing more will be collected and screenshots not yet uploaded are deleted. You will be asked again before tracking can restart.',
    );
    if (sure) await call(() => window.agent.withdrawConsent());
  }

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h1>Settings</h1>
          <button type="button" className="ghost" disabled={busy} onClick={onBack}>
            Back
          </button>
        </div>
        <h2>What you share</h2>
        <ConsentToggles value={choices} onChange={setChoices} disabled={busy} intervalMinutes={intervalMinutes} capabilities={status.osSupport} />
        {needsManagerAgreement && <p className="muted small">Tick the manager agreement to turn screenshots on.</p>}
        <button type="button" disabled={busy || !dirty || needsManagerAgreement} onClick={save}>
          {busy ? 'Saving...' : 'Save'}
        </button>
        {saved && <p className="muted small">Saved. Your choices now apply.</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="card">
        <h2>Permissions</h2>
        <PermissionList
          choices={choices}
          permissions={status.permissions}
          platform={status.platform}
          onStatus={onStatus}
        />
      </section>

      {status.autoStart?.supported && (
        <section className="card">
          <h2>Start at login</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={Boolean(status.autoStart.enabled)}
              disabled={busy}
              onChange={(e) => call(() => window.agent.setAutoStart(e.target.checked))}
            />
            <span>
              <span className="toggle-title">Open WorkPlus when I sign in to this computer</span>
              <span className="toggle-help">It opens in the {status.osSupport?.trayReliable === false ? 'taskbar (minimised)' : 'tray'} and tracks only what you chose above.</span>
            </span>
          </label>
        </section>
      )}

      <section className="card">
        <h2>Withdraw consent</h2>
        <p className="muted small">
          Stops all tracking on this computer, deletes screenshots that were not uploaded yet, and tells the server
          you withdrew consent.
        </p>
        <button type="button" className="danger" disabled={busy} onClick={withdraw}>
          Withdraw consent and stop tracking
        </button>
      </section>
    </>
  );
}
