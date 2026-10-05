import json
import os
import time

import pytest
import requests

import licensing
from conftest import API, FINGERPRINT, KID, Signer, b64url, make_payload

# ------------------------------------------------------------------
# Signature verification
# ------------------------------------------------------------------


def test_valid_signature_verifies(signer):
    payload, reason = licensing.verify_entitlement(signer.sign(make_payload()))
    assert reason is None
    assert payload["account_email"] == "user@example.com"


def test_tampered_payload_rejected(signer):
    signed = signer.sign(make_payload(pro=False))
    forged = make_payload(pro=True)
    signed["payload"] = b64url(json.dumps(forged).encode())
    assert licensing.verify_entitlement(signed) == (None, "invalid_signature")


def test_tampered_signature_rejected(signer):
    signed = signer.sign(make_payload())
    sig = bytearray(licensing._b64url_decode(signed["signature"]))
    sig[0] ^= 0x01
    signed["signature"] = b64url(bytes(sig))
    assert licensing.verify_entitlement(signed) == (None, "invalid_signature")


def test_garbage_fields_rejected(signer):
    assert licensing.verify_entitlement({"payload": "!!", "signature": "??", "kid": KID})[0] is None
    assert licensing.verify_entitlement(None) == (None, "missing_entitlement")


def test_unknown_kid_rejected(signer):
    assert licensing.verify_entitlement(signer.sign(make_payload(), kid="k999")) == (None, "unknown_kid")


def test_other_key_with_known_kid_rejected():
    impostor = Signer()  # different private key, same kid
    assert licensing.verify_entitlement(impostor.sign(make_payload())) == (None, "invalid_signature")


def test_placeholder_key_never_verifies(monkeypatch, signer):
    monkeypatch.delenv("DISKSCANNER_ENTITLEMENT_PUBKEY")
    assert licensing.verify_entitlement(signer.sign(make_payload(), kid="k1"))[0] is None


def test_fingerprint_mismatch_rejected(signer, link_session):
    link_session(make_payload(fingerprint="cd" * 32))
    assert licensing.refresh_capabilities() == (False, "fingerprint_mismatch")
    assert not licensing.has_feature("cleanup")


def test_expired_entitlement_locks_pro(link_session):
    link_session(make_payload(expires_in=-1))
    assert licensing.refresh_capabilities() == (False, "entitlement_expired")
    assert not licensing.has_feature("cleanup")
    state = licensing.current_state()
    assert state["linked"] and not state["pro"]


# ------------------------------------------------------------------
# Feature gating
# ------------------------------------------------------------------


def test_no_session_is_free_mode():
    assert licensing.refresh_capabilities() == (False, "not_linked")
    assert licensing.has_feature("scan")
    assert not licensing.has_feature("cleanup")
    state = licensing.current_state()
    assert state["linked"] is False and state["plan"] == "free" and state["features"] == ["scan"]


def test_pro_entitlement_unlocks_features(link_session):
    link_session(make_payload())
    assert licensing.refresh_capabilities() == (True, "entitled")
    assert licensing.has_feature("cleanup") and licensing.has_feature("sync")
    state = licensing.current_state()
    assert state["pro"] and state["plan"] == "pro" and state["email"] == "user@example.com"


def test_free_entitlement_keeps_free(link_session):
    link_session(make_payload(pro=False))
    assert licensing.refresh_capabilities() == (False, "not_pro")
    assert not licensing.has_feature("cleanup")
    assert licensing.current_state()["linked"] is True


def test_feature_must_be_listed(link_session):
    link_session(make_payload(features=["scan", "cleanup"]))
    assert licensing.has_feature("cleanup")
    assert not licensing.has_feature("sync")


def test_pro_flag_required_even_with_features(link_session):
    link_session(make_payload(pro=False, features=["scan", "cleanup", "sync"]))
    assert not licensing.has_feature("cleanup")


def test_dev_bypass(monkeypatch):
    monkeypatch.setenv("DISKSCANNER_SKIP_LICENSE", "1")
    assert licensing.refresh_capabilities() == (True, "dev_bypass")
    assert licensing.has_feature("cleanup")
    assert licensing.current_state()["dev_bypass"] is True


def test_integrity_mismatch_locks(monkeypatch, link_session):
    link_session(make_payload())
    monkeypatch.setattr(licensing, "_INTEGRITY_TAG", "0" * 64)
    assert licensing.refresh_capabilities() == (False, "integrity_mismatch")
    assert not licensing.has_feature("cleanup")


