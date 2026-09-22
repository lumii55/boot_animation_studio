const moduleTestRuntime = {
    staged: false,
    previewActive: false,
    metadata: null,
    browserBlob: null,
    browserFilename: 'bootanimation.zip',
    buildSource: false,
    buildStale: false,
    busy: false
};

function moduleTestText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en || {};
        return table[key] || fallback;
    } catch (error) {
        return fallback;
    }
}

function moduleTestFormatBytes(value) {
    if (typeof formatUxBytes === 'function') return formatUxBytes(Number(value) || 0);
    const bytes = Number(value) || 0;
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function moduleTestSupported() {
    return isConnectedMode && typeof hasModuleFeature === 'function' && hasModuleFeature('test_staging');
}

function moduleTestMaxBytes() {
    const advertised = Number(moduleInfo?.max_direct_upload_bytes || 0);
    return advertised > 0 ? advertised : 0;
}

function moduleTestMetaText(meta) {
    if (!meta) return '';
    const format = String(meta.frame_format || '').toUpperCase() || '—';
    return `${meta.width || '—'} × ${meta.height || '—'} · ${meta.fps || '—'} FPS · ${format}`;
}

function syncModuleTestText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = moduleTestText(key, fallback);
    };
    set('module-workspace-tab-test-label', 'moduleWorkspaceTest', 'Test');
    set('module-test-kicker', 'moduleTestKicker', 'DEVICE TEST LAB');
    set('module-test-title', 'moduleTestTitle', 'Test a boot animation without applying it');
    set('module-test-desc', 'moduleTestDesc', 'Stage a bootanimation.zip temporarily, preview it on the phone, then apply only if you want to keep it.');
    set('module-test-file-label', 'moduleTestFileLabel', 'Choose bootanimation.zip');
    set('module-test-file-hint', 'moduleTestFileHint', 'The ZIP is validated and staged only for testing.');
    set('module-test-stage-label', 'moduleTestStage', 'Stage & test ZIP');
    set('module-test-replay-label', 'moduleTestReplay', 'Test again');
    set('module-test-stop-label', 'moduleTestStop', 'Stop test');
    set('module-test-apply-label', 'moduleTestApply', 'Apply staged animation');
    set('module-test-add-playlist-label', 'playlistAddStaged', 'Add to playlist');
    set('module-test-clear-label', 'moduleTestClear', 'Discard staged animation');
    set('build-test-button-title', 'buildTestButtonTitle', 'Test on phone');
    set('build-test-button-desc', 'buildTestButtonDesc', 'Generate once, preview on the connected phone, then apply or download the same build.');
    set('build-test-result-kicker', 'buildTestResultKicker', 'DEVICE TEST');
    set('build-test-result-title', 'buildTestResultTitle', 'Build staged on phone');
    set('build-test-result-desc', 'buildTestResultDesc', 'This exact generated build was tested. Apply or download it without generating again.');
    set('build-test-result-replay-label', 'moduleTestReplay', 'Test again');
    set('build-test-result-stop-label', 'moduleTestStop', 'Stop test');
    set('build-test-result-apply-label', 'buildTestApply', 'Apply tested build');
    set('build-test-result-download-label', 'buildTestDownload', 'Download tested build');
    set('build-test-result-playlist-label', 'playlistAddStaged', 'Add to playlist');
    set('build-test-result-discard-label', 'moduleTestClear', 'Discard');
    set('build-test-result-stale', 'buildTestStale', 'The project changed after this test. These actions still use the exact build that was tested.');
}

