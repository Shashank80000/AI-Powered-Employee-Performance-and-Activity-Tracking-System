import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import EmployeeReport from '../../components/reports/EmployeeReport.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getEmployeeOverview } from '../../services/reportService.js';
import { todayKey } from '../../utils/formatters.js';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'custom', label: 'Date range' }
];

/**
 * One employee's whole report. Managers and admins open it from the people list (/…/employees/:employeeId/report);
 * employees see their own (`personal`). The server decides whose data comes back.
 */
export default function EmployeeReportPage({ personal = false, backTo }) {
  const { employeeId } = useParams();
  const [period, setPeriod] = useState('week');
  const [from, setFrom] = useState(() => todayKey(new Date(Date.now() - 13 * 24 * 3600 * 1000)));
  const [to, setTo] = useState(() => todayKey());
  const custom = period === 'custom';
  const rangeValid = !custom || (from && to && from <= to);

  const report = useApi(
    (signal) =>
      rangeValid
        ? getEmployeeOverview({ employeeId: personal ? undefined : employeeId, ...(custom ? { from, to } : { period }) }, { signal })
        : Promise.resolve(null),
    [personal, employeeId, period, from, to, rangeValid]
  );

  const name = report.data?.employee.name;
  return (
    <>
      {backTo && (
        <Link className="text-button report-back no-print" to={backTo}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to the people list
        </Link>
      )}
      <PageHeading
        eyebrow="Insights"
        title={personal ? 'My report' : name ? `${name}'s report` : 'Employee report'}
        actions={
          <div className="inline-form no-print">
            <label>
              Period
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {custom && (
              <>
                <label>
                  From
                  <input type="date" value={from} max={to || todayKey()} onChange={(event) => setFrom(event.target.value)} />
                </label>
                <label>
                  To
                  <input type="date" value={to} min={from} max={todayKey()} onChange={(event) => setTo(event.target.value)} />
                </label>
              </>
            )}
            <button type="button" className="secondary-button" onClick={() => window.print()} disabled={!report.data}>
              <Printer size={16} aria-hidden="true" /> Print
            </button>
          </div>
        }
      >
        {personal
          ? 'Everything recorded about your work in this period, computed from stored records. Only you, your manager and administrators can see it.'
          : 'Everything recorded about this person in the period, computed from stored records with fixed rules (no AI). Use it to start a supportive conversation, not as a verdict.'}
      </PageHeading>

      {!rangeValid && <p className="form-error" role="alert">Choose a start date on or before the end date.</p>}
      <StatusMessage loading={report.loading && !report.data} error={report.error} onRetry={report.reload} />
      {report.data && <EmployeeReport report={report.data} />}
    </>
  );
}
