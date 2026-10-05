# Bitácora de desarrollo — DiskScanner Turbo

Registro cronológico. Las entradas nunca se reescriben ni se borran: solo se agregan al final.

## [2026-10-05] Sprint 0: de app con Gumroad a SaaS por suscripción
**Hecho:**
- Repo ordenado como monorepo (`desktop/`, `web/`, `docs/`); `.gitignore`; se dejaron de versionar binarios (`dist/*.exe`, unos 53 MB), `__pycache__` y artefactos de herramientas.
- Contrato v1 desktop↔web (`docs/CONTRATO-API.md`): device flow, entitlement firmado con Ed25519, reportes agregados y seguridad local.
- **Web** (`web/`, Next.js 16):
  - landing, precios con FAQ, descarga y legales con placeholders;
  - cuentas: registro, login, verificación de email, reset y borrado de cuenta;
  - Stripe: Checkout con trial, Customer Portal y webhooks idempotentes;
  - device flow y `/activate`, entitlement firmado;
  - dashboard con GB liberados, historial, equipos, billing y ajustes;
  - rate limit en Postgres, auditoría, cron de limpieza y cabeceras de seguridad.
- **Desktop:**
  - Gumroad reemplazado por vinculación de cuenta y entitlement firmado (7 días offline). La app arranca siempre en modo gratis.
  - Servidor local endurecido: puerto aleatorio, token por arranque, validación de Host, CSP y validación de entradas y rutas.
  - UI: chip de cuenta, modales de vinculación y de upgrade, badges PRO.
  - Sincronización de reportes solo con números agregados.
  - Assets (Font Awesome, ECharts, confetti, Inter) vendorizados: funciona 100 % sin internet.
  - Corregidos dos bugs previos: botón "Purge NPM" y XSS en toasts con rutas.
- **DevOps:** `ci.yml` (web, web-e2e, desktop) y `desktop-release.yml` (build Windows, firma opcional y GitHub Release).
- **Docs:** blueprint, ADRs 0001–0005, runbook, `LANZAMIENTO.md`, AGENTS/CLAUDE.

**Puertas de calidad (resultados):**
| Verificación | Resultado |
|---|---|
| Web lint / tipos | 0 errores / 0 errores |
| Web tests (Vitest + PGlite) | 68/68; cobertura de líneas 91,7 % en `src/server` (umbral 80 %) |
| Web e2e (Playwright) | 4/4: landing; signup → dashboard → logout → login; vinculación por `/activate`; billing no configurado |
| Web build | OK; JS inicial 139,2 KB gz en marketing (presupuesto 170) y 143,1 KB en auth |
| `npm audit --omit=dev` | 0 vulnerabilidades. Con dev quedan 5 high en `braces` vía `eslint-config-next`, sin fix upstream: solo afectan herramientas de lint |
| Desktop ruff / pytest | 0 errores / 85/85 |
| **Integración real web↔desktop** | Prueba manual (`licensing.py` contra `next start`), sin test automático: vinculación con código y aprobación en navegador → entitlement free verificado → grant Pro → refresh `pro=true, features=[scan, cleanup, sync]` → reporte de 5,0 GB visible en `/dashboard` → servidor caído: sigue Pro (`offline_grace`) → logout: vuelve a free |
| Desktop UI en navegador | escaneo real OK, 0 requests externos, 0 violaciones de CSP, `pro_required` en rutas gateadas |

**Decisiones:** ADR 0001 (monorepo), 0002 (Stripe, a validar por país), 0003 (auth propia), 0004 (device flow + Ed25519; reemplaza Gumroad), 0005 (Postgres + Drizzle + PGlite). Blueprint creado. El contrato se completó con las decisiones de implementación (código desconocido → `expired_token`, jitter de `slow_down`, header de fingerprint faltante). Licencia del repo: propietaria (antes el README decía MIT) `(propuesta a validar)`. Overrides de dev (`DISKSCANNER_SKIP_LICENSE`, clave pública por env) desactivados en los `.exe` compilados.

**Pendiente / próximos pasos (Sprint 1: lanzamiento):**
1. Titular: completar `docs/LANZAMIENTO.md` (Neon, claves, Stripe live, Resend, Vercel, dominio, secretos de GitHub, tag `v2.0.0`).
2. Validar el proveedor de cobro según el país del titular (ADR 0002); si no hay Stripe, implementar el adaptador de Paddle o Lemon Squeezy.
3. Revisión legal de términos, privacidad y reembolsos.
4. Certificado de firma de código (SmartScreen).
5. Probar el `.exe` en Windows real (en esta sesión se probó en Linux): rutas `%APPDATA%`, WMIC/fingerprint, PyWebView y una limpieza Smart Cleanup.
6. Monitor externo de `/api/v1/health` y simulacro de restauración de Neon.
7. Sprint 2: Sentry, emails de ciclo de vida del trial, Dependabot, Lighthouse CI.
