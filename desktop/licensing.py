"""
Account/device licensing for the DiskScanner Turbo SaaS (contract:
docs/CONTRATO-API.md - read that first, this module implements it exactly).

Flow:
- The app always starts in free mode. The user links it to a web account via
  an OAuth 2.0 Device Authorization Grant (start_device_login() ->
  user approves XXXX-XXXX on <API>/activate -> poll_device_login()).
- The server answers with an opaque device access_token plus an Ed25519-signed
  entitlement (SignedEntitlement). Pro features unlock only when the signature
  is valid AND the payload's fingerprint matches this machine AND pro is true
  AND now < expires_at AND the feature is listed.
- The session (token, device id, email, last SignedEntitlement) lives in
  session.dat, Fernet-encrypted with a key derived from the machine
  fingerprint, so copying the file to another PC does not carry it over. No
  decoded/unsigned "pro" flag is ever persisted - every check re-verifies the
  stored signature.
- refresh_entitlement() runs at startup and every 6h (see main.py). If the
  network is down, the cached signed entitlement keeps working until its own
  expires_at (~7 days offline window, decided by the server).

Naming note: the gate entry point is `refresh_capabilities()`, not
`is_licensed`/`check_license` - it also runs from the disk-health path rather
than only from a standalone, easily-greppable gate. This raises the bar
against the laziest crack (a `strings`/grep pass over the shipped .exe); it is
not a defense against a determined reverse engineer with a debugger. The real
protection is that the entitlement is signed server-side.
"""

import base64
import binascii
import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time

import requests
from cryptography.exceptions import InvalidSignature
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

APP_NAME = "DiskScannerTurbo"
APP_VERSION = "2.0.0"

# Baked at release time by build_release.py (from DISKSCANNER_API_URL), and
# overridable at runtime with the same env var (dev: http://localhost:3000).
DEFAULT_API_URL = "https://diskscanner.app"

# kid -> base64 of the raw 32-byte Ed25519 public key. Baked at release time
# by build_release.py (from DISKSCANNER_ENTITLEMENT_PUBKEY). For key rotation,
# ship a build with both the old and new kid before retiring the old one.
ENTITLEMENT_PUBLIC_KEYS = {"k1": "<PLACEHOLDER>"}

# Env overrides meant for development/tests only: DISKSCANNER_ENTITLEMENT_PUBKEY
# and DISKSCANNER_SKIP_LICENSE. build.py / build_release.py bake this to False
# so an end user of a shipped .exe can't swap in their own signing key or skip
# the check. DISKSCANNER_API_URL stays honored (harmless: the server's
# signature is still required).
_DEV_OVERRIDES = True

HTTP_TIMEOUT = 10
RETRY_BACKOFF = (1, 2, 4)  # seconds, network errors / 5xx only
REFRESH_INTERVAL_SECONDS = 6 * 3600
# refresh_entitlement(force=False) skips the network if the last successful
# refresh is more recent than this (window-focus refreshes, etc.).
MIN_REFRESH_SECONDS = 300

FREE_FEATURES = ["scan"]
KNOWN_FEATURES = ("scan", "cleanup", "sync")
REPORT_KINDS = ("scan", "cleanup")
REPORT_CATEGORY_KEY_RE = re.compile(r"^[a-z0-9_]{1,40}$")
REPORT_MAX_CATEGORIES = 50
REPORT_MAX_INT = 2 ** 53 - 1
REPORT_MAX_BODY = 32 * 1024

# Replaced by build_release.py with the sha256 of the shipped
# templates/index.html + static/app.js before PyArmor/Nuitka run. Stays None
# in a plain source checkout (or a PyInstaller dev build), so the check below
# is a no-op unless this is a hardened release build.
_INTEGRITY_TAG = None

# Indirection so tests can skip the real backoff waits.
_sleep = time.sleep

# In-memory runtime state (never persisted). Guarded by _lock.
_lock = threading.RLock()
_runtime = {
    "offline": False,          # last network attempt failed for network reasons
    "last_error": None,        # stable error code of the last failure, or None
    "last_refresh_at": 0.0,    # time of the last successful entitlement fetch
}
# Pending device login (device_code stays in-process, never sent to the UI).
_pending = None
_fingerprint_cache = None


class ApiError(Exception):
    """4xx (or exhausted 5xx) answer from the web API, in the contract's
    `{"error": {"code", "message"}}` format."""

    def __init__(self, status, code, message=""):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message


