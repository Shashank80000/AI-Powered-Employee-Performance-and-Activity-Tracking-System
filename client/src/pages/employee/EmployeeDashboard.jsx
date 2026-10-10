import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardOverview from '../../components/dashboard/DashboardOverview.jsx';
import WorkSummary from '../../components/dashboard/WorkSummary.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PeriodSelect from '../../components/common/PeriodSelect.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDashboard } from '../../hooks/useDashboard.js';
import { formatLongDate, greeting } from '../../utils/formatters.js';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload, period, setPeriod } = useDashboard();

  return (
    <>
      <PageHeading eyebrow={formatLongDate()} title={`${greeting()}, ${user.name.split(' ')[0]}`} actions={<PeriodSelect value={period} onChange={setPeriod} />}>
        Your tasks first, then your activity: the same data your manager sees about you.
      </PageHeading>
      <WorkSummary basePath="/employee" personal />
      {!data && <StatusMessage loading={loading} error={error} onRetry={reload} />}
      {data && <DashboardOverview dashboard={data} basePath="/employee" personal />}

      <aside className="panel privacy-panel">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>What the desktop agent collects</strong>
          <p>
            Only what you chose when you set it up: active and idle time, and optionally keyboard and mouse counts, the names of the apps you use,
            and screenshots every 5 minutes. It never records what you type, window titles or websites. Change your choices or pause tracking at any
            time in the desktop agent. Not installed yet? <Link to="/download">Download the desktop agent</Link>.
          </p>
        </div>
      </aside>
    </>
  );
}
