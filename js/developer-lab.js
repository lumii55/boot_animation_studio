(function() {
    const BAS_DEVELOPER_LAB_VERSION = 3;
    const BAS_DEVELOPER_RELEASE = 'P13.12 R2';
    const BAS_DEVELOPER_TAP_TARGET = 7;
    const BAS_DEVELOPER_TAP_WINDOW_MS = 4200;
    const BAS_DEVELOPER_EVENT_LIMIT = 60;

    const state = {
        enabled: false,
        open: false,
        bound: false,
        tapCount: 0,
        tapTimer: 0,
        refreshTimer: 0,
        lastInfo: null,
        lastInfoLatency: null,
        lastPing: null,
        lastPingLatency: null,
        smoke: [],
        smokeRunning: false,
        swCache: '',
        storage: null,
        snapshotText: ''
    };

    function text(key, fallback) {
        try {
            const table = traducoes[idiomaAtual] || traducoes.en;
            return table?.[key] || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${Math.round(bytes)} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    function formatTime(value) {
        const timestamp = Number(value || 0);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
        try {
            return new Intl.DateTimeFormat(idiomaAtual || undefined, {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(new Date(timestamp));
        } catch (error) {
            return new Date(timestamp).toLocaleTimeString();
        }
    }

    function boolLabel(value) {
        return value ? text('developerLabYes', 'Yes') : text('developerLabNo', 'No');
    }

    function safeBaseUrl() {
        try {
            const url = new URL(String(IP_LOCAL || ''));
            let host = url.hostname.replace(/^\[|\]$/g, '');
            if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
                const parts = host.split('.');
                host = `${parts[0]}.${parts[1]}.${parts[2]}.x`;
            }
            if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && !host.includes('.x')) host = 'local-device';
            return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`;
        } catch (error) {
            return '—';
        }
    }

    function connectionKind() {
        try {
            const host = new URL(String(IP_LOCAL || '')).hostname.replace(/^\[|\]$/g, '').toLowerCase();
            return host === 'localhost' || host === '::1' || host.startsWith('127.')
                ? text('developerLabLoopback', 'Loopback')
                : text('developerLabLan', 'LAN');
        } catch (error) {
            return '—';
        }
    }

    function abbreviate(value, visible = 6) {
        const raw = String(value || '').trim();
        if (!raw) return '—';
        if (raw.length <= visible * 2 + 3) return raw;
        return `${raw.slice(0, visible)}…${raw.slice(-visible)}`;
    }

    function pwaMode() {
        const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
        return standalone ? text('developerLabStandalone', 'Standalone PWA') : text('developerLabBrowserTab', 'Browser tab');
    }

    function renderFacts(containerId, facts) {
        const root = byId(containerId);
        if (!root) return;
        root.innerHTML = '';
        facts.forEach(([label, value, stateName]) => {
            const card = document.createElement('article');
            card.className = 'developer-lab-fact';
            if (stateName) card.dataset.state = stateName;
            const key = document.createElement('span');
            key.textContent = label;
            const strong = document.createElement('strong');
            strong.textContent = value == null || value === '' ? '—' : String(value);
            card.append(key, strong);
            root.appendChild(card);
        });
    }

    function renderCapabilities() {
        const root = byId('developer-lab-capabilities');
        if (!root) return;
        root.innerHTML = '';
        const values = Array.from(moduleFeatures || []).sort();
        if (!values.length) {
            const empty = document.createElement('span');
            empty.className = 'developer-lab-empty-inline';
            empty.textContent = isConnectedMode ? text('developerLabUnavailable', 'Unavailable') : text('developerLabNotConnected', 'Not connected');
            root.appendChild(empty);
            return;
        }
        values.forEach(value => {
            const chip = document.createElement('code');
            chip.textContent = value;
            root.appendChild(chip);
        });
    }

    async function detectServiceWorkerCache() {
        let cacheName = '';
        try {
            if (globalThis.caches?.keys) {
                const keys = await caches.keys();
                cacheName = keys.filter(key => key.startsWith('bas-shell-')).sort().pop() || '';
            }
        } catch (error) {}
        if (!cacheName) {
            try {
                const response = await fetch('./service-worker.js', { cache: 'no-store' });
                if (response.ok) {
                    const source = await response.text();
                    cacheName = source.match(/const\s+BAS_CACHE\s*=\s*['\"]([^'\"]+)/)?.[1] || '';
                }
            } catch (error) {}
        }
        state.swCache = cacheName;
        return cacheName;
    }

    async function detectStorage() {
        try {
            state.storage = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
        } catch (error) {
            state.storage = null;
        }
        return state.storage;
    }

    function runtimeFacts() {
        const storage = state.storage;
        const storageText = storage && Number.isFinite(storage.usage) && Number.isFinite(storage.quota)
            ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
            : '—';
        let timezone = '—';
        try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '—'; } catch (error) {}
        return [
            [text('developerLabFactBuild', 'BAS build'), BAS_DEVELOPER_RELEASE],
            [text('developerLabFactServiceWorker', 'Service Worker cache'), state.swCache || '—'],
            [text('developerLabFactMode', 'App mode'), pwaMode()],
            [text('developerLabFactOnline', 'Online'), boolLabel(navigator.onLine), navigator.onLine ? 'ok' : 'warn'],
            [text('developerLabFactSecure', 'Secure context'), boolLabel(window.isSecureContext), window.isSecureContext ? 'ok' : 'warn'],
            [text('developerLabFactIndexedDB', 'IndexedDB'), boolLabel(Boolean(globalThis.indexedDB)), globalThis.indexedDB ? 'ok' : 'error'],
            [text('developerLabFactStorage', 'Storage estimate'), storageText],
            [text('developerLabFactViewport', 'Viewport / DPR'), `${window.innerWidth}×${window.innerHeight} @ ${Number(window.devicePixelRatio || 1).toFixed(2)}x`],
            [text('developerLabFactLocale', 'Locale / timezone'), `${String(idiomaAtual || navigator.language || '—')} · ${timezone}`],
            [text('developerLabFactVisibility', 'Page visibility'), document.visibilityState || '—']
        ];
    }

    function authMode() {
        if (!isConnectedMode) return text('developerLabNotConnected', 'Not connected');
        if (hasModuleFeature?.('trusted_clients')) {
            const identity = window.BASTrustClient?.id?.();
            return identity ? text('developerLabAuthTrusted', 'Trusted identity + session token') : text('developerLabAuthSession', 'Session token');
        }
        return moduleCompatibilityMode === 'legacy_secure'
            ? text('developerLabAuthLegacy', 'Legacy secure session')
            : text('developerLabAuthSession', 'Session token');
    }

    function moduleFacts() {
        const current = window.BASMultiDevice?.current?.();
        const live = window.BASLiveSync?.status?.() || {};
        const pingLatency = Number.isFinite(state.lastPingLatency) ? `${Math.round(state.lastPingLatency)} ms` : '—';
        return [
            [text('developerLabFactConnection', 'Connection'), isConnectedMode ? text('developerLabConnected', 'Connected') : text('developerLabNotConnected', 'Not connected'), isConnectedMode ? 'ok' : 'warn'],
            [text('developerLabFactBase', 'Module base'), safeBaseUrl()],
            [text('developerLabFactNetwork', 'Network path'), connectionKind()],
            [text('developerLabFactBridge', 'Bridge identity'), abbreviate(moduleInfo?.bridge_id || current?.id || '')],
            [text('developerLabFactApi', 'API version'), moduleApiVersion == null ? '—' : String(moduleApiVersion)],
            [text('developerLabFactPermission', 'Permission'), String(moduleAccessPermission || '—')],
            [text('developerLabFactAuth', 'Auth mode'), authMode()],
            [text('developerLabFactIdentity', 'Browser identity'), abbreviate(window.BASTrustClient?.id?.() || '')],
            [text('developerLabFactPing', 'Last ping latency'), pingLatency],
            [text('developerLabFactReconnects', 'Live reconnects'), String(live.reconnects || 0)]
        ];
    }

    function editorFacts() {
        let manifest = null;
        let manifestValid = false;
        let assets = [];
        try {
            manifest = window.BASProjectEngine?.captureManifest?.() || null;
            manifestValid = Boolean(manifest && window.BASProjectEngine?.validateManifest?.(manifest));
            assets = window.BASProjectEngine?.getAssets?.() || [];
        } catch (error) {}
        let sources = [];
        try { sources = window.BASSourceLibrary?.getAll?.() || []; } catch (error) {}
        const visual = sources.filter(source => source?.role !== 'audio').length;
        const audio = sources.filter(source => source?.role === 'audio').length;
        const mediaSeek = window.BASMediaSeek?.status?.() || {};
        const autosave = window.BASAutosave?.status?.() || {};
        const history = window.BASProjectHistory?.status?.() || {};
        const dirty = Boolean(currentProject?.projectMeta?.dirty);
        return [
            [text('developerLabFactEngine', 'Project Engine'), window.BASProjectEngine ? `v${window.BASProjectEngine.engineVersion} · schema ${window.BASProjectEngine.schemaVersion}` : '—'],
            [text('developerLabFactProject', 'Project state'), currentProject ? `${manifestValid ? 'valid' : 'invalid'} · ${dirty ? 'dirty' : 'clean'}` : text('developerLabNoProject', 'No project loaded'), currentProject && manifestValid ? 'ok' : (currentProject ? 'warn' : '')],
            [text('developerLabFactSources', 'Source Library'), `${sources.length} total · ${visual} visual · ${audio} audio`],
            [text('developerLabFactAssets', 'Project assets'), String(Array.isArray(assets) ? assets.length : 0)],
            [text('developerLabFactDecoders', 'Work decoders'), String(document.querySelectorAll('.bas-work-decoder').length)],
            [text('developerLabFactSeeks', 'Media seeks'), `${mediaSeek.active || 0} active · ${mediaSeek.total || 0} total · ${mediaSeek.failures || 0} failed`],
            [text('developerLabFactAutosave', 'Autosave'), autosave.unavailable ? text('developerLabUnavailable', 'Unavailable') : `${autosave.saving ? 'saving' : autosave.scheduled ? 'scheduled' : 'idle'}${autosave.lastSavedAt ? ` · ${formatTime(autosave.lastSavedAt)}` : ''}`],
            [text('developerLabFactUndo', 'Undo / redo'), `${history.undoDepth || 0} / ${history.redoDepth || 0} · ${history.entries || 0} snapshots`]
        ];
    }

    function liveFacts() {
        const live = window.BASLiveSync?.status?.() || {};
        const presence = window.BASPresence?.state?.() || {};
        const operation = presence.operation;
        return [
            [text('developerLabFactLiveStream', 'Live stream'), live.supported ? (live.connected ? text('developerLabConnected', 'Connected') : live.active ? text('developerLabConnecting', 'Connecting / retrying') : text('developerLabInactive', 'Inactive')) : text('developerLabUnavailable', 'Unavailable'), live.connected ? 'ok' : (live.supported ? 'warn' : '')],
            [text('developerLabFactEpoch', 'Server epoch'), abbreviate(live.epoch || '', 5)],
            [text('developerLabFactEvents', 'Events received'), String(live.events || 0)],
            [text('developerLabFactRefreshes', 'Canonical refreshes'), `${live.refreshes || 0} · ${live.refreshErrors || 0} errors`],
            [text('developerLabFactPresence', 'Live client streams'), String(Array.isArray(presence.clients) ? presence.clients.length : 0)],
            [text('developerLabFactOperation', 'Coordinated operation'), operation ? `${String(operation.type || 'operation')}${operation.current_owner ? ' · this client' : ''}` : text('developerLabNone', 'None')]
        ];
    }

    function renderRevisions() {
        const root = byId('developer-lab-revisions');
        if (!root) return;
        root.innerHTML = '';
        const revisions = window.BASLiveSync?.status?.().revisions || {};
        const entries = Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b));
        if (!entries.length) {
            root.textContent = text('developerLabUnavailable', 'Unavailable');
            return;
        }
        entries.forEach(([domain, revision]) => {
            const row = document.createElement('div');
            const label = document.createElement('code');
            label.textContent = domain;
            const value = document.createElement('strong');
            value.textContent = String(revision);
            row.append(label, value);
            root.appendChild(row);
        });
    }

    function renderEvents() {
        const root = byId('developer-lab-events');
        if (!root) return;
        root.innerHTML = '';
        const log = (window.BASLiveSync?.status?.().eventLog || []).slice(-BAS_DEVELOPER_EVENT_LIMIT).reverse();
        if (!log.length) {
            const empty = document.createElement('div');
            empty.className = 'developer-lab-empty';
            empty.textContent = text('developerLabNoEvents', 'No Live Sync events recorded in this page session yet.');
            root.appendChild(empty);
            return;
        }
        log.forEach(item => {
            const row = document.createElement('article');
            row.className = 'developer-lab-event';
            const stamp = document.createElement('time');
            stamp.textContent = formatTime(item.timestamp);
            const main = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = String(item.kind || item.type || 'event');
            const detail = document.createElement('span');
            const bits = [];
            if (item.domain) bits.push(String(item.domain));
            if (Number.isFinite(Number(item.revision))) bits.push(`rev ${Number(item.revision)}`);
            if (item.reason) bits.push(String(item.reason));
            if (item.message) bits.push(String(item.message).slice(0, 140));
            detail.textContent = bits.join(' · ') || '—';
            main.append(name, detail);
            row.append(stamp, main);
            root.appendChild(row);
        });
    }

    function renderSmokeChecks() {
        const root = byId('developer-lab-checks');
        if (!root) return;
        root.innerHTML = '';
        if (!state.smoke.length) {
            const empty = document.createElement('div');
            empty.className = 'developer-lab-empty';
            empty.textContent = text('developerLabChecksEmpty', 'Run the smoke checks to verify the current browser/module path without changing device state.');
            root.appendChild(empty);
            return;
        }
        state.smoke.forEach(check => {
            const row = document.createElement('article');
            row.className = 'developer-lab-check';
            row.dataset.state = check.status;
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = check.name;
            const detail = document.createElement('span');
            detail.textContent = check.detail || '';
            copy.append(title, detail);
            const badge = document.createElement('b');
            badge.textContent = check.status === 'pass'
                ? text('developerLabPass', 'PASS')
                : check.status === 'fail'
                    ? text('developerLabFail', 'FAIL')
                    : text('developerLabSkip', 'SKIP');
            row.append(copy, badge);
            root.appendChild(row);
        });
    }

    function renderFaultControls() {
        const debug = window.BASLiveSync?.status?.().debug || {};
        const drop = byId('developer-lab-drop-next');
        const delay = byId('developer-lab-delay');
        if (drop) drop.checked = Boolean(debug.dropNextEvent);
        if (delay && document.activeElement !== delay) delay.value = String(Number(debug.delayMs) || 0);
        const status = byId('developer-lab-fault-status');
        if (status) {
            status.textContent = `${text('developerLabDroppedCount', 'Dropped events')}: ${debug.droppedEvents || 0} · ${text('developerLabForcedReconnectCount', 'Forced reconnects')}: ${debug.forcedReconnects || 0} · ${text('developerLabStaleCount', 'Stale tests')}: ${debug.staleTests || 0}`;
        }
    }

    async function refresh(options = {}) {
        if (!state.enabled) return;
        if (!options.fast) await Promise.all([detectServiceWorkerCache(), detectStorage()]);
        renderFacts('developer-lab-runtime-grid', runtimeFacts());
        renderFacts('developer-lab-module-grid', moduleFacts());
        renderFacts('developer-lab-live-grid', liveFacts());
        renderFacts('developer-lab-editor-grid', editorFacts());
        renderCapabilities();
        renderRevisions();
        renderEvents();
        renderSmokeChecks();
        renderFaultControls();
        syncText();
    }

    function syncText() {
        const set = (id, key, fallback) => {
            const element = byId(id);
            if (element) element.textContent = text(key, fallback);
        };
        set('developer-lab-kicker', 'developerLabKicker', 'DEVELOPER TOOLS');
        set('developer-lab-title', 'developerLabTitle', 'Developer Lab');
        set('developer-lab-desc', 'developerLabDesc', 'Session-only diagnostics and bounded fault injection for Boot Animation Studio development.');
        set('developer-lab-session-badge', 'developerLabSessionOnly', 'SESSION ONLY');
        set('developer-lab-refresh', 'developerLabRefresh', 'Refresh');
        set('developer-lab-close', 'developerLabClose', 'Close');
        set('developer-lab-disable', 'developerLabDisable', 'Disable developer mode');
        set('developer-lab-runtime-title', 'developerLabRuntimeTitle', 'Environment / Runtime');
        set('developer-lab-runtime-desc', 'developerLabRuntimeDesc', 'Safe browser, PWA and storage facts for this page session.');
        set('developer-lab-module-title', 'developerLabModuleTitle', 'Module Connection');
        set('developer-lab-module-desc', 'developerLabModuleDesc', 'Current bridge path, authorization state and advertised capabilities.');
        set('developer-lab-test-info', 'developerLabTestInfo', 'Test /info');
        set('developer-lab-test-ping', 'developerLabTestPing', 'Test /ping');
        set('developer-lab-rediscover', 'developerLabRediscover', 'Force rediscovery');
        set('developer-lab-reconnect', 'developerLabReconnect', 'Reconnect session');
        set('developer-lab-copy-capabilities', 'developerLabCopyCapabilities', 'Copy capabilities');
        set('developer-lab-capabilities-title', 'developerLabCapabilities', 'Advertised capabilities');
        set('developer-lab-live-title', 'developerLabLiveTitle', 'Live Sync Inspector');
        set('developer-lab-live-desc', 'developerLabLiveDesc', 'Stream health, revisions and recent invalidation/refresh activity.');
        set('developer-lab-revisions-title', 'developerLabRevisions', 'Domain revisions');
        set('developer-lab-events-title', 'developerLabEvents', 'Recent live events');
        set('developer-lab-clear-events', 'developerLabClearEvents', 'Clear event list');
        set('developer-lab-fault-title', 'developerLabFaultTitle', 'Fault Injection');
        set('developer-lab-fault-desc', 'developerLabFaultDesc', 'Developer-only, session-ephemeral test hooks. Reloading clears them.');
        set('developer-lab-drop-next-label', 'developerLabDropNextEvent', 'Drop the next live domain event');
        set('developer-lab-force-reconnect', 'developerLabForceReconnect', 'Force stream reconnect');
        set('developer-lab-delay-label', 'developerLabEventDelay', 'Artificial event delay');
        set('developer-lab-stale-label', 'developerLabStaleDomain', 'Stale revision domain');
        set('developer-lab-run-stale', 'developerLabRunStale', 'Run stale-revision test');
        set('developer-lab-reset-faults', 'developerLabResetFaults', 'Reset fault injection');
        set('developer-lab-editor-title', 'developerLabEditorTitle', 'Editor / Runtime Diagnostics');
        set('developer-lab-editor-desc', 'developerLabEditorDesc', 'Read-only metadata from existing canonical owners; no parallel project state.');
        set('developer-lab-checks-title', 'developerLabChecksTitle', 'Quick Smoke Checks');
        set('developer-lab-checks-desc', 'developerLabChecksDesc', 'Safe checks only. These do not apply, restore, rescan or mutate the phone.');
        set('developer-lab-run-checks', state.smokeRunning ? 'developerLabRunning' : 'developerLabRunChecks', state.smokeRunning ? 'Running…' : 'Run checks');
        set('developer-lab-snapshot-title', 'developerLabSnapshotTitle', 'Sanitized Debug Snapshot');
        set('developer-lab-snapshot-desc', 'developerLabSnapshotDesc', 'Shareable technical summary with tokens, private keys, exact LAN IPs and project media omitted.');
        set('developer-lab-copy-snapshot', 'developerLabCopySnapshot', 'Copy debug snapshot');
        const launcher = byId('developer-lab-launcher');
        if (launcher) launcher.setAttribute('aria-label', text('developerLabOpen', 'Open Developer Lab'));
    }

    async function testInfo(options = {}) {
        if (!isConnectedMode) {
            if (!options.silent) toast(text('developerLabNotConnected', 'Not connected'), 'info');
            return null;
        }
        const started = performance.now();
        try {
            const response = await localNetworkFetch(IP_LOCAL + '/info', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
            const data = await response.json().catch(() => ({}));
            state.lastInfoLatency = performance.now() - started;
            state.lastInfo = response.ok ? data : null;
            if (!response.ok) throw new Error(data.message || `/info ${response.status}`);
            if (!options.silent) toast(`/info OK · ${Math.round(state.lastInfoLatency)} ms`, 'success');
            return data;
        } catch (error) {
            state.lastInfoLatency = performance.now() - started;
            state.lastInfo = null;
            if (!options.silent) toast(String(error?.message || error || '/info failed'), 'error');
            throw error;
        } finally {
            refresh({ fast: true });
        }
    }

    async function testPing(options = {}) {
        if (!isConnectedMode || !sessionToken) {
            if (!options.silent) toast(text('developerLabNotConnected', 'Not connected'), 'info');
            return null;
        }
        const started = performance.now();
        try {
            const response = await apiFetch('/ping', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
            const data = await response.json().catch(() => ({}));
            state.lastPingLatency = performance.now() - started;
            state.lastPing = response.ok ? data : null;
            if (!response.ok || data.status !== 'ok') throw new Error(data.message || `/ping ${response.status}`);
            if (!options.silent) toast(`/ping OK · ${Math.round(state.lastPingLatency)} ms`, 'success');
            return data;
        } catch (error) {
            state.lastPingLatency = performance.now() - started;
            state.lastPing = null;
            if (!options.silent) toast(String(error?.message || error || '/ping failed'), 'error');
            throw error;
        } finally {
            refresh({ fast: true });
        }
    }

    async function forceRediscovery() {
        if (!window.BASMultiDevice?.scan) return;
        const button = byId('developer-lab-rediscover');
        if (button) button.disabled = true;
        try {
            const found = await window.BASMultiDevice.scan();
            toast(`${found.length} ${text('developerLabModulesFound', 'module(s) found')}`, 'success');
        } catch (error) {
            toast(String(error?.message || error || 'Discovery failed'), 'error');
        } finally {
            if (button) button.disabled = false;
            refresh({ fast: true });
        }
    }

    async function reconnectSession() {
        if (!isConnectedMode || typeof tentaConexao !== 'function') {
            toast(text('developerLabNotConnected', 'Not connected'), 'info');
            return;
        }
        const button = byId('developer-lab-reconnect');
        if (button) button.disabled = true;
        try {
            const ok = await tentaConexao();
            if (!ok) throw new Error('Reconnect failed');
            toast(text('developerLabReconnectOk', 'Session reconnected.'), 'success');
        } catch (error) {
            toast(String(error?.message || error || 'Reconnect failed'), 'error');
        } finally {
            if (button) button.disabled = false;
            refresh({ fast: true });
        }
    }

    async function copyText(value) {
        const content = String(value || '');
        if (!content) return false;
        try {
            await navigator.clipboard.writeText(content);
            return true;
        } catch (error) {
            const area = document.createElement('textarea');
            area.value = content;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const copied = document.execCommand?.('copy') === true;
            area.remove();
            return copied;
        }
    }

    async function copyCapabilities() {
        const value = Array.from(moduleFeatures || []).sort().join('\n');
        const ok = await copyText(value);
        toast(ok ? text('developerLabCopied', 'Copied.') : text('developerLabCopyFailed', 'Could not copy.'), ok ? 'success' : 'error');
    }

    function smokeResult(name, status, detail = '') {
        state.smoke.push({ name, status, detail: String(detail || '') });
        renderSmokeChecks();
    }

    async function runSmokeChecks() {
        if (state.smokeRunning) return;
        state.smokeRunning = true;
        state.smoke = [];
        syncText();
        renderSmokeChecks();
        const run = async (name, task, skipReason = '') => {
            if (skipReason) {
                smokeResult(name, 'skip', skipReason);
                return;
            }
            const started = performance.now();
            try {
                const detail = await task();
                smokeResult(name, 'pass', `${detail || 'OK'} · ${Math.round(performance.now() - started)} ms`);
            } catch (error) {
                smokeResult(name, 'fail', String(error?.message || error || 'Failed'));
            }
        };
        try {
            await run('Site runtime', async () => {
                const required = ['BASProjectEngine', 'BASSourceLibrary', 'BASAutosave', 'BASProjectHistory', 'BASPWA'];
                const missing = required.filter(name => !window[name]);
                if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
                return `${required.length} owners available`;
            });
            await run('IndexedDB / autosave', async () => {
                if (!globalThis.indexedDB) throw new Error('IndexedDB unavailable');
                const records = await window.BASAutosave.list();
                return `${Array.isArray(records) ? records.length : 0} autosave record(s)`;
            });
            await run('PWA basics', async () => {
                if (!('serviceWorker' in navigator)) throw new Error('Service Worker unsupported');
                const registration = await navigator.serviceWorker.getRegistration('./');
                const cache = await detectServiceWorkerCache();
                return `${registration ? 'registered' : 'not registered'} · ${cache || 'cache unknown'}`;
            });
            await run('/info', async () => {
                const info = await testInfo({ silent: true });
                if (!info || !Number.isInteger(Number(info.api_version))) throw new Error('Invalid /info payload');
                return `API ${info.api_version} · ${Array.isArray(info.features) ? info.features.length : 0} capabilities`;
            }, !isConnectedMode ? text('developerLabNotConnected', 'Not connected') : '');
            await run('/ping', async () => {
                const ping = await testPing({ silent: true });
                if (ping?.status !== 'ok') throw new Error('Unexpected ping status');
                return `${Math.round(state.lastPingLatency || 0)} ms · ${ping.permission || moduleAccessPermission}`;
            }, !isConnectedMode ? text('developerLabNotConnected', 'Not connected') : '');
            await run('Capability parse', async () => {
                if (!(moduleFeatures instanceof Set)) throw new Error('Capability set unavailable');
                const invalid = Array.from(moduleFeatures).filter(value => typeof value !== 'string' || !value.trim());
                if (invalid.length) throw new Error('Invalid capability values');
                return `${moduleFeatures.size} capability strings`;
            }, !isConnectedMode ? text('developerLabNotConnected', 'Not connected') : '');
            await run('Trust identity', async () => {
                const identity = await window.BASTrustClient?.ready?.();
                if (!identity || !window.BASTrustClient?.id?.()) throw new Error('Trusted identity unavailable');
                return text('developerLabIdentityAvailable', 'Identity available');
            }, !isConnectedMode || !hasModuleFeature?.('trusted_clients') ? text('developerLabUnavailable', 'Capability unavailable') : '');
            await run('Live revisions', async () => {
                const snapshot = await window.BASLiveSync.fetchSnapshot('developer-smoke');
                if (!snapshot || typeof snapshot.epoch !== 'string' || !snapshot.revisions || typeof snapshot.revisions !== 'object') throw new Error('Invalid revision snapshot');
                return `${Object.keys(snapshot.revisions).length} domains`;
            }, !isConnectedMode || !window.BASLiveSync?.supported?.() ? text('developerLabUnavailable', 'Capability unavailable') : '');
            await run('Module Health', async () => {
                const response = await apiFetch('/health/status', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data || typeof data !== 'object') throw new Error(data.message || `health ${response.status}`);
                return `${data.overall || 'status available'}`;
            }, !isConnectedMode || !hasModuleFeature?.('module_health') ? text('developerLabUnavailable', 'Capability unavailable') : '');
        } finally {
            state.smokeRunning = false;
            syncText();
            refresh({ fast: true });
        }
    }

    function sanitizedSnapshot() {
        const live = window.BASLiveSync?.status?.() || {};
        const lifecycle = window.BASConnectionLifecycle?.status?.() || {};
        const presence = window.BASPresence?.state?.() || {};
        const seek = window.BASMediaSeek?.status?.() || {};
        const autosave = window.BASAutosave?.status?.() || {};
        const history = window.BASProjectHistory?.status?.() || {};
        let sourceStats = { total: 0, visual: 0, audio: 0 };
        try {
            const sources = window.BASSourceLibrary?.getAll?.() || [];
            sourceStats = {
                total: sources.length,
                visual: sources.filter(source => source?.role !== 'audio').length,
                audio: sources.filter(source => source?.role === 'audio').length
            };
        } catch (error) {}
        let project = { loaded: false };
        try {
            if (currentProject) {
                const manifest = window.BASProjectEngine?.captureManifest?.();
                project = {
                    loaded: true,
                    valid: Boolean(manifest && window.BASProjectEngine?.validateManifest?.(manifest)),
                    dirty: Boolean(currentProject?.projectMeta?.dirty),
                    revision: Number(currentProject?.projectMeta?.revision) || 0,
                    source_count: sourceStats.total,
                    asset_count: (window.BASProjectEngine?.getAssets?.() || []).length
                };
            }
        } catch (error) {}
        return {
            format: 'boot-animation-studio-developer-snapshot',
            version: 1,
            generated_at: new Date().toISOString(),
            studio: {
                release: BAS_DEVELOPER_RELEASE,
                locale: String(idiomaAtual || 'en'),
                mode: pwaMode(),
                service_worker_cache: state.swCache || null
            },
            runtime: {
                online: Boolean(navigator.onLine),
                secure_context: Boolean(window.isSecureContext),
                indexeddb: Boolean(globalThis.indexedDB),
                viewport: { width: window.innerWidth, height: window.innerHeight, dpr: Number(window.devicePixelRatio || 1) },
                visibility: document.visibilityState || null,
                lifecycle: {
                    bound: Boolean(lifecycle.bound),
                    running: Boolean(lifecycle.running),
                    resumes: Number(lifecycle.resumes) || 0,
                    live_resumes: Number(lifecycle.liveResumes) || 0,
                    legacy_refreshes: Number(lifecycle.legacyRefreshes) || 0,
                    last_reason: String(lifecycle.lastReason || '').slice(0, 80),
                    last_error: String(lifecycle.lastError || '').slice(0, 180)
                }
            },
            module: {
                connected: Boolean(isConnectedMode),
                base: safeBaseUrl(),
                network_path: connectionKind(),
                bridge_identity_present: Boolean(moduleInfo?.bridge_id || window.BASMultiDevice?.current?.()?.id),
                api_version: moduleApiVersion,
                compatibility_mode: String(moduleCompatibilityMode || 'unknown'),
                permission: String(moduleAccessPermission || ''),
                auth_mode: authMode(),
                browser_identity_present: Boolean(window.BASTrustClient?.id?.()),
                capability_count: moduleFeatures?.size || 0,
                capabilities: Array.from(moduleFeatures || []).sort(),
                last_ping_ms: Number.isFinite(state.lastPingLatency) ? Math.round(state.lastPingLatency) : null
            },
            live_sync: {
                supported: Boolean(live.supported),
                active: Boolean(live.active),
                connected: Boolean(live.connected),
                epoch: abbreviate(live.epoch || '', 5),
                revisions: { ...(live.revisions || {}) },
                reconnects: Number(live.reconnects) || 0,
                events: Number(live.events) || 0,
                refreshes: Number(live.refreshes) || 0,
                refresh_errors: Number(live.refreshErrors) || 0,
                pause_reason: String(live.pauseReason || '').slice(0, 80),
                last_resume_at: Number(live.lastResumeAt) || 0,
                last_error: String(live.lastError || '').slice(0, 220),
                debug: {
                    delay_ms: Number(live.debug?.delayMs) || 0,
                    drop_next_event: Boolean(live.debug?.dropNextEvent),
                    dropped_events: Number(live.debug?.droppedEvents) || 0,
                    forced_reconnects: Number(live.debug?.forcedReconnects) || 0,
                    stale_tests: Number(live.debug?.staleTests) || 0
                },
                recent_events: (live.eventLog || []).slice(-20).map(item => ({
                    timestamp: Number(item.timestamp) || 0,
                    kind: String(item.kind || ''),
                    domain: String(item.domain || ''),
                    revision: Number.isFinite(Number(item.revision)) ? Number(item.revision) : null,
                    reason: String(item.reason || '').slice(0, 80)
                }))
            },
            coordination: {
                live_client_count: Array.isArray(presence.clients) ? presence.clients.length : 0,
                operation: presence.operation ? {
                    type: String(presence.operation.type || ''),
                    current_owner: Boolean(presence.operation.current_owner)
                } : null
            },
            editor: {
                project_engine: window.BASProjectEngine ? { engine_version: window.BASProjectEngine.engineVersion, schema_version: window.BASProjectEngine.schemaVersion } : null,
                project,
                sources: sourceStats,
                work_decoders: document.querySelectorAll('.bas-work-decoder').length,
                media_seek: seek,
                autosave,
                history
            },
            smoke_checks: state.smoke.map(check => ({ name: check.name, status: check.status, detail: check.detail.slice(0, 220) })),
            regression_scan: window.BASRegressionScanner?.report?.()?.summary || null,
            extended_device_scan: window.BASExtendedDeviceScan?.report?.()?.summary || null
        };
    }

    async function copySnapshot() {
        await Promise.all([detectServiceWorkerCache(), detectStorage()]);
        const snapshot = sanitizedSnapshot();
        const value = JSON.stringify(snapshot, null, 2);
        state.snapshotText = value;
        const preview = byId('developer-lab-snapshot-preview');
        if (preview) preview.textContent = value;
        const ok = await copyText(value);
        toast(ok ? text('developerLabCopied', 'Copied.') : text('developerLabCopyFailed', 'Could not copy.'), ok ? 'success' : 'error');
    }

    function toast(message, type = 'info') {
        if (typeof showToast === 'function') showToast(message, type, 2400);
        else console.log(`[BAS Developer Lab] ${message}`);
    }

    function open() {
        if (!state.enabled) enable();
        const root = byId('developer-lab');
        if (!root) return;
        state.open = true;
        root.hidden = false;
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('developer-lab-open');
        refresh();
        requestAnimationFrame(() => byId('developer-lab-close')?.focus());
    }

    function close() {
        const root = byId('developer-lab');
        state.open = false;
        if (root) {
            root.hidden = true;
            root.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('developer-lab-open');
    }

    function resetFaults() {
        window.BASLiveSync?.debug?.reset?.();
        renderFaultControls();
    }

    function enable(options = {}) {
        if (state.enabled) {
            if (options.open !== false) open();
            return;
        }
        state.enabled = true;
        const launcher = byId('developer-lab-launcher');
        if (launcher) launcher.hidden = false;
        document.body.dataset.developerMode = 'true';
        if (!options.silent) toast(text('developerLabEnabledToast', 'Developer Lab enabled for this page session.'), 'success');
        if (options.open !== false) open();
    }

    function disable() {
        resetFaults();
        close();
        state.enabled = false;
        document.body.removeAttribute('data-developer-mode');
        const launcher = byId('developer-lab-launcher');
        if (launcher) launcher.hidden = true;
        state.smoke = [];
        state.snapshotText = '';
        toast(text('developerLabDisabledToast', 'Developer mode disabled.'), 'info');
    }

    function registerDeveloperTap() {
        clearTimeout(state.tapTimer);
        state.tapCount += 1;
        if (state.tapCount >= BAS_DEVELOPER_TAP_TARGET) {
            state.tapCount = 0;
            enable();
            return;
        }
        state.tapTimer = setTimeout(() => { state.tapCount = 0; }, BAS_DEVELOPER_TAP_WINDOW_MS);
    }

    function liveRefreshHandler() {
        if (!state.enabled || !state.open) return;
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => refresh({ fast: true }), 80);
    }

    function bind() {
        if (state.bound) return;
        state.bound = true;
        byId('txt-titulo')?.addEventListener('click', registerDeveloperTap);
        byId('developer-lab-launcher')?.addEventListener('click', open);
        byId('developer-lab-close')?.addEventListener('click', close);
        byId('developer-lab-refresh')?.addEventListener('click', () => refresh());
        byId('developer-lab-disable')?.addEventListener('click', disable);
        byId('developer-lab-test-info')?.addEventListener('click', () => testInfo().catch(() => {}));
        byId('developer-lab-test-ping')?.addEventListener('click', () => testPing().catch(() => {}));
        byId('developer-lab-rediscover')?.addEventListener('click', forceRediscovery);
        byId('developer-lab-reconnect')?.addEventListener('click', reconnectSession);
        byId('developer-lab-copy-capabilities')?.addEventListener('click', copyCapabilities);
        byId('developer-lab-clear-events')?.addEventListener('click', () => {
            window.BASLiveSync?.debug?.clearLog?.();
            renderEvents();
        });
        byId('developer-lab-drop-next')?.addEventListener('change', event => {
            window.BASLiveSync?.debug?.setDropNext?.(Boolean(event.target.checked));
            renderFaultControls();
        });
        byId('developer-lab-force-reconnect')?.addEventListener('click', () => {
            const ok = window.BASLiveSync?.debug?.forceReconnect?.();
            toast(ok ? text('developerLabForceReconnectOk', 'Live stream reconnect requested.') : text('developerLabUnavailable', 'Unavailable'), ok ? 'success' : 'info');
            renderFaultControls();
        });
        byId('developer-lab-delay')?.addEventListener('change', event => {
            window.BASLiveSync?.debug?.setDelay?.(Number(event.target.value) || 0);
            renderFaultControls();
        });
        byId('developer-lab-run-stale')?.addEventListener('click', async () => {
            const domain = byId('developer-lab-stale-domain')?.value || 'playlist';
            try {
                const ok = await window.BASLiveSync?.debug?.testStaleRevision?.(domain);
                toast(ok ? text('developerLabStaleOk', 'Stale-revision resync completed.') : text('developerLabUnavailable', 'Unavailable'), ok ? 'success' : 'info');
            } catch (error) {
                toast(String(error?.message || error || 'Stale-revision test failed'), 'error');
            }
            refresh({ fast: true });
        });
        byId('developer-lab-reset-faults')?.addEventListener('click', resetFaults);
        byId('developer-lab-run-checks')?.addEventListener('click', runSmokeChecks);
        byId('developer-lab-copy-snapshot')?.addEventListener('click', copySnapshot);
        byId('developer-lab')?.addEventListener('click', event => {
            if (event.target === byId('developer-lab')) close();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.open) close();
        });
        ['bas:live-event', 'bas:live-status', 'bas:live-refresh', 'bas:live-refresh-error', 'bas:live-resync', 'bas:live-debug', 'bas:languagechange'].forEach(name => {
            window.addEventListener(name, liveRefreshHandler);
        });
        window.addEventListener('online', liveRefreshHandler);
        window.addEventListener('offline', liveRefreshHandler);
        document.addEventListener('visibilitychange', liveRefreshHandler);
        syncText();
    }

    window.BASDeveloperLab = Object.freeze({
        version: BAS_DEVELOPER_LAB_VERSION,
        release: BAS_DEVELOPER_RELEASE,
        enable,
        disable,
        open,
        close,
        refresh,
        runSmokeChecks,
        snapshot: sanitizedSnapshot,
        notify: toast,
        syncText,
        state: () => ({ enabled: state.enabled, open: state.open, smokeRunning: state.smokeRunning })
    });

    window.addEventListener('DOMContentLoaded', bind);
})();
