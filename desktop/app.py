import hmac
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
import zipfile

from flask import Flask, Response, jsonify, render_template, request

import licensing
from cleanup_engine import _dir_size, run_cleanup_analysis_stream, run_cleanup_execute_stream
from scanner_logic import _is_forbidden_path, run_npm_cleanup_stream, run_scan_stream, run_venv_cleanup_stream

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

# Local-server hardening (docs/CONTRATO-API.md, "Seguridad local"). main.py
# calls configure_security() with the random port + per-launch token before
# starting the server. The defaults below are only for imports that never
# call it (tests, tooling) - still a random token, so /api/* stays locked.
app.config["DS_PORT"] = 5000
app.config["DS_TOKEN"] = secrets.token_urlsafe(32)


def configure_security(port, token):
    app.config["DS_PORT"] = int(port)
    app.config["DS_TOKEN"] = token


# In-memory capability flag, set by main.py at startup/every 6h and by the
# account routes after login/logout/refresh. The gate below re-checks the
# signed entitlement locally on every gated request anyway (cheap, offline),
# so an entitlement expiring mid-session is honored immediately.
_capabilities = {"extended_scan_enabled": False}


def set_extended_scan_enabled(enabled):
    _capabilities["extended_scan_enabled"] = bool(enabled)


def _sync_gate():
    ok, _reason = licensing.refresh_capabilities()
    set_extended_scan_enabled(ok)
    return ok


# Destructive/premium endpoints gated on the Pro "cleanup" feature.
_GATED_ENDPOINTS = {
    "delete_file", "move_file", "cleanup_temp", "cleanup_gradle",
    "cleanup_npm_stream", "cleanup_docker", "cleanup_xcode",
    "cleanup_venv_stream", "cleanup_devcaches", "backup_gamesaves",
    "cleanup_shaders", "organize_downloads", "cleanup_messaging",
    "cleanup_windows_update", "compress_zombie", "cleanup_browsers",
    "cleanup_empty_folders", "cleanup_onedrive", "sys_debloat",
    "smart_cleanup_execute",
}


def _api_error(code, message, status):
    """Single error format shared with the web API contract."""
    return jsonify({"error": {"code": code, "message": message}}), status


@app.before_request
def _guard_request():
    # (a) Anti DNS-rebinding: only our own loopback origin, on our own port.
    port = app.config["DS_PORT"]
    if (request.host or "").lower() not in (f"127.0.0.1:{port}", f"localhost:{port}"):
        return _api_error("forbidden_host", "Invalid Host header.", 403)

    # (b) Per-launch token on every API call (anti CSRF from pages open in the
    # user's browser). Header for fetch(), ?t= for EventSource streams.
    if request.path.startswith("/api/"):
        supplied = request.headers.get("X-DS-Token") or request.args.get("t") or ""
        if not hmac.compare_digest(supplied.encode("utf-8"), app.config["DS_TOKEN"].encode("utf-8")):
            return _api_error("forbidden", "Missing or invalid session token.", 403)

    # (c) Pro gate.
    if request.endpoint in _GATED_ENDPOINTS and not _sync_gate():
        return _api_error("pro_required", "This action requires DiskScanner Turbo Pro.", 403)


@app.after_request
def _security_headers(resp):
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    # Every asset is vendored under static/, so the page never needs another
    # origin - this also stops injected markup from loading or exfiltrating.
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    )
    if request.path == "/":
        resp.headers["Cache-Control"] = "no-store"
    return resp


def _json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _str_field(data, key):
    value = data.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _forbidden(path):
    """_is_forbidden_path on both the given and the symlink-resolved path, so
    a link inside an allowed folder can't be used to reach a protected one."""
    return _is_forbidden_path(path) or _is_forbidden_path(os.path.realpath(path))


def _abs_path_field(data, key):
    """Like _str_field but only accepts absolute paths (the UI only ever
    sends paths it got from a scan; a relative one would resolve against the
    server's cwd)."""
    value = _str_field(data, key)
    return value if value and os.path.isabs(value) else None


def _sse(events, on_result=None):
    """Serializes stream events; calls on_result(data) once on the final
    "result" event (used for best-effort sync reports)."""
    for event in events:
        if on_result and isinstance(event, dict) and event.get("type") == "result":
            try:
                on_result(event.get("data") or {})
            except Exception:
                pass
        yield f"data: {json.dumps(event)}\n\n"


