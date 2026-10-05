import json
import os
import sys

import pytest

import app as app_module
import licensing
from conftest import API, make_payload

PORT = 5123
TOKEN = "test-token-123"
BASE = f"http://127.0.0.1:{PORT}"
AUTH = {"X-DS-Token": TOKEN}


@pytest.fixture
def client():
    app_module.configure_security(PORT, TOKEN)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


@pytest.fixture
def pro(monkeypatch):
    monkeypatch.setattr(licensing, "refresh_capabilities", lambda: (True, "entitled"))


@pytest.fixture
def opened(monkeypatch):
    urls = []
    monkeypatch.setattr(app_module, "_open_in_browser", lambda url: urls.append(url) or True)
    return urls


def post(client, path, body=None, base=BASE, headers=AUTH):
    return client.post(path, base_url=base, headers=headers, data=json.dumps(body) if body is not None else None,
                       content_type="application/json")


# ------------------------------------------------------------------
# Token / Host enforcement
# ------------------------------------------------------------------


def test_api_requires_token(client):
    resp = client.get("/api/account/status", base_url=BASE)
    assert resp.status_code == 403
    assert resp.get_json()["error"]["code"] == "forbidden"


def test_api_wrong_token(client):
    resp = client.get("/api/account/status", base_url=BASE, headers={"X-DS-Token": "nope"})
    assert resp.status_code == 403


def test_api_with_header_token(client):
    resp = client.get("/api/account/status", base_url=BASE, headers=AUTH)
    assert resp.status_code == 200
    assert resp.get_json()["linked"] is False


def test_api_with_query_token_for_eventsource(client):
    assert client.get(f"/api/account/status?t={TOKEN}", base_url=BASE).status_code == 200


def test_localhost_host_allowed(client):
    assert client.get("/api/account/status", base_url=f"http://localhost:{PORT}", headers=AUTH).status_code == 200


@pytest.mark.parametrize("base", ["http://evil.example:5123", f"http://127.0.0.1:{PORT + 1}", "http://127.0.0.1"])
def test_bad_host_rejected(client, base):
    resp = client.get("/api/account/status", base_url=base, headers=AUTH)
    assert resp.status_code == 403
    assert resp.get_json()["error"]["code"] == "forbidden_host"
    # The page carrying the token is protected too (anti DNS-rebinding).
    assert client.get("/", base_url=base).status_code == 403


def test_index_injects_token(client):
    resp = client.get("/", base_url=BASE)
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert f'<meta name="ds-token" content="{TOKEN}">' in html
    assert "<title>DiskScanner Turbo</title>" in html
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Cache-Control"] == "no-store"


# ------------------------------------------------------------------
# Pro gate
# ------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/api/cleanup/temp", "/api/delete", "/api/cleanup/execute", "/api/sys/debloat"])
def test_gate_returns_pro_required(client, path):
    resp = post(client, path, {})
    assert resp.status_code == 403
    err = resp.get_json()["error"]
    assert err["code"] == "pro_required" and err["message"]


def test_gate_on_get_stream(client):
    resp = client.get(f"/api/cleanup/npm_stream?t={TOKEN}&target_dir=/tmp", base_url=BASE)
    assert resp.status_code == 403
    assert resp.get_json()["error"]["code"] == "pro_required"


def test_gate_open_with_signed_pro_entitlement(client, link_session):
    link_session(make_payload())
    resp = post(client, "/api/delete", {"filepath": "/definitely/not/here.txt"})
    assert resp.status_code == 400  # past the gate, failed validation


def test_gate_closed_with_free_entitlement(client, link_session):
    link_session(make_payload(pro=False))
    assert post(client, "/api/delete", {"filepath": "/x"}).get_json()["error"]["code"] == "pro_required"


def test_free_routes_not_gated(client):
    assert client.get(f"/api/analyze_stream?t={TOKEN}&target_dir=/nonexistent", base_url=BASE).status_code == 200


# ------------------------------------------------------------------
# Input validation / forbidden paths
# ------------------------------------------------------------------

