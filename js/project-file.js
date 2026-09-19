const BAS_PROJECT_FILE_CONTAINER_VERSION = 1;
const BAS_PROJECT_FILE_EXTENSION = '.basproject';
const BAS_PROJECT_FILE_FORMAT = 'boot-animation-studio-project-package';
const BAS_PROJECT_FILE_RELEASE = 'P12.12E';
const BAS_PROJECT_FILE_METADATA_LIMIT = 2 * 1024 * 1024;
const BAS_PROJECT_FILE_MAX_ASSETS = 2048;
const BAS_PROJECT_FILE_CONTAINER_MIGRATIONS = Object.freeze({});

const projectFileRuntime = {
    saving: false,
    opening: false,
    initialized: false,
    fileHandle: null,
    fileProjectId: '',
    filename: ''
};

function projectFileText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual];
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function projectFileNow() {
    return new Date().toISOString();
}

function projectFileClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function projectFileHex(bytes) {
    return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

async function projectFileSha256(value) {
    if (!globalThis.crypto || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
        throw new Error(projectFileText('projectFileCryptoUnavailable', 'This browser cannot verify project-file integrity.'));
    }
    const buffer = value instanceof Blob ? await value.arrayBuffer() : value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value)).buffer;
    return projectFileHex(await crypto.subtle.digest('SHA-256', buffer));
}

function projectFileSafeSegment(value, fallback = 'asset') {
    const normalized = String(value || '').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
    const withoutTraversal = normalized.replace(/^\.+/, '').replace(/\.\.+/g, '.');
    return (withoutTraversal || fallback).slice(0, 140);
}

function projectFileBaseName(manifest) {
    const name = manifest && manifest.project && manifest.project.name ? manifest.project.name : manifest && manifest.editor && manifest.editor.output ? manifest.editor.output.name : 'bootanimation';
    return projectFileSafeSegment(name, 'bootanimation').replace(/\.basproject$/i, '') || 'bootanimation';
}

function projectFileSortAssets(assets) {
    return [...assets].sort((a, b) => {
        if (a.key === 'source' && b.key !== 'source') return -1;
        if (b.key === 'source' && a.key !== 'source') return 1;
        return String(a.key).localeCompare(String(b.key));
    });
}

function projectFileAssetPath(asset, index) {
    const number = String(index + 1).padStart(3, '0');
    const fallback = projectFileSafeSegment(asset.key, `asset-${number}`);
    const filename = projectFileSafeSegment(asset.name, fallback);
    return `assets/${number}-${filename}`;
}

function projectFileSupportsNativeOpen() {
    return typeof window.showOpenFilePicker === 'function';
}

function projectFileSupportsNativeSave() {
    return typeof window.showSaveFilePicker === 'function';
}

function projectFileIsAbort(error) {
    return !!error && (error.name === 'AbortError' || error.code === 20);
}

function projectFilePickerTypes() {
    return [{
        description: projectFileText('projectFilePickerDescription', 'Boot Animation Studio project'),
        accept: { 'application/x-boot-animation-studio-project': [BAS_PROJECT_FILE_EXTENSION] }
    }];
}

function projectFileSetBusy(kind, isBusy) {
    if (kind === 'open') projectFileRuntime.opening = !!isBusy;
    else projectFileRuntime.saving = !!isBusy;
    syncProjectFileUi();
}

function projectFileClearHandle() {
    projectFileRuntime.fileHandle = null;
    projectFileRuntime.fileProjectId = '';
    projectFileRuntime.filename = '';
}