# ---------------------------------------------------------------
# Sync reports (Pro "sync" feature): aggregate numbers + category keys
# only - never paths or names. licensing.build_report() whitelists again.
# ---------------------------------------------------------------

def _elapsed_ms(started):
    return int((time.time() - started) * 1000)


def _report_scan(result, started):
    if not licensing.has_feature("sync"):
        return
    zombies = result.get("zombies") or []
    dup_groups = (result.get("duplicates") or {}).get("groups") or []
    zombie_bytes = sum(z.get("size", 0) for z in zombies if isinstance(z, dict))
    dup_bytes = sum(g.get("size", 0) * max(0, len(g.get("paths") or []) - 1) for g in dup_groups if isinstance(g, dict))
    licensing.push_report({
        "kind": "scan",
        "total_bytes": (result.get("treemap") or {}).get("value", 0),
        "file_count": (result.get("summary") or {}).get("file_count", 0),
        "reclaimable_bytes": zombie_bytes + dup_bytes,
        "duration_ms": _elapsed_ms(started),
        "categories": [
            {"key": "zombies", "bytes": zombie_bytes, "count": len(zombies)},
            {"key": "duplicates", "bytes": dup_bytes, "count": len(dup_groups)},
        ],
    })


def _report_analysis(result, started):
    if not licensing.has_feature("sync"):
        return
    groups = [g for g in result.get("groups") or [] if isinstance(g, dict)]
    licensing.push_report({
        "kind": "scan",
        "file_count": sum(g.get("item_count", 0) for g in groups),
        "reclaimable_bytes": result.get("total_reclaimable_bytes", 0),
        "duration_ms": _elapsed_ms(started),
        "categories": [{"key": g.get("id"), "bytes": g.get("total_bytes", 0), "count": g.get("item_count", 0)}
                       for g in groups],
    })


def _report_cleanup(freed_bytes, count, category=None, started=None, categories=None):
    if not licensing.has_feature("sync"):
        return
    if categories is None:
        categories = [{"key": category, "bytes": freed_bytes, "count": count}] if category else []
    licensing.push_report({
        "kind": "cleanup",
        "freed_bytes": freed_bytes,
        "file_count": count,
        "duration_ms": _elapsed_ms(started) if started else 0,
        "categories": categories,
    })


@app.route('/')
def index():
    return render_template('index.html', ds_token=app.config["DS_TOKEN"])

@app.route('/api/scan')
def scan():
    target_dir = request.args.get('target_dir', os.getcwd())
    ignore_dirs_raw = request.args.get('ignore_dirs', '')
    find_dups_str = request.args.get('find_dups', 'true')

    ignore_dirs = [d.strip().lower() for d in ignore_dirs_raw.split(',') if d.strip()]
    find_dups = find_dups_str.lower() == 'true'

    if not os.path.exists(target_dir):
        def err():
            yield f"data: {json.dumps({'type': 'error', 'message': 'The directory does not exist'})}\n\n"
        return Response(err(), mimetype='text/event-stream')

    started = time.time()
    events = run_scan_stream(target_dir, ignore_dirs, find_dups)
    return Response(_sse(events, lambda data: _report_scan(data, started)), mimetype='text/event-stream')

@app.route('/api/delete', methods=['POST'])
def delete_file():
    filepath = _abs_path_field(_json_body(), 'filepath')

    # Forbidden check first, before touching the path at all.
    if filepath and _forbidden(filepath):
        return jsonify({"error": "Security: Deleting files in this location is not allowed"}), 403

    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "File does not exist or no path was provided"}), 400

    if os.path.isdir(filepath):
        return jsonify({"error": "Entire directories cannot be deleted for safety. Delete individual files."}), 400

    try:
        size = os.path.getsize(filepath)
        os.remove(filepath)
        _report_cleanup(size, 1)
        return jsonify({"success": True, "message": "File deleted successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/move', methods=['POST'])
def move_file():
    data = _json_body()
    filepath = _abs_path_field(data, 'filepath')
    destination = _abs_path_field(data, 'destination')

    if (filepath and _forbidden(filepath)) or (destination and _forbidden(destination)):
        return jsonify({"error": "Security: Moving files from/to this location is not allowed"}), 403

    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "The source file does not exist"}), 400

    if not destination or not os.path.isdir(os.path.dirname(destination)):
        return jsonify({"error": "The destination path is invalid"}), 400

    try:
        shutil.move(filepath, destination)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleanup/temp', methods=['POST'])
