# DiskScanner Turbo (desktop) — guía de desarrollo, build y release

App de escritorio Windows: Flask local + PyWebView. Se vende como suscripción:
la app se vincula a una cuenta web y desbloquea Pro con un *entitlement*
firmado (Ed25519). El contrato con la web es **`docs/CONTRATO-API.md`**
(fuente de verdad: flujo de vinculación, firma, reportes y seguridad local).

Esta máquina tiene dos Pythons (`python` → 3.11, `py` → 3.13). **Usá `python`
(3.11) en todos los comandos**, sin mezclar intérpretes.

```powershell
python -m pip install -r requirements.txt -r requirements-dev.txt
```

## Cómo funciona el licenciamiento

- La app **siempre arranca** en modo gratis (escanear, analizar, explorar,
  exportar informe). No hay diálogo de activación bloqueante.
- El chip de cuenta (arriba a la derecha) abre **"Link account"**: la app pide
  un código `XXXX-XXXX` (`POST /api/v1/devices/authorize`), abre el navegador
  en `<API>/activate?code=…` y hace *polling* a `/api/v1/devices/token` hasta
  que el usuario autoriza.
- El servidor devuelve un `access_token` y un entitlement firmado. Se guardan
  cifrados (Fernet, clave derivada del fingerprint de la máquina) en
  `%APPDATA%\DiskScannerTurbo\session.dat`. Copiar ese archivo a otra PC no
  sirve. Nunca se guarda un flag "pro" sin firma: cada chequeo vuelve a
  verificar la firma.
- Pro se habilita solo si: firma válida **y** fingerprint coincide **y**
  `pro == true` **y** `now < expires_at` **y** la feature está en `features`.
- Refresco del entitlement al arrancar y cada 6 h. Sin red se usa el último
  entitlement firmado hasta su `expires_at` (≈ 7 días offline).
- Toda acción destructiva sin Pro responde `403 {"error":{"code":"pro_required"}}`
  y la UI abre el modal de upgrade.
- Con la feature `sync`, después de cada escaneo/limpieza se envía un
  `POST /api/v1/reports` en segundo plano, **solo con números agregados y
  claves de categoría** (`temp`, `browser_cache`, `zombies`, …): nunca rutas
  ni nombres de archivo.

### Seguridad del servidor local

Flask escucha en `127.0.0.1` en un **puerto libre aleatorio** y exige un
**token por arranque** (`X-DS-Token`, o `?t=` en los `EventSource`) en todo
`/api/*`; rechaza cualquier `Host` que no sea `127.0.0.1:<puerto>` /
`localhost:<puerto>` (anti DNS-rebinding). El token se inyecta en
`index.html`; `static/app.js` lo agrega en un único helper (`apiFetch` /
`apiEventSource`).

## Variables de entorno

| Variable | Uso | ¿En un .exe de release? |
|---|---|---|
| `DISKSCANNER_API_URL` | URL base de la web (default `https://diskscanner.app`). En build se *hornea* en `DEFAULT_API_URL`; en runtime también la sobreescribe. | Sí (runtime y build) |
| `DISKSCANNER_ENTITLEMENT_PUBKEY` | Clave pública Ed25519 `kid:base64raw`. En build se hornea en `ENTITLEMENT_PUBLIC_KEYS` (admite `k1:…,k2:…` para rotación). En dev la sobreescribe en runtime. | Solo en build |
| `DISKSCANNER_SKIP_LICENSE=1` | Bypass total de licencia para desarrollo. | **Ignorada** |
| `DISKSCANNER_DEV_TOKEN` | Token fijo para `python app.py` (modo dev). | No aplica |

Los builds (`build.py` y `build_release.py`) ponen `_DEV_OVERRIDES = False` en
la copia de `licensing.py` que empaquetan: así un usuario final no puede
cambiar la clave pública por una propia ni saltarse el chequeo con variables
de entorno. `python build.py --dev` mantiene los overrides (solo para probar
un .exe local).

## Desarrollo

```powershell
# Tests y lint (corren también en Linux, sin red ni pywebview)
python -m pytest -q
ruff check .

# App completa (ventana nativa)
python main.py

# Solo el servidor, para abrir en el navegador: puerto fijo 5000,
# imprime la URL y el token
python app.py
```

### Prueba end-to-end contra la web local