function syncModuleTestUi() {
    const supported = moduleTestSupported();
    const tab = document.getElementById('module-workspace-tab-test');
    if (tab) {
        tab.hidden = !supported;
        tab.style.display = supported ? '' : 'none';
    }
    const lab = document.getElementById('module-test-lab');
    if (lab && !supported) lab.hidden = true;

    const buildButton = document.getElementById('btn-test-build');
    if (buildButton) {
        const modulePackage = !!document.getElementById('input-gerar-modulo')?.checked;
        const buildReady = !document.getElementById('btn-gerar')?.classList.contains('btn-desativado');
        buildButton.hidden = !supported || modulePackage;
        buildButton.disabled = !buildReady || moduleTestRuntime.busy;
    }

    const badge = document.getElementById('module-test-badge');
    const title = document.getElementById('module-test-status-title');
    const detail = document.getElementById('module-test-status-detail');
    const metaBox = document.getElementById('module-test-meta');
    const metaOutput = document.getElementById('module-test-meta-output');
    const metaSize = document.getElementById('module-test-meta-size');
    const replay = document.getElementById('module-test-replay');
    const stop = document.getElementById('module-test-stop');
    const apply = document.getElementById('module-test-apply');
    const clear = document.getElementById('module-test-clear');
    const addPlaylist = document.getElementById('module-test-add-playlist');
    const stage = document.getElementById('module-test-stage');

    if (badge) badge.textContent = moduleTestRuntime.previewActive
        ? moduleTestText('moduleTestBadgePreviewing', 'PREVIEWING')
        : moduleTestRuntime.staged
            ? moduleTestText('moduleTestBadgeStaged', 'STAGED')
            : moduleTestText('moduleTestBadgeEmpty', 'NOT STAGED');
    if (title) title.textContent = moduleTestRuntime.previewActive
        ? moduleTestText('moduleTestPreviewing', 'Preview running on phone')
        : moduleTestRuntime.staged
            ? moduleTestText('moduleTestReady', 'Staged animation ready')
            : moduleTestText('moduleTestEmpty', 'No staged animation');
    const largeStage = Array.isArray(moduleTestRuntime.metadata?.warnings) && moduleTestRuntime.metadata.warnings.includes('large_boot_animation');
    if (detail) detail.textContent = moduleTestRuntime.previewActive
        ? moduleTestText('moduleTestPreviewingDesc', 'The phone will stop the preview automatically after about 15 seconds.')
        : moduleTestRuntime.staged
            ? largeStage
                ? moduleTestText('moduleTestLargeWarning', 'This is a large boot animation. Test playback carefully before applying it permanently.')
                : moduleTestText('moduleTestReadyDesc', 'Test it again, apply it permanently, or discard it.')
            : moduleTestText('moduleTestEmptyDesc', 'Choose a ZIP to begin.');
    if (metaBox) metaBox.hidden = !moduleTestRuntime.staged;
    if (metaOutput) metaOutput.textContent = moduleTestMetaText(moduleTestRuntime.metadata) || '—';
    if (metaSize) metaSize.textContent = moduleTestRuntime.metadata ? moduleTestFormatBytes(moduleTestRuntime.metadata.size_bytes) : '—';
    if (replay) replay.hidden = !moduleTestRuntime.staged || moduleTestRuntime.previewActive;
    if (stop) stop.hidden = !moduleTestRuntime.previewActive;
    if (apply) apply.hidden = !moduleTestRuntime.staged;
    if (clear) clear.hidden = !moduleTestRuntime.staged;
    if (addPlaylist) addPlaylist.hidden = !moduleTestRuntime.staged || !(typeof hasModuleFeature === 'function' && hasModuleFeature('playlists'));
    if (stage) stage.disabled = moduleTestRuntime.busy;

    const result = document.getElementById('build-test-result');
    if (result) result.hidden = !(moduleTestRuntime.buildSource && moduleTestRuntime.staged);
    const resultBadge = document.getElementById('build-test-result-badge');
    if (resultBadge) resultBadge.textContent = moduleTestRuntime.previewActive
        ? moduleTestText('moduleTestBadgePreviewing', 'PREVIEWING')
        : moduleTestText('moduleTestBadgeStaged', 'STAGED');
    const resultOutput = document.getElementById('build-test-result-output');
    const resultSize = document.getElementById('build-test-result-size');
    if (resultOutput) resultOutput.textContent = moduleTestMetaText(moduleTestRuntime.metadata) || '—';
    if (resultSize) resultSize.textContent = moduleTestRuntime.metadata ? moduleTestFormatBytes(moduleTestRuntime.metadata.size_bytes) : '—';
    const resultReplay = document.getElementById('build-test-result-replay');
    const resultStop = document.getElementById('build-test-result-stop');
    const resultApply = document.getElementById('build-test-result-apply');
    const resultDownload = document.getElementById('build-test-result-download');
    const resultPlaylist = document.getElementById('build-test-result-playlist');
    const resultDiscard = document.getElementById('build-test-result-discard');
    if (resultReplay) resultReplay.hidden = moduleTestRuntime.previewActive;
    if (resultStop) resultStop.hidden = !moduleTestRuntime.previewActive;
    if (resultApply) resultApply.disabled = moduleTestRuntime.busy;
    if (resultDownload) resultDownload.disabled = !moduleTestRuntime.browserBlob || moduleTestRuntime.busy;
    if (resultPlaylist) {
        resultPlaylist.hidden = !(typeof hasModuleFeature === 'function' && hasModuleFeature('playlists'));
        resultPlaylist.disabled = moduleTestRuntime.busy;
    }
    if (resultDiscard) resultDiscard.disabled = moduleTestRuntime.busy;
    const stale = document.getElementById('build-test-result-stale');
    if (stale) stale.hidden = !moduleTestRuntime.buildStale;
    syncModuleTestText();
}

