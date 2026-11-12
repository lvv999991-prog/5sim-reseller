'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth';
import {
  ApiError,
  catalogApi,
  orderApi,
  walletApi,
  type CatalogCountry,
  type CatalogOffer,
  type CatalogProduct,
  type Wallet,
} from '@/lib/api';
import { formatMoney, markupPercent } from '@/lib/format';
import { ErrorBox, InfoBox, Loading } from '@/components/ui';

const MAX_ACTIVE_ORDERS = 3;

export default function BuyPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();

  const [countries, setCountries] = useState<CatalogCountry[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [offers, setOffers] = useState<CatalogOffer[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  const [country, setCountry] = useState('');
  const [product, setProduct] = useState('');
  const [operator, setOperator] = useState('');

  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Catalogue countries + wallet + active-order count on mount.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [c, w, ord] = await Promise.all([
          catalogApi.countries(),
          walletApi.get(),
          orderApi.list(100, 0),
        ]);
        if (cancelled) return;
        setCountries(c);
        setWallet(w);
        setActiveCount(ord.orders.filter((o) => o.status === 'PENDING' || o.status === 'RECEIVED').length);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load the catalogue.'));
      } finally {
        if (!cancelled) setLoadingCountries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Products for the chosen country.
  useEffect(() => {
    if (!country) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    catalogApi
      .products(country)
      .then((p) => {
        if (!cancelled) setProducts(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load services.'));
      });
    return () => {
      cancelled = true;
    };
  }, [country]);

  // Offers for the chosen country + service (live cached prices from the
  // backend — never fetched from 5sim in the browser).
  const loadOffers = async (c: string, p: string) => {
    setLoadingOffers(true);
    try {
      const o = await catalogApi.offers({ country: c, product: p, limit: 100 });
      setOffers(o);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load prices.'));
    } finally {
      setLoadingOffers(false);
    }
  };

  useEffect(() => {
    if (!country || !product) {
      setOffers([]);
      return;
    }
    void loadOffers(country, product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, product]);

  const operators = useMemo(() => [...new Set(offers.map((o) => o.operator))].sort(), [offers]);
  const selectedOffer = useMemo(
    () => offers.find((o) => o.operator === operator) ?? null,
    [offers, operator],
  );
  const markup = selectedOffer ? markupPercent(selectedOffer) : null;
  const insufficient = !!selectedOffer && !!wallet && wallet.availableCents < selectedOffer.sellPriceCents;
  const atOrderLimit = activeCount >= MAX_ACTIVE_ORDERS;

  function pickCountry(value: string) {
    setCountry(value);
    setProduct('');
    setOperator('');
    setOffers([]);
    setError(null);
    setNotice(null);
  }

  function pickProduct(value: string) {
    setProduct(value);
    setOperator('');
    setError(null);
    setNotice(null);
  }

  async function onBuy() {
    if (!selectedOffer || !country || !product) return;
    setError(null);
    setNotice(null);
    setBuying(true);
    try {
      const order = await orderApi.create({
        country,
        product,
        operator: selectedOffer.operator,
        seenPriceCents: selectedOffer.sellPriceCents,
        requestIdempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `buy-${Date.now()}`,
      });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_CHANGED') {
        // Price drift guard (backend, 10% tolerance): the price moved since
        // it was displayed. Refresh the cached prices and ask the user to
        // confirm the new price by pressing Buy again.
        const details = (err.details ?? {}) as { newPriceCents?: number };
        setNotice(
          `The price changed${details.newPriceCents ? ` to ${formatMoney(details.newPriceCents)}` : ''} ` +
            `since it was shown. Prices have been refreshed — review the new price and press Buy again to confirm.`,
        );
        await loadOffers(country, product);
        const w = await walletApi.get().catch(() => null);
        if (w) setWallet(w);
      } else {
        // All other failures (INSUFFICIENT_FUNDS, ACTIVE_ORDER_LIMIT 429,
        // CANCEL_LIMIT, NO_NUMBERS_AVAILABLE, …) surface the API's message.
        setError(err instanceof Error ? err : new Error('Purchase failed.'));
      }
    } finally {
      setBuying(false);
    }
  }

  if (authLoading || !user) return <div className="container"><Loading /></div>;

  return (
    <div className="container container-wide">
      <div className="page-head">
        <h1>Buy a number</h1>
        <p className="muted">
          Pick a country and service, choose an operator, and buy a virtual
          number for SMS verification. Wallet balance:{' '}
          <strong>{wallet ? formatMoney(wallet.availableCents) : '…'}</strong> available
          {wallet && wallet.heldCents > 0 ? ` (${formatMoney(wallet.heldCents)} on hold)` : ''}.
          {' '}Active orders: {activeCount} / {MAX_ACTIVE_ORDERS}.
        </p>
      </div>

      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="alert alert-info" role="status">
          <span>{notice}</span>
        </div>
      )}
      {atOrderLimit && (
        <InfoBox>
          <span>
            You already have {MAX_ACTIVE_ORDERS} active orders — the per-user
            limit. Finish or cancel one before buying another number.
          </span>
        </InfoBox>
      )}

      <div className="card">
        <div className="form" style={{ maxWidth: 'none' }}>
          <div className="form-row">
            <label htmlFor="country">Country</label>
            <select id="country" value={country} onChange={(e) => pickCountry(e.target.value)} disabled={loadingCountries}>
              <option value="">Select a country…</option>
              {countries.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nameEn ?? c.slug}
                  {c.prefix ? ` (${c.prefix})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="product">Service</label>
            <select
              id="product"
              value={product}
              onChange={(e) => pickProduct(e.target.value)}
              disabled={!country || products.length === 0}
            >
              <option value="">Select a service…</option>
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.displayName ?? p.slug}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="operator">Operator</label>
            <select
              id="operator"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              disabled={operators.length === 0}
            >
              <option value="">Select an operator…</option>
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op === 'any' ? 'Any operator' : op}
                </option>
              ))}
            </select>
            <span className="field-hint">“Any operator” lets the platform pick the cheapest available one.</span>
          </div>
        </div>
      </div>

      {loadingOffers && <Loading label="Loading prices…" />}
      {!loadingOffers && country && product && offers.length === 0 && (
        <p className="muted">No numbers in stock for this country / service right now.</p>
      )}

      {offers.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Operator</th>
                <th className="num">In stock</th>
                <th className="num">Delivery rate</th>
                <th className="num">Base cost</th>
                <th className="num">Markup</th>
                <th className="num">Sell price</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr
                  key={`${o.countrySlug}/${o.productSlug}/${o.operator}`}
                  className={`offer-row ${operator === o.operator ? 'selected' : ''}`}
                  onClick={() => setOperator(o.operator)}
                >
                  <td>{o.operator === 'any' ? 'Any operator' : o.operator}</td>
                  <td className="num">{o.stockCount}</td>
                  <td className="num">{o.deliveryRatePct !== null ? `${Number(o.deliveryRatePct).toFixed(1)}%` : '—'}</td>
                  <td className="num">{formatMoney(o.costCents)}</td>
                  <td className="num">
                    {(() => {
                      const m = markupPercent(o);
                      return m === null ? '—' : `+${m.toFixed(0)}%`;
                    })()}
                  </td>
                  <td className="num">
                    <strong>{formatMoney(o.sellPriceCents)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            Prices are the backend&apos;s cached catalogue prices (USD). The
            final sell price is checked again at buy time — if it moved more
            than the drift tolerance, the purchase pauses for confirmation
            instead of charging more.
          </p>
        </div>
      )}

      {selectedOffer && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your selection</h2>
          <p>
            {selectedOffer.countrySlug} / {selectedOffer.productSlug} —{' '}
            {selectedOffer.operator === 'any' ? 'any operator' : selectedOffer.operator}
          </p>
          <p>
            Base cost {formatMoney(selectedOffer.costCents)}
            {' '}· markup {markup !== null ? `+${markup.toFixed(1)}%` : '—'}
            {' '}· <strong>you pay {formatMoney(selectedOffer.sellPriceCents)}</strong>
          </p>
          {insufficient && (
            <div className="alert alert-error" role="alert">
              <span>
                Insufficient balance — this number costs {formatMoney(selectedOffer.sellPriceCents)} but
                you have {wallet ? formatMoney(wallet.availableCents) : '…'} available.{' '}
                <a href="/deposits">Add funds</a> first.
              </span>
            </div>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={onBuy}
              disabled={buying || insufficient || atOrderLimit}
            >
              {buying ? 'Buying…' : `Buy number — ${formatMoney(selectedOffer.sellPriceCents)}`}
            </button>
          </div>
          <p className="small muted">
            Buying places a hold on your wallet for the sell price. If no SMS
            arrives before the number expires, you are refunded in full.
          </p>
        </div>
      )}
    </div>
  );
}
