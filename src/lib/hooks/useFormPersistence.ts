'use client';

import * as React from 'react';

export interface UseFormPersistenceOptions<T> {
  storageKey: string;
  data: T;
  enabled?: boolean;
}

export function useFormPersistence<T>({
  storageKey,
  data,
  enabled = true,
}: UseFormPersistenceOptions<T>) {
  const [hydratedData, setHydratedData] = React.useState<T | null>(null);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }

      setHydratedData(JSON.parse(raw) as T);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [enabled, storageKey]);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, enabled, storageKey]);

  const clear = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(storageKey);
    setHydratedData(null);
  }, [storageKey]);

  return {
    hydratedData,
    clear,
  };
}

// Made with Bob
