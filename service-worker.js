const BAS_CACHE = 'bas-shell-p12-11c-v1';
const BAS_CACHE_PREFIX = 'bas-shell-';
const BAS_SHELL = ["./", "./index.html", "./styles.css?v=p12-11c", "./manifest.webmanifest?v=p12-11c", "./js/api.js?v=p12-11c", "./js/audio.js?v=p12-11c", "./js/autosave.js?v=p12-11c", "./js/compatibility.js?v=p12-11c", "./js/composition.js?v=p12-11c", "./js/contextual.js?v=p12-11c", "./js/custom-profiles.js?v=p12-11c", "./js/device-profile.js?v=p12-11c", "./js/export.js?v=p12-11c", "./js/history.js?v=p12-11c", "./js/i18n.js?v=p12-11c", "./js/loading-tips.js?v=p12-11c", "./js/master-sequence.js?v=p12-11c", "./js/media.js?v=p12-11c", "./js/output-presets.js?v=p12-11c", "./js/parts.js?v=p12-11c", "./js/performance.js?v=p12-11c", "./js/project-engine.js?v=p12-11c", "./js/project-file.js?v=p12-11c", "./js/project-restore.js?v=p12-11c", "./js/project.js?v=p12-11c", "./js/pwa.js?v=p12-11c", "./js/release.js?v=p12-11c", "./js/source-library.js?v=p12-11c", "./js/state.js?v=p12-11c", "./js/timeline-2.js?v=p12-11c", "./js/timeline-3.js?v=p12-11c", "./js/timeline.js?v=p12-11c", "./js/ux.js?v=p12-11c", "./js/workspace.js?v=p12-11c", "./vendor/jszip.min.js?v=p12-11c", "./vendor/qrcode.min.js?v=p12-11c", "./vendor/gifuct.min.js?v=p12-11c", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
const BAS_SHELL_URLS = new Set(BAS_SHELL.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
    event.waitUntil(caches.open(BAS_CACHE).then(cache => cache.addAll(BAS_SHELL)));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(BAS_CACHE_PREFIX) && key !== BAS_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(response => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(BAS_CACHE).then(cache => cache.put('./index.html', copy));
                }
                return response;
            }).catch(() => caches.match('./index.html'))
        );
        return;
    }
    if (!BAS_SHELL_URLS.has(request.url)) return;
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});
