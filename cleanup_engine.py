"""
Smart Cleanup engine: consolidates the "known safe to delete" location
knowledge that used to be scattered across ~10 one-click endpoints in app.py,
adds a classification pass over an arbitrary target directory (node_modules,
venvs, zombie files, empty folders, duplicates), and groups everything into
"safe" (regenerable, pre-selected) vs "review" (the user's own files,
opt-in, recycled not deleted) categories with a recoverable size each.

Deletion model (hybrid, per product decision):
  - safe / permanent  -> caches, temp, node_modules, venvs, recycle bin itself:
                         removed directly. These regenerate; recycling them is
                         slow and pointless.
  - review / recycle  -> zombies, duplicates, empty folders: sent to the OS
                         Recycle Bin via send2trash, so the user can undo.

Reuses scanner_logic.py's format_size / _is_reparse_point / get_file_hash and
mirrors its walker (reparse-point guard, PermissionError/OSError handling)
rather than re-inventing them.
"""

import os
import sys
import time
import shutil
import tempfile
from collections import defaultdict

# _is_forbidden_path (and the FORBIDDEN_PATHS list behind it) lives in
# scanner_logic.py as the single source of truth for this security-relevant
# guard - app.py imports the same function rather than each module keeping
# its own copy, so a future fix to what's protected only has to happen once.
from scanner_logic import format_size, _is_reparse_point, get_file_hash, _is_forbidden_path

try:
    from send2trash import send2trash
except ImportError:
    send2trash = None


_is_forbidden = _is_forbidden_path  # local alias, keeps call sites below unchanged


def _dir_size(path, deadline=None):
    """Sum file sizes under path (skips reparse points, tolerates permission
    errors). Returns (total_bytes, file_count).

    `deadline` (an absolute time.time() value) is optional and only checked
    by callers that pass one (e.g. the bounded target-dir walk below) - a
    single pathologically large folder (a node_modules tree, a slow network
    share) would otherwise blow straight through the caller's own time
    budget since this function used to have no way to bail out early."""
    total = 0
    count = 0
    if not os.path.isdir(path):
        return 0, 0
    stack = [path]
    while stack:
        if deadline and time.time() > deadline:
            break
        current = stack.pop()
        try:
            with os.scandir(current) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if _is_reparse_point(entry):
                                continue
                            stack.append(entry.path)
                        elif entry.is_file(follow_symlinks=False):
                            total += entry.stat(follow_symlinks=False).st_size
                            count += 1
                    except (PermissionError, OSError):
                        continue
        except (PermissionError, OSError):
            continue
    return total, count


def _user_home():
    return os.path.expanduser('~')


def _local_appdata():
    if sys.platform == 'win32':
        return os.environ.get('LOCALAPPDATA', os.path.join(_user_home(), 'AppData', 'Local'))
    return os.path.join(_user_home(), 'Library', 'Application Support')


def _roaming_appdata():
    if sys.platform == 'win32':
        return os.environ.get('APPDATA', os.path.join(_user_home(), 'AppData', 'Roaming'))
    return os.path.join(_user_home(), 'Library', 'Application Support')


def _browser_cache_paths():
    home = _user_home()
    paths = []
    if sys.platform == 'win32':
        local = _local_appdata()
        paths += [
            os.path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache', 'Cache_Data'),
            os.path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache', 'Cache_Data'),
            os.path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache', 'Cache_Data'),
            os.path.join(local, 'Opera Software', 'Opera Stable', 'Cache', 'Cache_Data'),
        ]
        firefox_profiles = os.path.join(local, 'Mozilla', 'Firefox', 'Profiles')
        if os.path.isdir(firefox_profiles):
            try:
                for profile in os.listdir(firefox_profiles):
                    paths.append(os.path.join(firefox_profiles, profile, 'cache2'))
            except OSError:
                pass
    elif sys.platform == 'darwin':
        caches = os.path.join(home, 'Library', 'Caches')
        paths += [
            os.path.join(caches, 'Google', 'Chrome', 'Default', 'Cache'),
            os.path.join(caches, 'Microsoft Edge', 'Default', 'Cache'),
            os.path.join(caches, 'BraveSoftware', 'Brave-Browser', 'Default', 'Cache'),
        ]
    return paths


def _gpu_shader_paths():
    if sys.platform != 'win32':
        return []
    local = _local_appdata()
    return [
        os.path.join(local, 'NVIDIA', 'DXCache'),
        os.path.join(local, 'NVIDIA', 'GLCache'),
        os.path.join(local, 'AMD', 'DxCache'),
        os.path.join(local, 'D3DSCache'),
    ]


