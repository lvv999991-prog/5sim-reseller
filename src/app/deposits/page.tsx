'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRequireAuth } from '@/lib/auth';
import { ApiError, depositApi, type Deposit, type DepositProvider } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { ErrorBox, InfoBox, Loading, StatusBadge } from '@/components/ui';

/**
 * Deposit methods offered in the UI.
 *
 * NOTE: the backend provider enum (backend/src/routes/wallet.ts) only has
 * BANK_TRANSFER | CRYPTO_USDT | MANUAL_SIM. There is no separate QR-code
 * provider, so "QR Code" is submitted as BANK_TRANSFER with the note
 * "Paid via QR code" so the reviewing admin can tell them apart. No Stripe
 * and no real payment processing anywhere in this flow — deposits are
 * manually reviewed by an admin before the wallet is credited.
 */
type UiMethod = 'BANK_TRANSFER' | 'QR_CODE' | 'CRYPTO_USDT';

const METHOD_LABELS: Record<UiMethod, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  QR_CODE: 'QR Code',
  CRYPTO_USDT: 'Crypto (USDT)',
};

function toBackendProvider(method: UiMethod): DepositProvider {
  return method === 'CRYPTO_USDT' ? 'CRYPTO_USDT' : 'BANK_TRANSFER';
}

export default function DepositsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [method, setMethod] = useState<UiMethod>('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const refresh = async () => {
    const res = await depositApi.list(25, 0);
    setDeposits(res.deposits);
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load deposits.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError(new Error('Enter an amount greater than $0.'));
      return;
    }
    const amountCents = Math.round(dollars * 100);
    setSubmitting(true);
    try {
      await depositApi.create({
        provider: toBackendProvider(method),
        amountCents,
        providerRef: reference.trim() || undefined,
        proofNote:
          method === 'QR_CODE'
            ? `Paid via QR code.${note.trim() ? ` ${note.trim()}` : ''}`
            : note.trim() || undefined,
      });
      setSuccess(true);
      setAmount('');
      setReference('');
      setNote('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Deposit request failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return <div className="container"><Loading /></div>;

  return (
    <div className="container">
      <div className="page-head">
        <h1>Deposits</h1>
        <p className="muted">Add funds to your wallet (USD only).</p>
      </div>

      <InfoBox>
        <span>
          <strong>Manual review:</strong> deposits are <strong>not</strong> credited
          automatically. An admin reviews your request (bank transfer reference
          or USDT transaction hash) and only then credits your wallet. Please
          allow time for review — a PENDING_REVIEW deposit does not change your
          balance.
        </span>
      </InfoBox>

      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {success && (
        <div className="alert alert-ok" role="status">
          <span>
            Deposit request submitted — status PENDING_REVIEW. Your wallet will
            be credited once an admin approves it.
          </span>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>New deposit request</h2>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-row">
            <label htmlFor="method">Method</label>
            <select id="method" value={method} onChange={(e) => setMethod(e.target.value as UiMethod)}>
              {(Object.keys(METHOD_LABELS) as UiMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {method === 'CRYPTO_USDT'
                ? 'Send USDT, then paste the transaction hash below as the reference.'
                : 'Transfer the funds, then paste your transfer reference below.'}
            </span>
          </div>
          <div className="form-row">
            <label htmlFor="amount">Amount (USD)</label>
            <input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
              placeholder="e.g. 10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="reference">
              {method === 'CRYPTO_USDT' ? 'Transaction hash' : 'Reference'}
            </label>
            <input
              id="reference"
              type="text"
              maxLength={200}
              placeholder={method === 'CRYPTO_USDT' ? 'USDT transaction hash' : 'Bank transfer reference'}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="note">Note (optional)</label>
            <textarea
              id="note"
              rows={2}
              maxLength={1000}
              placeholder="Anything the reviewer should know"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit deposit request'}
          </button>
        </form>
        <p className="small muted">
          No card payments, no Stripe — deposits are manual bank transfer / QR
          code and Crypto (USDT) only.
        </p>
      </div>

      <h2>Your deposits</h2>
      {loading && <Loading />}
      {!loading && deposits.length === 0 && <p className="muted">No deposits yet.</p>}
      {deposits.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th className="num">Amount</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Review note</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id}>
                  <td>{formatDate(d.createdAt)}</td>
                  <td>{d.provider === 'CRYPTO_USDT' ? 'Crypto (USDT)' : 'Bank Transfer'}</td>
                  <td className="num">{formatMoney(d.amountCents)}</td>
                  <td className="mono small">{d.providerRef ?? '—'}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="muted small">{d.reviewNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
