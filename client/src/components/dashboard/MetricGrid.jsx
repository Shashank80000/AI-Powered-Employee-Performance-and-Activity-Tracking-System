import { Activity, CheckCircle2, Clock3, Users } from 'lucide-react';
import { formatPercent } from '../../utils/formatters.js';
import MetricCard from './MetricCard.jsx';

export default function MetricGrid({ summary, showEmployees = true }) {
  const { changes } = summary;
  return (
    <section className="metric-grid" aria-label="Summary">
      {showEmployees && <MetricCard label="Active employees" value={summary.activeEmployees} change={changes.activeEmployees} icon={Users} tone="teal" />}
      <MetricCard label="Avg. productivity" value={formatPercent(summary.averageProductivity, 1)} change={changes.averageProductivity} icon={Activity} tone="coral" />
      <MetricCard label="Tracked hours" value={`${summary.trackedHours}h`} change={changes.trackedHours} icon={Clock3} tone="amber" />
      <MetricCard label="Tasks completed" value={summary.tasksCompleted} change={changes.tasksCompleted} icon={CheckCircle2} tone="blue" />
    </section>
  );
}
