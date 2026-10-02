import { ShieldAlert } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { getTeamScreenshotImage, listTeamScreenshots } from '../../services/screenshotService.js';
import { SCREEN_CATEGORIES } from '../../utils/constants.js';
import { formatTime } from '../../utils/formatters.js';
import PanelHeader from '../common/PanelHeader.jsx';
import StatusMessage from '../common/StatusMessage.jsx';
import ScreenshotThumbnail from './ScreenshotThumbnail.jsx';

/** One employee's screenshots for a day, for their manager or an admin. */
export default function TeamScreenshots({ employeeId, date }) {
  const shots = useApi((signal) => listTeamScreenshots(employeeId, date, { signal }), [employeeId, date]);
  const list = shots.data?.screenshots;

  return (
    <article className="panel section-gap">
      <PanelHeader title="Screenshots" subtitle={list ? `${list.length} taken this day` : undefined} />
      <p className="notice-line">
        <ShieldAlert size={15} aria-hidden="true" />
        Each screenshot you open is recorded, and the employee can see who viewed it and when. Screenshots are deleted
        automatically {shots.data?.retentionDays ?? 3} days after they were taken.
      </p>
      <StatusMessage loading={shots.loading} error={shots.error} empty={list?.length === 0} emptyText="No screenshots for this day. The employee may not have turned screenshots on." onRetry={shots.reload} />
      <div className="shot-grid">
        {list?.map((screenshot) => {
          const category = SCREEN_CATEGORIES[screenshot.analysis?.category];
          return (
            <figure className="panel shot-card" key={screenshot.id}>
              <ScreenshotThumbnail screenshot={screenshot} loadImage={getTeamScreenshotImage} clickToView />
              <figcaption>
                <time dateTime={screenshot.capturedAt}>{formatTime(screenshot.capturedAt)}</time>
                <span className={`category-chip chip-${category?.tone ?? 'neutral'}`}>{category?.label ?? 'Not analysed yet'}</span>
              </figcaption>
              {screenshot.analysis?.activity && <p className="shot-activity">{screenshot.analysis.activity}</p>}
            </figure>
          );
        })}
      </div>
    </article>
  );
}
