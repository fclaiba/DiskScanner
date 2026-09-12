# Build guide

This machine has two Pythons installed (`python` → 3.11, `py` default → 3.13).
**Use `python` (3.11) consistently** for every command below — don't mix
interpreters between install/build steps.

```powershell
python -m pip install -r requirements.txt
```

## Two build paths

### 1. `build.py` — fast, dev iteration

```powershell
python build.py
```

Plain PyInstaller onefile build (`dist/DiskScanner_Turbo_Ultimate.exe`). Use
this while developing — it's fast and good enough to sanity-check a change.
It offers **no protection** against decompilation; don't ship this as the
final release artifact.

### 2. `build_release.py` — hardened release build

```powershell
python -m pip install nuitka pyarmor
python build_release.py
```

Obfuscates the source with PyArmor, then compiles it with Nuitka into
`dist_nuitka\DiskScannerTurbo.exe`. This is the build to actually ship.

- **First run only:** no C compiler is installed on this machine. Nuitka will
  auto-download its own bundled MinGW64 (`--assume-yes-for-downloads` is
  already set in the script) — needs internet access, adds several minutes.
  Subsequent builds reuse the cached compiler under
  `%LOCALAPPDATA%\Nuitka\Nuitka\Cache`.
- If you'd rather use a "real" MSVC toolchain instead of Nuitka's MinGW64,
  install Visual Studio Build Tools ("Desktop development with C++") — Nuitka
  will detect and prefer it automatically. Not required.
- PyArmor 8.x uses `pyarmor gen`; if you have PyArmor 7.x installed instead,
  edit the `pyarmor` command in `build_release.py` to `pyarmor obfuscate`.
- Realistic expectation: this deters casual/opportunistic cracking (`strings
  .exe | grep -i licen` and similar). It does not stop a determined reverse
  engineer with a debugger — that would require running the license/critical
  logic server-side, which is out of scope for this product at this price
  point.

## Licensing (Gumroad)

1. Create the product on Gumroad and copy its **permalink**.
2. Set it before building/running:
   ```powershell
   $env:DISKSCANNER_GUMROAD_PERMALINK = "your-permalink"
   ```
   or bake it into `licensing.py`'s `GUMROAD_PRODUCT_PERMALINK` default before
   running `build_release.py` for a release (env var won't travel with the
   .exe unless you set it on the target machine too).
3. Gumroad's Licenses API only tells you "is this key valid" — the
   machine-fingerprint binding, offline cache, and grace period are all
   handled client-side in `licensing.py`. See that file's module docstring
   for the full flow.
4. For local testing without waiting 14 days for the revalidation window:
   ```powershell
   $env:DISKSCANNER_REVALIDATE_DAYS = "0.01"
   $env:DISKSCANNER_GRACE_DAYS = "0.01"
   ```
