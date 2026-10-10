import { useState } from 'react';
import { TASK_PRIORITIES } from '../../utils/constants.js';
import { errorMessage, todayKey } from '../../utils/formatters.js';

const EMPTY = { title: '', description: '', assignedTo: '', priority: 'medium', expectedMinutes: 60, dueDate: '' };

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
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assignedTo: form.assignedTo,
        priority: form.priority,
        expectedMinutes: Number(form.expectedMinutes),
        // End of the working day in the manager's time zone.
        dueDate: form.dueDate ? new Date(`${form.dueDate}T18:00:00`).toISOString() : undefined
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
      <label className="span-2">
        Task title
        <input required minLength={2} maxLength={140} value={form.title} onChange={update('title')} placeholder="e.g. Prepare the monthly sales report" />
      </label>
      <label>
        Assign to
        <select required value={form.assignedTo} onChange={update('assignedTo')}>
          <option value="" disabled>
            Choose an employee
          </option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        <small className="field-help">Only active employees you manage are listed.</small>
      </label>
      <label>
        Priority
        <select value={form.priority} onChange={update('priority')}>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority[0].toUpperCase() + priority.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="span-full">
        Description
        <textarea rows={3} maxLength={4000} value={form.description} onChange={update('description')} placeholder="What should be done, and what does finished look like?" />
        <small className="field-help">Optional, but a clear description means fewer questions and less back-and-forth.</small>
      </label>
      <label>
        Expected time (minutes)
        <input type="number" min={0} max={6000} step={15} value={form.expectedMinutes} onChange={update('expectedMinutes')} />
        <small className="field-help">Your estimate. Actual time is logged by the desktop agent.</small>
      </label>
      <label>
        Due date
        <input type="date" min={todayKey()} value={form.dueDate} onChange={update('dueDate')} />
        <small className="field-help">Optional. Tasks past this date are marked Overdue.</small>
      </label>
      <div className="form-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Assigning…' : 'Assign task'}
        </button>
      </div>
    </form>
  );
}
