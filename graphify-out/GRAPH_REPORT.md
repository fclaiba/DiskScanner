# Graph Report - DiskScanner  (2026-11-03)

## Corpus Check
- 153 files · ~69,599 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 3, .example 2, .css 2)

## Summary
- 1279 nodes · 3268 edges · 80 communities (65 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0204dbf9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- stripe.test.ts
- Gradle Cache Cleaner
- Game Store Radar
- main.py
- cleanup.test.ts
- app.js
- device-flow.test.ts
- device.ts
- account-forms.tsx
- push_report
- client.ts
- http.ts
- dashboard/page.tsx
- styles.ts
- app.py
- getDb
- engines
- test_app.py
- web-e2e
- actions/auth.ts
- next
- with
- getDb
- (marketing)/page.tsx
- auth-forms.tsx
- refresh_entitlement
- time
- cleanup_engine.py
- schema.ts
- licensing.py
- test_licensing.py
- has_feature
- build_release.py
- compilerOptions
- devDependencies
- conftest.py
- Checklist de lanzamiento — DiskScanner Turbo
- scripts
- CLAUDE.md — DiskScanner Turbo
- AGENTS.md — DiskScanner Turbo
- dependencies
- overrides
- _load_session
- account_open
- 9. DevOps e infraestructura
- LegalPage
- BLUEPRINT — DiskScanner Turbo
- 6. Frontend
- 7. Backend
- Runbook — Deploy y rollback — DiskScanner Turbo
- ADR 0001 — Monorepo con desktop Python + web Next.js
- ADR 0002 — Stripe Billing para suscripciones
- ADR 0003 — Autenticación propia con email + contraseña y sesiones opacas
- ADR 0004 — Device flow + entitlement firmado con Ed25519
- ADR 0005 — Postgres (Neon) + Drizzle, con PGlite en dev y tests
- 11. Reglamentación de desarrollo
- 8. Datos
- eslint
- @playwright/test
- opengraph-image.tsx
- 10. Seguridad
- 16. Plan de desarrollo (Scrum por tracks)
- 2. Análisis funcional
- 4. Experiencia, marca y dirección de arte
- 5. Arquitectura general
- Cómo arrancar — DiskScanner Turbo
- measure-js.mjs
- generate-entitlement-keys.mjs
- vercel.json
- Bitácora de desarrollo — DiskScanner Turbo
- web/AGENTS.md
- postcss.config.mjs
- Glassmorphism Premium Design
- node_modules Destroyer
- Report Export (.txt)
- Zombie File Hunter

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 68 edges
2. `next` - 45 edges
3. `make_payload()` - 39 edges
4. `cn()` - 34 edges
5. `button()` - 33 edges
6. `has_feature()` - 27 edges
7. `drizzle-orm` - 27 edges
8. `Alert()` - 25 edges
9. `audit()` - 22 edges
10. `refresh_entitlement()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Reglas propias del proyecto` --references--> `_is_forbidden_path()`  [INFERRED]
  AGENTS.md → desktop/scanner_logic.py
- `Reglas propias del proyecto` --references--> `_is_forbidden_path()`  [INFERRED]
  CLAUDE.md → desktop/scanner_logic.py
- `2.4 Requisitos no funcionales (con número)` --references--> `test_offline_grace()`  [INFERRED]
  docs/BLUEPRINT.md → desktop/tests/test_licensing.py
- `2. Página web `/activate?code=XXXX-XXXX`` --references--> `device()`  [INFERRED]
  docs/CONTRATO-API.md → web/tests/device-flow.test.ts
- ``GET /api/v1/entitlement`` --references--> `SignedEntitlement`  [INFERRED]
  docs/CONTRATO-API.md → web/src/server/entitlement/sign.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **DiskScanner Turbo Key Features** — readme_diskscanner_turbo, readme_turbo_engine, readme_sse_realtime_feedback, readme_node_modules_destroyer, readme_gradle_cache_cleaner, readme_game_store_radar, readme_zombie_file_hunter, readme_report_export, readme_glassmorphism_design [EXTRACTED 1.00]

## Communities (80 total, 15 thin omitted)

### Community 0 - "stripe.test.ts"
Cohesion: 0.07
Nodes (53): 14. Funciones, objetos y contratos, `GET /api/v1/entitlement`, stripe, main(), POST(), POST(), POST(), BillingInterval (+45 more)

### Community 3 - "main.py"
Cohesion: 0.18
Nodes (10): configure_security(), _entitlement_loop(), main(), _pick_free_port(), start_server(), _wait_for_server(), Apache ECharts (Interactive Treemap), DiskScanner Turbo (+2 more)

### Community 4 - "cleanup.test.ts"
Cohesion: 0.15
Nodes (21): dynamic, GET(), CleanupCounts, runCleanup(), safeEqualStr(), deviceAuthorizations, emailTokens, rateLimits (+13 more)

### Community 5 - "app.js"
Cohesion: 0.07
Nodes (55): 1. `build.py` — PyInstaller (dev y CI), 2. `build_release.py` — release endurecido (PyArmor + Nuitka), Builds, Cómo funciona el licenciamiento, Desarrollo, DiskScanner Turbo (desktop) — guía de desarrollo, build y release, Firma de código (opcional), Prueba end-to-end contra la web local (+47 more)

### Community 6 - "device-flow.test.ts"
Cohesion: 0.23
Nodes (15): device(), link(), poll(), startFlow(), BASE, createUser(), fp(), getReq() (+7 more)

### Community 7 - "device.ts"
Cohesion: 0.14
Nodes (14): zod, zod@^4.6.5, appVersionSchema, DeviceAuthorizeInput, deviceAuthorizeSchema, deviceTokenSchema, fingerprintSchema, platformSchema (+6 more)

### Community 8 - "account-forms.tsx"
Cohesion: 0.35
Nodes (9): metadata, Section(), SettingsPage(), PageHeader(), ChangePasswordForm(), DeleteAccountForm(), ResendVerificationForm(), SubmitButton() (+1 more)

### Community 9 - "push_report"
Cohesion: 0.25
Nodes (7): build_report(), _clamp_int(), push_report(), _assert_no_paths(), test_build_report_whitelists_fields(), test_push_report_requires_sync(), test_push_report_sends_in_background()

### Community 10 - "client.ts"
Cohesion: 0.13
Nodes (13): postgres, vitest, closeDb(), create(), DB, DbHolder, g, isPglite() (+5 more)

### Community 11 - "http.ts"
Cohesion: 0.21
Nodes (22): POST, POST, POST, GET, dynamic, GET(), POST, Handler (+14 more)

### Community 12 - "dashboard/page.tsx"
Cohesion: 0.13
Nodes (36): BillingPage(), ERRORS, metadata, DevicesPage(), metadata, PLATFORM, DashboardPage(), EmptyState() (+28 more)

### Community 13 - "styles.ts"
Cohesion: 0.28
Nodes (7): FieldProps, input, label, Size, sizes, Variant, variants

### Community 14 - "app.py"
Cohesion: 0.11
Nodes (35): _abs_path_field(), account_login_cancel(), account_login_poll(), account_logout(), account_refresh(), account_status(), backup_gamesaves(), cleanup_browsers() (+27 more)

### Community 15 - "getDb"
Cohesion: 0.14
Nodes (24): deleteAccount(), audit(), generateUserCode(), normalizeUserCode(), getDb(), DeviceAuthorization, ACCESS_TOKEN_PREFIX, approveDevice() (+16 more)

### Community 17 - "test_app.py"
Cohesion: 0.07
Nodes (33): _assert_report_clean(), captured_reports(), client(), _drain(), opened(), post(), pro(), test_account_login_network_error() (+25 more)

### Community 18 - "web-e2e"
Cohesion: 0.06
Nodes (41): concurrency, cancel-in-progress, group, run, defaults, runs-on, steps, timeout-minutes (+33 more)

### Community 19 - "actions/auth.ts"
Cohesion: 0.14
Nodes (20): activateDeviceAction(), changePasswordAction(), deleteAccountAction(), revokeDeviceAction(), forgotPasswordAction(), PASSWORD_MAX, PASSWORD_MIN, fieldErrorsFrom() (+12 more)

### Community 20 - "next"
Cohesion: 0.08
Nodes (26): next, csp, httpsSite, nextConfig, securityHeaders, AppLayout(), metadata, AuthLayout() (+18 more)

### Community 21 - "with"
Cohesion: 0.06
Nodes (36): defaults, env, runs-on, steps, concurrency, cancel-in-progress, group, run (+28 more)

### Community 22 - "getDb"
Cohesion: 0.12
Nodes (41): loginAction(), resendVerificationAction(), POST(), signupSchema, AuthResult, changePassword(), ChangePasswordResult, findUserByEmail() (+33 more)

### Community 24 - "(marketing)/page.tsx"
Cohesion: 0.24
Nodes (10): @phosphor-icons/react, finds, HomePage(), metadata, tools, Check(), groups, SmartCleanupMock() (+2 more)

### Community 25 - "auth-forms.tsx"
Cohesion: 0.12
Nodes (32): react, resetPasswordAction(), signupAction(), ActivatePage(), CodeEntry(), metadata, PLATFORM, AuthCard() (+24 more)

### Community 26 - "refresh_entitlement"
Cohesion: 0.17
Nodes (16): _b64url_decode(), _public_keys(), refresh_entitlement(), verify_entitlement(), b64url(), test_garbage_fields_rejected(), test_other_key_with_known_kid_rejected(), test_placeholder_key_never_verifies() (+8 more)

### Community 28 - "time"
Cohesion: 0.13
Nodes (13): cleanup_npm_stream(), on_result(), cleanup_venv_stream(), on_result(), _elapsed_ms(), _report_analysis(), _report_scan(), scan() (+5 more)

### Community 30 - "cleanup_engine.py"
Cohesion: 0.12
Nodes (22): _browser_cache_paths(), _dev_cache_paths(), _dir_size(), _empty_recycle_bin(), _gpu_shader_paths(), _is_venv_dir(), _local_appdata(), _messaging_cache_paths() (+14 more)

### Community 31 - "schema.ts"
Cohesion: 0.16
Nodes (16): drizzle-orm, main(), Status, STATUSES, CANCELABLE, DeleteAccountResult, AuditAction, auditLog (+8 more)

### Community 32 - "licensing.py"
Cohesion: 0.09
Nodes (21): api_url(), ApiError, _bundled_resource_paths(), cancel_device_login(), _error_from_response(), _is_signed_entitlement(), _json_or_none(), logout() (+13 more)

### Community 34 - "test_licensing.py"
Cohesion: 0.25
Nodes (12): start_device_login(), _allow_next_poll(), _err(), test_device_login_full_flow(), test_device_login_terminal_errors(), test_foreign_verification_uri_is_replaced(), test_logout_401_is_success(), test_refresh_401_wipes_session() (+4 more)

### Community 35 - "has_feature"
Cohesion: 0.17
Nodes (19): current_state(), _dev_bypass(), _evaluate(), has_feature(), _integrity_ok(), refresh_capabilities(), make_payload(), fake_poll() (+11 more)

### Community 38 - "build_release.py"
Cohesion: 0.18
Nodes (9): main(), _bake_release_config(), _check_tool(), _compute_integrity_hash(), main(), _run_nuitka(), _sanity_check(), _stage_obfuscated_source() (+1 more)

### Community 40 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 42 - "devDependencies"
Cohesion: 0.11
Nodes (23): drizzle-kit, tailwindcss, @tailwindcss/postcss, tsx, @types/node, @types/react, @types/react-dom, typescript (+15 more)

### Community 43 - "conftest.py"
Cohesion: 0.20
Nodes (5): isolated_licensing(), link_session(), _link(), Signer, signer()

### Community 45 - "Checklist de lanzamiento — DiskScanner Turbo"
Cohesion: 0.05
Nodes (38): 1. `POST /api/v1/devices/authorize`, 2. Página web `/activate?code=XXXX-XXXX`, 3. `POST /api/v1/devices/token`, Comportamiento del desktop (normativo), Contrato Desktop ↔ Web — DiskScanner Turbo (API v1), Convenciones, Endpoints autenticados del dispositivo, Firma Ed25519 (+30 more)

### Community 46 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, db:generate, db:migrate, db:studio, dev, dev:grant-pro, keys:generate (+7 more)

### Community 47 - "CLAUDE.md — DiskScanner Turbo"
Cohesion: 0.14
Nodes (13): CLAUDE.md — DiskScanner Turbo, graphify, Regla 0 — Arranque autónomo, Regla 1 — El blueprint es la fuente de verdad, Regla 2 — Para desviarte, actualizá primero, Regla 3 — `(propuesta a validar)` es punto de partida, no decisión cerrada., Regla 4 — Frontend, Regla 5 — Backend (+5 more)

### Community 49 - "AGENTS.md — DiskScanner Turbo"
Cohesion: 0.15
Nodes (12): AGENTS.md — DiskScanner Turbo, Regla 0 — Arranque autónomo, Regla 1 — El blueprint es la fuente de verdad, Regla 2 — Para desviarte, actualizá primero, Regla 3 — `(propuesta a validar)` es punto de partida, no decisión cerrada., Regla 4 — Frontend, Regla 5 — Backend, Regla 6 — DevOps (+4 more)

### Community 51 - "dependencies"
Cohesion: 0.15
Nodes (13): @electric-sql/pglite, @fontsource-variable/inter, react-dom, dependencies, drizzle-orm@^0.45.3, @electric-sql/pglite@^0.5.8, @fontsource-variable/inter@^5.3.0, next@16.3.8 (+5 more)

### Community 52 - "overrides"
Cohesion: 0.67
Nodes (3): esbuild, overrides, @esbuild-kit/core-utils

### Community 53 - "_load_session"
Cohesion: 0.21
Nodes (10): _appdata_dir(), _fernet_for(), get_machine_fingerprint(), _load_session(), _save_session(), _session_path(), _wmic_value(), test_corrupt_session_is_free() (+2 more)

### Community 56 - "account_open"
Cohesion: 0.22
Nodes (6): account_login(), account_login_open(), account_open(), _api_error(), _guard_request(), _open_in_browser()

### Community 58 - "9. DevOps e infraestructura"
Cohesion: 0.18
Nodes (11): 9.10 Costos mensuales estimados `(propuesta a validar)`, 9.1 Repositorio, 9.2 Entornos, 9.3 Pipeline, 9.4 Configuración de plataforma, 9.5 Secretos, 9.6 Dominio y red, 9.7 Observabilidad (+3 more)

### Community 60 - "LegalPage"
Cohesion: 0.29
Nodes (7): metadata, PrivacyPage(), metadata, RefundsPage(), metadata, TermsPage(), LegalPage()

### Community 62 - "BLUEPRINT — DiskScanner Turbo"
Cohesion: 0.20
Nodes (10): 12. Módulos de desarrollo, 13. Componentes internos, 15. Puertas de calidad (Definition of Done), 17. Paquete comercial, 1. Concepto general, 3.1 Flujos críticos del usuario, 3.2 Interacciones entre servicios, 3.3 Ciclo de vida de la suscripción (+2 more)

### Community 63 - "6. Frontend"
Cohesion: 0.20
Nodes (10): 6.1 Estructura y rutas, 6.2 Render y caché, 6.3 Estado y datos, 6.4 Formularios y validación, 6.5 Accesibilidad, 6.6 Presupuestos de performance, 6.7 SEO, 6.8 Analítica (+2 more)

### Community 65 - "7. Backend"
Cohesion: 0.22
Nodes (9): 7.1 Dominio, 7.2 Contrato de API, 7.3 Autenticación y autorización, 7.4 Validación y errores, 7.5 Tareas asíncronas y cron, 7.6 Integraciones y webhooks, 7.7 Pagos, 7.8 Protección contra abuso (+1 more)

### Community 68 - "Runbook — Deploy y rollback — DiskScanner Turbo"
Cohesion: 0.25
Nodes (7): Contactos y accesos, Deploy normal (web), Release del desktop, Restaurar backup, Rollback, Runbook — Deploy y rollback — DiskScanner Turbo, Webhooks de Stripe atrasados o fallidos

### Community 72 - "ADR 0001 — Monorepo con desktop Python + web Next.js"
Cohesion: 0.33
Nodes (5): ADR 0001 — Monorepo con desktop Python + web Next.js, Alternativas consideradas, Consecuencias, Contexto, Decisión

### Community 73 - "ADR 0002 — Stripe Billing para suscripciones"
Cohesion: 0.33
Nodes (5): ADR 0002 — Stripe Billing para suscripciones, Alternativas consideradas, Consecuencias, Contexto, Decisión

### Community 74 - "ADR 0003 — Autenticación propia con email + contraseña y sesiones opacas"
Cohesion: 0.33
Nodes (5): ADR 0003 — Autenticación propia con email + contraseña y sesiones opacas, Alternativas consideradas, Consecuencias, Contexto, Decisión

### Community 75 - "ADR 0004 — Device flow + entitlement firmado con Ed25519"
Cohesion: 0.33
Nodes (5): ADR 0004 — Device flow + entitlement firmado con Ed25519, Alternativas consideradas, Consecuencias, Contexto, Decisión

### Community 76 - "ADR 0005 — Postgres (Neon) + Drizzle, con PGlite en dev y tests"
Cohesion: 0.33
Nodes (5): ADR 0005 — Postgres (Neon) + Drizzle, con PGlite en dev y tests, Alternativas consideradas, Consecuencias, Contexto, Decisión

### Community 77 - "11. Reglamentación de desarrollo"
Cohesion: 0.33
Nodes (6): 11.1 Convenciones, 11.2 Estilo y herramientas, 11.3 Tests, 11.4 Git y revisión, 11.5 Documentación, 11. Reglamentación de desarrollo

### Community 78 - "8. Datos"
Cohesion: 0.33
Nodes (6): 8.1 Modelo, 8.2 Índices y consultas críticas, 8.3 Migraciones, 8.4 Datos personales, 8.5 Backups, 8. Datos

### Community 79 - "eslint"
Cohesion: 0.33
Nodes (5): eslint, eslint-config-next, eslintConfig, eslint@^9, eslint-config-next@16.3.8

### Community 80 - "@playwright/test"
Cohesion: 0.33
Nodes (3): @playwright/test, @playwright/test@^1.63.0, PORT

### Community 81 - "opengraph-image.tsx"
Cohesion: 0.33
Nodes (4): alt, contentType, size, T

### Community 85 - "10. Seguridad"
Cohesion: 0.40
Nodes (5): 10.1 Amenazas principales, 10.2 Controles, 10.3 Dependencias, 10.4 Auditoría, 10. Seguridad

### Community 86 - "16. Plan de desarrollo (Scrum por tracks)"
Cohesion: 0.40
Nodes (5): 16.1 Backlog (épicas), 16.2 Sprints (1 semana `(propuesta a validar)`), 16.3 Definition of Done, 16.4 Riesgos y mitigación, 16. Plan de desarrollo (Scrum por tracks)

### Community 87 - "2. Análisis funcional"
Cohesion: 0.40
Nodes (5): 2.1 Actores y roles, 2.2 Casos de uso (verificables), 2.3 Requisitos funcionales por área, 2.4 Requisitos no funcionales (con número), 2. Análisis funcional

### Community 88 - "4. Experiencia, marca y dirección de arte"
Cohesion: 0.40
Nodes (5): 4.1 Branding y design tokens, 4.2 Design system, 4.3 Voz y microcopy, 4.4 Capa de motion premium, 4. Experiencia, marca y dirección de arte

### Community 89 - "5. Arquitectura general"
Cohesion: 0.40
Nodes (5): 5.1 Estilo y justificación, 5.2 Contexto y contenedores, 5.3 Stack por capa, 5.4 Comunicación, 5. Arquitectura general

### Community 90 - "Cómo arrancar — DiskScanner Turbo"
Cohesion: 0.40
Nodes (4): Cómo arrancar — DiskScanner Turbo, Para lanzar a producción, Para seguir desarrollando con Claude Code, Probar todo en local (web + desktop conectados)

### Community 93 - "generate-entitlement-keys.mjs"
Cohesion: 0.40
Nodes (4): pkcs8, { publicKey, privateKey }, raw, spki

### Community 94 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, crons, framework, $schema

## Knowledge Gaps
- **8 isolated node(s):** `Gradle Cache Cleaner`, `Glassmorphism Premium Design`, `node_modules Destroyer`, `Report Export (.txt)`, `Zombie File Hunter` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 463 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BLUEPRINT — DiskScanner Turbo` connect `BLUEPRINT — DiskScanner Turbo` to `stripe.test.ts`, `7. Backend`, `11. Reglamentación de desarrollo`, `Checklist de lanzamiento — DiskScanner Turbo`, `8. Datos`, `10. Seguridad`, `16. Plan de desarrollo (Scrum por tracks)`, `2. Análisis funcional`, `4. Experiencia, marca y dirección de arte`, `5. Arquitectura general`, `9. DevOps e infraestructura`, `6. Frontend`?**
  _High betweenness centrality (0.371) - this node is a cross-community bridge._
- **What connects `Gradle Cache Cleaner`, `Glassmorphism Premium Design`, `node_modules Destroyer` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `stripe.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06522522522522523 - nodes in this community are weakly interconnected._
- **Why does `14. Funciones, objetos y contratos` connect `stripe.test.ts` to `BLUEPRINT — DiskScanner Turbo`?**
  _High betweenness centrality (0.327) - this node is a cross-community bridge._
- **Should `cleanup.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1452991452991453 - nodes in this community are weakly interconnected._
- **Why does `2. Análisis funcional` connect `2. Análisis funcional` to `BLUEPRINT — DiskScanner Turbo`?**
  _High betweenness centrality (0.309) - this node is a cross-community bridge._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07320024198427103 - nodes in this community are weakly interconnected._