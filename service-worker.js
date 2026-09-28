const BAS_CACHE = 'bas-shell-p13-11-r4-2-1-v1';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./", "./index.html", "./styles.css?v=p13-11-r4-2-1", "./manifest.webmanifest?v=p13-11-r4-2-1", "./js/api.js?v=p13-11-r4-2-1", "./js/trust-client.js?v=p13-11-r4-2-1", "./js/multi-device.js?v=p13-11-r4-2-1", "./js/live-sync.js?v=p13-11-r4-2-1", "./js/trust-center.js?v=p13-11-r4-2-1", "./js/health-center.js?v=p13-11-r4-2-1", "./js/audio.js?v=p13-11-r4-2-1", "./js/autosave.js?v=p13-11-r4-2-1", "./js/compatibility.js?v=p13-11-r4-2-1", "./js/composition.js?v=p13-11-r4-2-1", "./js/contextual.js?v=p13-11-r4-2-1", "./js/custom-profiles.js?v=p13-11-r4-2-1", "./js/device-intelligence.js?v=p13-11-r4-2-1", "./js/device-profile.js?v=p13-11-r4-2-1", "./js/export.js?v=p13-11-r4-2-1", "./js/history.js?v=p13-11-r4-2-1", "./js/help.js?v=p13-11-r4-2-1", "./js/i18n.js?v=p13-11-r4-2-1", "./js/loading-tips.js?v=p13-11-r4-2-1", "./js/master-sequence.js?v=p13-11-r4-2-1", "./js/media-seek.js?v=p13-11-r4-2-1", "./js/module-workspace.js?v=p13-11-r4-2-1", "./js/presence.js?v=p13-11-r4-2-1", "./js/developer-lab.js?v=p13-11-r4-2-1", "./js/regression-scanner.js?v=p13-11-r4-2-1", "./js/extended-device-scan.js?v=p13-11-r4-2-1", "./js/module-test.js?v=p13-11-r4-2-1", "./js/playlist.js?v=p13-11-r4-2-1", "./js/rotation.js?v=p13-11-r4-2-1", "./js/boot-queue.js?v=p13-11-r4-2-1", "./js/boot-activity.js?v=p13-11-r4-2-1", "./js/media.js?v=p13-11-r4-2-1", "./js/output-presets.js?v=p13-11-r4-2-1", "./js/parts.js?v=p13-11-r4-2-1", "./js/performance.js?v=p13-11-r4-2-1", "./js/project-engine.js?v=p13-11-r4-2-1", "./js/project-file.js?v=p13-11-r4-2-1", "./js/project-restore.js?v=p13-11-r4-2-1", "./js/project.js?v=p13-11-r4-2-1", "./js/pwa.js?v=p13-11-r4-2-1", "./js/release.js?v=p13-11-r4-2-1", "./js/finish.js?v=p13-11-r4-2-1", "./js/source-library.js?v=p13-11-r4-2-1", "./js/state.js?v=p13-11-r4-2-1", "./js/timeline-2.js?v=p13-11-r4-2-1", "./js/timeline-3.js?v=p13-11-r4-2-1", "./js/timeline.js?v=p13-11-r4-2-1", "./js/ux.js?v=p13-11-r4-2-1", "./js/workspace.js?v=p13-11-r4-2-1", "./vendor/jszip.min.js?v=p13-11-r4-2-1", "./vendor/gifuct.min.js?v=p13-11-r4-2-1", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
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
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});
