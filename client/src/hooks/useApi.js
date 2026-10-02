import { useCallback, useEffect, useState } from 'react';

/**
 * Runs `loader(signal)` on mount and whenever `deps` change.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    loader(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((previous) => ({ ...previous, error, loading: false }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass their own dependency list.
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback((update) => setState((previous) => ({ ...previous, data: typeof update === 'function' ? update(previous.data) : update })), []);

  return { ...state, reload, setData };
}