function syncProjectFileUi() {
    const openButton = document.getElementById('p12-open-project');
    const launchOpenButton = document.getElementById('p12-open-project-launch');
    const saveButton = document.getElementById('p12-save-project');
    const saveAsButton = document.getElementById('p12-save-project-as');
    const group = document.getElementById('p12-project-file-actions');
    const hasProject = !!(currentProject && currentProject.sourceBlob instanceof Blob && window.BASProjectEngine && typeof JSZip !== 'undefined');
    const busy = projectFileRuntime.saving || projectFileRuntime.opening;

    if (openButton) {
        openButton.disabled = busy || typeof JSZip === 'undefined' || !window.BASProjectRestore;
        openButton.dataset.busy = projectFileRuntime.opening ? 'true' : 'false';
    }
    if (launchOpenButton) {
        launchOpenButton.disabled = busy || typeof JSZip === 'undefined' || !window.BASProjectRestore;
        launchOpenButton.dataset.busy = projectFileRuntime.opening ? 'true' : 'false';
    }
    if (saveButton) {
        saveButton.disabled = !hasProject || busy;
        saveButton.dataset.busy = projectFileRuntime.saving ? 'true' : 'false';
    }
    if (saveAsButton) {
        saveAsButton.hidden = !projectFileSupportsNativeSave();
        saveAsButton.disabled = !hasProject || busy;
        saveAsButton.dataset.busy = projectFileRuntime.saving ? 'true' : 'false';
    }
    if (group) {
        group.setAttribute('aria-busy', busy ? 'true' : 'false');
        group.setAttribute('aria-label', projectFileText('projectFileGroup', 'Project files'));
    }

    const openLabel = document.getElementById('p12-open-project-label');
    const launchOpenLabel = document.getElementById('p12-open-project-launch-label');
    const launchOpenDesc = document.getElementById('p12-open-project-launch-desc');
    const saveLabel = document.getElementById('p12-save-project-label');
    const saveAsLabel = document.getElementById('p12-save-project-as-label');
    const openText = projectFileRuntime.opening ? projectFileText('projectFileOpening', 'Opening...') : projectFileText('projectFileOpen', 'Open project');
    const saveText = projectFileRuntime.saving ? projectFileText('projectFileSaving', 'Saving...') : projectFileText('projectFileSave', 'Save project');
    const saveAsText = projectFileText('projectFileSaveAs', 'Save as');
    if (openLabel) openLabel.textContent = openText;
    if (launchOpenLabel) launchOpenLabel.textContent = projectFileRuntime.opening ? openText : projectFileText('projectFileOpenLaunch', 'Open project file');
    if (launchOpenDesc) launchOpenDesc.textContent = projectFileText('projectFileOpenLaunchDesc', 'Continue from an editable .basproject file.');
    if (saveLabel) saveLabel.textContent = saveText;
    if (saveAsLabel) saveAsLabel.textContent = saveAsText;
    if (openButton) openButton.setAttribute('aria-label', openText);
    if (launchOpenButton) launchOpenButton.setAttribute('aria-label', projectFileRuntime.opening ? openText : projectFileText('projectFileOpenLaunch', 'Open project file'));
    if (saveButton) saveButton.setAttribute('aria-label', saveText);
    if (saveAsButton) saveAsButton.setAttribute('aria-label', saveAsText);
}

function syncProjectFileText() {
    syncProjectFileUi();
}

