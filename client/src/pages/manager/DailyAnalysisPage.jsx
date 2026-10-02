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

      <StatusMessage
        loading={analysis.loading}
        error={analysis.error}
        empty={!analysis.loading && !analysis.data}
        emptyText="No analysis for this day yet. The analysis agent runs at the end of each day."
        onRetry={analysis.reload}
      />
      {analysis.data && <DailyAnalysisView analysis={analysis.data} />}
      {!personal && employeeId && <TeamScreenshots employeeId={employeeId} date={date} />}
    </>
  );
}
