import { Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState.jsx';
import Notice from '../../components/common/Notice.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import EditEmployeeDialog from '../../components/employees/EditEmployeeDialog.jsx';
import EmployeeTable from '../../components/employees/EmployeeTable.jsx';
import { useApi } from '../../hooks/useApi.js';
import { listEmployees } from '../../services/employeeService.js';

export default function TeamPage() {
  const { data, error, loading, reload, setData } = useApi((signal) => listEmployees({ signal }));
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);
  const clearNotice = useCallback(() => setNotice(null), []);

  return (
    <>
      <PageHeading eyebrow="People" title="My team">
        The employees your administrator assigned to you. You can update their job title, department and availability. To add people or move
        someone to another team, ask your administrator.
      </PageHeading>
      <Notice onDismiss={clearNotice}>{notice}</Notice>
      <article className="panel">
        <StatusMessage loading={loading && !data} error={error} onRetry={reload} />
        {data?.length === 0 && (
          <EmptyState icon={Users} title="No employees are assigned to you yet">
            Your administrator adds employees and chooses you as their manager. They then appear here, and you can{' '}
            <Link to="/manager/tasks">assign them tasks</Link>.
          </EmptyState>
        )}
        {data?.length > 0 && <EmployeeTable employees={data} onEdit={setEditing} />}
      </article>
      {editing && (
        <EditEmployeeDialog
          employee={editing}
          managers={[]}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setData((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
            setEditing(null);
            setNotice(`${updated.name}'s details were saved.`);
          }}
        />
      )}
    </>
  );
}
