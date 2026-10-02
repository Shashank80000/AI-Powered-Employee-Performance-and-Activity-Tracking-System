import { useState } from 'react';
import StatusIndicator from '../components/StatusIndicator.jsx';
import TaskSelector from '../components/TaskSelector.jsx';
import PrivacyNotice from '../components/PrivacyNotice.jsx';

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'never';
}

/**
 * Signed-in view: tracking state, today's totals, current task, pause/resume, the person's
 * current sharing choices and last screenshot (if screenshots are on).
 */
export default function StatusPage({ status, onStatus, onOpenSettings }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { user, tracking, isIdle, today, currentTask, currentTaskSeconds, tasks, sync, capabilities } = status;
  const { consent, permissions, lastScreenshot, screenshotSync, notice } = status;
  const screenshotsOn = Boolean(consent?.screenshots);
  const screenGranted = permissions?.screenshots?.status === 'granted';
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

  const paused = tracking === 'paused';
  // Tracking starts when the employee signs in on the website and stops when they sign out there.
  const webState = status.webControl?.state ?? 'stopped';
  const waitingForWeb = webState === 'stopped';

  return (
    <>
      <section className="card">
        <div className="row spread">
          <div>
            <div className="name">{user.name}</div>
            <div className="muted small">{user.email}</div>
          </div>
          <div className="row">
            <button type="button" className="ghost" disabled={busy} onClick={onOpenSettings}>
              Settings
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => call(() => window.agent.logout())}>
              Sign out
            </button>
          </div>
        </div>

        <StatusIndicator tracking={tracking} isIdle={isIdle} />

        <div className="stats">
          <div className="stat">
            <div className="stat-value">{formatDuration(today?.activeSeconds)}</div>
            <div className="stat-label">Active today</div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatDuration(today?.idleSeconds)}</div>
            <div className="stat-label">Idle today</div>
          </div>
        </div>

        {waitingForWeb ? (
          <p className="callout">
            Waiting for you to sign in on the WorkPlus website. Tracking starts when you sign in there and stops when
            you sign out.
          </p>
        ) : (
          <button
            type="button"
            className={paused ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => call(() => (paused ? window.agent.resume() : window.agent.pause()))}
          >
            {paused ? 'Resume tracking' : 'Pause tracking'}
          </button>
        )}
        {paused && (
          <p className="muted small">
            Paused{status.webControl?.changedBy === 'web' ? ' from the website' : ''}: nothing is being collected right
            now. You can resume here or on the website.
          </p>
        )}
        {notice && <p className="warning small">{notice}</p>}
      </section>

      {screenshotsOn && (
        <section className="card small">
          <div className="row spread">
            <span>
              Screenshots: every {intervalMinutes} min
              {lastScreenshot ? (
                <>
                  {' '}- Last screenshot {formatTime(lastScreenshot.capturedAt)}
                  {lastScreenshot.pending ? ' (not uploaded yet)' : ''}
                </>
              ) : (
                ' - none yet'
              )}
            </span>
            {lastScreenshot && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => call(() => window.agent.deleteLastScreenshot())}
              >
                Delete it
              </button>
            )}
          </div>
          {!screenGranted && (
            <p className="warning">
              Screen capture permission is not granted, so no screenshots are taken. Open Settings to grant it.
            </p>
          )}
          {screenshotSync?.lastError && <p className="warning">Screenshot upload issue: {screenshotSync.lastError}</p>}
          <p className="muted">
            Your manager and administrators can view your screenshots. See who viewed each one, or delete any, in the
            web dashboard. They are deleted automatically after a few days.
          </p>
        </section>
      )}

      <section className="card">
        <TaskSelector
          tasks={tasks}
          currentTask={currentTask}
          disabled={busy}
          onSelect={(id) => call(() => window.agent.setTask(id))}
          onRefresh={() => call(() => window.agent.getStatus({ refreshTasks: true }))}
        />
        {currentTask && (
          <p className="small">
            {formatDuration(currentTaskSeconds)} active on <strong>{currentTask.title}</strong> this session
          </p>
        )}
      </section>

      <section className="card small">
        <div className="row spread">
          <span>Last sync: {formatTime(sync?.lastSyncAt)}</span>
          <span>Queued: {sync?.queued ?? 0}</span>
        </div>
        {sync?.lastError && <p className="warning">Sync issue: {sync.lastError} (will retry)</p>}
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <PrivacyNotice capabilities={capabilities} consent={consent} intervalMinutes={intervalMinutes} />
    </>
  );
}
