const BAS_AUTOSAVE_DB_NAME = 'boot-animation-studio-projects';
const BAS_AUTOSAVE_DB_VERSION = 1;
const BAS_AUTOSAVE_PROJECT_STORE = 'projects';
const BAS_AUTOSAVE_ASSET_STORE = 'assets';
const BAS_AUTOSAVE_LIMIT = 5;
const BAS_AUTOSAVE_DELAY = 1200;

const autosaveRuntime = {
    dbPromise: null,
    saveTimer: 0,
    saving: false,
    restoring: false,
    initialized: false,
    pendingAfterSave: false,
    assetSignatures: new Map(),
    lastSavedAt: 0,
    unavailable: false
};

function autosaveText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual];
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function openAutosaveDatabase() {
    if (autosaveRuntime.dbPromise) return autosaveRuntime.dbPromise;
    if (!globalThis.indexedDB) {
        autosaveRuntime.unavailable = true;
        return Promise.reject(new Error('IndexedDB unavailable'));
    }
    autosaveRuntime.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(BAS_AUTOSAVE_DB_NAME, BAS_AUTOSAVE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(BAS_AUTOSAVE_PROJECT_STORE)) {
                const projects = db.createObjectStore(BAS_AUTOSAVE_PROJECT_STORE, { keyPath: 'id' });
                projects.createIndex('updatedAt', 'updatedAt');
            }
            if (!db.objectStoreNames.contains(BAS_AUTOSAVE_ASSET_STORE)) {
                const assets = db.createObjectStore(BAS_AUTOSAVE_ASSET_STORE, { keyPath: 'id' });
                assets.createIndex('projectId', 'projectId');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        request.onblocked = () => reject(new Error('IndexedDB blocked'));
    }).catch(error => {
        autosaveRuntime.dbPromise = null;
        autosaveRuntime.unavailable = true;
        throw error;
    });
    return autosaveRuntime.dbPromise;
}

function autosaveRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
}

function autosaveTransactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
}

function autosaveFormatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function autosaveFormatDate(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat(idiomaAtual === 'pt' ? 'pt-BR' : idiomaAtual === 'es' ? 'es-ES' : idiomaAtual === 'fr' ? 'fr-FR' : 'en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    } catch (error) {
        return date.toLocaleString();
    }
}

function setAutosaveStatus(state, text = '') {
    const root = document.getElementById('p12-save-status');
    const label = document.getElementById('p12-save-status-text');
    if (!root || !label) return;
    root.dataset.state = state;
    label.textContent = text || autosaveText(
        state === 'saving' ? 'autosaveSaving' :
        state === 'saved' ? 'autosaveSaved' :
        state === 'restoring' ? 'autosaveRestoring' :
        state === 'error' ? 'autosaveUnavailable' :
        'autosaveReady',
        state === 'saving' ? 'Saving...' :
        state === 'saved' ? 'Saved locally' :
        state === 'restoring' ? 'Restoring...' :
        state === 'error' ? 'Autosave unavailable' :
        'Autosave ready'
    );
}

function autosaveAssetSignature(assets) {
    return assets
        .filter(asset => !asset.transient)
        .map(asset => [asset.key, asset.kind, asset.name || '', asset.size || 0, asset.type || '', asset.lastModified || 0].join(':'))
        .sort()
        .join('|');
}

function autosaveAssetRecord(projectId, asset) {
    return {
        id: `${projectId}::${asset.key}`,
        projectId,
        key: asset.key,
        kind: asset.kind,
        name: asset.name || '',
        size: asset.size || 0,
        type: asset.type || '',
        lastModified: asset.lastModified || 0,
        blob: asset.blob
    };
}

async function getAutosaveProjectRecord(id) {
    const db = await openAutosaveDatabase();
    const transaction = db.transaction(BAS_AUTOSAVE_PROJECT_STORE, 'readonly');
    return autosaveRequest(transaction.objectStore(BAS_AUTOSAVE_PROJECT_STORE).get(id));
}