async function buildBasProjectPackage() {
    if (typeof JSZip === 'undefined') throw new Error(projectFileText('projectFileZipUnavailable', 'Project files are unavailable because JSZip did not load.'));
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob) || !window.BASProjectEngine) {
        throw new Error(projectFileText('projectFileNoProject', 'Load a project before saving it.'));
    }

    const captured = BASProjectEngine.sync('project-file-save', { emit: false }) || BASProjectEngine.captureManifest();
    if (!captured || !BASProjectEngine.validateManifest(captured)) throw new Error(projectFileText('projectFileInvalidManifest', 'The current project could not be serialized.'));

    const exportedAt = projectFileNow();
    const manifest = projectFileClone(captured);
    manifest.project = manifest.project || {};
    manifest.project.dirty = false;
    manifest.project.updatedAt = exportedAt;

    const assets = projectFileSortAssets(BASProjectEngine.getAssets().filter(asset => !asset.transient && asset.blob instanceof Blob));
    const availableAssetKeys = new Set(assets.map(asset => String(asset.key || '')));
    for (const key of projectFileRequiredAssetKeys(manifest)) {
        if (!availableAssetKeys.has(key)) throw new Error(projectFileText(key === 'source' ? 'projectFileSourceMissing' : 'projectFileAssetMissing', key === 'source' ? 'The main project source is unavailable.' : 'A project asset is missing.'));
    }

    const manifestText = JSON.stringify(manifest, null, 2);
    const manifestSha256 = await projectFileSha256(manifestText);
    const assetIndex = [];

    for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        const path = projectFileAssetPath(asset, index);
        assetIndex.push({
            key: String(asset.key || ''),
            kind: String(asset.kind || 'asset'),
            path,
            name: String(asset.name || ''),
            size: Number(asset.size) || asset.blob.size || 0,
            mimeType: String(asset.type || asset.blob.type || ''),
            lastModified: Number(asset.lastModified) || 0,
            sha256: await projectFileSha256(asset.blob)
        });
    }

    const totalAssetBytes = assetIndex.reduce((total, asset) => total + asset.size, 0);
    const container = {
        format: BAS_PROJECT_FILE_FORMAT,
        containerVersion: BAS_PROJECT_FILE_CONTAINER_VERSION,
        exportedAt,
        createdBy: {
            app: 'Boot Animation Studio',
            release: BAS_PROJECT_FILE_RELEASE,
            projectEngineVersion: String(BASProjectEngine.engineVersion || ''),
            projectSchemaVersion: Number(BASProjectEngine.schemaVersion) || 0
        },
        project: {
            id: String(manifest.project.id || ''),
            name: String(manifest.project.name || projectFileBaseName(manifest)),
            revision: Number(manifest.project.revision) || 0
        },
        manifest: {
            path: 'project/manifest.json',
            sha256: manifestSha256,
            schemaVersion: Number(manifest.schemaVersion) || 0,
            engineVersion: String(manifest.engineVersion || '')
        },
        assets: assetIndex,
        stats: {
            assetCount: assetIndex.length,
            totalAssetBytes
        },
        policy: {
            transientAssetsIncluded: false,
            rebuildableDerivativesIncluded: false
        }
    };

    const zip = new JSZip();
    zip.file('basproject.json', JSON.stringify(container, null, 2), { compression: 'DEFLATE', compressionOptions: { level: 6 } });
    zip.file('project/manifest.json', manifestText, { compression: 'DEFLATE', compressionOptions: { level: 6 } });
    assets.forEach((asset, index) => {
        zip.file(assetIndex[index].path, asset.blob, { binary: true, compression: 'STORE' });
    });

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/x-boot-animation-studio-project', streamFiles: true });
    return {
        blob,
        filename: `${projectFileBaseName(manifest)}${BAS_PROJECT_FILE_EXTENSION}`,
        container,
        manifest
    };
}

function downloadBasProjectBlob(blob, filename) {
    if (typeof downloadGeneratedBlob === 'function') {
        downloadGeneratedBlob(blob, filename);
        return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function writeBasProjectResult(result, options = {}) {
    const saveAs = !!options.saveAs;
    if (projectFileSupportsNativeSave()) {
        let handle = saveAs ? null : projectFileRuntime.fileHandle;
        if (!handle) {
            handle = await window.showSaveFilePicker({
                suggestedName: result.filename,
                types: projectFilePickerTypes(),
                excludeAcceptAllOption: false
            });
        }
        const writable = await handle.createWritable();
        await writable.write(result.blob);
        await writable.close();
        projectFileRuntime.fileHandle = handle;
        projectFileRuntime.filename = handle.name || result.filename;
        projectFileRuntime.fileProjectId = currentProject && currentProject.projectMeta ? String(currentProject.projectMeta.id || '') : '';
        return 'native';
    }
    downloadBasProjectBlob(result.blob, result.filename);
    projectFileRuntime.filename = result.filename;
    projectFileRuntime.fileProjectId = currentProject && currentProject.projectMeta ? String(currentProject.projectMeta.id || '') : '';
    return 'download';
}

async function saveBasProjectFile(options = {}) {
    if (projectFileRuntime.saving || projectFileRuntime.opening) return null;
    projectFileSetBusy('save', true);
    try {
        const result = await buildBasProjectPackage();
        await writeBasProjectResult(result, options);
        if (typeof showToast === 'function') showToast(projectFileText('projectFileSaved', 'Project file saved.'), 'success');
        return result;
    } catch (error) {
        if (projectFileIsAbort(error)) return null;
        console.error(error);
        const message = error && error.message ? error.message : projectFileText('projectFileSaveFailed', 'Could not save the project file.');
        if (typeof showToast === 'function') showToast(message, 'error');
        else alert(message);
        return null;
    } finally {
        projectFileSetBusy('save', false);
    }
}

function projectFilePathIsSafe(path, prefix = '') {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\')) return false;
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) return false;
    if (prefix && !path.startsWith(prefix)) return false;
    return true;
}

function parseProjectFileJson(text, errorKey, fallback) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(projectFileText(errorKey, fallback));
    }
}

