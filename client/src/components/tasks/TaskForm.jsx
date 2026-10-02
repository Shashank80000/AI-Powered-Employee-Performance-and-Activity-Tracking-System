import { useState } from 'react';
import { TASK_PRIORITIES } from '../../utils/constants.js';

const EMPTY = { title: '', assignedTo: '', priority: 'medium', expectedMinutes: 60, dueDate: '' };

export default function TaskForm({ employees, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: form.title,
        assignedTo: form.assignedTo,
        priority: form.priority,
        expectedMinutes: Number(form.expectedMinutes),
        dueDate: form.dueDate ? new Date(`${form.dueDate}T18:00:00`).toISOString() : undefined
      });
      setForm(EMPTY);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label className="span-2">
        Title
        <input required minLength={2} value={form.title} onChange={update('title')} />
      </label>
      <label>
        Assign to
        <select required value={form.assignedTo} onChange={update('assignedTo')}>
          <option value="" disabled>
            Choose employee
          </option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select value={form.priority} onChange={update('priority')}>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      </label>
      <label>
        Expected minutes
        <input type="number" min={0} step={15} value={form.expectedMinutes} onChange={update('expectedMinutes')} />
      </label>
      <label>
        Due date
        <input type="date" value={form.dueDate} onChange={update('dueDate')} />
      </label>
      <div className="form-actions">
        {error && <p className="form-error" role="alert">{error.details?.[0]?.message ?? error.message}</p>}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Creating…' : 'Create task'}
        </button>
      </div>
    </form>
  );
}
