# DiskScanner Turbo — Web platform

The SaaS side of DiskScanner Turbo: marketing site, accounts, Stripe subscriptions, the web dashboard, and the
`/api/v1/*` API that the Windows desktop app uses to link installs and fetch its signed license.

The desktop ↔ web contract lives in [`../docs/CONTRATO-API.md`](../docs/CONTRATO-API.md) and is binding.

**Stack:** Next.js 16 (App Router, `src/`) · TypeScript strict · Tailwind CSS v4 · Drizzle ORM on Postgres (PGlite for
local dev/tests) · Zod · Stripe · Resend (plain `fetch`) · Vitest · Playwright. Node 22, npm.

---

## Quick start (no Postgres, no Stripe needed)

```bash
cd web
npm install
cp .env.example .env.local
npm run keys:generate            # paste ENTITLEMENT_SIGNING_KEY=… into .env.local
npm run dev                      # http://localhost:3000
```

With the default `DATABASE_URL=pglite:./.data/dev`, an embedded Postgres (PGlite) is created in `.data/dev` and
migrations run automatically on first connection. Emails (verification, password reset) are printed to the server
console with their links when `RESEND_API_KEY` is empty.

### Make a local user Pro (without Stripe)

1. Sign up at `/signup`.
2. Stop `npm run dev` (PGlite allows one process per data directory).
3. `npm run dev:grant-pro -- you@example.com` (options: `--status=trialing|active|past_due|canceled`, `--days=30`).
4. Start `npm run dev` again.

The script refuses to run when `NODE_ENV=production` or `VERCEL_ENV=production`.

### Point the desktop app at your local server

```powershell
$env:DISKSCANNER_API_URL = "http://localhost:3000"
$env:DISKSCANNER_ENTITLEMENT_PUBKEY = "k1:<base64 raw public key from npm run keys:generate>"
```

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next config) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest unit + integration tests (in-memory PGlite, route handlers called directly) |
| `npm run test:coverage` | Same, with V8 coverage of `src/server/**` and `src/lib/**` (threshold: 80 % lines) |
| `npm run test:e2e` | Playwright: builds, starts `next start` on :3210 with `DATABASE_URL=pglite://memory`, runs `e2e/` |
| `npm run db:generate` | Generate a SQL migration in `drizzle/` from `src/server/db/schema.ts` (commit it) |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (Postgres or PGlite) |
| `npm run db:studio` | Drizzle Studio |
| `npm run keys:generate` | New Ed25519 entitlement key pair (`node scripts/generate-entitlement-keys.mjs [kid]`) |
| `npm run dev:grant-pro -- <email>` | Dev-only: upsert an active subscription for a user |
| `node scripts/measure-js.mjs <baseUrl> [routes…]` | Initial JS (gzip) per route of a running server |

Playwright uses its bundled Chromium if installed, otherwise `/opt/pw-browsers/chromium`.

---

## Environment variables

Every variable is documented in [`.env.example`](.env.example).

