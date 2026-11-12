/**
 * Typed API client for the 5sim reseller backend.
 *
 * ALL data comes from the backend (NEXT_PUBLIC_API_URL, default
 * http://localhost:3000). This client NEVER calls https://5sim.net and never
 * handles the 5sim master API key.
 *
 * Backend error shape (see backend/src/app.ts error handler):
 *   { code: string, message: string, details?: unknown }
 * with the HTTP status (401 UNAUTHORIZED, 409 PRICE_CHANGED, 429 limits, ...).
 * This client surfaces `code` + `message` verbatim so the UI can show the
 * backend's own wording (e.g. the 429 active-order / cancel-limit messages).
 */

// ---------------------------------------------------------------- types ---

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Wallet {
  currency: string;
  balanceCents: number;
  availableCents: number;
  heldCents: number;
}

export type WalletTxType =
  | 'DEPOSIT_CREDIT'
  | 'PURCHASE_DEBIT'
  | 'REFUND_CREDIT'
  | 'ADMIN_ADJUSTMENT'
  | 'FEE'
  | 'WITHDRAWAL';

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: WalletTxType;
  amountCents: number;
  balanceAfterCents: number;
  orderId: string | null;
  depositId: string | null;
  idempotencyKey: string;
  note: string | null;
  metadata: unknown;
  createdAt: string;
}

export type DepositProvider = 'BANK_TRANSFER' | 'CRYPTO_USDT' | 'MANUAL_SIM';
export type DepositStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED';