async function moduleTestRequest(path, options = {}) {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || moduleTestText('moduleTestError', 'Device test failed.'));
    return data;
}

async function refreshModuleTestStatus() {
    if (!moduleTestSupported()) {
        moduleTestRuntime.staged = false;
        moduleTestRuntime.previewActive = false;
        moduleTestRuntime.metadata = null;
        syncModuleTestUi();
        return;
    }
    try {
        const data = await moduleTestRequest('/test/status');
        moduleTestRuntime.staged = Boolean(data.has_staged);
        moduleTestRuntime.previewActive = Boolean(data.preview_active);
        moduleTestRuntime.metadata = moduleTestRuntime.staged ? data : null;
        if (!moduleTestRuntime.staged) {
            moduleTestRuntime.browserBlob = null;
            moduleTestRuntime.buildSource = false;
            moduleTestRuntime.buildStale = false;
        }
    } catch (error) {
        moduleTestRuntime.previewActive = false;
    }
    syncModuleTestUi();
}

async function stageModuleTestBlob(blob, filename = 'bootanimation.zip', options = {}) {
    if (!moduleTestSupported()) throw new Error(moduleTestText('msgFeatureUnavailable', 'This feature is not available with the connected module.'));
    const maxBytes = moduleTestMaxBytes();
    if (maxBytes > 0 && blob.size > maxBytes) {
        throw new Error(moduleTestText('moduleTestTooLarge', 'This ZIP exceeds the module transport safety limit ({limit}).').replace('{limit}', moduleTestFormatBytes(maxBytes)));
    }
    moduleTestRuntime.busy = true;
    syncModuleTestUi();
    try {
        const formData = new FormData();
        formData.append('bootanimation', blob, 'bootanimation.zip');
        const data = await moduleTestRequest('/test/stage', { method: 'POST', body: formData });
        moduleTestRuntime.staged = true;
        moduleTestRuntime.previewActive = false;
        moduleTestRuntime.metadata = data;
        moduleTestRuntime.browserBlob = blob;
        moduleTestRuntime.browserFilename = filename || 'bootanimation.zip';
        moduleTestRuntime.buildSource = options.source === 'build';
        moduleTestRuntime.buildStale = false;
        await startModuleTestPreview();
        return data;
    } finally {
        moduleTestRuntime.busy = false;
        syncModuleTestUi();
    }
}

async function startModuleTestPreview() {
    if (!moduleTestRuntime.staged) throw new Error(moduleTestText('moduleTestNoStage', 'No staged animation is available.'));
    moduleTestRuntime.busy = true;
    syncModuleTestUi();
    try {
        await moduleTestRequest('/test/start', { method: 'POST' });
        moduleTestRuntime.previewActive = true;
        if (typeof showToast === 'function') showToast(moduleTestText('moduleTestStarted', 'Device test started.'), 'success', 3200);
        setTimeout(() => refreshModuleTestStatus(), 16000);
    } finally {
        moduleTestRuntime.busy = false;
        syncModuleTestUi();
    }
}

async function stopModuleTestPreview() {
    if (!moduleTestSupported()) return;
    moduleTestRuntime.busy = true;
    syncModuleTestUi();
    try {
        await moduleTestRequest('/test/stop', { method: 'POST' });
        moduleTestRuntime.previewActive = false;
        if (typeof showToast === 'function') showToast(moduleTestText('moduleTestStopped', 'Device test stopped.'), 'info', 2400);
    } finally {
        moduleTestRuntime.busy = false;
        syncModuleTestUi();
    }
}

