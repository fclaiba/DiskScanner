# Checklist de lanzamiento — DiskScanner Turbo

Todo lo que necesita **el titular** (cuentas, claves, decisiones legales) para pasar de "funciona en local" a "cobra en producción". El código ya está listo; estos pasos no se pueden automatizar porque requieren tus cuentas y datos.

Tiempo estimado: 2–4 horas (más la espera de aprobación de Stripe y del certificado de firma).

---

## 0. Decisiones previas (15 min)
- [ ] **Precio final.** Propuesta: USD 5,99/mes y USD 47,99/año con 7 días de prueba. Si cambia, editá `web/src/config/plans.ts` (solo display) y creá los precios en Stripe.
- [ ] **Dominio.** Propuesta: `diskscanner.app`. Comprarlo (Vercel Domains, Namecheap, Cloudflare).
- [ ] **Proveedor de cobro según tu país** (ver ADR 0002):
  - Si tenés empresa o cuenta en un país soportado por Stripe (EE.UU. vía Stripe Atlas/LLC, España, México, Brasil, etc.) → seguí con Stripe.
  - Si no (por ejemplo, persona física en Argentina) → avisá al agente para implementar el adaptador Paddle o Lemon Squeezy (merchant of record; ellos facturan y liquidan impuestos). Es aproximadamente un sprint.
- [ ] **Datos legales:** razón social o nombre, país, email de soporte. Reemplazá los placeholders `[COMPANY NAME]` y similares en `web/src/app/legal/*` y hacé revisar los textos por un abogado.

## 1. Base de datos — Neon (10 min)
1. Crear cuenta en https://neon.tech → nuevo proyecto (región cercana a la de Vercel, por ejemplo `us-east-1`).
2. Copiar la *connection string* (pooled) → será `DATABASE_URL`.
3. Las migraciones se aplican solas en cada deploy de Vercel (`vercel.json`). Para aplicarlas a mano: `cd web && npm ci && DATABASE_URL="postgres://…" npm run db:migrate`.
4. Para los deploys *Preview*, creá una rama de Neon (o usá la integración Neon ↔ Vercel, que crea una por preview) para no migrar producción desde una rama sin mergear.

## 2. Clave de firma de entitlements (2 min)
```bash
node web/scripts/generate-entitlement-keys.mjs
```
- `ENTITLEMENT_SIGNING_KEY=…` → **solo** en Vercel (secreto).
- La línea `k1:<base64>` → secreto `DISKSCANNER_ENTITLEMENT_PUBKEY` en GitHub (se compila dentro del `.exe`).
- Guardá una copia de la clave privada en un gestor de contraseñas. Si la perdés, los equipos dejan de validar hasta publicar un desktop nuevo.

## 3. Stripe (30 min + verificación de la cuenta)
1. Activar la cuenta (datos del negocio y banco).
2. **Producto** "DiskScanner Turbo Pro" con dos precios recurrentes: mensual y anual → copiar los `price_…` en `STRIPE_PRICE_PRO_MONTHLY` y `STRIPE_PRICE_PRO_YEARLY`.
3. **Customer Portal** (Settings → Billing → Customer portal): permitir cancelar, cambiar plan (mensual ↔ anual) y actualizar el medio de pago.
4. **Webhook** → endpoint `https://<dominio>/api/stripe/webhook` con los eventos:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` → copiar el *signing secret* a `STRIPE_WEBHOOK_SECRET`.
5. `STRIPE_SECRET_KEY` = clave secreta **live** (`sk_live_…`). Usá una *restricted key* si querés mínimo privilegio.
6. Opcional: activar Stripe Tax y poner `STRIPE_AUTOMATIC_TAX=true`.
7. Recomendado: Settings → Emails → activar recibos y avisos de pago fallido.

## 4. Email — Resend (10 min)
1. Cuenta en https://resend.com → verificar el dominio (registros DNS SPF/DKIM).
2. `RESEND_API_KEY` y `EMAIL_FROM="DiskScanner Turbo <hello@tu-dominio>"`.

## 5. Web — Vercel (20 min)
1. Importar el repo de GitHub → **Root Directory: `web`** (framework Next.js detectado).
2. Variables de entorno de producción (ver `web/.env.example`): `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL=https://<dominio>`, `NEXT_PUBLIC_DOWNLOAD_URL`, `STRIPE_*`, `ENTITLEMENT_SIGNING_KEY`, `ENTITLEMENT_KEY_ID=k1`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (aleatorio: `openssl rand -hex 32`).
3. Para *Preview*: usar claves **test** de Stripe y una rama de Neon, nunca la base de producción.
4. Agregar el dominio en Vercel → Domains, y configurar el DNS que indique.
5. Deploy → verificar `https://<dominio>/api/v1/health`.
6. Uso comercial: Vercel Hobby no permite uso comercial → pasar a **Pro** al empezar a cobrar.

