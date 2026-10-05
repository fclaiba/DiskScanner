# Cómo arrancar — DiskScanner Turbo

## Para seguir desarrollando con Claude Code
1. Cloná el repo y abrí una terminal en la raíz.
2. Copiá `web/.env.example` a `web/.env.local` (en local alcanza con los valores por defecto: usa PGlite, sin Postgres).
3. Ejecutá `claude` y pegá este prompt:

```
Leé CLAUDE.md, docs/BLUEPRINT.md, docs/CONTRATO-API.md, docs/BITACORA.md y docs/adr/ completos. Arrancá con el sprint en curso del plan de desarrollo, desde el "Pendiente / próximos pasos" de la última entrada de la bitácora. Trabajá por tracks (front, back, devops) respetando todas las reglas de CLAUDE.md, corré las puertas de calidad antes de cerrar, preguntame solo lo que no se puede inventar y cerrá la sesión con una entrada nueva en la bitácora.
```

Cada vez que vuelvas, alcanza con escribir "seguí".

## Para lanzar a producción
Seguí `docs/LANZAMIENTO.md` paso a paso (Neon, Stripe, Resend, Vercel, release del `.exe`, prueba de punta a punta).

## Probar todo en local (web + desktop conectados)
```bash
# 1) Web
cd web && npm ci
node scripts/generate-entitlement-keys.mjs   # copiá ENTITLEMENT_SIGNING_KEY a web/.env.local y guardá la línea k1:...
npm run dev                                  # http://localhost:3000

# 2) Desktop (otra terminal; en Windows usá set/$env: en lugar de export)
cd desktop && pip install -r requirements.txt
export DISKSCANNER_API_URL=http://localhost:3000
export DISKSCANNER_ENTITLEMENT_PUBKEY="k1:<base64 del paso 1>"
python main.py
```
Para tener Pro sin Stripe en local: registrate, frená `npm run dev` y ejecutá `cd web && npm run dev:grant-pro -- tu@email.com` (solo desarrollo; PGlite admite un proceso a la vez).

**Antes de lanzar, revisá lo marcado `(propuesta a validar)`:**
- Precios (USD 5,99/mes y USD 47,99/año) y prueba de 7 días: blueprint §7.7, `web/src/config/plans.ts`.
- Proveedor de cobro según tu país (Stripe frente a Paddle o Lemon Squeezy): ADR 0002.
- Dominio `diskscanner.app`: blueprint §9.6, `desktop/licensing.py` (`DEFAULT_API_URL`).
- Idioma del producto (inglés) y branding derivado del desktop: blueprint §4.
- Textos legales con placeholders: requieren revisión legal (`web/src/app/legal/*`).
- Costos de plataforma y certificado de firma de código: blueprint §9.10.
