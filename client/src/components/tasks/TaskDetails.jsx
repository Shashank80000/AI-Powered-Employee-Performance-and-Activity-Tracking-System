import { CheckCircle2, MessageSquare, Play, RotateCcw, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { addComment, reviewTask, updateTask } from '../../services/taskService.js';
import { TASK_STATUSES, isOverdue } from '../../utils/constants.js';
import { errorMessage, formatDate, formatMinutes, formatRelativeTime } from '../../utils/formatters.js';
import Modal from '../common/Modal.jsx';
import TaskStatusBadge from './TaskStatusBadge.jsx';

const EVENT_LABELS = {
  comment: 'commented',
  submitted: 'submitted the work for review',
  approved: 'approved the work',
  'changes-requested': 'asked for changes'
};

/** What the person should do next, in one sentence, for the task's current state. */
function nextStep(task, reviewer) {
  if (reviewer) {
    if (task.status === 'review') return 'The employee has submitted this work. Check it, then approve it or send it back with feedback.';
    if (task.status === 'done') return 'This work is approved. Change the status below if it needs more work.';
    return `Waiting for ${task.assigneeName ?? 'the employee'} to finish and submit the work.`;
  }
  if (task.status === 'todo') return 'Select Start when you begin working on this task.';
  if (task.status === 'in-progress') return 'When the work is finished, select Submit for review. Your manager will check it.';
  if (task.status === 'review') return 'Your manager is reviewing this work. You will see their feedback here.';
  return 'Your manager approved this work. Nothing more to do.';
}

/**
 * Everything about one task: details, history and the next actions for the viewer.
 * `reviewer` is true for managers and admins, who approve work and can change any field.
 */
export default function TaskDetails({ task, reviewer, onClose, onChanged }) {
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState(null); // 'submit' | 'changes' | 'approve'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      onChanged(updated);
      setComment('');
      setMode(null);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  const submitAction = () => {
    if (mode === 'submit') return run(() => updateTask(task.id, { status: 'review', note: comment || undefined }));
    if (mode === 'approve') return run(() => reviewTask(task.id, 'approve', comment || undefined));
    if (mode === 'changes') {
      if (comment.trim().length < 2) return setError('Explain what needs to change, so the employee knows what to do');
      return run(() => reviewTask(task.id, 'changes', comment));
    }
    if (!comment.trim()) return setError('Write a comment first');
    return run(() => addComment(task.id, comment));
  };

  const prompts = {
    submit: { label: 'Note for your manager (optional)', placeholder: 'What did you do? Where can your manager find the result?', button: 'Submit for review', icon: Send },
    approve: { label: 'Feedback (optional)', placeholder: 'Anything you want to say about the work', button: 'Approve and mark done', icon: CheckCircle2 },
    changes: { label: 'What needs to change? (required)', placeholder: 'Be specific, so the employee knows exactly what to do', button: 'Send back for changes', icon: RotateCcw }
  };
  const prompt = prompts[mode] ?? { label: 'Add a comment', placeholder: 'Ask a question or share an update', button: 'Post comment', icon: MessageSquare };
  const PromptIcon = prompt.icon;

  return (
    <Modal title={task.title} description={nextStep(task, reviewer)} onClose={onClose} wide>
      <dl className="task-facts">
        <div><dt>Status</dt><dd><TaskStatusBadge task={task} /></dd></div>
        {reviewer && <div><dt>Assigned to</dt><dd>{task.assigneeName}</dd></div>}
        {task.createdByName && <div><dt>Assigned by</dt><dd>{task.createdByName}</dd></div>}
        <div><dt>Priority</dt><dd><span className={`priority priority-${task.priority}`}>{task.priority}</span></dd></div>
        <div><dt>Due</dt><dd className={isOverdue(task) ? 'text-danger' : undefined}>{task.dueDate ? formatDate(task.dueDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date'}</dd></div>
        <div><dt>Time (actual / expected)</dt><dd>{formatMinutes(task.actualMinutes)} / {formatMinutes(task.expectedMinutes)}</dd></div>
      </dl>

      <section className="task-section">
        <h3>Description</h3>
        <p className="task-description">{task.description || 'No description was added.'}</p>
      </section>

      <div className="task-actions">
        {!reviewer && task.status === 'todo' && (
          <button className="primary-button" disabled={busy} onClick={() => run(() => updateTask(task.id, { status: 'in-progress' }))}>
            <Play size={15} aria-hidden="true" /> Start
          </button>
        )}
        {!reviewer && task.status === 'in-progress' && mode !== 'submit' && (
          <button className="primary-button" disabled={busy} onClick={() => { setMode('submit'); setError(null); }}>
            <Send size={15} aria-hidden="true" /> Submit for review
          </button>
        )}
        {!reviewer && task.status === 'review' && (
          <button className="secondary-button" disabled={busy} onClick={() => run(() => updateTask(task.id, { status: 'in-progress' }))}>
            <Undo2 size={15} aria-hidden="true" /> Take back to keep working
          </button>
        )}
        {reviewer && task.status === 'review' && !mode && (
          <>
            <button className="primary-button" disabled={busy} onClick={() => { setMode('approve'); setError(null); }}>
              <CheckCircle2 size={15} aria-hidden="true" /> Approve
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => { setMode('changes'); setError(null); }}>
              <RotateCcw size={15} aria-hidden="true" /> Send back for changes
            </button>
          </>
        )}
        {reviewer && (
          <label className="inline-label">
            Change status
            <select
              className="inline-select"
              value={task.status}
              disabled={busy}
              onChange={(event) => run(() => updateTask(task.id, { status: event.target.value }))}
            >
              {TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <section className="task-section">
        <h3>History and feedback</h3>
        {task.history?.length ? (
          <ol className="task-history">
            {task.history.map((event) => (
              <li key={event.id} className={`history-${event.kind}`}>
                <p>
                  <strong>{event.authorName}</strong> {EVENT_LABELS[event.kind] ?? 'updated the task'}
                  <time dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString()}> · {formatRelativeTime(event.createdAt)}</time>
                </p>
                {event.text && <blockquote>{event.text}</blockquote>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No comments yet. Use the box below to ask a question or share an update.</p>
        )}
      </section>

      <form
        className="comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitAction();
        }}
      >
        <label>
          {prompt.label}
          <textarea rows={3} maxLength={2000} value={comment} placeholder={prompt.placeholder} onChange={(event) => setComment(event.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {mode && (
            <button type="button" className="text-button" onClick={() => { setMode(null); setError(null); }}>
              Cancel
            </button>
          )}
          <button className={mode ? 'primary-button' : 'secondary-button'} disabled={busy}>
            <PromptIcon size={15} aria-hidden="true" /> {busy ? 'Saving…' : prompt.button}
          </button>
        </div>
      </form>
    </Modal>
  );
}