## 6. Desktop — primer release (30 min)
1. GitHub → Settings → Secrets and variables → Actions:
   - `DISKSCANNER_API_URL` = `https://<dominio>`
   - `DISKSCANNER_ENTITLEMENT_PUBKEY` = `k1:<base64>` (paso 2)
   - Opcional: `WINDOWS_CERT_PFX` (base64 del .pfx) y `WINDOWS_CERT_PASSWORD` para firmar el `.exe`.
2. Crear el tag: `git tag v2.0.0 && git push origin v2.0.0` → el workflow **desktop-release** publica `DiskScannerTurbo.exe` en GitHub Releases.
3. El repo tiene que ser **público** para que `releases/latest/download/...` funcione sin login, o bien subí el `.exe` a otro hosting (Vercel Blob, Cloudflare R2) y cambiá `NEXT_PUBLIC_DOWNLOAD_URL`.
4. **Firma de código (muy recomendada):** sin certificado, Windows SmartScreen muestra "Windows protected your PC" y baja la conversión. Opciones: certificado OV/EV (Sectigo, SSL.com, ~USD 200–400/año) o Azure Trusted Signing (~USD 10/mes, requiere verificación de identidad).
5. Para el build endurecido (PyArmor + Nuitka), ver `desktop/BUILD.md`.

## 7. Prueba de punta a punta en producción (20 min)
- [ ] Descargar el `.exe` desde `/download` en una PC/VM Windows limpia.
- [ ] Escanear sin cuenta (gratis).
- [ ] Intentar una limpieza → aparece el modal Upgrade.
- [ ] Vincular la cuenta (código en `/activate`) → el chip muestra "Free".
- [ ] Suscribirse con un **cupón del 100 %** creado en Stripe live (o con tu tarjeta y luego reembolsar).
- [ ] En ≤ 60 s (o con "I already subscribed") el desktop pasa a Pro.
- [ ] Ejecutar una limpieza → aparece el reporte en `/dashboard`.
- [ ] Cancelar en el portal → al terminar el período vuelve a Free.
- [ ] Revocar el equipo desde `/dashboard/devices` → el desktop vuelve a Free en el próximo refresco.

## 8. Operación
- [ ] Monitor externo (UptimeRobot o Better Stack, gratis) sobre `https://<dominio>/api/v1/health` cada 5 min, con alerta por email.
- [ ] Simulacro de restauración de Neon (ver runbook) y anotarlo en la bitácora.
- [ ] 2FA en GitHub, Vercel, Neon, Stripe, Resend y el registrador del dominio.
- [ ] Alertas de gasto en Vercel y Neon.

## 9. Para vender (primeras semanas)
- Página de producto lista: landing, precios con FAQ y prueba gratuita.
- Canales con mejor encaje: r/pcmasterrace, r/webdev y r/androiddev (el ángulo de `node_modules` y Gradle), Product Hunt, Hacker News (Show HN), YouTube de "cómo liberar espacio en Windows".
- Cupón de lanzamiento (`LAUNCH30`) creado en Stripe; los códigos promocionales ya están habilitados en el checkout.
- Medir: descargas → vinculaciones → trials → pagos (eventos de la sección 6.8 del blueprint).
