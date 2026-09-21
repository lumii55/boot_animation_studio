const BAS_PWA_VERSION = '13.3';
const basPwaState = {
    version: BAS_PWA_VERSION,
    supported: 'serviceWorker' in navigator,
    secureContext: window.isSecureContext,
    registration: null,
    error: null,
    installPrompt: null,
    installed: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    updateAvailable: false,
    updateDismissed: false,
    reloadRequested: false,
    reloading: false,
    online: navigator.onLine,
    offlineReady: !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    hadControllerAtLoad: !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    fileHandlingSupported: 'launchQueue' in window && !!window.launchQueue && typeof window.launchQueue.setConsumer === 'function'
};
window.BASPWA = basPwaState;

function pwaText(key, fallback) {
    try {
        if (typeof traducoes !== 'undefined' && typeof idiomaAtual !== 'undefined') {
            const table = traducoes[idiomaAtual] || traducoes.en;
            if (table && table[key]) return table[key];
        }
    } catch (_) {}
    return fallback;
}

function syncPwaText() {
    const bindings = {
        'pwa-install-kicker': ['pwaInstallKicker', 'APP'],
        'pwa-install-title': ['pwaInstallTitle', 'Install Boot Animation Studio'],
        'pwa-install-desc': ['pwaInstallDesc', 'Open the Studio in its own window and keep the app shell available offline.'],
        'pwa-install-button-label': ['pwaInstallButton', 'Install app'],
        'pwa-update-title': ['pwaUpdateTitle', 'Update available'],
        'pwa-update-desc': ['pwaUpdateDesc', 'A newer version of Boot Animation Studio is ready.'],
        'pwa-update-later-label': ['pwaUpdateLater', 'Later'],
        'pwa-update-reload-label': ['pwaUpdateReload', 'Reload to update']
    };
    Object.entries(bindings).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = pwaText(value[0], value[1]);
    });
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) installButton.setAttribute('aria-label', pwaText('pwaInstallButton', 'Install app'));
}

function syncPwaInstallUi() {
    const card = document.getElementById('pwa-install-card');
    if (!card) return;
    card.hidden = basPwaState.installed || !basPwaState.installPrompt;
}

function syncPwaUpdateUi() {
    const banner = document.getElementById('pwa-update-banner');
    if (!banner) return;
    banner.hidden = !basPwaState.updateAvailable || basPwaState.updateDismissed;
}

function setPwaUpdateAvailable(value) {
    basPwaState.updateAvailable = !!value;
    if (value) basPwaState.updateDismissed = false;
    syncPwaUpdateUi();
}

function watchPwaRegistration(registration) {
    if (!registration) return;
    if (registration.waiting && navigator.serviceWorker.controller) setPwaUpdateAvailable(true);
    registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                setTimeout(() => setPwaUpdateAvailable(!!registration.waiting), 0);
            }
        });
    });
}

async function registerBASPWA() {
    if (!basPwaState.supported || !basPwaState.secureContext) return null;
    try {
        basPwaState.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
        watchPwaRegistration(basPwaState.registration);
        return basPwaState.registration;
    } catch (error) {
        basPwaState.error = error;
        return null;
    }
}

async function requestBASInstall() {
    const promptEvent = basPwaState.installPrompt;
    if (!promptEvent || basPwaState.installed) return false;
    try {
        const result = await promptEvent.prompt();
        basPwaState.installPrompt = null;
        if (result && result.outcome === 'accepted') basPwaState.installed = true;
        syncPwaInstallUi();
        return !!(result && result.outcome === 'accepted');
    } catch (error) {
        basPwaState.error = error;
        basPwaState.installPrompt = null;
        syncPwaInstallUi();
        return false;
    }
}

async function protectProjectBeforePwaReload() {
    const dirty = typeof currentProject !== 'undefined' && !!(currentProject && currentProject.projectMeta && currentProject.projectMeta.dirty);
    if (!dirty) return true;
    if (window.BASAutosave && typeof BASAutosave.save === 'function') {
        const saved = await BASAutosave.save('pwa-update');
        if (saved) return true;
    }
    const message = pwaText('pwaUpdateBackupFailed', 'The current project could not be backed up. Save it before reloading to update.');
    if (typeof showToast === 'function') showToast(message, 'error', 5200);
    return false;
}

async function reloadForBASUpdate() {
    if (basPwaState.reloading) return false;
    if (!await protectProjectBeforePwaReload()) return false;
    const registration = basPwaState.registration;
    const waiting = registration && registration.waiting;
    if (!waiting) {
        basPwaState.reloading = true;
        location.reload();
        return true;
    }
    basPwaState.reloadRequested = true;
    waiting.postMessage({ type: 'BAS_SKIP_WAITING' });
    return true;
}

function dismissBASUpdate() {
    basPwaState.updateDismissed = true;
    syncPwaUpdateUi();
}

function bindBASFileLaunchQueue() {
    if (!basPwaState.fileHandlingSupported) return;
    window.launchQueue.setConsumer(async launchParams => {
        const handle = launchParams && launchParams.files && launchParams.files[0];
        if (!handle || typeof handle.getFile !== 'function' || !window.BASProjectFile || typeof BASProjectFile.open !== 'function') return;
        try {
            const file = await handle.getFile();
            if (!file || !String(file.name || '').toLowerCase().endsWith('.basproject')) return;
            await BASProjectFile.open(file, { fileHandle: handle, filename: file.name });
        } catch (error) {
            basPwaState.error = error;
            const message = error && error.message ? error.message : pwaText('projectFileOpenFailed', 'Could not open the project file.');
            if (typeof showToast === 'function') showToast(message, 'error');
        }
    });
}

function bindBASPWAUi() {
    document.getElementById('pwa-install-button')?.addEventListener('click', requestBASInstall);
    document.getElementById('pwa-update-later')?.addEventListener('click', dismissBASUpdate);
    document.getElementById('pwa-update-reload')?.addEventListener('click', reloadForBASUpdate);
    syncPwaText();
    syncPwaInstallUi();
    syncPwaUpdateUi();
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    basPwaState.installPrompt = event;
    basPwaState.installed = false;
    syncPwaInstallUi();
});

window.addEventListener('appinstalled', () => {
    basPwaState.installed = true;
    basPwaState.installPrompt = null;
    syncPwaInstallUi();
});

window.addEventListener('online', () => {
    basPwaState.online = true;
});

window.addEventListener('offline', () => {
    basPwaState.online = false;
});

if (basPwaState.supported) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        basPwaState.offlineReady = true;
        if (basPwaState.reloadRequested && !basPwaState.reloading) {
            basPwaState.reloading = true;
            location.reload();
            return;
        }
        if (basPwaState.hadControllerAtLoad && navigator.serviceWorker.controller) setPwaUpdateAvailable(true);
        basPwaState.hadControllerAtLoad = !!navigator.serviceWorker.controller;
    });
}

bindBASFileLaunchQueue();
window.addEventListener('DOMContentLoaded', bindBASPWAUi, { once: true });
window.addEventListener('load', registerBASPWA, { once: true });
window.syncPwaText = syncPwaText;
window.requestBASInstall = requestBASInstall;
window.reloadForBASUpdate = reloadForBASUpdate;
