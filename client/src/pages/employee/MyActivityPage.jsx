import { useState } from 'react';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import PeriodSelect from '../../components/common/PeriodSelect.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import MetricCard from '../../components/dashboard/MetricCard.jsx';
import { Clock3, Coffee, Keyboard, MousePointer2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { getActivitySummary } from '../../services/activityService.js';
import { formatHours } from '../../utils/formatters.js';

export default function MyActivityPage() {
  const [period, setPeriod] = useState('week');
  const { data, error, loading, reload } = useApi((signal) => getActivitySummary({ period }, { signal }), [period]);
  const topSeconds = data?.applications[0]?.durationSeconds ?? 0;

  return (
    <>
      <PageHeading eyebrow="Transparency" title="My activity" actions={<PeriodSelect value={period} onChange={setPeriod} />}>
        Everything the agent has recorded about you, in the form it is stored.
      </PageHeading>
      {!data && <StatusMessage loading={loading} error={error} onRetry={reload} />}
      {data && (
        <>
          <section className="metric-grid">
            <MetricCard label="Active time" value={formatHours(data.activeSeconds)} icon={Clock3} tone="teal" />
            <MetricCard label="Idle time" value={formatHours(data.idleSeconds)} icon={Coffee} tone="coral" />
            <MetricCard label="Keyboard events" value={data.keyboardEvents.toLocaleString()} icon={Keyboard} tone="amber" />
            <MetricCard label="Mouse events" value={data.mouseEvents.toLocaleString()} icon={MousePointer2} tone="blue" />
          </section>
          <article className="panel">
            <PanelHeader title="Applications" subtitle="Application names only — never window titles or websites" />
            {data.applications.length === 0 && <p className="muted">No application usage recorded.</p>}
            <ul className="app-usage">
              {data.applications.map((app) => (
                <li key={app.application}>
                  <span>{app.application}</span>
                  <span className={`app-category app-${app.category}`}>{app.category}</span>
                  <div className="progress progress-wide" role="presentation">
                    <span style={{ width: `${(app.durationSeconds / topSeconds) * 100}%` }} />
                  </div>
                  <strong>{formatHours(app.durationSeconds)}</strong>
                </li>
              ))}
            </ul>
          </article>
        </>
      )}
    </>
  );
}
