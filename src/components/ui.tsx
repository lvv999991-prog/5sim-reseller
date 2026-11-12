'use client';

import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

/** Inline error box showing the backend's own code + message. */
export function ErrorBox({ error, onDismiss }: { error: ApiError | Error | null; onDismiss?: () => void }) {
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'ERROR';
  return (
    <div className="alert alert-error" role="alert">
      <strong>{code}</strong>
      <span>{error.message}</span>
      {onDismiss && (
        <button type="button" className="alert-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="alert alert-info">{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="muted">{label}</p>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'FINISHED' || status === 'APPROVED' || status === 'RECEIVED'
      ? 'ok'
      : status === 'PENDING' || status === 'PENDING_REVIEW' || status === 'BUY_UNCERTAIN'
        ? 'warn'
        : status === 'CANCELED' || status === 'REJECTED' || status === 'TIMEOUT' || status === 'BANNED' || status === 'FAILED'
          ? 'bad'
          : 'neutral';
  return <span className={`badge badge-${tone}`}>{status.replace(/_/g, ' ')}</span>;
}