1. Levantá la web (`web/`, `npm run dev` → `http://localhost:3000`) y generá el
   par de claves con `node web/scripts/generate-entitlement-keys.mjs`
   (configurá la privada en la web: `ENTITLEMENT_SIGNING_KEY`,
   `ENTITLEMENT_KEY_ID=k1`).
2. En la consola del desktop:
   ```powershell
   $env:DISKSCANNER_API_URL = "http://localhost:3000"
   $env:DISKSCANNER_ENTITLEMENT_PUBKEY = "k1:<clave pública base64 raw>"
   python main.py
   ```
3. Chip de cuenta → **Link account** → autorizá el código en el navegador.
   Con una suscripción de prueba activa, el chip pasa a `Pro · email` y las
   limpiezas quedan habilitadas. **I already subscribed** fuerza el refresco.

## Builds

### 1. `build.py` — PyInstaller (dev y CI)

```powershell
python build.py          # interactivo (espera ENTER al final)
python build.py --ci     # no interactivo, código de salida != 0 si falla
python build.py --dev    # conserva los overrides de entorno en el .exe
```

Copia el código a `build\pyi_src\`, hornea la configuración de release en
`licensing.py` (desde las variables de entorno de arriba) y compila con
`DiskScannerTurbo.spec` → `dist\DiskScannerTurbo.exe`. No ofrece protección
contra descompilación.

### 2. `build_release.py` — release endurecido (PyArmor + Nuitka)

```powershell
python -m pip install nuitka pyarmor
$env:DISKSCANNER_API_URL = "https://diskscanner.app"
$env:DISKSCANNER_ENTITLEMENT_PUBKEY = "k1:<clave pública base64 raw>"
python build_release.py
```

Además de hornear URL y claves, embebe el hash de integridad de
`templates/index.html` + `static/app.js` (`_INTEGRITY_TAG`), ofusca con
PyArmor y compila con Nuitka → `dist_nuitka\DiskScannerTurbo.exe`.

- **Primera vez:** Nuitka descarga su MinGW64 (`--assume-yes-for-downloads`
  ya está en el script); necesita internet y suma varios minutos. Luego usa la
  caché en `%LOCALAPPDATA%\Nuitka\Nuitka\Cache`.
- Si preferís MSVC, instalá Visual Studio Build Tools ("Desktop development
  with C++"); Nuitka lo detecta solo. No es obligatorio.
- PyArmor 8.x usa `pyarmor gen`; con PyArmor 7.x cambiá el comando por
  `pyarmor obfuscate` en `build_release.py`.
- Expectativa realista: disuade el crack casual. La protección real es que el
  entitlement lo firma el servidor y la app no tiene la clave privada.

## Release automático (GitHub Actions)

`.github/workflows/desktop-release.yml` se ejecuta al pushear un tag `v*`
(o a mano con *workflow_dispatch*) en `windows-latest` con Python 3.11:
instala dependencias, corre `ruff` y `pytest`, compila con
`python build.py --ci`, calcula el SHA-256 y sube
`DiskScannerTurbo.exe` + `DiskScannerTurbo.exe.sha256` al GitHub Release del
tag.

```powershell
git tag v2.0.0
git push origin v2.0.0
```

Secrets del repositorio (Settings → Secrets and variables → Actions):

| Secret | Obligatorio | Contenido |
|---|---|---|
| `DISKSCANNER_API_URL` | Sí | `https://diskscanner.app` (o la URL de producción) |
| `DISKSCANNER_ENTITLEMENT_PUBKEY` | Sí | `k1:<clave pública base64 raw>` (rotación: `k1:…,k2:…`) |
| `WINDOWS_CERT_PFX` | No | Certificado de firma de código `.pfx` en **base64** |
| `WINDOWS_CERT_PASSWORD` | No | Contraseña del `.pfx` |

### Firma de código (opcional)

Si `WINDOWS_CERT_PFX` está definido, el workflow decodifica el `.pfx` y firma
el `.exe` con `signtool` (SHA-256 + sello de tiempo RFC 3161 de DigiCert)
**antes** de calcular el hash. Sin ese secret el paso se omite y el `.exe` sale
sin firmar (SmartScreen mostrará la advertencia de editor desconocido).

Para generar el valor del secret a partir del certificado:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```

Rotación de la clave de entitlements: publicar primero un desktop con ambas
claves (`k1:…,k2:…`), luego cambiar `ENTITLEMENT_KEY_ID` en la web y, cuando
ya no queden instalaciones viejas, retirar la clave anterior.
