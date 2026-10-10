import { UserCog } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../../components/common/Avatar.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import HelpCallout from '../../components/common/HelpCallout.jsx';
import Notice from '../../components/common/Notice.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import ManagerForm from '../../components/users/ManagerForm.jsx';
import ResetPasswordDialog from '../../components/users/ResetPasswordDialog.jsx';
import { useApi } from '../../hooks/useApi.js';
import { createManager, listAllManagers, updateManager } from '../../services/userService.js';
import { errorMessage, formatRelativeTime } from '../../utils/formatters.js';

export default function ManagersPage() {
  const managers = useApi((signal) => listAllManagers({ signal }));
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [resetting, setResetting] = useState(null);
  const clearNotice = useCallback(() => setNotice(null), []);

  const replace = (updated) => managers.setData((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));

  async function handleCreate(input) {
    const manager = await createManager(input);
    managers.setData((previous) => [...(previous ?? []), manager]);
    setNotice(
      <>
        {manager.name} can now sign in with {manager.email} and the temporary password. Next, <Link to="/admin/employees">add employees</Link> and choose {manager.name.split(' ')[0]} as their manager.
      </>
    );
  }

  async function setActive(manager, isActive) {
    if (!isActive && !window.confirm(`Deactivate ${manager.name}? They will be signed out and can no longer sign in. You can reactivate them later.`)) return;
    setActionError(null);
    try {
      replace(await updateManager(manager.id, { isActive }));
      setNotice(isActive ? `${manager.name} can sign in again.` : `${manager.name} is deactivated and can no longer sign in.`);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  return (
    <>
      <PageHeading eyebrow="Administration" title="Managers">
        Managers assign tasks to their team, review submitted work and see their team&apos;s reports. They only see the employees assigned to them.
      </PageHeading>

      <Notice onDismiss={clearNotice}>{notice}</Notice>

      <article className="panel section-gap">
        <PanelHeader title="Create a manager" subtitle="Creates their sign-in account. You then choose them as the manager of employees on the Employees page." />
        <ManagerForm onSubmit={handleCreate} />
      </article>

      <article className="panel">
        <PanelHeader title="All managers" subtitle={managers.data?.length ? `${managers.data.length} manager${managers.data.length === 1 ? '' : 's'}` : undefined} />
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        <StatusMessage loading={managers.loading && !managers.data} error={managers.error} onRetry={managers.reload} />
        {managers.data?.length === 0 && (
          <EmptyState icon={UserCog} title="No managers have been added yet">
            Use the form above to create your first manager. Then add employees and assign them to that manager.
          </EmptyState>
        )}
        {managers.data?.length > 0 && (
          <div className="table-wrap">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th scope="col">Manager</th>
                  <th scope="col">Team</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {managers.data.map((manager) => (
                  <tr key={manager.id}>
                    <td className="cell-primary">
                      <div className="person">
                        <Avatar name={manager.name} />
                        <div>
                          <strong>{manager.name}</strong>
                          <span>{manager.email}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Team">
                      <Link className="text-link" to={`/admin/employees?manager=${manager.id}`}>
                        {manager.teamSize} employee{manager.teamSize === 1 ? '' : 's'}
                      </Link>
                    </td>
                    <td data-label="Last sign-in">{manager.lastLoginAt ? formatRelativeTime(manager.lastLoginAt) : 'Never signed in'}</td>
                    <td data-label="Status">
                      <span className={`status ${manager.isActive ? 'status-good' : 'status-none'}`}>
                        <i aria-hidden="true" />
                        {manager.isActive ? (manager.mustChangePassword ? 'Active · temporary password' : 'Active') : 'Deactivated'}
                      </span>
                    </td>
                    <td className="row-actions">
                      {manager.isActive ? (
                        <>
                          <button className="text-button" onClick={() => setResetting(manager)}>Reset password</button>
                          <button className="text-button danger" onClick={() => setActive(manager, false)}>Deactivate</button>
                        </>
                      ) : (
                        <button className="text-button" onClick={() => setActive(manager, true)}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <HelpCallout>
          A manager who still has employees can&apos;t be deactivated. Assign their employees to another manager on the Employees page first.
        </HelpCallout>
      </article>

      {resetting && (
        <ResetPasswordDialog
          person={resetting}
          onClose={() => setResetting(null)}
          onDone={(message) => {
            setResetting(null);
            setNotice(message);
            managers.reload();
          }}
        />
      )}
    </>
  );
}