function migrateBasProjectContainer(container) {
    if (!container || typeof container !== 'object' || container.format !== BAS_PROJECT_FILE_FORMAT) {
        throw new Error(projectFileText('projectFileInvalidContainer', 'This is not a valid Boot Animation Studio project file.'));
    }
    let migrated = projectFileClone(container);
    let version = Number(migrated.containerVersion);
    if (!Number.isInteger(version) || version < 1) throw new Error(projectFileText('projectFileContainerUnsupported', 'This project-file version is not supported.'));
    if (version > BAS_PROJECT_FILE_CONTAINER_VERSION) throw new Error(projectFileText('projectFileContainerNewer', 'This project file was created by a newer Boot Animation Studio version.'));
    while (version < BAS_PROJECT_FILE_CONTAINER_VERSION) {
        const migration = BAS_PROJECT_FILE_CONTAINER_MIGRATIONS[version];
        if (typeof migration !== 'function') throw new Error(projectFileText('projectFileContainerUnsupported', 'This project-file version is not supported.'));
        migrated = migration(migrated);
        version = Number(migrated.containerVersion);
        if (!Number.isInteger(version)) throw new Error(projectFileText('projectFileInvalidContainer', 'This is not a valid Boot Animation Studio project file.'));
    }
    return migrated;
}

async function projectFileReadMetadataEntry(zip, path, errorKey, fallback) {
    const entry = zip.file(path);
    if (!entry || entry.dir) throw new Error(projectFileText(errorKey, fallback));
    const rawSize = Number(entry._data && entry._data.uncompressedSize);
    if (Number.isFinite(rawSize) && rawSize > BAS_PROJECT_FILE_METADATA_LIMIT) throw new Error(projectFileText('projectFileMetadataTooLarge', 'Project metadata is unexpectedly large.'));
    const text = await entry.async('string');
    if (new TextEncoder().encode(text).byteLength > BAS_PROJECT_FILE_METADATA_LIMIT) throw new Error(projectFileText('projectFileMetadataTooLarge', 'Project metadata is unexpectedly large.'));
    return text;
}

function projectFileRequiredAssetKeys(manifest) {
    const keys = new Set(['source']);
    const editor = manifest && manifest.editor ? manifest.editor : {};
    const library = editor.library && Array.isArray(editor.library.sources) ? editor.library.sources : [];
    library.forEach(source => {
        if (source && !source.isPrimary && source.id) keys.add(`source-library:${source.id}`);
    });
    const layers = editor.composition && Array.isArray(editor.composition.layers) ? editor.composition.layers : [];
    layers.forEach(layer => {
        if (layer && layer.type === 'image' && layer.id) keys.add(`composition:${layer.id}`);
    });
    const audio = editor.audio || {};
    ['intro', 'loop', 'final'].forEach(role => {
        const source = audio[role] && audio[role].source;
        if (source && source.kind === 'file') keys.add(`audio:${role}`);
    });
    const advancedParts = editor.advanced && Array.isArray(editor.advanced.parts) ? editor.advanced.parts : [];
    advancedParts.forEach(part => {
        if (part && part.id && part.audio && part.audio.sourceKind === 'file') keys.add(`advanced-audio:${part.id}`);
    });
    return keys;
}

