import Avatar from '../common/Avatar.jsx';

const STATUS = {
  'on-track': { label: 'On track', className: 'status-good' },
  'needs-focus': { label: 'Needs focus', className: 'status-attention' },
  'no-data': { label: 'No data yet', className: 'status-none' }
};

export default function TeamPerformanceTable({ members }) {
  if (members.length === 0) return <p className="muted">No employees are assigned to you yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Team member</th>
            <th scope="col">Productivity</th>
            <th scope="col">Tasks</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const status = STATUS[member.status];
            return (
              <tr key={member.id}>
                <td>
                  <div className="person">
                    <Avatar name={member.name} />
                    <div>
                      <strong>{member.name}</strong>
                      <span>{member.designation}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="score">
                    <div className="progress" role="presentation">
                      <span style={{ width: `${member.score}%` }} />
                    </div>
                    <strong>{member.score}%</strong>
                  </div>
                </td>
                <td className="task-count">
                  {member.tasksCompleted} <span>done</span>
                </td>
                <td>
                  <span className={`status ${status.className}`}>
                    <i aria-hidden="true" />
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
