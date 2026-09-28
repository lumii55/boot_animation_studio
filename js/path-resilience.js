const BAS_PATH_RESILIENCE_VERSION = 1;

function pathResilienceText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function pathResilienceSupported() {
    return !!isConnectedMode
        && typeof hasModuleFeature === 'function'
        && hasModuleFeature('path_environment_status')
        && hasModuleFeature('device_intelligence')
        && hasModuleFeature('rescan_paths');
}

function pathResilienceNeedsRescan() {
    if (!pathResilienceSupported()) return false;
    const boot = window.BASDeviceIntelligence?.getBoot?.();
    return boot?.path_environment_status === 'changed' && boot?.rescan_recommended === true;
}

function syncPathResilience() {
    const notice = document.getElementById('path-rescan-notice');
    if (!notice) return;
    const visible = pathResilienceNeedsRescan();
    notice.hidden = !visible;
    notice.dataset.state = visible ? 'warning' : 'ok';

    const title = document.getElementById('path-rescan-notice-title');
    const desc = document.getElementById('path-rescan-notice-desc');
    const label = document.getElementById('path-rescan-notice-action-label');
    if (title) title.textContent = pathResilienceText('pathRescanNoticeTitle', 'Boot animation path may have changed');
    if (desc) desc.textContent = pathResilienceText('pathRescanNoticeDesc', 'Android has changed since the last boot-path scan. Rescan now so BAS keeps targeting the correct boot animation location.');
    if (label) label.textContent = pathResilienceText('pathRescanNoticeAction', 'Rescan paths');

    const action = document.getElementById('path-rescan-notice-action');
    if (action) {
        const canManage = typeof hasModulePermission !== 'function' || hasModulePermission('manage');
        action.disabled = !canManage;
        action.hidden = !canManage;
    }
}

function bindPathResilience() {
    const action = document.getElementById('path-rescan-notice-action');
    action?.addEventListener('click', () => {
        if (typeof resetarModulo === 'function') resetarModulo();
    });
    window.addEventListener('bas:deviceintelligence', syncPathResilience);
    syncPathResilience();
}

window.BASPathResilience = Object.freeze({
    version: BAS_PATH_RESILIENCE_VERSION,
    supported: pathResilienceSupported,
    needsRescan: pathResilienceNeedsRescan,
    sync: syncPathResilience
});
window.syncPathResilience = syncPathResilience;
window.addEventListener('DOMContentLoaded', bindPathResilience);