class NetworkError(Exception):
    """The API could not be reached at all (DNS, connection, timeout)."""


# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

def api_url():
    return (os.environ.get("DISKSCANNER_API_URL") or DEFAULT_API_URL).rstrip("/")


def _public_keys():
    keys = dict(ENTITLEMENT_PUBLIC_KEYS)
    override = os.environ.get("DISKSCANNER_ENTITLEMENT_PUBKEY", "").strip() if _DEV_OVERRIDES else ""
    if override and ":" in override:
        kid, b64 = override.split(":", 1)
        keys[kid.strip()] = b64.strip()
    return keys


def _platform_name():
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def _user_agent():
    return f"DiskScannerTurbo/{APP_VERSION} ({_platform_name()})"


def _appdata_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = os.path.join(base, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def _session_path():
    return os.path.join(_appdata_dir(), "session.dat")


# ------------------------------------------------------------------
# Machine fingerprint
# ------------------------------------------------------------------

_CIM_CLASS_MAP = {
    "diskdrive": "Win32_DiskDrive",
    "cpu": "Win32_Processor",
}


def _wmic_value(alias, prop):
    """Best-effort single value identifying a piece of hardware. Tries `wmic`
    first, falls back to the PowerShell/CIM equivalent since wmic.exe was
    removed from recent Windows 11 builds. Returns '' on any failure
    (non-Windows, permission issues, etc.) - the fingerprint then degrades to
    hostname-only rather than crashing."""
    try:
        result = subprocess.run(
            ["wmic", alias, "get", prop],
            capture_output=True, text=True, timeout=5,
            creationflags=0x08000000,
        )
        lines = [line.strip() for line in result.stdout.strip().splitlines() if line.strip()]
        if len(lines) > 1:
            return lines[1]
    except Exception:
        pass

    cim_class = _CIM_CLASS_MAP.get(alias)
    if not cim_class:
        return ""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"(Get-CimInstance {cim_class} | Select-Object -First 1 -ExpandProperty {prop})"],
            capture_output=True, text=True, timeout=5,
            creationflags=0x08000000,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def get_machine_fingerprint():
    """64-hex sha256 of hostname + disk serial + CPU id (Windows). Stable
    across reboots; only changes on a real hardware/OS reinstall or hostname
    change. On non-Windows (dev/tests) it degrades to hostname-only. Memoized:
    the WMIC/PowerShell calls take ~1s and the value can't change at runtime."""
    global _fingerprint_cache
    if _fingerprint_cache is None:
        parts = [socket.gethostname()]
        if sys.platform == "win32":
            parts.append(_wmic_value("diskdrive", "serialnumber"))
            parts.append(_wmic_value("cpu", "processorid"))
        raw = "|".join(p for p in parts if p)
        _fingerprint_cache = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return _fingerprint_cache


# ------------------------------------------------------------------
# Encrypted session file
# ------------------------------------------------------------------

def _fernet_for(fingerprint):
    key = base64.urlsafe_b64encode(hashlib.sha256(("session-v1|" + fingerprint).encode("utf-8")).digest())
    return Fernet(key)


def _load_session():
    """Returns the decrypted session dict, or None (missing, corrupt, or
    encrypted for a different machine)."""
    path = _session_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            blob = f.read()
        data = json.loads(_fernet_for(get_machine_fingerprint()).decrypt(blob).decode("utf-8"))
    except (InvalidToken, ValueError, OSError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("access_token"), str):
        return None
    return data


def _save_session(data):
    blob = _fernet_for(get_machine_fingerprint()).encrypt(json.dumps(data).encode("utf-8"))
    path = _session_path()
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(blob)
    os.replace(tmp, path)


def _wipe_session():
    try:
        os.remove(_session_path())
    except FileNotFoundError:
        pass
    except OSError:
        # Can't delete (locked?) - overwrite so the token is unusable anyway.
        try:
            with open(_session_path(), "wb") as f:
                f.write(b"")
        except OSError:
            pass


# ------------------------------------------------------------------
# Entitlement verification
# ------------------------------------------------------------------

