import { useState } from 'react';
import { formatDate } from '../../utils/formatters.js';

const WIDTH = 700;
const HEIGHT = 180;

/** Line + area chart of daily scores (0–100), with a crosshair and tooltip on hover or keyboard focus. */
export default function ProductivityChart({ points }) {
  // Position in `points` of the highlighted day; the point objects are rebuilt on every render.
  const [activeIndex, setActiveIndex] = useState(null);
  // Days with no tracked time have a null score and are skipped, not drawn as 0.
  const tracked = points.map((point, index) => ({ ...point, index })).filter((point) => point.score !== null);
  if (tracked.length === 0) return <p className="muted">No tracked activity in this period.</p>;

  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = tracked.map((point) => [point.index * step, HEIGHT - (point.score / 100) * HEIGHT]);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} V${HEIGHT} H${coords[0][0].toFixed(1)}Z`;
  const labelEvery = Math.ceil(points.length / 7);
  const description = tracked.map((point) => `${formatDate(point.date)}: ${point.score}%`).join(', ');
  const active = tracked.find((point) => point.index === activeIndex) ?? null;
  const position = (point) => ({ left: `${points.length > 1 ? (point.index / (points.length - 1)) * 100 : 0}%`, top: `${100 - point.score}%` });

  // The nearest tracked day to the pointer, so the hit area is the whole plot, not the 2px line.
  function handlePointer(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - box.left) / box.width) * (points.length - 1));
    setActiveIndex(tracked.reduce((best, point) => (Math.abs(point.index - index) < Math.abs(best.index - index) ? point : best)).index);
  }
  function handleKey(event) {
    const current = tracked.findIndex((point) => point.index === activeIndex);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = event.key === 'ArrowRight' ? Math.min(current + 1, tracked.length - 1) : Math.max(current - 1, 0);
      setActiveIndex(tracked[current === -1 ? tracked.length - 1 : next].index);
    }
  }

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
              <stop offset="0%" className="chart-area-fill" stopOpacity=".18" />
              <stop offset="100%" className="chart-area-fill" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#chartFill)" />
          {coords.length === 1 && <circle cx={coords[0][0]} cy={coords[0][1]} r="4" className="chart-point" />}
          <path d={line} className="chart-line" vectorEffect="non-scaling-stroke" />
        </svg>
        <div
          className="chart-hover"
          tabIndex={0}
          aria-label="Chart details: use the left and right arrow keys to read each day"
          onPointerMove={handlePointer}
          onPointerLeave={() => setActiveIndex(null)}
          onFocus={() => setActiveIndex(tracked[tracked.length - 1].index)}
          onBlur={() => setActiveIndex(null)}
          onKeyDown={handleKey}
        >
          {active && (
            <>
              <span className="chart-crosshair" style={{ left: position(active).left }} />
              <span className="chart-dot" style={position(active)} />
              <span className="chart-tooltip" style={position(active)} role="status">
                <strong>{active.score}%</strong>
                {formatDate(active.date, { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </>
          )}
        </div>
        <div className="chart-x-axis" aria-hidden="true">
          {points.map((point, index) => (
            <span key={point.date}>{index % labelEvery === 0 ? formatDate(point.date, { weekday: 'short' }) : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
