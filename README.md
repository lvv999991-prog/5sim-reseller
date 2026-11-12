# 5sim Reseller — Frontend

Next.js 14 (App Router, TypeScript) storefront for the 5sim reseller
platform. **All data comes from the reseller backend** (`NEXT_PUBLIC_API_URL`,
default `http://localhost:3000`). The frontend **never** calls
`https://5sim.net` directly and never handles the 5sim master API key.

## Setup

```bash
cp .env.example .env.local   # adjust NEXT_PUBLIC_API_URL if the backend is elsewhere
npm install
npm run dev                  # http://localhost:3000 (Next dev server, :3000 by default — use -p 3001 if the backend already occupies :3000)
npm run build                # production build (must pass)
npm start                    # serve the production build
```

The backend must be running first (see `../backend/README.md`):
`docker compose up -d && npm run dev` in `../backend`, plus `npm run worker`
for the SMS poller / catalogue sync.

> Note: Next's dev server defaults to port 3000, the same port the backend
> uses. If you run both locally, start the frontend with
> `npm run dev -- -p 3001` (the API base stays `http://localhost:3000`).

## Pages

| Page | What it does |
| --- | --- |
| `/login`, `/register` | Email + password auth. Stores the JWT + user in `localStorage`, redirects to `/dashboard`. |
| `/dashboard` | Wallet balance, available = balance − holds, active orders (x / 3), total spent, recent transactions. |
| `/deposits` | Manual deposit requests (Bank Transfer / QR Code / Crypto USDT) + own deposit list. Deposits are **manually reviewed by an admin** before the wallet is credited. No Stripe, no real payment processing. |
| `/buy` | Country → service → operator, live cached prices with base cost, markup % and final sell price; buy is disabled on insufficient balance. |
| `/orders` | Active orders + full history, filterable by status. |
| `/orders/[id]` | Number, status timeline, SMS code (polls the backend every 5 s while PENDING/RECEIVED/BUY_UNCERTAIN), cancel while cancellable, auto-finish note. |
| `/admin` | Admin only (non-admins are redirected): overview stats, deposit approve/reject, pricing rules CRUD, catalogue sync trigger + sync runs. |

## API endpoints used (all under the backend base URL)

| Page | Endpoints |
| --- | --- |
| Auth (`lib/auth.tsx`, login/register) | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` |
| Dashboard | `GET /api/wallet`, `GET /api/wallet/transactions?limit=10`, `GET /api/orders?limit=100` |
| Deposits | `POST /api/deposits`, `GET /api/deposits` |
| Buy | `GET /api/catalog/countries`, `GET /api/catalog/products?country=`, `GET /api/catalog/offers?country=&product=`, `GET /api/wallet`, `GET /api/orders?limit=100` (active count), `POST /api/orders` |
| Orders | `GET /api/orders?limit=&offset=&status=` |
| Order detail | `GET /api/orders/:id` (polled), `POST /api/orders/:id/cancel`, `POST /api/orders/:id/finish` |
| Admin | `GET /api/admin/overview`, `GET /api/admin/deposits?status=PENDING_REVIEW`, `POST /api/admin/deposits/:id/review`, `GET/POST/PATCH/DELETE /api/admin/pricing-rules`, `POST /api/admin/sync/catalog`, `GET /api/admin/sync-runs` |

## How it works

- **Auth** — JWT in `localStorage` (`5sim_token`), sent as
  `Authorization: Bearer <token>` by `src/lib/api.ts`. A 401 clears the
  session and redirects to `/login`. `src/lib/auth.tsx` provides the session
  context plus `useRequireAuth` / `useRequireAdmin` guards.
- **Errors** — the backend returns `{ code, message, details? }`; the client
  surfaces `code` + `message` verbatim, so limit errors (429
  `ACTIVE_ORDER_LIMIT` / `CANCEL_LIMIT`), price drift (409 `PRICE_CHANGED`)
  and insufficient funds show the API's own wording.
- **Money** — integer cents everywhere, USD-only, displayed as dollars
  (`src/lib/format.ts`).
- **Pricing** — sell price comes from the backend's cached catalogue offers;
  markup % shown on `/buy` is derived as `(sell − cost) / cost`. Default
  global markup is 40% (owner-approved 30–50% band). On a 409
  `PRICE_CHANGED` the buy page refreshes prices and asks the user to confirm
  the new price before retrying.
- **Deposits** — the backend provider enum has no QR-code value, so the
  “QR Code” option is submitted as `BANK_TRANSFER` with “Paid via QR code”
  in the note, so the reviewing admin can tell them apart.
- **Orders** — per-user limits: max 3 active concurrent orders, max 5
  cancels/hour (backend-enforced; the 429 message is shown). When a valid SMS
  code arrives the backend auto-finishes the order; the detail page also
  offers a manual Finish as a safeguard. Cancelled / timed-out orders are
  refunded in full from the platform float.

## Deliberate stubs / TODOs

- **No in-app notifications** for SMS codes — the code is visible on the
  order detail page (polled) and in the orders list, matching the backend's
  “visible via the orders API” scope. Push/email hooks are out of scope.
- **No pagination controls** on the orders/deposits lists (first 25–50 rows
  only); the API supports `limit`/`offset` if paging is added later.
- **No `MANUAL_SIM` deposit option** in the UI — it is a dev-only backend
  simulation provider and must not be offered to real users.
- **No admin order list / reconciliation UI** — the backend exposes
  `GET /api/admin/orders`, `POST /api/admin/reconcile/master` and
  `POST /api/admin/reconcile/uncertain/:orderId`, but they are not wired into
  the admin page yet; add them if admin reconciliation work moves to the UI.
- **No email verification UI** — the backend notes a TODO to enforce
  `emailVerifiedAt` before first purchase once a mailer exists.

## Constraints honoured

- No 5sim calls from the browser, no master API key in the frontend.
- No real credentials anywhere; `.env.example` has placeholders only.
- No paid services, no analytics, no tracking scripts. Plain CSS only
  (no Tailwind) — the theme is a single dark stylesheet
  (`src/app/globals.css`).
