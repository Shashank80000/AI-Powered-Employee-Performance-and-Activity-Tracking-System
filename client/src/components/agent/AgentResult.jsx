import { AlertTriangle, CheckCircle2, Clock, ListChecks, LogIn, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { rateAnswer } from '../../services/agentService.js';
import { errorMessage } from '../../utils/formatters.js';
import PanelHeader from '../common/PanelHeader.jsx';
import EvidenceDetails, { formatDay } from './EvidenceDetails.jsx';

const KIND = {
  strength: { label: 'Strength', tone: 'teal' },
  concern: { label: 'Needs attention', tone: 'coral' },
  neutral: { label: 'Observation', tone: 'blue' },
  'data-quality': { label: 'Data quality', tone: 'amber' }
};
const SEVERITY_TONE = { error: 'coral', warning: 'amber', info: 'neutral' };

const rate = (value) => (value === null || value === undefined ? '—' : `${value}%`);

function Stat({ icon: Icon, label, value, detail, tone = 'blue' }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={19} aria-hidden="true" />
      </div>
      <p>{label}</p>
      <div className="metric-value">{value}</div>
      <div className="metric-change">{detail}</div>
    </article>
  );
}

function EmployeeStats({ metrics }) {
  const { tasks, sessions, activity } = metrics.current;
  return (
    <section className="metric-grid section-gap" aria-label="Verified metrics">
      <Stat icon={ListChecks} tone="teal" label="Completion rate" value={rate(tasks.completionRate)} detail={`${tasks.completed} of ${tasks.workload} tasks done`} />
      <Stat icon={Clock} tone="blue" label="On-time rate" value={rate(tasks.onTimeRate)} detail={`${tasks.onTime} of ${tasks.completedWithDeadline} with a due date`} />
      <Stat icon={AlertTriangle} tone="coral" label="Pending" value={tasks.pending} detail={`${tasks.overdue} overdue${tasks.inReview ? `, ${tasks.inReview} in review` : ''}`} />
      <Stat
        icon={LogIn}
        tone="amber"
        label="Signed-in time"
        value={`${sessions.recordedHours} h`}
        detail={`${sessions.total} sign-ins${sessions.missingLogout ? `, ${sessions.missingLogout} without sign-out` : ''} · desktop ${activity.activeHours} h active`}
      />
    </section>
  );
}