def _messaging_cache_paths():
    roaming = _roaming_appdata()
    return [
        os.path.join(roaming, 'discord', 'Cache'),
        os.path.join(roaming, 'discord', 'Code Cache'),
        os.path.join(roaming, 'Telegram Desktop', 'tdata', 'user_data', 'cache'),
    ]


def _dev_cache_paths():
    home = _user_home()
    return [
        os.path.join(home, '.gradle', 'caches'),
        os.path.join(home, '.cargo', 'registry'),
        os.path.join(home, '.cargo', 'git'),
        os.path.join(home, '.nuget', 'packages'),
    ]


def _xcode_derived_data_paths():
    if sys.platform != 'darwin':
        return []
    return [os.path.join(_user_home(), 'Library', 'Developer', 'Xcode', 'DerivedData')]


def _recycle_bin_info():
    """Windows only: (bytes, item_count) currently sitting in the Recycle Bin."""
    if sys.platform != 'win32':
        return 0, 0
    try:
        import ctypes
        from ctypes import wintypes

        class SHQUERYRBINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("i64Size", ctypes.c_int64),
                ("i64NumItems", ctypes.c_int64),
            ]

        info = SHQUERYRBINFO()
        info.cbSize = ctypes.sizeof(SHQUERYRBINFO)
        result = ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(info))
        if result == 0:
            return info.i64Size, info.i64NumItems
    except Exception:
        pass
    return 0, 0


def _empty_recycle_bin():
    if sys.platform != 'win32':
        return False
    try:
        import ctypes
        SHERB_NOCONFIRMATION = 0x00000001
        SHERB_NOPROGRESSUI = 0x00000002
        SHERB_NOSOUND = 0x00000004
        flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND
        ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, flags)
        return True
    except Exception:
        return False


def _is_venv_dir(path):
    return any(
        os.path.exists(os.path.join(path, *parts))
        for parts in (('Scripts', 'python.exe'), ('bin', 'python'))
    )


def _walk_target_for_categories(target_dir, errors, deadline):
    """Single walk over target_dir collecting candidates for several
    categories at once: node_modules folders, python venvs, zombie files,
    empty folders, and same-size buckets for a bounded duplicate pass.
    Mirrors scanner_logic.py's walker: reparse-point guard before descending,
    PermissionError/OSError accumulated (never silently swallowed)."""
    node_modules_items = []
    venv_items = []
    zombie_items = []
    empty_dir_items = []
    files_by_size = defaultdict(list)

    current_time = time.time()
    stack = [target_dir]

    while stack:
        if time.time() > deadline:
            break
        current_dir = stack.pop()
        has_items = False
        try:
            with os.scandir(current_dir) as it:
                entries = list(it)
                has_items = bool(entries)
                for entry in entries:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if _is_reparse_point(entry):
                                continue
                            name_lower = entry.name.lower()
                            if name_lower == 'node_modules':
                                size, _count = _dir_size(entry.path, deadline=deadline)
                                node_modules_items.append({"path": entry.path, "bytes": size, "is_dir": True})
                                continue  # don't descend - already counted whole
                            if name_lower in ('venv', '.venv', 'env', '.env') and _is_venv_dir(entry.path):
                                size, _count = _dir_size(entry.path, deadline=deadline)
                                venv_items.append({"path": entry.path, "bytes": size, "is_dir": True})
                                continue
                            stack.append(entry.path)
                        elif entry.is_file(follow_symlinks=False):
                            stat = entry.stat(follow_symlinks=False)
                            size = stat.st_size
                            if size > 52428800:  # > 50MB
                                if current_time - max(stat.st_atime, stat.st_mtime) > 31536000:  # > 1 year
                                    zombie_items.append({"path": entry.path, "bytes": size, "is_dir": False})
                            if size > 1024 * 1024:  # > 1MB, same threshold as the main scanner
                                files_by_size[size].append(entry.path)
                    except PermissionError:
                        errors.append({"path": entry.path, "reason": "permission_denied"})
                    except OSError as e:
                        errors.append({"path": entry.path, "reason": str(e)})
        except PermissionError:
            errors.append({"path": current_dir, "reason": "permission_denied"})
        except OSError as e:
            errors.append({"path": current_dir, "reason": str(e)})

        if not has_items and current_dir != target_dir:
            empty_dir_items.append({"path": current_dir, "bytes": 0, "is_dir": True})

    # Bounded duplicate pass - same caps as scanner_logic.run_scan_stream's
    # duplicate detection, just with a tighter time budget since this runs
    # alongside everything else in one analysis call.
    duplicate_items = []
    MAX_BUCKET_CANDIDATES = 200
    MAX_HASH_SECONDS = 15
    dup_start = time.time()
    duplicates = defaultdict(list)
    for size, paths in files_by_size.items():
        if len(paths) <= 1 or len(paths) > MAX_BUCKET_CANDIDATES:
            continue
        if time.time() - dup_start > MAX_HASH_SECONDS:
            break
        for path in paths:
            if time.time() - dup_start > MAX_HASH_SECONDS:
                break
            file_hash = get_file_hash(path)
            if file_hash:
                duplicates[(size, file_hash)].append(path)

    for (size, _hash), paths in duplicates.items():
        if len(paths) > 1:
            # Keep the first copy, offer the rest as reclaimable duplicates.
            for p in paths[1:]:
                duplicate_items.append({"path": p, "bytes": size, "is_dir": False})

    return {
        "node_modules": node_modules_items,
        "venvs": venv_items,
        "zombies": zombie_items,
        "empty_dirs": empty_dir_items,
        "duplicates": duplicate_items,
    }