export interface Deposit {
  id: string;
  userId: string;
  provider: DepositProvider;
  providerRef: string | null;
  amountCents: number;
  feeCents: number;
  status: DepositStatus;
  proofNote: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogCountry {
  slug: string;
  nameEn: string | null;
  prefix: string | null;
  isActive: boolean;
}

export interface CatalogProduct {
  slug: string;
  displayName: string | null;
  category: string | null;
  isActive: boolean;
}

export interface CatalogOffer {
  countrySlug: string;
  productSlug: string;
  operator: string;
  costCents: number;
  stockCount: number;
  deliveryRatePct: number | null;
  sellPriceCents: number;
  syncedAt: string;
}

export type OrderStatus =
  | 'BUY_UNCERTAIN'
  | 'PENDING'
  | 'RECEIVED'
  | 'FINISHED'
  | 'CANCELED'
  | 'TIMEOUT'
  | 'BANNED'
  | 'FAILED';

export interface SmsMessage {
  id: string;
  orderId: string;
  sender: string | null;
  text: string | null;
  code: string | null;
  receivedAt: string;
  fivesimSmsKey: string;
}

export interface Order {
  id: string;
  fivesimOrderId: number | null;
  userId: string;
  country: string;
  product: string;
  operator: string;
  phoneNumber: string | null;
  status: OrderStatus;
  costCents: number;
  sellPriceCents: number;
  marginCents: number;
  pricingRuleSnapshot: unknown;
  expiresAt: string | null;
  pollAttempts: number;
  nextPollAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  smsMessages?: SmsMessage[];
}

export interface Paginated<T> {
  total: number;
  limit: number;
  offset: number;
}

export type PricingScope = 'GLOBAL' | 'COUNTRY' | 'PRODUCT' | 'OPERATOR' | 'OFFER';
export type MarkupType = 'PERCENT' | 'FIXED';

export interface PricingRule {
  id: string;
  scope: PricingScope;
  productSlug: string | null;
  countrySlug: string | null;
  operator: string | null;
  markupType: MarkupType;
  markupValue: number; // PERCENT: whole percent (40 = +40%). FIXED: cents.
  minMarginCents: number;
  priceFloorCents: number;
  roundingStepCents: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverview {
  users: number;
  openOrders: number;
  pendingDeposits: number;
  master: {
    balance: number | null;
    frozenBalance: number | null;
    rating: number | null;
  };
}

export interface SyncRun {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsSeen: number | null;
  itemsChanged: number | null;
  error: string | null;
}

// ------------------------------------------------------------- client ---

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

const TOKEN_KEY = '5sim_token';
const USER_KEY = '5sim_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveSession(user: User, token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Set false for public endpoints (catalogue) — still sends the token if present. */
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the API at ${API_URL}. Is the backend running?`);
  }

  if (res.status === 401) {
    // Session expired / invalid — drop it and send the user to login.
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please log in again.');
  }

  // 204 No Content (e.g. DELETE pricing rule).
  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const body = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      res.status,
      body.code ?? 'REQUEST_FAILED',
      body.message ?? `Request failed (${res.status}).`,
      body.details,
    );
  }
  return data as T;
}

// ----------------------------------------------------------- endpoints ---

export const authApi = {
  register: (body: { email: string; password: string; displayName?: string }) =>
    api<AuthResponse>('/api/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    api<AuthResponse>('/api/auth/login', { method: 'POST', body }),
  me: () => api<User>('/api/auth/me'),
};

export const walletApi = {
  get: () => api<Wallet>('/api/wallet'),
  transactions: (limit = 25, offset = 0) =>
    api<Paginated<WalletTransaction> & { transactions: WalletTransaction[] }>(
      `/api/wallet/transactions?limit=${limit}&offset=${offset}`,
    ),
};

export const depositApi = {
  create: (body: { provider: DepositProvider; amountCents: number; providerRef?: string; proofNote?: string }) =>
    api<Deposit>('/api/deposits', { method: 'POST', body }),
  list: (limit = 25, offset = 0) =>
    api<Paginated<Deposit> & { deposits: Deposit[] }>(`/api/deposits?limit=${limit}&offset=${offset}`),
};

export const catalogApi = {
  countries: () => api<CatalogCountry[]>('/api/catalog/countries'),
  products: (country?: string) =>
    api<CatalogProduct[]>(`/api/catalog/products${country ? `?country=${encodeURIComponent(country)}` : ''}`),
  offers: (params: { country?: string; product?: string; operator?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.country) q.set('country', params.country);
    if (params.product) q.set('product', params.product);
    if (params.operator) q.set('operator', params.operator);
    q.set('limit', String(params.limit ?? 100));
    return api<CatalogOffer[]>(`/api/catalog/offers?${q.toString()}`);
  },
};

export const orderApi = {
  create: (body: { country: string; product: string; operator: string; seenPriceCents?: number; requestIdempotencyKey?: string }) =>
    api<Order>('/api/orders', { method: 'POST', body }),
  list: (limit = 25, offset = 0, status?: string) =>
    api<Paginated<Order> & { orders: Order[] }>(
      `/api/orders?limit=${limit}&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    ),
  get: (id: string) => api<Order>(`/api/orders/${encodeURIComponent(id)}`),
  cancel: (id: string) => api<Order>(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  finish: (id: string) => api<Order>(`/api/orders/${encodeURIComponent(id)}/finish`, { method: 'POST' }),
};

export const adminApi = {
  overview: () => api<AdminOverview>('/api/admin/overview'),
  deposits: (status?: string, limit = 25, offset = 0) =>
    api<Paginated<Deposit> & { deposits: Deposit[] }>(
      `/api/admin/deposits?limit=${limit}&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    ),
  reviewDeposit: (id: string, body: { decision: 'APPROVED' | 'REJECTED'; reviewNote?: string }) =>
    api<Deposit>(`/api/admin/deposits/${encodeURIComponent(id)}/review`, { method: 'POST', body }),
  pricingRules: () => api<PricingRule[]>('/api/admin/pricing-rules'),
  createPricingRule: (body: {
    scope: PricingScope;
    countrySlug?: string;
    productSlug?: string;
    operator?: string;
    markupType?: MarkupType;
    markupValue: number;
    minMarginCents?: number;
    priceFloorCents?: number;
    roundingStepCents?: number;
    priority?: number;
    isActive?: boolean;
  }) => api<PricingRule>('/api/admin/pricing-rules', { method: 'POST', body }),
  updatePricingRule: (id: string, body: Partial<Pick<PricingRule, 'markupType' | 'markupValue' | 'minMarginCents' | 'priceFloorCents' | 'roundingStepCents' | 'priority' | 'isActive'>>) =>
    api<PricingRule>(`/api/admin/pricing-rules/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deletePricingRule: (id: string) =>
    api<void>(`/api/admin/pricing-rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  syncCatalog: () => api<{ queued: boolean; jobId: string }>('/api/admin/sync/catalog', { method: 'POST' }),
  syncRuns: (limit = 25, offset = 0) =>
    api<SyncRun[]>(`/api/admin/sync-runs?limit=${limit}&offset=${offset}`),
  reconcileMaster: () => api<unknown>('/api/admin/reconcile/master', { method: 'POST' }),
  adminOrders: (status?: string, limit = 25, offset = 0) =>
    api<Paginated<Order> & { orders: Order[] }>(
      `/api/admin/orders?limit=${limit}&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    ),
};
