import { useState } from 'react';
import EmployeeForm from '../../components/employees/EmployeeForm.jsx';
import EmployeeTable from '../../components/employees/EmployeeTable.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useApi } from '../../hooks/useApi.js';
import { createEmployee, deactivateEmployee, listEmployees, listManagers } from '../../services/employeeService.js';

export default function EmployeesPage() {
  const employees = useApi((signal) => listEmployees({ signal }));
  const managers = useApi(() => listManagers());
  const [actionError, setActionError] = useState(null);

  async function handleCreate(employee) {
    const created = await createEmployee(employee);
    employees.setData((previous) => [...(previous ?? []), created]);
  }

  async function handleDeactivate(employee) {
    if (!window.confirm(`Deactivate ${employee.name}? They will no longer be able to sign in.`)) return;
    setActionError(null);
    try {
      await deactivateEmployee(employee.id);
      employees.reload();
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Administration" title="Employees">
        Create accounts and manage who is tracked.
      </PageHeading>

      <article className="panel section-gap">
        <PanelHeader title="Add employee" />
        <EmployeeForm managers={managers.data ?? []} onSubmit={handleCreate} />
      </article>

      <article className="panel">
        <PanelHeader title="All employees" subtitle={employees.data ? `${employees.data.length} people` : undefined} />
        {actionError && <p className="form-error" role="alert">{actionError.message}</p>}
        <StatusMessage loading={employees.loading} error={employees.error} empty={employees.data?.length === 0} onRetry={employees.reload} />
        {employees.data?.length > 0 && <EmployeeTable employees={employees.data} onDeactivate={handleDeactivate} />}
      </article>
    </>
  );
}
