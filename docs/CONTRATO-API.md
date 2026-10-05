# Contrato Desktop ↔ Web — DiskScanner Turbo (API v1)

> Fuente de verdad del límite entre la app de escritorio (`desktop/`, Python) y la plataforma SaaS (`web/`, Next.js).
> Cualquier cambio acá exige actualizar ambos lados y el BLUEPRINT (sección 7.2 / 14). Última actualización: 2026-10-05.

## Convenciones

- Base URL: `https://diskscanner.app` `(propuesta a validar)`. El desktop la lee de la constante `DEFAULT_API_URL` en `desktop/licensing.py`, sobreescribible con la variable de entorno `DISKSCANNER_API_URL` (dev: `http://localhost:3000`).
- Todo el cuerpo es JSON UTF-8. `Content-Type: application/json`.
- Endpoints del desktop bajo `/api/v1/*`. CORS: no se habilita (el cliente es un proceso nativo, no un navegador).
- Autenticación del dispositivo: `Authorization: Bearer <access_token>` + `X-Device-Fingerprint: <fingerprint>`.
- **Formato de error único** (todas las respuestas 4xx/5xx):
  ```json
  { "error": { "code": "snake_case_code", "message": "Texto legible" } }
  ```
- Timeouts del cliente: 10 s. Reintentos del cliente solo en errores de red/5xx, con backoff (1 s, 2 s, 4 s).
- Header `User-Agent: DiskScannerTurbo/<version> (<platform>)`.

## Tipos compartidos

```ts
type Plan = "free" | "pro";
type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid";
type Feature = "scan" | "cleanup" | "sync";

// Lo que se firma. Se serializa a JSON (bytes exactos) y se codifica en base64url para `payload`.
interface EntitlementPayload {
  v: 1;
  device_id: string;            // uuid
  fingerprint: string;          // 64 hex (sha256), igual al enviado por el desktop
  account_email: string;
  plan: Plan;
  status: SubscriptionStatus;
  pro: boolean;                 // el servidor decide: true si status ∈ {trialing, active, past_due}
  features: Feature[];          // free: ["scan"]; pro: ["scan","cleanup","sync"]
  current_period_end: string | null; // ISO-8601
  issued_at: number;            // unix seconds
  expires_at: number;           // unix seconds = issued_at + 7 días (ventana offline)
}

interface SignedEntitlement {
  payload: string;   // base64url (sin padding) de los bytes JSON de EntitlementPayload
  signature: string; // base64url (sin padding) de la firma Ed25519 sobre los bytes de `payload` decodificados
  kid: string;       // id de clave, p. ej. "k1" (rotación)
}
```

### Firma Ed25519

- Servidor: `ENTITLEMENT_SIGNING_KEY` = clave privada Ed25519 en PKCS#8 DER, base64 estándar. `ENTITLEMENT_KEY_ID` = `kid` (default `k1`).
- Desktop: diccionario `ENTITLEMENT_PUBLIC_KEYS = {kid: base64(raw 32 bytes)}` embebido en `licensing.py`; en dev se puede sobreescribir con `DISKSCANNER_ENTITLEMENT_PUBKEY` (formato `kid:base64raw`).
- Generación: `node web/scripts/generate-entitlement-keys.mjs` imprime ambas.
- Verificación desktop: decodificar `payload` → bytes; `Ed25519PublicKey.from_public_bytes(raw).verify(sig, bytes)`; luego `json.loads(bytes)`.
- El desktop habilita funciones Pro solo si: firma válida **y** `fingerprint` coincide con la máquina **y** `pro == true` **y** `now < expires_at` **y** la feature está en `features`.

## Flujo de vinculación (OAuth 2.0 Device Authorization Grant, simplificado)

### 1. `POST /api/v1/devices/authorize`
Entrada:
```json
{ "fingerprint": "64hex", "name": "DESKTOP-ABC (≤100)", "platform": "windows|macos|linux", "app_version": "2.0.0" }
```
Salida `200`:
```json
{
  "device_code": "opaco, ≥32 chars",
  "user_code": "ABCD-EFGH",
  "verification_uri": "https://diskscanner.app/activate",
  "verification_uri_complete": "https://diskscanner.app/activate?code=ABCD-EFGH",
  "expires_in": 900,
  "interval": 5
}
```
- `user_code`: 8 caracteres del alfabeto `BCDFGHJKLMNPQRSTVWXZ` (sin vocales ni ambiguos), formateado `XXXX-XXXX`.
- Errores: `400 invalid_request`, `429 rate_limited` (10/hora por IP).

