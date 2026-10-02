import { useState } from 'react';

const EMPTY = { name: '', email: '', password: '', employeeCode: '', designation: '', department: '', manager: '' };

export default function EmployeeForm({ managers, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...form, manager: form.manager || undefined });
      setForm(EMPTY);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label>
        Full name
        <input required minLength={2} value={form.name} onChange={update('name')} />
      </label>
      <label>
        Email
        <input required type="email" value={form.email} onChange={update('email')} />
      </label>
      <label>
        Temporary password
        <input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={update('password')} />
      </label>
      <label>
        Employee code
        <input required value={form.employeeCode} onChange={update('employeeCode')} placeholder="EMP-005" />
      </label>
      <label>
        Designation
        <input value={form.designation} onChange={update('designation')} />
      </label>
      <label>
        Department
        <input value={form.department} onChange={update('department')} />
      </label>
      <label>
        Manager
        <select value={form.manager} onChange={update('manager')}>
          <option value="">Unassigned</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        {error && <p className="form-error" role="alert">{error.details?.[0]?.message ?? error.message}</p>}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Adding…' : 'Add employee'}
        </button>
      </div>
    </form>
  );
}