async function applyModuleTestStage() {
    if (!moduleTestRuntime.staged) return;
    if (moduleTestRuntime.previewActive) await stopModuleTestPreview();
    moduleTestRuntime.busy = true;
    syncModuleTestUi();
    try {
        await moduleTestRequest('/test/apply', { method: 'POST' });
        window.hasCustomAnimApplied = true;
        const removeButton = document.getElementById('btn-remove');
        if (removeButton && typeof hasModuleFeature === 'function' && hasModuleFeature('remove')) removeButton.style.display = 'flex';
        if (typeof loadHistory === 'function' && hasModuleFeature('history')) await loadHistory();
        if (typeof syncConnectedDeviceSurfaces === 'function') syncConnectedDeviceSurfaces();
        if (typeof showToast === 'function') showToast(moduleTestText('moduleTestApplied', 'Tested animation applied successfully.'), 'success', 3600);
        moduleTestRuntime.staged = false;
        moduleTestRuntime.previewActive = false;
        moduleTestRuntime.metadata = null;
        moduleTestRuntime.browserBlob = null;
        moduleTestRuntime.browserFilename = 'bootanimation.zip';
        moduleTestRuntime.buildSource = false;
        moduleTestRuntime.buildStale = false;
    } finally {
        moduleTestRuntime.busy = false;
        syncModuleTestUi();
    }
}

async function clearModuleTestStage() {
    if (!moduleTestSupported()) return;
    moduleTestRuntime.busy = true;
    syncModuleTestUi();
    try {
        await moduleTestRequest('/test/clear', { method: 'POST' });
        moduleTestRuntime.staged = false;
        moduleTestRuntime.previewActive = false;
        moduleTestRuntime.metadata = null;
        moduleTestRuntime.browserBlob = null;
        moduleTestRuntime.buildSource = false;
        moduleTestRuntime.buildStale = false;
    } finally {
        moduleTestRuntime.busy = false;
        syncModuleTestUi();
    }
}

function downloadModuleTestBuild() {
    if (!moduleTestRuntime.browserBlob) return;
    if (typeof downloadGeneratedBlob === 'function') {
        downloadGeneratedBlob(moduleTestRuntime.browserBlob, moduleTestRuntime.browserFilename || 'bootanimation.zip');
        return;
    }
    const url = URL.createObjectURL(moduleTestRuntime.browserBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = moduleTestRuntime.browserFilename || 'bootanimation.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function stageSelectedModuleTestFile() {
    const input = document.getElementById('module-test-file');
    const file = input?.files?.[0];
    if (!file) {
        input?.click();
        return;
    }
    try {
        await stageModuleTestBlob(file, file.name || 'bootanimation.zip', { source: 'file' });
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 5000);
    }
}

function bindModuleTestUi() {
    document.getElementById('btn-test-build')?.addEventListener('click', () => {
        if (typeof requestDeviceBuildTest === 'function') requestDeviceBuildTest();
    });
    document.getElementById('module-test-stage')?.addEventListener('click', stageSelectedModuleTestFile);
    document.getElementById('module-test-file')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        const label = document.getElementById('module-test-file-label');
        if (label && file) label.textContent = file.name;
    });
    document.getElementById('module-test-replay')?.addEventListener('click', () => startModuleTestPreview().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('module-test-stop')?.addEventListener('click', () => stopModuleTestPreview().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('module-test-apply')?.addEventListener('click', () => applyModuleTestStage().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('module-test-clear')?.addEventListener('click', () => clearModuleTestStage().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('build-test-result-replay')?.addEventListener('click', () => startModuleTestPreview().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('build-test-result-stop')?.addEventListener('click', () => stopModuleTestPreview().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('build-test-result-apply')?.addEventListener('click', () => applyModuleTestStage().catch(error => showToast(error.message, 'error', 4800)));
    document.getElementById('build-test-result-download')?.addEventListener('click', downloadModuleTestBuild);
    document.getElementById('build-test-result-discard')?.addEventListener('click', () => clearModuleTestStage().catch(error => showToast(error.message, 'error', 4800)));
    window.addEventListener('bas:projectchange', event => {
        if (moduleTestRuntime.buildSource && moduleTestRuntime.staged && event.detail?.contentChanged) {
            moduleTestRuntime.buildStale = true;
            syncModuleTestUi();
        }
    });
    window.addEventListener('bas:languagechange', syncModuleTestUi);
    syncModuleTestUi();
}

window.BASModuleTest = Object.freeze({
    supported: moduleTestSupported,
    stageBlob: stageModuleTestBlob,
    start: startModuleTestPreview,
    stop: stopModuleTestPreview,
    apply: applyModuleTestStage,
    clear: clearModuleTestStage,
    download: downloadModuleTestBuild,
    refreshStatus: refreshModuleTestStatus,
    sync: syncModuleTestUi,
    state: () => ({ ...moduleTestRuntime })
});
window.addEventListener('DOMContentLoaded', bindModuleTestUi);
