# ADR 0005 — Postgres (Neon) + Drizzle, con PGlite en dev y tests

- **Fecha:** 2026-10-05
- **Estado:** aceptada

## Contexto
Datos relacionales (usuarios, suscripciones, equipos, reportes) con unicidades e integridad referencial; despliegue serverless en Vercel; tests rápidos sin infraestructura.

## Decisión
Postgres gestionado (Neon) con Drizzle ORM y migraciones versionadas. `DATABASE_URL=pglite:…` activa PGlite (Postgres en WASM) para desarrollo local y tests de integración en memoria.

## Alternativas consideradas
| Opción | A favor | En contra |
|---|---|---|
| Postgres + Drizzle (elegida) | SQL real, tipado, migraciones simples, branching en Neon | Hay que gestionar migraciones |
| Convex | Reactivo, cero infra | Lock-in, modelo menos natural para webhooks/SQL |
| SQLite (Turso) | Barato | Menos herramientas de backup/PITR |

## Consecuencias
Los tests corren contra el mismo dialecto que producción. Backups y PITR dependen del plan de Neon.