async function getAutosaveProjects() {
    const db = await openAutosaveDatabase();
    const transaction = db.transaction(BAS_AUTOSAVE_PROJECT_STORE, 'readonly');
    const records = await autosaveRequest(transaction.objectStore(BAS_AUTOSAVE_PROJECT_STORE).getAll());
    return (records || []).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

async function getAutosaveAssets(projectId) {
    const db = await openAutosaveDatabase();
    const transaction = db.transaction(BAS_AUTOSAVE_ASSET_STORE, 'readonly');
    const store = transaction.objectStore(BAS_AUTOSAVE_ASSET_STORE);
    const index = store.index('projectId');
    const records = await autosaveRequest(index.getAll(IDBKeyRange.only(projectId)));
    return records || [];
}

async function deleteAutosaveProject(id) {
    const existingAssets = await getAutosaveAssets(id);
    const db = await openAutosaveDatabase();
    const transaction = db.transaction([BAS_AUTOSAVE_PROJECT_STORE, BAS_AUTOSAVE_ASSET_STORE], 'readwrite');
    transaction.objectStore(BAS_AUTOSAVE_PROJECT_STORE).delete(id);
    const assetStore = transaction.objectStore(BAS_AUTOSAVE_ASSET_STORE);
    existingAssets.forEach(asset => assetStore.delete(asset.id));
    await autosaveTransactionDone(transaction);
    autosaveRuntime.assetSignatures.delete(id);
}

async function trimAutosaveProjects() {
    const records = await getAutosaveProjects();
    const extras = records.slice(BAS_AUTOSAVE_LIMIT);
    for (const record of extras) await deleteAutosaveProject(record.id);
}

function getAutosaveProjectSize(assets) {
    return assets.filter(asset => !asset.transient).reduce((total, asset) => total + (Number(asset.size) || 0), 0);
}

async function saveCurrentProjectAutosave(reason = 'autosave') {
    if (autosaveRuntime.restoring || autosaveRuntime.unavailable) return false;
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob) || !window.BASProjectEngine) return false;
    if (autosaveRuntime.saving) {
        autosaveRuntime.pendingAfterSave = true;
        return false;
    }
    autosaveRuntime.saving = true;
    setAutosaveStatus('saving');
    try {
        const manifest = BASProjectEngine.sync(reason, { emit: false }) || BASProjectEngine.captureManifest();
        if (!manifest || !BASProjectEngine.validateManifest(manifest)) throw new Error('Invalid project manifest');
        const meta = manifest.project;
        const savedRevision = Number(meta.revision) || 0;
        const assets = BASProjectEngine.getAssets().filter(asset => !asset.transient && asset.blob instanceof Blob);
        const source = assets.find(asset => asset.key === 'source');
        if (!source) throw new Error('Project source unavailable');
        const signature = autosaveAssetSignature(assets);
        const previousSignature = autosaveRuntime.assetSignatures.get(meta.id);
        const previousAssets = previousSignature === signature ? [] : await getAutosaveAssets(meta.id);
        const db = await openAutosaveDatabase();
        const stores = previousSignature === signature
            ? [BAS_AUTOSAVE_PROJECT_STORE]
            : [BAS_AUTOSAVE_PROJECT_STORE, BAS_AUTOSAVE_ASSET_STORE];
        const transaction = db.transaction(stores, 'readwrite');
        const now = new Date().toISOString();
        const savedManifest = JSON.parse(JSON.stringify(manifest));
        savedManifest.project.dirty = false;
        savedManifest.project.updatedAt = now;
        const record = {
            id: meta.id,
            name: meta.name || 'bootanimation',
            createdAt: meta.createdAt || now,
            updatedAt: now,
            revision: savedRevision,
            sourceType: manifest.source.type || 'video',
            sourceName: manifest.source.name || '',
            sourceSummary: typeof getProjectEngineSummary === 'function' ? getProjectEngineSummary(currentProject) : '',
            size: getAutosaveProjectSize(assets),
            assetSignature: signature,
            manifest: savedManifest
        };
        transaction.objectStore(BAS_AUTOSAVE_PROJECT_STORE).put(record);
        if (previousSignature !== signature) {
            const assetStore = transaction.objectStore(BAS_AUTOSAVE_ASSET_STORE);
            previousAssets.forEach(asset => assetStore.delete(asset.id));
            assets.forEach(asset => assetStore.put(autosaveAssetRecord(meta.id, asset)));
        }
        await autosaveTransactionDone(transaction);
        autosaveRuntime.assetSignatures.set(meta.id, signature);
        autosaveRuntime.lastSavedAt = Date.now();
        const currentMatchesSavedRevision = !!(currentProject && currentProject.projectMeta && currentProject.projectMeta.id === meta.id && (Number(currentProject.projectMeta.revision) || 0) === savedRevision);
        if (currentMatchesSavedRevision) {
            currentProject.projectMeta.updatedAt = now;
            BASProjectEngine.markClean();
            setAutosaveStatus('saved');
        } else {
            autosaveRuntime.pendingAfterSave = true;
            setAutosaveStatus('saving');
        }
        await trimAutosaveProjects();
        await renderRecentProjects();
        return true;
    } catch (error) {
        console.error(error);
        setAutosaveStatus('error');
        return false;
    } finally {
        autosaveRuntime.saving = false;
        if (autosaveRuntime.pendingAfterSave) {
            autosaveRuntime.pendingAfterSave = false;
            scheduleProjectAutosave('queued', 250);
        }
    }
}

