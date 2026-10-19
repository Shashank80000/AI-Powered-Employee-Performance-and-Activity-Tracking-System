import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatChange, formatUtcHourRange } from '../../utils/formatters.js';
import FocusDonut from '../charts/FocusDonut.jsx';
import ProductivityChart from '../charts/ProductivityChart.jsx';
import PanelHeader from '../common/PanelHeader.jsx';
import TeamPerformanceTable from '../employees/TeamPerformanceTable.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import AiInsight from './AiInsight.jsx';
import MetricGrid from './MetricGrid.jsx';

/** Metrics, charts, team table and activity feed for a dashboard API response. */
export default function DashboardOverview({ dashboard, basePath, personal = false }) {
  const { summary, trend, focus, team, recentActivity, peakHourUtc } = dashboard;
  const change = summary.changes.averageProductivity;
  const ChangeIcon = change < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <>
      <MetricGrid summary={summary} showEmployees={!personal} />

      <section className="content-grid">
        <article className="panel performance-panel">
          <PanelHeader title={personal ? 'My activity score' : 'Team activity score'} subtitle="Average daily score from keyboard and mouse activity, time in work apps and tasks delivered on time" actionLabel="View reports" actionTo={personal ? undefined : `${basePath}/reports`} />
          <div className="chart-summary">
            <div>
              <strong>{summary.averageProductivity}%</strong>
              {change !== null && (
                <span className={change < 0 ? 'negative' : 'positive'}>
                  <ChangeIcon size={14} aria-hidden="true" /> {formatChange(change)}
                </span>
              )}
            </div>
            <span>Period average</span>
          </div>
          <ProductivityChart points={trend} />
        </article>

        <article className="panel focus-panel">
          <PanelHeader title="Focus distribution" subtitle="How tracked time was spent" />
          <FocusDonut focus={focus} />
          {peakHourUtc !== null && <AiInsight>Activity peaks between {formatUtcHourRange(peakHourUtc)}. Consider protecting that window for deep work.</AiInsight>}
        </article>
      </section>

      {!personal && (
        <section className="content-grid lower-grid">
          <article className="panel team-panel">
            <PanelHeader title="Team performance" subtitle="Average score for the period" actionLabel="View all" actionTo={`${basePath}/employees`} />
            <TeamPerformanceTable members={team} />
          </article>
          <article className="panel activity-panel">
            <PanelHeader title="Recent activity" subtitle="Latest task updates from your team" actionLabel="All tasks" actionTo={`${basePath}/tasks`} />
            <ActivityFeed items={recentActivity} />
          </article>
        </section>
      )}
    </>
  );
}
