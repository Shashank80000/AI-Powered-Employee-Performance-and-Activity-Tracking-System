import Avatar from '../common/Avatar.jsx';

export default function EmployeeTable({ employees, onDeactivate }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Code</th>
            <th scope="col">Department</th>
            <th scope="col">Shares (set by the person)</th>
            <th scope="col">Status</th>
            {onDeactivate && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
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
                {employee.designation}
                {employee.department && <span className="muted"> · {employee.department}</span>}
              </td>
              <td>
                {employee.consent?.acceptedAt
                  ? ['Activity', employee.consent.keyboard && 'keyboard', employee.consent.apps && 'apps', employee.consent.screenshots && 'screenshots'].filter(Boolean).join(', ')
                  : 'Not given'}
              </td>
              <td>
                <span className={`status ${employee.status === 'active' ? 'status-good' : 'status-attention'}`}>
                  <i aria-hidden="true" />
                  {employee.status}
                </span>
              </td>
              {onDeactivate && (
                <td>
                  {employee.status !== 'inactive' && (
                    <button className="text-button danger" onClick={() => onDeactivate(employee)}>
                      Deactivate
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
