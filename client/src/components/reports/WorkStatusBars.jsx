import { WORK_STATUSES } from '../../utils/constants.js';
import { formatMinutes } from '../../utils/formatters.js';

const ORDER = ['working', 'entertainment', 'not_working'];

/** Working / entertainment / not working minutes, as bars (rule: server/src/utils/workStatus.js). */
export default function WorkStatusBars({ statusMinutes }) {
  const rows = ORDER.map((key) => [key, statusMinutes?.[key] ?? 0]);
  const total = rows.reduce((sum, [, minutes]) => sum + minutes, 0);
  const top = Math.max(...rows.map(([, minutes]) => minutes));
  if (!total) return <p className="muted">No screenshots could be labelled as working, entertainment or not working.</p>;
  return (
    <ul className="app-usage">
      {rows.map(([key, minutes]) => (
        <li key={key}>
          <span>{WORK_STATUSES[key].label}</span>
          <span className="muted">{Math.round((minutes / total) * 100)}%</span>
          <div className="progress progress-wide" role="presentation">
            <span className={`bar-${WORK_STATUSES[key].tone}`} style={{ width: `${top ? (minutes / top) * 100 : 0}%` }} />
          </div>
          <strong>{formatMinutes(minutes)}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Small chip for one screenshot; nothing when its status is unknown. */
export function WorkStatusChip({ status }) {
  const info = WORK_STATUSES[status];
  if (!info) return null;
  return <span className={`category-chip chip-${info.tone}`}>{info.label}</span>;
}
