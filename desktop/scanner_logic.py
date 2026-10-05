import os
import sys
import hashlib
import time
import shutil
import stat
from collections import defaultdict

if sys.platform == 'win32':
    FORBIDDEN_PATHS = ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)"]
elif sys.platform == 'darwin':
    FORBIDDEN_PATHS = ["/System", "/Library", "/usr", "/bin", "/sbin"]
else:
    FORBIDDEN_PATHS = ["/bin", "/etc", "/usr", "/sbin", "/sys", "/proc", "/boot"]


def _is_forbidden_path(path):
    """Same normpath-based guard as app.py/cleanup_engine.py - a folder
    literally named node_modules or venv can legitimately exist under
    Program Files (some Windows apps ship one), so a broad target_dir like
    "C:\\" must not let the cleanup streams rmtree it."""
    normalized = os.path.normpath(path).lower()
    return any(normalized.startswith(os.path.normpath(f).lower()) for f in FORBIDDEN_PATHS)

def format_size(size):
    power = 2**10
    n = 0
    power_labels = {0 : '', 1: 'KB', 2: 'MB', 3: 'GB', 4: 'TB'}
    while size > power and n < 4:
        size /= power
        n += 1
    return f"{size:.2f} {power_labels[n]}"

def _is_reparse_point(entry):
    """True for NTFS junctions/symlinks/mount points. entry.is_dir(follow_symlinks=False)
    still returns True for these on Windows, so without this check a self-referencing
    junction (e.g. AppData\\Local <-> AppData\\Local\\Application Data) sends the
    stack-based walk into an infinite loop."""
    try:
        st = entry.stat(follow_symlinks=False)
        return bool(st.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (OSError, AttributeError):
        return False

def get_file_hash(filepath, chunk_size=8192, max_bytes=50 * 1024 * 1024):
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            read = 0
            for chunk in iter(lambda: f.read(chunk_size), b""):
                hasher.update(chunk)
                read += len(chunk)
                if read >= max_bytes:
                    break
        return hasher.hexdigest()
    except Exception:
        return None

def run_scan_stream(target_dir, ignore_dirs=None, find_dups=True):
    if ignore_dirs is None:
        ignore_dirs = []
        
    total_size = 0
    file_count = 0
    dir_count = 0
    extension_sizes = defaultdict(int)
    extension_counts = defaultdict(int)
    largest_files = [] 
    empty_dirs = []
    files_by_size = defaultdict(list)
    
    git_projects = defaultdict(int)
    
    game_mods_size = 0
    game_mods_count = 0
    game_mods_paths = set()
    mod_keywords = [
        'workshop', 'mods', 'nexus', 'vortex', 'curseforge',
        'epic games', 'xboxgames', 'windowsapps', os.path.join('steamapps', 'common').lower(),
        'riot games', 'ubisoft game launcher', 'deriveddata', os.path.join('library', 'caches')
    ]
    
    macro_folders = {}
    zombie_files = []
    treemap_data = {"name": target_dir, "value": 0, "children": []}
    treemap_nodes = {}
    errors = []

    current_time = time.time()

    yield {"type": "progress", "message": f"Starting scan in {target_dir}...", "files_scanned": 0, "macro": []}

    last_yield_time = time.time()
    
    # 1. Macro folders detection
    root_level_dirs = []
    try:
        with os.scandir(target_dir) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    root_level_dirs.append(entry.path)
                    macro_folders[entry.path] = 0
                    treemap_nodes[entry.path] = 0
    except Exception:
        pass

    stack = [(target_dir, None)]
    
    while stack:
        current_dir, current_project = stack.pop()
        
        dir_name = os.path.basename(current_dir).lower()
        if dir_name in ignore_dirs:
            continue
            
        dir_count += 1
        current_dir_lower = current_dir.lower()
        is_mod_dir = any(keyword in current_dir_lower for keyword in mod_keywords)
        
        current_macro = None
        for rld in root_level_dirs:
            if current_dir == rld or current_dir.startswith(rld + os.sep):
                current_macro = rld
                break
                
        if time.time() - last_yield_time > 0.3:
            macro_stats = [{"path": k, "size": v, "formatted_size": format_size(v)} for k,v in macro_folders.items() if v > 0]
            macro_stats = sorted(macro_stats, key=lambda x: x["size"], reverse=True)[:10]
            yield {
                "type": "progress", 
                "message": f"Scanning: {current_dir}", 
                "files_scanned": file_count,
                "macro": macro_stats
            }
            last_yield_time = time.time()
            
        has_items = False
        try:
            with os.scandir(current_dir) as it:
                entries = list(it)
                has_items = bool(entries)
                
                if not current_project:
                    for entry in entries:
                        if entry.is_dir(follow_symlinks=False) and entry.name == '.git':
                            current_project = current_dir
                            break

                for entry in entries:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if _is_reparse_point(entry):
                                continue
                            stack.append((entry.path, current_project))
                        elif entry.is_file(follow_symlinks=False):
                            stat = entry.stat(follow_symlinks=False)
                            file_size = stat.st_size
                            filepath = entry.path
                            
                            total_size += file_size
                            file_count += 1
                            
                            if current_macro:
                                macro_folders[current_macro] += file_size
                                treemap_nodes[current_macro] += file_size
                                
                            if current_project:
                                git_projects[current_project] += file_size
                                
                            if file_size > 52428800:
                                atime = stat.st_atime
                                mtime = stat.st_mtime
                                if current_time - max(atime, mtime) > 31536000:
                                    zombie_files.append({
                                        "path": filepath,
                                        "size": file_size,
                                        "formatted_size": format_size(file_size)
                                    })
                                    
                            _, ext = os.path.splitext(entry.name)
                            ext = ext.lower() or "No extension"
                            
                            extension_sizes[ext] += file_size
                            extension_counts[ext] += 1
                            
                            largest_files.append({"size": file_size, "path": filepath, "formatted_size": format_size(file_size)})
                            largest_files = sorted(largest_files, key=lambda x: x["size"], reverse=True)[:20]
                            
                            if find_dups and file_size > 1024 * 1024:
                                files_by_size[file_size].append(filepath)
                                
                            if is_mod_dir or any(keyword in entry.name.lower() for keyword in mod_keywords):
                                game_mods_size += file_size
                                game_mods_count += 1
                                if len(game_mods_paths) < 20:
                                    game_mods_paths.add(current_dir)
                    except PermissionError:
                        errors.append({"path": entry.path, "reason": "permission_denied"})
                    except OSError as e:
                        errors.append({"path": entry.path, "reason": str(e)})
        except PermissionError:
            errors.append({"path": current_dir, "reason": "permission_denied"})
        except OSError as e:
            errors.append({"path": current_dir, "reason": str(e)})

        if not has_items and current_dir != target_dir:
            empty_dirs.append(current_dir)

    treemap_data["value"] = total_size
    for k, v in treemap_nodes.items():
        if v > 0:
            treemap_data["children"].append({"name": os.path.basename(k), "value": v, "path": k})

    macro_stats_final = [{"path": k, "size": v, "formatted_size": format_size(v)} for k,v in macro_folders.items() if v > 0]
    
    real_duplicates = []
    total_duplicate_space = 0
    duplicates_partial = False

    if find_dups:
        yield {"type": "progress", "message": "Searching for exact duplicate files (Calculating MD5 Hash)...", "files_scanned": file_count, "macro": macro_stats_final[:10]}
        duplicates = defaultdict(list)

        MAX_BUCKET_CANDIDATES = 200  # skip hashing a size-bucket with more candidates than this
        MAX_HASH_SECONDS = 30        # hard time budget for the whole hashing pass
        dup_scan_start = time.time()

        hashable_buckets = {size: paths for size, paths in files_by_size.items() if 1 < len(paths) <= MAX_BUCKET_CANDIDATES}
        if any(len(paths) > MAX_BUCKET_CANDIDATES for paths in files_by_size.values()):
            duplicates_partial = True

        # Track time to prevent hanging
        last_yield_time = time.time()
        files_to_hash = sum(len(paths) for paths in hashable_buckets.values())
        hashed_count = 0

        for size, paths in hashable_buckets.items():
            if time.time() - dup_scan_start > MAX_HASH_SECONDS:
                duplicates_partial = True
                break
            for path in paths:
                if time.time() - dup_scan_start > MAX_HASH_SECONDS:
                    duplicates_partial = True
                    break
                if time.time() - last_yield_time > 0.5:
                    yield {
                        "type": "progress",
                        "message": f"Hashing duplicates: {hashed_count} / {files_to_hash} files...",
                        "files_scanned": file_count,
                        "macro": macro_stats_final[:10]
                    }
                    last_yield_time = time.time()

                file_hash = get_file_hash(path)
                if file_hash:
                    duplicates[(size, file_hash)].append(path)
                hashed_count += 1

        dup_groups = {k: v for k, v in duplicates.items() if len(v) > 1}
        dup_groups_sorted = sorted(dup_groups.items(), key=lambda x: x[0][0] * (len(x[1])-1), reverse=True)[:20]
        
        for (size, hash_val), paths in dup_groups_sorted:
            wasted_space = size * (len(paths) - 1)
            total_duplicate_space += wasted_space
            real_duplicates.append({
                "size": size,
                "formatted_size": format_size(size),
                "wasted_space": format_size(wasted_space),
                "paths": paths
            })

    sorted_exts = sorted(extension_sizes.items(), key=lambda x: x[1], reverse=True)[:20]
    extensions = [{"ext": ext, "size": size, "formatted_size": format_size(size), "count": extension_counts[ext]} for ext, size in sorted_exts]
    
    zombie_files = sorted(zombie_files, key=lambda x: x["size"], reverse=True)[:30]
    
    heavy_projects = [{"path": p, "size": s, "formatted_size": format_size(s)} for p, s in git_projects.items()]
    heavy_projects = sorted(heavy_projects, key=lambda x: x["size"], reverse=True)[:20]

    final_result = {
        "summary": {
            "file_count": file_count,
            "dir_count": dir_count,
            "total_size": format_size(total_size),
            "target_dir": target_dir
        },
        "largest_files": largest_files,
        "extensions": extensions,
        "zombies": zombie_files,
        "treemap": treemap_data,
        "empty_dirs": empty_dirs[:20],
        "heavy_projects": heavy_projects,
        "game_mods": {
            "count": game_mods_count,
            "size": format_size(game_mods_size),
            "paths": list(game_mods_paths)[:20]
        },
        "duplicates": {
            "total_wasted": format_size(total_duplicate_space),
            "groups": real_duplicates,
            "partial": duplicates_partial
        },
        "errors": {
            "count": len(errors),
            "items": errors[:50]
        }
    }

    yield {"type": "result", "data": final_result}

def run_npm_cleanup_stream(target_dir):
    yield {"type": "progress", "message": f"Starting node_modules scan in {target_dir}..."}
    
    total_freed = 0
    dirs_deleted = 0
    stack = [target_dir]
    errors = []

    last_yield_time = time.time()

    while stack:
        current_dir = stack.pop()

        if time.time() - last_yield_time > 0.5:
            yield {
                "type": "progress",
                "message": f"Searching in: {current_dir}",
                "freed": format_size(total_freed)
            }
            last_yield_time = time.time()

        try:
            with os.scandir(current_dir) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if _is_reparse_point(entry):
                                continue
                            if entry.name.lower() == 'node_modules':
                                if _is_forbidden_path(entry.path):
                                    yield {"type": "progress", "message": f"Skipped (protected path): {entry.path}", "freed": format_size(total_freed)}
                                    continue
                                yield {"type": "progress", "message": f"Calculating size and destroying: {entry.path}", "freed": format_size(total_freed)}
                                
                                dir_size = 0
                                for root, dirs, files in os.walk(entry.path):
                                    for f in files:
                                        try:
                                            dir_size += os.path.getsize(os.path.join(root, f))
                                        except:
                                            pass
                                
                                try:
                                    shutil.rmtree(entry.path)
                                    total_freed += dir_size
                                    dirs_deleted += 1
                                    
                                    yield {"type": "progress", "message": f"Destroyed: {entry.path} ({format_size(dir_size)})", "freed": format_size(total_freed)}
                                except Exception as e:
                                    yield {"type": "progress", "message": f"Error deleting {entry.path}: {str(e)}", "freed": format_size(total_freed)}
                            else:
                                stack.append(entry.path)
                    except PermissionError:
                        errors.append({"path": entry.path, "reason": "permission_denied"})
                    except OSError as e:
                        errors.append({"path": entry.path, "reason": str(e)})
        except PermissionError:
            errors.append({"path": current_dir, "reason": "permission_denied"})
        except OSError as e:
            errors.append({"path": current_dir, "reason": str(e)})

    yield {
        "type": "result",
        "data": {
            "dirs_deleted": dirs_deleted,
            "total_freed": format_size(total_freed),
            "errors": {"count": len(errors), "items": errors[:50]}
        }
    }

def run_venv_cleanup_stream(target_dir):
    yield {"type": "progress", "message": f"Starting Python virtual environment scan in {target_dir}..."}
    
    total_freed = 0
    dirs_deleted = 0
    stack = [target_dir]
    errors = []

    last_yield_time = time.time()

    venv_names = {'venv', '.venv', 'env', '.env'}

    while stack:
        current_dir = stack.pop()

        if time.time() - last_yield_time > 0.5:
            yield {
                "type": "progress",
                "message": f"Searching in: {current_dir}",
                "freed": format_size(total_freed)
            }
            last_yield_time = time.time()

        try:
            with os.scandir(current_dir) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if _is_reparse_point(entry):
                                continue
                            if entry.name.lower() in venv_names:
                                # Check if it's a real venv (contains Scripts/python.exe or bin/python)
                                is_venv = False
                                for py_path in [os.path.join(entry.path, 'Scripts', 'python.exe'), os.path.join(entry.path, 'bin', 'python')]:
                                    if os.path.exists(py_path):
                                        is_venv = True
                                        break
                                
                                if is_venv and _is_forbidden_path(entry.path):
                                    yield {"type": "progress", "message": f"Skipped (protected path): {entry.path}", "freed": format_size(total_freed)}
                                elif is_venv:
                                    yield {"type": "progress", "message": f"Calculating size and destroying venv: {entry.path}", "freed": format_size(total_freed)}

                                    dir_size = 0
                                    for root, dirs, files in os.walk(entry.path):
                                        for f in files:
                                            try:
                                                dir_size += os.path.getsize(os.path.join(root, f))
                                            except:
                                                pass

                                    try:
                                        shutil.rmtree(entry.path)
                                        total_freed += dir_size
                                        dirs_deleted += 1

                                        yield {"type": "progress", "message": f"Destroyed venv: {entry.path} ({format_size(dir_size)})", "freed": format_size(total_freed)}
                                    except Exception as e:
                                        yield {"type": "progress", "message": f"Error deleting {entry.path}: {str(e)}", "freed": format_size(total_freed)}
                                else:
                                    stack.append(entry.path)
                            else:
                                stack.append(entry.path)
                    except PermissionError:
                        errors.append({"path": entry.path, "reason": "permission_denied"})
                    except OSError as e:
                        errors.append({"path": entry.path, "reason": str(e)})
        except PermissionError:
            errors.append({"path": current_dir, "reason": "permission_denied"})
        except OSError as e:
            errors.append({"path": current_dir, "reason": str(e)})

    yield {
        "type": "result",
        "data": {
            "dirs_deleted": dirs_deleted,
            "total_freed": format_size(total_freed),
            "errors": {"count": len(errors), "items": errors[:50]}
        }
    }