def _b64url_decode(value):
    if not isinstance(value, str):
        raise ValueError("not a string")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_entitlement(signed, fingerprint=None):
    """Verifies a SignedEntitlement. Returns (payload_dict, None) when the
    signature is valid for a known kid and the payload is bound to this
    machine, else (None, reason). Does NOT check pro/expiry/features - see
    _evaluate()."""
    if not isinstance(signed, dict):
        return None, "missing_entitlement"
    kid = signed.get("kid")
    key_b64 = _public_keys().get(kid) if isinstance(kid, str) else None
    if not key_b64:
        return None, "unknown_kid"
    try:
        public_key = Ed25519PublicKey.from_public_bytes(base64.b64decode(key_b64, validate=True))
        payload_bytes = _b64url_decode(signed.get("payload"))
        signature = _b64url_decode(signed.get("signature"))
        public_key.verify(signature, payload_bytes)
    except (InvalidSignature, ValueError, TypeError, binascii.Error):
        return None, "invalid_signature"
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None, "invalid_payload"
    if not isinstance(payload, dict) or payload.get("v") != 1:
        return None, "invalid_payload"
    if payload.get("fingerprint") != (fingerprint or get_machine_fingerprint()):
        return None, "fingerprint_mismatch"
    return payload, None


def _evaluate(payload, now=None):
    """(pro_active, features, reason) for an already-verified payload."""
    now = time.time() if now is None else now
    expires_at = payload.get("expires_at")
    if not isinstance(expires_at, (int, float)) or now >= expires_at:
        return False, list(FREE_FEATURES), "entitlement_expired"
    if payload.get("pro") is not True:
        return False, list(FREE_FEATURES), "not_pro"
    features = payload.get("features")
    if not isinstance(features, list):
        features = []
    features = [f for f in features if isinstance(f, str)]
    if "scan" not in features:
        features.insert(0, "scan")
    return True, features, "entitled"


def _dev_bypass():
    # Ignored in release builds (_DEV_OVERRIDES baked to False).
    return _DEV_OVERRIDES and os.environ.get("DISKSCANNER_SKIP_LICENSE") == "1"


def _integrity_ok():
    """Best-effort tamper check for hardened release builds: re-hash the
    bundled UI resources and compare against the hash baked in at build time.
    A no-op (returns True) for source checkouts / dev builds where
    _INTEGRITY_TAG was never set. On mismatch, callers degrade gracefully
    (free mode) rather than crash - an instant hard failure is the easiest
    thing for a patcher to correlate back to this exact check."""
    if not _INTEGRITY_TAG:
        return True
    h = hashlib.sha256()
    try:
        for path in _bundled_resource_paths():
            with open(path, "rb") as f:
                h.update(f.read())
    except OSError:
        return True
    return h.hexdigest() == _INTEGRITY_TAG


def _bundled_resource_paths():
    """Where templates/index.html + static/app.js actually live at runtime -
    project root when running from source, or next to the frozen executable
    once packaged (PyInstaller/Nuitka onefile builds extract to a temp dir
    exposed as sys._MEIPASS)."""
    if getattr(sys, "frozen", False) or "__compiled__" in globals():
        base = getattr(sys, "_MEIPASS", None) or os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return [
        os.path.join(base, "templates", "index.html"),
        os.path.join(base, "static", "app.js"),
    ]


def refresh_capabilities():
    """The gate check, local only (no network). Returns (ok: bool, reason: str)
    where ok means "destructive/Pro cleanup features are allowed".

    DISKSCANNER_SKIP_LICENSE=1 short-circuits all of this, for local
    development without a web backend. Checked here (not only in main.py)
    because this function runs on every gated request and every disk-health
    poll - a bypass applied only at startup would be silently overwritten.
    """
    if _dev_bypass():
        return True, "dev_bypass"
    if not _integrity_ok():
        return False, "integrity_mismatch"
    session = _load_session()
    if not session:
        return False, "not_linked"
    payload, reason = verify_entitlement(session.get("entitlement"))
    if payload is None:
        return False, reason
    pro, features, reason = _evaluate(payload)
    if not pro:
        return False, reason
    if "cleanup" not in features:
        return False, "feature_missing"
    with _lock:
        offline = _runtime["offline"]
    return True, "offline_grace" if offline else "entitled"


def has_feature(name):
    if _dev_bypass():
        return True
    if name == "scan":
        return True  # free tier, always available
    if not _integrity_ok():
        return False
    session = _load_session()
    if not session:
        return False
    payload, _reason = verify_entitlement(session.get("entitlement"))
    if payload is None:
        return False
    pro, features, _reason = _evaluate(payload)
    return pro and name in features


