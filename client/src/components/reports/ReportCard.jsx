import { Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatDate } from '../../utils/formatters.js';

const TREND = { up: TrendingUp, down: TrendingDown, flat: Minus };

export default function ReportCard({ report }) {
  const TrendIcon = TREND[report.trend] ?? Minus;
  return (
    <article className="panel report-card">
      <header className="report-header">
        <div>
          <h3>{report.employeeName}</h3>
          <p>
            {formatDate(report.periodStart)} – {formatDate(report.periodEnd, { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="report-score">
          <strong>{report.score ?? '—'}</strong>
          <span className={`trend trend-${report.trend}`}>
            <TrendIcon size={14} aria-hidden="true" /> {report.trend}
          </span>
        </div>
      </header>

      <p className="report-summary">{report.summary}</p>

      {report.highlights?.length > 0 && (
        <>
          <h4>Highlights</h4>
          <ul>{report.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
      {report.recommendations?.length > 0 && (
        <>
          <h4>Recommendations</h4>
          <ul>{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}

      <footer className="report-footer">
        <Sparkles size={13} aria-hidden="true" />
        <span>
          {report.source === 'ai-service' ? 'AI-generated' : 'Basic summary'} · {report.disclaimer}
        </span>
      </footer>
    </article>
  );
}