def run_cleanup_analysis_stream(target_dir):
    """SSE-style generator (same progress/result shape as scanner_logic's
    stream functions) that analyzes both system-wide known-safe locations and
    the given target directory, yielding grouped, sized, classified results."""
    yield {"type": "progress", "message": "Starting Smart Cleanup analysis...", "found": format_size(0)}

    errors = []
    groups = []
    running_total = 0

    def make_group(id_, label, group_name, safety, delete_mode, icon, items, cap=200):
        nonlocal running_total
        # total_bytes/item_count/items must stay in lockstep: the client only
        # ever sends `items` back to /api/cleanup/execute, so if the totals
        # reflected the FULL (uncapped) list, a group over `cap` would show a
        # bigger "you're about to free up X" promise than what actually gets
        # deleted. Report only what's included, and surface the rest via
        # truncated/full_* so the UI can be honest about there being more.
        included_items = items[:cap]
        included_bytes = sum(i["bytes"] for i in included_items)
        full_bytes = sum(i["bytes"] for i in items)
        running_total += included_bytes
        return {
            "id": id_,
            "label": label,
            "group": group_name,
            "safety": safety,
            "delete_mode": delete_mode,
            "icon": icon,
            "total_bytes": included_bytes,
            "formatted_size": format_size(included_bytes),
            "item_count": len(included_items),
            "items": included_items,
            "selected_by_default": safety == "safe",
            "truncated": len(items) > cap,
            "full_item_count": len(items),
            "full_total_bytes": full_bytes,
        }

    # --- System-wide known-safe locations (fast: fixed paths, no full-disk walk) ---
    system_categories = [
        ("temp", "Temporary Files", "caches", "fa-solid fa-broom", [tempfile.gettempdir()]),
        ("browser_cache", "Browser Caches", "caches", "fa-brands fa-firefox-browser", _browser_cache_paths()),
        ("gpu_shaders", "GPU Shader Caches", "caches", "fa-solid fa-microchip", _gpu_shader_paths()),
        ("messaging_cache", "Messaging App Caches", "caches", "fa-brands fa-telegram", _messaging_cache_paths()),
        ("dev_caches", "Developer Caches (Gradle/Cargo/NuGet)", "development", "fa-solid fa-code", _dev_cache_paths()),
        ("xcode_derived", "Xcode DerivedData", "development", "fa-brands fa-apple", _xcode_derived_data_paths()),
    ]

    for cat_id, label, group_name, icon, paths in system_categories:
        yield {"type": "progress", "message": f"Analyzing {label}...", "found": format_size(running_total)}
        items = []
        for p in paths:
            if not p or _is_forbidden(p) or not os.path.isdir(p):
                continue
            size, _count = _dir_size(p)
            if size > 0:
                items.append({"path": p, "bytes": size, "is_dir": True})
        if items:
            groups.append(make_group(cat_id, label, group_name, "safe", "permanent", icon, items))

    # --- Recycle Bin (Windows) ---
    yield {"type": "progress", "message": "Checking Recycle Bin...", "found": format_size(running_total)}
    rb_bytes, _rb_count = _recycle_bin_info()
    if rb_bytes > 0:
        groups.append(make_group(
            "recycle_bin", "Recycle Bin", "caches", "safe", "permanent", "fa-solid fa-trash",
            [{"path": "__RECYCLE_BIN__", "bytes": rb_bytes, "is_dir": True}],
        ))

    # --- Target-directory-specific categories ---
    if target_dir and os.path.isdir(target_dir) and not _is_forbidden(target_dir):
        yield {"type": "progress", "message": f"Scanning {target_dir} for reclaimable items...", "found": format_size(running_total)}
        deadline = time.time() + 45  # hard cap so analysis never hangs on huge trees
        walked = _walk_target_for_categories(target_dir, errors, deadline)

        if walked["node_modules"]:
            groups.append(make_group("node_modules", "node_modules Folders", "development", "safe", "permanent", "fa-brands fa-npm", walked["node_modules"]))
        if walked["venvs"]:
            groups.append(make_group("venvs", "Python Virtual Environments", "development", "safe", "permanent", "fa-brands fa-python", walked["venvs"]))
        if walked["empty_dirs"]:
            groups.append(make_group("empty_dirs", "Empty Folders", "user_files", "review", "recycle", "fa-solid fa-folder-minus", walked["empty_dirs"]))
        if walked["zombies"]:
            groups.append(make_group("zombies", "Old Large Files (Zombies)", "user_files", "review", "recycle", "fa-solid fa-ghost", walked["zombies"]))
        if walked["duplicates"]:
            groups.append(make_group("duplicates", "Duplicate Files", "user_files", "review", "recycle", "fa-solid fa-copy", walked["duplicates"]))

    groups.sort(key=lambda g: g["total_bytes"], reverse=True)
    total_bytes = sum(g["total_bytes"] for g in groups)

    yield {
        "type": "result",
        "data": {
            "groups": groups,
            "total_reclaimable": format_size(total_bytes),
            "total_reclaimable_bytes": total_bytes,
            "errors": {"count": len(errors), "items": errors[:50]},
        },
    }


