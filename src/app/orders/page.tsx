'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth';
import { ApiError, orderApi, type Order, type OrderStatus } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { ErrorBox, Loading, StatusBadge } from '@/components/ui';

const FILTERS: { key: string; label: string; status?: OrderStatus }[] = [
  { key: 'all', label: 'All orders' },
  { key: 'active', label: 'Active', status: undefined },
  { key: 'PENDING', label: 'Pending', status: 'PENDING' },
  { key: 'RECEIVED', label: 'Received', status: 'RECEIVED' },
  { key: 'FINISHED', label: 'Finished', status: 'FINISHED' },
  { key: 'CANCELED', label: 'Canceled', status: 'CANCELED' },
  { key: 'TIMEOUT', label: 'Timed out', status: 'TIMEOUT' },
];

export default function OrdersPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    const status = FILTERS.find((f) => f.key === filter)?.status;
    orderApi
      .list(50, 0, status)
      .then((res) => {
        if (cancelled) return;
        // "Active" is a client-side filter (PENDING + RECEIVED) — the API
        // takes a single status, so fetch all and filter locally.
        const rows =
          filter === 'active'
            ? res.orders.filter((o) => o.status === 'PENDING' || o.status === 'RECEIVED')
            : res.orders;
        setOrders(rows);
        setTotal(res.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load orders.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, filter]);

  if (authLoading || !user) return <div className="container"><Loading /></div>;

  return (
    <div className="container container-wide">
      <div className="page-head">
        <h1>Orders</h1>
        <p className="muted">
          {total} order{total === 1 ? '' : 's'} in total. Active orders are
          waiting for an SMS code; cancelled and timed-out orders are refunded
          in full from the platform float.
        </p>
      </div>

      <ErrorBox error={error} onDismiss={() => setError(null)} />

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <Loading />}
      {!loading && orders.length === 0 && (
        <p className="muted">
          No orders here yet. <Link href="/buy">Buy your first number</Link>.
        </p>
      )}

      {orders.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Country / Service</th>
                <th>Status</th>
                <th className="num">Price</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.phoneNumber ?? '—'}</td>
                  <td>
                    {o.country} / {o.product} ({o.operator})
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="num">{formatMoney(o.sellPriceCents)}</td>
                  <td>{formatDate(o.createdAt)}</td>
                  <td>
                    <Link href={`/orders/${o.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
