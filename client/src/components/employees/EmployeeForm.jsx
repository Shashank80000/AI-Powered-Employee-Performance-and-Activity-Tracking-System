import { useState } from 'react';
import { errorMessage } from '../../utils/formatters.js';
import { passwordProblem } from '../../utils/password.js';
import PasswordField from '../common/PasswordField.jsx';

const EMPTY = { name: '', email: '', password: '', employeeCode: '', designation: '', department: '', manager: '' };

export default function EmployeeForm({ managers, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (value) => setForm((previous) => ({ ...previous, [field]: value }));
  const update = (field) => (event) => set(field)(event.target.value);

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = passwordProblem(form.password);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        employeeCode: form.employeeCode.trim(),
        designation: form.designation.trim() || undefined,
        department: form.department.trim() || undefined,
        manager: form.manager || undefined
      });
      setForm(EMPTY);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label>
        Full name
        <input required minLength={2} maxLength={80} autoComplete="off" value={form.name} onChange={update('name')} placeholder="e.g. Riya Kapoor" />
      </label>
      <label>
        Work email
        <input required type="email" autoComplete="off" value={form.email} onChange={update('email')} placeholder="name@company.com" />
        <small className="field-help">They sign in to this website and the desktop agent with this email.</small>
      </label>
      <PasswordField
        label="Temporary password"
        value={form.password}
        onChange={set('password')}
        suggest
        help="At least 8 characters with a letter and a number. They choose their own at first sign-in."
      />
      <label>
        Employee code
        <input required maxLength={30} value={form.employeeCode} onChange={update('employeeCode')} placeholder="e.g. EMP-005" />
        <small className="field-help">Your own ID for this person. Must be unique.</small>
      </label>
      <label>
        Job title
        <input maxLength={80} value={form.designation} onChange={update('designation')} placeholder="e.g. Backend engineer" />
      </label>
      <label>
        Department
        <input maxLength={80} value={form.department} onChange={update('department')} placeholder="e.g. Engineering" />
      </label>
      <label>
        Manager
        <select value={form.manager} onChange={update('manager')}>
          <option value="">No manager yet</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
        <small className="field-help">
          {managers.length ? 'The manager assigns this person tasks and reviews their work.' : 'Create a manager on the Managers page first, or assign one later.'}
        </small>
      </label>
      <div className="form-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Adding…' : 'Add employee'}
        </button>
      </div>
    </form>
  );
}
