import path from 'node:path';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errorMiddleware.js';
import { currentInstallers } from '../services/downloadService.js';

/** Public: the desktop agent installers the website offers for download. */
export async function getDownloads(_request, response) {
  const { version, installers } = await currentInstallers();
  response.json({
    version,
    installers: installers.map(({ file, platform, arch, format, label, preferred, bytes }) => ({
      file,
      platform,
      arch,
      format,
      label,
      preferred,
      bytes,
      url: `/api/downloads/${encodeURIComponent(file)}`
    }))
  });
}

/** Public: one installer file, or a redirect to it on GitHub. Only names from the listing are served (no path traversal). */
export async function downloadInstaller(request, response) {
  const { installers } = await currentInstallers();
  const installer = installers.find((item) => item.file === request.params.file);
  if (!installer) throw new HttpError(404, 'Installer not found');
  if (installer.downloadUrl) return response.redirect(302, installer.downloadUrl);
  response.download(path.join(env.DOWNLOADS_DIR, installer.file), installer.file, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
