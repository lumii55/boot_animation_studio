let buildDeliveryTarget = 'download';

function releaseText(key, fallback) {
    return window.BASI18n?.text?.(key, fallback) ?? fallback;
}

function rootModulePackagingEnabled() {
    return !!document.getElementById('input-gerar-modulo')?.checked;
}

function getBuildDeliveryTarget() {
    if (rootModulePackagingEnabled()) return 'download';
    const canControl = window.BASApi?.hasPermission?.('control') ?? true;
    return window.BASState.connectedMode && canControl && buildDeliveryTarget === 'phone' ? 'phone' : 'download';
}

function setBuildDeliveryTarget(target, options = {}) {
    if (target === 'phone' && rootModulePackagingEnabled()) {
        buildDeliveryTarget = 'download';
        syncReleaseUi();
        return;
    }
    if (target === 'phone' && !window.BASState.connectedMode) {
        window.BASApi?.connect?.();
        return;
    }
    if (target === 'phone' && window.BASApi?.hasPermission?.('control') === false) {
        buildDeliveryTarget = 'download';
        syncReleaseUi();
        return;
    }
    buildDeliveryTarget = target === 'phone' ? 'phone' : 'download';
    syncReleaseUi();
    window.BASProjectEngine?.touch?.('delivery-target', { emit: true });
    if (!options.skipButtons) window.BASTimelineControls?.refreshBuildControls?.();
}

function releaseSectionSummary() {
    let base;
    if (window.BASParts?.isActive?.()) {
        const parts = window.BASParts?.getParts?.() ?? [];
        const count = Array.isArray(parts) ? parts.length : 0;
        base = releaseText('releasePartsCount', '{count} parts').replace('{count}', String(count));
    } else {
        const markers = window.BASState.markers;
        const values = ['m0', 'm1', 'm2', 'm3'].map(key => markers[key]);
        const valid = values.every(Number.isFinite) && values[0] <= values[1] && values[1] <= values[2] && values[2] <= values[3];
        base = valid ? releaseText('releaseSimpleStructure', '3 sections') : releaseText('releaseStructurePending', 'Waiting for sections');
    }
    const layers = window.BASComposition?.getLayers?.().filter(layer => layer.visible !== false).length ?? 0;
    if (!layers) return base;
    return `${base} · ${releaseText(layers === 1 ? 'releaseLayerCountOne' : 'releaseLayerCount', layers === 1 ? '1 layer' : '{count} layers').replace('{count}', String(layers))}`;
}

function releaseAudioSummary() {
    if (window.BASParts?.isActive?.()) {
        const parts = window.BASParts?.getParts?.() ?? [];
        const active = Array.isArray(parts) && parts.some(part => part && part.audio && part.audio.mode && part.audio.mode !== 'none');
        return active ? releaseText('releaseAudioOn', 'Enabled') : releaseText('releaseAudioOff', 'Off');
    }
    const toggle = document.getElementById('input-usar-som');
    return toggle && toggle.checked ? releaseText('releaseAudioOn', 'Enabled') : releaseText('releaseAudioOff', 'Off');
}

function syncReleaseSummary() {
    const width = window.BASPerformance?.normalizeDimension?.(document.getElementById('input-largura')?.value, window.BASState.sourceWidth)
        ?? Math.max(1, parseInt(document.getElementById('input-largura')?.value, 10) || window.BASState.sourceWidth || 1);
    const height = window.BASPerformance?.normalizeDimension?.(document.getElementById('input-altura')?.value, window.BASState.sourceHeight)
        ?? Math.max(1, parseInt(document.getElementById('input-altura')?.value, 10) || window.BASState.sourceHeight || 1);
    const fps = Math.min(60, Math.max(1, parseInt(document.getElementById('input-fps')?.value, 10) || 30));
    const resolution = document.getElementById('release-summary-resolution');
    const frameRate = document.getElementById('release-summary-fps');
    const structure = document.getElementById('release-summary-structure');
    const audio = document.getElementById('release-summary-audio');
    if (resolution) resolution.textContent = width && height ? `${width} × ${height}` : '— × —';
    if (frameRate) frameRate.textContent = `${fps} FPS`;
    if (structure) structure.textContent = releaseSectionSummary();
    if (audio) audio.textContent = releaseAudioSummary();
}