| Variable | Required in prod | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres URL (use Neon's **pooled** URL). `pglite:<dir>` or `pglite://memory` for local/tests |
| `NEXT_PUBLIC_SITE_URL` | yes | e.g. `https://diskscanner.app` — used in emails, Stripe redirects, `verification_uri`, metadata. HSTS and `upgrade-insecure-requests` are only emitted when it is `https://` |
| `NEXT_PUBLIC_DOWNLOAD_URL` | no | Download button target (defaults to the GitHub latest release `.exe`) |
| `ENTITLEMENT_SIGNING_KEY` | yes | Ed25519 private key, base64 PKCS#8 DER |
| `ENTITLEMENT_KEY_ID` | no | `kid`, default `k1` |
| `STRIPE_SECRET_KEY` | yes | Without it, billing buttons show “billing not configured” |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_…` of the `/api/stripe/webhook` endpoint |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | yes | Recurring Price IDs |
| `STRIPE_TRIAL_DAYS` | no | Default 7; only applied to users who never had a subscription |
| `STRIPE_AUTOMATIC_TAX` | no | `true` enables Stripe Tax in Checkout |
| `RESEND_API_KEY` | yes | Without it, emails are logged (dev) or dropped with an error log (prod) |
| `EMAIL_FROM` | yes | Verified Resend sender |
| `LOG_LEVEL` | no | `debug`/`info`/`warn`/`error`/`silent` |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/cleanup` |

No `AUTH_SECRET` is needed: sessions are random 32-byte tokens; only their SHA-256 is stored.

---

## Entitlement keys

```bash
npm run keys:generate        # or: node scripts/generate-entitlement-keys.mjs k2
```

prints

```
ENTITLEMENT_SIGNING_KEY=MC4CAQAwBQYDK2VwBCIEI…   # server secret (base64 PKCS#8 DER)
ENTITLEMENT_KEY_ID=k1
k1:kOakjOrP4wiA8QjOR/T1VVv5cYccTut6OJtzeoFFuIQ=  # desktop public key line: <kid>:<base64 raw 32 bytes>
```

The last line goes into `ENTITLEMENT_PUBLIC_KEYS` in `desktop/licensing.py` (or `DISKSCANNER_ENTITLEMENT_PUBKEY` in
dev). **Rotation:** generate `k2`, ship a desktop build that trusts both `k1` and `k2`, then switch the server to `k2`.
Signed entitlements expire after 7 days, so `k1` can be dropped from the desktop a week after the switch.

---

## Stripe setup

1. **Product & prices** — Dashboard → Product catalog → create “DiskScanner Turbo Pro” with two recurring prices:
   monthly (USD 5.99) and yearly (USD 47.99). Copy the Price IDs into `STRIPE_PRICE_PRO_MONTHLY` /
   `STRIPE_PRICE_PRO_YEARLY`. Prices shown on the site come from `src/config/plans.ts` (display only — the server
   always charges the env Price IDs, never anything sent by the browser).
2. **Webhook** — Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook` with events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Events are verified on the raw body and de-duplicated by
   event id (`stripe_events` table).
3. **Customer portal** — Settings → Billing → Customer portal: enable payment-method updates, invoice history,
   cancellation (recommended: “at end of billing period”) and switching between the monthly and yearly prices.
4. **Tax (optional)** — set up Stripe Tax and `STRIPE_AUTOMATIC_TAX=true` (Checkout then collects the billing address).

### Local webhook forwarding

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET in .env.local, restart npm run dev
stripe trigger customer.subscription.updated   # or complete a real test-mode checkout with card 4242 4242 4242 4242
```

---

## Deploy (Vercel + Neon)

1. Create a Neon project; copy the **pooled** connection string.
2. Import the repo in Vercel with **Root Directory = `web`** (framework: Next.js, Node 22).
3. Add every variable from the table above to the Production (and Preview) environments. Generate production
   entitlement keys and a `CRON_SECRET` (`openssl rand -base64 32`).
4. `vercel.json` sets `buildCommand` to `npm run db:migrate && npm run build`, so migrations are applied on every
   deploy (idempotent). Use a Neon branch per Preview environment if you don't want previews migrating production.
5. The daily cron (`vercel.json → crons`) calls `GET /api/cron/cleanup` with `Authorization: Bearer $CRON_SECRET`;
   it deletes expired sessions and email tokens, device authorizations older than 1 day, rate-limit windows older than
   1 day and reports older than 13 months.
6. Point the domain, set `NEXT_PUBLIC_SITE_URL` to the final `https://` origin, add the Stripe webhook for that
   domain, and verify the sending domain in Resend.
7. Monitor `GET /api/v1/health` (`{ "ok": true, "version": "…" }`).

---

## Architecture

```
src/
  app/
    (marketing)/   /, /pricing, /download, /legal/*      static, Server Components only
    (auth)/        /login, /signup, /forgot-password, /reset-password, /verify-email, /activate
    (app)/         /dashboard, /dashboard/{devices,billing,settings}   SSR, session required
    actions/       Server Actions for forms (auth, account, device approval)
    api/v1/        contract endpoints for the desktop app
    api/stripe/webhook, api/billing/{checkout,portal}, api/auth/logout, api/cron/cleanup
  config/          plans.ts (features, device limits, display prices), site.ts
  lib/schemas/     Zod schemas shared by routes and actions
  server/          domain code (DB, auth, devices, entitlement, billing, reports, rate limit, audit, logging)
drizzle/           generated SQL migrations (committed)
tests/             Vitest (unit + integration against in-memory PGlite)
e2e/               Playwright smoke tests
```

**Security notes**

- Passwords: `scrypt` (N=16384, r=8, p=1, 64-byte key, 16-byte salt), stored as `scrypt$N$r$p$salt$hash`; constant
  time comparison; dummy hash on unknown emails.
- Sessions: `ds_session` cookie (HttpOnly, SameSite=Lax, Secure in production, 30 days), SHA-256 stored, rotated on
  login, all other sessions dropped on password change, all sessions dropped on password reset.
- Device tokens (`dst_…`), device codes, session and email tokens are stored only as SHA-256.
- Cookie-authenticated route handlers check `Origin`/`Referer`; Server Actions get Next's built-in origin check.
- CSP, HSTS (https only), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, `Permissions-Policy`
  in `next.config.ts`. `script-src` keeps `'unsafe-inline'` because Next's inline bootstrap scripts would otherwise
  require nonce-based dynamic rendering of every page (which would make the marketing pages non-static).
- Postgres-backed fixed-window rate limits (`rate_limits` table): authorize 10/h/IP, entitlement 120/h/device,
  reports 60/h/device, login 10/15 min per IP+email, signup 5/h/IP, forgot-password 5/h/IP, plus `slow_down` on
  token polling faster than `interval`.
- Audit log (`audit_log`) for sign-ins, password changes/resets, device approve/deny/revoke, subscription status
  changes and account deletion.

**Contract decisions worth knowing**

- `POST /api/v1/devices/token` with an unknown `device_code` returns `400 expired_token` (codes are purged by the
  daily cron, so “unknown” and “expired” are indistinguishable to the client).
- `slow_down` allows 500 ms of network jitter below the 5 s interval.
- `POST /api/v1/reports`: `reclaimable_bytes`, `freed_bytes` default to `0` and `categories` to `[]` if omitted; any
  unknown field (e.g. a path) is rejected with `400 invalid_request` (`.strict()`). Order of checks:
  `401` → `403 fingerprint_mismatch` → `403 feature_not_available` → `429` → `413` → `400`.
- A Stripe `paused` subscription maps to `unpaid` and `incomplete_expired` to `canceled` (both non-Pro).

### Known audit findings

`npm audit --omit=dev` is clean. The full `npm audit` reports 5 high-severity advisories in `braces` reached only via
`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch` (lint tooling, dev-only, no patched
`braces` release exists yet). An `overrides` entry pins `esbuild` ≥ 0.25 inside drizzle-kit's legacy loader.
