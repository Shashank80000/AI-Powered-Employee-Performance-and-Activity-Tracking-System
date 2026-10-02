import { useState } from 'react';

/** Dropdown of the employee's assigned tasks; the chosen one is "working on". */
export default function TaskSelector({ tasks = [], currentTask, disabled, onSelect, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed');

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-selector">
      <label htmlFor="task">Working on</label>
      <div className="row">
        <select
          id="task"
          value={currentTask?.id ?? ''}
          disabled={disabled || busy}
          onChange={(e) => run(() => onSelect(e.target.value || null))}
        >
          <option value="">No task selected</option>
          {open.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.title}
              {t.priority ? ` (${t.priority})` : ''}
            </option>
          ))}
        </select>
        <button type="button" className="ghost" disabled={busy} onClick={() => run(onRefresh)} title="Reload tasks">
          Refresh
        </button>
      </div>
      {open.length === 0 && <p className="muted small">No open tasks are assigned to you.</p>}
    </div>
  );
}
