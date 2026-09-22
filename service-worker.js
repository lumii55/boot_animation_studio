const BAS_CACHE = 'bas-shell-p13-6b-v1';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./", "./index.html", "./styles.css?v=p13-6b", "./manifest.webmanifest?v=p13-6b", "./js/api.js?v=p13-6b", "./js/audio.js?v=p13-6b", "./js/autosave.js?v=p13-6b", "./js/compatibility.js?v=p13-6b", "./js/composition.js?v=p13-6b", "./js/contextual.js?v=p13-6b", "./js/custom-profiles.js?v=p13-6b", "./js/device-profile.js?v=p13-6b", "./js/export.js?v=p13-6b", "./js/history.js?v=p13-6b", "./js/help.js?v=p13-6b", "./js/i18n.js?v=p13-6b", "./js/loading-tips.js?v=p13-6b", "./js/master-sequence.js?v=p13-6b", "./js/media-seek.js?v=p13-6b", "./js/module-workspace.js?v=p13-6b", "./js/module-test.js?v=p13-6b", "./js/playlist.js?v=p13-6b", "./js/rotation.js?v=p13-6b", "./js/media.js?v=p13-6b", "./js/output-presets.js?v=p13-6b", "./js/parts.js?v=p13-6b", "./js/performance.js?v=p13-6b", "./js/project-engine.js?v=p13-6b", "./js/project-file.js?v=p13-6b", "./js/project-restore.js?v=p13-6b", "./js/project.js?v=p13-6b", "./js/pwa.js?v=p13-6b", "./js/release.js?v=p13-6b", "./js/finish.js?v=p13-6b", "./js/source-library.js?v=p13-6b", "./js/state.js?v=p13-6b", "./js/timeline-2.js?v=p13-6b", "./js/timeline-3.js?v=p13-6b", "./js/timeline.js?v=p13-6b", "./js/ux.js?v=p13-6b", "./js/workspace.js?v=p13-6b", "./vendor/jszip.min.js?v=p13-6b", "./vendor/qrcode.min.js?v=p13-6b", "./vendor/gifuct.min.js?v=p13-6b", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
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
