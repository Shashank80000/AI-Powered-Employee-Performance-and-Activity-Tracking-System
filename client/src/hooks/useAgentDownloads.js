import { useCallback, useEffect, useState } from 'react';
import { getDownloads } from '../services/downloadService.js';
import { PLATFORM_LABELS, detectArch, detectPlatform, pickInstaller } from '../utils/platform.js';

// A sleeping free-plan server takes up to a minute to answer; say so after this long.
const SLOW_AFTER_MS = 8000;

// Within a system, the installer most people need comes first (ARM-only Windows/Linux builds last).
const archRank = (item) => (item.platform !== 'macos' && item.arch === 'arm64' ? 1 : 0);

/** Published desktop agent installers, plus the one that fits this visitor's computer. */
export function useAgentDownloads() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [slow, setSlow] = useState(false);
  const [arch, setArch] = useState(null);
  const [platform] = useState(() => detectPlatform());

  const reload = useCallback(() => {
    setError(null);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    getDownloads()
      .then(setData, setError)
      .finally(() => clearTimeout(timer));
  }, []);

  useEffect(() => {
    reload();
    detectArch().then(setArch);
  }, [reload]);

  const installers = data?.installers ?? [];
  return {
    data,
    error,
    slow,
    reload,
    platform,
    installers,
    best: platform ? pickInstaller(installers, platform, arch) : null,
    // Every system is listed, even before its installer is published.
    byPlatform: Object.keys(PLATFORM_LABELS).map((key) => ({
      key,
      items: installers.filter((item) => item.platform === key).sort((a, b) => archRank(a) - archRank(b))
    }))
  };
}
