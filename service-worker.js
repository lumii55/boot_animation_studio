const BAS_CACHE = 'bas-shell-p13-9b-r2a-v1';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./", "./index.html", "./styles.css?v=p13-9b-r2a", "./manifest.webmanifest?v=p13-9b-r2a", "./js/api.js?v=p13-9b-r2a", "./js/trust-client.js?v=p13-9b-r2a", "./js/multi-device.js?v=p13-9b-r2a", "./js/trust-center.js?v=p13-9b-r2a", "./js/audio.js?v=p13-9b-r2a", "./js/autosave.js?v=p13-9b-r2a", "./js/compatibility.js?v=p13-9b-r2a", "./js/composition.js?v=p13-9b-r2a", "./js/contextual.js?v=p13-9b-r2a", "./js/custom-profiles.js?v=p13-9b-r2a", "./js/device-intelligence.js?v=p13-9b-r2a", "./js/device-profile.js?v=p13-9b-r2a", "./js/export.js?v=p13-9b-r2a", "./js/history.js?v=p13-9b-r2a", "./js/help.js?v=p13-9b-r2a", "./js/i18n.js?v=p13-9b-r2a", "./js/loading-tips.js?v=p13-9b-r2a", "./js/master-sequence.js?v=p13-9b-r2a", "./js/media-seek.js?v=p13-9b-r2a", "./js/module-workspace.js?v=p13-9b-r2a", "./js/module-test.js?v=p13-9b-r2a", "./js/playlist.js?v=p13-9b-r2a", "./js/rotation.js?v=p13-9b-r2a", "./js/boot-queue.js?v=p13-9b-r2a", "./js/boot-activity.js?v=p13-9b-r2a", "./js/media.js?v=p13-9b-r2a", "./js/output-presets.js?v=p13-9b-r2a", "./js/parts.js?v=p13-9b-r2a", "./js/performance.js?v=p13-9b-r2a", "./js/project-engine.js?v=p13-9b-r2a", "./js/project-file.js?v=p13-9b-r2a", "./js/project-restore.js?v=p13-9b-r2a", "./js/project.js?v=p13-9b-r2a", "./js/pwa.js?v=p13-9b-r2a", "./js/release.js?v=p13-9b-r2a", "./js/finish.js?v=p13-9b-r2a", "./js/source-library.js?v=p13-9b-r2a", "./js/state.js?v=p13-9b-r2a", "./js/timeline-2.js?v=p13-9b-r2a", "./js/timeline-3.js?v=p13-9b-r2a", "./js/timeline.js?v=p13-9b-r2a", "./js/ux.js?v=p13-9b-r2a", "./js/workspace.js?v=p13-9b-r2a", "./vendor/jszip.min.js?v=p13-9b-r2a", "./vendor/gifuct.min.js?v=p13-9b-r2a", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
const BAS_SHELL_URLS = new Set(BAS_SHELL.map(path => new URL(path, self.location.href).href));
const BAS_INDEX_URL = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
    event.waitUntil(caches.open(BAS_CACHE).then(cache => cache.addAll(BAS_SHELL)));
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
        event.respondWith(
            caches.match(BAS_INDEX_URL).then(cached => cached || fetch(request))
        );
        return;
    }
    if (!BAS_SHELL_URLS.has(request.url)) return;
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});
