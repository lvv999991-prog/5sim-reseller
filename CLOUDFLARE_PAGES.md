# Deploying the frontend to Cloudflare — Workers (not Pages)

> **Read this first — the target changed.** The original plan said
> "Cloudflare Pages", but Cloudflare's own docs (Next.js guide, updated
> 2026-11-05) now say **Pages is only for static exports**. This app is a
> dynamic Next.js App Router app (dynamic `/orders/[id]` route, client-side
> routing), so the documented deployment target is **Cloudflare Workers**.
> The dashboard flow below is the Workers flow, on the free tier. Nothing
> in the app had to change to fit it.

## 1. Adapter choice (verified against current official docs, 12 Nov 2026)

| Option | Status | Verdict for this app |
| --- | --- | --- |
| `@cloudflare/next-on-pages` | **Deprecated, repo archived 29 Sep 2025.** README: "use the OpenNext Cloudflare adapter instead." Edge runtime only. | Do not use. |
| `vinext` | Cloudflare's current **default for new apps** (beta). A Vite plugin that reimplements the Next.js API. | Not used: beta, and it replaces the build toolchain. The app must keep working as-is. |
| **`@opennextjs/cloudflare` (OpenNext)** | The documented path for **existing apps** that cannot yet move to vinext. Uses the real `next build` + Node.js runtime (`nodejs_compat`). Supports App Router, dynamic routes, SSR, middleware. | **Chosen.** |

