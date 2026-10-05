<div align="center">

# DiskScanner Turbo

**See what fills your Windows drive. Clear it in one click.**

[![CI](https://github.com/fclaiba/DiskScanner/actions/workflows/ci.yml/badge.svg)](https://github.com/fclaiba/DiskScanner/actions/workflows/ci.yml)

</div>

DiskScanner Turbo is a fast disk analyzer and safe one-click cleaner for Windows 10/11, sold as a subscription (free tier included). This monorepo holds the desktop app and the SaaS platform that sells and licenses it.

| Part | Path | Stack |
|---|---|---|
| Desktop app (Windows) | [`desktop/`](desktop/) | Python 3.11 · Flask (local, hardened) · PyWebView · PyInstaller / Nuitka |
| Web platform (marketing, accounts, billing, dashboard, API) | [`web/`](web/) | Next.js 16 · TypeScript · Tailwind v4 · Drizzle + Postgres · Stripe |
| Docs (blueprint, contract, ADRs, runbooks) | [`docs/`](docs/) | Spanish |

## Product

**Free**: scan any drive with real-time streaming, an interactive treemap, the largest files, duplicates (hash-based), zombie files (>50 MB, untouched for a year), game library radar (Steam, Epic, Xbox, Riot, Ubisoft), disk health (SMART), Smart Cleanup analysis and TXT report export.

**Pro** (monthly or yearly, 7-day free trial, up to 3 PCs): every cleanup, including Smart Cleanup in one click (browser, GPU shader, messaging and developer caches, Xcode DerivedData, Recycle Bin, old virtualenvs), the `node_modules` destroyer, Gradle cache, Windows Update leftovers, Downloads organizer and more. It also syncs to the web dashboard, which shows GB freed and history.

**Privacy:** the app only syncs aggregate numbers (bytes, counts, category keys). It never sends file names, folder names or paths.

## How it fits together

```
Desktop (Windows) ── HTTPS /api/v1 ──► Web (Vercel) ──► Postgres (Neon)
   │  device-code linking                 │  ▲
   │  Ed25519-signed entitlement          ▼  │ webhooks
   │  (works 7 days offline)            Stripe Billing
   └── installer from GitHub Releases
```

The binding contract between both sides is [`docs/CONTRATO-API.md`](docs/CONTRATO-API.md).

## Development

```bash
# Web (no Postgres or Stripe needed locally: uses embedded PGlite)
cd web && npm ci && cp .env.example .env.local
npm run keys:generate        # put ENTITLEMENT_SIGNING_KEY in .env.local, keep the k1:... line
npm run dev                  # http://localhost:3000

# Desktop
cd desktop && pip install -r requirements.txt -r requirements-dev.txt
DISKSCANNER_API_URL=http://localhost:3000 DISKSCANNER_ENTITLEMENT_PUBKEY="k1:..." python main.py
```

Quality gates (also enforced in CI):

```bash
cd web && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e
cd desktop && ruff check . && python -m pytest -q
```

## Release & launch

- Desktop: push a tag `vX.Y.Z` and [`desktop-release.yml`](.github/workflows/desktop-release.yml) builds, optionally signs, and publishes `DiskScannerTurbo.exe` to GitHub Releases.
- Web: deploy `web/` to Vercel (Root Directory `web`).
- Step-by-step go-live checklist (Stripe, Neon, Resend, Vercel, keys, code signing): [`docs/LANZAMIENTO.md`](docs/LANZAMIENTO.md).
- Architecture and plan: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) · decisions: [`docs/adr/`](docs/adr/) · ops: [`docs/runbooks/`](docs/runbooks/).

## License

Proprietary. All rights reserved. Third-party components keep their own licenses (see `desktop/static/vendor/*LICENSE*`).
