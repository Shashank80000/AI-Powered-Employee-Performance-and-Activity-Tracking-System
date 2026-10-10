import DashboardOverview from '../../components/dashboard/DashboardOverview.jsx';
import WorkSummary from '../../components/dashboard/WorkSummary.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PeriodSelect from '../../components/common/PeriodSelect.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDashboard } from '../../hooks/useDashboard.js';
import { formatChange, formatLongDate, greeting } from '../../utils/formatters.js';

/** Team overview. Also used by admins (`basePath="/admin"`), who see every employee and a setup checklist (`intro`). */
export default function ManagerDashboard({ basePath = '/manager', intro }) {
  const { user } = useAuth();
  const { data, error, loading, reload, period, setPeriod } = useDashboard();
  const change = data?.summary.changes.averageProductivity;

  return (
    <>
      <PageHeading
        eyebrow={formatLongDate()}
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        actions={<PeriodSelect value={period} onChange={setPeriod} />}
      >
        {data && (
          <>
            Average productivity is <strong>{formatChange(change)}</strong> compared with the previous period.
          </>
        )}
      </PageHeading>
      {intro}
      <WorkSummary basePath={basePath} />
      {!data && <StatusMessage loading={loading} error={error} onRetry={reload} />}
      {data && <DashboardOverview dashboard={data} basePath={basePath} />}
    </>
  );
}
