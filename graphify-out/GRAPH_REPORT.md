# Graph Report - .  (2026-09-08)

## Corpus Check
- Corpus is ~7,684 words - fits in a single context window. You may not need a graph.

## Summary
- 86 nodes · 95 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.88)
- Token cost: 48,268 input · 0 output

## Community Hubs (Navigation)
- Cleanup Tools UI Cards
- Scan Results & Visualization UI
- Core Architecture & Tech Stack
- Frontend JS Logic (app.js)
- Scan & Cleanup Backend Logic
- Python Dependencies

## God Nodes (most connected - your core abstractions)
1. `1-Click Smart Cleanup Tools Tab` - 17 edges
2. `templates/index.html (Web Disk Scanner UI)` - 15 edges
3. `format_size()` - 4 edges
4. `run_scan_stream()` - 4 edges
5. `renderResults()` - 4 edges
6. `DiskScanner Turbo` - 4 edges
7. `run_npm_cleanup_stream()` - 3 edges
8. `run_venv_cleanup_stream()` - 3 edges
9. `get_file_hash()` - 2 edges
10. `attachDrillDownListeners()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `PyInstaller Executable Build` --references--> `templates/index.html (Web Disk Scanner UI)`  [INFERRED]
  README.md → templates/index.html
- `templates/index.html (Web Disk Scanner UI)` --conceptually_related_to--> `Glassmorphism Premium Design`  [INFERRED]
  templates/index.html → README.md
- `Ignore Folders Input` --conceptually_related_to--> `Turbo Engine (os.scandir Scanning)`  [INFERRED]
  templates/index.html → README.md
- `static/app.js` --conceptually_related_to--> `Real-Time Feedback via Server-Sent Events`  [INFERRED]
  templates/index.html → README.md
- `node_modules Destroyer UI (btnCleanNpm)` --conceptually_related_to--> `node_modules Destroyer`  [INFERRED]
  templates/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **DiskScanner Turbo Key Features** — readme_diskscanner_turbo, readme_turbo_engine, readme_sse_realtime_feedback, readme_node_modules_destroyer, readme_gradle_cache_cleaner, readme_game_store_radar, readme_zombie_file_hunter, readme_report_export, readme_glassmorphism_design [EXTRACTED 1.00]
- **1-Click Developer Cache Cleaners** — templates_index_node_modules_destroyer_ui, templates_index_venv_destroyer, templates_index_cargo_nuget_cache, templates_index_docker_system_prune, templates_index_gradle_cache_ui, templates_index_xcode_derived_data [EXTRACTED 1.00]
- **General System Cleanup Tools** — templates_index_app_temp_files, templates_index_organize_downloads, templates_index_messaging_cache, templates_index_windows_update_cleanup, templates_index_browser_cache_cleaner, templates_index_empty_folder_nuke, templates_index_onedrive_freeup, templates_index_windows_debloater [EXTRACTED 1.00]

## Communities (9 total, 1 thin omitted)

### Community 1 - "Cleanup Tools UI Cards"
Cohesion: 0.11
Nodes (19): Gradle Cache Cleaner, node_modules Destroyer, App Temp Files Cleaner UI (btnCleanTemp), Backup Game Saves UI (btnBackupSaves), Browser Cache Cleaner UI (btnCleanBrowsers), Cargo / NuGet Cache Cleaner UI (btnCleanDevCaches), Docker System Prune UI (btnCleanDocker), Empty Folder Nuke UI (btnNukeFolders) (+11 more)

### Community 2 - "Scan Results & Visualization UI"
Cohesion: 0.13
Nodes (16): Game Store Radar, Glassmorphism Premium Design, Report Export (.txt), Real-Time Feedback via Server-Sent Events, Zombie File Hunter, File Action Modal (Move/Freeze/Delete), Export TXT Button (btnExportTxt), Find Duplicates (MD5) Checkbox (+8 more)

### Community 3 - "Core Architecture & Tech Stack"
Cohesion: 0.20
Nodes (10): Apache ECharts (Interactive Treemap), app.py, DiskScanner Turbo, Flask Backend, main.py, PyInstaller Executable Build, PyWebView Desktop Wrapper, Turbo Engine (os.scandir Scanning) (+2 more)

### Community 4 - "Frontend JS Logic (app.js)"
Cohesion: 0.48
Nodes (6): attachDrillDownListeners(), attachInteractListeners(), bindPostEndpoint(), renderResults(), renderTreemap(), triggerConfetti()

### Community 5 - "Scan & Cleanup Backend Logic"
Cohesion: 0.60
Nodes (5): format_size(), get_file_hash(), run_npm_cleanup_stream(), run_scan_stream(), run_venv_cleanup_stream()

## Knowledge Gaps
- **26 isolated node(s):** `node_modules Destroyer`, `Gradle Cache Cleaner`, `Game Store Radar`, `Zombie File Hunter`, `Report Export (.txt)` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `templates/index.html (Web Disk Scanner UI)` connect `Scan Results & Visualization UI` to `Cleanup Tools UI Cards`, `Core Architecture & Tech Stack`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `1-Click Smart Cleanup Tools Tab` connect `Cleanup Tools UI Cards` to `Scan Results & Visualization UI`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `templates/index.html (Web Disk Scanner UI)` (e.g. with `PyInstaller Executable Build` and `Glassmorphism Premium Design`) actually correct?**
  _`templates/index.html (Web Disk Scanner UI)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Real-Time Feedback via Server-Sent Events`, `node_modules Destroyer`, `Gradle Cache Cleaner` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Flask Cleanup Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Cleanup Tools UI Cards` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `Scan Results & Visualization UI` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._