function syncReleaseReadiness() {
    const title = document.getElementById('p11-build-ready-title');
    const desc = document.getElementById('p11-build-ready-desc');
    const box = document.querySelector('.build-readiness');
    const button = document.getElementById('btn-gerar');
    const hasMedia = document.getElementById('video-container')?.style.display === 'block';
    const ready = hasMedia && button && !button.classList.contains('btn-desativado');
    if (box) box.classList.toggle('is-ready', ready);
    if (title) title.textContent = ready ? releaseText('releaseReadyTitle', 'Ready to build') : releaseText('workspaceBuildReadyTitle', 'Ready when your sections are marked');
    if (desc) desc.textContent = ready ? releaseText('releaseReadyDesc', 'Choose a destination below, then generate the final animation.') : releaseText('workspaceBuildReadyDesc', 'The build button will unlock automatically when the project is valid.');
}

function syncReleaseDestination() {
    const connected = window.BASState.connectedMode;
    const modulePackage = rootModulePackagingEnabled();
    const canControl = window.BASApi?.hasPermission?.('control') ?? true;
    const permissionBlocked = connected && !canControl;
    if ((!connected || modulePackage || permissionBlocked) && buildDeliveryTarget === 'phone') buildDeliveryTarget = 'download';
    const activeTarget = getBuildDeliveryTarget();
    document.querySelectorAll('.delivery-option[data-delivery-target]').forEach(button => {
        const active = button.dataset.deliveryTarget === activeTarget;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const phone = document.getElementById('delivery-phone');
    if (phone) {
        phone.classList.toggle('needs-connection', !connected && !modulePackage);
        phone.classList.toggle('is-package-blocked', modulePackage);
        phone.disabled = modulePackage || permissionBlocked;
        phone.setAttribute('aria-disabled', phone.disabled ? 'true' : 'false');
        const desc = document.getElementById('p11-delivery-phone-desc');
        if (desc) desc.textContent = modulePackage
            ? releaseText('deliveryPhoneModuleBlockedDesc', 'Disable root module packaging to apply directly to the phone.')
            : permissionBlocked
                ? releaseText('deliveryPhonePermissionBlockedDesc', 'This trusted client can view the device but cannot apply animations.')
                : releaseText('deliveryPhoneDesc', 'Generate, install and save it to device history when available.');
    }
    const connect = document.getElementById('btn-build-connect');
    if (connect) connect.style.display = connected || modulePackage ? 'none' : 'flex';
    const badge = document.getElementById('p11-device-badge');
    if (badge) badge.textContent = releaseText('deviceOnlineBadge', 'MODULE ONLINE');
}

function syncReleaseUi() {
    syncReleaseSummary();
    syncReleaseReadiness();
    syncReleaseDestination();
    window.BASUX?.updateOutputIntent?.();
    window.BASCompatibility?.schedule?.();
    if (window.BASModuleTest?.sync) window.BASModuleTest.sync();
}

function bindReleaseUi() {
    document.querySelectorAll('.delivery-option[data-delivery-target]').forEach(button => {
        button.addEventListener('click', () => setBuildDeliveryTarget(button.dataset.deliveryTarget));
    });
    const connect = document.getElementById('btn-build-connect');
    if (connect) connect.addEventListener('click', () => {
        window.BASApi?.connect?.();
    });
    const deviceToggle = document.getElementById('editor-device-toggle');
    if (deviceToggle) deviceToggle.addEventListener('click', () => {
        if (!window.BASState.connectedMode) {
            window.BASApi?.connect?.();
            return;
        }
        const panel = document.getElementById('connected-state');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const watched = ['input-largura', 'input-altura', 'input-fps', 'input-usar-som', 'input-gerar-modulo', 'input-formato', 'input-qualidade', 'input-jpeg-quality'];
    watched.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.addEventListener('input', syncReleaseUi);
        element.addEventListener('change', syncReleaseUi);
    });
    const observer = new MutationObserver(syncReleaseUi);
    ['btn-gerar', 'connected-state', 'video-container', 'advanced-parts-editor', 'history-scroll'].forEach(id => {
        const element = document.getElementById(id);
        if (element) observer.observe(element, { attributes: true, childList: true, subtree: id === 'history-scroll' });
    });
    syncReleaseUi();
}

window.BASRelease = Object.freeze({
    getTarget: getBuildDeliveryTarget,
    setTarget: setBuildDeliveryTarget,
    sync: syncReleaseUi,
    summary: syncReleaseSummary
});
window.getBuildDeliveryTarget = getBuildDeliveryTarget;
window.setBuildDeliveryTarget = setBuildDeliveryTarget;
window.syncReleaseUi = syncReleaseUi;
window.addEventListener('DOMContentLoaded', bindReleaseUi);
