const BAS_CACHE = 'bas-shell-web-v7';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./","./index.html","./css/00-foundations-and-classic-ui.css?v=web-v4","./css/10-editor-workflow.css?v=web-v4","./css/20-modern-workflow.css?v=web-v4","./css/30-source-library-and-sequence.css?v=web-v4","./css/40-composition-and-timeline.css?v=web-v4","./css/50-editor-audio.css?v=web-v4","./css/60-compatibility-and-profiles.css?v=web-v4","./css/70-guidance-and-accessibility.css?v=web-v4","./css/80-module-workspace.css?v=web-v4","./css/90-device-security-and-diagnostics.css?v=web-v4","./styles.css?v=web-v4","./manifest.webmanifest?v=web-v4","./js/api.js?v=web-v4","./js/trust-client.js?v=web-v4","./js/multi-device.js?v=web-v4","./js/live-sync.js?v=web-v4","./js/connection-lifecycle.js?v=web-v4","./js/trust-center.js?v=web-v4","./js/health-center.js?v=web-v4","./js/audio.js?v=web-v4","./js/autosave.js?v=web-v4","./js/compatibility.js?v=web-v4","./js/composition.js?v=web-v4","./js/contextual.js?v=web-v4","./js/custom-profiles.js?v=web-v4","./js/device-intelligence.js?v=web-v4","./js/path-resilience.js?v=web-v4","./js/device-profile.js?v=web-v4","./js/export.js?v=web-v4","./js/history.js?v=web-v4","./js/help.js?v=web-v4","./js/locales/en.js?v=web-v4","./js/locales/pt.js?v=web-v4","./js/locales/es.js?v=web-v4","./js/locales/fr.js?v=web-v4","./js/locales/de.js?v=web-v4","./js/locales/it.js?v=web-v4","./js/locales/ja.js?v=web-v4","./js/locales/zh.js?v=web-v4","./js/i18n.js?v=web-v4","./js/loading-tips.js?v=web-v4","./js/master-sequence.js?v=web-v4","./js/media-seek.js?v=web-v4","./js/module-workspace.js?v=web-v4","./js/presence.js?v=web-v4","./js/developer-lab.js?v=web-v4","./js/regression-scanner.js?v=web-v4","./js/extended-device-scan.js?v=web-v4","./js/module-test.js?v=web-v4","./js/playlist.js?v=web-v4","./js/rotation.js?v=web-v4","./js/boot-queue.js?v=web-v4","./js/boot-activity.js?v=web-v4","./js/media.js?v=web-v4","./js/output-presets.js?v=web-v4","./js/parts.js?v=web-v4","./js/performance.js?v=web-v4","./js/project-engine.js?v=web-v4","./js/project-file.js?v=web-v4","./js/project-restore.js?v=web-v4","./js/project.js?v=web-v4","./js/pwa.js?v=web-v4","./js/release.js?v=web-v4","./js/finish.js?v=web-v4","./js/source-library.js?v=web-v4","./js/state.js?v=web-v4","./js/persistence-schema.js?v=web-v4","./js/public-compatibility.js?v=web-v4","./js/timeline-2.js?v=web-v4","./js/timeline-3.js?v=web-v4","./js/timeline.js?v=web-v4","./js/ux.js?v=web-v4","./js/workspace.js?v=web-v4","./vendor/jszip.min.js?v=web-v4","./vendor/gifuct.min.js?v=web-v4","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png"];
const BAS_SHELL_URLS = new Set(BAS_SHELL.map(path => new URL(path, self.location.href).href));
const BAS_INDEX_URL = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(BAS_CACHE).then(cache => cache.addAll(BAS_SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(BAS_CACHE_PREFIX) && key !== BAS_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
    );
});

function basModuleBaseAllowed(value) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'http:' || url.port !== '4040' || url.username || url.password) return false;
        const host = url.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
        const parts = host.split('.').map(Number);
        if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
        return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
    } catch (error) {
        return false;
    }
}

async function basFinishPageDisconnect(data) {
    const baseUrl = String(data?.baseUrl || '').replace(/\/$/, '');
    const token = String(data?.token || '');
    if (!token || !basModuleBaseAllowed(baseUrl)) return;
    const body = new URLSearchParams();
    body.set('token', token);
    body.set('reason', 'page_unload');
    try {
        const response = await fetch(baseUrl + '/disconnect/beacon', {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            body
        });
        if (response.ok || response.status === 401) return;
    } catch (error) {
    }
    try {
        await fetch(baseUrl + '/disconnect?reason=page_unload', {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            headers: { 'X-Boot-Creator-Token': token }
        });
    } catch (error) {
    }
}

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'BAS_SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    if (event.data && event.data.type === 'BAS_PAGE_DISCONNECT') {
        event.waitUntil(basFinishPageDisconnect(event.data));
    }
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request, { cache: 'no-store' });
                if (response && response.ok) {
                    const cache = await caches.open(BAS_CACHE);
                    await cache.put(BAS_INDEX_URL, response.clone());
                }
                return response;
            } catch (error) {
                const cached = await caches.match(BAS_INDEX_URL);
                if (cached) return cached;
                throw error;
            }
        })());
        return;
    }
    if (!BAS_SHELL_URLS.has(request.url)) return;
    event.respondWith((async () => {
        try {
            const response = await fetch(request, { cache: 'no-store' });
            if (response && response.ok) {
                const cache = await caches.open(BAS_CACHE);
                await cache.put(request, response.clone());
                return response;
            }
            const cached = await caches.match(request);
            return cached || response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) return cached;
            throw error;
        }
    })());
});
