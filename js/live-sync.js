(() => {
    const state = {
        active: false,
        connected: false,
        epoch: '',
        revisions: {},
        reconnects: 0,
        events: 0,
        refreshes: 0,
        refreshErrors: 0,
        lastEvent: null,
        lastRefresh: null,
        lastError: '',
        controller: null,
        retryTimer: 0,
        generation: 0,
        tasks: new Map()
    };

    function supported() {
        return typeof hasModuleFeature === 'function' && hasModuleFeature('live_events') && hasModuleFeature('state_revisions');
    }

    function cloneRevisions(value) {
        const out = {};
        if (!value || typeof value !== 'object') return out;
        Object.entries(value).forEach(([key, revision]) => {
            const number = Number(revision);
            if (Number.isFinite(number) && number >= 0) out[key] = number;
        });
        return out;
    }

    function emit(name, detail = {}) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    function changedDomains(previousEpoch, previous, nextEpoch, next) {
        if (previousEpoch && nextEpoch && previousEpoch !== nextEpoch) return Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]));
        const domains = new Set([...Object.keys(previous), ...Object.keys(next)]);
        return Array.from(domains).filter(domain => Number(previous[domain] || 0) !== Number(next[domain] || 0));
    }

    function refreshTaskKey(domain) {
        switch (domain) {
            case 'rotation':
            case 'queue':
                return 'automation';
            case 'trust':
            case 'sessions':
            case 'audit':
                return 'access';
            case 'presence':
            case 'operation':
                return 'presence';
            default:
                return domain;
        }
    }

    async function refreshTask(key) {
        switch (key) {
            case 'playlist':
                await window.BASPlaylist?.refresh?.({ silent: true });
                await window.BASRotation?.refresh?.({ silent: true });
                await window.BASHealthCenter?.refresh?.({ silent: true });
                break;
            case 'automation':
                await window.BASRotation?.refresh?.({ silent: true });
                break;
            case 'history':
                if (typeof loadHistory === 'function') await loadHistory();
                await window.BASHealthCenter?.refresh?.({ silent: true });
                break;
            case 'activity':
                await window.BASBootActivity?.refresh?.({ silent: true });
                break;
            case 'health':
                await window.BASHealthCenter?.refresh?.({ silent: true });
                break;
            case 'access':
                if (typeof window.BASRefreshConnectedModuleState === 'function') await window.BASRefreshConnectedModuleState({ silent: true });
                await window.BASTrustCenter?.refresh?.({ silent: true });
                break;
            case 'presence':
                await window.BASPresence?.refresh?.({ silent: true });
                break;
            case 'test':
                await window.BASModuleTest?.refreshStatus?.();
                await window.BASHealthCenter?.refresh?.({ silent: true });
                break;
            case 'device':
                if (typeof window.BASRefreshConnectedModuleState === 'function') await window.BASRefreshConnectedModuleState({ silent: true });
                await window.BASDeviceIntelligence?.refresh?.({ silent: true });
                break;
            case 'animation':
                if (typeof window.BASRefreshConnectedModuleState === 'function') await window.BASRefreshConnectedModuleState({ silent: true });
                await window.BASHealthCenter?.refresh?.({ silent: true });
                break;
            default:
                break;
        }
    }

    function scheduleDomainRefresh(domain, reason = 'event', revision = 0) {
        const key = refreshTaskKey(String(domain || ''));
        if (!key) return;
        let task = state.tasks.get(key);
        if (!task) {
            task = { timer: 0, running: false, dirty: false, reason: '', revision: 0 };
            state.tasks.set(key, task);
        }
        task.reason = reason;
        task.revision = Math.max(Number(task.revision) || 0, Number(revision) || 0);
        if (task.running) {
            task.dirty = true;
            return;
        }
        if (task.timer) return;
        task.timer = setTimeout(async () => {
            task.timer = 0;
            if (!state.active) return;
            task.running = true;
            task.dirty = false;
            const refreshReason = task.reason;
            const refreshRevision = task.revision;
            try {
                await refreshTask(key);
                state.refreshes += 1;
                state.lastRefresh = { key, reason: refreshReason, revision: refreshRevision, timestamp: Date.now() };
                emit('bas:live-refresh', { ...state.lastRefresh });
            } catch (error) {
                state.refreshErrors += 1;
                emit('bas:live-refresh-error', { key, reason: refreshReason, revision: refreshRevision, error: String(error?.message || error || 'refresh failed') });
            } finally {
                task.running = false;
                task.revision = 0;
                if (task.dirty && state.active) scheduleDomainRefresh(key, 'coalesced', refreshRevision);
            }
        }, 90);
    }

    function scheduleChangedDomains(domains, reason, revisions) {
        const unique = new Set(Array.isArray(domains) ? domains : []);
        unique.forEach(domain => scheduleDomainRefresh(domain, reason, revisions?.[domain] || 0));
    }

    async function fetchSnapshot(reason = 'sync') {
        const response = await apiFetch('/live/revisions', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!response.ok) {
            const error = new Error(`live revisions ${response.status}`);
            error.status = response.status;
            throw error;
        }
        const data = await response.json();
        const nextEpoch = String(data.epoch || '');
        const next = cloneRevisions(data.revisions);
        const changed = changedDomains(state.epoch, state.revisions, nextEpoch, next);
        const previousEpoch = state.epoch;
        state.epoch = nextEpoch;
        state.revisions = next;
        if (changed.length) {
            emit('bas:live-resync', { reason, changed, previousEpoch, epoch: nextEpoch, revisions: { ...next } });
            scheduleChangedDomains(changed, reason, next);
        }
        return data;
    }

    function handleEvent(event) {
        if (!event || typeof event !== 'object') return;
        if (event.type === 'sync.ready') {
            const nextEpoch = String(event.epoch || '');
            const next = cloneRevisions(event.revisions);
            const changed = changedDomains(state.epoch, state.revisions, nextEpoch, next);
            const previousEpoch = state.epoch;
            state.epoch = nextEpoch;
            state.revisions = next;
            if (changed.length) {
                emit('bas:live-resync', { reason: 'stream-ready', changed, previousEpoch, epoch: nextEpoch, revisions: { ...next } });
                scheduleChangedDomains(changed, 'stream-ready', next);
            }
            return;
        }
        const domain = String(event.domain || '');
        const revision = Number(event.revision || 0);
        if (domain && Number.isFinite(revision) && revision >= 0) state.revisions[domain] = revision;
        state.events += 1;
        state.lastEvent = event;
        emit('bas:live-event', event);
        if (domain) scheduleDomainRefresh(domain, 'event', revision);
    }

    async function consumeStream(response, generation) {
        if (!response.body || typeof response.body.getReader !== 'function') throw new Error('streaming unsupported');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (state.active && generation === state.generation) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let split;
            while ((split = buffer.indexOf('\n\n')) >= 0) {
                const block = buffer.slice(0, split);
                buffer = buffer.slice(split + 2);
                const dataLines = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
                if (!dataLines.length) continue;
                try { handleEvent(JSON.parse(dataLines.join('\n'))); } catch (error) {}
            }
        }
    }

    function scheduleReconnect(generation) {
        if (!state.active || generation !== state.generation || state.retryTimer) return;
        const delay = Math.min(5000, 500 * Math.pow(2, Math.min(4, state.reconnects)));
        state.retryTimer = setTimeout(() => {
            state.retryTimer = 0;
            if (!state.active || generation !== state.generation) return;
            state.reconnects += 1;
            connectStream(generation);
        }, delay);
    }

    async function connectStream(generation) {
        if (!state.active || generation !== state.generation) return;
        if (state.controller) state.controller.abort();
        const controller = new AbortController();
        state.controller = controller;
        try {
            await fetchSnapshot(state.reconnects ? 'reconnect' : 'start');
            const response = await apiFetch('/live/events', { cache: 'no-store', signal: controller.signal });
            if (!response.ok) {
                const error = new Error(`live events ${response.status}`);
                error.status = response.status;
                throw error;
            }
            state.connected = true;
            state.lastError = '';
            emit('bas:live-status', status());
            await consumeStream(response, generation);
            if (state.active && generation === state.generation) throw new Error('live stream ended');
        } catch (error) {
            if (!state.active || generation !== state.generation || controller.signal.aborted) return;
            if (error?.status === 401 || error?.status === 403) {
                stop();
                emit('bas:live-auth-lost', { status: Number(error.status), error: String(error?.message || error || 'authorization lost') });
                return;
            }
            state.connected = false;
            state.lastError = String(error?.message || error || 'live stream error');
            emit('bas:live-status', status());
            scheduleReconnect(generation);
        }
    }

    function start() {
        stop();
        if (!supported()) return false;
        state.active = true;
        state.connected = false;
        state.reconnects = 0;
        state.events = 0;
        state.refreshes = 0;
        state.refreshErrors = 0;
        state.lastEvent = null;
        state.lastRefresh = null;
        state.lastError = '';
        state.epoch = '';
        state.revisions = {};
        state.generation += 1;
        connectStream(state.generation);
        return true;
    }

    function stop() {
        state.active = false;
        state.connected = false;
        state.generation += 1;
        if (state.controller) state.controller.abort();
        state.controller = null;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        state.retryTimer = 0;
        state.tasks.forEach(task => {
            if (task.timer) clearTimeout(task.timer);
            task.timer = 0;
            task.running = false;
            task.dirty = false;
        });
    }

    function status() {
        return {
            supported: supported(),
            active: state.active,
            connected: state.connected,
            epoch: state.epoch,
            revisions: { ...state.revisions },
            reconnects: state.reconnects,
            events: state.events,
            refreshes: state.refreshes,
            refreshErrors: state.refreshErrors,
            lastEvent: state.lastEvent,
            lastRefresh: state.lastRefresh,
            lastError: state.lastError
        };
    }

    window.BASLiveSync = { supported, start, stop, status, fetchSnapshot, refreshDomain: scheduleDomainRefresh };
})();
