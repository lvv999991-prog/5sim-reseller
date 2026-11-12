'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth';
import { ApiError, orderApi, type Order } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { ErrorBox, InfoBox, Loading, StatusBadge } from '@/components/ui';

// Statuses worth polling for: the backend poller is still working on these.
const POLL_STATUSES = ['PENDING', 'RECEIVED', 'BUY_UNCERTAIN'];
const CANCELLABLE = ['PENDING', 'RECEIVED'];
const POLL_INTERVAL_MS = 5000;

export default function OrderDetailPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<'cancel' | 'finish' | null>(null);
  const [actionError, setActionError] = useState<ApiError | Error | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const o = await orderApi.get(id);
      setOrder(o);
      return o;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load order.'));
      return null;
    }
  }, [id]);

  // Initial load.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      await fetchOrder();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, fetchOrder]);

  // Poll the BACKEND every 5s while the order is open. The browser never
  // calls 5sim directly — the backend's centralised poller does that.
  useEffect(() => {
    if (!order || !POLL_STATUSES.includes(order.status)) return;
    const timer = setInterval(() => {
      void fetchOrder();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [order?.status, fetchOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCancel() {
    if (!order) return;
    if (!window.confirm('Cancel this order? You will be refunded the full price.')) return;
    setActionError(null);
    setActionBusy('cancel');
    try {
      const updated = await orderApi.cancel(order.id);
      setOrder(updated);
    } catch (err) {
      // Surfaces the backend message verbatim, e.g. the 429 CANCEL_LIMIT
      // ("max 5 cancels/hour") or 409 ORDER_HAS_SMS.
      setActionError(err instanceof Error ? err : new Error('Cancel failed.'));
    } finally {
      setActionBusy(null);
    }
  }

  async function onFinish() {
    if (!order) return;
    setActionError(null);
    setActionBusy('finish');
    try {
      const updated = await orderApi.finish(order.id);
      setOrder(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err : new Error('Finish failed.'));
    } finally {
      setActionBusy(null);
    }
  }

  if (authLoading || !user) return <div className="container"><Loading /></div>;
  if (loading) return <div className="container"><Loading /></div>;

  if (error || !order) {
    return (
      <div className="container">
        <ErrorBox error={error} />
        <p>
          <Link href="/orders">← Back to orders</Link>
        </p>
      </div>
    );
  }

  const sms = order.smsMessages ?? [];
  const latestCode = [...sms].reverse().find((m) => m.code)?.code ?? null;
  const isPolling = POLL_STATUSES.includes(order.status);

  // Timeline: which steps are done for this order's path.
  const steps: { label: string; done: boolean; when?: string | null }[] = [
    { label: 'Order placed', done: true, when: order.createdAt },
    {
      label: 'Number assigned — waiting for SMS',
      done: order.status !== 'BUY_UNCERTAIN',
      when: order.phoneNumber ? order.createdAt : null,
    },
    {
      label: 'SMS code received',
      done: sms.length > 0 || ['RECEIVED', 'FINISHED'].includes(order.status),
      when: sms[0]?.receivedAt ?? null,
    },
    {
      label: 'Order finished (auto-finish on code receipt)',
      done: order.status === 'FINISHED',
      when: order.finishedAt,
    },
    ...(order.status === 'CANCELED'
      ? [{ label: 'Order cancelled — refunded in full', done: true, when: order.cancelledAt }]
      : []),
    ...(order.status === 'TIMEOUT'
      ? [{ label: 'Timed out — refunded in full', done: true, when: order.updatedAt }]
      : []),
    ...(order.status === 'BUY_UNCERTAIN'
      ? [{ label: 'Buy outcome uncertain — reconciler is checking with the provider', done: false }]
      : []),
  ];

  return (
    <div className="container">
      <p>
        <Link href="/orders">← Back to orders</Link>
      </p>
      <div className="page-head">
        <h1>Order {order.phoneNumber ?? order.id.slice(0, 8)}</h1>
        <p className="muted">
          {order.country} / {order.product} ({order.operator}) ·{' '}
          <StatusBadge status={order.status} />
        </p>
      </div>

      <ErrorBox error={actionError} onDismiss={() => setActionError(null)} />

      {isPolling && (
        <InfoBox>
          <span>
            {order.status === 'BUY_UNCERTAIN'
              ? 'The buy outcome is uncertain — the reconciler is checking with the provider. This page refreshes every 5 seconds.'
              : 'Waiting for the SMS code — this page refreshes automatically every 5 seconds. No need to reload.'}
          </span>
        </InfoBox>
      )}

      <div className="grid-stats">
        <div className="stat">
          <div className="stat-label">Phone number</div>
          <div className="stat-value mono" style={{ fontSize: '1.25rem' }}>
            {order.phoneNumber ?? '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Price paid</div>
          <div className="stat-value">{formatMoney(order.sellPriceCents)}</div>
          <div className="stat-sub">
            Base cost {formatMoney(order.costCents)} · margin {formatMoney(order.marginCents)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Expires</div>
          <div className="stat-value" style={{ fontSize: '1.1rem' }}>
            {order.expiresAt ? formatDate(order.expiresAt) : '—'}
          </div>
          <div className="stat-sub">Deadline comes from the provider</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>SMS code</h2>
        {latestCode ? (
          <>
            <div className="sms-code">{latestCode}</div>
            <p className="muted">
              Code received — the order auto-finishes once the code is
              delivered (no action needed from you).
            </p>
          </>
        ) : (
          <p className="muted">
            No SMS code yet.{' '}
            {order.status === 'PENDING'
              ? 'The number is active and waiting for a message.'
              : order.status === 'FINISHED'
                ? 'This order finished without a stored code.'
                : 'The code will appear here as soon as it arrives.'}
          </p>
        )}
        {sms.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Sender</th>
                  <th>Text</th>
                  <th>Code</th>
                </tr>
              </thead>
              <tbody>
                {sms.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.receivedAt)}</td>
                    <td>{m.sender ?? '—'}</td>
                    <td>{m.text ?? '—'}</td>
                    <td className="mono">{m.code ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Status timeline</h2>
        <ul className="timeline">
          {steps.map((s) => (
            <li key={s.label} className={s.done ? 'done' : ''}>
              {s.label}
              {s.when ? <span className="muted"> — {formatDate(s.when)}</span> : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="btn-row">
        {CANCELLABLE.includes(order.status) && (
          <button type="button" className="btn btn-danger" onClick={onCancel} disabled={actionBusy !== null}>
            {actionBusy === 'cancel' ? 'Cancelling…' : 'Cancel order (full refund)'}
          </button>
        )}
        {order.status === 'RECEIVED' && (
          <button type="button" className="btn btn-secondary" onClick={onFinish} disabled={actionBusy !== null}>
            {actionBusy === 'finish' ? 'Finishing…' : 'Finish now'}
          </button>
        )}
      </div>
      <p className="small muted">
        Cancel limit: max 5 cancels per hour. Once an SMS has arrived the
        number can no longer be cancelled.
      </p>
    </div>
  );
}
