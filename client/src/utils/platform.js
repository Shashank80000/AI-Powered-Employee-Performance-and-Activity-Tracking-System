// Which desktop installer fits the visitor's computer.

export const PLATFORM_LABELS = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
export const ARCH_LABELS = {
  macos: { arm64: 'Apple Silicon (M1 or later)', x64: 'Intel' },
  windows: { x64: '64-bit (most PCs)', arm64: 'ARM', universal: '64-bit and ARM (one installer)' },
  linux: { x64: 'x64', arm64: 'ARM64' }
};

/** 'macos' | 'windows' | 'linux', or null on phones, tablets and unknown systems. */
export function detectPlatform(nav = navigator) {
  const ua = nav.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(ua) || nav.userAgentData?.mobile) return null;
  const platform = (nav.userAgentData?.platform || nav.platform || '').toLowerCase();
  if (platform.includes('win') || ua.includes('windows')) return 'windows';
  if (platform.includes('mac') || ua.includes('mac os')) return 'macos';
  if (platform.includes('linux') || ua.includes('linux') || ua.includes('x11')) return 'linux';
  return null;
}

/** 'arm64' | 'x64' when the browser says so (Chromium only), else null. */
export async function detectArch(nav = navigator) {
  try {
    const { architecture } = (await nav.userAgentData?.getHighEntropyValues(['architecture'])) ?? {};
    if (architecture) return architecture.startsWith('arm') ? 'arm64' : 'x64';
  } catch {
    // Not available in this browser.
  }
  return null;
}

/** The best installer for this computer, or null. Unknown Mac CPUs default to Apple Silicon; a universal installer covers a missing arch. */
export function pickInstaller(installers, platform, arch) {
  // Preferred formats first (.dmg, .exe, AppImage), then any other format for that system (e.g. a Windows .zip).
  const candidates = installers.filter((item) => item.platform === platform).sort((a, b) => Number(b.preferred) - Number(a.preferred));
  const wantedArch = arch ?? (platform === 'macos' ? 'arm64' : 'x64');
  const match = candidates.find((item) => item.arch === wantedArch) ?? candidates.find((item) => item.arch === 'universal');
  // Another CPU's installer won't run, so only guess one when the browser didn't say which CPU this is.
  return match ?? (arch ? null : candidates[0] ?? null);
}

export const archLabel = (item) => ARCH_LABELS[item.platform]?.[item.arch] ?? item.arch;
export const formatSize = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** What to expect the first time the agent opens, per system (installers are unsigned unless your organisation signs them). */
export const FIRST_LAUNCH = {
  macos: 'If macOS says the app can’t be checked, Control-click the app in Applications and choose Open. Then allow the permissions it asks for (Accessibility, Input Monitoring and, for screenshots, Screen Recording) in System Settings → Privacy & Security.',
  windows: 'Zip: right-click it, choose Extract All, then open WorkPlus Agent.exe in the extracted folder. Installer (.exe): it runs for your user account only and needs no admin rights. If Windows SmartScreen appears, choose More info → Run anyway.',
  linux: 'AppImage: make it executable (chmod +x) and run it. Debian or Ubuntu: sudo apt install ./<file>.deb, then open WorkPlus Agent from your apps.'
};
