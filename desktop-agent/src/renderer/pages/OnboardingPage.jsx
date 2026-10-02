import { useState } from 'react';
import ConsentToggles from '../components/ConsentToggles.jsx';
import PermissionList from '../components/PermissionList.jsx';

const STEPS = ['What WorkPlus does', 'Choose what to share', 'Grant permissions'];

/**
 * First-launch consent wizard (shown after sign-in while consent.acceptedAt is null).
 * Nothing is collected until the person presses "Start tracking".
 */
export default function OnboardingPage({ status, onStatus }) {
  const [step, setStep] = useState(0);
  const caps = status.osSupport;
  const can = (key) => caps?.[key]?.supported !== false;
  const [choices, setChoices] = useState(() => ({
    keyboard: (status.consent?.keyboard ?? true) && can('keyboard'),
    apps: (status.consent?.apps ?? true) && can('apps'),
    screenshots: (status.consent?.screenshots ?? false) && can('screenshots'),
    managerViewScreenshots: false, // always asked explicitly
  }));
  const needsManagerAgreement = choices.screenshots && !choices.managerViewScreenshots;
  const [autoStart, setAutoStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const intervalMinutes = Math.round((status.screenshots?.intervalSeconds ?? 300) / 60);

  async function call(fn) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (res?.status) onStatus(res.status);
      if (res && !res.ok) setError(res.error || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="row spread">
          <span className="muted small">
            Step {step + 1} of {STEPS.length}
          </span>
          <button type="button" className="ghost" disabled={busy} onClick={() => call(() => window.agent.logout())}>
            Sign out
          </button>
        </div>
        <h1>{STEPS[step]}</h1>

        {step === 0 && (
          <div className="prose">
            <p>
              Hi {status.user?.name?.split(' ')[0] || 'there'}. WorkPlus Agent measures how your working time is
              spent so you and your manager can see workload and focus trends. Before anything starts, you decide what
              it may collect.
            </p>
            <h2>Who sees what</h2>
            <ul>
              <li>
                <strong>Your manager</strong> sees your totals and categories (for example active hours and time per
                app category). <strong>If you turn screenshots on, your manager and administrators can also open
                your screenshots.</strong>
              </li>
              <li>
                <strong>You</strong> can see every screenshot, delete any of them, and see exactly who opened each one
                and when, in the web dashboard. Every screenshot is deleted automatically{' '}
                {status.screenshotRetentionDays ?? 3} days after it was taken, and turning screenshots off deletes them all.
              </li>
              <li>
                WorkPlus never records which keys you press, what you type, window titles, documents or website
                URLs.
              </li>
            </ul>
            <p className="muted small">
              You can pause tracking, change these choices, or withdraw consent at any time from the agent.
            </p>
          </div>
        )}

        {step === 1 && (
          <ConsentToggles value={choices} onChange={setChoices} disabled={busy} intervalMinutes={intervalMinutes} capabilities={caps} />
        )}

        {step === 2 && (
          <>
            <p className="muted small">
              Your computer may need to allow the items you chose. Items you turned off are not requested.
            </p>
            <PermissionList
              choices={choices}
              permissions={status.permissions}
              platform={status.platform}
              onStatus={onStatus}
            />
            {status.autoStart?.supported && (
              <label className="toggle">
                <input type="checkbox" checked={autoStart} disabled={busy} onChange={(e) => setAutoStart(e.target.checked)} />
                <span>
                  <span className="toggle-title">Open WorkPlus when I sign in to this computer</span>
                  <span className="toggle-help">Tracking still only runs with the choices above, and you can turn this off in Settings.</span>
                </span>
              </label>
            )}
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="row spread">
          <button
            type="button"
            className="ghost"
            disabled={busy || step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" disabled={busy || (step === 1 && needsManagerAgreement)} onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? 'I understand, continue' : 'Next'}
            </button>
          ) : (
            <button type="button" disabled={busy || needsManagerAgreement} onClick={() =>
                call(async () => {
                  const res = await window.agent.saveConsent(choices);
                  if (res?.ok && status.autoStart?.supported) await window.agent.setAutoStart(autoStart);
                  return res;
                })
              }
            >
              {busy ? 'Starting...' : 'Start tracking'}
            </button>
          )}
        </div>
      </section>
      {status.notice && <p className="warning small">{status.notice}</p>}
    </>
  );
}
