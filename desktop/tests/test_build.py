import os

import pytest

import build_release

KEY = "A" * 43 + "="  # base64 of 32 zero-ish bytes


def _staged_licensing(tmp_path):
    build_release.stage_sources(str(tmp_path / "stage"))
    with open(tmp_path / "stage" / "licensing.py", encoding="utf-8") as f:
        return f.read()


def test_stage_bakes_release_config(tmp_path, monkeypatch):
    monkeypatch.setenv("DISKSCANNER_API_URL", "https://staging.example.com/")
    monkeypatch.setenv("DISKSCANNER_ENTITLEMENT_PUBKEY", f"k1:{KEY},k2:{KEY}")
    src = _staged_licensing(tmp_path)
    assert "DEFAULT_API_URL = 'https://staging.example.com'" in src
    assert f"ENTITLEMENT_PUBLIC_KEYS = {{'k1': '{KEY}', 'k2': '{KEY}'}}" in src
    assert "_DEV_OVERRIDES = False" in src
    assert os.path.exists(tmp_path / "stage" / "templates" / "index.html")
    # The working tree itself is never modified.
    assert "_DEV_OVERRIDES = True" in open(os.path.join(build_release.ROOT, "licensing.py"), encoding="utf-8").read()


@pytest.mark.parametrize("value", ["nokid", "k1:not-base64!!", "k1:QkJC"])
def test_stage_rejects_bad_public_key(tmp_path, monkeypatch, value):
    monkeypatch.delenv("DISKSCANNER_API_URL", raising=False)
    monkeypatch.setenv("DISKSCANNER_ENTITLEMENT_PUBKEY", value)
    with pytest.raises(SystemExit):
        _staged_licensing(tmp_path)


def test_stage_rejects_plain_http_api(tmp_path, monkeypatch):
    monkeypatch.setenv("DISKSCANNER_API_URL", "http://diskscanner.app")
    with pytest.raises(SystemExit):
        _staged_licensing(tmp_path)
