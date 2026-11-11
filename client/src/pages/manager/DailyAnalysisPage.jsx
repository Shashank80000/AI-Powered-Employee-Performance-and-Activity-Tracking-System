import { useEffect, useState } from 'react';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import DailyAnalysisView from '../../components/reports/DailyAnalysisView.jsx';
import TeamScreenshots from '../../components/reports/TeamScreenshots.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getDailyAnalysis } from '../../services/analysisService.js';
import { listEmployees } from '../../services/employeeService.js';
import { todayKey } from '../../utils/formatters.js';

/** Whole-day analysis. Managers and admins pick an employee; employees see their own (`personal`). */
export default function DailyAnalysisPage({ personal = false }) {
  const [date, setDate] = useState(todayKey());
  const [employeeId, setEmployeeId] = useState('');
  const employees = useApi((signal) => (personal ? Promise.resolve([]) : listEmployees({ signal })), [personal]);

  useEffect(() => {
    if (!personal && !employeeId && employees.data?.length) setEmployeeId(employees.data[0].id);
  }, [personal, employeeId, employees.data]);

  const ready = personal || employeeId;
  const analysis = useApi((signal) => (ready ? getDailyAnalysis({ employeeId: personal ? undefined : employeeId, date }, { signal }) : Promise.resolve(null)), [employeeId, date, ready]);
  // useApi keeps the previous result while the next one loads (and if it fails). Only show an analysis that belongs to
  // the employee and day currently selected, so one person's data is never shown under another person's name.
  const current = analysis.data && (personal || analysis.data.employeeId === employeeId) && analysis.data.date === date ? analysis.data : null;
  const employeeName = employees.data?.find((employee) => employee.id === employeeId)?.name;

  return (
    <>
      <PageHeading
        eyebrow="Insights"
        title="Daily analysis"
        actions={
          <div className="inline-form">
            {!personal && (
              <label>
                Employee
                <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                  {employees.data?.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                      {employee.status === 'inactive' ? ' (deactivated)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Date
              <input type="date" value={date} max={todayKey()} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
        }
      >
        Written once a day by the analysis agent, for people who chose to share screenshots.
      </PageHeading>

      {!personal && (
        <StatusMessage
          loading={employees.loading}
          error={employees.error}
          empty={employees.data?.length === 0}
          emptyText="No employees to show yet."
          onRetry={employees.reload}
        />
      )}
      {ready && (
        <StatusMessage
          loading={analysis.loading}
          error={analysis.error}
          empty={!analysis.loading && !analysis.error && !current}
          emptyText="No analysis for this day yet. The analysis agent runs at the end of each day."
          onRetry={analysis.reload}
        />
      )}
      {current && !analysis.loading && <DailyAnalysisView analysis={current} />}
      {/* Keyed, so switching employee or day starts empty instead of briefly showing the previous person's screenshots. */}
      {!personal && employeeId && <TeamScreenshots key={`${employeeId}:${date}`} employeeId={employeeId} employeeName={employeeName} date={date} />}
    </>
  );
}
