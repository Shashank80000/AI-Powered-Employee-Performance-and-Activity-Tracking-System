import { formatDate } from '../../utils/formatters.js';

const WIDTH = 700;
const HEIGHT = 180;

/** Smooth line + area chart of daily scores (0–100). */
export default function ProductivityChart({ points }) {
  // Days with no tracked time have a null score and are skipped, not drawn as 0.
  const tracked = points.map((point, index) => ({ ...point, index })).filter((point) => point.score !== null);
  if (tracked.length === 0) return <p className="muted">No tracked activity in this period.</p>;

  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = tracked.map((point) => [point.index * step, HEIGHT - (point.score / 100) * HEIGHT]);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} V${HEIGHT} H${coords[0][0].toFixed(1)}Z`;
  const labelEvery = Math.ceil(points.length / 7);
  const description = tracked.map((point) => `${formatDate(point.date)}: ${point.score}%`).join(', ');

  return (
    <div className="chart-area">
      <div className="chart-y-axis" aria-hidden="true">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="chart-main">
        <div className="chart-grid-lines" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`Daily productivity: ${description}`}>
          <defs>
            <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1a9a8b" stopOpacity=".2" />
              <stop offset="100%" stopColor="#1a9a8b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#chartFill)" />
          {coords.length === 1 && <circle cx={coords[0][0]} cy={coords[0][1]} r="4" fill="#168e82" />}
          <path d={line} fill="none" stroke="#168e82" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="chart-x-axis" aria-hidden="true">
          {points.map((point, index) => (
            <span key={point.date}>{index % labelEvery === 0 ? formatDate(point.date, { weekday: 'short' }) : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