async function readLoadedBasProjectPackage(zip) {
    if (!zip || typeof zip.file !== 'function') throw new Error(projectFileText('projectFileInvalidContainer', 'This is not a valid Boot Animation Studio project file.'));
    const containerText = await projectFileReadMetadataEntry(zip, 'basproject.json', 'projectFileMetadataMissing', 'Project metadata is missing.');
    const originalContainer = parseProjectFileJson(containerText, 'projectFileInvalidContainer', 'This is not a valid Boot Animation Studio project file.');
    const container = migrateBasProjectContainer(originalContainer);
    if (!container.manifest || !projectFilePathIsSafe(container.manifest.path, 'project/')) throw new Error(projectFileText('projectFileManifestMissing', 'The project manifest is missing.'));
    if (!Array.isArray(container.assets) || container.assets.length < 1 || container.assets.length > BAS_PROJECT_FILE_MAX_ASSETS) {
        throw new Error(projectFileText('projectFileAssetIndexInvalid', 'The project asset index is invalid.'));
    }

    const manifestText = await projectFileReadMetadataEntry(zip, container.manifest.path, 'projectFileManifestMissing', 'The project manifest is missing.');
    const expectedManifestHash = String(container.manifest.sha256 || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedManifestHash) || await projectFileSha256(manifestText) !== expectedManifestHash) {
        throw new Error(projectFileText('projectFileIntegrityFailed', 'Project-file integrity verification failed.'));
    }
    const originalManifest = parseProjectFileJson(manifestText, 'projectFileInvalidManifestOpen', 'The project manifest is invalid.');
    if (Number(container.manifest.schemaVersion) !== Number(originalManifest.schemaVersion)) throw new Error(projectFileText('projectFileInvalidManifestOpen', 'The project manifest is invalid.'));
    if (!window.BASProjectEngine || typeof BASProjectEngine.migrateManifest !== 'function') throw new Error(projectFileText('projectRestoreUnavailable', 'Project restoration is unavailable.'));
    const manifest = BASProjectEngine.migrateManifest(originalManifest);
    if (!BASProjectEngine.validateManifest(manifest)) throw new Error(projectFileText('projectFileInvalidManifestOpen', 'The project manifest is invalid.'));
    if (!['video', 'gif', 'image', 'bootanimation'].includes(String(manifest.source && manifest.source.type || ''))) throw new Error(projectFileText('projectFileInvalidManifestOpen', 'The project manifest is invalid.'));

    const seenKeys = new Set();
    const seenPaths = new Set();
    const assetMap = new Map();
    let totalAssetBytes = 0;
    for (const descriptor of container.assets) {
        if (!descriptor || typeof descriptor !== 'object') throw new Error(projectFileText('projectFileAssetIndexInvalid', 'The project asset index is invalid.'));
        const key = String(descriptor.key || '');
        const path = String(descriptor.path || '');
        const size = Number(descriptor.size);
        const expectedHash = String(descriptor.sha256 || '').toLowerCase();
        if (!key || seenKeys.has(key) || !projectFilePathIsSafe(path, 'assets/') || seenPaths.has(path) || !Number.isFinite(size) || size < 0 || !/^[a-f0-9]{64}$/.test(expectedHash)) {
            throw new Error(projectFileText('projectFileAssetIndexInvalid', 'The project asset index is invalid.'));
        }
        seenKeys.add(key);
        seenPaths.add(path);
        const entry = zip.file(path);
        if (!entry || entry.dir) throw new Error(projectFileText('projectFileAssetMissing', 'A project asset is missing.'));
        const rawSize = Number(entry._data && entry._data.uncompressedSize);
        if (Number.isFinite(rawSize) && rawSize !== size) throw new Error(projectFileText('projectFileIntegrityFailed', 'Project-file integrity verification failed.'));
        const rawBlob = await entry.async('blob');
        if (rawBlob.size !== size || await projectFileSha256(rawBlob) !== expectedHash) throw new Error(projectFileText('projectFileIntegrityFailed', 'Project-file integrity verification failed.'));
        const mimeType = String(descriptor.mimeType || '');
        const blob = mimeType && rawBlob.type !== mimeType ? rawBlob.slice(0, rawBlob.size, mimeType) : rawBlob;
        totalAssetBytes += blob.size;
        assetMap.set(key, {
            key,
            kind: String(descriptor.kind || 'asset'),
            name: String(descriptor.name || ''),
            type: mimeType || blob.type || '',
            mimeType: mimeType || blob.type || '',
            size: blob.size,
            lastModified: Number(descriptor.lastModified) || 0,
            blob
        });
    }

    const requiredAssetKeys = projectFileRequiredAssetKeys(manifest);
    for (const key of requiredAssetKeys) {
        if (!assetMap.has(key)) throw new Error(projectFileText('projectFileAssetMissing', 'A project asset is missing.'));
    }
    if (container.stats && Number.isFinite(Number(container.stats.assetCount)) && Number(container.stats.assetCount) !== assetMap.size) throw new Error(projectFileText('projectFileIntegrityFailed', 'Project-file integrity verification failed.'));
    if (container.stats && Number.isFinite(Number(container.stats.totalAssetBytes)) && Number(container.stats.totalAssetBytes) !== totalAssetBytes) throw new Error(projectFileText('projectFileIntegrityFailed', 'Project-file integrity verification failed.'));

    return { container, manifest, originalManifest, assetMap, totalAssetBytes };
}

