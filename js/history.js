const BAS_HISTORY_LIMIT = 80;
const BAS_HISTORY_COALESCE_MS = 900;

const projectHistoryRuntime = {
    initialized: false,
    applying: false,
    projectId: '',
    entries: [],
    index: -1,
    lastChangeKey: '',
    lastChangeAt: 0
};

function projectHistoryText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual];
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function cloneProjectHistoryManifest(manifest) {
    if (!manifest) return null;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(manifest);
        } catch (error) {}
    }
    return JSON.parse(JSON.stringify(manifest));
}

function captureProjectHistoryAssets() {
    if (!window.BASProjectEngine) return new Map();
    const assets = BASProjectEngine.getAssets().filter(asset => !asset.transient && asset.blob instanceof Blob);
    return new Map(assets.map(asset => [asset.key, { ...asset, blob: asset.blob }]));
}

function captureProjectHistorySnapshot() {
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob) || !window.BASProjectEngine) return null;
    const manifest = BASProjectEngine.captureManifest();
    if (!manifest || !BASProjectEngine.validateManifest(manifest)) return null;
    return {
        manifest: cloneProjectHistoryManifest(manifest),
        assets: captureProjectHistoryAssets(),
        signature: JSON.stringify(manifest.editor || {})
    };
}

function resetProjectHistory() {
    projectHistoryRuntime.projectId = currentProject && currentProject.projectMeta ? currentProject.projectMeta.id || '' : '';
    projectHistoryRuntime.entries = [];
    projectHistoryRuntime.index = -1;
    projectHistoryRuntime.lastChangeKey = '';
    projectHistoryRuntime.lastChangeAt = 0;
    const snapshot = captureProjectHistorySnapshot();
    if (snapshot) {
        projectHistoryRuntime.entries.push(snapshot);
        projectHistoryRuntime.index = 0;
    }
    syncProjectHistoryUi();
}

function replaceProjectHistoryBaseline() {
    const snapshot = captureProjectHistorySnapshot();
    if (!snapshot) return;
    if (projectHistoryRuntime.entries.length === 0) {
        projectHistoryRuntime.entries = [snapshot];
        projectHistoryRuntime.index = 0;
    } else if (projectHistoryRuntime.entries.length === 1 && projectHistoryRuntime.index === 0) {
        projectHistoryRuntime.entries[0] = snapshot;
    }
    syncProjectHistoryUi();
}

function projectHistoryCanUndo() {
    return projectHistoryRuntime.index > 0 && !projectHistoryRuntime.applying;
}

function projectHistoryCanRedo() {
    return projectHistoryRuntime.index >= 0 && projectHistoryRuntime.index < projectHistoryRuntime.entries.length - 1 && !projectHistoryRuntime.applying;
}

function projectHistoryShouldCoalesce(detail) {
    const reason = detail.reason || '';
    return ['input', 'change', 'framing', 'advanced-parts'].includes(reason);
}

function pushProjectHistorySnapshot(detail = {}) {
    const snapshot = captureProjectHistorySnapshot();
    if (!snapshot) return;
    const current = projectHistoryRuntime.entries[projectHistoryRuntime.index];
    if (current && current.signature === snapshot.signature) {
        current.assets = snapshot.assets;
        syncProjectHistoryUi();
        return;
    }
    if (projectHistoryRuntime.index < projectHistoryRuntime.entries.length - 1) {
        projectHistoryRuntime.entries = projectHistoryRuntime.entries.slice(0, projectHistoryRuntime.index + 1);
    }
    const now = Date.now();
    const changeKey = detail.changeKey || detail.reason || 'edit';
    const coalesce = projectHistoryShouldCoalesce(detail) &&
        projectHistoryRuntime.entries.length > 1 &&
        projectHistoryRuntime.index === projectHistoryRuntime.entries.length - 1 &&
        projectHistoryRuntime.lastChangeKey === changeKey &&
        now - projectHistoryRuntime.lastChangeAt <= BAS_HISTORY_COALESCE_MS;
    if (coalesce) {
        projectHistoryRuntime.entries[projectHistoryRuntime.index] = snapshot;
    } else {
        projectHistoryRuntime.entries.push(snapshot);
        projectHistoryRuntime.index = projectHistoryRuntime.entries.length - 1;
        if (projectHistoryRuntime.entries.length > BAS_HISTORY_LIMIT) {
            const overflow = projectHistoryRuntime.entries.length - BAS_HISTORY_LIMIT;
            projectHistoryRuntime.entries.splice(0, overflow);
            projectHistoryRuntime.index = Math.max(0, projectHistoryRuntime.index - overflow);
        }
    }
    projectHistoryRuntime.lastChangeKey = changeKey;
    projectHistoryRuntime.lastChangeAt = now;
    syncProjectHistoryUi();
}

