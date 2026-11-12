'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRequireAdmin } from '@/lib/auth';
import {
  ApiError,
  adminApi,
  type AdminOverview,
  type Deposit,
  type PricingRule,
  type PricingScope,
  type MarkupType,
  type SyncRun,
} from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { ErrorBox, InfoBox, Loading, StatusBadge } from '@/components/ui';

interface RuleForm {
  scope: PricingScope;
  countrySlug: string;
  productSlug: string;
  operator: string;
  markupType: MarkupType;
  markupValue: string;
  minMarginCents: string;
  priceFloorCents: string;
  roundingStepCents: string;
  priority: string;
  isActive: boolean;
}

const EMPTY_FORM: RuleForm = {
  scope: 'GLOBAL',
  countrySlug: '',
  productSlug: '',
  operator: '',
  markupType: 'PERCENT',
  markupValue: '40',
  minMarginCents: '5',
  priceFloorCents: '10',
  roundingStepCents: '5',
  priority: '100',
  isActive: true,
};

export default function AdminPage() {
  const { user, loading: authLoading } = useRequireAdmin();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleMsg, setRuleMsg] = useState<string | null>(null);

  const refreshAll = async () => {
    const [ov, dep, r, runs] = await Promise.all([
      adminApi.overview(),
      adminApi.deposits('PENDING_REVIEW', 25, 0),
      adminApi.pricingRules(),
      adminApi.syncRuns(10, 0),
    ]);
    setOverview(ov);
    setDeposits(dep.deposits);
    setRules(r);
    setSyncRuns(runs);
  };

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    let cancelled = false;
    (async () => {
      try {
        await refreshAll();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load admin data.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function reviewDeposit(id: string, decision: 'APPROVED' | 'REJECTED') {
    setReviewBusy(id);
    setError(null);
    try {
      await adminApi.reviewDeposit(id, {
        decision,
        reviewNote: reviewNotes[id]?.trim() || undefined,
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Review failed.'));
    } finally {
      setReviewBusy(null);
    }
  }

  async function triggerSync() {
    setSyncBusy(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await adminApi.syncCatalog();
      setSyncMsg(`Catalogue sync queued (job ${res.jobId}). Refresh the sync runs below to see the result.`);
      const runs = await adminApi.syncRuns(10, 0);
      setSyncRuns(runs);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Sync failed.'));
    } finally {
      setSyncBusy(false);
    }
  }

  function startEdit(rule: PricingRule) {
    setEditingId(rule.id);
    setForm({
      scope: rule.scope,
      countrySlug: rule.countrySlug ?? '',
      productSlug: rule.productSlug ?? '',
      operator: rule.operator ?? '',
      markupType: rule.markupType,
      markupValue: String(rule.markupValue),
      minMarginCents: String(rule.minMarginCents),
      priceFloorCents: String(rule.priceFloorCents),
      roundingStepCents: String(rule.roundingStepCents),
      priority: String(rule.priority),
      isActive: rule.isActive,
    });
    setRuleMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setRuleMsg(null);
  }

  async function submitRule(e: FormEvent) {
    e.preventDefault();
    setRuleMsg(null);
    setError(null);
    const markupValue = Number(form.markupValue);
    if (!Number.isInteger(markupValue) || markupValue < 0 || markupValue > 1000) {
      setError(new Error('Markup value must be a whole number between 0 and 1000.'));
      return;
    }
    setRuleBusy(true);
    try {
      if (editingId) {
        // PATCH only accepts the markup fields — scope/targets are immutable.
        await adminApi.updatePricingRule(editingId, {
          markupType: form.markupType,
          markupValue,
          minMarginCents: Number(form.minMarginCents),
          priceFloorCents: Number(form.priceFloorCents),
          roundingStepCents: Number(form.roundingStepCents),
          priority: Number(form.priority),
          isActive: form.isActive,
        });
        setRuleMsg('Pricing rule updated.');
      } else {
        await adminApi.createPricingRule({
          scope: form.scope,
          countrySlug: form.countrySlug.trim() || undefined,
          productSlug: form.productSlug.trim() || undefined,
          operator: form.operator.trim() || undefined,
          markupType: form.markupType,
          markupValue,
          minMarginCents: Number(form.minMarginCents),
          priceFloorCents: Number(form.priceFloorCents),
          roundingStepCents: Number(form.roundingStepCents),
          priority: Number(form.priority),
          isActive: form.isActive,
        });
        setRuleMsg('Pricing rule created.');
      }
      cancelEdit();
      const r = await adminApi.pricingRules();
      setRules(r);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to save pricing rule.'));
    } finally {
      setRuleBusy(false);
    }
  }

  async function deleteRule(rule: PricingRule) {
    if (!window.confirm(`Delete pricing rule ${rule.scope} (${rule.markupValue}${rule.markupType === 'PERCENT' ? '%' : '¢'})?`)) return;
    setError(null);
    try {
      await adminApi.deletePricingRule(rule.id);
      setRules(await adminApi.pricingRules());
    } catch (err) {
      // e.g. CANNOT_DELETE_LAST_GLOBAL — the backend refuses to remove the
      // last GLOBAL fallback rule.
      setError(err instanceof Error ? err : new Error('Delete failed.'));
    }
  }

  if (authLoading || !user) return <div className="container"><Loading /></div>;
  if (user.role !== 'ADMIN') {
    return (
      <div className="container">
        <InfoBox>
          <span>Admin access required. Redirecting to the dashboard…</span>
        </InfoBox>
      </div>
    );
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <h1>Admin</h1>
        <p className="muted">Deposit review, pricing rules, catalogue sync and platform overview.</p>
      </div>

      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {loading && <Loading />}

      {overview && (
        <div className="grid-stats">
          <div className="stat">
            <div className="stat-label">Users</div>
            <div className="stat-value">{overview.users}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Open orders</div>
            <div className="stat-value">{overview.openOrders}</div>
            <div className="stat-sub">PENDING / RECEIVED / BUY_UNCERTAIN</div>
          </div>
          <div className="stat">
            <div className="stat-label">Deposits pending review</div>
            <div className="stat-value">{overview.pendingDeposits}</div>
          </div>
          <div className="stat">
            <div className="stat-label">5sim master balance</div>
            <div className="stat-value">{overview.master.balance !== null ? `$${overview.master.balance.toFixed(2)}` : '—'}</div>
            <div className="stat-sub">
              Frozen: {overview.master.frozenBalance !== null ? `$${overview.master.frozenBalance.toFixed(2)}` : '—'}
              {' · '}Rating: {overview.master.rating !== null ? overview.master.rating : '—'}
            </div>
          </div>
        </div>
      )}

      <h2>Deposits pending review</h2>
      {deposits.length === 0 && !loading && <p className="muted">No deposits awaiting review.</p>}
      {deposits.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th className="num">Amount</th>
                <th>Reference</th>
                <th>Note</th>
                <th>Review note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id}>
                  <td>{formatDate(d.createdAt)}</td>
                  <td>{d.provider === 'CRYPTO_USDT' ? 'Crypto (USDT)' : 'Bank Transfer'}</td>
                  <td className="num">{formatMoney(d.amountCents)}</td>
                  <td className="mono small">{d.providerRef ?? '—'}</td>
                  <td className="small muted">{d.proofNote ?? '—'}</td>
                  <td>
                    <input
                      type="text"
                      placeholder="Review note (optional)"
                      value={reviewNotes[d.id] ?? ''}
                      onChange={(e) => setReviewNotes((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      style={{ minWidth: 140 }}
                    />
                  </td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn"
                        disabled={reviewBusy === d.id}
                        onClick={() => void reviewDeposit(d.id, 'APPROVED')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={reviewBusy === d.id}
                        onClick={() => void reviewDeposit(d.id, 'REJECTED')}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            Approving credits the user&apos;s wallet; rejecting does not. The
            user sees the review note on their Deposits page.
          </p>
        </div>
      )}

      <h2>Pricing rules</h2>
      <p className="muted small">
        Most specific scope wins: OFFER &gt; OPERATOR &gt; COUNTRY &gt; PRODUCT &gt; GLOBAL.
        Default global markup is 40% (owner-approved 30–50% band). The last
        GLOBAL rule cannot be deleted — a fallback markup must always exist.
      </p>
      {rules.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scope</th>
                <th>Target</th>
                <th>Markup</th>
                <th className="num">Min margin</th>
                <th className="num">Floor</th>
                <th className="num">Round step</th>
                <th className="num">Priority</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.scope}</td>
                  <td className="small">
                    {[r.countrySlug, r.productSlug, r.operator].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td>
                    {r.markupType === 'PERCENT' ? `+${r.markupValue}%` : `+${formatMoney(r.markupValue)}`}
                  </td>
                  <td className="num">{formatMoney(r.minMarginCents)}</td>
                  <td className="num">{formatMoney(r.priceFloorCents)}</td>
                  <td className="num">{formatMoney(r.roundingStepCents)}</td>
                  <td className="num">{r.priority}</td>
                  <td>{r.isActive ? 'Yes' : 'No'}</td>
                  <td>
                    <div className="btn-row">
                      <button type="button" className="btn btn-secondary" onClick={() => startEdit(r)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => void deleteRule(r)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit pricing rule' : 'Create pricing rule'}</h3>
        {editingId && (
          <p className="small muted">
            Editing only changes the markup fields — scope and target cannot be
            changed after creation. Delete and recreate to change the target.
          </p>
        )}
        {ruleMsg && (
          <div className="alert alert-ok" role="status">
            <span>{ruleMsg}</span>
          </div>
        )}
        <form className="form" style={{ maxWidth: 560 }} onSubmit={submitRule}>
          <div className="form-row">
            <label htmlFor="scope">Scope</label>
            <select
              id="scope"
              value={form.scope}
              disabled={!!editingId}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as PricingScope }))}
            >
              {(['GLOBAL', 'COUNTRY', 'PRODUCT', 'OPERATOR', 'OFFER'] as PricingScope[]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {form.scope !== 'GLOBAL' && (
            <>
              <div className="form-row">
                <label htmlFor="countrySlug">Country slug</label>
                <input
                  id="countrySlug"
                  type="text"
                  placeholder="e.g. usa"
                  disabled={!!editingId}
                  value={form.countrySlug}
                  onChange={(e) => setForm((f) => ({ ...f, countrySlug: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label htmlFor="productSlug">Product slug</label>
                <input
                  id="productSlug"
                  type="text"
                  placeholder="e.g. whatsapp"
                  disabled={!!editingId}
                  value={form.productSlug}
                  onChange={(e) => setForm((f) => ({ ...f, productSlug: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label htmlFor="operator">Operator</label>
                <input
                  id="operator"
                  type="text"
                  placeholder="e.g. any"
                  disabled={!!editingId}
                  value={form.operator}
                  onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                />
              </div>
            </>
          )}
          <div className="form-row">
            <label htmlFor="markupType">Markup type</label>
            <select
              id="markupType"
              value={form.markupType}
              onChange={(e) => setForm((f) => ({ ...f, markupType: e.target.value as MarkupType }))}
            >
              <option value="PERCENT">Percent (%)</option>
              <option value="FIXED">Fixed fee (cents)</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="markupValue">
              Markup value {form.markupType === 'PERCENT' ? '(whole %, 40 = +40%)' : '(cents)'}
            </label>
            <input
              id="markupValue"
              type="number"
              min={0}
              max={1000}
              step={1}
              required
              value={form.markupValue}
              onChange={(e) => setForm((f) => ({ ...f, markupValue: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="minMarginCents">Min margin (cents)</label>
            <input
              id="minMarginCents"
              type="number"
              min={0}
              step={1}
              value={form.minMarginCents}
              onChange={(e) => setForm((f) => ({ ...f, minMarginCents: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="priceFloorCents">Price floor (cents)</label>
            <input
              id="priceFloorCents"
              type="number"
              min={0}
              step={1}
              value={form.priceFloorCents}
              onChange={(e) => setForm((f) => ({ ...f, priceFloorCents: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="roundingStepCents">Rounding step (cents)</label>
            <input
              id="roundingStepCents"
              type="number"
              min={1}
              step={1}
              value={form.roundingStepCents}
              onChange={(e) => setForm((f) => ({ ...f, roundingStepCents: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="priority">Priority (higher wins ties)</label>
            <input
              id="priority"
              type="number"
              step={1}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                style={{ width: 'auto' }}
              />{' '}
              Active
            </label>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn" disabled={ruleBusy}>
              {ruleBusy ? 'Saving…' : editingId ? 'Save changes' : 'Create rule'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </div>

      <h2>Catalogue sync</h2>
      <div className="card">
        <p className="muted">
          Re-sync the cached catalogue from the provider (via the backend
          worker). The storefront always serves the cached catalogue, never
          live provider data.
        </p>
        {syncMsg && (
          <div className="alert alert-ok" role="status">
            <span>{syncMsg}</span>
          </div>
        )}
        <button type="button" className="btn" onClick={() => void triggerSync()} disabled={syncBusy}>
          {syncBusy ? 'Queueing…' : 'Trigger catalogue sync'}
        </button>
        {syncRuns.length > 0 && (
          <>
            <h3>Recent sync runs</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th className="num">Seen</th>
                    <th className="num">Changed</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncRuns.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.startedAt)}</td>
                      <td>{r.kind}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="num">{r.itemsSeen ?? '—'}</td>
                      <td className="num">{r.itemsChanged ?? '—'}</td>
                      <td className="small muted">{r.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
