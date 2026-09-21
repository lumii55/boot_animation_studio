const BAS_PROJECT_RESTORE_VERSION = '13.2';

function projectRestoreText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual];
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function projectRestoreFile(asset, fallbackName = 'source.bin') {
    if (!asset || !(asset.blob instanceof Blob)) return null;
    if (typeof File !== 'undefined' && asset.blob instanceof File) return asset.blob;
    try {
        return new File([asset.blob], asset.name || fallbackName, {
            type: asset.type || asset.mimeType || asset.blob.type || '',
            lastModified: Number(asset.lastModified) || Date.now()
        });
    } catch (error) {
        return asset.blob;
    }
}

function waitForProjectRestoreCondition(check, timeout = 30000, interval = 40) {
    return new Promise((resolve, reject) => {
        const started = performance.now();
        const run = () => {
            try {
                if (check()) {
                    resolve();
                    return;
                }
            } catch (error) {}
            if (performance.now() - started >= timeout) {
                reject(new Error(projectRestoreText('projectRestoreTimeout', 'Timed out while restoring the project.')));
                return;
            }
            setTimeout(run, interval);
        };
        run();
    });
}

async function openProjectRestoreSource(manifest, sourceAsset) {
    if (!manifest || !manifest.source) throw new Error(projectRestoreText('projectRestoreInvalid', 'The project cannot be restored.'));
    const sourceName = manifest.source.name || sourceAsset && sourceAsset.name || 'source';
    const blob = projectRestoreFile(sourceAsset, sourceName);
    if (!blob) throw new Error(projectRestoreText('projectFileSourceMissing', 'The main project source is unavailable.'));
    const type = manifest.source.type || 'video';
    if (type === 'bootanimation') {
        await abrirZipNoEditor(blob);
    } else if (type === 'gif') {
        await converterGifParaVideo(blob);
    } else if (type === 'image' && typeof openImageSourceInEditor === 'function') {
        await openImageSourceInEditor(blob, { sourceName });
    } else if (typeof openVideoSourceInEditor === 'function') {
        openVideoSourceInEditor(blob, { sourceName });
    } else {
        throw new Error(projectRestoreText('projectRestoreLoaderUnavailable', 'The source loader required by this project is unavailable.'));
    }
    await waitForProjectRestoreCondition(() => !!currentProject && currentProject.sourceType === type && !!currentProject.sourceBlob && playerVideo && playerVideo.readyState >= 1, 30000);
    await waitForProjectRestoreCondition(() => typeof isBuildingTimeline === 'undefined' || !isBuildingTimeline, 30000);
}

async function restoreProjectFromManifest(manifest, assetMap = new Map(), options = {}) {
    if (!window.BASProjectEngine) throw new Error(projectRestoreText('projectRestoreUnavailable', 'Project restoration is unavailable.'));
    const migratedManifest = typeof BASProjectEngine.migrateManifest === 'function'
        ? BASProjectEngine.migrateManifest(manifest)
        : manifest;
    if (!BASProjectEngine.validateManifest(migratedManifest)) throw new Error(projectRestoreText('projectRestoreInvalid', 'The project cannot be restored.'));
    const sourceAsset = assetMap instanceof Map ? assetMap.get('source') : null;
    if (!sourceAsset || !(sourceAsset.blob instanceof Blob)) throw new Error(projectRestoreText('projectFileSourceMissing', 'The main project source is unavailable.'));

    if (typeof startManualMode === 'function') startManualMode();
    await BASProjectEngine.suspend(async () => {
        await openProjectRestoreSource(migratedManifest, sourceAsset);
        const restored = BASProjectEngine.restoreState(migratedManifest, assetMap, { restoreUi: options.restoreUi !== false });
        if (!restored) throw new Error(projectRestoreText('projectRestoreInvalid', 'The project cannot be restored.'));
    });

    BASProjectEngine.sync(options.reason || 'restore', { baseline: true, emit: true });
    if (options.markClean !== false) BASProjectEngine.markClean();
    return { manifest: migratedManifest, project: currentProject };
}

window.BASProjectRestore = Object.freeze({
    version: BAS_PROJECT_RESTORE_VERSION,
    restore: restoreProjectFromManifest,
    openSource: openProjectRestoreSource,
    toFile: projectRestoreFile,
    waitForCondition: waitForProjectRestoreCondition
});