def current_state():
    """Snapshot for the UI (GET /api/account/status). Re-verifies the stored
    signature every time; never trusts anything unsigned."""
    with _lock:
        offline = _runtime["offline"]
        last_error = _runtime["last_error"]
    state = {
        "linked": False,
        "email": None,
        "plan": "free",
        "status": "none",
        "pro": False,
        "features": list(FREE_FEATURES),
        "current_period_end": None,
        "expires_at": None,
        "offline": offline,
        "last_error": last_error,
        "app_version": APP_VERSION,
        "dev_bypass": False,
    }
    if _dev_bypass():
        state.update(plan="pro", status="active", pro=True, features=list(KNOWN_FEATURES), dev_bypass=True)
        return state

    session = _load_session()
    if not session:
        return state
    state["linked"] = True
    state["email"] = session.get("email")
    payload, reason = verify_entitlement(session.get("entitlement"))
    if payload is None:
        state["last_error"] = last_error or reason
        return state
    if not _integrity_ok():
        state["last_error"] = "integrity_mismatch"
        return state
    pro, features, reason = _evaluate(payload)
    state.update(
        email=payload.get("account_email") or state["email"],
        plan=payload.get("plan") if payload.get("plan") in ("free", "pro") else "free",
        status=payload.get("status") if isinstance(payload.get("status"), str) else "none",
        pro=pro,
        features=features,
        current_period_end=payload.get("current_period_end"),
        expires_at=payload.get("expires_at"),
    )
    if not pro and reason == "entitlement_expired":
        state["last_error"] = last_error or "entitlement_expired"
    return state


# ------------------------------------------------------------------
# HTTP
# ------------------------------------------------------------------

def _set_runtime(**kwargs):
    with _lock:
        _runtime.update(kwargs)


def _error_from_response(resp):
    code, message = "http_%d" % resp.status_code, ""
    try:
        body = resp.json()
        err = body.get("error") if isinstance(body, dict) else None
        if isinstance(err, dict):
            code = str(err.get("code") or code)
            message = str(err.get("message") or "")
    except ValueError:
        pass
    return ApiError(resp.status_code, code, message)


def _request(method, path, body=None, session=None, retries=True):
    """One API call per the contract: 10s timeout, contract User-Agent,
    retries with backoff (1s, 2s, 4s) only on network errors and 5xx.
    Returns the Response on 2xx; raises ApiError / NetworkError otherwise."""
    headers = {"User-Agent": _user_agent(), "Accept": "application/json", "X-App-Version": APP_VERSION}
    if session:
        headers["Authorization"] = f"Bearer {session['access_token']}"
        headers["X-Device-Fingerprint"] = get_machine_fingerprint()
    url = api_url() + path
    delays = RETRY_BACKOFF if retries else ()
    attempt = 0
    while True:
        try:
            resp = requests.request(method, url, json=body, headers=headers, timeout=HTTP_TIMEOUT)
        except requests.RequestException as e:
            if attempt < len(delays):
                _sleep(delays[attempt])
                attempt += 1
                continue
            raise NetworkError(str(e)) from e
        if resp.status_code >= 500 and attempt < len(delays):
            _sleep(delays[attempt])
            attempt += 1
            continue
        if 200 <= resp.status_code < 300:
            return resp
        raise _error_from_response(resp)


def _json_or_none(resp):
    try:
        body = resp.json()
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


def _is_signed_entitlement(value):
    return (isinstance(value, dict)
            and all(isinstance(value.get(k), str) for k in ("payload", "signature", "kid")))


# ------------------------------------------------------------------
# Device authorization flow
# ------------------------------------------------------------------

def _safe_verification_uri(uri, user_code):
    """Only ever open URLs on our own API origin in the system browser - a
    compromised/misconfigured server must not be able to make the app launch
    file:// or arbitrary URLs."""
    base = api_url()
    if isinstance(uri, str) and (uri == base or uri.startswith(base + "/")):
        return uri
    return f"{base}/activate?code={user_code}"


