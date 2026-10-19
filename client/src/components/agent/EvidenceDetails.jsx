import { formatTime } from '../../utils/formatters.js';

const STATUS_LABELS = { todo: 'to do', 'in-progress': 'in progress', review: 'in review', done: 'done' };

/** "2026-10-14" -> "14 Oct", without shifting the day through a time zone. */
export function formatDay(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  if (!year || !month || !day) return String(key);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** A fact's value as people read it; null means the records can't support a number. */
export function formatFactValue(fact) {
  if (fact.value === null || fact.value === undefined) return 'Not enough data';
  if (typeof fact.value !== 'number') return String(fact.value);
  if (fact.id.includes('trend.') && fact.comparable) {
    const unit = fact.unit === 'percentage points' ? '%' : '';
    return `${fact.previous}${unit} → ${fact.current}${unit}`;
  }
  const units = { '%': '%', hours: ' h', minutes: ' min' };
  return `${fact.value}${units[fact.unit] ?? (fact.unit ? ` ${fact.unit}` : '')}`;
}

function describeRecord(record) {
  if (record.title !== undefined) {
    const parts = [STATUS_LABELS[record.status] ?? record.status];
    if (record.due) parts.push(`due ${formatDay(record.due)}`);
    if (record.completed) parts.push(`completed ${formatDay(record.completed)}`);
    return { title: record.title, detail: parts.join(' · ') };
  }
  const signIn = record.signIn ? `${formatDay(record.signIn.slice(0, 10))} ${formatTime(record.signIn)}` : 'no sign-in time';
  return { title: `Sign-in ${signIn}`, detail: record.signOut ? `signed out ${formatTime(record.signOut)}` : 'no sign-out recorded' };
}

/** The facts a statement cites, with the records behind them. Collapsed until asked for. */
export default function EvidenceDetails({ factIds, factById }) {
  const facts = factIds.map((id) => factById.get(id)).filter(Boolean);
  if (!facts.length) return null;
  return (
    <details className="evidence">
      <summary>Evidence ({facts.length})</summary>
      <ul>
        {facts.map((fact) => (
          <li key={fact.id}>
            <span className="evidence-label">{fact.label}</span>
            <strong>{formatFactValue(fact)}</strong>
            {fact.note && <small>{fact.note}</small>}
            {fact.evidence?.length > 0 && (
              <ul className="evidence-records">
                {fact.evidence.map((record) => {
                  const { title, detail } = describeRecord(record);
                  return (
                    <li key={record.id}>
                      {title} <span>{detail}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