# ------------------------------------------------------------------
# Session file
# ------------------------------------------------------------------


def test_session_file_encrypted_and_not_portable(monkeypatch, link_session):
    link_session(make_payload())
    path = licensing._session_path()
    assert os.path.basename(path) == "session.dat"
    raw = open(path, "rb").read()
    assert b"dst_testtoken" not in raw and b"user@example.com" not in raw and b"payload" not in raw

    # Same file on another machine (different fingerprint) is unreadable.
    monkeypatch.setattr(licensing, "get_machine_fingerprint", lambda: "cd" * 32)
    assert licensing._load_session() is None
    assert not licensing.has_feature("cleanup")
    assert licensing.current_state()["linked"] is False


def test_session_never_stores_unsigned_pro_flag(link_session):
    link_session(make_payload())
    data = licensing._load_session()
    assert set(data) <= {"access_token", "device_id", "email", "entitlement", "linked_at"}
    assert "pro" not in data and set(data["entitlement"]) == {"payload", "signature", "kid"}


def test_corrupt_session_is_free(link_session):
    link_session(make_payload())
    with open(licensing._session_path(), "wb") as f:
        f.write(b"not a fernet token")
    assert licensing._load_session() is None
    assert not licensing.has_feature("cleanup")


# ------------------------------------------------------------------
# Device login flow
# ------------------------------------------------------------------

AUTHORIZE = {
    "device_code": "d" * 40,
    "user_code": "BCDF-GHJK",
    "verification_uri": f"{API}/activate",
    "verification_uri_complete": f"{API}/activate?code=BCDF-GHJK",
    "expires_in": 900,
    "interval": 5,
}


def _err(code, status=400):
    return {"status_code": status, "json": {"error": {"code": code, "message": code}}}


def _allow_next_poll():
    licensing._pending["last_poll_at"] = 0.0


def test_start_device_login_request(requests_mock):
    m = requests_mock.post(f"{API}/api/v1/devices/authorize", json=AUTHORIZE)
    result = licensing.start_device_login()
    assert result["ok"] and result["user_code"] == "BCDF-GHJK"
    assert "device_code" not in result  # stays in-process
    body = m.last_request.json()
    assert body["fingerprint"] == FINGERPRINT
    assert body["app_version"] == licensing.APP_VERSION == "2.0.0"
    assert body["platform"] in ("windows", "macos", "linux") and len(body["name"]) <= 100
    assert m.last_request.headers["User-Agent"].startswith("DiskScannerTurbo/2.0.0 (")
    assert m.last_request.timeout == 10


def test_foreign_verification_uri_is_replaced(requests_mock):
    requests_mock.post(f"{API}/api/v1/devices/authorize",
                       json=dict(AUTHORIZE, verification_uri_complete="file:///C:/evil.exe"))
    result = licensing.start_device_login()
    assert result["verification_uri_complete"] == f"{API}/activate?code=BCDF-GHJK"


def test_device_login_full_flow(requests_mock, signer):
    requests_mock.post(f"{API}/api/v1/devices/authorize", json=AUTHORIZE)
    token = requests_mock.post(f"{API}/api/v1/devices/token", [
        _err("authorization_pending"),
        _err("slow_down"),
        {"status_code": 200, "json": {
            "access_token": "dst_abc", "token_type": "Bearer", "device_id": "dev-1",
            "account": {"email": "user@example.com"}, "entitlement": signer.sign(make_payload()),
        }},
    ])
    licensing.start_device_login()

    assert licensing.poll_device_login() == {"status": "pending", "interval": 5}
    assert token.last_request.json() == {"device_code": "d" * 40}

    # Polling again before the interval elapsed doesn't hit the network.
    assert licensing.poll_device_login()["status"] == "pending"
    assert token.call_count == 1

    _allow_next_poll()
    assert licensing.poll_device_login() == {"status": "slow_down", "interval": 10}

    _allow_next_poll()
    result = licensing.poll_device_login()
    assert result["status"] == "linked"
    assert result["state"]["pro"] is True
    assert licensing.has_feature("cleanup")
    assert licensing._load_session()["access_token"] == "dst_abc"
    assert licensing._pending is None


