import { ArrowRight, Download } from 'lucide-react';
import { installerUrl } from '../../services/downloadService.js';
import { PLATFORM_LABELS, archLabel, formatSize } from '../../utils/platform.js';

/** One-click download for the visitor's OS; falls back to the full list when there's no match. */
export default function DownloadButton({ downloads, listHref = '#download' }) {
  const { data, platform, best, installers } = downloads;

  if (best) {
    return (
      <a className="home-primary-button download-primary" href={installerUrl(best)} download>
        <Download size={17} aria-hidden="true" /> Download for {PLATFORM_LABELS[best.platform]}
        <small>{archLabel(best)} · {formatSize(best.bytes)}{data?.version ? ` · v${data.version}` : ''}</small>
      </a>
    );
  }
  const label = !data
    ? 'Download the desktop agent'
    : installers.length === 0
      ? 'Download (coming soon)'
      : platform
        ? `No ${PLATFORM_LABELS[platform]} download yet: see all systems`
        : 'Download for your computer';
  return (
    <a className="home-primary-button" href={listHref}>
      <Download size={17} aria-hidden="true" /> {label} <ArrowRight size={15} aria-hidden="true" />
    </a>
  );
}
