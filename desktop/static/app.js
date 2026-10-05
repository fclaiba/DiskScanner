// ================================================================
// LOCAL API ACCESS - every call to the embedded Flask server must carry the
// per-launch token injected into index.html (see app.py _guard_request).
// Requests send it as X-DS-Token, EventSource (no custom headers) as ?t=.
// A 403 pro_required from any gated route opens the upgrade modal.
// ================================================================
const DS_TOKEN = (document.querySelector('meta[name="ds-token"]') || {}).content || '';

class ProRequiredError extends Error {}

function withToken(url) {
    return url + (url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(DS_TOKEN);
}

async function apiFetch(url, options) {
    options = options || {};
    const headers = new Headers(options.headers || {});
    headers.set('X-DS-Token', DS_TOKEN);
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (res.status === 403) {
        const body = await res.clone().json().catch(() => null);
        if (body && body.error && body.error.code === 'pro_required') {
            window.dispatchEvent(new CustomEvent('ds:pro-required'));
            throw new ProRequiredError(body.error.message || 'Pro required');
        }
    }
    return res;
}

function apiEventSource(url) {
    return new EventSource(withToken(url));
}

function isProRequired(err) {
    return err instanceof ProRequiredError;
}

// Route errors are plain strings, account/gate errors use {code, message}.
function errorText(err) {
    if (err && typeof err === 'object') return err.message || err.code || 'Unknown error';
    return err || 'Unknown error';
}

document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scanBtn');
    const targetDir = document.getElementById('targetDir');
    const loader = document.getElementById('loader');
    const results = document.getElementById('results');
    
    // Check OS
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isWin = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
    if(isMac) {
        const xcodeCard = document.getElementById('xcodeCard');
        if(xcodeCard) xcodeCard.classList.remove('hidden');
    }
    if(isWin) {
        const winUpdateCard = document.getElementById('winUpdateCard');
        if(winUpdateCard) winUpdateCard.classList.remove('hidden');
        const oneDriveCard = document.getElementById('oneDriveCard');
        if(oneDriveCard) oneDriveCard.classList.remove('hidden');
        const debloatCard = document.getElementById('debloatCard');
        if(debloatCard) debloatCard.classList.remove('hidden');
        
        // Fetch Disk Health
        apiFetch('/api/sys/disk_health')
            .then(r => r.json())
            .then(d => {
                if(d.success && d.health !== "Unknown") {
                    const hCard = document.getElementById('health-card');
                    const hIcon = document.getElementById('health-icon');
                    const hText = document.getElementById('sys-health');
                    
                    if(d.health === "OK") {
                        hCard.style.borderColor = "#10b981";
                        hIcon.style.color = "#10b981";
                        hText.innerText = "Healthy";
                    } else {
                        hCard.style.borderColor = "#ef4444";
                        hIcon.style.color = "#ef4444";
                        hText.innerText = "Critical";
                        hText.style.color = "#ef4444";
                        alert("WARNING: S.M.A.R.T. indicates a disk might be failing. Backup immediately.");
                    }
                }
            })
            .catch(e => console.log("Could not fetch disk health"));
    }
    
    // Modals
    const actionModal = document.getElementById('actionModal');
    const cancelActionBtn = document.getElementById('cancelActionBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    const confirmFreezeBtn = document.getElementById('confirmFreezeBtn');
    const actionFilePath = document.getElementById('actionFilePath');
    const moveSection = document.getElementById('moveSection');
    const moveDestPath = document.getElementById('moveDestPath');
    
    let fileToActOn = null;
    let elementToRemove = null;
    window.lastScanData = null;

    // Tabs logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
            
            // Resize Echarts instance if treemap tab is opened
            if(btn.dataset.target === 'tab-treemap' && window.treemapChart) {
                window.treemapChart.resize();
            }
        });
    });

    // Keep the treemap responsive while the OS window is live-resized (presentation-only addition)
    window.addEventListener('resize', () => {
        if (window.treemapChart) window.treemapChart.resize();
    });

    // ---- Navigation state: history stack + root, so drilling into a folder
    // (macro rows, Projects, Games & Mods, treemap clicks, breadcrumb) can
    // always be undone. Previously every drill-down was a one-way re-scan
    // with no way back.
    let navHistory = [];
    let navRoot = null;

    function runScan(path, findDupsOverride) {
        targetDir.value = path;
        updateNavButtons();

        results.classList.add('hidden');
        loader.classList.remove('hidden');
        scanBtn.disabled = true;

        const ignoreDirs = document.getElementById('ignoreDirs').value.trim();
        const findDups = (findDupsOverride !== undefined) ? findDupsOverride : document.getElementById('findDups').checked;

        const progressText = document.getElementById('progress-text');
        const progressFiles = document.getElementById('progress-files');
        const macroList = document.getElementById('macro-list');

        progressText.innerText = "Connecting...";
        progressFiles.innerText = "0 files scanned";
        macroList.innerHTML = '';

        const params = new URLSearchParams({
            target_dir: path,
            ignore_dirs: ignoreDirs,
            find_dups: findDups
        });

        const eventSource = apiEventSource(`/api/scan?${params.toString()}`);

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);

            if (data.type === "progress") {
                progressText.innerText = data.message;
                if (data.files_scanned !== undefined) {
                    progressFiles.innerText = `${data.files_scanned} files scanned`;
                }

                // Update Macro bars
                if (data.macro && data.macro.length > 0) {
                    let html = '';
                    // Find max size to calculate percentage width
                    const maxSize = data.macro[0].size;
                    data.macro.forEach(m => {
                        const pct = maxSize > 0 ? (m.size / maxSize) * 100 : 0;
                        html += `
                            <div style="margin-bottom:8px;">
                                <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#cbd5e1; margin-bottom:2px;">
                                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;" class="drill-down" data-path="${m.path.replace(/\\/g, '\\\\')}">${m.path}</span>
                                    <span>${m.formatted_size}</span>
                                </div>
                                <div style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden;">
                                    <div style="background:var(--accent-color); height:100%; width:${pct}%; transition:width 0.3s;"></div>
                                </div>
                            </div>
                        `;
                    });
                    macroList.innerHTML = html;
                    attachDrillDownListeners(macroList);
                }
            } else if (data.type === "result") {
                eventSource.close();
                window.lastScanData = data.data;
                renderResults(data.data);
                renderBreadcrumb(data.data.summary.target_dir);
                loader.classList.add('hidden');
                results.classList.remove('hidden');
                scanBtn.disabled = false;
            } else if (data.type === "error") {
                eventSource.close();
                alert("Error: " + data.message);
                loader.classList.add('hidden');
                scanBtn.disabled = false;
            }
        };

        eventSource.onerror = function() {
            eventSource.close();
            alert("Connection error with the scanning server.");
            loader.classList.add('hidden');
            scanBtn.disabled = false;
        };
    }

    // Central navigation entry point. Every way of "entering a folder" (drill-down
    // rows, treemap clicks, breadcrumb, back/up/home) goes through this so history
    // stays consistent. `fast: true` skips MD5 duplicate hashing for a snappier
    // drill-in - the explicit Scan button still respects the checkbox as-is.
    function navigateTo(path, opts) {
        opts = opts || {};
        if (!path || path === 'undefined') return;

        if (opts.resetHistory) {
            navHistory = [];
            navRoot = path;
        } else {
            if (navRoot === null) navRoot = path;
            if (opts.pushHistory !== false && targetDir.value && targetDir.value !== path) {
                navHistory.push(targetDir.value);
            }
        }

        runScan(path, opts.fast ? false : undefined);
    }

    function navBack() {
        if (navHistory.length === 0) return;
        const prev = navHistory.pop();
        navigateTo(prev, { pushHistory: false, fast: true });
    }

    function navUp() {
        const parent = parentPath(targetDir.value);
        if (parent) navigateTo(parent, { fast: true });
    }

    function navHomeTo() {
        if (navRoot) navigateTo(navRoot, { fast: true });
    }

    // Splits a Windows or POSIX path and returns its parent, or null at the root.
    function parentPath(p) {
        if (!p) return null;
        let path = p.replace(/[\\/]+$/, '');
        if (/^[A-Za-z]:$/.test(path)) return null;
        const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
        if (idx <= 0) return null;
        let parent = path.substring(0, idx);
        if (/^[A-Za-z]:$/.test(parent)) parent += '\\';
        return parent;
    }

    function updateNavButtons() {
        const backBtn = document.getElementById('navBackBtn');
        const upBtn = document.getElementById('navUpBtn');
        const homeBtn = document.getElementById('navHomeBtn');
        if (backBtn) backBtn.disabled = navHistory.length === 0;
        if (upBtn) upBtn.disabled = !parentPath(targetDir.value);
        if (homeBtn) homeBtn.disabled = !navRoot || navRoot === targetDir.value;
    }

    // Filenames/paths are attacker-controllable on macOS/Linux (Windows
    // disallows <>:"/\|?* in names, but this app also targets darwin/linux
    // per cleanup_engine.py) - anything built from a real filesystem path and
    // dropped into innerHTML must go through this first.
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderBreadcrumb(path) {
        const bar = document.getElementById('navBreadcrumb');
        if (!bar || !path) return;

        const normalized = path.replace(/[\\/]+$/, '');
        const isWinPath = /^[A-Za-z]:\\/.test(normalized);
        let parts, sep;
        if (isWinPath) {
            sep = '\\';
            const drive = normalized.slice(0, 2);
            const rest = normalized.slice(3).split('\\').filter(Boolean);
            parts = [drive + '\\', ...rest];
        } else {
            sep = '/';
            parts = normalized.split('/').filter(Boolean);
            if (normalized.startsWith('/')) parts[0] = '/' + parts[0];
        }

        let acc = '';
        let html = '';
        parts.forEach((part, i) => {
            acc = (i === 0) ? part : (acc.endsWith(sep) ? acc + part : acc + sep + part);
            const label = part.replace(/\\$/, '') || part;
            html += `<span class="crumb" data-path="${escapeHtml(acc.replace(/\\/g, '\\\\'))}">${escapeHtml(label)}</span>`;
            if (i < parts.length - 1) html += `<span class="crumb-sep">&rsaquo;</span>`;
        });
        bar.innerHTML = html;
        bar.querySelectorAll('.crumb').forEach(el => {
            el.addEventListener('click', (e) => navigateTo(e.currentTarget.dataset.path, { fast: true }));
        });
    }

    scanBtn.addEventListener('click', () => {
        const dir = targetDir.value.trim();
        if(!dir) return alert("Please enter a directory");
        navigateTo(dir, { resetHistory: true });
    });

    const navBackBtnEl = document.getElementById('navBackBtn');
    const navUpBtnEl = document.getElementById('navUpBtn');
    const navHomeBtnEl = document.getElementById('navHomeBtn');
    if (navBackBtnEl) navBackBtnEl.addEventListener('click', navBack);
    if (navUpBtnEl) navUpBtnEl.addEventListener('click', navUp);
    if (navHomeBtnEl) navHomeBtnEl.addEventListener('click', navHomeTo);

    function attachDrillDownListeners(container) {
        container.querySelectorAll('.drill-down').forEach(el => {
            el.style.cursor = 'pointer';
            el.style.textDecoration = 'underline';
            el.addEventListener('click', (e) => {
                // currentTarget (not target) - fixes clicking the folder/git icon
                // inside the span sending "undefined" as the path.
                navigateTo(e.currentTarget.dataset.path, { fast: true });
            });
        });
    }

    function renderResults(data) {
        // Summary
        document.getElementById('sum-files').innerText = data.summary.file_count;
        document.getElementById('sum-dirs').innerText = data.summary.dir_count;
        document.getElementById('sum-size').innerText = data.summary.total_size;

        // Largest Files
        const largestList = document.getElementById('largest-list');
        largestList.innerHTML = '';
        data.largest_files.forEach(f => {
            const li = document.createElement('li');
            li.className = 'file-item';
            const escapePath = f.path.replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
            li.innerHTML = `
                <div class="file-info">
                    <span class="file-path" title="${f.path}">${f.path}</span>
                    <span class="file-size">${f.formatted_size}</span>
                </div>
                <button class="action-btn interact-btn" data-path="${escapePath}">Action</button>
            `;
            largestList.appendChild(li);
        });
        
        // Zombies
        const zombiesList = document.getElementById('zombies-list');
        let totalZombiesSize = 0;
        zombiesList.innerHTML = '';
        if(data.zombies && data.zombies.length > 0) {
            data.zombies.forEach(f => {
                totalZombiesSize += f.size;
                const li = document.createElement('li');
                li.className = 'file-item';
                const escapePath = f.path.replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
                li.innerHTML = `
                    <div class="file-info">
                        <span class="file-path" title="${f.path}">${f.path}</span>
                        <span class="file-size">${f.formatted_size}</span>
                    </div>
                    <button class="action-btn interact-btn" data-path="${escapePath}">Action</button>
                `;
                zombiesList.appendChild(li);
            });
            document.getElementById('zombie-badge').innerText = (totalZombiesSize / (1024*1024*1024)).toFixed(2) + " GB";
        } else {
            zombiesList.innerHTML = '<li><p style="color:#94a3b8; padding: 10px;">No giant zombie files found.</p></li>';
        }
        
        // Projects
        const projectsList = document.getElementById('projects-list');
        let totalProjectsSize = 0;
        projectsList.innerHTML = '';
        if(data.heavy_projects && data.heavy_projects.length > 0) {
            data.heavy_projects.forEach(p => {
                totalProjectsSize += p.size;
                const li = document.createElement('li');
                li.className = 'file-item';
                li.innerHTML = `
                    <div class="file-info">
                        <span class="file-path drill-down" data-path="${p.path.replace(/\\/g, '\\\\')}"><i class="fa-brands fa-git-alt"></i> ${p.path}</span>
                        <span class="file-size">${p.formatted_size}</span>
                    </div>
                `;
                projectsList.appendChild(li);
            });
            document.getElementById('projects-badge').innerText = (totalProjectsSize / (1024*1024*1024)).toFixed(2) + " GB";
        } else {
            projectsList.innerHTML = '<li><p style="color:#94a3b8; padding: 10px;">No heavy Git projects found.</p></li>';
        }
        attachDrillDownListeners(projectsList);

        // Duplicates
        const dupList = document.getElementById('duplicates-list');
        document.getElementById('dup-badge').innerText = data.duplicates.total_wasted;
        dupList.innerHTML = '';
        data.duplicates.groups.forEach(group => {
            const div = document.createElement('div');
            div.className = 'duplicate-group';
            let pathsHtml = '';
            group.paths.forEach((p, idx) => {
                const escapePath = p.replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
                pathsHtml += `
                    <li class="file-item" style="border:none; padding:10px 0;">
                        <div class="file-info"><span class="file-path">${p}</span></div>
                        ${idx > 0 ? `<button class="action-btn interact-btn" data-path="${escapePath}">Action</button>` : '<span style="font-size:0.8rem; color:#10b981;">Original (Keep)</span>'}
                    </li>
                `;
            });
            div.innerHTML = `
                <div class="group-header">
                    <span>Size: ${group.formatted_size} each</span>
                    <span class="badge" style="background:var(--danger-color)">Wasted: ${group.wasted_space}</span>
                </div>
                <ul class="file-list">${pathsHtml}</ul>
            `;
            dupList.appendChild(div);
        });

        // Mods
        const modsList = document.getElementById('modsList');
        document.getElementById('modsTotalText').innerText = data.game_mods.size;
        modsList.innerHTML = '';
        if(data.game_mods.paths.length === 0) {
            modsList.innerHTML = '<li><p style="color:#94a3b8; padding: 10px;">No mods or workshop found.</p></li>';
        }
        data.game_mods.paths.forEach(p => {
            const li = document.createElement('li');
            li.className = 'file-item';
            li.innerHTML = `
                <div class="file-info">
                    <span class="file-path drill-down" data-path="${p.replace(/\\/g, '\\\\')}"><i class="fa-solid fa-folder"></i> ${p}</span>
                </div>
            `;
            modsList.appendChild(li);
        });
        attachDrillDownListeners(modsList);

        // Treemap Chart using ECharts
        renderTreemap(data.treemap);

        attachInteractListeners();
    }
    
    function renderTreemap(treemapData) {
        if (!window.treemapChart) {
            window.treemapChart = echarts.init(document.getElementById('treemap-chart'));
        }
        const option = {
            tooltip: {
                formatter: function (info) {
                    var value = info.value;
                    var size = (value / (1024*1024*1024)).toFixed(2) + " GB";
                    return info.name + '<br>' + size;
                }
            },
            series: [{
                type: 'treemap',
                data: [treemapData],
                roam: false,
                nodeClick: false,
                breadcrumb: { show: false },
                itemStyle: {
                    borderColor: '#0f172a'
                },
                levels: [
                    {
                        itemStyle: { borderWidth: 0, gapWidth: 1 }
                    },
                    {
                        colorSaturation: [0.3, 0.6],
                        itemStyle: { gapWidth: 2, borderColorSaturation: 0.6 }
                    }
                ]
            }]
        };
        window.treemapChart.setOption(option);

        // Click a block to drill into that folder - re-registered on every
        // render since setOption doesn't preserve external listeners across
        // full option swaps, and .off() first avoids stacking duplicates.
        window.treemapChart.off('click');
        window.treemapChart.on('click', (params) => {
            if (params.data && params.data.path) {
                navigateTo(params.data.path, { fast: true });
            }
        });
    }

    function attachInteractListeners() {
        document.querySelectorAll('.interact-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                fileToActOn = e.currentTarget.dataset.path;
                elementToRemove = e.currentTarget.closest('.file-item');
                actionFilePath.innerText = fileToActOn;
                
                // Reset move section
                moveSection.classList.add('hidden');
                confirmMoveBtn.innerText = "Move";
                
                actionModal.classList.remove('hidden');
            });
        });
    }

    cancelActionBtn.addEventListener('click', () => {
        actionModal.classList.add('hidden');
        fileToActOn = null;
        elementToRemove = null;
    });
    
    confirmMoveBtn.addEventListener('click', async () => {
        if(moveSection.classList.contains('hidden')) {
            // First click on move shows the input
            moveSection.classList.remove('hidden');
            confirmMoveBtn.innerText = "Confirm Move";
            return;
        }
        
        const dest = moveDestPath.value.trim();
        if(!dest) return alert("Please enter a destination path");
        if(!fileToActOn) return;
        
        try {
            const res = await apiFetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: fileToActOn, destination: dest })
            });
            const data = await res.json();
            
            if(data.success) {
                elementToRemove.remove();
                actionModal.classList.add('hidden');
            } else {
                alert("Error: " + errorText(data.error));
            }
        } catch(e) {
            if (!isProRequired(e)) alert("Error trying to move the file.");
        }
    });

    confirmFreezeBtn.addEventListener('click', async () => {
        if(!fileToActOn) return;
        
        if(!confirm(`Are you sure you want to ZIP compress this item and delete the original?\n\nTarget: ${fileToActOn}`)) return;
        
        confirmFreezeBtn.disabled = true;
        confirmFreezeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Freezing...';
        
        try {
            const res = await apiFetch('/api/action/compress_zombie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: fileToActOn })
            });
            const data = await res.json();
            
            if(data.success) {
                elementToRemove.remove();
                actionModal.classList.add('hidden');
                triggerConfetti();
            } else {
                alert("Error: " + errorText(data.error));
            }
        } catch(e) {
            if (!isProRequired(e)) alert("Error trying to compress the file.");
        } finally {
            confirmFreezeBtn.disabled = false;
            confirmFreezeBtn.innerHTML = '<i class="fa-solid fa-snowflake"></i> Freeze (ZIP)';
        }
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if(!fileToActOn) return;
        
        try {
            const res = await apiFetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: fileToActOn })
            });
            const data = await res.json();
            
            if(data.success) {
                elementToRemove.remove();
                actionModal.classList.add('hidden');
            } else {
                alert("Error: " + errorText(data.error));
                actionModal.classList.add('hidden');
            }
        } catch(e) {
            if (!isProRequired(e)) alert("Error trying to delete the file.");
            actionModal.classList.add('hidden');
        }
    });
    
    // Export TXT logic
    document.getElementById('btnExportTxt').addEventListener('click', () => {
        if(!window.lastScanData) return;
        
        const data = window.lastScanData;
        let txt = `=========================================\n`;
        txt += `DISK SCAN REPORT\n`;
        txt += `Target Path: ${data.summary.target_dir}\n`;
        txt += `Files: ${data.summary.file_count} | Folders: ${data.summary.dir_count}\n`;
        txt += `Total Size: ${data.summary.total_size}\n`;
        txt += `=========================================\n\n`;
        
        txt += `[TOP LARGEST FILES]\n`;
        data.largest_files.forEach(f => {
            txt += `- ${f.formatted_size} : ${f.path}\n`;
        });
        txt += `\n`;
        
        txt += `[ZOMBIE FILES]\n`;
        if(data.zombies.length === 0) txt += `No giant zombie files found.\n`;
        data.zombies.forEach(f => {
            txt += `- ${f.formatted_size} : ${f.path}\n`;
        });
        txt += `\n`;
        
        txt += `[GAME MODS & WORKSHOP]\n`;
        txt += `Total: ${data.game_mods.size}\n`;
        data.game_mods.paths.forEach(p => {
            txt += `- ${p}\n`;
        });
        txt += `\n`;
        
        txt += `[HEAVY PROJECTS]\n`;
        if(!data.heavy_projects || data.heavy_projects.length === 0) txt += `No heavy git projects found.\n`;
        data.heavy_projects?.forEach(p => {
            txt += `- ${p.formatted_size} : ${p.path}\n`;
        });
        txt += `\n`;
        
        txt += `[DUPLICATES DETECTED]\n`;
        txt += `Total Wasted Space: ${data.duplicates.total_wasted}\n`;
        data.duplicates.groups.forEach(g => {
            txt += `--- Group (Size: ${g.formatted_size} each) ---\n`;
            g.paths.forEach(p => txt += `    ${p}\n`);
        });
        txt += `\n`;
        
        txt += `[SUMMARY BY EXTENSION]\n`;
        data.extensions.forEach(e => {
            txt += `- ${e.ext}: ${e.formatted_size} (${e.count} files)\n`;
        });
        
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, "");
        const filename = `Scan_Report_${dateStr}.txt`;

        apiFetch('/api/export/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: txt, filename })
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast(`Report saved: ${res.path}`, 'Show in folder', () => {
                    apiFetch('/api/system/reveal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: res.path })
                    });
                });
            } else {
                alert(`Could not save the report: ${res.error || 'unknown error'}`);
            }
        })
        .catch(() => alert('Could not save the report - is the app running correctly?'));
    });

    // Lightweight toast with an optional action button (used by the export flow above)
    function showToast(message, actionLabel, onAction) {
        const existing = document.getElementById('appToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = `
            <span class="toast__message"></span>
            ${actionLabel ? `<button class="btn secondary-btn toast__action">${escapeHtml(actionLabel)}</button>` : ''}
            <button class="toast__close" aria-label="Close">&times;</button>
        `;
        // textContent: messages can contain file paths (attacker-controllable names).
        toast.querySelector('.toast__message').textContent = message;
        document.body.appendChild(toast);

        const dismiss = () => toast.remove();
        toast.querySelector('.toast__close').addEventListener('click', dismiss);
        if (actionLabel && onAction) {
            toast.querySelector('.toast__action').addEventListener('click', () => { onAction(); dismiss(); });
        }
        setTimeout(dismiss, 8000);
    }
    
    // Tools logic
    document.getElementById('btnCleanTemp').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.innerText = "Cleaning...";
        try {
            const res = await apiFetch('/api/cleanup/temp', { method: 'POST' });
            const data = await res.json();
            alert(data.success ? data.message : "Error: " + errorText(data.error));
        } catch(e) {
            if (!isProRequired(e)) alert("Error executing cleanup");
        }
        btn.disabled = false;
        btn.innerText = "Clean %TEMP%";
    });

    // NPM Destroyer logic
    const btnCleanNpm = document.getElementById('btnCleanNpm');
    const npmProgressArea = document.getElementById('npmProgressArea');
    const npmFreedText = document.getElementById('npmFreedText');
    const npmLogText = document.getElementById('npmLogText');
    
    btnCleanNpm.addEventListener('click', () => {
        const dir = targetDir.value.trim();
        if(!dir) return alert("Please enter a target directory above");
        
        if(!confirm(`Are you sure you want to find and permanently DESTROY all node_modules inside ${dir}? This action cannot be undone.`)) {
            return;
        }

        btnCleanNpm.disabled = true;
        npmProgressArea.classList.remove('hidden');
        npmLogText.innerText = "Connecting...";
        if (npmFreedText) npmFreedText.innerText = "0 GB";
        
        const eventSource = apiEventSource(`/api/cleanup/npm_stream?target_dir=${encodeURIComponent(dir)}`);
        
        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            if (data.type === "progress") {
                npmLogText.innerText = data.message;
                if(data.freed && npmFreedText) npmFreedText.innerText = data.freed;
            } else if (data.type === "result") {
                eventSource.close();
                npmLogText.innerText = `Cleanup Finished. Deleted ${data.data.dirs_deleted} folders.`;
                npmLogText.style.color = '#10b981';
                btnCleanNpm.disabled = false;
                
                if (data.data.dirs_deleted > 0) {
                    triggerConfetti();
                }
            } else if (data.type === "error") {
                eventSource.close();
                alert("Error: " + data.message);
                btnCleanNpm.disabled = false;
            }
        };
        
        eventSource.onerror = function() {
            eventSource.close();
            btnCleanNpm.disabled = false;
            handleGatedStreamError("Connection error with server.");
        };
    });
    
    // Venv Destroyer logic
    const btnCleanVenv = document.getElementById('btnCleanVenv');
    const venvProgressArea = document.getElementById('venvProgressArea');
    const venvLogText = document.getElementById('venvLogText');
    
    if (btnCleanVenv) {
        btnCleanVenv.addEventListener('click', () => {
            const dir = targetDir.value.trim();
            if(!dir) return alert("Please enter a target directory above");
            
            if(!confirm(`Are you sure you want to find and permanently DESTROY all Python Virtual Environments (venv, .venv, env, .env) inside ${dir}?`)) {
                return;
            }

            btnCleanVenv.disabled = true;
            venvProgressArea.classList.remove('hidden');
            venvLogText.innerText = "Connecting...";
            
            const eventSource = apiEventSource(`/api/cleanup/venv_stream?target_dir=${encodeURIComponent(dir)}`);
            
            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                
                if (data.type === "progress") {
                    venvLogText.innerText = data.message;
                } else if (data.type === "result") {
                    eventSource.close();
                    venvLogText.innerText = `Cleanup Finished. Deleted ${data.data.dirs_deleted} venvs. Freed ${data.data.total_freed}.`;
                    venvLogText.style.color = '#10b981';
                    btnCleanVenv.disabled = false;
                    
                    if (data.data.dirs_deleted > 0) {
                        triggerConfetti();
                    }
                } else if (data.type === "error") {
                    eventSource.close();
                    alert("Error: " + data.message);
                    btnCleanVenv.disabled = false;
                }
            };
            
            eventSource.onerror = function() {
                eventSource.close();
                btnCleanVenv.disabled = false;
                handleGatedStreamError("Connection error with server.");
            };
        });
    }

    // Generic post endpoint helper
    async function bindPostEndpoint(btnId, endpoint, confirmMessage, originalText, loadingText) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', async (e) => {
            if(confirmMessage && !confirm(confirmMessage)) return;
            
            btn.disabled = true;
            btn.innerHTML = loadingText;
            
            try {
                const response = await apiFetch(endpoint, { method: 'POST' });
                const data = await response.json();
                if(data.success) {
                    alert("Success: " + data.message);
                    triggerConfetti();
                } else {
                    alert("Error: " + errorText(data.error));
                }
            } catch (err) {
                if (!isProRequired(err)) alert("Network error: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }
    
    // Bind all the new simple endpoints
    bindPostEndpoint('btnCleanDevCaches', '/api/cleanup/devcaches', 'Are you sure you want to clean Cargo and NuGet caches? This will free a lot of space, but packages will be redownloaded upon next compilation.', 'Clean Caches', 'Cleaning...');
    bindPostEndpoint('btnBackupSaves', '/api/backup/gamesaves', null, 'Backup to .zip', 'Zipping...');
    bindPostEndpoint('btnCleanShaders', '/api/cleanup/shaders', 'Are you sure you want to clean GPU Shader Caches (NVIDIA/AMD)? This can fix stuttering in some games.', 'Clear Shaders', 'Clearing...');
    bindPostEndpoint('btnOrganizeDownloads', '/api/organize/downloads', 'This will automatically move all files in your Downloads folder into subfolders (Images, Installers, etc). Proceed?', 'Magic Organize', 'Organizing...');
    bindPostEndpoint('btnCleanMessaging', '/api/cleanup/messaging', 'Are you sure you want to purge media caches from Discord and Telegram? Your chats will remain intact, but old images/videos might need to be redownloaded.', 'Purge Media', 'Purging...');
    bindPostEndpoint('btnCleanWindows', '/api/cleanup/windows_update', 'This will launch Windows Disk Cleanup in the background to purge Windows Update files and old system data. It may take a few minutes.', 'Run Cleanmgr', 'Launching...');
    
    bindPostEndpoint('btnCleanBrowsers', '/api/cleanup/browsers', 'Are you sure you want to clean heavy media caches from Chrome, Edge, Brave and Firefox? Your passwords and history will NOT be deleted.', 'Clean Browsers', 'Cleaning...');
    
    // Nuke Folders needs targetDir
    const btnNukeFolders = document.getElementById('btnNukeFolders');
    if(btnNukeFolders) {
        btnNukeFolders.addEventListener('click', async (e) => {
            const dir = targetDir.value.trim();
            if(!dir) return alert("Please enter a target directory above to scan for empty folders.");
            if(!confirm(`Are you sure you want to obliterate all empty folders inside ${dir}?`)) return;
            
            btnNukeFolders.disabled = true;
            btnNukeFolders.innerText = "Nuking...";
            try {
                const response = await apiFetch('/api/cleanup/empty_folders', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_dir: dir })
                });
                const data = await response.json();
                if(data.success) {
                    alert("Success: " + data.message);
                    triggerConfetti();
                } else alert("Error: " + errorText(data.error));
            } catch(e) { if (!isProRequired(e)) alert("Error"); }
            btnNukeFolders.disabled = false;
            btnNukeFolders.innerText = "Nuke Empty";
        });
    }

    bindPostEndpoint('btnCleanOneDrive', '/api/cleanup/onedrive', 'This will force Windows to upload all files to the cloud and remove them from your physical disk. Are you sure?', 'Free up Cloud', 'Working...');
    bindPostEndpoint('btnDebloat', '/api/sys/debloat', 'WARNING: This will run PowerShell scripts to forcibly uninstall Candy Crush, Xbox Game Bar, and other OEM bloatware. Proceed?', 'Nuke Bloatware', 'Nuking...');
    
    // Gradle Cache Destroyer
    document.getElementById('btnCleanGradle').addEventListener('click', async (e) => {
        const btn = e.target;
        if(!confirm('Are you sure you want to delete the Gradle cache? It will be downloaded again when you compile an Android project, but this can free up Gigabytes right now.')) return;
        
        btn.disabled = true;
        btn.innerText = "Cleaning...";
        
        try {
            const response = await apiFetch('/api/cleanup/gradle', { method: 'POST' });
            const data = await response.json();
            if(data.success) {
                alert("Success: " + data.message);
                triggerConfetti();
            } else {
                alert("Error: " + errorText(data.error));
            }
        } catch (err) {
            if (!isProRequired(err)) alert("Network error: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Clean Gradle";
        }
    });

    // Docker Cache Destroyer
    const btnCleanDocker = document.getElementById('btnCleanDocker');
    if (btnCleanDocker) {
        btnCleanDocker.addEventListener('click', async (e) => {
            if(!confirm('Are you sure you want to run `docker system prune -a --volumes`? This will stop all unused containers and remove all unused images and volumes.')) return;
            
            const btn = e.target;
            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = "Purging...";
            
            try {
                const response = await apiFetch('/api/cleanup/docker', { method: 'POST' });
                const data = await response.json();
                if(data.success) {
                    alert("Success: " + data.message);
                    triggerConfetti();
                } else {
                    alert("Error: " + errorText(data.error));
                }
            } catch (err) {
                if (!isProRequired(err)) alert("Network error: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // Xcode Cache Destroyer
    const btnCleanXcode = document.getElementById('btnCleanXcode');
    if (btnCleanXcode) {
        btnCleanXcode.addEventListener('click', async (e) => {
            if(!confirm('Are you sure you want to delete Xcode DerivedData? It will be regenerated when you compile an iOS project, but this can free up Gigabytes right now.')) return;
            
            const btn = e.target;
            btn.disabled = true;
            btn.innerText = "Cleaning...";
            
            try {
                const response = await apiFetch('/api/cleanup/xcode', { method: 'POST' });
                const data = await response.json();
                if(data.success) {
                    alert("Success: " + data.message);
                    triggerConfetti();
                } else {
                    alert("Error: " + errorText(data.error));
                }
            } catch (err) {
                if (!isProRequired(err)) alert("Network error: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Clean Xcode";
            }
        });
    }

    // Confetti Helper
    function triggerConfetti() {
        if(typeof confetti === 'function') {
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };
            
            const interval = setInterval(function() {
                const timeLeft = animationEnd - Date.now();
                
                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }
                
                const particleCount = 50 * (timeLeft / duration);
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
            }, 250);
        }
    }

    // ================================================================
    // SMART CLEANUP - primary screen. Consolidates the known-safe-location
    // sweep + a target-directory classification pass into grouped cards with
    // a master "free up space" action. See cleanup_engine.py for the backend.
    // ================================================================

    const modeCleanupBtn = document.getElementById('modeCleanupBtn');
    const modeExplorerBtn = document.getElementById('modeExplorerBtn');
    const cleanupScreen = document.getElementById('cleanupScreen');
    const explorerScreen = document.getElementById('explorerScreen');
    const cleanupFooter = document.getElementById('cleanupFooter');

    function setMode(mode) {
        const isCleanup = mode === 'cleanup';
        cleanupScreen.classList.toggle('hidden', !isCleanup);
        cleanupFooter.classList.toggle('hidden', !isCleanup || !window.cleanupGroupsById || Object.keys(window.cleanupGroupsById).length === 0);
        explorerScreen.classList.toggle('hidden', isCleanup);
        modeCleanupBtn.classList.toggle('active', isCleanup);
        modeExplorerBtn.classList.toggle('active', !isCleanup);

        // The treemap can only measure a visible container - if it was built
        // while Explorer was hidden (or vice versa), force a re-measure now.
        if (!isCleanup && window.treemapChart) {
            setTimeout(() => window.treemapChart.resize(), 0);
        }
    }
    if (modeCleanupBtn) modeCleanupBtn.addEventListener('click', () => setMode('cleanup'));
    if (modeExplorerBtn) modeExplorerBtn.addEventListener('click', () => setMode('explorer'));

    window.cleanupGroupsById = {};

    const GROUP_SECTION_LABELS = {
        caches: 'System Caches',
        development: 'Developer Clutter',
        user_files: 'Your Files (review before deleting)'
    };

    const analyzeBtn = document.getElementById('analyzeBtn');
    const cleanupTargetDir = document.getElementById('cleanupTargetDir');
    const cleanupLoader = document.getElementById('cleanupLoader');
    const cleanupResults = document.getElementById('cleanupResults');
    const cleanupGroupsEl = document.getElementById('cleanupGroups');
    const cleanupEmptyState = document.getElementById('cleanupEmptyState');
    const cleanupProgressText = document.getElementById('cleanupProgressText');
    const cleanupProgressFound = document.getElementById('cleanupProgressFound');

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            const dir = (cleanupTargetDir.value || '').trim();

            cleanupResults.classList.add('hidden');
            cleanupFooter.classList.add('hidden');
            cleanupLoader.classList.remove('hidden');
            analyzeBtn.disabled = true;
            window.cleanupGroupsById = {};

            cleanupProgressText.innerText = 'Connecting...';
            cleanupProgressFound.innerText = '0 B found';

            const params = new URLSearchParams({ target_dir: dir });
            const es = apiEventSource(`/api/analyze_stream?${params.toString()}`);

            es.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'progress') {
                    cleanupProgressText.innerText = msg.message;
                    if (msg.found !== undefined) cleanupProgressFound.innerText = `${msg.found} found so far`;
                } else if (msg.type === 'result') {
                    es.close();
                    renderCleanupGroups(msg.data);
                    cleanupLoader.classList.add('hidden');
                    cleanupResults.classList.remove('hidden');
                    analyzeBtn.disabled = false;
                } else if (msg.type === 'error') {
                    es.close();
                    alert('Error: ' + msg.message);
                    cleanupLoader.classList.add('hidden');
                    analyzeBtn.disabled = false;
                }
            };
            es.onerror = () => {
                es.close();
                alert('Connection error while analyzing.');
                cleanupLoader.classList.add('hidden');
                analyzeBtn.disabled = false;
            };
        });
    }

    function renderCleanupGroups(data) {
        const groups = data.groups || [];
        window.cleanupGroupsById = {};
        groups.forEach(g => { window.cleanupGroupsById[g.id] = g; });

        cleanupGroupsEl.innerHTML = '';

        if (groups.length === 0) {
            cleanupEmptyState.classList.remove('hidden');
            cleanupFooter.classList.add('hidden');
            return;
        }
        cleanupEmptyState.classList.add('hidden');

        const bySection = {};
        groups.forEach(g => {
            const key = g.group || 'other';
            if (!bySection[key]) bySection[key] = [];
            bySection[key].push(g);
        });

        Object.keys(bySection).forEach(sectionKey => {
            const section = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'cleanup-group-section__title';
            title.innerText = GROUP_SECTION_LABELS[sectionKey] || sectionKey;
            section.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'cleanup-group-grid';

            bySection[sectionKey].forEach(g => {
                grid.appendChild(buildCleanupGroupCard(g));
            });

            section.appendChild(grid);
            cleanupGroupsEl.appendChild(section);
        });

        updateCleanupFooter();
    }

    function buildCleanupGroupCard(g) {
        const card = document.createElement('div');
        card.className = 'cleanup-group-card';
        card.dataset.groupId = g.id;

        const itemsPreview = g.items.slice(0, 8).map(i =>
            `<div title="${escapeHtml(i.path)}">${escapeHtml(i.path)}</div>`
        ).join('');
        const moreCount = g.item_count > 8 ? `<div>+ ${g.item_count - 8} more...</div>` : '';
        // total_bytes/item_count only ever cover what's actually in `items`
        // (see cleanup_engine.py's make_group) - if the backend found more
        // than the 200-item cap, say so explicitly rather than let the size
        // shown here silently be less than what's really on disk.
        const truncatedNote = g.truncated
            ? `<div class="cleanup-group-card__meta">+ ${g.full_item_count - g.item_count} more not shown (${formatBytesClient(g.full_total_bytes - g.total_bytes)} more) - re-analyze after this to include them</div>`
            : '';

        card.innerHTML = `
            <div class="cleanup-group-card__header">
                <input type="checkbox" class="cleanup-group-card__checkbox" ${g.selected_by_default ? 'checked' : ''}>
                <i class="${g.icon} cleanup-group-card__icon"></i>
                <div class="cleanup-group-card__title">
                    <h3>${g.label}</h3>
                    <div class="cleanup-group-card__meta">${g.item_count} item${g.item_count === 1 ? '' : 's'}</div>
                    ${truncatedNote}
                </div>
            </div>
            <span class="safety-badge safety-badge--${g.safety}">${g.safety === 'safe' ? 'Safe to remove' : 'Review first'}</span>
            <div class="cleanup-group-card__size">${g.formatted_size}</div>
            <div class="cleanup-group-card__items">${itemsPreview}${moreCount}</div>
            <button class="btn secondary-btn cleanup-group-card__delete-one" data-pro><i class="fa-solid fa-broom"></i> Clean this group</button>
        `;

        card.querySelector('.cleanup-group-card__checkbox').addEventListener('change', updateCleanupFooter);
        card.querySelector('.cleanup-group-card__delete-one').addEventListener('click', () => {
            openCleanupConfirm([g.id]);
        });

        return card;
    }

    function updateCleanupFooter() {
        let totalBytes = 0;
        let count = 0;
        document.querySelectorAll('.cleanup-group-card').forEach(card => {
            const checkbox = card.querySelector('.cleanup-group-card__checkbox');
            if (checkbox && checkbox.checked) {
                const g = window.cleanupGroupsById[card.dataset.groupId];
                if (g) {
                    totalBytes += g.total_bytes;
                    count += 1;
                }
            }
        });

        const summary = document.getElementById('cleanupFooterSummary');
        summary.innerText = `Selected: ${formatBytesClient(totalBytes)} in ${count} group${count === 1 ? '' : 's'}`;

        const btn = document.getElementById('cleanupExecuteBtn');
        btn.disabled = totalBytes === 0;

        cleanupFooter.classList.toggle('hidden', Object.keys(window.cleanupGroupsById).length === 0);
    }

    function formatBytesClient(bytes) {
        if (bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let n = 0;
        let size = bytes;
        while (size > 1024 && n < units.length - 1) {
            size /= 1024;
            n += 1;
        }
        return `${size.toFixed(2)} ${units[n]}`;
    }

    const cleanupExecuteBtnEl = document.getElementById('cleanupExecuteBtn');
    if (cleanupExecuteBtnEl) {
        cleanupExecuteBtnEl.addEventListener('click', () => {
            const selectedIds = [];
            document.querySelectorAll('.cleanup-group-card').forEach(card => {
                const checkbox = card.querySelector('.cleanup-group-card__checkbox');
                if (checkbox && checkbox.checked) selectedIds.push(card.dataset.groupId);
            });
            if (selectedIds.length > 0) openCleanupConfirm(selectedIds);
        });
    }

    function openCleanupConfirm(groupIds) {
        const groups = groupIds.map(id => window.cleanupGroupsById[id]).filter(Boolean);
        const totalBytes = groups.reduce((sum, g) => sum + g.total_bytes, 0);
        const totalItems = groups.reduce((sum, g) => sum + g.item_count, 0);

        document.getElementById('cleanupConfirmSummary').innerText =
            `You're about to free up ${formatBytesClient(totalBytes)} across ${groups.length} group${groups.length === 1 ? '' : 's'} (${totalItems} item${totalItems === 1 ? '' : 's'}).`;

        const breakdown = document.getElementById('cleanupConfirmBreakdown');
        breakdown.innerHTML = groups.map(g => `
            <div class="row">
                <span>${g.label} <em>(${g.safety === 'safe' ? 'permanent' : 'Recycle Bin'})</em></span>
                <span>${g.formatted_size}</span>
            </div>
        `).join('');

        window.cleanupPendingSelection = [];
        groups.forEach(g => {
            g.items.forEach(item => {
                window.cleanupPendingSelection.push({ path: item.path, delete_mode: g.delete_mode, category: g.id });
            });
            // Groups can have more items than the capped preview list sent to
            // the client (see cleanup_engine.py's `cap`); item_count reflects
            // the true total. We only ever act on what the client actually
            // received, so oversized groups are cleaned in later passes as
            // the user re-analyzes - never silently guessed at.
        });
        window.cleanupPendingGroupIds = groupIds;

        document.getElementById('cleanupConfirmModal').classList.remove('hidden');
    }

    document.getElementById('cleanupCancelBtn')?.addEventListener('click', () => {
        document.getElementById('cleanupConfirmModal').classList.add('hidden');
    });

    document.getElementById('cleanupConfirmBtn')?.addEventListener('click', async () => {
        document.getElementById('cleanupConfirmModal').classList.add('hidden');
        const progressModal = document.getElementById('cleanupProgressModal');
        const progressText = document.getElementById('cleanupExecProgressText');
        const progressFreed = document.getElementById('cleanupExecProgressFreed');
        progressText.innerText = 'Starting...';
        progressFreed.innerText = '0 B freed';
        progressModal.classList.remove('hidden');

        try {
            const resp = await apiFetch('/api/cleanup/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selection: window.cleanupPendingSelection || [] })
            });

            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body.error ? errorText(body.error) : `Server returned ${resp.status}`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalData = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const chunks = buffer.split('\n\n');
                buffer = chunks.pop();
                for (const chunk of chunks) {
                    if (!chunk.startsWith('data: ')) continue;
                    const msg = JSON.parse(chunk.slice(6));
                    if (msg.type === 'progress') {
                        progressText.innerText = msg.message;
                        if (msg.freed !== undefined) progressFreed.innerText = `${msg.freed} freed`;
                    } else if (msg.type === 'result') {
                        finalData = msg.data;
                    }
                }
            }

            progressModal.classList.add('hidden');

            if (finalData) {
                let toastMsg = `Freed ${finalData.freed} (${finalData.deleted_count} item${finalData.deleted_count === 1 ? '' : 's'})`;
                if (finalData.failed_count > 0) {
                    toastMsg += ` - ${finalData.failed_count} item${finalData.failed_count === 1 ? '' : 's'} could not be removed`;
                }
                showToast(toastMsg, null, null);
            }
        } catch (err) {
            document.getElementById('cleanupProgressModal').classList.add('hidden');
            if (isProRequired(err)) return;
            alert('Cleanup failed: ' + err.message);
        }

        // Re-analyze so the UI reflects reality rather than guessing which
        // groups are now empty/partial.
        if (analyzeBtn) analyzeBtn.click();
    });

    // ================================================================
    // ACCOUNT - device linking, Pro gating and the upgrade flow. The server
    // (app.py + licensing.py) is the authority; this only mirrors its state
    // for the UI and never decides anything security-relevant on its own.
    // ================================================================

    let accountState = null;          // last /api/account/status payload
    let linkPollTimer = null;
    let linkActive = false;
    let upgradeWatchTimer = null;

    async function apiJson(url, body) {
        const opts = body === undefined
            ? {}
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
        const res = await apiFetch(url, opts);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    function isPro() {
        return !!(accountState && accountState.pro && (accountState.features || []).includes('cleanup'));
    }

    function formatDate(value) {
        if (value === null || value === undefined || value === '') return '-';
        const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
        return isNaN(d.getTime()) ? '-' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function applyAccountState(state) {
        accountState = state;
        const pro = isPro();
        document.body.classList.toggle('plan-free', !pro);
        document.body.classList.toggle('plan-pro', pro);

        const chip = document.getElementById('accountChip');
        const label = document.getElementById('accountChipLabel');
        const offline = document.getElementById('accountChipOffline');
        let text = pro ? 'Pro' : 'Free';
        if (state.dev_bypass) text = 'Pro · dev';
        else if (state.linked && state.email) text += ' · ' + state.email;
        else if (!state.linked) text += ' · Link account';
        label.textContent = text;
        chip.classList.toggle('account-chip--pro', pro);
        offline.classList.toggle('hidden', !state.offline);
        chip.setAttribute('aria-label', `Account: ${pro ? 'Pro' : 'Free'} plan${state.linked ? ', ' + (state.email || 'linked') : ', not linked. Link your account'}${state.offline ? ', offline' : ''}`);

        document.querySelectorAll('[data-pro]').forEach(el => {
            if (pro) el.removeAttribute('title');
            else el.setAttribute('title', 'Requires DiskScanner Turbo Pro');
        });

        // Account modal contents
        document.getElementById('accountEmail').textContent = state.email || '-';
        document.getElementById('accountPlan').textContent = pro ? 'Pro' : 'Free';
        document.getElementById('accountStatus').textContent = state.status || '-';
        document.getElementById('accountPeriodEnd').textContent = formatDate(state.current_period_end);
        document.getElementById('accountExpires').textContent = formatDate(state.expires_at);
        document.getElementById('accountUpgradeBtn').classList.toggle('hidden', pro);
        document.getElementById('accountDashboardBtn').classList.toggle('hidden', !pro);
        document.getElementById('accountBillingBtn').classList.toggle('hidden', !state.linked);
    }

    async function loadAccountState() {
        try {
            const { ok, data } = await apiJson('/api/account/status');
            if (ok) applyAccountState(data);
        } catch (e) { /* server not reachable - keep last state */ }
        return accountState;
    }

    async function refreshAccount(force) {
        try {
            const { ok, data } = await apiJson('/api/account/refresh', { force: !!force });
            if (ok) applyAccountState(data);
        } catch (e) { /* ignore */ }
        return accountState;
    }

    // ---- Modal helper: focus trap, Esc to close, focus restore ----
    const openModals = [];

    function focusableIn(el) {
        return Array.from(el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(n => !n.disabled && !n.closest('.hidden') && n.offsetParent !== null);
    }

    function openModal(modal, onClose) {
        if (!modal.classList.contains('hidden')) return;
        openModals.push({ modal, onClose, returnFocus: document.activeElement });
        modal.classList.remove('hidden');
        const items = focusableIn(modal);
        const primary = modal.querySelector('.primary-btn:not(.hidden)') || items[0];
        if (primary) primary.focus();
    }

    function closeModal(modal) {
        const idx = openModals.findIndex(m => m.modal === modal);
        modal.classList.add('hidden');
        if (idx === -1) return;
        const entry = openModals.splice(idx, 1)[0];
        if (entry.onClose) entry.onClose();
        if (entry.returnFocus && typeof entry.returnFocus.focus === 'function') entry.returnFocus.focus();
    }

    document.addEventListener('keydown', (e) => {
        const top = openModals[openModals.length - 1];
        if (!top) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal(top.modal);
        } else if (e.key === 'Tab') {
            const items = focusableIn(top.modal);
            if (items.length === 0) { e.preventDefault(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || !top.modal.contains(document.activeElement))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || !top.modal.contains(document.activeElement))) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    // Click on the dimmed backdrop closes the account modals too.
    ['linkModal', 'upgradeModal', 'accountModal'].forEach(id => {
        const m = document.getElementById(id);
        m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
    });

    // ---- Link account (device authorization flow) ----
    const linkModal = document.getElementById('linkModal');
    const linkUserCode = document.getElementById('linkUserCode');
    const linkStatus = document.getElementById('linkStatus');
    const linkOpenBtn = document.getElementById('linkOpenBtn');

    function stopLinkPolling() {
        linkActive = false;
        if (linkPollTimer) clearTimeout(linkPollTimer);
        linkPollTimer = null;
    }

    function scheduleLinkPoll(seconds) {
        if (!linkActive) return;
        linkPollTimer = setTimeout(pollLink, Math.max(1, seconds || 5) * 1000);
    }

    async function pollLink() {
        if (!linkActive) return;
        let result;
        try {
            ({ data: result } = await apiJson('/api/account/login/poll', {}));
        } catch (e) {
            linkStatus.textContent = 'Lost connection to the app. Retrying...';
            return scheduleLinkPoll(5);
        }
        if (!linkActive) return;
        switch (result.status) {
            case 'linked':
                stopLinkPolling();
                applyAccountState(result.state);
                linkStatus.textContent = 'Linked! You can close this window.';
                closeModal(linkModal);
                showToast(isPro() ? `Linked as ${result.state.email || 'your account'} - Pro unlocked.` : `Linked as ${result.state.email || 'your account'}.`, null, null);
                if (!isPro() && pendingUpgradeAfterLink) {
                    pendingUpgradeAfterLink = false;
                    openUpgradeModal();
                }
                return;
            case 'denied':
                stopLinkPolling();
                linkStatus.textContent = 'Linking was rejected in the browser. Close this and try again.';
                return;
            case 'expired':
                stopLinkPolling();
                linkStatus.textContent = 'This code expired. Close this and start again to get a new one.';
                return;
            case 'error':
                stopLinkPolling();
                linkStatus.textContent = 'Could not link: ' + (result.message || result.error || 'unknown error');
                return;
            case 'slow_down':
            case 'pending':
            default:
                linkStatus.textContent = result.offline
                    ? 'You seem to be offline. Still waiting for confirmation...'
                    : 'Waiting for you to confirm in the browser...';
                return scheduleLinkPoll(result.interval);
        }
    }

    let pendingUpgradeAfterLink = false;

    async function startLinking() {
        stopLinkPolling();
        linkUserCode.textContent = '----';
        linkStatus.textContent = 'Requesting a code...';
        linkOpenBtn.disabled = true;
        openModal(linkModal, () => {
            if (linkActive) apiJson('/api/account/login/cancel', {}).catch(() => {});
            stopLinkPolling();
        });
        let resp;
        try {
            resp = await apiJson('/api/account/login', {});
        } catch (e) {
            linkStatus.textContent = 'Could not reach the app server.';
            return;
        }
        if (!resp.ok) {
            linkStatus.textContent = 'Could not start linking: ' + errorText(resp.data.error);
            return;
        }
        linkUserCode.textContent = resp.data.user_code;
        linkOpenBtn.disabled = false;
        linkStatus.textContent = 'Your browser should have opened. Waiting for you to confirm...';
        linkActive = true;
        scheduleLinkPoll(resp.data.interval);
    }

    document.getElementById('linkCancelBtn').addEventListener('click', () => closeModal(linkModal));
    linkOpenBtn.addEventListener('click', () => { apiJson('/api/account/login/open', {}).catch(() => {}); });
    document.getElementById('linkCopyBtn').addEventListener('click', async () => {
        const code = linkUserCode.textContent;
        if (!code || code === '----') return;
        try {
            await navigator.clipboard.writeText(code);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (err) { /* ignore */ }
            ta.remove();
        }
        linkStatus.textContent = 'Code copied. Waiting for you to confirm in the browser...';
    });

    // ---- Upgrade modal ----
    const upgradeModal = document.getElementById('upgradeModal');
    const upgradeStatus = document.getElementById('upgradeStatus');

    function stopUpgradeWatch() {
        if (upgradeWatchTimer) clearInterval(upgradeWatchTimer);
        upgradeWatchTimer = null;
    }

    function openUpgradeModal() {
        if (!upgradeModal.classList.contains('hidden')) return;
        upgradeStatus.textContent = '';
        openModal(upgradeModal);
    }

    // After checkout, the web side flips the subscription within seconds:
    // poll the entitlement (forced) for up to 10 min so Pro unlocks without
    // the user having to do anything (BLUEPRINT: <= 60 s after payment).
    function startUpgradeWatch() {
        stopUpgradeWatch();
        const until = Date.now() + 10 * 60 * 1000;
        upgradeWatchTimer = setInterval(async () => {
            if (Date.now() > until || !accountState || !accountState.linked) return stopUpgradeWatch();
            await refreshAccount(true);
            if (isPro()) {
                stopUpgradeWatch();
                closeModal(upgradeModal);
                showToast('Pro unlocked - thanks for subscribing!', null, null);
            }
        }, 20000);
    }

    window.addEventListener('ds:pro-required', () => openUpgradeModal());

    document.getElementById('upgradeCloseBtn').addEventListener('click', () => closeModal(upgradeModal));
    document.getElementById('upgradeTrialBtn').addEventListener('click', async () => {
        await apiJson('/api/account/open', { page: 'pricing' }).catch(() => {});
        if (accountState && accountState.linked) {
            upgradeStatus.textContent = 'Finish checkout in your browser - Pro unlocks here automatically.';
            startUpgradeWatch();
        } else {
            upgradeStatus.textContent = 'After subscribing, click "I already subscribed" to link this PC.';
        }
    });
    document.getElementById('upgradeCheckBtn').addEventListener('click', async () => {
        if (!accountState || !accountState.linked) {
            // Must link this PC to the subscribed account first.
            closeModal(upgradeModal);
            pendingUpgradeAfterLink = true;
            startLinking();
            return;
        }
        upgradeStatus.textContent = 'Checking your subscription...';
        await refreshAccount(true);
        if (isPro()) {
            closeModal(upgradeModal);
            showToast('Pro unlocked - enjoy!', null, null);
        } else if (accountState && accountState.offline) {
            upgradeStatus.textContent = "Couldn't reach the server. Check your connection and try again.";
        } else {
            upgradeStatus.textContent = `No active subscription found for ${accountState.email || 'this account'} yet. It can take a few seconds after checkout.`;
        }
    });

    // ---- Account details modal ----
    const accountModal = document.getElementById('accountModal');
    const accountMessage = document.getElementById('accountMessage');

    document.getElementById('accountChip').addEventListener('click', async () => {
        if (!accountState) await loadAccountState();
        if (accountState && !accountState.linked && !accountState.dev_bypass) {
            startLinking();
            return;
        }
        accountMessage.textContent = accountState && accountState.offline ? 'Offline - using your saved plan until it expires.' : '';
        openModal(accountModal);
    });
    document.getElementById('accountCloseBtn').addEventListener('click', () => closeModal(accountModal));
    document.getElementById('accountRefreshBtn').addEventListener('click', async () => {
        accountMessage.textContent = 'Refreshing...';
        await refreshAccount(true);
        accountMessage.textContent = accountState && accountState.offline ? "Couldn't reach the server." : 'Up to date.';
    });
    document.getElementById('accountLogoutBtn').addEventListener('click', async () => {
        if (!confirm('Unlink this PC from your account? Pro features will be locked until you link it again.')) return;
        try {
            const { data } = await apiJson('/api/account/logout', {});
            applyAccountState(data);
        } catch (e) { /* ignore */ }
        closeModal(accountModal);
        showToast('This PC was unlinked. You are on the free plan.', null, null);
    });
    document.getElementById('accountUpgradeBtn').addEventListener('click', () => {
        closeModal(accountModal);
        openUpgradeModal();
    });
    document.getElementById('accountDashboardBtn').addEventListener('click', () => apiJson('/api/account/open', { page: 'dashboard' }).catch(() => {}));
    document.getElementById('accountBillingBtn').addEventListener('click', () => apiJson('/api/account/open', { page: 'billing' }).catch(() => {}));

    // ---- Pro gating on the client (UX only - the server enforces it) ----
    // Capture phase on document runs before every button's own handler, so a
    // known-free user gets the upgrade modal instead of confirm() dialogs and
    // a 403. Unknown state (status not loaded yet) falls through to the server.
    document.addEventListener('click', (e) => {
        const gated = e.target.closest && e.target.closest('[data-pro]');
        if (!gated || !accountState || isPro()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openUpgradeModal();
    }, true);

    // EventSource can't see HTTP status codes: after a stream error on a
    // gated route, ask the account state whether it was the Pro gate.
    async function handleGatedStreamError(fallbackMessage) {
        await loadAccountState();
        if (accountState && !isPro()) openUpgradeModal();
        else alert(fallbackMessage);
    }

    // Coming back from the browser (activation, checkout): refresh quietly.
    // licensing.refresh_entitlement() rate-limits non-forced refreshes.
    window.addEventListener('focus', () => {
        if (accountState && accountState.linked && !isPro()) refreshAccount(false);
        else loadAccountState();
    });

    loadAccountState();
});
