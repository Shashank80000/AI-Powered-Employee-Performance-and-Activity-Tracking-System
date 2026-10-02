import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import GenerateReportForm from '../../components/reports/GenerateReportForm.jsx';
import ReportCard from '../../components/reports/ReportCard.jsx';
import { useApi } from '../../hooks/useApi.js';
import { listEmployees } from '../../services/employeeService.js';
import { generateReport, listReports } from '../../services/reportService.js';

export default function ReportsPage() {
  const employees = useApi((signal) => listEmployees({ signal }));
  const reports = useApi((signal) => listReports(undefined, { signal }));

  async function handleGenerate(employeeId, period) {
    const report = await generateReport(employeeId, period);
    reports.setData((previous) => [report, ...(previous ?? [])]);
  }

  return (
    <>
      <PageHeading eyebrow="Insights" title="Performance reports">
        Reports are generated only when you ask, from aggregated metrics.
      </PageHeading>

      <article className="panel section-gap">
        <PanelHeader title="Generate a report" />
        {employees.data && <GenerateReportForm employees={employees.data} onGenerate={handleGenerate} />}
      </article>

      <StatusMessage loading={reports.loading} error={reports.error} empty={reports.data?.length === 0} emptyText="No reports yet." onRetry={reports.reload} />
      <div className="report-grid">
        {reports.data?.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
    </>
  );
}
