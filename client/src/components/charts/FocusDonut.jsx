import { formatHours } from '../../utils/formatters.js';

const SEGMENTS = [
  // Validated categorical order (see tokens.css): each segment keeps its colour whatever its size.
  { key: 'focusedSeconds', label: 'Focused work', color: 'teal', fill: 'var(--viz-1)' },
  { key: 'otherActiveSeconds', label: 'Other active time', color: 'blue', fill: 'var(--viz-2)' },
  { key: 'idleSeconds', label: 'Idle time', color: 'amber', fill: 'var(--viz-3)' }
];

export default function FocusDonut({ focus }) {
  const total = SEGMENTS.reduce((sum, { key }) => sum + focus[key], 0);
  let cursor = 0;
  // A thin surface-coloured gap between segments keeps neighbours apart.
  const stops = SEGMENTS.filter(({ key }) => focus[key] > 0).flatMap(({ key, fill }) => {
    const start = cursor;
    cursor += (focus[key] / total) * 100;
    return [`${fill} ${start}% ${Math.max(start, cursor - 0.6)}%`, `var(--color-surface) ${Math.max(start, cursor - 0.6)}% ${cursor}%`];
  });

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: total ? `conic-gradient(${stops.join(', ')})` : 'var(--color-surface-3)' }}>
        <div>
          <strong>{formatHours(total)}</strong>
          <span>tracked</span>
        </div>
      </div>
      <div className="legend">
        {SEGMENTS.map(({ key, label, color }) => (
          <div className="legend-item" key={key}>
            <span className={`legend-dot ${color}`} />
            {label}
            <strong>{total ? Math.round((focus[key] / total) * 100) : 0}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
