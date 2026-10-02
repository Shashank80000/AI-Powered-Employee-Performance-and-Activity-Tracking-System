import { AlertCircle, Loader2 } from 'lucide-react';

/** Shared loading / error / empty states so every page reports problems the same way. */
export default function StatusMessage({ loading, error, empty, emptyText = 'Nothing here yet.', onRetry }) {
  if (loading) {
    return (
      <div className="status-message" role="status">
        <Loader2 size={18} className="spin" aria-hidden="true" /> Loading…
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
  if (empty) return <div className="status-message">{emptyText}</div>;
  return null;
}
