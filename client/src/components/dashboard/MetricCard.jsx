import { formatChange } from '../../utils/formatters.js';

export default function MetricCard({ label, value, change, detail = 'vs. previous period', icon: Icon, tone }) {
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={19} aria-hidden="true" />
      </div>
      <p>{label}</p>
      <div className="metric-value">{value}</div>
      {change !== undefined && (
        <div className="metric-change">
          <span className={`change-${direction}`}>{formatChange(change)}</span> {detail}
        </div>
      )}
    </article>
  );
}
