import { Search, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState.jsx';
import Notice from '../../components/common/Notice.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import EditEmployeeDialog from '../../components/employees/EditEmployeeDialog.jsx';
import EmployeeForm from '../../components/employees/EmployeeForm.jsx';
import EmployeeTable from '../../components/employees/EmployeeTable.jsx';
import ResetPasswordDialog from '../../components/users/ResetPasswordDialog.jsx';
import { useApi } from '../../hooks/useApi.js';
import { createEmployee, deactivateEmployee, listEmployees, listManagers, reactivateEmployee } from '../../services/employeeService.js';
import { errorMessage } from '../../utils/formatters.js';

const PAGE_SIZE = 25;

export default function EmployeesPage() {
  const employees = useApi((signal) => listEmployees({ signal }));
  const managers = useApi(() => listManagers());
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const clearNotice = useCallback(() => setNotice(null), []);

  const managerFilter = params.get('manager') ?? '';
  const statusFilter = params.get('status') ?? '';
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setShown(PAGE_SIZE);
  };

  const needle = query.trim().toLowerCase();
  const visible = (employees.data ?? []).filter(
    (employee) =>
      (!managerFilter || (managerFilter === 'none' ? !employee.manager : employee.manager === managerFilter)) &&
      (!statusFilter || employee.status === statusFilter) &&
      (!needle || [employee.name, employee.email, employee.employeeCode, employee.department].some((value) => value?.toLowerCase().includes(needle)))
  );
  const unassigned = employees.data?.filter((employee) => !employee.manager && employee.status !== 'inactive').length ?? 0;
  const replace = (updated) => employees.setData((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));

  async function handleCreate(employee) {
    const created = await createEmployee(employee);
    employees.setData((previous) => [...(previous ?? []), created]);
    setNotice(
      `${created.name} was added${created.managerName ? ` to ${created.managerName}'s team` : ''}. They can sign in with ${created.email} and the temporary password, then install the desktop agent from the Download page.`
    );
  }

  async function handleDeactivate(employee) {
    if (!window.confirm(`Deactivate ${employee.name}? They are signed out at once and can no longer sign in. Their history is kept, and you can reactivate them later.`)) return;
    setActionError(null);
    try {
      await deactivateEmployee(employee.id);
      replace({ ...employee, status: 'inactive' });
      setNotice(`${employee.name} is deactivated.`);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function handleReactivate(employee) {
    setActionError(null);
    try {
      replace(await reactivateEmployee(employee.id));
      setNotice(`${employee.name} is active again and can sign in with their previous password.`);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  return (
    <>
      <PageHeading eyebrow="Administration" title="Employees">
        Create employee accounts, assign each person to a manager, and manage who can sign in.
      </PageHeading>

      <Notice onDismiss={clearNotice}>{notice}</Notice>

      <article className="panel section-gap">
        <PanelHeader title="Add an employee" subtitle="Creates their sign-in account. Give them the email and temporary password in person." />
        {managers.data?.length === 0 && (
          <p className="status-message">
            Tip: <Link to="/admin/managers">create a manager</Link> first, so you can assign this employee to them now.
          </p>
        )}
        <EmployeeForm managers={managers.data ?? []} onSubmit={handleCreate} />
      </article>

      <article className="panel">
        <PanelHeader
          title="All employees"
          subtitle={employees.data?.length ? `${visible.length} of ${employees.data.length} people${unassigned ? ` · ${unassigned} without a manager` : ''}` : undefined}
        />
        {employees.data?.length > 0 && (
          <div className="list-toolbar">
            <label className="search-box">
              <Search size={15} aria-hidden="true" />
              <span className="visually-hidden">Search employees</span>
              <input type="search" placeholder="Search by name, email, code or department" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="inline-label">
              Manager
              <select className="inline-select" value={managerFilter} onChange={(event) => setFilter('manager', event.target.value)}>
                <option value="">Everyone</option>
                <option value="none">No manager</option>
                {managers.data?.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
              </select>
            </label>
            <label className="inline-label">
              Status
              <select className="inline-select" value={statusFilter} onChange={(event) => setFilter('status', event.target.value)}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="on-leave">On leave</option>
                <option value="inactive">Deactivated</option>
              </select>
            </label>
          </div>
        )}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        <StatusMessage loading={employees.loading && !employees.data} error={employees.error} onRetry={employees.reload} />
        {employees.data?.length === 0 && (
          <EmptyState icon={Users} title="No employees have been added yet">
            Use the form above to create your first employee account and choose their manager.
          </EmptyState>
        )}
        {employees.data?.length > 0 && visible.length === 0 && <p className="status-message">No employees match these filters.</p>}
        {visible.length > 0 && (
          <EmployeeTable
            employees={visible.slice(0, shown)}
            showManager
            onEdit={setEditing}
            onResetPassword={setResetting}
            onDeactivate={handleDeactivate}
            onReactivate={handleReactivate}
          />
        )}
        {visible.length > shown && (
          <button className="secondary-button show-more" onClick={() => setShown(shown + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, visible.length - shown)} more of {visible.length - shown}
          </button>
        )}
      </article>

      {editing && (
        <EditEmployeeDialog
          employee={editing}
          managers={managers.data ?? []}
          isAdmin
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            replace(updated);
            setEditing(null);
            setNotice(`${updated.name}'s details were saved.`);
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          person={resetting}
          onClose={() => setResetting(null)}
          onDone={(message) => {
            setResetting(null);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}
