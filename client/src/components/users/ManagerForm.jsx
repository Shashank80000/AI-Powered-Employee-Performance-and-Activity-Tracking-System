import { useState } from 'react';
import { errorMessage } from '../../utils/formatters.js';
import { passwordProblem } from '../../utils/password.js';
import PasswordField from '../common/PasswordField.jsx';

const EMPTY = { name: '', email: '', password: '' };

export default function ManagerForm({ onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const update = (field) => (value) => setForm((previous) => ({ ...previous, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = passwordProblem(form.password);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...form, name: form.name.trim(), email: form.email.trim() });
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
        <input required minLength={2} maxLength={80} autoComplete="off" value={form.name} onChange={(event) => update('name')(event.target.value)} placeholder="e.g. Neha Verma" />
      </label>
      <label>
        Work email
        <input required type="email" autoComplete="off" value={form.email} onChange={(event) => update('email')(event.target.value)} placeholder="name@company.com" />
        <small className="field-help">They sign in with this email.</small>
      </label>
      <PasswordField
        label="Temporary password"
        value={form.password}
        onChange={update('password')}
        suggest
        help="At least 8 characters with a letter and a number. They choose their own at first sign-in."
      />
      <div className="form-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create manager'}</button>
      </div>
    </form>
  );
}
