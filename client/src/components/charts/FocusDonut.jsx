import { formatHours } from '../../utils/formatters.js';

const SEGMENTS = [
  { key: 'focusedSeconds', label: 'Focused work', color: 'teal', hex: '#2c9a8f' },
  { key: 'otherActiveSeconds', label: 'Other active time', color: 'amber', hex: '#d5a145' },
  { key: 'idleSeconds', label: 'Idle time', color: 'coral', hex: '#e38270' }
];

export default function FocusDonut({ focus }) {
  const total = SEGMENTS.reduce((sum, { key }) => sum + focus[key], 0);
  let cursor = 0;
  const stops = SEGMENTS.map(({ key, hex }) => {
    const start = cursor;
    cursor += total ? (focus[key] / total) * 100 : 0;
    return `${hex} ${start}% ${cursor}%`;
  });

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: total ? `conic-gradient(${stops.join(', ')})` : '#edf0eb' }}>
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
