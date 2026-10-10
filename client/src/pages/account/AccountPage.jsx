import { KeyRound } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Notice from '../../components/common/Notice.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import PasswordField from '../../components/common/PasswordField.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getMyProfile } from '../../services/employeeService.js';
import { ROLE_HOME, ROLE_LABELS } from '../../utils/constants.js';
import { errorMessage } from '../../utils/formatters.js';
import { passwordProblem } from '../../utils/password.js';

const EMPTY = { current: '', next: '', confirm: '' };

function EmployeeDetails() {
  const { data, error } = useApi((signal) => getMyProfile({ signal }));
  if (error) return <p className="form-error">{errorMessage(error)}</p>;
  if (!data) return null;
  return (
    <>
      <div><dt>Manager</dt><dd>{data.managerName ?? 'Not assigned yet. Ask your administrator.'}</dd></div>
      <div><dt>Employee code</dt><dd>{data.employeeCode}</dd></div>
      <div><dt>Job title</dt><dd>{[data.designation, data.department].filter(Boolean).join(' · ') || '—'}</dd></div>
    </>
  );
}

/** Profile details and password change for every role. People with a temporary password land here first. */
export default function AccountPage() {
  const { user, demo, changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  const required = user.mustChangePassword;

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = passwordProblem(form.next) ?? (form.next !== form.confirm ? 'The two new passwords do not match' : null);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await changePassword(form.current, form.next);
      setForm(EMPTY);
      if (required) {
        navigate(ROLE_HOME[user.role], { replace: true, state: { welcome: true } });
        return;
      }
      setNotice('Your password was changed. Use the new one next time you sign in, including in the desktop agent.');
    } catch (changeError) {
      setError(errorMessage(changeError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Settings" title={required ? 'Choose your own password' : 'My account'}>
        {required
          ? 'You signed in with a temporary password from your administrator. Choose a password only you know to continue.'
          : 'Your details and sign-in password.'}
      </PageHeading>
      <Notice onDismiss={clearNotice}>{notice}</Notice>

      <section className="content-grid account-grid">
        <article className="panel">
          <PanelHeader title="Change password" subtitle="At least 8 characters, with a letter and a number." />
          {demo ? (
            <p className="status-message">Passwords can't be changed in the demo.</p>
          ) : (
            <form className="form-grid single" onSubmit={handleSubmit}>
              <PasswordField
                label={required ? 'Temporary password' : 'Current password'}
                value={form.current}
                onChange={(current) => setForm({ ...form, current })}
                autoComplete="current-password"
              />
              <PasswordField label="New password" value={form.next} onChange={(next) => setForm({ ...form, next })} />
              <PasswordField label="Repeat new password" value={form.confirm} onChange={(confirm) => setForm({ ...form, confirm })} />
              <div className="form-actions">
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-button" disabled={saving}>
                  <KeyRound size={15} aria-hidden="true" /> {saving ? 'Saving…' : required ? 'Save and continue' : 'Change password'}
                </button>
              </div>
            </form>
          )}
        </article>

        <article className="panel">
          <PanelHeader title="My details" subtitle="Ask your administrator if anything here is wrong." />
          <dl className="task-facts single">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Role</dt><dd>{ROLE_LABELS[user.role]}</dd></div>
            {user.role === 'employee' && !required && <EmployeeDetails />}
          </dl>
        </article>
      </section>
    </>
  );
}
