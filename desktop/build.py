"""
Fast PyInstaller onefile build -> dist/DiskScannerTurbo.exe.

    python build.py        # interactive (waits for ENTER at the end)
    python build.py --ci   # non-interactive, exits non-zero on failure (CI)
    python build.py --dev  # keep the dev-only env overrides enabled in the .exe

Sources are staged into build/pyi_src/ with the release config baked into
licensing.py (DISKSCANNER_API_URL / DISKSCANNER_ENTITLEMENT_PUBKEY from the
environment, dev overrides off - same logic as build_release.py), then built
with DiskScannerTurbo.spec so local and CI builds are identical. For the
hardened release (PyArmor + Nuitka) see build_release.py / BUILD.md.
"""

import importlib.util
import os
import shutil
import subprocess
import sys

from build_release import stage_sources

ROOT = os.path.dirname(os.path.abspath(__file__))
EXE_NAME = "DiskScannerTurbo"
SPEC_NAME = f"{EXE_NAME}.spec"
STAGE_DIR = os.path.join(ROOT, "build", "pyi_src")


def main():
    ci = "--ci" in sys.argv[1:]
    dev = "--dev" in sys.argv[1:]

    print("========================================")
    print("  DiskScanner Turbo - Compilador")
    print("========================================")
    print("\nVerificando requisitos...")

    if importlib.util.find_spec("PyInstaller") is None:
        if ci:
            print("ERROR: PyInstaller no está instalado (pip install -r requirements.txt).")
            return 1
        print("PyInstaller no está instalado. Instalándolo ahora...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    print("\nIniciando compilación del ejecutable...")
    print("Esto puede tardar unos minutos. Por favor espera...\n")

    stage_sources(STAGE_DIR, dev_overrides=dev, extra_files=[SPEC_NAME])
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
        "--distpath", os.path.join(ROOT, "dist"),
        "--workpath", os.path.join(ROOT, "build", "pyi_work"),
        SPEC_NAME,
    ]

    exit_code = 0
    try:
        subprocess.check_call(command, cwd=STAGE_DIR)
        print("\nCOMPILACIÓN EXITOSA")
        print(f"Ruta: dist/{EXE_NAME}.exe")
        shutil.rmtree(os.path.join(ROOT, "build", "pyi_work"), ignore_errors=True)
    except subprocess.CalledProcessError as e:
        print(f"\nError durante la compilación: {e}")
        exit_code = 1

    if not ci:
        print("\nPresiona ENTER para salir...")
        input()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