@pytest.mark.parametrize("code,status", [("access_denied", "denied"), ("expired_token", "expired")])
def test_device_login_terminal_errors(requests_mock, code, status):
    requests_mock.post(f"{API}/api/v1/devices/authorize", json=AUTHORIZE)
    requests_mock.post(f"{API}/api/v1/devices/token", **_err(code))
    licensing.start_device_login()
    assert licensing.poll_device_login()["status"] == status
    assert licensing._pending is None
    assert licensing._load_session() is None


def test_device_login_locally_expired(requests_mock):
    requests_mock.post(f"{API}/api/v1/devices/authorize", json=AUTHORIZE)
    token = requests_mock.post(f"{API}/api/v1/devices/token", json={})
    licensing.start_device_login()
    licensing._pending["expires_at"] = time.time() - 1
    assert licensing.poll_device_login()["status"] == "expired"
    assert token.call_count == 0


def test_start_device_login_network_error(requests_mock):
    requests_mock.post(f"{API}/api/v1/devices/authorize", exc=requests.ConnectionError)
    result = licensing.start_device_login()
    assert result == {"ok": False, "error": "network_error", "message": result["message"]}
    assert licensing.current_state()["offline"] is True


def test_start_device_login_rate_limited(requests_mock):
    requests_mock.post(f"{API}/api/v1/devices/authorize", **_err("rate_limited", 429))
    assert licensing.start_device_login()["error"] == "rate_limited"


# ------------------------------------------------------------------
# Entitlement refresh
# ------------------------------------------------------------------


def test_refresh_stores_new_entitlement(requests_mock, signer, link_session):
    link_session(make_payload(pro=False))
    m = requests_mock.get(f"{API}/api/v1/entitlement", json=signer.sign(make_payload()))
    state = licensing.refresh_entitlement(force=True)
    assert state["pro"] is True
    headers = m.last_request.headers
    assert headers["Authorization"] == "Bearer dst_testtoken"
    assert headers["X-Device-Fingerprint"] == FINGERPRINT
    assert headers["X-App-Version"] == "2.0.0"


def test_refresh_is_rate_limited_unless_forced(requests_mock, signer, link_session):
    link_session(make_payload())
    m = requests_mock.get(f"{API}/api/v1/entitlement", json=signer.sign(make_payload()))
    licensing.refresh_entitlement(force=True)
    licensing.refresh_entitlement()
    assert m.call_count == 1
    licensing.refresh_entitlement(force=True)
    assert m.call_count == 2


def test_refresh_401_wipes_session(requests_mock, link_session):
    link_session(make_payload())
    requests_mock.get(f"{API}/api/v1/entitlement", **_err("invalid_token", 401))
    state = licensing.refresh_entitlement(force=True)
    assert state["linked"] is False and state["pro"] is False
    assert not os.path.exists(licensing._session_path())
    assert not licensing.has_feature("cleanup")


def test_refresh_rejects_bad_signature_keeps_cached(requests_mock, link_session):
    link_session(make_payload())
    requests_mock.get(f"{API}/api/v1/entitlement", json=Signer().sign(make_payload(pro=False)))
    state = licensing.refresh_entitlement(force=True)
    assert state["pro"] is True and state["last_error"] == "invalid_signature"


def test_refresh_retries_5xx_then_succeeds(requests_mock, signer, link_session):
    link_session(make_payload(pro=False))
    m = requests_mock.get(f"{API}/api/v1/entitlement", [
        {"status_code": 503, "json": {"error": {"code": "unavailable", "message": ""}}},
        {"status_code": 200, "json": signer.sign(make_payload())},
    ])
    assert licensing.refresh_entitlement(force=True)["pro"] is True
    assert m.call_count == 2


def test_refresh_does_not_retry_4xx(requests_mock, link_session):
    link_session(make_payload())
    m = requests_mock.get(f"{API}/api/v1/entitlement", **_err("rate_limited", 429))
    state = licensing.refresh_entitlement(force=True)
    assert m.call_count == 1 and state["pro"] is True and state["last_error"] == "rate_limited"


def test_offline_grace(requests_mock, monkeypatch, link_session):
    """Network down: the cached signed entitlement keeps Pro until its own
    expires_at, then the app falls back to free."""
    link_session(make_payload(expires_in=3 * 86400))
    m = requests_mock.get(f"{API}/api/v1/entitlement", exc=requests.ConnectionError)
    sleeps = []
    monkeypatch.setattr(licensing, "_sleep", sleeps.append)

    state = licensing.refresh_entitlement(force=True)
    assert m.call_count == 4 and sleeps == [1, 2, 4]  # contract backoff
    assert state["offline"] is True and state["pro"] is True
    assert licensing.refresh_capabilities() == (True, "offline_grace")

    real_time = time.time
    monkeypatch.setattr(licensing.time, "time", lambda: real_time() + 4 * 86400)
    assert licensing.refresh_capabilities() == (False, "entitlement_expired")
    assert not licensing.has_feature("cleanup")


