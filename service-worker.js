const BAS_CACHE = 'bas-shell-p12-12c-v1';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./", "./index.html", "./styles.css?v=p12-12c", "./manifest.webmanifest?v=p12-12c", "./js/api.js?v=p12-12c", "./js/audio.js?v=p12-12c", "./js/autosave.js?v=p12-12c", "./js/compatibility.js?v=p12-12c", "./js/composition.js?v=p12-12c", "./js/contextual.js?v=p12-12c", "./js/custom-profiles.js?v=p12-12c", "./js/device-profile.js?v=p12-12c", "./js/export.js?v=p12-12c", "./js/history.js?v=p12-12c", "./js/help.js?v=p12-12c", "./js/i18n.js?v=p12-12c", "./js/loading-tips.js?v=p12-12c", "./js/master-sequence.js?v=p12-12c", "./js/media-seek.js?v=p12-12c", "./js/media.js?v=p12-12c", "./js/output-presets.js?v=p12-12c", "./js/parts.js?v=p12-12c", "./js/performance.js?v=p12-12c", "./js/project-engine.js?v=p12-12c", "./js/project-file.js?v=p12-12c", "./js/project-restore.js?v=p12-12c", "./js/project.js?v=p12-12c", "./js/pwa.js?v=p12-12c", "./js/release.js?v=p12-12c", "./js/finish.js?v=p12-12c", "./js/source-library.js?v=p12-12c", "./js/state.js?v=p12-12c", "./js/timeline-2.js?v=p12-12c", "./js/timeline-3.js?v=p12-12c", "./js/timeline.js?v=p12-12c", "./js/ux.js?v=p12-12c", "./js/workspace.js?v=p12-12c", "./vendor/jszip.min.js?v=p12-12c", "./vendor/qrcode.min.js?v=p12-12c", "./vendor/gifuct.min.js?v=p12-12c", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
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
