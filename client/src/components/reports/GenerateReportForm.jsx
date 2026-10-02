import { Sparkles } from 'lucide-react';
import { useState } from 'react';

export default function GenerateReportForm({ employees, onGenerate }) {
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState('week');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onGenerate(employeeId, period);
    } catch (generateError) {
      setError(generateError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <label>
        Employee
        <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
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
        Period
        <select value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
      </label>
      <button className="primary-button" disabled={busy}>
        <Sparkles size={15} aria-hidden="true" /> {busy ? 'Generating…' : 'Generate report'}
      </button>
      {error && <p className="form-error" role="alert">{error.message}</p>}
    </form>
  );
}