async function readBasProjectPackage(blob) {
    if (typeof JSZip === 'undefined') throw new Error(projectFileText('projectFileZipUnavailable', 'Project files are unavailable because JSZip did not load.'));
    if (!(blob instanceof Blob)) throw new Error(projectFileText('projectFileInvalidContainer', 'This is not a valid Boot Animation Studio project file.'));
    let zip;
    try {
        zip = await JSZip.loadAsync(blob);
    } catch (error) {
        throw new Error(projectFileText('projectFileInvalidContainer', 'This is not a valid Boot Animation Studio project file.'));
    }
    return await readLoadedBasProjectPackage(zip);
}

async function protectCurrentProjectBeforeOpen() {
    if (!currentProject || !currentProject.projectMeta || !currentProject.projectMeta.dirty) return true;
    if (window.BASAutosave && typeof BASAutosave.save === 'function') {
        const saved = await BASAutosave.save('before-project-file-open');
        if (saved) return true;
    }
    const warning = projectFileText('projectFileReplaceDirtyConfirm', 'The current project could not be backed up automatically. Open another project anyway?');
    return typeof window.confirm !== 'function' || window.confirm(warning);
}

function setProjectFileLoading(message) {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('txt-loading-timeline');
    if (overlay) overlay.style.display = 'flex';
    if (loadingText) loadingText.textContent = message;
}

function hideProjectFileLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

