import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PanelHeader({ title, subtitle, actionLabel, actionTo, children }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
      {actionTo && (
        <Link className="text-button" to={actionTo}>
          {actionLabel} <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
