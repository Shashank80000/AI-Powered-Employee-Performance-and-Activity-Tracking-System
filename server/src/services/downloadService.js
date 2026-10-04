import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

// electron-builder names installers "<productName>-<version>-<os>-<arch>.<ext>" (see desktop-agent/electron-builder.yml).
const INSTALLER_NAME = /^(?<product>.+)-(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)-(?<os>mac|win|linux)-(?<arch>x64|arm64|x86_64|aarch64|amd64)\.(?<ext>dmg|zip|exe|AppImage|deb)$/;

const PLATFORMS = { mac: 'macos', win: 'windows', linux: 'linux' };
const ARCHES = { x64: 'x64', x86_64: 'x64', amd64: 'x64', arm64: 'arm64', aarch64: 'arm64' };
// The format shown first for each platform; the others are listed as alternatives.
const PREFERRED = { macos: 'dmg', windows: 'exe', linux: 'AppImage' };
const FORMAT_LABELS = { dmg: 'Disk image (.dmg)', zip: 'Zip archive (.zip)', exe: 'Installer (.exe)', AppImage: 'AppImage', deb: 'Debian / Ubuntu (.deb)' };

/** Parses an installer file name, or returns null for anything else in the folder. */
export function parseInstallerName(file) {
  const match = INSTALLER_NAME.exec(file);
  if (!match) return null;
  const { version, os, arch, ext } = match.groups;
  const platform = PLATFORMS[os];
  return { file, version, platform, arch: ARCHES[arch], format: ext, label: FORMAT_LABELS[ext], preferred: PREFERRED[platform] === ext };
}

const compareVersions = (a, b) => {
  const [pa, pb] = [a, b].map((version) => version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

/** Keeps the newest version's installers, in display order. */
function latestVersion(parsed) {
  if (parsed.length === 0) return { version: null, installers: [] };
  const version = parsed.map((item) => item.version).sort(compareVersions).at(-1);
  const installers = parsed.filter((item) => item.version === version);
  installers.sort((a, b) => a.platform.localeCompare(b.platform) || Number(b.preferred) - Number(a.preferred) || a.arch.localeCompare(b.arch));
  return { version, installers };
}

/** Installers of the newest version in DOWNLOADS_DIR; older versions left in the folder are ignored. */
export async function listInstallers(directory = env.DOWNLOADS_DIR) {
  let files;
  try {
    files = await readdir(directory);
  } catch {
    return { version: null, installers: [] };
  }
  const parsed = await Promise.all(
    files
      .map(parseInstallerName)
      .filter(Boolean)
      .map(async (item) => ({ ...item, bytes: (await stat(path.join(directory, item.file))).size }))
  );
  return latestVersion(parsed);
}

/** Installers attached to a repository's latest GitHub Release, each with its public downloadUrl. */
export async function listReleaseInstallers(repo, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'workplus-server' }
  });
  if (response.status === 404) return { version: null, installers: [] };
  if (!response.ok) throw new Error(`GitHub releases request failed with ${response.status}`);
  const release = await response.json();
  const parsed = (release.assets ?? [])
    .map((asset) => {
      const item = parseInstallerName(asset.name);
      return item && { ...item, bytes: asset.size, downloadUrl: asset.browser_download_url };
    })
    .filter(Boolean);
  return latestVersion(parsed);
}

// GitHub allows 60 unauthenticated API requests an hour per IP, so remember the release for a while.
const RELEASE_CACHE_MS = 5 * 60 * 1000;
let releaseCache = { at: 0, value: null };

/** The installers the website offers: from the GitHub Release when DOWNLOADS_GITHUB_REPO is set, else DOWNLOADS_DIR. */
export async function currentInstallers() {
  if (!env.DOWNLOADS_GITHUB_REPO) return listInstallers();
  if (releaseCache.value && Date.now() - releaseCache.at < RELEASE_CACHE_MS) return releaseCache.value;
  try {
    releaseCache = { at: Date.now(), value: await listReleaseInstallers(env.DOWNLOADS_GITHUB_REPO) };
  } catch (error) {
    console.warn(`Could not list GitHub Release installers: ${error.message}`);
    if (!releaseCache.value) return { version: null, installers: [] };
  }
  return releaseCache.value;
}
