/** Coloured badge describing whether tracking is running, idle, paused or stopped. */
export default function StatusIndicator({ tracking, isIdle }) {
  const state = tracking === 'tracking' && isIdle ? 'idle' : tracking;
  const label = {
    tracking: 'Tracking active',
    idle: 'Tracking active - you are idle',
    paused: 'Tracking paused',
    stopped: 'Not tracking',
  }[state] ?? 'Not tracking';

  return (
    <div className={`indicator indicator-${state}`} role="status" aria-live="polite">
      <span className="indicator-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
