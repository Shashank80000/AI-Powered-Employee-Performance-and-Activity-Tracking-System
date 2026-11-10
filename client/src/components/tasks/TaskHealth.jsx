import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import PanelHeader from '../common/PanelHeader.jsx';
import StatusMessage from '../common/StatusMessage.jsx';

const SEVERITY = {
  critical: { label: 'Critical', tone: 'coral' },
  warning: { label: 'Warning', tone: 'amber' },
  info: { label: 'Note', tone: 'blue' }
};
const ATTENTION = { assignee: 'Assignee', reviewer: 'Reviewer', admin: 'Records' };
const PAGE_SIZE = 8;

/** Readable evidence: "daysLate" -> "Days late", ISO times -> local date and time. */
function evidenceRows(evidence) {
  return Object.entries(evidence ?? {}).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').toLowerCase();
    let shown = value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) shown = new Date(value).toLocaleString();
    else if (typeof value === 'boolean') shown = value ? 'yes' : 'no';
    else if (value === null) shown = 'none';
    return [label.charAt(0).toUpperCase() + label.slice(1), String(shown)];
  });
}

/** Map of task id -> its flags, for the task list and the task details. */
export function flagsByTask(health) {
  const map = new Map();
  for (const flag of health?.flags ?? []) map.set(flag.taskId, [...(map.get(flag.taskId) ?? []), flag]);
  return map;
}

/** Small chips for a task row. "Overdue" is left out: the status badge already shows it (same definition). */
export function TaskFlagChips({ flags }) {
  const shown = (flags ?? []).filter((flag) => flag.rule !== 'overdue');
  if (!shown.length) return null;
  return (
    <span className="badge-row task-flag-chips">
      {shown.map((flag) => (
        <span key={flag.rule} className={`category-chip chip-${SEVERITY[flag.severity]?.tone ?? 'neutral'}`} title={flag.message}>
          {flag.title}
        </span>
      ))}
    </span>
  );
}

/** One flag: what rule fired, why (the message) and the numbers behind it. */
function FlagItem({ flag, onOpen, canOpen, showTask, reviewer }) {
  // A task whose assignee no longer exists isn't in the task list, so it has no details to open.
  const openable = Boolean(onOpen) && (canOpen ? canOpen(flag.taskId) : true);
  const severity = SEVERITY[flag.severity] ?? SEVERITY.info;
  return (
    <li className="health-item">
      <div className="health-item-head">
        <span className={`category-chip chip-${severity.tone}`}>{severity.label}</span>
        <strong>{flag.title}</strong>
        {reviewer && <span className="health-who">For: {ATTENTION[flag.attention] ?? flag.attention}</span>}
      </div>
      {showTask && (
        <p className="health-task">
          {openable ? <button className="link-button" onClick={() => onOpen(flag.taskId)}>{flag.taskTitle}</button> : <b>{flag.taskTitle}</b>}
          {reviewer && flag.assigneeName && <span> · {flag.assigneeName}</span>}
        </p>
      )}
      <p>{flag.message}</p>
      <details className="evidence">
        <summary>Rule and numbers</summary>
        <ul>
          <li><span className="evidence-label">Rule</span>{flag.rule}</li>
          {evidenceRows(flag.evidence).map(([label, value]) => (
            <li key={label}><span className="evidence-label">{label}</span>{value}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * "Task health" panel: every task that is not on track, worst first, from the server's fixed rules.
 * `reviewer` (managers and admins) shows the assignee and who is expected to act.
 */
export default function TaskHealthPanel({ health, reviewer, onOpen, canOpen }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const { data, loading, error, reload } = health;
  const flags = data?.flags ?? [];
  const summary = data?.summary;

  return (
    <article className="panel section-gap task-health" aria-live="polite">
      <PanelHeader
        title="Task health"
        subtitle={
          reviewer
            ? 'Open tasks checked against fixed rules: overdue, due soon, no recent progress, waiting for review, over the estimate, repeated changes and record problems.'
            : 'Your tasks checked against fixed rules, so you can see what needs attention first.'
        }
      />
      <StatusMessage loading={loading && !data} error={error} onRetry={reload} />
      {summary && (
        <>
          <p className="health-summary">
            {summary.flaggedTasks === 0 ? (
              <><CheckCircle2 size={16} aria-hidden="true" className="agent-icon" /> All {summary.openTasks} open task{summary.openTasks === 1 ? '' : 's'} are on track.</>
            ) : (
              <>
                <ShieldAlert size={16} aria-hidden="true" className="health-alert-icon" />
                {summary.flaggedTasks} of {summary.tasksChecked} task{summary.tasksChecked === 1 ? '' : 's'} need attention
                <span className="badge-row">
                  {Object.entries(SEVERITY).map(([key, { label, tone }]) =>
                    summary.bySeverity[key] ? <span key={key} className={`category-chip chip-${tone}`}>{summary.bySeverity[key]} {label.toLowerCase()}</span> : null
                  )}
                </span>
              </>
            )}
          </p>
          {flags.length > 0 && (
            <ul className="agent-list health-list">
              {flags.slice(0, shown).map((flag) => (
                <FlagItem key={`${flag.taskId}-${flag.rule}`} flag={flag} onOpen={onOpen} canOpen={canOpen} showTask reviewer={reviewer} />
              ))}
            </ul>
          )}
          {flags.length > shown && (
            <button className="secondary-button show-more" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, flags.length - shown)} more of {flags.length - shown}
            </button>
          )}
          <p className="report-small muted">
            Checked {new Date(data.generatedAt).toLocaleString()}. Review delays are the reviewer&apos;s step and never count against the employee.
          </p>
        </>
      )}
    </article>
  );
}

/** The flags of one task, for the task details dialog. */
export function TaskHealthSection({ flags, reviewer }) {
  if (!flags?.length) return null;
  return (
    <section className="task-section">
      <h3>Task health</h3>
      <ul className="agent-list health-list">
        {flags.map((flag) => <FlagItem key={flag.rule} flag={flag} reviewer={reviewer} />)}
      </ul>
    </section>
  );
}
