import { CheckCircle2, X } from 'lucide-react';
import { useEffect } from 'react';

/** A success message after an action. Disappears on its own after a few seconds. */
export default function Notice({ children, onDismiss }) {
  useEffect(() => {
    if (!children) return undefined;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [children, onDismiss]);

  if (!children) return null;
  return (
    <div className="notice" role="status">
      <CheckCircle2 size={17} aria-hidden="true" />
      <span>{children}</span>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss message">
        <X size={15} />
      </button>
    </div>
  );
}
