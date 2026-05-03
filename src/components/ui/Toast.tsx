'use client';

import * as React from 'react';
import type { Toast as ToastType } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

const toastStyles = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  error: 'border-red-300 bg-red-50 text-red-950',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-sky-300 bg-sky-50 text-sky-950',
} as const;

export interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto w-full rounded-2xl border p-4 shadow-lg',
        toastStyles[toast.type]
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.message ? <p className="mt-1 text-sm">{toast.message}</p> : null}
          {toast.action ? (
            <button
              type="button"
              className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium underline underline-offset-2"
              onClick={toast.action.onClick}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`Dismiss notification: ${toast.title}`}
          onClick={() => onDismiss(toast.id)}
        >
          ×
        </Button>
      </div>
    </div>
  );
}

export interface ToastViewportProps {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Made with Bob
