import { Download } from 'lucide-react';
import { installerUrl } from '../../services/downloadService.js';
import { FIRST_LAUNCH, PLATFORM_LABELS, archLabel, formatSize } from '../../utils/platform.js';
import StatusMessage from '../common/StatusMessage.jsx';

/** A card per operating system with its installers. The visitor's own system comes first. */
export default function DownloadOptions({ downloads, showTips = true }) {
  const { data, error, reload, platform, byPlatform } = downloads;
  if (!data) return <StatusMessage loading={!error} error={error} onRetry={reload} />;

  const ordered = [...byPlatform].sort((a, b) => Number(b.key === platform) - Number(a.key === platform));
  return (
    <div className="download-grid">
      {ordered.map(({ key, items }) => (
        <article className={`feature-card download-card ${key === platform ? 'download-card-mine' : ''}`} key={key}>
          <h3>
            {PLATFORM_LABELS[key]}
            {key === platform && <span className="download-badge">Your system</span>}
          </h3>
          {items.length === 0 ? (
            <p className="download-none">Not published yet. Ask your administrator.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.file}>
                  <a href={installerUrl(item)} download>
                    <Download size={14} aria-hidden="true" />
                    <span>{item.label}<small>{archLabel(item)}</small></span>
                    <b>{formatSize(item.bytes)}</b>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {showTips && items.length > 0 && <p>{FIRST_LAUNCH[key]}</p>}
        </article>
      ))}
    </div>
  );
}
