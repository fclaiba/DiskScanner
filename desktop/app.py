from flask import Flask, render_template, request, jsonify, Response
import os
import json
import shutil
import tempfile
import sys
import subprocess
import zipfile
from scanner_logic import run_scan_stream, run_npm_cleanup_stream, run_venv_cleanup_stream, _is_forbidden_path
from cleanup_engine import run_cleanup_analysis_stream, run_cleanup_execute_stream
import licensing

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

# In-memory capability flags. Refreshed periodically by the disk-health check
# below (and by main.py's startup/background timer) - never re-checked on
# every request, so normal scan/cleanup usage stays fully usable offline.
_capabilities = {"extended_scan_enabled": False}


def set_extended_scan_enabled(enabled):
    _capabilities["extended_scan_enabled"] = bool(enabled)


# Destructive/premium endpoints gated on an active license.
_GATED_ENDPOINTS = {
    "delete_file", "move_file", "cleanup_temp", "cleanup_gradle",
    "cleanup_npm_stream", "cleanup_docker", "cleanup_xcode",
    "cleanup_venv_stream", "cleanup_devcaches", "backup_gamesaves",
    "cleanup_shaders", "organize_downloads", "cleanup_messaging",
    "cleanup_windows_update", "compress_zombie", "cleanup_browsers",
    "cleanup_empty_folders", "cleanup_onedrive", "sys_debloat",
    "smart_cleanup_execute",
}


@app.before_request
def _gate_destructive_routes():
    if request.endpoint in _GATED_ENDPOINTS and not _capabilities["extended_scan_enabled"]:
        return jsonify({"error": "This feature requires an active license."}), 403

@app.route('/')
def index():
    return render_template('index.html')

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

    def generate():
        for event in run_scan_stream(target_dir, ignore_dirs, find_dups):
            yield f"data: {json.dumps(event)}\n\n"

    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/delete', methods=['POST'])
def delete_file():
    data = request.json
    filepath = data.get('filepath')
    
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "File does not exist or no path was provided"}), 400
        
    if os.path.isdir(filepath):
        return jsonify({"error": "Entire directories cannot be deleted for safety. Delete individual files."}), 400
        
    if _is_forbidden_path(filepath):
        return jsonify({"error": "Security: Deleting files in this location is not allowed"}), 403
            
    try:
        os.remove(filepath)
        return jsonify({"success": True, "message": f"File deleted successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/move', methods=['POST'])
def move_file():
    data = request.json
    filepath = data.get('filepath')
    destination = data.get('destination')
    
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "The source file does not exist"}), 400
        
    if not destination or not os.path.exists(os.path.dirname(destination)):
        return jsonify({"error": "The destination path is invalid"}), 400
        
    try:
        shutil.move(filepath, destination)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleanup/temp', methods=['POST'])
def cleanup_temp():
    temp_dir = tempfile.gettempdir()
    deleted = 0
    errors = 0
    permission_denied = 0
    for root, dirs, files in os.walk(temp_dir):
        for file in files:
            try:
                os.remove(os.path.join(root, file))
                deleted += 1
            except PermissionError:
                permission_denied += 1
            except OSError:
                errors += 1
    msg = f"Cleanup completed. {deleted} files deleted, {errors} ignored."
    if permission_denied:
        msg += f" {permission_denied} skipped (permission denied)."
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/cleanup/gradle', methods=['POST'])
def cleanup_gradle():
    # Gradle cache is typically in %USERPROFILE%/.gradle/caches
    user_home = os.path.expanduser('~')
    gradle_cache = os.path.join(user_home, '.gradle', 'caches')
    
    if not os.path.exists(gradle_cache):
        return jsonify({"success": True, "message": "The Gradle cache folder does not exist or is already clean."})
        
    try:
        shutil.rmtree(gradle_cache)
        return jsonify({"success": True, "message": "Gradle cache successfully deleted. It will be regenerated on the next build."})
    except Exception as e:
        return jsonify({"error": f"Failed to delete cache: {str(e)}"}), 500

