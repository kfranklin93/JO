'use client';

import * as React from 'react';
import type { Toast } from '@/types';

type ToastInput = Omit<Toast, 'id'> & { id?: string };

export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = React.useCallback((toast: ToastInput) => {
    const id = toast.id ?? crypto.randomUUID();
    const duration = toast.duration ?? 5000;

    setToasts((current) => [...current, { ...toast, id, duration }]);

    if (duration > 0) {
      window.setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, [dismissToast]);

  return {
    toasts,
    addToast,
    dismissToast,
  };
}