FORBIDDEN = "C:\\Windows\\System32\\drivers\\etc\\hosts" if sys.platform == "win32" else "/etc/hostname"
FORBIDDEN_DIR = "C:\\Windows\\Temp" if sys.platform == "win32" else "/usr/share"


def test_delete_refuses_forbidden(client, pro):
    resp = post(client, "/api/delete", {"filepath": FORBIDDEN})
    assert resp.status_code == 403


def test_move_refuses_forbidden_source_and_destination(client, pro, tmp_path):
    src = tmp_path / "a.bin"
    src.write_bytes(b"x")
    assert post(client, "/api/move", {"filepath": FORBIDDEN, "destination": str(tmp_path / "b")}).status_code == 403
    resp = post(client, "/api/move", {"filepath": str(src), "destination": os.path.join(FORBIDDEN_DIR, "a.bin")})
    assert resp.status_code == 403
    assert src.exists()


def test_move_works_for_normal_paths(client, pro, tmp_path):
    src = tmp_path / "a.bin"
    src.write_bytes(b"x")
    dest = tmp_path / "sub"
    dest.mkdir()
    resp = post(client, "/api/move", {"filepath": str(src), "destination": str(dest / "a.bin")})
    assert resp.status_code == 200 and (dest / "a.bin").exists()


def test_compress_refuses_forbidden(client, pro):
    assert post(client, "/api/action/compress_zombie", {"filepath": FORBIDDEN}).status_code == 403


def test_empty_folders_refuses_forbidden_root(client, pro):
    assert post(client, "/api/cleanup/empty_folders", {"target_dir": FORBIDDEN_DIR}).status_code == 403


@pytest.mark.parametrize("body", ["[1, 2]", "not json", '{"filepath": 42}', '{"filepath": ["a"]}'])
def test_bad_json_is_400_not_500(client, pro, body):
    resp = client.post("/api/delete", base_url=BASE, headers=AUTH, data=body, content_type="application/json")
    assert resp.status_code == 400


def test_execute_rejects_non_list_selection(client, pro):
    assert post(client, "/api/cleanup/execute", {"selection": "rm -rf"}).status_code == 400
    assert post(client, "/api/cleanup/execute", {"selection": ["a"]}).status_code == 400


