import { Eye, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import PageHeading from '../../components/common/PageHeading.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import ScreenshotThumbnail from '../../components/reports/ScreenshotThumbnail.jsx';
import { useApi } from '../../hooks/useApi.js';
import { deleteScreenshot, getScreenshotImage, listMyScreenshots } from '../../services/screenshotService.js';
import { SCREEN_CATEGORIES } from '../../utils/constants.js';
import { formatTime, todayKey } from '../../utils/formatters.js';

function ViewedBy({ views }) {
  if (!views?.length) return <p className="shot-views muted">Not viewed by anyone else</p>;
  return (
    <p className="shot-views">
      <Eye size={12} aria-hidden="true" /> Viewed by {views.map((view) => `${view.name} at ${formatTime(view.at)}`).join(', ')}
    </p>
  );
}

export default function MyScreenshotsPage() {
  const [date, setDate] = useState(todayKey());
  const shots = useApi((signal) => listMyScreenshots(date, { signal }), [date]);
  const list = shots.data?.screenshots;
  const retentionDays = shots.data?.retentionDays ?? 3;
  const [error, setError] = useState(null);

  async function handleDelete(screenshot) {
    if (!window.confirm('Delete this screenshot? Nobody, including your manager, will be able to see it.')) return;
    setError(null);
    try {
      await deleteScreenshot(screenshot.id);
      shots.setData((previous) => ({ ...previous, screenshots: previous.screenshots.filter((item) => item.id !== screenshot.id) }));
    } catch (deleteError) {
      setError(deleteError);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Transparency"
        title="My screenshots"
        actions={
          <label className="period-button">
            <span className="visually-hidden">Date</span>
            <input type="date" className="bare-input" value={date} max={todayKey()} onChange={(event) => setDate(event.target.value)} />
          </label>
        }
      >
        You and your manager can see these. Delete any you don't want seen. They're removed automatically after {retentionDays} days.
      </PageHeading>

      <aside className="panel privacy-panel section-gap">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>How screenshots are handled</strong>
          <p>
            Screenshots are taken only if you turned them on in the desktop agent, and never while tracking is paused or you're idle. Your manager
            (and administrators) can open them, and every time they do it is listed under the screenshot below. Once a day the analysis agent
            labels each one (for example "Coding"). Every screenshot is deleted automatically {retentionDays} days after it was taken. Turning
            screenshots off in the desktop agent deletes all of them immediately.
          </p>
        </div>
      </aside>

      {error && <p className="form-error" role="alert">{error.message}</p>}
      <StatusMessage loading={shots.loading} error={shots.error} empty={list?.length === 0} emptyText="No screenshots for this day." onRetry={shots.reload} />
      <div className="shot-grid">
        {list?.map((screenshot) => {
          const category = SCREEN_CATEGORIES[screenshot.analysis?.category];
          return (
            <figure className="panel shot-card" key={screenshot.id}>
              <ScreenshotThumbnail screenshot={screenshot} loadImage={getScreenshotImage} />
              <figcaption>
                <time dateTime={screenshot.capturedAt}>{formatTime(screenshot.capturedAt)}</time>
                <span className={`category-chip chip-${category?.tone ?? 'neutral'}`}>{category?.label ?? (screenshot.status === 'pending' ? 'Waiting for analysis' : 'Not analysed')}</span>
                <button className="icon-button" onClick={() => handleDelete(screenshot)} aria-label={`Delete screenshot from ${formatTime(screenshot.capturedAt)}`}>
                  <Trash2 size={15} />
                </button>
              </figcaption>
              <ViewedBy views={screenshot.views} />
            </figure>
          );
        })}
      </div>
    </>
  );
}
