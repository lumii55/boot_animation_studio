const BAS_CACHE = 'bas-shell-p13-10-r1a-v1';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./", "./index.html", "./styles.css?v=p13-10-r1a", "./manifest.webmanifest?v=p13-10-r1a", "./js/api.js?v=p13-10-r1a", "./js/trust-client.js?v=p13-10-r1a", "./js/multi-device.js?v=p13-10-r1a", "./js/trust-center.js?v=p13-10-r1a", "./js/health-center.js?v=p13-10-r1a", "./js/audio.js?v=p13-10-r1a", "./js/autosave.js?v=p13-10-r1a", "./js/compatibility.js?v=p13-10-r1a", "./js/composition.js?v=p13-10-r1a", "./js/contextual.js?v=p13-10-r1a", "./js/custom-profiles.js?v=p13-10-r1a", "./js/device-intelligence.js?v=p13-10-r1a", "./js/device-profile.js?v=p13-10-r1a", "./js/export.js?v=p13-10-r1a", "./js/history.js?v=p13-10-r1a", "./js/help.js?v=p13-10-r1a", "./js/i18n.js?v=p13-10-r1a", "./js/loading-tips.js?v=p13-10-r1a", "./js/master-sequence.js?v=p13-10-r1a", "./js/media-seek.js?v=p13-10-r1a", "./js/module-workspace.js?v=p13-10-r1a", "./js/module-test.js?v=p13-10-r1a", "./js/playlist.js?v=p13-10-r1a", "./js/rotation.js?v=p13-10-r1a", "./js/boot-queue.js?v=p13-10-r1a", "./js/boot-activity.js?v=p13-10-r1a", "./js/media.js?v=p13-10-r1a", "./js/output-presets.js?v=p13-10-r1a", "./js/parts.js?v=p13-10-r1a", "./js/performance.js?v=p13-10-r1a", "./js/project-engine.js?v=p13-10-r1a", "./js/project-file.js?v=p13-10-r1a", "./js/project-restore.js?v=p13-10-r1a", "./js/project.js?v=p13-10-r1a", "./js/pwa.js?v=p13-10-r1a", "./js/release.js?v=p13-10-r1a", "./js/finish.js?v=p13-10-r1a", "./js/source-library.js?v=p13-10-r1a", "./js/state.js?v=p13-10-r1a", "./js/timeline-2.js?v=p13-10-r1a", "./js/timeline-3.js?v=p13-10-r1a", "./js/timeline.js?v=p13-10-r1a", "./js/ux.js?v=p13-10-r1a", "./js/workspace.js?v=p13-10-r1a", "./vendor/jszip.min.js?v=p13-10-r1a", "./vendor/gifuct.min.js?v=p13-10-r1a", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
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

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'BAS_SKIP_WAITING') self.skipWaiting();
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