function scheduleProjectAutosave(reason = 'change', delay = BAS_AUTOSAVE_DELAY) {
    if (autosaveRuntime.restoring || autosaveRuntime.unavailable) return;
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) return;
    clearTimeout(autosaveRuntime.saveTimer);
    setAutosaveStatus('saving');
    autosaveRuntime.saveTimer = setTimeout(() => {
        autosaveRuntime.saveTimer = 0;
        saveCurrentProjectAutosave(reason);
    }, Math.max(0, delay));
}

function autosaveRecentCard(record) {
    const card = document.createElement('article');
    card.className = 'recent-project-card';
    card.dataset.projectId = record.id;

    const body = document.createElement('div');
    body.className = 'recent-project-body';

    const name = document.createElement('strong');
    name.className = 'recent-project-name';
    name.textContent = record.name || 'bootanimation';

    const summary = document.createElement('span');
    summary.className = 'recent-project-summary';
    summary.textContent = record.sourceSummary || record.sourceName || autosaveText('autosaveProjectFallback', 'Saved project');

    const meta = document.createElement('span');
    meta.className = 'recent-project-meta';
    const size = autosaveFormatBytes(record.size || 0);
    const date = autosaveFormatDate(record.updatedAt);
    meta.textContent = [date, size].filter(Boolean).join(' · ');

    body.append(name, summary, meta);

    const actions = document.createElement('div');
    actions.className = 'recent-project-actions';

    const continueButton = document.createElement('button');
    continueButton.className = 'recent-project-continue';
    continueButton.type = 'button';
    continueButton.textContent = autosaveText('autosaveContinue', 'Continue');
    continueButton.addEventListener('click', () => restoreAutosavedProject(record.id));

    const removeButton = document.createElement('button');
    removeButton.className = 'recent-project-remove';
    removeButton.type = 'button';
    removeButton.textContent = autosaveText('autosaveRemove', 'Remove');
    removeButton.addEventListener('click', async () => {
        const message = autosaveText('autosaveDeleteConfirm', 'Remove this saved project from this browser?');
        const accepted = typeof askConfirmation === 'function' ? await askConfirmation(message, true) : globalThis.confirm(message);
        if (!accepted) return;
        await deleteAutosaveProject(record.id);
        await renderRecentProjects();
    });

    actions.append(continueButton, removeButton);
    card.append(body, actions);
    return card;
}

async function renderRecentProjects() {
    const section = document.getElementById('recent-projects');
    const list = document.getElementById('recent-projects-list');
    if (!section || !list) return;
    if (autosaveRuntime.unavailable) {
        section.hidden = true;
        list.replaceChildren();
        return;
    }
    try {
        const records = (await getAutosaveProjects()).slice(0, BAS_AUTOSAVE_LIMIT);
        list.replaceChildren(...records.map(autosaveRecentCard));
        section.hidden = records.length === 0;
    } catch (error) {
        autosaveRuntime.unavailable = true;
        section.hidden = true;
        list.replaceChildren();
    }
}