**Version pin — important:** the latest `@opennextjs/cloudflare` (1.16+)
dropped Next.js 14. This app is Next.js 14.2.35, so the adapter is pinned
to **`@opennextjs/cloudflare@1.15.0`** — the newest release whose peer range
includes Next 14 (`^14.2.35 || ...`). Wrangler is pinned to `^4.59.2` (the
adapter's peer range); `4.161.0` is installed. Do not run a bare
`npm update` on the adapter without checking the Next.js peer range first.
**Follow-up (not done here):** upgrading the app to Next.js 15/16 would let
the adapter track latest again — OpenNext's docs already note Next 14
support ends Q1 2026.

Sources: <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>,
<https://opennext.js.org/cloudflare>, <https://opennext.js.org/cloudflare/get-started>,
<https://opennext.js.org/cloudflare/cli>, <https://opennext.js.org/cloudflare/caching>.

## 2. What was changed in this repo

All changes are in `frontend/`; no page, route, or API behaviour changed.

| File | Change |
| --- | --- |
| `package.json` | Added devDependencies `@opennextjs/cloudflare@^1.15.0`, `wrangler@^4.161.0`; scripts `preview` / `deploy` / `upload` / `cf-typegen`. `build` is still plain `next build`. |
| `wrangler.jsonc` | Worker config (from the adapter's own template): name `5sim-reseller-frontend`, `main: .open-next/worker.js`, `compatibility_date 2025-12-01`, flags `nodejs_compat` + `global_fetch_strictly_public`, static assets from `.open-next/assets`, self-reference service binding, R2 bucket `cache` for the incremental cache, `IMAGES` binding. |
| `open-next.config.ts` | Adapter default: R2 incremental cache. |
| `public/_headers` | `/_next/static/*` served `Cache-Control: public, max-age=31536000, immutable` (matches Next.js default for immutable assets). |
| `.dev.vars` | Local-only vars for `wrangler dev` / preview. Comments only, gitignored, never put secrets here. |
| `next.config.js` | Added the documented `initOpenNextCloudflareForDev()` call so the dev server integrates with the adapter. Nothing else changed. |
| `.gitignore` (repo root + frontend) | Ignores `.open-next/`, `.wrangler/`, `.dev.vars`, `cloudflare-env.d.ts`, `*.tsbuildinfo`, `node_modules`, `.next`, `dist`, real `.env` files. `.env.example` files are committed (placeholders only). |

## 3. Verification (done locally, 12 Nov 2026)

| Check | Result |
| --- | --- |
| `npx opennextjs-cloudflare build` | ✅ Exit 0. Next build 11/11 pages (`/orders/[id]` dynamic). Worker saved to `.open-next/worker.js`. |
| `npm run build` (plain Next) | ✅ Exit 0 — the normal build still works. |
| `npx opennextjs-cloudflare preview` (real `workerd` runtime, local bindings) | ✅ Served HTTP 200 on `/`, `/login`, `/buy`, `/dashboard`, and dynamic `/orders/abc123`, plus a static `_next` chunk. All bindings connected locally (R2 local, self-reference, IMAGES, ASSETS). |
| `git status` / credential grep | ✅ Committed, tree clean, no remotes. No owner emails, keys, or secrets anywhere in the repo. |

**Not verified here:** the actual Cloudflare deploy (no account access from
this machine) and the compressed Worker size wrangler reports at deploy
time. The worker entry is tiny (916 bytes gzipped); the server bundle is
~20 MB on disk pre-minification and wrangler minifies/bundles it on deploy
— if it ever exceeded the 3 MiB free-plan limit, the fix is Workers Paid
($5/mo), but that is not expected for this app.

## 4. Before you deploy — one prerequisite and one honest limitation

1. **Create the R2 bucket first (once).** `wrangler.jsonc` binds the
   `cache` bucket for the Next.js incremental cache. Create it in the
   dashboard (R2 → Create bucket → `cache`) or with
   `npx wrangler r2 bucket create cache`. Without it the deploy fails on
   the missing binding. Note: activating R2 takes you through a checkout
   step where a payment method is put on file; usage inside the free
   allowance (below) stays $0. This app uses no ISR/revalidation, so the
   bucket will sit almost entirely idle.
2. **The backend API is not deployed yet.** `NEXT_PUBLIC_API_URL` is baked
   into the JavaScript **at build time** (it is a `NEXT_PUBLIC_` variable),
   so it must be set before the production build, and changing it later
   requires a **redeploy**. Until the Oracle VM API is live, deploy with a
   placeholder URL and expect the dashboard to render but show API errors
   on every data call — that is expected, not a broken deploy. The API
   origin must be `https://` (the Worker page is HTTPS; browsers block
   mixed-content calls to `http://`).

## 5. Deployment route A — git-connected (recommended, no tokens)

In the Cloudflare dashboard (you are already logged in):

1. **Workers & Pages → Create application → GitHub** (or GitLab).
   Connect your GitHub account and select the repository containing this
   monorepo. (The repo exists only locally right now — push it to GitHub
   first; nothing has been pushed from here.)
2. Configure the project:
   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Root directory | `frontend` |
   | Build command | `npx opennextjs-cloudflare build` |
   | Deploy command | `npx wrangler deploy` |
   | Environment variables | `NEXT_PUBLIC_API_URL` = your API origin (see §4); `NODE_VERSION` = `22` |
3. **Save and Deploy.** The Worker is published at
   `https://5sim-reseller-frontend.<your-subdomain>.workers.dev`.
   Every push to `main` rebuilds and redeploys; pushes to other branches
   create preview deployments automatically.

Alternative deploy command: leave **Build command empty** and set **Deploy
command** to `npm run deploy` — that runs the adapter's full deploy flow
(build + remote cache population + deploy) in one step. The two-field
version above is the primary recommendation because it matches the
official Workers Builds shape; the only thing it skips is the remote
cache-population step, which this app does not need (no ISR/revalidation).

## 6. Deployment route B — Wrangler CLI

From a terminal on any machine with the repo checked out:

```bash
cd frontend
npx wrangler login            # opens a browser, OAuth — no token needed
npx wrangler r2 bucket create cache   # once, before the first deploy
NEXT_PUBLIC_API_URL=https://api.example.com npm run deploy
# (npm run deploy = opennextjs-cloudflare deploy: build + cache populate + deploy)
```

If you prefer an API token instead of browser login, create one at
**dash.cloudflare.com/profile/api-tokens** with exactly these permissions,
then set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell:

| Permission | Why |
| --- | --- |
| Account → **Workers Scripts: Edit** | deploy the Worker |
| Account → **Workers R2 Storage: Edit** | create/use the `cache` bucket |
| Account → **Workers Routes: Edit** | only if you later add a custom-domain route |

`npm run upload` uploads a version without promoting it to production
(useful for gradual rollouts); `npm run preview` serves the production
build locally in the real Workers runtime.

## 7. Free-tier limits that apply (Nov 2026 snapshot — re-verify at signup)

| Resource | Free allowance |
| --- | --- |
| Workers requests | 100,000/day per account; 10 ms CPU per request |
| Worker size | 3 MiB compressed (Paid: 10 MiB, $5/mo) |
| Workers Builds (git-connected) | 3,000 build minutes/month, 1 concurrent build, 20-min timeout |
| R2 | 10 GB-month storage, 1M Class A ops/mo, 10M Class B ops/mo, zero egress |
| Custom domain on the Worker | Free (`workers.dev` subdomain is also free) |

Static assets served directly from Workers Static Assets do not count
against the 100,000 requests/day. This app's only R2 use is the idle
incremental-cache bucket.

## 8. Custom domain (optional, free)

Workers → `5sim-reseller-frontend` → **Settings → Domains → Add custom
domain**. If the domain's DNS is already on Cloudflare it is a one-click
add; otherwise add the domain to Cloudflare first (free DNS). The
`workers.dev` URL keeps working either way.

## 9. What was NOT done here

- No deployment to Cloudflare was made from this machine (no account
  credentials exist here).
- No remote repository was created and nothing was pushed.
- No API token was created.
- The backend API is not deployed yet — see `../DEPLOYMENT.md` for the
  Oracle Always Free VM runbook. The frontend deploy in §5/§6 is the last
  step once `NEXT_PUBLIC_API_URL` has a real value.