def test_export_only_writes_txt(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    resp = post(client, "/api/export/save", {"content": "hi", "filename": "../evil.bat"})
    assert resp.status_code == 200
    assert resp.get_json()["path"].endswith("evil.bat.txt")
    assert post(client, "/api/export/save", {"content": 5}).status_code == 400


# ------------------------------------------------------------------
# Account routes
# ------------------------------------------------------------------


def test_account_open_whitelist(client, opened):
    assert post(client, "/api/account/open", {"page": "pricing"}).status_code == 200
    assert post(client, "/api/account/open", {"page": "billing"}).status_code == 200
    assert opened == [f"{API}/pricing", f"{API}/dashboard/billing"]
    for page in ("https://evil.example", "../admin", None, 3):
        resp = post(client, "/api/account/open", {"page": page})
        assert resp.status_code == 400 and resp.get_json()["error"]["code"] == "invalid_request"
    assert len(opened) == 2


def test_account_login_opens_browser(client, opened, requests_mock):
    requests_mock.post(f"{API}/api/v1/devices/authorize", json={
        "device_code": "d" * 40, "user_code": "BCDF-GHJK",
        "verification_uri": f"{API}/activate", "verification_uri_complete": f"{API}/activate?code=BCDF-GHJK",
        "expires_in": 900, "interval": 5,
    })
    resp = post(client, "/api/account/login", {})
    data = resp.get_json()
    assert resp.status_code == 200 and data["user_code"] == "BCDF-GHJK"
    assert "device_code" not in data
    assert opened == [f"{API}/activate?code=BCDF-GHJK"]


def test_account_login_network_error(client, opened, requests_mock):
    import requests
    requests_mock.post(f"{API}/api/v1/devices/authorize", exc=requests.ConnectionError)
    resp = post(client, "/api/account/login", {})
    assert resp.status_code == 503 and resp.get_json()["error"]["code"] == "network_error"
    assert opened == []


def test_account_poll_links_and_opens_gate(client, monkeypatch, link_session):
    def fake_poll(device_code=None):
        link_session(make_payload())
        return {"status": "linked", "interval": 0, "state": licensing.current_state()}
    monkeypatch.setattr(licensing, "poll_device_login", fake_poll)
    app_module.set_extended_scan_enabled(False)
    assert post(client, "/api/account/login/poll", {}).get_json()["status"] == "linked"
    assert app_module._capabilities["extended_scan_enabled"] is True


def test_account_logout(client, link_session, requests_mock):
    link_session(make_payload())
    requests_mock.post(f"{API}/api/v1/devices/self/revoke", status_code=204)
    data = post(client, "/api/account/logout", {}).get_json()
    assert data["linked"] is False
    assert app_module._capabilities["extended_scan_enabled"] is False


# ------------------------------------------------------------------
# Sync reports: aggregates only, never paths/names
# ------------------------------------------------------------------


def _drain(resp):
    return [json.loads(line[6:]) for line in resp.get_data(as_text=True).split("\n\n") if line.startswith("data: ")]


@pytest.fixture
def captured_reports(monkeypatch):
    reports = []
    monkeypatch.setattr(licensing, "has_feature", lambda name: True)
    monkeypatch.setattr(licensing, "push_report", lambda summary: reports.append(summary))
    return reports


def _assert_report_clean(summary, *secrets):
    body = json.dumps(licensing.build_report(summary))
    for s in secrets:
        assert s not in body
    assert "/" not in body and "\\" not in body


def test_scan_report_has_no_paths(client, tmp_path, captured_reports):
    secret_dir = tmp_path / "TopSecretProject"
    secret_dir.mkdir()
    (secret_dir / "payroll_2026.xlsx").write_bytes(b"x" * 2048)
    (secret_dir / "copy_payroll.xlsx").write_bytes(b"x" * 2048)
    resp = client.get(f"/api/scan?t={TOKEN}&target_dir={secret_dir}&find_dups=true", base_url=BASE)
    events = _drain(resp)
    assert events[-1]["type"] == "result"
    assert len(captured_reports) == 1
    summary = captured_reports[0]
    assert summary["kind"] == "scan" and summary["file_count"] == 2 and summary["total_bytes"] == 4096
    _assert_report_clean(summary, "TopSecret", "payroll", str(tmp_path))


def test_cleanup_execute_report_has_no_paths(client, tmp_path, pro, captured_reports):
    victim = tmp_path / "old_holiday_video.mp4"
    victim.write_bytes(b"x" * 1000)
    selection = [{"path": str(victim), "delete_mode": "permanent", "category": "zombies"},
                 {"path": str(tmp_path / "missing"), "delete_mode": "permanent", "category": "/etc/passwd"}]
    events = _drain(post(client, "/api/cleanup/execute", {"selection": selection}))
    assert events[-1]["data"]["freed_bytes"] == 1000
    assert not victim.exists()
    summary = captured_reports[0]
    assert summary["kind"] == "cleanup" and summary["freed_bytes"] == 1000
    assert summary["categories"] == [{"key": "zombies", "bytes": 1000, "count": 1}]
    _assert_report_clean(summary, "holiday", str(tmp_path))


def test_no_report_without_sync(client, tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(licensing, "push_report", lambda s: calls.append(s))
    _drain(client.get(f"/api/scan?t={TOKEN}&target_dir={tmp_path}", base_url=BASE))
    assert calls == []


def test_main_imports_without_pywebview():
    import main
    assert main.WINDOW_TITLE == "DiskScanner Turbo"
    assert 1024 < main._pick_free_port() < 65536


@pytest.mark.skipif(sys.platform == "win32", reason="symlinks need admin on Windows")
def test_delete_refuses_symlink_into_forbidden(client, pro, tmp_path):
    link = tmp_path / "innocent"
    link.symlink_to("/etc")
    resp = post(client, "/api/delete", {"filepath": str(link / "hostname")})
    assert resp.status_code == 403


def test_relative_paths_rejected(client, pro):
    assert post(client, "/api/delete", {"filepath": "relative.txt"}).status_code == 400
    assert post(client, "/api/move", {"filepath": "a", "destination": "b"}).status_code == 400