def start_device_login():
    """POST /api/v1/devices/authorize. Returns a dict for the UI:
    {"ok": True, user_code, verification_uri, verification_uri_complete,
    expires_in, interval} or {"ok": False, "error": code, "message": msg}.
    The device_code is kept in-process for poll_device_login()."""
    global _pending
    body = {
        "fingerprint": get_machine_fingerprint(),
        "name": (socket.gethostname() or "PC")[:100],
        "platform": _platform_name(),
        "app_version": APP_VERSION,
    }
    try:
        resp = _request("POST", "/api/v1/devices/authorize", body)
    except NetworkError:
        _set_runtime(offline=True, last_error="network_error")
        return {"ok": False, "error": "network_error", "message": "Could not reach the server. Check your connection."}
    except ApiError as e:
        _set_runtime(offline=False, last_error=e.code)
        return {"ok": False, "error": e.code, "message": e.message or "The server rejected the request."}

    data = _json_or_none(resp) or {}
    device_code = data.get("device_code")
    user_code = data.get("user_code")
    if not isinstance(device_code, str) or not isinstance(user_code, str):
        return {"ok": False, "error": "invalid_response", "message": "Unexpected answer from the server."}
    expires_in = data.get("expires_in") if isinstance(data.get("expires_in"), int) else 900
    interval = data.get("interval") if isinstance(data.get("interval"), int) else 5
    complete = _safe_verification_uri(data.get("verification_uri_complete"), user_code)
    with _lock:
        _pending = {
            "device_code": device_code,
            "user_code": user_code,
            "verification_uri_complete": complete,
            "interval": max(1, interval),
            "expires_at": time.time() + expires_in,
            "last_poll_at": 0.0,
        }
    _set_runtime(offline=False, last_error=None)
    return {
        "ok": True,
        "user_code": user_code,
        "verification_uri": _safe_verification_uri(data.get("verification_uri"), user_code),
        "verification_uri_complete": complete,
        "expires_in": expires_in,
        "interval": max(1, interval),
    }


def pending_verification_uri():
    with _lock:
        return _pending["verification_uri_complete"] if _pending else None


def cancel_device_login():
    global _pending
    with _lock:
        _pending = None


def poll_device_login(device_code=None):
    """POST /api/v1/devices/token once. Returns {"status": ...} where status
    is one of: pending, slow_down, linked, denied, expired, error.
    `interval` (seconds) tells the UI when to poll next. Calls made before the
    current interval elapsed return "pending" without touching the network,
    so a fast-clicking UI can't trigger slow_down."""
    global _pending
    with _lock:
        pending = dict(_pending) if _pending else None
    if device_code is None:
        if not pending:
            return {"status": "expired", "interval": 0}
        device_code = pending["device_code"]
    elif pending and pending["device_code"] != device_code:
        pending = None

    if pending:
        if time.time() >= pending["expires_at"]:
            cancel_device_login()
            return {"status": "expired", "interval": 0}
        wait = pending["last_poll_at"] + pending["interval"] - time.time()
        if wait > 0.5:
            return {"status": "pending", "interval": pending["interval"]}
        with _lock:
            if _pending:
                _pending["last_poll_at"] = time.time()
    interval = pending["interval"] if pending else 5

    try:
        resp = _request("POST", "/api/v1/devices/token", {"device_code": device_code}, retries=False)
    except NetworkError:
        _set_runtime(offline=True)
        return {"status": "pending", "interval": interval, "offline": True}
    except ApiError as e:
        _set_runtime(offline=False)
        if e.code == "authorization_pending":
            return {"status": "pending", "interval": interval}
        if e.code == "slow_down":
            interval += 5
            with _lock:
                if _pending:
                    _pending["interval"] = interval
            return {"status": "slow_down", "interval": interval}
        if e.code == "access_denied":
            cancel_device_login()
            return {"status": "denied", "interval": 0}
        if e.code == "expired_token":
            cancel_device_login()
            return {"status": "expired", "interval": 0}
        if e.status >= 500:
            return {"status": "pending", "interval": interval}
        return {"status": "error", "error": e.code, "message": e.message, "interval": 0}

    data = _json_or_none(resp) or {}
    token = data.get("access_token")
    entitlement = data.get("entitlement")
    account = data.get("account") if isinstance(data.get("account"), dict) else {}
    if not isinstance(token, str) or not token or not _is_signed_entitlement(entitlement):
        return {"status": "error", "error": "invalid_response", "message": "Unexpected answer from the server.",
                "interval": 0}

    _save_session({
        "access_token": token,
        "device_id": data.get("device_id") if isinstance(data.get("device_id"), str) else None,
        "email": account.get("email") if isinstance(account.get("email"), str) else None,
        "entitlement": entitlement,
        "linked_at": time.time(),
    })
    cancel_device_login()
    _payload, reason = verify_entitlement(entitlement)
    _set_runtime(offline=False, last_error=reason, last_refresh_at=time.time())
    return {"status": "linked", "interval": 0, "state": current_state()}


# ------------------------------------------------------------------
# Entitlement refresh / logout
# ------------------------------------------------------------------

