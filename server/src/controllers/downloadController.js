import { HttpError } from '../middleware/errorMiddleware.js';
import { installerPath, listInstallers } from '../services/downloadService.js';

/** Public: the desktop agent installers the website offers for download. */
export async function getDownloads(_request, response) {
  const { version, installers } = await listInstallers();
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

/** Public: one installer file. */
export async function downloadInstaller(request, response) {
  const filePath = await installerPath(request.params.file);
  if (!filePath) throw new HttpError(404, 'Installer not found');
  response.download(filePath, request.params.file, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
