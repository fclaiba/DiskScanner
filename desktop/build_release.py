"""
Hardened release build: PyArmor-obfuscate the source, then compile with
Nuitka into a single native .exe.

This is a separate, additive path from build.py (plain PyInstaller) - keep
build.py for fast day-to-day dev builds, use this one for tagged releases.
Nuitka produces a much harder target to decompile than PyInstaller's bundled
.pyc files, and PyArmor further obfuscates the source (names, strings, the
license-check logic) before Nuitka ever sees it.

Prerequisites (not installed by default - see BUILD.md):
    pip install nuitka pyarmor

No C compiler is required up front: Nuitka will download and cache its own
MinGW64 the first time you run this (add --assume-yes-for-downloads so it
doesn't block on an interactive prompt). That first run needs internet access
and takes several extra minutes; later runs reuse the cached compiler.

Run with the same Python interpreter used for the rest of the project (this
repo has more than one Python installed - pin explicitly, don't rely on
whichever `python`/`py` resolves on a given machine).

Release configuration baked into licensing.py (env vars read at build time):
    DISKSCANNER_API_URL             -> DEFAULT_API_URL (e.g. https://diskscanner.app)
    DISKSCANNER_ENTITLEMENT_PUBKEY  -> ENTITLEMENT_PUBLIC_KEYS, format
                                       "kid:base64raw" (comma-separate several
                                       during a key rotation: "k1:...,k2:...")
"""

import base64
import hashlib
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OBF_DIR = os.path.join(ROOT, "build", "obfuscated")
DIST_DIR = os.path.join(ROOT, "dist_nuitka")

SOURCE_FILES = ["app.py", "main.py", "scanner_logic.py", "licensing.py", "cleanup_engine.py"]
DATA_DIRS = ["templates", "static"]

EXPECTED_MIN_PYTHON = (3, 10)


def _check_tool(module_name, pip_name):
    try:
        __import__(module_name)
    except ImportError:
        print(f"ERROR: {pip_name} is not installed in this interpreter ({sys.executable}).")
        print(f"        Run: {sys.executable} -m pip install {pip_name}")
        sys.exit(1)


def _sanity_check():
    if sys.version_info[:2] < EXPECTED_MIN_PYTHON:
        print(f"ERROR: this build script expects Python >= {EXPECTED_MIN_PYTHON}, "
              f"got {sys.version_info[:2]} ({sys.executable}). "
              f"This machine has multiple Pythons installed - invoke this script "
              f"explicitly with the intended interpreter.")
        sys.exit(1)
    _check_tool("nuitka", "nuitka")
    _check_tool("pyarmor", "pyarmor")


def _compute_integrity_hash():
    h = hashlib.sha256()
    for rel in (os.path.join("templates", "index.html"), os.path.join("static", "app.js")):
        with open(os.path.join(ROOT, rel), "rb") as f:
            h.update(f.read())
    return h.hexdigest()


def _bake_release_config(contents, dev_overrides=False):
    """Replace DEFAULT_API_URL / ENTITLEMENT_PUBLIC_KEYS in licensing.py with
    the values from the build environment, if set. Fails loudly on a bad
    format rather than shipping an .exe that can never verify an entitlement."""
    api_url = os.environ.get("DISKSCANNER_API_URL", "").strip().rstrip("/")
    if api_url:
        if not api_url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            print(f"ERROR: DISKSCANNER_API_URL must be https:// (got {api_url!r}).")
            sys.exit(1)
        contents, n = re.subn(r'^DEFAULT_API_URL = .*$', f'DEFAULT_API_URL = {api_url!r}', contents, flags=re.M)
        assert n == 1, "DEFAULT_API_URL line not found in licensing.py"
        print(f"Baked DEFAULT_API_URL = {api_url}")

    raw_keys = os.environ.get("DISKSCANNER_ENTITLEMENT_PUBKEY", "").strip()
    if raw_keys:
        keys = {}
        for item in raw_keys.split(","):
            kid, sep, b64 = item.strip().partition(":")
            if not sep or not kid or not b64:
                print("ERROR: DISKSCANNER_ENTITLEMENT_PUBKEY must be 'kid:base64raw[,kid2:base64raw]'.")
                sys.exit(1)
            try:
                raw = base64.b64decode(b64.strip(), validate=True)
            except ValueError:
                raw = b""
            if len(raw) != 32:
                print(f"ERROR: public key for kid {kid!r} is not base64 of 32 raw Ed25519 bytes.")
                sys.exit(1)
            keys[kid.strip()] = b64.strip()
        contents, n = re.subn(r'^ENTITLEMENT_PUBLIC_KEYS = .*$', f'ENTITLEMENT_PUBLIC_KEYS = {keys!r}',
                              contents, flags=re.M)
        assert n == 1, "ENTITLEMENT_PUBLIC_KEYS line not found in licensing.py"
        print(f"Baked ENTITLEMENT_PUBLIC_KEYS for kid(s): {', '.join(keys)}")
    elif '"<PLACEHOLDER>"' in contents:
        print("WARNING: DISKSCANNER_ENTITLEMENT_PUBKEY not set - this build can never unlock Pro.")

    if not dev_overrides:
        contents, n = re.subn(r'^_DEV_OVERRIDES = True$', '_DEV_OVERRIDES = False', contents, flags=re.M)
        assert n == 1, "_DEV_OVERRIDES line not found in licensing.py"
    return contents


