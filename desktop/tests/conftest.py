"""Shared fixtures: an isolated APPDATA, a fixed machine fingerprint, a
throwaway Ed25519 keypair wired in via DISKSCANNER_ENTITLEMENT_PUBKEY, and a
helper that signs entitlements exactly like the web server does."""

import base64
import json
import time

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

import licensing

API = "https://api.test"
FINGERPRINT = "ab" * 32
KID = "ktest"


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class Signer:
    def __init__(self, kid=KID):
        self.kid = kid
        self.private_key = Ed25519PrivateKey.generate()
        raw = self.private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        self.public_b64 = base64.b64encode(raw).decode("ascii")

    def sign(self, payload, kid=None):
        """Same as the server: payload = b64url(JSON bytes), signature =
        b64url(Ed25519 signature over those exact bytes)."""
        payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return {
            "payload": b64url(payload_bytes),
            "signature": b64url(self.private_key.sign(payload_bytes)),
            "kid": kid or self.kid,
        }


def make_payload(pro=True, features=None, fingerprint=FINGERPRINT, expires_in=7 * 86400, **extra):
    now = int(time.time())
    payload = {
        "v": 1,
        "device_id": "11111111-2222-3333-4444-555555555555",
        "fingerprint": fingerprint,
        "account_email": "user@example.com",
        "plan": "pro" if pro else "free",
        "status": "active" if pro else "none",
        "pro": pro,
        "features": features if features is not None else (["scan", "cleanup", "sync"] if pro else ["scan"]),
        "current_period_end": "2026-11-05T00:00:00Z" if pro else None,
        "issued_at": now,
        "expires_at": now + expires_in,
    }
    payload.update(extra)
    return payload


@pytest.fixture
def signer():
    return Signer()


@pytest.fixture(autouse=True)
def isolated_licensing(tmp_path, monkeypatch, signer):
    monkeypatch.setenv("APPDATA", str(tmp_path / "appdata"))
    monkeypatch.setenv("DISKSCANNER_API_URL", API)
    monkeypatch.setenv("DISKSCANNER_ENTITLEMENT_PUBKEY", f"{KID}:{signer.public_b64}")
    monkeypatch.delenv("DISKSCANNER_SKIP_LICENSE", raising=False)
    monkeypatch.setattr(licensing, "get_machine_fingerprint", lambda: FINGERPRINT)
    monkeypatch.setattr(licensing, "_sleep", lambda s: None)
    monkeypatch.setattr(licensing, "_INTEGRITY_TAG", None)
    monkeypatch.setattr(licensing, "_pending", None)
    monkeypatch.setattr(licensing, "_runtime", {"offline": False, "last_error": None, "last_refresh_at": 0.0})
    yield


@pytest.fixture
def link_session(signer):
    """Writes a linked session with the given entitlement payload."""
    def _link(payload=None, signed=None):
        licensing._save_session({
            "access_token": "dst_testtoken",
            "device_id": "11111111-2222-3333-4444-555555555555",
            "email": "user@example.com",
            "entitlement": signed or signer.sign(payload or make_payload()),
        })
    return _link