def cleanup_temp():
    started = time.time()
    temp_dir = tempfile.gettempdir()
    deleted = 0
    freed = 0
    errors = 0
    permission_denied = 0
    for root, _dirs, files in os.walk(temp_dir):
        for file in files:
            path = os.path.join(root, file)
            try:
                size = os.path.getsize(path)
                os.remove(path)
                deleted += 1
                freed += size
            except PermissionError:
                permission_denied += 1
            except OSError:
                errors += 1
    msg = f"Cleanup completed. {deleted} files deleted, {errors} ignored."
    if permission_denied:
        msg += f" {permission_denied} skipped (permission denied)."
    _report_cleanup(freed, deleted, "temp", started)
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/cleanup/gradle', methods=['POST'])
def cleanup_gradle():
    # Gradle cache is typically in %USERPROFILE%/.gradle/caches
    user_home = os.path.expanduser('~')
    gradle_cache = os.path.join(user_home, '.gradle', 'caches')

    if not os.path.exists(gradle_cache):
        return jsonify({"success": True, "message": "The Gradle cache folder does not exist or is already clean."})

    try:
        freed, count = _dir_size(gradle_cache)
        shutil.rmtree(gradle_cache)
        _report_cleanup(freed, count, "dev_caches")
        return jsonify(
            {"success": True, "message": "Gradle cache successfully deleted. It will be regenerated on the next build."}
        )
    except Exception as e:
        return jsonify({"error": f"Failed to delete cache: {str(e)}"}), 500

@app.route('/api/cleanup/npm_stream')
def cleanup_npm_stream():
    target_dir = request.args.get('target_dir', os.getcwd())
    if not os.path.exists(target_dir):
        def err():
            yield f"data: {json.dumps({'type': 'error', 'message': 'The base directory does not exist'})}\n\n"
        return Response(err(), mimetype='text/event-stream')

    started = time.time()

    def on_result(data):
        _report_cleanup(data.get("total_freed_bytes", 0), data.get("dirs_deleted", 0), "node_modules", started)

    return Response(_sse(run_npm_cleanup_stream(target_dir), on_result), mimetype='text/event-stream')

@app.route('/api/cleanup/docker', methods=['POST'])
def cleanup_docker():
    try:
        # Run docker system prune -a --volumes -f
        result = subprocess.run(
            ["docker", "system", "prune", "-a", "--volumes", "-f"],
            capture_output=True,
            text=True,
            check=True
        )
        # Parse the output to find "Total reclaimed space:"
        reclaimed = "Unknown space"
        for line in result.stdout.split('\n'):
            if "Total reclaimed space:" in line:
                reclaimed = line.split(":")[-1].strip()

        return jsonify({"success": True, "message": f"Docker purged successfully. Freed: {reclaimed}"})
    except FileNotFoundError:
        return jsonify({"error": "Docker is not installed or not in PATH."}), 404
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Docker command failed: {e.stderr}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleanup/xcode', methods=['POST'])
def cleanup_xcode():
    if sys.platform != 'darwin':
        return jsonify({"error": "This feature is only available on macOS."}), 400

    user_home = os.path.expanduser('~')
    derived_data = os.path.join(user_home, 'Library', 'Developer', 'Xcode', 'DerivedData')

    if not os.path.exists(derived_data):
        return jsonify({"success": True, "message": "DerivedData folder does not exist or is already clean."})

    try:
        freed, count = _dir_size(derived_data)
        shutil.rmtree(derived_data)
        _report_cleanup(freed, count, "xcode_derived")
        return jsonify({"success": True, "message": "Xcode DerivedData successfully deleted."})
    except Exception as e:
        return jsonify({"error": f"Failed to delete DerivedData: {str(e)}"}), 500


@app.route('/api/cleanup/venv_stream')
def cleanup_venv_stream():
    target_dir = request.args.get('target_dir', os.getcwd())
    if not os.path.exists(target_dir):
        def err():
            yield f"data: {json.dumps({'type': 'error', 'message': 'The base directory does not exist'})}\n\n"
        return Response(err(), mimetype='text/event-stream')

    started = time.time()

    def on_result(data):
        _report_cleanup(data.get("total_freed_bytes", 0), data.get("dirs_deleted", 0), "venvs", started)

    return Response(_sse(run_venv_cleanup_stream(target_dir), on_result), mimetype='text/event-stream')