function syncAutosaveUiText() {
    const kicker = document.getElementById('p12-recent-kicker');
    const title = document.getElementById('p12-recent-title');
    const desc = document.getElementById('p12-recent-desc');
    const badge = document.getElementById('p12-recent-badge');
    if (kicker) kicker.textContent = autosaveText('autosaveRecentKicker', 'RECOVERY');
    if (title) title.textContent = autosaveText('autosaveRecentTitle', 'Recent projects');
    if (desc) desc.textContent = autosaveText('autosaveRecentDesc', 'Saved automatically in this browser.');
    if (badge) badge.textContent = autosaveText('autosaveLocalBadge', 'LOCAL');
    if (autosaveRuntime.restoring) setAutosaveStatus('restoring');
    else if (autosaveRuntime.saving || autosaveRuntime.saveTimer) setAutosaveStatus('saving');
    else if (currentProject && currentProject.projectMeta && currentProject.projectMeta.dirty) setAutosaveStatus('saving');
    else if (currentProject && currentProject.sourceBlob) setAutosaveStatus('saved');
    else setAutosaveStatus(autosaveRuntime.unavailable ? 'error' : 'idle');
    renderRecentProjects();
}

async function restoreAutosavedProject(id) {
    if (autosaveRuntime.restoring) return;
    autosaveRuntime.restoring = true;
    clearTimeout(autosaveRuntime.saveTimer);
    autosaveRuntime.saveTimer = 0;
    setAutosaveStatus('restoring');
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('source');
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('txt-loading-timeline');
    if (overlay) overlay.style.display = 'flex';
    if (loadingText) loadingText.textContent = autosaveText('autosaveRestoring', 'Restoring project...');
    try {
        const record = await getAutosaveProjectRecord(id);
        if (!record || !record.manifest || !window.BASProjectRestore) throw new Error(autosaveText('autosaveInvalidProject', 'This saved project cannot be restored.'));
        const assetRecords = await getAutosaveAssets(id);
        const assetMap = new Map(assetRecords.map(asset => [asset.key, asset]));
        await BASProjectRestore.restore(record.manifest, assetMap, { reason: 'restore' });
        autosaveRuntime.assetSignatures.set(id, record.assetSignature || '');
        setAutosaveStatus('saved', autosaveText('autosaveRecovered', 'Project restored'));
        if (typeof showToast === 'function') showToast(autosaveText('autosaveRecovered', 'Project restored'), 'success');
        await renderRecentProjects();
    } catch (error) {
        console.error(error);
        setAutosaveStatus('error');
        if (typeof showToast === 'function') showToast(error.message || autosaveText('autosaveRestoreFailed', 'Could not restore this project.'), 'error');
        else alert(error.message || autosaveText('autosaveRestoreFailed', 'Could not restore this project.'));
    } finally {
        autosaveRuntime.restoring = false;
        if (overlay) overlay.style.display = 'none';
    }
}

function bindAutosave() {
    if (autosaveRuntime.initialized) return;
    autosaveRuntime.initialized = true;
    openAutosaveDatabase().then(() => {
        setAutosaveStatus('idle');
        renderRecentProjects();
    }).catch(() => setAutosaveStatus('error'));
    window.addEventListener('bas:projectchange', event => {
        if (autosaveRuntime.restoring) return;
        const detail = event.detail || {};
        if (detail.reason === 'clean') return;
        if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) return;
        if (detail.contentChanged || ['source', 'source-metadata', 'startup'].includes(detail.reason)) scheduleProjectAutosave(detail.reason);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && currentProject && currentProject.projectMeta && currentProject.projectMeta.dirty) {
            clearTimeout(autosaveRuntime.saveTimer);
            autosaveRuntime.saveTimer = 0;
            saveCurrentProjectAutosave('hidden');
        }
    });
    window.addEventListener('beforeunload', event => {
        const dirty = !!(currentProject && currentProject.projectMeta && currentProject.projectMeta.dirty);
        if (!dirty && !autosaveRuntime.saveTimer && !autosaveRuntime.saving) return;
        event.preventDefault();
        event.returnValue = '';
    });
    setInterval(() => {
        if (currentProject && currentProject.projectMeta && currentProject.projectMeta.dirty && !autosaveRuntime.saving) scheduleProjectAutosave('safety', 0);
    }, 20000);
}

window.BASAutosave = Object.freeze({
    save: saveCurrentProjectAutosave,
    restore: restoreAutosavedProject,
    list: getAutosaveProjects,
    remove: deleteAutosaveProject,
    refresh: renderRecentProjects
});
window.syncAutosaveUiText = syncAutosaveUiText;
window.restoreAutosavedProject = restoreAutosavedProject;
window.addEventListener('DOMContentLoaded', bindAutosave);
