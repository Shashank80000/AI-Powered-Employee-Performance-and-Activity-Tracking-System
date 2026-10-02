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

/** Installers of the newest version in DOWNLOADS_DIR; older versions left in the folder are ignored. */
export async function listInstallers(directory = env.DOWNLOADS_DIR) {
  let files;
  try {
    files = await readdir(directory);
  } catch {
    return { version: null, installers: [] };
  }
  const parsed = files.map(parseInstallerName).filter(Boolean);
  if (parsed.length === 0) return { version: null, installers: [] };

  const version = parsed.map((item) => item.version).sort(compareVersions).at(-1);
  const latest = parsed.filter((item) => item.version === version);
  const installers = await Promise.all(
    latest.map(async (item) => ({ ...item, bytes: (await stat(path.join(directory, item.file))).size }))
  );
  installers.sort((a, b) => a.platform.localeCompare(b.platform) || Number(b.preferred) - Number(a.preferred) || a.arch.localeCompare(b.arch));
  return { version, installers };
}

/** Absolute path of a listed installer, or null. Only names from the listing are served (no path traversal). */
export async function installerPath(file, directory = env.DOWNLOADS_DIR) {
  const { installers } = await listInstallers(directory);
  return installers.some((item) => item.file === file) ? path.join(directory, file) : null;
}
