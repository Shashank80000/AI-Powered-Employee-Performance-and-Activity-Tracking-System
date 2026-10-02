import { useState } from 'react';

const STATUS_LABELS = {
  granted: 'Granted',
  denied: 'Denied',
  'not-determined': 'Not asked yet',
  restricted: 'Blocked by system policy',
  unknown: 'Not confirmed yet',
  unsupported: 'Not supported',
  'needs-settings': 'Finish in System Settings',
};

const ITEMS = {
  keyboard: {
    label: 'Keyboard activity count',
    macHint: 'macOS: turn on WorkPlus Agent under Privacy & Security > Input Monitoring, then quit and reopen the agent.',
  },
  apps: { label: 'App names', macHint: 'No permission needed: only the app name is read.' },
  screenshots: {
    label: 'Screenshots',
    macHint: 'macOS: allow WorkPlus Agent under Privacy & Security > Screen Recording. macOS may ask you to reopen the agent.',
  },
  notifications: { label: 'Screenshot notifications', macHint: 'macOS asks the first time a notification is shown.' },
};

/**
 * Live OS permission status for each data type the person enabled, with Grant / Re-check.
 * Disabled data types are not listed and never requested.
 */
export default function PermissionList({ choices, permissions, platform, onStatus }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const kinds = [
    choices.keyboard && 'keyboard',
    choices.apps && 'apps',
    choices.screenshots && 'screenshots',
    choices.screenshots && 'notifications',
  ].filter(Boolean);

  async function run(key, fn) {
    setBusy(key);
    setError('');
    try {
      const res = await fn();
      if (res?.status) onStatus(res.status);
      if (res && !res.ok) setError(res.error || 'Could not check permissions.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="permissions">
      <div className="perm-row">
        <span>
          <span className="name">Activity time</span>
          <span className="toggle-help">No permission needed.</span>
        </span>
        <span className="perm-status perm-granted">Ready</span>
      </div>

      {kinds.map((kind) => {
        const p = permissions?.[kind] ?? { status: 'unknown', canRequest: false };
        const item = ITEMS[kind];
        return (
          <div className="perm-row" key={kind}>
            <span>
              <span className="name">{item.label}</span>
              {platform === 'darwin' && p.status !== 'granted' && p.status !== 'unsupported' && <span className="toggle-help">{item.macHint}</span>}
              {p.reason && <span className="toggle-help">{p.reason}</span>}
            </span>
            <span className="perm-actions">
              <span className={`perm-status perm-${p.status}`}>{STATUS_LABELS[p.status] ?? p.status}</span>
              {p.canRequest && p.status !== 'granted' && (
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => run(kind, () => window.agent.requestPermission(kind))}
                >
                  {busy === kind ? '...' : 'Grant'}
                </button>
              )}
            </span>
          </div>
        );
      })}

      <button
        type="button"
        className="ghost"
        disabled={Boolean(busy)}
        onClick={() => run('recheck', () => window.agent.getPermissions())}
      >
        {busy === 'recheck' ? 'Checking...' : 'Re-check'}
      </button>
      {choices.screenshots && permissions?.screenshots && permissions.screenshots.status !== 'granted' && (
        <p className="muted small">No screenshots are taken until screen capture is granted.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
