import Avatar from '../common/Avatar.jsx';

const STATUS = {
  active: { label: 'Active', className: 'status-good' },
  'on-leave': { label: 'On leave', className: 'status-attention' },
  inactive: { label: 'Deactivated', className: 'status-none' }
};

/**
 * People list. Optional handlers add actions: onEdit (admins and managers), and for admins
 * onResetPassword, onDeactivate and onReactivate. showManager adds the manager column (admins).
 */
export default function EmployeeTable({ employees, showManager = false, onEdit, onResetPassword, onDeactivate, onReactivate }) {
  const hasActions = Boolean(onEdit || onResetPassword || onDeactivate || onReactivate);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Code</th>
            <th scope="col">Job title</th>
            {showManager && <th scope="col">Manager</th>}
            <th scope="col">Shares (chosen by the person)</th>
            <th scope="col">Status</th>
            {hasActions && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const status = STATUS[employee.status] ?? STATUS.active;
            const inactive = employee.status === 'inactive';
            return (
              <tr key={employee.id}>
                <td>
                  <div className="person">
                    <Avatar name={employee.name} />
                    <div>
                      <strong>{employee.name}</strong>
                      <span>{employee.email}</span>
                    </div>
                  </div>
                </td>
                <td>{employee.employeeCode}</td>
                <td>
                  {employee.designation || '—'}
                  {employee.department && <span className="muted"> · {employee.department}</span>}
                </td>
                {showManager && <td>{employee.managerName ?? <span className="text-attention">No manager</span>}</td>}
                <td>
                  {employee.consent?.acceptedAt
                    ? ['Activity', employee.consent.keyboard && 'keyboard', employee.consent.apps && 'apps', employee.consent.screenshots && 'screenshots'].filter(Boolean).join(', ')
                    : <span title="They haven't signed in to the desktop agent and chosen what to share yet">Agent not set up</span>}
                </td>
                <td>
                  <span className={`status ${status.className}`}>
                    <i aria-hidden="true" />
                    {status.label}
                  </span>
                </td>
                {hasActions && (
                  <td className="row-actions">
                    {!inactive && onEdit && <button className="text-button" onClick={() => onEdit(employee)}>Edit</button>}
                    {!inactive && onResetPassword && <button className="text-button" onClick={() => onResetPassword(employee)}>Reset password</button>}
                    {!inactive && onDeactivate && <button className="text-button danger" onClick={() => onDeactivate(employee)}>Deactivate</button>}
                    {inactive && onReactivate && <button className="text-button" onClick={() => onReactivate(employee)}>Reactivate</button>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
