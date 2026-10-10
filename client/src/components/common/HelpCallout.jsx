import { Info } from 'lucide-react';

/** A short "what to do here" explanation at the top of a screen or next to a complex action. */
export default function HelpCallout({ title, children }) {
  return (
    <aside className="help-callout">
      <Info size={17} aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </aside>
  );
}