### 2. Página web `/activate?code=XXXX-XXXX`
Requiere sesión (si no, redirige a `/login?next=/activate?code=…`). Muestra nombre y plataforma del equipo y botones **Autorizar** / **Rechazar**.
- Al autorizar: se crea o reutiliza el `device` (misma cuenta + mismo fingerprint ⇒ reutiliza), respetando el límite de equipos del plan (free: 1, pro: 3). Si se excede: mensaje con link a `/dashboard/devices`.

### 3. `POST /api/v1/devices/token`
Entrada: `{ "device_code": "…" }`
- `400 authorization_pending` — todavía no se autorizó (el desktop sigue esperando `interval` s).
- `400 slow_down` — polling más rápido que `interval`; el desktop suma 5 s.
- `400 access_denied` — el usuario rechazó.
- `400 expired_token` — pasaron `expires_in` s o el código ya se canjeó.
- `200`:
```json
{
  "access_token": "dst_<base64url 32 bytes>",
  "token_type": "Bearer",
  "device_id": "uuid",
  "account": { "email": "user@example.com" },
  "entitlement": { "payload": "…", "signature": "…", "kid": "k1" }
}
```
El token se guarda en el servidor solo como hash SHA-256. Se canjea una única vez.

## Endpoints autenticados del dispositivo

### `GET /api/v1/entitlement`
Headers: `Authorization`, `X-Device-Fingerprint`.
- `200` → `SignedEntitlement` (y actualiza `devices.last_seen_at`, `app_version` si llega header `X-App-Version`).
- `401 invalid_token` — token desconocido o equipo revocado → el desktop borra la sesión local y vuelve a modo gratis.
- `403 fingerprint_mismatch` — el token se usa desde otra máquina.
- `429 rate_limited` — 120/hora por dispositivo.

### `POST /api/v1/reports`
Solo resúmenes agregados; **nunca rutas, nombres de archivo ni nombres de carpeta del usuario.**
```json
{
  "kind": "scan | cleanup",
  "total_bytes": 0,
  "file_count": 0,
  "reclaimable_bytes": 0,
  "freed_bytes": 0,
  "duration_ms": 0,
  "app_version": "2.0.0",
  "categories": [ { "key": "browser_cache", "bytes": 0, "count": 0 } ]
}
```
- Enteros ≥ 0 (bytes hasta 2^53-1). `categories` ≤ 50 ítems, `key` `^[a-z0-9_]{1,40}$`. Cuerpo ≤ 32 KB.
- `201 { "id": "uuid" }`. Errores: `400 invalid_request`, `401 invalid_token`, `403 feature_not_available` (cuenta sin `sync`), `413 payload_too_large`, `429 rate_limited` (60/hora por dispositivo).

### `POST /api/v1/devices/self/revoke`
Cierra sesión del equipo desde el desktop. `204` sin cuerpo. `401 invalid_token` si ya estaba revocado (el desktop lo trata como éxito).

### `GET /api/v1/health`
`200 { "ok": true, "version": "x.y.z" }` — sin auth; lo usa el monitor externo.

## Comportamiento del desktop (normativo)

- La app **siempre arranca** (sin diálogo bloqueante). Sin cuenta vinculada = plan gratis: escaneo, análisis, explorador y exportar informe funcionan; todo lo destructivo (`_GATED_ENDPOINTS`) responde `403 { "error": { "code": "pro_required", … } }` y la UI abre el modal de upgrade.
- Refresco de entitlement: al arrancar y cada 6 h; si la red falla se usa el último entitlement firmado mientras `now < expires_at` (≈7 días offline).
- Sesión local cifrada (Fernet con clave derivada del fingerprint) en `%APPDATA%/DiskScannerTurbo/session.dat`.
- Sincronización: tras cada escaneo/limpieza terminada, si la feature `sync` está activa, se envía un `POST /api/v1/reports` en segundo plano (best-effort, sin bloquear la UI, sin reintentos infinitos).

## Seguridad local del desktop (servidor Flask embebido)

- Escucha solo en `127.0.0.1`, **puerto aleatorio libre** elegido al arrancar.
- **Token de sesión por arranque** (`secrets.token_urlsafe(32)`), inyectado en `index.html`; todo `/api/*` exige `X-DS-Token: <token>` (o `?t=<token>` en los streams `EventSource`). Sin token ⇒ `403`.
- Se rechaza cualquier request cuyo `Host` no sea `127.0.0.1:<puerto>` o `localhost:<puerto>` (anti DNS-rebinding).
- Ninguna operación destructiva por `GET` sin token (protege contra CSRF desde páginas web abiertas en el navegador del usuario).
