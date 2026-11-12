'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth';
import { ApiError, orderApi, walletApi, type Order, type Wallet, type WalletTransaction } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { ErrorBox, Loading, StatusBadge } from '@/components/ui';

const ACTIVE_STATUSES = ['PENDING', 'RECEIVED'];

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [w, tx, ord] = await Promise.all([
          walletApi.get(),
          walletApi.transactions(10, 0),
          orderApi.list(100, 0),
        ]);
        if (cancelled) return;
        setWallet(w);
        setTransactions(tx.transactions);
        setOrders(ord.orders);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load dashboard.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || !user) return <div className="container"><Loading /></div>;

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  // Total spent: sell price of orders that reached RECEIVED/FINISHED (i.e. paid
  // for a number that delivered a code). Cancelled / timed-out orders are
  // refunded in full, so they do not count.
  const totalSpentCents = orders
    .filter((o) => o.status === 'RECEIVED' || o.status === 'FINISHED')
    .reduce((sum, o) => sum + o.sellPriceCents, 0);

  return (
    <div className="container">
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">Welcome back, {user.displayName ?? user.email}.</p>
      </div>

      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {loading && <Loading />}

      {wallet && (
        <div className="grid-stats">
          <div className="stat">
            <div className="stat-label">Wallet balance</div>
            <div className="stat-value">{formatMoney(wallet.balanceCents)}</div>
            <div className="stat-sub">{wallet.currency}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Available to spend</div>
            <div className="stat-value">{formatMoney(wallet.availableCents)}</div>
            <div className="stat-sub">
              {wallet.heldCents > 0 ? `${formatMoney(wallet.heldCents)} held by open orders` : 'No funds on hold'}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Active orders</div>
            <div className="stat-value">{activeOrders.length} / 3</div>
            <div className="stat-sub">Max 3 concurrent orders</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total spent</div>
            <div className="stat-value">{formatMoney(totalSpentCents)}</div>
            <div className="stat-sub">Received / finished orders</div>
          </div>
        </div>
      )}

      <div className="btn-row" style={{ marginBottom: '1rem' }}>
        <Link href="/buy" className="btn">Buy a number</Link>
        <Link href="/deposits" className="btn btn-secondary">Add funds</Link>
      </div>

      <h2>Recent transactions</h2>
      {transactions.length === 0 && !loading ? (
        <p className="muted">No transactions yet. Add funds on the Deposits page to get started.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Note</th>
                <th className="num">Amount</th>
                <th className="num">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.createdAt)}</td>
                  <td>{t.type.replace(/_/g, ' ')}</td>
                  <td className="muted">{t.note ?? '—'}</td>
                  <td className={`num ${t.amountCents >= 0 ? 'positive' : 'negative'}`}>
                    {t.amountCents >= 0 ? '+' : ''}
                    {formatMoney(t.amountCents)}
                  </td>
                  <td className="num">{formatMoney(t.balanceAfterCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Active orders</h2>
      {activeOrders.length === 0 && !loading ? (
        <p className="muted">No active orders.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Country / Service</th>
                <th>Status</th>
                <th className="num">Price</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {activeOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`}>{o.phoneNumber ?? '—'}</Link>
                  </td>
                  <td>
                    {o.country} / {o.product} ({o.operator})
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="num">{formatMoney(o.sellPriceCents)}</td>
                  <td>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
