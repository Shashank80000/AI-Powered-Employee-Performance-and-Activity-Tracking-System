import { Activity, CalendarCheck, CheckCircle2, Clock3, Info, LogIn } from 'lucide-react';
import { CAMERA_STATES, SCREEN_CATEGORIES } from '../../utils/constants.js';
import { formatMinutes } from '../../utils/formatters.js';
import { formatDay } from '../agent/EvidenceDetails.jsx';
import PanelHeader from '../common/PanelHeader.jsx';

// Same labels and tones as the AI assistant's observations.
const KIND = {
  strength: { label: 'Strength', tone: 'teal' },
  concern: { label: 'Needs attention', tone: 'coral' },
  neutral: { label: 'Observation', tone: 'blue' },
  'data-quality': { label: 'Data quality', tone: 'amber' }
};
const SEVERITY_TONE = { error: 'coral', warning: 'amber', info: 'neutral' };

const humanise = (key) => key.replace(/[_-]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
// Categories the website doesn't know yet (e.g. from a new classifier) keep their own name instead of "Other".
const categoryInfo = (key) => SCREEN_CATEGORIES[key] ?? { label: humanise(key), tone: 'neutral' };
const cameraInfo = (key) => CAMERA_STATES[key] ?? { label: humanise(key), tone: 'neutral' };
const rate = (value) => (value === null || value === undefined ? '—' : `${value}%`);
const orDash = (value, suffix = '') => (value === null || value === undefined ? '—' : `${value}${suffix}`);
const BASIS_LABELS = {
  onTime: 'on time',
  late: 'late',
  completedWithDeadline: 'completed with a due date',
  onTimeRate: 'on-time rate %',
  overdue: 'overdue',
  reviewOverdue: 'waiting for review past due',
  changesRequested: 'change requests',
  tasksSentBack: 'tasks sent back',
  completed: 'completed',
  approvedFirstTime: 'approved first time',
  tasksWithTime: 'tasks with logged time',
  expectedMinutes: 'estimated min',
  actualMinutes: 'logged min',
  actualVsExpected: 'logged vs estimate %',
  workload: 'tasks in workload',
  productiveMinutes: 'work-related min',
  observedMinutes: 'classified min',
  productiveShare: 'work-related %',
  idleHours: 'idle h',
  trackedHours: 'tracked h',
  idleShare: 'idle %',
  missingLogout: 'sign-ins without sign-out',
  excludedFromRates: 'tasks left out'
};

function Stat({ icon: Icon, tone, label, value, detail }) {
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

/** A section with no records says why, instead of showing zeros. */
function NoData({ children }) {
  return (
    <p className="report-nodata">
      <Info size={15} aria-hidden="true" /> {children}
    </p>
  );
}

function Facts({ items }) {
  return (
    <dl className="task-facts report-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bars({ rows, info, total }) {
  const top = rows[0]?.minutes ?? 0;
  return (
    <ul className="app-usage">
      {rows.map(({ key, minutes }) => (
        <li key={key}>
          <span>{info(key).label}</span>
          <span className="muted">{total ? Math.round((minutes / total) * 100) : 0}%</span>
          <div className="progress progress-wide" role="presentation">
            <span className={`bar-${info(key).tone}`} style={{ width: `${top ? (minutes / top) * 100 : 0}%` }} />
          </div>
          <strong>{formatMinutes(minutes)}</strong>
        </li>
      ))}
    </ul>
  );
}

function Summary({ report }) {
  const { activity, tasks, sessions, screen } = report;
  return (
    <section className="metric-grid section-gap" aria-label="Summary">
      <Stat
        icon={Activity}
        tone="teal"
        label="Avg. activity score"
        value={activity.available ? `${activity.productivityScore}%` : 'No data'}
        detail={activity.available ? `${activity.daysTracked} tracked days · ${activity.activeHours}h active, ${activity.idleHours}h idle` : 'No desktop activity recorded'}
      />
      <Stat
        icon={CheckCircle2}
        tone="teal"
        label="Tasks completed"
        value={tasks.workload ? `${tasks.completed} / ${tasks.workload}` : 'No tasks'}
        detail={tasks.workload ? `${rate(tasks.completionRate)} of the workload · ${tasks.overdue} overdue` : 'Nothing assigned or open'}
      />
      <Stat
        icon={Clock3}
        tone="blue"
        label="On time"
        value={rate(tasks.onTimeRate)}
        detail={tasks.completedWithDeadline ? `${tasks.onTime} of ${tasks.completedWithDeadline} submitted by the due date` : 'No completed tasks with a due date'}
      />
      <Stat
        icon={screen.available ? CalendarCheck : LogIn}
        tone="amber"
        label={screen.available ? 'Work-related screen time' : 'Days signed in'}
        value={screen.available ? rate(screen.productiveShare) : sessions.daysWithSignIn}
        detail={
          screen.available
            ? `${formatMinutes(screen.productiveMinutes)} of ${formatMinutes(screen.observedMinutes)} classified`
            : `${sessions.total} website sign-ins · ${sessions.recordedHours}h recorded`
        }
      />
    </section>
  );
}

function Observations({ observations }) {
  return (
    <article className="panel section-gap">
      <PanelHeader title="Observations" subtitle="Rule-based, from the numbers below. Each one lists what it is based on." />
      {observations.length === 0 && <p className="muted">Nothing stands out in this period's records.</p>}
      <ul className="agent-list">
        {observations.map((item) => (
          <li key={item.id}>
            <span className={`category-chip chip-${KIND[item.kind]?.tone ?? 'neutral'}`}>{KIND[item.kind]?.label ?? item.kind}</span>
            <p>{item.text}</p>
            <p className="report-basis">
              Based on:{' '}
              {Object.entries(item.basis)
                .map(([key, value]) => `${BASIS_LABELS[key] ?? humanise(key)} ${value}`)
                .join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function TasksPanel({ tasks }) {
  return (
    <article className="panel">
      <PanelHeader title="Tasks" subtitle="On time means submitted by the due date; a slow review never makes the employee late." />
      {!tasks.available && <NoData>{tasks.note}</NoData>}
      {tasks.available && (
        <>
          <Facts
            items={[
              ['Workload', tasks.workload],
              ['New in period', tasks.assignedInPeriod],
              ['Completed', `${tasks.completed} (${rate(tasks.completionRate)})`],
              ['On time / late', `${tasks.onTime} / ${tasks.late}`],
              ['Still open', tasks.pending],
              ['Overdue (not submitted)', tasks.overdue],
              ['Waiting for review past due', tasks.reviewOverdue],
              ['No due date', tasks.noDeadline],
              ['Submissions', tasks.review.submissions],
              ['Sent back for changes', `${tasks.review.changesRequested} (${tasks.review.tasksSentBack} tasks)`],
              ['Approved first time', `${tasks.review.approvedFirstTime} of ${tasks.completed}`],
              [
                'Logged vs estimated',
                tasks.effort.tasksWithTime
                  ? `${formatMinutes(tasks.effort.actualMinutes)} / ${formatMinutes(tasks.effort.expectedMinutes)} (${rate(tasks.effort.actualVsExpected)})`
                  : 'No logged time'
              ]
            ]}
          />
          {tasks.effort.completedWithoutTime > 0 && (
            <p className="muted report-small">{tasks.effort.completedWithoutTime} completed tasks had no logged time or estimate and are left out of the comparison.</p>
          )}
          {tasks.evidence.overdue.length > 0 && (
            <div className="report-card">
              <h4>Overdue</h4>
              <ul>
                {tasks.evidence.overdue.map((task) => (
                  <li key={task.id}>
                    {task.title}
                    {task.due && <span className="muted"> · due {formatDay(task.due)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function ScreenPanel({ screen }) {
  return (
    <article className="panel">
      <PanelHeader
        title="Screen time by category"
        subtitle={screen.available ? `${screen.analyzedCount} of ${screen.screenshotCount} screenshots classified over ${screen.daysAnalysed} days` : 'From the daily screenshot analysis'}
      />
      {!screen.available && <NoData>{screen.note}</NoData>}
      {screen.available && (
        <>
          <Bars rows={screen.categories.map(({ category, minutes }) => ({ key: category, minutes }))} info={categoryInfo} total={screen.observedMinutes} />
          <p className="muted report-small">
            {formatMinutes(screen.productiveMinutes)} of {formatMinutes(screen.observedMinutes)} classified as work-related ({rate(screen.productiveShare)}). Categories come from an
            automated classifier and can be wrong.
          </p>
        </>
      )}
    </article>
  );
}

function PresencePanel({ activity, camera, sessions }) {
  return (
    <article className="panel">
      <PanelHeader title="Presence" subtitle="Recorded presence and input, not the value of the work." />
      <h3 className="report-subheading">Desktop activity</h3>
      {activity.available ? (
        <Facts
          items={[
            ['Tracked days', activity.daysTracked],
            ['Active / idle', `${activity.activeHours}h / ${activity.idleHours}h`],
            ['Active share', rate(activity.activeShare)],
            ['In work apps', `${activity.productiveAppHours}h`]
          ]}
        />
      ) : (
        <NoData>{activity.note}</NoData>
      )}
      <h3 className="report-subheading">Website sign-ins</h3>
      {sessions.available ? (
        <Facts
          items={[
            ['Days signed in', sessions.daysWithSignIn],
            ['Sign-ins', sessions.total],
            ['Recorded time', `${sessions.recordedHours}h`],
            ['Avg. session', sessions.averageSessionMinutes === null ? '—' : formatMinutes(sessions.averageSessionMinutes)],
            ['No sign-out', sessions.missingLogout],
            ['Still signed in', sessions.stillOpen]
          ]}
        />
      ) : (
        <NoData>{sessions.note}</NoData>
      )}
      <h3 className="report-subheading">Camera checks</h3>
      {camera.available ? (
        <>
          <Facts
            items={[
              ['At the desk', formatMinutes(camera.atDeskMinutes)],
              ['Away', formatMinutes(camera.awayMinutes)],
              ['At-desk share', rate(camera.atDeskShare)],
              ['Checks', `${camera.observationCount} over ${camera.daysObserved} days`]
            ]}
          />
          <Bars rows={camera.states.map(({ state, minutes }) => ({ key: state, minutes }))} info={cameraInfo} total={camera.states.reduce((sum, row) => sum + row.minutes, 0)} />
        </>
      ) : (
        <NoData>{camera.note}</NoData>
      )}
    </article>
  );
}

function TrendTable({ trend }) {
  return (
    <article className="panel section-gap">
      <PanelHeader title="Day by day" subtitle="— means nothing was recorded that day (not zero)." />
      <div className="table-wrap">
        <table className="responsive-table report-trend">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Score</th>
              <th scope="col">Active / idle</th>
              <th scope="col">Screen (work-related)</th>
              <th scope="col">At desk</th>
              <th scope="col">Tasks done</th>
              <th scope="col">Signed in</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((row) => (
              <tr key={row.date}>
                <td className="cell-primary">
                  <strong>{formatDay(row.date)}</strong>
                </td>
                <td data-label="Score">{orDash(row.score, '%')}</td>
                <td data-label="Active / idle">{row.activeHours === null ? '—' : `${row.activeHours}h / ${row.idleHours}h`}</td>
                <td data-label="Screen">{row.screenMinutes === null ? '—' : `${formatMinutes(row.screenMinutes)} (${formatMinutes(row.productiveMinutes)})`}</td>
                <td data-label="At desk">{row.atDeskMinutes === null ? '—' : formatMinutes(row.atDeskMinutes)}</td>
                <td data-label="Tasks done">{row.tasksCompleted}</td>
                <td data-label="Signed in">{row.signedIn ? 'Yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/** The whole-employee report: everything recorded about one person in one period, with rule-based observations. */
export default function EmployeeReport({ report }) {
  return (
    <div className="employee-report">
      <p className="report-period">
        {report.employee.name}
        {report.employee.designation && ` · ${report.employee.designation}`} · {formatDay(report.range.start)} – {formatDay(report.range.end)} ({report.range.days} days,{' '}
        {report.daysWithRecords} with records)
      </p>
      <Summary report={report} />
      <Observations observations={report.observations} />
      <div className="content-grid">
        <TasksPanel tasks={report.tasks} />
        <ScreenPanel screen={report.screen} />
      </div>
      <div className="content-grid">
        <PresencePanel activity={report.activity} camera={report.camera} sessions={report.sessions} />
        {report.dataQuality.length > 0 ? (
          <article className="panel">
            <PanelHeader title="Data quality" subtitle="Records that are missing or inconsistent. Numbers that depend on them are less certain." />
            <ul className="agent-list">
              {report.dataQuality.map((issue) => (
                <li key={issue.code}>
                  <span className={`category-chip chip-${SEVERITY_TONE[issue.severity] ?? 'neutral'}`}>{issue.count}</span>
                  <p>{issue.message}</p>
                </li>
              ))}
            </ul>
          </article>
        ) : (
          <article className="panel">
            <PanelHeader title="Data quality" />
            <p className="muted">No missing or inconsistent task or sign-in records in this period.</p>
          </article>
        )}
      </div>
      <TrendTable trend={report.trend} />
      <footer className="report-footer">
        <Info size={13} aria-hidden="true" />
        <span>{report.disclaimer}</span>
      </footer>
    </div>
  );
}
