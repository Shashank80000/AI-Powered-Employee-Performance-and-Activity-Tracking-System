import { Download, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTracking, setTracking } from '../../services/trackingService.js';

const POLL_MS = 15000;

function describe(tracking) {
  if (!tracking) return { label: 'Checking…', tone: 'none' };
  if (tracking.state === 'paused') return { label: tracking.changedBy === 'agent' ? 'Paused in the desktop agent' : 'Tracking paused', tone: 'paused' };
  if (tracking.state === 'stopped') return { label: 'Tracking off', tone: 'paused' };
  if (!tracking.consentGiven) return { label: 'Finish setup in the desktop agent', tone: 'warning' };
  if (!tracking.agentConnected) return { label: 'Desktop agent not running', tone: 'warning' };
  return { label: 'Tracking on', tone: 'active' };
}

/** Shows whether the desktop agent is tracking, and lets the employee pause or resume it. */
export default function TrackingControl() {
  const [tracking, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getTracking()
        .then((value) => alive && setState(value))
        .catch(() => {});
    load();
    // The agent can pause too, so keep this in step with it.
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      setState(await setTracking(tracking?.state === 'active' ? 'paused' : 'active'));
    } catch (toggleError) {
      setError(toggleError);
    } finally {
      setBusy(false);
    }
  }

  const { label, tone } = describe(tracking);
  const active = tracking?.state === 'active';

  return (
    <div className={`tracking-control tracking-${tone}`} role="status" title={error?.message}>
      <span className="tracking-dot" aria-hidden="true" />
      <span className="tracking-label">{label}</span>
      {tone === 'warning' && (
        <Link className="tracking-button" to="/download" title="Download the desktop agent">
          <Download size={13} aria-hidden="true" /> Get the agent
        </Link>
      )}
      {tracking && (
        <button type="button" className="tracking-button" onClick={toggle} disabled={busy}>
          {active ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {active ? 'Pause' : 'Resume'}
        </button>
      )}
    </div>
  );
}
