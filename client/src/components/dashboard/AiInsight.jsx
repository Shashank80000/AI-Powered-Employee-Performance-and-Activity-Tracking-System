import { Sparkles } from 'lucide-react';

export default function AiInsight({ children }) {
  return (
    <div className="insight">
      <Sparkles size={16} aria-hidden="true" />
      <span>
        <strong>Insight:</strong> {children}
      </span>
    </div>
  );
}
