import { Activity, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters.js';

const ICONS = {
  done: { icon: CheckCircle2, tone: 'success' },
  review: { icon: Activity, tone: 'info' },
  'in-progress': { icon: Clock3, tone: 'warning' },
  todo: { icon: ListChecks, tone: 'neutral' }
};

export default function ActivityFeed({ items }) {
  if (items.length === 0) return <p className="muted">No recent task updates.</p>;
  return (
    <ul className="activity-list">
      {items.map((item) => {
        const { icon: Icon, tone } = ICONS[item.status] ?? ICONS.todo;
        return (
          <li className="activity-item" key={item.id}>
            <div className={`activity-icon ${tone}`}>
              <Icon size={15} aria-hidden="true" />
            </div>
            <div>
              <p>
                <strong>{item.name}</strong> {item.action}
              </p>
              <time dateTime={item.at}>{formatRelativeTime(item.at)}</time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