def stage_sources(dest_dir, integrity=False, dev_overrides=False, extra_files=()):
    """Copy the app sources + UI assets into dest_dir and bake the release
    config into the staged licensing.py (the working tree is never modified).
    Shared with build.py so the PyInstaller and Nuitka builds bake the same."""
    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)
    os.makedirs(dest_dir)
    for f in list(SOURCE_FILES) + list(extra_files):
        shutil.copy2(os.path.join(ROOT, f), os.path.join(dest_dir, f))
    for d in DATA_DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(dest_dir, d))

    licensing_path = os.path.join(dest_dir, "licensing.py")
    with open(licensing_path, "r", encoding="utf-8") as f:
        contents = f.read()
    if integrity:
        # Embed the pre-obfuscation integrity hash so the runtime check in
        # licensing.py has something to compare against (see licensing.py).
        integrity_hash = _compute_integrity_hash()
        contents = contents.replace("_INTEGRITY_TAG = None", f'_INTEGRITY_TAG = "{integrity_hash}"')
        print(f"Embedded integrity hash: {integrity_hash}")
    contents = _bake_release_config(contents, dev_overrides=dev_overrides)
    with open(licensing_path, "w", encoding="utf-8") as f:
        f.write(contents)


def _stage_obfuscated_source():
    """Stage sources into build/obfuscated/ (integrity hash + release config
    baked into licensing.py), then run PyArmor over the .py files in place."""
    stage_sources(OBF_DIR, integrity=True)

    # PyArmor 8.x CLI. If you have PyArmor 7.x installed, replace this with:
    #   pyarmor obfuscate --output <OBF_DIR> <files>
    cmd = ["pyarmor", "gen", "--output", OBF_DIR] + SOURCE_FILES
    print("Running:", " ".join(cmd), f"(cwd={OBF_DIR})")
    subprocess.check_call(cmd, cwd=OBF_DIR)


def _run_nuitka():
    main_entry = os.path.join(OBF_DIR, "main.py")
    cmd = [
        sys.executable, "-m", "nuitka",
        "--onefile",
        "--windows-disable-console",
        f"--output-dir={DIST_DIR}",
        f"--include-data-dir={os.path.join(OBF_DIR, 'templates')}=templates",
        f"--include-data-dir={os.path.join(OBF_DIR, 'static')}=static",
        "--assume-yes-for-downloads",
        "--output-filename=DiskScannerTurbo.exe",
        main_entry,
    ]
    print("Running:", " ".join(cmd))
    print("NOTE: first run may download Nuitka's bundled MinGW64 compiler "
          "(no C compiler was detected on this machine) - this needs internet "
          "access and can take several extra minutes.")
    subprocess.check_call(cmd)


def main():
    _sanity_check()
    _stage_obfuscated_source()
    _run_nuitka()
    print(f"\nDone. Executable at: {os.path.join(DIST_DIR, 'DiskScannerTurbo.exe')}")
    print("Verify: launch it, run a scan, and (optionally) run")
    print('  strings DiskScannerTurbo.exe | findstr /i "entitlement refresh_capabilities"')
    print("to confirm no license logic shows up in cleartext.")


if __name__ == "__main__":
    main()