def run_cleanup_execute_stream(selection):
    """selection: list of {"path": str, "delete_mode": "permanent"|"recycle"}.
    Re-validates FORBIDDEN_PATHS server-side regardless of what the client
    sent - the client's selection is never trusted blindly."""
    yield {"type": "progress", "message": f"Preparing to clean {len(selection)} item(s)...", "freed": format_size(0)}

    freed = 0
    deleted_count = 0
    failed_count = 0
    errors = []
    last_yield = time.time()

    for item in selection:
        path = item.get("path")
        mode = item.get("delete_mode", "permanent")

        if not path:
            continue

        # normpath before any OS/shell call: send2trash's underlying Windows
        # Shell API is strict about separators and rejects forward-slash
        # paths with a cryptic WinError, even though os.remove/rmtree tolerate them.
        if path != "__RECYCLE_BIN__":
            path = os.path.normpath(path)

        if path == "__RECYCLE_BIN__":
            if _empty_recycle_bin():
                deleted_count += 1
            else:
                failed_count += 1
                errors.append({"path": path, "reason": "could_not_empty_recycle_bin"})
            continue

        if _is_forbidden(path):
            failed_count += 1
            errors.append({"path": path, "reason": "forbidden_path"})
            continue

        if not os.path.exists(path):
            failed_count += 1
            errors.append({"path": path, "reason": "not_found"})
            continue

        try:
            if os.path.isdir(path):
                size, _count = _dir_size(path)
            else:
                size = os.path.getsize(path)

            if mode == "recycle":
                if send2trash is None:
                    raise RuntimeError("send2trash is not installed")
                send2trash(path)
            else:
                if os.path.isdir(path):
                    shutil.rmtree(path)
                else:
                    os.remove(path)

            freed += size
            deleted_count += 1
        except PermissionError:
            failed_count += 1
            errors.append({"path": path, "reason": "permission_denied"})
        except (OSError, RuntimeError) as e:
            # RuntimeError covers send2trash being unavailable (e.g. missing
            # from a frozen build) - without catching it here it escapes the
            # generator entirely, killing the whole batch mid-stream and
            # losing the freed/deleted_count tally for everything already
            # done before this item.
            failed_count += 1
            errors.append({"path": path, "reason": str(e)})

        if time.time() - last_yield > 0.3:
            yield {"type": "progress", "message": f"Freed {format_size(freed)} so far...", "freed": format_size(freed)}
            last_yield = time.time()

    yield {
        "type": "result",
        "data": {
            "freed": format_size(freed),
            "freed_bytes": freed,
            "deleted_count": deleted_count,
            "failed_count": failed_count,
            "errors": {"count": len(errors), "items": errors[:50]},
        },
    }