async function openBasProjectBlob(blob, options = {}) {
    if (projectFileRuntime.opening || projectFileRuntime.saving) return null;
    projectFileSetBusy('open', true);
    setProjectFileLoading(projectFileText('projectFileVerifying', 'Verifying project file...'));
    try {
        const packageData = await readBasProjectPackage(blob);
        if (!await protectCurrentProjectBeforeOpen()) return null;
        setProjectFileLoading(projectFileText('projectFileRestoring', 'Opening project...'));
        if (!window.BASProjectRestore) throw new Error(projectFileText('projectRestoreUnavailable', 'Project restoration is unavailable.'));
        await BASProjectRestore.restore(packageData.manifest, packageData.assetMap, { reason: 'project-file-open' });
        projectFileRuntime.fileHandle = options.fileHandle || null;
        projectFileRuntime.filename = options.filename || options.fileHandle && options.fileHandle.name || blob.name || `${projectFileBaseName(packageData.manifest)}${BAS_PROJECT_FILE_EXTENSION}`;
        projectFileRuntime.fileProjectId = currentProject && currentProject.projectMeta ? String(currentProject.projectMeta.id || '') : '';
        if (window.BASAutosave && typeof BASAutosave.save === 'function') BASAutosave.save('project-file-open');
        if (typeof showToast === 'function') showToast(projectFileText('projectFileOpened', 'Project opened.'), 'success');
        return packageData;
    } catch (error) {
        if (projectFileIsAbort(error)) return null;
        console.error(error);
        const message = error && error.message ? error.message : projectFileText('projectFileOpenFailed', 'Could not open the project file.');
        if (typeof showToast === 'function') showToast(message, 'error');
        else alert(message);
        return null;
    } finally {
        hideProjectFileLoading();
        projectFileSetBusy('open', false);
    }
}

async function chooseBasProjectFile() {
    if (projectFileRuntime.opening || projectFileRuntime.saving) return null;
    if (projectFileSupportsNativeOpen()) {
        try {
            const handles = await window.showOpenFilePicker({
                multiple: false,
                types: projectFilePickerTypes(),
                excludeAcceptAllOption: false
            });
            const handle = handles && handles[0];
            if (!handle) return null;
            const file = await handle.getFile();
            return await openBasProjectBlob(file, { fileHandle: handle, filename: file.name });
        } catch (error) {
            if (projectFileIsAbort(error)) return null;
            console.error(error);
            const message = error && error.message ? error.message : projectFileText('projectFileOpenFailed', 'Could not open the project file.');
            if (typeof showToast === 'function') showToast(message, 'error');
            else alert(message);
            return null;
        }
    }
    document.getElementById('p12-open-project-input')?.click();
    return null;
}

function handleProjectFileInput(event) {
    const input = event.currentTarget;
    const file = input && input.files ? input.files[0] : null;
    if (input) input.value = '';
    if (!file) return;
    openBasProjectBlob(file, { filename: file.name });
}

function bindProjectFile() {
    if (projectFileRuntime.initialized) return;
    projectFileRuntime.initialized = true;
    document.getElementById('p12-open-project')?.addEventListener('click', chooseBasProjectFile);
    document.getElementById('p12-open-project-launch')?.addEventListener('click', chooseBasProjectFile);
    document.getElementById('p12-open-project-input')?.addEventListener('change', handleProjectFileInput);
    document.getElementById('p12-save-project')?.addEventListener('click', () => saveBasProjectFile({ saveAs: false }));
    document.getElementById('p12-save-project-as')?.addEventListener('click', () => saveBasProjectFile({ saveAs: true }));
    window.addEventListener('bas:projectchange', event => {
        const detail = event.detail || {};
        const projectId = String(detail.projectId || '');
        if (projectFileRuntime.fileProjectId && projectId && projectId !== projectFileRuntime.fileProjectId) projectFileClearHandle();
        syncProjectFileUi();
    });
    syncProjectFileUi();
}

window.BASProjectFile = Object.freeze({
    format: BAS_PROJECT_FILE_FORMAT,
    extension: BAS_PROJECT_FILE_EXTENSION,
    containerVersion: BAS_PROJECT_FILE_CONTAINER_VERSION,
    release: BAS_PROJECT_FILE_RELEASE,
    build: buildBasProjectPackage,
    save: saveBasProjectFile,
    saveAs: () => saveBasProjectFile({ saveAs: true }),
    chooseOpen: chooseBasProjectFile,
    open: openBasProjectBlob,
    read: readBasProjectPackage,
    readLoaded: readLoadedBasProjectPackage,
    migrateContainer: migrateBasProjectContainer
});
window.saveBasProjectFile = saveBasProjectFile;
window.openBasProjectFile = chooseBasProjectFile;
window.syncProjectFileText = syncProjectFileText;
window.addEventListener('DOMContentLoaded', bindProjectFile);
