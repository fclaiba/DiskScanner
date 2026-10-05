"""
Machine-bound license activation/validation against Gumroad's License
Verification API (https://gumroad.com/api#licenses).

Design goals (see graphify-out plan for the full rationale):
- Works fully offline day-to-day. The network is only contacted on first
  activation and roughly once every REVALIDATE_INTERVAL_DAYS afterwards.
- The local cache is encrypted and bound to this machine's fingerprint, so
  copying license.dat to another PC does not transfer the activation.
- If the periodic re-check can't reach the network, a GRACE_PERIOD_DAYS
  window keeps the app usable rather than hard-locking a legit offline user.

Naming note: the public entry point is `refresh_capabilities()`, not
`is_licensed`/`check_license` - it's called from scanner_logic's disk-health
path rather than a standalone, easily-greppable gate. See app.py's
`disk_health()` and `_gate_destructive_routes()` for where the result is
actually used. This raises the bar against the laziest crack (a `strings`/
grep pass over the shipped .exe); it is not a defense against a determined
reverse engineer with a debugger - that would require executing the check
server-side, which is out of scope for this product.
"""

import os
import sys
import json
import time
import base64
import hashlib
import socket
import subprocess

import requests
from cryptography.fernet import Fernet, InvalidToken

APP_NAME = "DiskScannerTurbo"

# Set at build time (see build_release.py) or via env var for local testing.
GUMROAD_PRODUCT_PERMALINK = os.environ.get("DISKSCANNER_GUMROAD_PERMALINK", "CHANGE_ME")
GUMROAD_VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify"

# How long a successful validation is trusted before the app tries the
# network again (env-overridable for testing without waiting two weeks).
REVALIDATE_INTERVAL_DAYS = float(os.environ.get("DISKSCANNER_REVALIDATE_DAYS", 14))
# Extra offline tolerance once REVALIDATE_INTERVAL_DAYS is exceeded.
GRACE_PERIOD_DAYS = float(os.environ.get("DISKSCANNER_GRACE_DAYS", 5))

# Replaced by build_release.py with the sha256 of the shipped
# templates/index.html + static/app.js before PyArmor/Nuitka run. Stays None
# in a plain source checkout (or a PyInstaller dev build), so the check below
# is a no-op unless this is a hardened release build.
_INTEGRITY_TAG = None


def _appdata_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = os.path.join(base, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def _cache_path():
    return os.path.join(_appdata_dir(), "license.dat")


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
    """Stable across reboots; only changes on a real hardware/OS reinstall."""
    parts = [socket.gethostname()]
    if sys.platform == "win32":
        parts.append(_wmic_value("diskdrive", "serialnumber"))
        parts.append(_wmic_value("cpu", "processorid"))
    raw = "|".join(p for p in parts if p)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _fernet_for(fingerprint):
    key = base64.urlsafe_b64encode(hashlib.sha256(fingerprint.encode("utf-8")).digest())
    return Fernet(key)


def _load_cache():
    path = _cache_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            blob = f.read()
        return json.loads(_fernet_for(get_machine_fingerprint()).decrypt(blob).decode("utf-8"))
    except (InvalidToken, ValueError, OSError):
        return None


def _save_cache(data):
    blob = _fernet_for(get_machine_fingerprint()).encrypt(json.dumps(data).encode("utf-8"))
    with open(_cache_path(), "wb") as f:
        f.write(blob)


def _gumroad_verify(license_key):
    resp = requests.post(
        GUMROAD_VERIFY_URL,
        data={
            "product_permalink": GUMROAD_PRODUCT_PERMALINK,
            "license_key": license_key,
            "increment_uses_count": "false",
        },
        timeout=10,
    )
    body = resp.json()
    if not body.get("success"):
        return False
    purchase = body.get("purchase", {}) or {}
    if purchase.get("refunded") or purchase.get("chargebacked"):
        return False
    return True


def activate(license_key, email):
    """Call once, on first run / re-activation. Returns (ok, message)."""
    license_key = (license_key or "").strip()
    if not license_key:
        return False, "License key required."
    try:
        if not _gumroad_verify(license_key):
            return False, "License key is invalid, disabled, or refunded."
    except requests.RequestException:
        return False, "Could not reach the license server. Check your internet connection."

    now = time.time()
    _save_cache({
        "license_key": license_key,
        "email": (email or "").strip(),
        "fingerprint": get_machine_fingerprint(),
        "activated_at": now,
        "last_validated_at": now,
    })
    return True, "Activated."


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


def _integrity_ok():
    """Best-effort tamper check for hardened release builds: re-hash the
    bundled UI resources and compare against the hash baked in at build time.
    A no-op (returns True) for source checkouts / dev builds where
    _INTEGRITY_TAG was never set. On mismatch, callers should degrade
    gracefully rather than crash immediately - an instant hard failure is the
    easiest thing for a patcher to correlate back to this exact check."""
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


def refresh_capabilities():
    """The real entitlement check. Returns (ok: bool, reason: str).

    Trusts the local cache for REVALIDATE_INTERVAL_DAYS without touching the
    network (this is what keeps a normal scan/cleanup session fully offline).
    Past that window it tries one online re-check; if that fails purely for
    network reasons, GRACE_PERIOD_DAYS of additional offline trust applies
    before the app is considered unlicensed again.

    DISKSCANNER_SKIP_LICENSE=1 short-circuits all of this, for local
    development before a real Gumroad product/permalink exists. Checked here
    (not just in main.py's startup prompt) because this function also runs
    on every periodic disk-health poll - a bypass set only at startup would
    get silently overwritten by the next poll's real check. Never set this
    env var in a shipped build.
    """
    if os.environ.get("DISKSCANNER_SKIP_LICENSE") == "1":
        return True, "dev_bypass"

    if not _integrity_ok():
        return False, "integrity_mismatch"

    data = _load_cache()
    if not data:
        return False, "not_activated"

    if data.get("fingerprint") != get_machine_fingerprint():
        return False, "fingerprint_mismatch"

    elapsed_days = (time.time() - data.get("last_validated_at", 0)) / 86400
    if elapsed_days < REVALIDATE_INTERVAL_DAYS:
        return True, "cached"

    try:
        if _gumroad_verify(data["license_key"]):
            data["last_validated_at"] = time.time()
            _save_cache(data)
            return True, "revalidated"
        return False, "revoked"
    except requests.RequestException:
        if elapsed_days < REVALIDATE_INTERVAL_DAYS + GRACE_PERIOD_DAYS:
            return True, "offline_grace"
        return False, "grace_expired"
