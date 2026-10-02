import { useCallback, useEffect, useState } from 'react';
import { getDownloads } from '../services/downloadService.js';
import { PLATFORM_LABELS, detectArch, detectPlatform, pickInstaller } from '../utils/platform.js';

/** Published desktop agent installers, plus the one that fits this visitor's computer. */
export function useAgentDownloads() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [arch, setArch] = useState(null);
  const [platform] = useState(() => detectPlatform());

  const reload = useCallback(() => {
    setError(null);
    getDownloads().then(setData, setError);
  }, []);

  useEffect(() => {
    reload();
    detectArch().then(setArch);
  }, [reload]);

  const installers = data?.installers ?? [];
  return {
    data,
    error,
    reload,
    platform,
    installers,
    best: platform ? pickInstaller(installers, platform, arch) : null,
    // Every system is listed, even before its installer is published.
    byPlatform: Object.keys(PLATFORM_LABELS).map((key) => ({ key, items: installers.filter((item) => item.platform === key) }))
  };
}
