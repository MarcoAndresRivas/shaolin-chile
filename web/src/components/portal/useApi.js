import { useCallback, useEffect, useState } from 'react';

// Loads data from an API call and exposes { data, error, loading, reload }.
// A 401 is handed to onUnauthorized instead of being shown as an error.
export function useApi(call, onUnauthorized) {
  const [state, setState] = useState({ data: null, error: '', loading: true });

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      setState({ data: await call(), error: '', loading: false });
    } catch (failure) {
      if (failure.status === 401) return onUnauthorized();
      setState({ data: null, error: failure.message, loading: false });
    }
  }, [call, onUnauthorized]);

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  return { ...state, reload };
}

export const formatTime = (value) => String(value ?? '').slice(0, 5);