function TeamTable({ metrics }) {
  return (
    <div className="table-wrap">
      <table className="responsive-table">
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Done / workload</th>
            <th scope="col">Completion</th>
            <th scope="col">On time</th>
            <th scope="col">Overdue</th>
            <th scope="col">In review</th>
            <th scope="col">No sign-out</th>
            <th scope="col">Data issues</th>
          </tr>
        </thead>
        <tbody>
          {metrics.employees.map((row) => (
            <tr key={row.employeeId}>
              <td className="cell-primary" data-label="Employee">
                <strong>{row.name}</strong>
              </td>
              <td data-label="Done / workload">
                {row.tasks.completed} / {row.tasks.workload}
              </td>
              <td data-label="Completion">{rate(row.tasks.completionRate)}</td>
              <td data-label="On time">{rate(row.tasks.onTimeRate)}</td>
              <td data-label="Overdue">{row.tasks.overdue > 0 ? <span className="category-chip chip-coral">{row.tasks.overdue}</span> : 0}</td>
              <td data-label="In review">{row.tasks.inReview}</td>
              <td data-label="No sign-out">{row.sessions.missingLogout}</td>
              <td data-label="Data issues">{row.dataQualityIssues}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Feedback({ runId }) {
  const [rating, setRating] = useState(null);
  const [error, setError] = useState(null);

  async function choose(value) {
    setError(null);
    try {
      await rateAnswer(runId, value);
      setRating(value);
    } catch (rateError) {
      setError(errorMessage(rateError));
    }
  }

  return (
    <div className="agent-feedback">
      <span>{rating ? 'Thanks — your rating is recorded for the evaluation.' : 'How useful was this answer?'}</span>
      <div role="group" aria-label="Rate from 1 (not useful) to 5 (very useful)">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={`icon-button rating ${rating >= value ? 'rated' : ''}`}
            aria-label={`${value} of 5`}
            aria-pressed={rating === value}
            onClick={() => choose(value)}
          >
            <Star size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** One answer: the verified numbers, the interpretation with its evidence, and what the evidence check removed. */
export default function AgentResult({ result }) {
  const factById = useMemo(() => new Map(result.facts.map((fact) => [fact.id, fact])), [result.facts]);
  const { validation } = result;
  const subject = result.scope === 'team' ? `${result.subjects.length} employees` : result.subjects[0]?.name;

  return (
    <>
      <article className="panel section-gap agent-answer" aria-live="polite">
        <header className="agent-answer-header">
          <div>
            <p className="eyebrow">
              {subject} · {formatDay(result.range.start)} – {formatDay(result.range.end)}
            </p>
            {result.question && <h2>{result.question}</h2>}
          </div>
          <span className={`category-chip ${result.source === 'claude' ? 'chip-teal' : 'chip-neutral'}`}>
            {result.source === 'claude' ? `AI: ${result.model}` : 'Fixed rules'}
          </span>
        </header>
        <p className="agent-answer-text">{result.answer.text}</p>
        <EvidenceDetails factIds={result.answer.factIds} factById={factById} />
        {result.fallbackReason && <p className="muted agent-note">{result.fallbackReason}</p>}
        <p className="agent-validation">
          <ShieldCheck size={15} aria-hidden="true" />
          {validation.accepted} of {validation.checked} statements checked against the records
          {validation.rejected.length > 0 && `; ${validation.rejected.length} unsupported removed`}
        </p>
      </article>

      {result.scope === 'team' ? (
        <article className="panel section-gap">
          <PanelHeader title="Team at a glance" subtitle={`Calculated from the records${result.truncated ? ' (first 50 employees)' : ''}`} />
          <TeamTable metrics={result.metrics} />
        </article>
      ) : (
        <EmployeeStats metrics={result.metrics} />
      )}

      <div className="agent-columns section-gap">
        <article className="panel">
          <PanelHeader title="Observations" />
          {result.observations.length === 0 && <p className="muted">No observations the records can support.</p>}
          <ul className="agent-list">
            {result.observations.map((item, index) => (
              <li key={index}>
                <span className={`category-chip chip-${KIND[item.kind]?.tone ?? 'neutral'}`}>{KIND[item.kind]?.label ?? item.kind}</span>
                <p>{item.statement}</p>
                <EvidenceDetails factIds={item.factIds} factById={factById} />
              </li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <PanelHeader title="Recommendations" />
          {result.recommendations.length === 0 && <p className="muted">Nothing to recommend from these records.</p>}
          <ul className="agent-list">
            {result.recommendations.map((item, index) => (
              <li key={index}>
                <p>
                  <CheckCircle2 size={15} aria-hidden="true" className="agent-icon" /> <strong>{item.action}</strong>
                </p>
                {item.rationale && <p className="muted">{item.rationale}</p>}
                <EvidenceDetails factIds={item.factIds} factById={factById} />
              </li>
            ))}
          </ul>
        </article>
      </div>

      {result.dataQuality.length > 0 && (
        <article className="panel section-gap">
          <PanelHeader title="Data quality" subtitle="Records that are missing, inconsistent or possibly duplicated. Conclusions that depend on them are less certain." />
          <ul className="agent-list">
            {result.dataQuality.map((issue) => (
              <li key={`${issue.employee}-${issue.code}`}>
                <span className={`category-chip chip-${SEVERITY_TONE[issue.severity]}`}>
                  {issue.count} {issue.count === 1 ? 'record' : 'records'}
                </span>
                <p>
                  {result.scope === 'team' && <strong>{issue.employee}: </strong>}
                  {issue.message}
                </p>
              </li>
            ))}
          </ul>
        </article>
      )}

      <article className="panel section-gap agent-footer">
        {result.limitations.length > 0 && (
          <>
            <h3>Limitations</h3>
            <ul>
              {result.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        )}
        {validation.rejected.length > 0 && (
          <details className="evidence">
            <summary>Removed by the evidence check ({validation.rejected.length})</summary>
            <ul>
              {validation.rejected.map((item, index) => (
                <li key={index}>
                  <span className="evidence-label">{item.type}</span> “{item.text}” <small>{item.reason}</small>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="report-footer">
          <Sparkles size={13} aria-hidden="true" />
          <span>{result.disclaimer}</span>
        </p>
        <Feedback key={result.runId} runId={result.runId} />
      </article>
    </>
  );
}
