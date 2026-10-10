import { AlertCircle, Inbox } from 'lucide-react';

/** Shared loading / error / empty states so every page reports problems the same way. */
export default function StatusMessage({ loading, error, empty, emptyText = 'Nothing here yet.', onRetry }) {
  if (loading) {
    return (
      <div className="skeleton" role="status" aria-live="polite">
        <span className="visually-hidden">Loading…</span>
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="status-message status-error" role="alert">
        <AlertCircle size={18} aria-hidden="true" /> {error.message}
        {onRetry && (
          <button className="text-button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="status-empty">
        <Inbox aria-hidden="true" />
        <p>{emptyText}</p>
      </div>
    );
  }
  return null;
}
