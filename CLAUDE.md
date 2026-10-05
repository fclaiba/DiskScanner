# CLAUDE.md — DiskScanner Turbo

Aplica a cualquier agente de IA (Claude Code, Cursor, Codex, Cowork…) que trabaje en este repositorio. Estas reglas son obligatorias.

## Regla 0 — Arranque autónomo
1. Leé completos `docs/BLUEPRINT.md`, `docs/CONTRATO-API.md`, `docs/BITACORA.md` y los ADRs de `docs/adr/`.
2. Tomá como tarea el "Pendiente / próximos pasos" de la última entrada y el sprint en curso (sección 16).
3. Si no te pidieron otra cosa, decí en pocas líneas qué vas a hacer y empezá.
4. Preguntá solo si el paso depende de un dato que no se puede inventar (credenciales, branding, textos legales, precios).

## Regla 1 — El blueprint es la fuente de verdad
Ningún cambio de arquitectura, contrato de API, modelo de datos, infraestructura, módulo o firma contradice el blueprint.

## Regla 2 — Para desviarte, actualizá primero
Actualizá la sección del blueprint con fecha. Si la decisión es costosa de revertir, escribí un ADR nuevo (los anteriores no se editan: se reemplazan).

## Regla 3 — `(propuesta a validar)` es punto de partida, no decisión cerrada.

## Regla 4 — Frontend
- Tokens de diseño únicos (colores, tipografía, espaciado) desde el design system; nada hardcodeado fuera de ahí.
- Cada ruta respeta su estrategia de render y su presupuesto de performance (sección 6.6).
- Accesibilidad AA: semántica, foco visible, labels, contraste, `prefers-reduced-motion`.
- Validación con los mismos esquemas que usa el backend.
- Estados de carga, vacío y error en toda pantalla que consuma datos.

## Regla 5 — Backend
- Toda entrada se valida en el servidor; toda mutación verifica identidad y permiso en el servidor.
- Un único formato de error; nunca exponer stack traces ni datos internos.
- Webhooks: verificar firma, procesar idempotente, reintentos con backoff.
- Cambios de esquema solo con migración versionada y reversible.
- Nada de secretos en el código ni en logs; datos personales solo según la sección 8.4.

## Regla 6 — DevOps
- Nada llega a `main` sin CI verde (lint, tipos, tests, build).
- Cada PR tiene preview. Producción solo desde `main`.
- Variables nuevas: se agregan a `.env.example` (raíz y `web/.env.example`) con comentario y a la plataforma; jamás se commitea un valor real.
- Todo error de producción se registra con contexto suficiente para reproducirlo.
- Antes de un cambio riesgoso en infraestructura o datos, verificar backup y tener rollback escrito en el runbook.

## Regla 7 — Motion premium
No aplica (sección 4.4): motion sutil y `prefers-reduced-motion` respetado.

## Regla 8 — Calidad
Ningún sprint se cierra sin correr las puertas de la sección 15 y pegar los resultados (números) en la bitácora.

## Regla 9 — Bitácora
Al cerrar cada sesión agregá al final de `docs/BITACORA.md`:
```
## [YYYY-MM-DD] Título corto
**Hecho:** …
**Decisiones:** … (indicá si se actualizó el blueprint o se creó un ADR)
**Pendiente / próximos pasos:** …
```
Nunca reescribas ni borres entradas viejas.

## Reglas propias del proyecto
- **Contrato primero:** cualquier cambio en `/api/v1` se hace en `docs/CONTRATO-API.md` y en ambos lados (`web/` y `desktop/`) en el mismo PR, con tests de los dos lados.
- **Privacidad:** el desktop nunca envía rutas, nombres de archivo ni nombres de carpeta. Solo números agregados y claves de categoría `^[a-z0-9_]{1,40}$`.
- **Seguridad local:** toda ruta nueva de la API local del desktop queda bajo el `before_request` (token + Host). Nada destructivo por `GET` sin token. Toda acción destructiva nueva se agrega a `_GATED_ENDPOINTS` y respeta `_is_forbidden_path`; preferir enviar a la papelera.
- **Pro lo decide el servidor:** el desktop nunca guarda un flag "pro" sin firma; siempre re-verifica el entitlement firmado.
- **Precios y planes:** montos de display solo en `web/src/config/plans.ts`; precios cobrados solo en Stripe (IDs por variable de entorno).
- **Comandos de verificación:**
  - Web: `cd web && npm run lint && npm run typecheck && npm run test:coverage && npm run build` (+ `npm run test:e2e`).
  - Desktop: `cd desktop && ruff check . && python -m pytest -q`.
- Commits: Conventional Commits; ramas `feat/`, `fix/`, `chore/`, `docs/`.
