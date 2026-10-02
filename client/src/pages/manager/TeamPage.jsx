import EmployeeTable from '../../components/employees/EmployeeTable.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useApi } from '../../hooks/useApi.js';
import { listEmployees } from '../../services/employeeService.js';

export default function TeamPage() {
  const { data, error, loading, reload } = useApi((signal) => listEmployees({ signal }));
  return (
    <>
      <PageHeading eyebrow="People" title="My team">
        Employees assigned to you.
      </PageHeading>
      <article className="panel">
        <StatusMessage loading={loading} error={error} empty={data?.length === 0} emptyText="No employees are assigned to you yet." onRetry={reload} />
        {data?.length > 0 && <EmployeeTable employees={data} />}
      </article>
    </>
  );
}