@app.route('/api/cleanup/npm_stream')
def cleanup_npm_stream():
    target_dir = request.args.get('target_dir', os.getcwd())
    if not os.path.exists(target_dir):
        def err(): 
            yield f"data: {json.dumps({'type': 'error', 'message': 'The base directory does not exist'})}\n\n"
        return Response(err(), mimetype='text/event-stream')

    def generate():
        for event in run_npm_cleanup_stream(target_dir):
            yield f"data: {json.dumps(event)}\n\n"

    return Response(generate(), mimetype='text/event-stream')

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
        shutil.rmtree(derived_data)
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

    def generate():
        for event in run_venv_cleanup_stream(target_dir):
            yield f"data: {json.dumps(event)}\n\n"

    return Response(generate(), mimetype='text/event-stream')

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
            return jsonify({"success": True, "message": "No typical game save folders found in Documents/My Games or LocalLow."})
            
        # Zip it
        shutil.make_archive(backup_path, 'zip', temp_dir)
        shutil.rmtree(temp_dir)
        
        return jsonify({"success": True, "message": f"Game saves backed up successfully to Desktop as GameSaves_Backup.zip"})
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
            except:
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
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/cleanup/windows_update', methods=['POST'])
def cleanup_windows_update():
    if sys.platform != 'win32':
        return jsonify({"error": "This feature is only available on Windows."}), 400
        
    try:
        # We run cleanmgr with verylowdisk which skips UI and does a thorough clean
        # creationflags=0x08000000 is CREATE_NO_WINDOW
        subprocess.Popen(["cleanmgr.exe", "/d", "c:", "/verylowdisk"], creationflags=0x08000000)
        return jsonify({"success": True, "message": "Windows Disk Cleanup started in the background. It will automatically clean system files and Windows Update cache."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/action/compress_zombie', methods=['POST'])
def compress_zombie():
    data = request.json
    filepath = data.get('filepath')
    
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
            os.path.join(local_app_data, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache', 'Cache_Data'),
            os.path.join(local_app_data, 'Opera Software', 'Opera Stable', 'Cache', 'Cache_Data')
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
    return jsonify({"success": True, "message": msg, "permission_denied": permission_denied})

@app.route('/api/cleanup/empty_folders', methods=['POST'])
def cleanup_empty_folders():
    target_dir = request.json.get('target_dir') if request.json else os.getcwd()
    if not target_dir or not os.path.exists(target_dir):
        return jsonify({"error": "The target directory does not exist."}), 400

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
        return jsonify({"success": True, "message": "OneDrive is now freeing up space in the background. Your files are safe in the cloud."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/sys/disk_health', methods=['GET'])
def disk_health():
    # Piggybacks the periodic entitlement refresh onto this otherwise-innocuous
    # system check - see licensing.py's module docstring for why.
    entitled, _reason = licensing.refresh_capabilities()
    set_extended_scan_enabled(entitled)

    if sys.platform != 'win32':
        return jsonify({"success": True, "health": "Unknown", "message": "OS not supported for SMART info.", "extended_scan_enabled": entitled})

    try:
        try:
            result = subprocess.run(["wmic", "diskdrive", "get", "status,model"], capture_output=True, text=True, creationflags=0x08000000)
        except FileNotFoundError:
            # wmic.exe was removed from recent Windows 11 builds - fall back
            # to the PowerShell/CIM equivalent instead of crashing.
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-CimInstance Win32_DiskDrive | Select-Object Status,Model | Format-Table -HideTableHeaders"],
                capture_output=True, text=True, creationflags=0x08000000
            )
        lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]

        if len(lines) > 1:
            is_failing = any("Pred Fail" in line or "Error" in line for line in lines[1:])
            if is_failing:
                return jsonify({"success": True, "health": "Critical", "message": "A drive is reporting predictive failure. Backup immediately!", "extended_scan_enabled": entitled})
            else:
                return jsonify({"success": True, "health": "OK", "message": "All drives report healthy status.", "extended_scan_enabled": entitled})
        else:
            return jsonify({"success": True, "health": "Unknown", "message": "No disk information returned.", "extended_scan_enabled": entitled})
    except Exception as e:
        return jsonify({"error": str(e), "extended_scan_enabled": entitled}), 500

@app.route('/api/sys/debloat', methods=['POST'])
def sys_debloat():
    if sys.platform != 'win32':
        return jsonify({"error": "This feature is only available on Windows."}), 400
        
    try:
        apps = ["*CandyCrush*", "*Bing*", "*ZuneVideo*", "*WindowsMaps*", "*McAfee*", "*Solitaire*", "*XboxApp*", "*People*"]
        ps_commands = [f"Get-AppxPackage -Name '{app}' | Remove-AppxPackage" for app in apps]
        
        full_command = "; ".join(ps_commands)
        subprocess.run(["powershell", "-Command", full_command], capture_output=True, creationflags=0x08000000, timeout=45)
        
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
    data = request.json or {}
    content = data.get('content', '')
    filename = os.path.basename(data.get('filename') or 'Scan_Report.txt')
    if not filename:
        filename = 'Scan_Report.txt'

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
    data = request.json or {}
    path = data.get('path')
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

    def generate():
        for event in run_cleanup_analysis_stream(target_dir):
            yield f"data: {json.dumps(event)}\n\n"

    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/cleanup/execute', methods=['POST'])
def smart_cleanup_execute():
    """Deletes/recycles the selected groups. Gated (see _GATED_ENDPOINTS) -
    this is the only destructive step in the Smart Cleanup flow. EventSource
    is GET-only, so the client reads this streamed response via fetch +
    response.body.getReader() instead."""
    data = request.json or {}
    selection = data.get('selection', [])
    if not isinstance(selection, list):
        return jsonify({"error": "selection must be a list"}), 400

    def generate():
        for event in run_cleanup_execute_stream(selection):
            yield f"data: {json.dumps(event)}\n\n"

    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    # threaded=True so this dev-only entry point (browser testing without
    # pywebview) doesn't freeze on long-running SSE streams either - see
    # main.py's app.run() call for the full explanation.
    app.run(debug=True, port=5000, threaded=True)
