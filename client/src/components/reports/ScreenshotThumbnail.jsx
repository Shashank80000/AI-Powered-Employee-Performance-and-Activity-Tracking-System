import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatTime } from '../../utils/formatters.js';

/**
 * Loads a screenshot image through the authenticated API.
 * With `clickToView`, nothing is fetched (or logged as a view) until the viewer asks for it.
 */
export default function ScreenshotThumbnail({ screenshot, loadImage, clickToView = false }) {
  const [requested, setRequested] = useState(!clickToView);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!requested || !screenshot.hasImage) return undefined;
    const controller = new AbortController();
    let objectUrl;
    loadImage(screenshot.id, { signal: controller.signal })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requested, screenshot.id, screenshot.hasImage, loadImage]);

  if (!screenshot.hasImage) return <div className="shot-placeholder">Image deleted</div>;
  if (!requested) {
    return (
      <button type="button" className="shot-placeholder shot-reveal" onClick={() => setRequested(true)}>
        <Eye size={16} aria-hidden="true" /> View screenshot
      </button>
    );
  }
  if (error) return <div className="shot-placeholder">{error.message}</div>;
  if (!url) return <div className="shot-placeholder">Loading…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open full size">
      <img src={url} alt={`Screen at ${formatTime(screenshot.capturedAt)}`} />
    </a>
  );
}
