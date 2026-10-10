import { useState } from 'react';
import { updateEmployee } from '../../services/employeeService.js';
import { errorMessage } from '../../utils/formatters.js';
import Modal from '../common/Modal.jsx';

/** Edit an employee's details. Admins can also rename them and change their manager. */
export default function EditEmployeeDialog({ employee, managers, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: employee.name,
    designation: employee.designation ?? '',
    department: employee.department ?? '',
    manager: employee.manager ?? '',
    status: employee.status
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const changes = { designation: form.designation.trim(), department: form.department.trim(), status: form.status };
    if (isAdmin) Object.assign(changes, { name: form.name.trim(), manager: form.manager || null });
    try {
      onSaved(await updateEmployee(employee.id, changes));
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${employee.name}`} description={employee.email} onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        {isAdmin && (
          <label className="span-full">
            Full name
            <input required minLength={2} maxLength={80} value={form.name} onChange={update('name')} />
          </label>
        )}
        <label>
          Job title
          <input maxLength={80} value={form.designation} onChange={update('designation')} />
        </label>
        <label>
          Department
          <input maxLength={80} value={form.department} onChange={update('department')} />
        </label>
        {isAdmin && (
          <label>
            Manager
            <select value={form.manager} onChange={update('manager')}>
              <option value="">No manager</option>
              {employee.manager && !managers.some((manager) => manager.id === employee.manager) && (
                <option value={employee.manager} disabled>{employee.managerName ?? 'Current manager'} (deactivated)</option>
              )}
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.name}</option>
              ))}
            </select>
            <small className="field-help">The new manager sees this person and their tasks at once.</small>
          </label>
        )}
        <label>
          Availability
          <select value={form.status} onChange={update('status')}>
            <option value="active">Active</option>
            <option value="on-leave">On leave</option>
          </select>
          <small className="field-help">On leave keeps their account. To block sign-in, use Deactivate instead.</small>
        </label>
        <div className="form-actions">
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="text-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
