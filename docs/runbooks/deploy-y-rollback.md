# Runbook — Deploy y rollback — DiskScanner Turbo

## Deploy normal (web)
1. PR con CI verde (`ci.yml`) y preview de Vercel revisada.
2. Si el PR trae migraciones (`web/drizzle/`): Vercel las aplica solo en el build (`vercel.json`). Requisitos: compatibles hacia atrás (agregar columnas/tablas; borrar en un deploy posterior) y probadas antes en la preview, que usa su propia rama de Neon.
3. Merge a `main` → Vercel despliega producción automáticamente.
4. Verificar (15 min):
   - `GET https://<dominio>/api/v1/health` → `{ "ok": true }`.
   - Landing, `/pricing`, login y `/dashboard`.
   - Flujo crítico: vincular un equipo de prueba (desktop con `DISKSCANNER_API_URL` apuntando a producción) y ver el plan correcto.
   - Stripe → Developers → Webhooks: sin entregas fallidas nuevas.
   - Vercel Logs: sin picos de `level:"error"`.

## Release del desktop
1. Actualizar `APP_VERSION` en `desktop/licensing.py`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` → workflow `desktop-release.yml` compila en Windows, corre tests y publica `DiskScannerTurbo.exe` + `.sha256` en GitHub Releases.
3. Descargar el `.exe` desde `/download`, instalar en una VM limpia, vincular cuenta y probar una limpieza.

## Rollback
- **Web:** Vercel → Deployments → deploy anterior → *Instant Rollback*.
- **Migración incompatible:** restaurar la base (ver abajo) a un punto anterior a la migración; nunca editar una migración aplicada.
- **Desktop:** en GitHub Releases marcar la versión anterior como *Latest* (el link de `/download` apunta a `releases/latest`).
- **Clave de firma comprometida:** generar nueva (`node web/scripts/generate-entitlement-keys.mjs`), configurar `ENTITLEMENT_SIGNING_KEY` + `ENTITLEMENT_KEY_ID=k2` en Vercel, publicar desktop con `k1` y `k2`, y retirar `k1` en el siguiente release.
- Registrar el incidente en `docs/BITACORA.md`.

## Restaurar backup
- **Dónde:** Neon (point-in-time restore según el plan) + dumps manuales `pg_dump` en almacenamiento privado del operador.
- **Cómo:** Neon Console → Branches → *Restore* al timestamp deseado (o crear rama desde el punto y cambiar `DATABASE_URL` en Vercel) → redeploy.
- **Simulacro:** restaurar en una rama nueva, apuntar una preview y verificar login + dashboard.
- **Última prueba de restauración:** pendiente (hacer antes del lanzamiento).

## Webhooks de Stripe atrasados o fallidos
Stripe reintenta hasta 3 días. Para forzar: Stripe → Webhooks → evento → *Resend*. El procesamiento es idempotente (`stripe_events`).

## Contactos y accesos
| Plataforma | Responsable | 2FA |
|---|---|---|
| GitHub (repo, releases, secrets) | Titular | obligatorio |
| Vercel (web, env vars, logs) | Titular | obligatorio |
| Neon (base de datos) | Titular | obligatorio |
| Stripe (cobros) | Titular | obligatorio |
| Resend (email) | Titular | obligatorio |
| Registrador del dominio | Titular | obligatorio |
