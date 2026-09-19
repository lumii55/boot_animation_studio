const BAS_FINISH_CENTER_VERSION = '12.12A';
const finishRuntime = {
    result: null,
    projectId: '',
    revision: 0,
    stale: false
};

function finishText(key, fallback) {
    const table = typeof traducoes !== 'undefined' ? (traducoes[idiomaAtual] || traducoes.en || {}) : {};
    return table[key] || fallback;
}

function finishKindLabel(kind) {
    if (kind === 'installed') return finishText('finishKindPhone', 'APPLIED TO PHONE');
    if (kind === 'module') return finishText('finishKindModule', 'ROOT MODULE');
    return finishText('finishKindDownload', 'DOWNLOADED');
}

function finishTitle(kind) {
    if (kind === 'installed') return finishText('finishTitlePhone', 'Applied successfully');
    if (kind === 'module') return finishText('finishTitleModule', 'Root module ready');
    return finishText('finishTitleDownload', 'Download ready');
}

function finishDeliveryLabel(result) {
    if (result.kind === 'installed') return finishText('finishDeliveryPhone', 'Connected phone');
    return finishText('finishDeliveryDownload', 'This device');
}

function finishPackageLabel(result) {
    if (result.kind === 'module') return finishText('finishPackageModule', 'Root module');
    return finishText('finishPackageBoot', 'bootanimation.zip');
}

function finishFormatLabel(result) {
    const format = String(result.format || '').toLowerCase();
    if (format === 'png') return 'PNG';
    const quality = Math.round((Number(result.jpegQuality) || 0.9) * 100);
    return `JPEG ${quality}%`;
}

function finishProjectRevision() {
    return Number(currentProject?.projectMeta?.revision || 0);
}

function finishProjectId() {
    return String(currentProject?.projectMeta?.id || '');
}

function syncFinishCenterUi() {
    const panel = document.getElementById('finish-center');
    if (!panel) return;
    const result = finishRuntime.result;
    if (!result) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    panel.dataset.state = finishRuntime.stale ? 'stale' : 'current';
    panel.dataset.kind = result.kind || 'download';

    const badge = document.getElementById('finish-badge');
    const title = document.getElementById('finish-title');
    const desc = document.getElementById('finish-desc');
    const file = document.getElementById('finish-file');
    const size = document.getElementById('finish-size');
    const output = document.getElementById('finish-output');
    const packageValue = document.getElementById('finish-package');
    const delivery = document.getElementById('finish-delivery');
    const stale = document.getElementById('finish-stale');
    const history = document.getElementById('finish-open-history');

    if (badge) badge.textContent = finishRuntime.stale ? finishText('finishBadgeStale', 'PROJECT CHANGED') : finishKindLabel(result.kind);
    if (title) title.textContent = finishRuntime.stale ? finishText('finishTitleStale', 'Build is no longer current') : finishTitle(result.kind);
    if (desc) desc.textContent = finishRuntime.stale
        ? finishText('finishDescStale', 'The project changed after this build. Build again to include the latest edits.')
        : finishText('finishDescCurrent', 'This result reflects the project exactly as it was when the build finished.');
    if (file) file.textContent = result.filename || '—';
    if (size) size.textContent = typeof formatUxBytes === 'function' ? formatUxBytes(result.outputBytes) : `${result.outputBytes || 0} B`;
    if (output) output.textContent = `${result.width} × ${result.height} · ${result.fps} FPS · ${finishFormatLabel(result)}`;
    if (packageValue) packageValue.textContent = finishPackageLabel(result);
    if (delivery) delivery.textContent = finishDeliveryLabel(result);
    if (stale) stale.hidden = !finishRuntime.stale;

    if (history) {
        const historyAvailable = result.kind === 'installed' && isConnectedMode && (typeof hasModuleFeature !== 'function' || hasModuleFeature('history'));
        history.hidden = !historyAvailable;
    }
}

function recordFinishResult(deliveryResult, options) {
    if (!deliveryResult || !options) return;
    finishRuntime.result = {
        kind: deliveryResult.kind || 'download',
        filename: deliveryResult.filename || `${options.name || 'bootanimation'}.zip`,
        outputBytes: Number(deliveryResult.outputBytes) || 0,
        bootBytes: Number(deliveryResult.bootBytes) || 0,
        width: Number(options.width) || 0,
        height: Number(options.height) || 0,
        fps: Number(options.fps) || 0,
        format: String(options.format || 'jpeg'),
        jpegQuality: Number(options.jpegQuality) || 0.9
    };
    finishRuntime.projectId = finishProjectId();
    finishRuntime.revision = finishProjectRevision();
    finishRuntime.stale = false;
    syncFinishCenterUi();
    requestAnimationFrame(() => document.getElementById('finish-center')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function clearFinishResult() {
    finishRuntime.result = null;
    finishRuntime.projectId = '';
    finishRuntime.revision = 0;
    finishRuntime.stale = false;
    syncFinishCenterUi();
}

function bindFinishCenter() {
    document.getElementById('finish-save-project')?.addEventListener('click', () => {
        if (window.BASProjectFile?.save) BASProjectFile.save({ saveAs: false });
    });
    document.getElementById('finish-build-again')?.addEventListener('click', () => {
        const button = document.getElementById('btn-gerar');
        button?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        button?.focus({ preventScroll: true });
    });
    document.getElementById('finish-open-history')?.addEventListener('click', () => {
        const panel = document.getElementById('connected-state');
        const history = document.getElementById('history-wrapper');
        (history || panel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    window.addEventListener('bas:projectchange', event => {
        if (!finishRuntime.result) return;
        const detail = event.detail || {};
        const projectId = String(detail.projectId || '');
        if (finishRuntime.projectId && projectId && projectId !== finishRuntime.projectId) {
            clearFinishResult();
            return;
        }
        if (detail.contentChanged && Number(detail.revision || 0) > finishRuntime.revision) {
            finishRuntime.stale = true;
            syncFinishCenterUi();
        }
    });
    syncFinishCenterUi();
}

window.BASFinishCenter = Object.freeze({
    version: BAS_FINISH_CENTER_VERSION,
    record: recordFinishResult,
    clear: clearFinishResult,
    sync: syncFinishCenterUi
});
window.recordFinishResult = recordFinishResult;
window.syncFinishCenterUi = syncFinishCenterUi;
window.addEventListener('DOMContentLoaded', bindFinishCenter);