function syncProjectHistoryUi() {
    const undo = document.getElementById('p12-undo');
    const redo = document.getElementById('p12-redo');
    const group = document.getElementById('p12-history-controls');
    const undoLabel = document.getElementById('p12-undo-label');
    const redoLabel = document.getElementById('p12-redo-label');
    const undoText = projectHistoryText('historyUndo', 'Undo');
    const redoText = projectHistoryText('historyRedo', 'Redo');
    if (undo) {
        undo.disabled = !projectHistoryCanUndo();
        undo.title = projectHistoryText('historyUndoTitle', 'Undo (Ctrl/Cmd+Z)');
        undo.setAttribute('aria-label', undo.title);
    }
    if (redo) {
        redo.disabled = !projectHistoryCanRedo();
        redo.title = projectHistoryText('historyRedoTitle', 'Redo (Ctrl/Cmd+Shift+Z)');
        redo.setAttribute('aria-label', redo.title);
    }
    if (undoLabel) undoLabel.textContent = undoText;
    if (redoLabel) redoLabel.textContent = redoText;
    if (group) group.setAttribute('aria-label', projectHistoryText('historyGroup', 'Edit history'));
}

function applyProjectHistorySnapshot(index, reason) {
    if (projectHistoryRuntime.applying || !window.BASProjectEngine) return false;
    const snapshot = projectHistoryRuntime.entries[index];
    if (!snapshot) return false;
    projectHistoryRuntime.applying = true;
    try {
        BASProjectEngine.suspend(() => {
            BASProjectEngine.restoreState(snapshot.manifest, snapshot.assets, { preserveMeta: true, restoreUi: false });
        });
        projectHistoryRuntime.index = index;
        projectHistoryRuntime.lastChangeKey = '';
        projectHistoryRuntime.lastChangeAt = 0;
        BASProjectEngine.commitRestoredState(reason);
        if (typeof showToast === 'function') {
            showToast(projectHistoryText(reason === 'history-undo' ? 'historyUndone' : 'historyRedone', reason === 'history-undo' ? 'Undone' : 'Redone'), 'info', 1600);
        }
        return true;
    } finally {
        projectHistoryRuntime.applying = false;
        syncProjectHistoryUi();
    }
}

function undoProjectHistory() {
    if (!projectHistoryCanUndo()) return false;
    return applyProjectHistorySnapshot(projectHistoryRuntime.index - 1, 'history-undo');
}

function redoProjectHistory() {
    if (!projectHistoryCanRedo()) return false;
    return applyProjectHistorySnapshot(projectHistoryRuntime.index + 1, 'history-redo');
}

function bindProjectHistory() {
    if (projectHistoryRuntime.initialized) return;
    projectHistoryRuntime.initialized = true;
    document.getElementById('p12-undo')?.addEventListener('click', undoProjectHistory);
    document.getElementById('p12-redo')?.addEventListener('click', redoProjectHistory);
    window.addEventListener('bas:projectchange', event => {
        if (projectHistoryRuntime.applying) return;
        const detail = event.detail || {};
        if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) {
            if (projectHistoryRuntime.entries.length) resetProjectHistory();
            return;
        }
        const projectId = currentProject.projectMeta && currentProject.projectMeta.id ? currentProject.projectMeta.id : '';
        if (!projectId || projectHistoryRuntime.projectId !== projectId) {
            resetProjectHistory();
            return;
        }
        if (['source', 'source-metadata', 'startup', 'restore'].includes(detail.reason)) {
            replaceProjectHistoryBaseline();
            return;
        }
        if (detail.reason === 'clean' || !detail.contentChanged) return;
        pushProjectHistorySnapshot(detail);
    });
    document.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        const redo = key === 'y' || (key === 'z' && event.shiftKey);
        const undo = key === 'z' && !event.shiftKey;
        if (!undo && !redo) return;
        const handled = redo ? redoProjectHistory() : undoProjectHistory();
        if (handled) event.preventDefault();
    });
    resetProjectHistory();
}

window.BASProjectHistory = Object.freeze({
    undo: undoProjectHistory,
    redo: redoProjectHistory,
    canUndo: projectHistoryCanUndo,
    canRedo: projectHistoryCanRedo,
    reset: resetProjectHistory,
    syncUi: syncProjectHistoryUi
});
window.syncProjectHistoryUi = syncProjectHistoryUi;
window.addEventListener('DOMContentLoaded', bindProjectHistory);