def test_logout_revokes_and_wipes(requests_mock, link_session):
    link_session(make_payload())
    m = requests_mock.post(f"{API}/api/v1/devices/self/revoke", status_code=204)
    state = licensing.logout()
    assert m.call_count == 1 and m.last_request.headers["Authorization"] == "Bearer dst_testtoken"
    assert state["linked"] is False and not os.path.exists(licensing._session_path())


def test_logout_401_is_success(requests_mock, link_session):
    link_session(make_payload())
    requests_mock.post(f"{API}/api/v1/devices/self/revoke", **_err("invalid_token", 401))
    assert licensing.logout()["linked"] is False


def test_logout_offline_still_wipes(requests_mock, link_session):
    link_session(make_payload())
    requests_mock.post(f"{API}/api/v1/devices/self/revoke", exc=requests.ConnectionError)
    assert licensing.logout()["linked"] is False


# ------------------------------------------------------------------
# Reports
# ------------------------------------------------------------------


def _assert_no_paths(text):
    for needle in ("/", "\\", "C:", "secret", ".txt", "home"):
        assert needle not in text, needle


def test_build_report_whitelists_fields():
    body = licensing.build_report({
        "kind": "cleanup",
        "freed_bytes": 123,
        "file_count": -5,
        "total_bytes": 2 ** 60,
        "path": "C:\\Users\\bob\\secret.txt",
        "target_dir": "/home/bob",
        "categories": [
            {"key": "zombies", "bytes": 10, "count": 1, "path": "/home/bob/secret.txt"},
            {"key": "C:\\Users\\bob", "bytes": 1, "count": 1},
            {"key": "/home/bob/secret.txt", "bytes": 1, "count": 1},
            {"key": "Browser Cache", "bytes": 1, "count": 1},
            "not-a-dict",
        ] + [{"key": f"k{i}", "bytes": 1, "count": 1} for i in range(60)],
    })
    assert set(body) == {"kind", "total_bytes", "file_count", "reclaimable_bytes", "freed_bytes",
                         "duration_ms", "app_version", "categories"}
    assert body["file_count"] == 0 and body["total_bytes"] == 2 ** 53 - 1
    assert body["categories"][0] == {"key": "zombies", "bytes": 10, "count": 1}
    assert len(body["categories"]) == 50
    assert all(licensing.REPORT_CATEGORY_KEY_RE.match(c["key"]) for c in body["categories"])
    _assert_no_paths(json.dumps(body))


def test_push_report_requires_sync(requests_mock, link_session):
    link_session(make_payload(features=["scan", "cleanup"]))
    m = requests_mock.post(f"{API}/api/v1/reports", status_code=201, json={"id": "x"})
    assert licensing.push_report({"kind": "scan", "total_bytes": 1}) is None
    assert m.call_count == 0


def test_push_report_sends_in_background(requests_mock, link_session):
    link_session(make_payload())
    m = requests_mock.post(f"{API}/api/v1/reports", status_code=201, json={"id": "x"})
    t = licensing.push_report({"kind": "scan", "total_bytes": 5, "file_count": 2,
                               "categories": [{"key": "duplicates", "bytes": 5, "count": 1}],
                               "target_dir": "/home/bob/secret"})
    assert t is not None and t.daemon
    t.join(5)
    assert m.call_count == 1
    sent = m.last_request.json()
    assert sent["kind"] == "scan" and sent["app_version"] == "2.0.0"
    assert m.last_request.headers["Authorization"] == "Bearer dst_testtoken"
    _assert_no_paths(m.last_request.text)


def test_release_build_ignores_dev_overrides(monkeypatch, link_session):
    """Release builds bake _DEV_OVERRIDES = False: the env public key and the
    SKIP_LICENSE bypass must no longer work (otherwise trivially crackable)."""
    link_session(make_payload())
    monkeypatch.setattr(licensing, "_DEV_OVERRIDES", False)
    monkeypatch.setenv("DISKSCANNER_SKIP_LICENSE", "1")
    assert not licensing.has_feature("cleanup")
    assert licensing.refresh_capabilities() == (False, "unknown_kid")