@app.route('/api/cleanup/devcaches', methods=['POST'])
def cleanup_devcaches():
    user_home = os.path.expanduser('~')
    paths_to_clean = [
        os.path.join(user_home, '.cargo', 'registry'),
        os.path.join(user_home, '.cargo', 'git'),
        os.path.join(user_home, '.nuget', 'packages')
    ]

    freed = 0
    permission_denied = 0
    for path in paths_to_clean:
        if os.path.exists(path):
            try:
                for root, dirs, files in os.walk(path):
                    for f in files:
                        try:
                            freed += os.path.getsize(os.path.join(root, f))
                        except OSError:
                            pass
                shutil.rmtree(path)
            except PermissionError:
                permission_denied += 1
            except OSError:
                pass

    if freed > 0:
        msg = f"Successfully cleared Cargo/NuGet caches. Freed: {freed / (1024*1024):.2f} MB"
    else:
        msg = "Cargo and NuGet caches were already empty or not found."
    if permission_denied:
        msg += f" {permission_denied} cache folder(s) skipped (permission denied)."
    _report_cleanup(freed, 1 if freed else 0, "dev_caches")
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/backup/gamesaves', methods=['POST'])
def backup_gamesaves():
    user_home = os.path.expanduser('~')
    desktop = os.path.join(user_home, 'Desktop')
    backup_path = os.path.join(desktop, 'GameSaves_Backup')

    save_locations = [
        os.path.join(user_home, 'Documents', 'My Games'),
        os.path.join(user_home, 'AppData', 'LocalLow')
    ]

    found_any = False
    temp_dir = tempfile.mkdtemp()

    try:
        for loc in save_locations:
            if os.path.exists(loc):
                found_any = True
                dest = os.path.join(temp_dir, os.path.basename(loc))
                shutil.copytree(loc, dest)

        if not found_any:
            shutil.rmtree(temp_dir)
            return jsonify(
                {"success": True, "message": "No typical game save folders found in Documents/My Games or LocalLow."}
            )

        # Zip it
        shutil.make_archive(backup_path, 'zip', temp_dir)
        shutil.rmtree(temp_dir)

        return jsonify(
            {"success": True, "message": "Game saves backed up successfully to Desktop as GameSaves_Backup.zip"}
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleanup/shaders', methods=['POST'])
def cleanup_shaders():
    user_home = os.path.expanduser('~')
    local_app_data = os.path.join(user_home, 'AppData', 'Local')

    shader_paths = [
        os.path.join(local_app_data, 'NVIDIA', 'DXCache'),
        os.path.join(local_app_data, 'NVIDIA', 'GLCache'),
        os.path.join(local_app_data, 'AMD', 'DxCache'),
        os.path.join(local_app_data, 'D3DSCache')
    ]

    freed = 0
    permission_denied = 0
    for path in shader_paths:
        if os.path.exists(path):
            try:
                for root, dirs, files in os.walk(path):
                    for f in files:
                        try:
                            freed += os.path.getsize(os.path.join(root, f))
                        except OSError:
                            pass
                shutil.rmtree(path)
                os.makedirs(path) # Recreate empty dir
            except PermissionError:
                permission_denied += 1
            except OSError:
                pass

    if freed > 0:
        msg = f"Successfully cleared GPU Shader caches. Freed: {freed / (1024*1024):.2f} MB"
    else:
        msg = "Shader caches were already empty or not found."
    if permission_denied:
        msg += f" {permission_denied} cache folder(s) skipped (permission denied)."
    _report_cleanup(freed, 1 if freed else 0, "gpu_shaders")
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/organize/downloads', methods=['POST'])
def organize_downloads():
    user_home = os.path.expanduser('~')
    downloads_dir = os.path.join(user_home, 'Downloads')

    if not os.path.exists(downloads_dir):
        return jsonify({"error": "Downloads folder not found."}), 404

    categories = {
        'Images': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
        'Installers': ['.exe', '.msi', '.dmg', '.pkg', '.deb'],
        'Documents': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv', '.ppt', '.pptx'],
        'Videos': ['.mp4', '.mkv', '.avi', '.mov'],
        'Archives': ['.zip', '.rar', '.7z', '.tar', '.gz']
    }

    moved_count = 0

    for filename in os.listdir(downloads_dir):
        file_path = os.path.join(downloads_dir, filename)
        if os.path.isfile(file_path):
            _, ext = os.path.splitext(filename)
            ext = ext.lower()

            target_cat = 'Others'
            for cat, exts in categories.items():
                if ext in exts:
                    target_cat = cat
                    break

            cat_dir = os.path.join(downloads_dir, target_cat)
            if not os.path.exists(cat_dir):
                os.makedirs(cat_dir)

            try:
                shutil.move(file_path, os.path.join(cat_dir, filename))
                moved_count += 1
            except (OSError, shutil.Error):
                pass

    return jsonify({"success": True, "message": f"Successfully organized {moved_count} files in Downloads."})

@app.route('/api/cleanup/messaging', methods=['POST'])
def cleanup_messaging():
    user_home = os.path.expanduser('~')
    app_data = os.path.join(user_home, 'AppData', 'Roaming')

    cache_paths = [
        os.path.join(app_data, 'discord', 'Cache'),
        os.path.join(app_data, 'discord', 'Code Cache'),
        os.path.join(app_data, 'Telegram Desktop', 'tdata', 'user_data', 'cache')
    ]

    freed = 0
    permission_denied = 0
    for path in cache_paths:
        if os.path.exists(path):
            try:
                for root, dirs, files in os.walk(path):
                    for f in files:
                        try:
                            freed += os.path.getsize(os.path.join(root, f))
                        except OSError:
                            pass
                shutil.rmtree(path)
            except PermissionError:
                permission_denied += 1
            except OSError:
                pass

    if freed > 0:
        msg = f"Successfully cleared messaging caches. Freed: {freed / (1024*1024):.2f} MB"
    else:
        msg = "Messaging caches were already empty or not found."
    if permission_denied:
        msg += f" {permission_denied} cache folder(s) skipped (permission denied)."
    _report_cleanup(freed, 1 if freed else 0, "messaging_cache")
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/cleanup/windows_update', methods=['POST'])
def cleanup_windows_update():
    if sys.platform != 'win32':
        return jsonify({"error": "This feature is only available on Windows."}), 400

    try:
        # We run cleanmgr with verylowdisk which skips UI and does a thorough clean
        # creationflags=0x08000000 is CREATE_NO_WINDOW
        subprocess.Popen(["cleanmgr.exe", "/d", "c:", "/verylowdisk"], creationflags=0x08000000)
        return jsonify(
            {
                "success": True,
                "message": "Windows Disk Cleanup started in the background. It will automatically clean "
                           "system files and Windows Update cache.",
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/action/compress_zombie', methods=['POST'])
def compress_zombie():
    filepath = _abs_path_field(_json_body(), 'filepath')

    # Deletes the original after zipping - same protection as /api/delete.
    if filepath and _forbidden(filepath):
        return jsonify({"error": "Security: Modifying files in this location is not allowed"}), 403

    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "The source file/folder does not exist"}), 400

    try:
        base_name = os.path.splitext(filepath)[0] if os.path.isfile(filepath) else filepath
        archive_name = base_name

        if os.path.isdir(filepath):
            shutil.make_archive(archive_name, 'zip', filepath)
            shutil.rmtree(filepath)
        else:
            dir_name = os.path.dirname(filepath)
            file_name = os.path.basename(filepath)
            zip_path = os.path.join(dir_name, base_name + '.zip')

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                zipf.write(filepath, arcname=file_name)
            os.remove(filepath)

        return jsonify({"success": True, "message": "Successfully compressed and original deleted."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleanup/browsers', methods=['POST'])
def cleanup_browsers():
    user_home = os.path.expanduser('~')

    if sys.platform == 'win32':
        local_app_data = os.path.join(user_home, 'AppData', 'Local')
        paths_to_clean = [
            os.path.join(local_app_data, 'Google', 'Chrome', 'User Data', 'Default', 'Cache', 'Cache_Data'),
            os.path.join(local_app_data, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache', 'Cache_Data'),
            os.path.join(
                local_app_data, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache', 'Cache_Data'
            ),
            os.path.join(local_app_data, 'Opera Software', 'Opera Stable', 'Cache', 'Cache_Data'),
        ]
        firefox_profiles = os.path.join(local_app_data, 'Mozilla', 'Firefox', 'Profiles')
        if os.path.exists(firefox_profiles):
            for profile in os.listdir(firefox_profiles):
                paths_to_clean.append(os.path.join(firefox_profiles, profile, 'cache2'))
    elif sys.platform == 'darwin':
        caches = os.path.join(user_home, 'Library', 'Caches')
        paths_to_clean = [
            os.path.join(caches, 'Google', 'Chrome', 'Default', 'Cache'),
            os.path.join(caches, 'Microsoft Edge', 'Default', 'Cache'),
            os.path.join(caches, 'BraveSoftware', 'Brave-Browser', 'Default', 'Cache')
        ]
    else:
        return jsonify({"error": "Unsupported OS for this specific feature."}), 400

    freed = 0
    permission_denied = 0
    for path in paths_to_clean:
        if os.path.exists(path):
            try:
                for root, dirs, files in os.walk(path):
                    for f in files:
                        try:
                            freed += os.path.getsize(os.path.join(root, f))
                        except OSError:
                            pass
                shutil.rmtree(path)
            except PermissionError:
                permission_denied += 1
            except OSError:
                pass

    if freed > 0:
        msg = f"Successfully cleared Browser caches. Freed: {freed / (1024*1024):.2f} MB"
    else:
        msg = "Browser caches were already empty or not found."
    if permission_denied:
        msg += f" {permission_denied} cache folder(s) skipped (permission denied)."
    _report_cleanup(freed, 1 if freed else 0, "browser_cache")
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/cleanup/empty_folders', methods=['POST'])
def cleanup_empty_folders():
    target_dir = _abs_path_field(_json_body(), 'target_dir')
    if not target_dir or not os.path.isdir(target_dir):
        return jsonify({"error": "The target directory does not exist."}), 400
    if _forbidden(target_dir):
        return jsonify({"error": "Security: This location is protected."}), 403

    # #targetDir defaults to "C:\" in the UI, so a broad scan can legitimately
    # walk into C:\Windows/Program Files as subdirectories even though
    # target_dir itself isn't one of the forbidden roots - guard every
    # individual rmdir, not just the top-level target_dir.
    deleted_count = 0
    skipped_forbidden = 0
    for root, dirs, files in os.walk(target_dir, topdown=False):
        for d in dirs:
            dir_path = os.path.join(root, d)
            if _is_forbidden_path(dir_path):
                skipped_forbidden += 1
                continue
            try:
                if not os.listdir(dir_path):
                    os.rmdir(dir_path)
                    deleted_count += 1
            except OSError:
                pass

    msg = f"Nuked {deleted_count} empty folders successfully."
    if skipped_forbidden:
        msg += f" Skipped {skipped_forbidden} protected system folder(s)."
    _report_cleanup(0, deleted_count, "empty_dirs")
    return jsonify({"success": True, "message": msg})

@app.route('/api/cleanup/onedrive', methods=['POST'])
def cleanup_onedrive():
    if sys.platform != 'win32':
        return jsonify({"error": "This feature is only available on Windows."}), 400

    onedrive_path = os.environ.get('OneDrive') or os.environ.get('OneDriveConsumer')
    if not onedrive_path or not os.path.exists(onedrive_path):
        return jsonify({"error": "OneDrive is not installed or configured on this system."}), 404

    try:
        subprocess.Popen(["attrib", "+U", "-P", "/s", "*.*"], cwd=onedrive_path, creationflags=0x08000000)
        return jsonify(
            {
                "success": True,
                "message": "OneDrive is now freeing up space in the background. Your files are safe in the cloud.",
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/sys/disk_health', methods=['GET'])
def disk_health():
    # Piggybacks the periodic entitlement refresh onto this otherwise-innocuous
    # system check - see licensing.py's module docstring for why.
    entitled, _reason = licensing.refresh_capabilities()
    set_extended_scan_enabled(entitled)

    if sys.platform != 'win32':
        return jsonify(
            {
                "success": True,
                "health": "Unknown",
                "message": "OS not supported for SMART info.",
                "extended_scan_enabled": entitled,
            }
        )

    try:
        try:
            result = subprocess.run(
                ["wmic", "diskdrive", "get", "status,model"], capture_output=True, text=True, creationflags=0x08000000
            )
        except FileNotFoundError:
            # wmic.exe was removed from recent Windows 11 builds - fall back
            # to the PowerShell/CIM equivalent instead of crashing.
            result = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_DiskDrive | Select-Object Status,Model | Format-Table -HideTableHeaders",
                ],
                capture_output=True,
                text=True,
                creationflags=0x08000000,
            )
        lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]

        if len(lines) > 1:
            is_failing = any("Pred Fail" in line or "Error" in line for line in lines[1:])
            if is_failing:
                return jsonify(
                    {
                        "success": True,
                        "health": "Critical",
                        "message": "A drive is reporting predictive failure. Backup immediately!",
                        "extended_scan_enabled": entitled,
                    }
                )
            else:
                return jsonify(
                    {
                        "success": True,
                        "health": "OK",
                        "message": "All drives report healthy status.",
                        "extended_scan_enabled": entitled,
                    }
                )
        else:
            return jsonify(
                {
                    "success": True,
                    "health": "Unknown",
                    "message": "No disk information returned.",
                    "extended_scan_enabled": entitled,
                }
            )
    except Exception as e:
        return jsonify({"error": str(e), "extended_scan_enabled": entitled}), 500

@app.route('/api/sys/debloat', methods=['POST'])
def sys_debloat():
    if sys.platform != 'win32':
        return jsonify({"error": "This feature is only available on Windows."}), 400

    try:
        apps = [
            "*CandyCrush*",
            "*Bing*",
            "*ZuneVideo*",
            "*WindowsMaps*",
            "*McAfee*",
            "*Solitaire*",
            "*XboxApp*",
            "*People*",
        ]
        ps_commands = [f"Get-AppxPackage -Name '{app}' | Remove-AppxPackage" for app in apps]

        full_command = "; ".join(ps_commands)
        subprocess.run(
            ["powershell", "-Command", full_command], capture_output=True, creationflags=0x08000000, timeout=45
        )

        return jsonify({"success": True, "message": "Common Windows Bloatware has been uninstalled."})
    except subprocess.TimeoutExpired:
        return jsonify({"success": True, "message": "Debloating is running in the background..."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/export/save', methods=['POST'])
def export_save():
    """Writes the client-built report to disk (Desktop, falling back to the
    home folder) so the UI can offer a real 'open containing folder' action -
    a Blob-download in the browser has no way to know where the file landed."""
    data = _json_body()
    content = data.get('content', '')
    if not isinstance(content, str):
        return jsonify({"error": "content must be a string"}), 400
    filename = os.path.basename(_str_field(data, 'filename') or 'Scan_Report.txt')
    if not filename or filename.startswith('.'):
        filename = 'Scan_Report.txt'
    # Only ever writes a plain-text report, never e.g. an .exe/.bat on the Desktop.
    if not filename.lower().endswith('.txt'):
        filename += '.txt'

    desktop = os.path.join(os.path.expanduser('~'), 'Desktop')
    save_dir = desktop if os.path.isdir(desktop) else os.path.expanduser('~')
    save_path = os.path.join(save_dir, filename)

    try:
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({"success": True, "path": save_path})
    except OSError as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/system/reveal', methods=['POST'])
def reveal_in_folder():
    """Opens the OS file manager with the given file pre-selected."""
    path = _str_field(_json_body(), 'path')
    if not path or not os.path.exists(path):
        return jsonify({"error": "File does not exist"}), 400

    try:
        if sys.platform == 'win32':
            subprocess.Popen(['explorer', f'/select,{path}'])
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', '-R', path])
        else:
            subprocess.Popen(['xdg-open', os.path.dirname(path)])
        return jsonify({"success": True})
    except OSError as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/analyze_stream')
def smart_cleanup_analyze():
    """Analysis only (like /api/scan) - intentionally NOT gated, since nothing
    destructive happens until /api/cleanup/execute is called."""
    target_dir = request.args.get('target_dir', os.path.expanduser('~'))
    if not os.path.exists(target_dir):
        def err():
            yield f"data: {json.dumps({'type': 'error', 'message': 'The target directory does not exist'})}\n\n"
        return Response(err(), mimetype='text/event-stream')

    started = time.time()
    events = run_cleanup_analysis_stream(target_dir)
    return Response(_sse(events, lambda data: _report_analysis(data, started)), mimetype='text/event-stream')


@app.route('/api/cleanup/execute', methods=['POST'])
def smart_cleanup_execute():
    """Deletes/recycles the selected groups. Gated (see _GATED_ENDPOINTS) -
    this is the only destructive step in the Smart Cleanup flow. EventSource
    is GET-only, so the client reads this streamed response via fetch +
    response.body.getReader() instead."""
    selection = _json_body().get('selection', [])
    if not isinstance(selection, list) or not all(isinstance(i, dict) for i in selection):
        return jsonify({"error": "selection must be a list of objects"}), 400

    started = time.time()

    def on_result(data):
        _report_cleanup(data.get("freed_bytes", 0), data.get("deleted_count", 0), started=started,
                        categories=data.get("categories") or [])

    return Response(_sse(run_cleanup_execute_stream(selection), on_result), mimetype='text/event-stream')


# ---------------------------------------------------------------
# Account (device linking) - see licensing.py / docs/CONTRATO-API.md
# ---------------------------------------------------------------

# Web pages the UI may open in the system browser. Whitelist only - the
# client never supplies a URL.
_ACCOUNT_PAGES = {
    "pricing": "/pricing",
    "dashboard": "/dashboard",
    "billing": "/dashboard/billing",
}


def _open_in_browser(url):
    """Opens http(s) URLs in the user's default browser, off the request
    thread (webbrowser.open can block for a while on some systems)."""
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        return False
    threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    return True


@app.route('/api/account/status')
def account_status():
    return jsonify(licensing.current_state())


@app.route('/api/account/login', methods=['POST'])
def account_login():
    result = licensing.start_device_login()
    if not result.get("ok"):
        status = 503 if result.get("error") == "network_error" else 502
        if result.get("error") == "rate_limited":
            status = 429
        return _api_error(
            result.get("error", "login_failed"), result.get("message", "Could not start linking."), status
        )
    _open_in_browser(result["verification_uri_complete"])
    return jsonify(result)


@app.route('/api/account/login/open', methods=['POST'])
def account_login_open():
    url = licensing.pending_verification_uri()
    if not url:
        return _api_error("no_pending_login", "No linking in progress.", 400)
    _open_in_browser(url)
    return jsonify({"success": True})


@app.route('/api/account/login/poll', methods=['POST'])
def account_login_poll():
    result = licensing.poll_device_login()
    if result.get("status") == "linked":
        _sync_gate()
    return jsonify(result)


@app.route('/api/account/login/cancel', methods=['POST'])
def account_login_cancel():
    licensing.cancel_device_login()
    return jsonify({"success": True})


@app.route('/api/account/refresh', methods=['POST'])
def account_refresh():
    force = _json_body().get('force') is True
    state = licensing.refresh_entitlement(force=force)
    _sync_gate()
    return jsonify(state)


@app.route('/api/account/logout', methods=['POST'])
def account_logout():
    state = licensing.logout()
    _sync_gate()
    return jsonify(state)


@app.route('/api/account/open', methods=['POST'])
def account_open():
    page = _json_body().get('page')
    path = _ACCOUNT_PAGES.get(page) if isinstance(page, str) else None
    if not path:
        return _api_error("invalid_request", "Unknown page.", 400)
    _open_in_browser(licensing.api_url() + path)
    return jsonify({"success": True})


if __name__ == '__main__':
    # Dev-only entry point (browser testing without pywebview): fixed port
    # 5000, token from DISKSCANNER_DEV_TOKEN or random. The token is still
    # required on /api/* - open the printed URL, index.html carries it.
    # threaded=True so it doesn't freeze on long-running SSE streams either -
    # see main.py's start_server() for the full explanation.
    # Stored back in the env so Werkzeug's reloader child reuses the same token.
    os.environ.setdefault("DISKSCANNER_DEV_TOKEN", secrets.token_urlsafe(32))
    configure_security(5000, os.environ["DISKSCANNER_DEV_TOKEN"])
    _sync_gate()
    print(f" * DiskScanner dev server: http://127.0.0.1:5000  (X-DS-Token: {app.config['DS_TOKEN']})")
    app.run(host='127.0.0.1', debug=True, port=5000, threaded=True)