def refresh_entitlement(force=False):
    """GET /api/v1/entitlement and store the new SignedEntitlement if it
    verifies. Network failure keeps the cached one (offline grace until its
    expires_at). 401 invalid_token (or 403 fingerprint_mismatch) wipes the
    session -> free mode. Returns current_state()."""
    session = _load_session()
    if not session:
        return current_state()
    with _lock:
        recent = time.time() - _runtime["last_refresh_at"] < MIN_REFRESH_SECONDS
    if recent and not force:
        return current_state()

    try:
        resp = _request("GET", "/api/v1/entitlement", session=session)
    except NetworkError:
        _set_runtime(offline=True, last_error="network_error")
        return current_state()
    except ApiError as e:
        if e.code in ("invalid_token", "fingerprint_mismatch") or e.status == 401:
            _wipe_session()
            _set_runtime(offline=False, last_error=e.code)
        else:
            # rate_limited / 5xx after retries: keep the cached entitlement.
            _set_runtime(offline=e.status >= 500, last_error=e.code)
        return current_state()

    signed = _json_or_none(resp)
    if not _is_signed_entitlement(signed):
        _set_runtime(offline=False, last_error="invalid_response")
        return current_state()
    payload, reason = verify_entitlement(signed)
    if payload is None:
        # Don't replace a good cached entitlement with one we can't verify.
        _set_runtime(offline=False, last_error=reason)
        return current_state()
    session["entitlement"] = {"payload": signed["payload"], "signature": signed["signature"], "kid": signed["kid"]}
    if isinstance(payload.get("account_email"), str):
        session["email"] = payload["account_email"]
    if isinstance(payload.get("device_id"), str):
        session["device_id"] = payload["device_id"]
    _save_session(session)
    _set_runtime(offline=False, last_error=None, last_refresh_at=time.time())
    return current_state()


def logout():
    """Revokes this device server-side (best-effort) and wipes the local
    session. 401 means it was already revoked - treated as success."""
    session = _load_session()
    if session:
        try:
            _request("POST", "/api/v1/devices/self/revoke", session=session, retries=False)
        except (ApiError, NetworkError):
            pass
    _wipe_session()
    cancel_device_login()
    _set_runtime(offline=False, last_error=None, last_refresh_at=0.0)
    return current_state()


# ------------------------------------------------------------------
# Reports (sync feature)
# ------------------------------------------------------------------

def _clamp_int(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    value = int(value)
    return max(0, min(value, REPORT_MAX_INT))


def build_report(summary):
    """Whitelists a report body per the contract: aggregate integers and
    category keys only. Anything else in `summary` (paths, names, free text)
    is dropped, never forwarded."""
    summary = summary if isinstance(summary, dict) else {}
    kind = summary.get("kind") if summary.get("kind") in REPORT_KINDS else "scan"
    categories = []
    for cat in summary.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        key = cat.get("key")
        if not isinstance(key, str) or not REPORT_CATEGORY_KEY_RE.match(key):
            continue
        categories.append({"key": key, "bytes": _clamp_int(cat.get("bytes")), "count": _clamp_int(cat.get("count"))})
        if len(categories) >= REPORT_MAX_CATEGORIES:
            break
    return {
        "kind": kind,
        "total_bytes": _clamp_int(summary.get("total_bytes")),
        "file_count": _clamp_int(summary.get("file_count")),
        "reclaimable_bytes": _clamp_int(summary.get("reclaimable_bytes")),
        "freed_bytes": _clamp_int(summary.get("freed_bytes")),
        "duration_ms": _clamp_int(summary.get("duration_ms")),
        "app_version": APP_VERSION,
        "categories": categories,
    }


def _send_report(body):
    session = _load_session()
    if not session:
        return
    try:
        _request("POST", "/api/v1/reports", body, session=session)
    except ApiError as e:
        if e.status == 401:
            _wipe_session()
            _set_runtime(last_error=e.code)
    except NetworkError:
        pass  # best-effort, no infinite retries (contract)


def push_report(summary):
    """Fire-and-forget POST /api/v1/reports in a daemon thread, only when the
    `sync` feature is active. Returns the started Thread, or None if skipped."""
    if _dev_bypass() or not has_feature("sync"):
        return None
    body = build_report(summary)
    if len(json.dumps(body)) > REPORT_MAX_BODY:
        return None
    t = threading.Thread(target=_send_report, args=(body,), daemon=True, name="ds-report")
    t.start()
    return t
