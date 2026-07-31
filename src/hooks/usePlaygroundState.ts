import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_CODE,
  loadPlaygroundState,
  persistPlaygroundState,
  type PlaygroundStorage,
} from '@/utils/playgroundStorage';

const PERSIST_DELAY_MS = 400;

export { DEFAULT_CODE };

function getBrowserStorage(): PlaygroundStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function usePlaygroundState() {
  const storageRef = useRef<PlaygroundStorage | null>(null);
  const [state, setState] = useState(() => {
    storageRef.current = getBrowserStorage();
    return loadPlaygroundState(storageRef.current);
  });
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      persistPlaygroundState(storageRef.current, state);
    }, PERSIST_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state]);

  useEffect(() => {
    const handlePageHide = (): void => {
      persistPlaygroundState(storageRef.current, latestStateRef.current);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  return {
    state,
    setState,
  };
}
