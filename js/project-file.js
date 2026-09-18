const BAS_PROJECT_FILE_CONTAINER_VERSION = 1;
const BAS_PROJECT_FILE_EXTENSION = '.basproject';
const BAS_PROJECT_FILE_FORMAT = 'boot-animation-studio-project-package';
const BAS_PROJECT_FILE_RELEASE = 'P12.11A';

const projectFileRuntime = {
    saving: false,
    initialized: false
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

function projectFileSetBusy(isBusy) {
    projectFileRuntime.saving = !!isBusy;
    syncProjectFileUi();
}

function syncProjectFileUi() {
    const button = document.getElementById('p12-save-project');
    if (!button) return;
    const available = !!(currentProject && currentProject.sourceBlob instanceof Blob && window.BASProjectEngine && typeof JSZip !== 'undefined');
    button.disabled = !available || projectFileRuntime.saving;
    button.dataset.busy = projectFileRuntime.saving ? 'true' : 'false';
    const label = document.getElementById('p12-save-project-label');
    if (label) label.textContent = projectFileRuntime.saving
        ? projectFileText('projectFileSaving', 'Saving...')
        : projectFileText('projectFileSave', 'Save project');
    button.setAttribute('aria-label', projectFileRuntime.saving
        ? projectFileText('projectFileSaving', 'Saving...')
        : projectFileText('projectFileSave', 'Save project'));
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
    if (!assets.some(asset => asset.key === 'source')) throw new Error(projectFileText('projectFileSourceMissing', 'The main project source is unavailable.'));

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

async function saveBasProjectFile() {
    if (projectFileRuntime.saving) return null;
    projectFileSetBusy(true);
    try {
        const result = await buildBasProjectPackage();
        downloadBasProjectBlob(result.blob, result.filename);
        if (typeof showToast === 'function') showToast(projectFileText('projectFileSaved', 'Project file saved.'), 'success');
        return result;
    } catch (error) {
        console.error(error);
        const message = error && error.message ? error.message : projectFileText('projectFileSaveFailed', 'Could not save the project file.');
        if (typeof showToast === 'function') showToast(message, 'error');
        else alert(message);
        return null;
    } finally {
        projectFileSetBusy(false);
    }
}

function bindProjectFile() {
    if (projectFileRuntime.initialized) return;
    projectFileRuntime.initialized = true;
    document.getElementById('p12-save-project')?.addEventListener('click', saveBasProjectFile);
    window.addEventListener('bas:projectchange', syncProjectFileUi);
    syncProjectFileUi();
}

window.BASProjectFile = Object.freeze({
    format: BAS_PROJECT_FILE_FORMAT,
    extension: BAS_PROJECT_FILE_EXTENSION,
    containerVersion: BAS_PROJECT_FILE_CONTAINER_VERSION,
    build: buildBasProjectPackage,
    save: saveBasProjectFile
});
window.saveBasProjectFile = saveBasProjectFile;
window.syncProjectFileText = syncProjectFileText;
window.addEventListener('DOMContentLoaded', bindProjectFile);
