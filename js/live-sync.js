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
        pauseReason: '',
        lastResumeAt: 0,
        controller: null,
        retryTimer: 0,
        generation: 0,
        tasks: new Map(),
        eventLog: [],
        debugTimers: new Set(),
        debug: {
            dropNextEvent: false,
            delayMs: 0,
            droppedEvents: 0,
            forcedReconnects: 0,
            staleTests: 0
        }
    };



    function pushEventLog(kind, detail = {}) {
        const item = {
            timestamp: Date.now(),
            kind: String(kind || 'event'),
            domain: detail.domain ? String(detail.domain) : '',
            revision: Number.isFinite(Number(detail.revision)) ? Number(detail.revision) : null,
            reason: detail.reason ? String(detail.reason).slice(0, 80) : '',
            message: detail.message ? String(detail.message).slice(0, 160) : ''
        };
        state.eventLog.push(item);
        if (state.eventLog.length > 120) state.eventLog.splice(0, state.eventLog.length - 120);
        return item;
    }

    function clearDebugTimers() {
        state.debugTimers.forEach(timer => clearTimeout(timer));
        state.debugTimers.clear();
    }

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
                pushEventLog('refresh.ok', { domain: key, revision: refreshRevision, reason: refreshReason });
                emit('bas:live-refresh', { ...state.lastRefresh });
            } catch (error) {
                state.refreshErrors += 1;
                pushEventLog('refresh.error', { domain: key, revision: refreshRevision, reason: refreshReason, message: String(error?.message || error || 'refresh failed') });
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
            pushEventLog('resync', { reason, message: changed.join(', ') });
            emit('bas:live-resync', { reason, changed, previousEpoch, epoch: nextEpoch, revisions: { ...next } });
            scheduleChangedDomains(changed, reason, next);
        }
        return data;
    }

    function processEvent(event) {
        if (!event || typeof event !== 'object') return;
        if (event.type === 'sync.ready') {
            const nextEpoch = String(event.epoch || '');
            const next = cloneRevisions(event.revisions);
            const changed = changedDomains(state.epoch, state.revisions, nextEpoch, next);
            const previousEpoch = state.epoch;
            state.epoch = nextEpoch;
            state.revisions = next;
            pushEventLog('sync.ready', { reason: changed.length ? 'changed' : 'steady', message: abbreviateEpoch(nextEpoch) });
            if (changed.length) {
                pushEventLog('resync', { reason: 'stream-ready', message: changed.join(', ') });
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
        pushEventLog('event', { domain, revision, reason: String(event.type || '') });
        emit('bas:live-event', event);
        if (domain) scheduleDomainRefresh(domain, 'event', revision);
    }

    function abbreviateEpoch(value) {
        const raw = String(value || '');
        return raw.length > 14 ? `${raw.slice(0, 5)}…${raw.slice(-5)}` : raw;
    }

    function handleEvent(event) {
        if (!event || typeof event !== 'object') return;
        const isDomainEvent = event.type !== 'sync.ready' && Boolean(event.domain);
        if (isDomainEvent && state.debug.dropNextEvent) {
            state.debug.dropNextEvent = false;
            state.debug.droppedEvents += 1;
            pushEventLog('fault.drop', { domain: event.domain, revision: event.revision, reason: event.type || 'event' });
            emit('bas:live-debug', { type: 'drop', domain: String(event.domain || ''), revision: Number(event.revision || 0) });
            return;
        }
        const delay = isDomainEvent ? Math.max(0, Math.min(10000, Number(state.debug.delayMs) || 0)) : 0;
        if (!delay) {
            processEvent(event);
            return;
        }
        pushEventLog('fault.delay', { domain: event.domain, revision: event.revision, reason: `${delay}ms` });
        const generation = state.generation;
        const timer = setTimeout(() => {
            state.debugTimers.delete(timer);
            if (!state.active || generation !== state.generation) return;
            processEvent(event);
        }, delay);
        state.debugTimers.add(timer);
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
        if (navigator.onLine === false) {
            state.connected = false;
            state.pauseReason = 'offline';
            emit('bas:live-status', status());
            return;
        }
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
        if (navigator.onLine === false) {
            state.connected = false;
            state.pauseReason = 'offline';
            emit('bas:live-status', status());
            return;
        }
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
            state.pauseReason = '';
            pushEventLog('stream.connected', { reason: state.reconnects ? 'reconnect' : 'start' });
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
            pushEventLog('stream.error', { reason: 'retry', message: state.lastError });
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
        state.pauseReason = '';
        state.lastResumeAt = Date.now();
        state.epoch = '';
        state.revisions = {};
        state.eventLog = [];
        clearDebugTimers();
        state.debug.dropNextEvent = false;
        state.debug.delayMs = 0;
        state.debug.droppedEvents = 0;
        state.debug.forcedReconnects = 0;
        state.debug.staleTests = 0;
        state.generation += 1;
        connectStream(state.generation);
        return true;
    }

    function stop() {
        state.active = false;
        state.connected = false;
        state.pauseReason = '';
        state.generation += 1;
        clearDebugTimers();
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


    function suspend(reason = 'lifecycle') {
        if (!state.active) return false;
        state.generation += 1;
        if (state.controller) state.controller.abort();
        state.controller = null;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        state.retryTimer = 0;
        state.connected = false;
        state.pauseReason = String(reason || 'lifecycle');
        pushEventLog('stream.suspended', { reason: state.pauseReason });
        emit('bas:live-status', status());
        return true;
    }

    function resume(reason = 'lifecycle') {
        if (!supported()) return false;
        if (!state.active) return start();
        if (navigator.onLine === false) {
            suspend('offline');
            return false;
        }
        state.generation += 1;
        if (state.controller) state.controller.abort();
        state.controller = null;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        state.retryTimer = 0;
        state.connected = false;
        state.pauseReason = '';
        state.lastResumeAt = Date.now();
        const generation = state.generation;
        pushEventLog('stream.resume', { reason: String(reason || 'lifecycle') });
        emit('bas:live-status', status());
        connectStream(generation);
        return true;
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
            lastError: state.lastError,
            pauseReason: state.pauseReason,
            lastResumeAt: state.lastResumeAt,
            eventLog: state.eventLog.map(item => ({ ...item })),
            debug: { ...state.debug }
        };
    }

    function debugSetDropNext(enabled = true) {
        state.debug.dropNextEvent = Boolean(enabled);
        pushEventLog('fault.config', { reason: state.debug.dropNextEvent ? 'drop-next:on' : 'drop-next:off' });
        emit('bas:live-debug', { type: 'drop-next', enabled: state.debug.dropNextEvent });
        return state.debug.dropNextEvent;
    }

    function debugSetDelay(value = 0) {
        state.debug.delayMs = Math.max(0, Math.min(10000, Math.floor(Number(value) || 0)));
        pushEventLog('fault.config', { reason: `delay:${state.debug.delayMs}ms` });
        emit('bas:live-debug', { type: 'delay', delayMs: state.debug.delayMs });
        return state.debug.delayMs;
    }

    function debugForceReconnect() {
        if (!state.active || !supported()) return false;
        const generation = state.generation;
        state.debug.forcedReconnects += 1;
        pushEventLog('fault.reconnect', { reason: 'developer' });
        state.connected = false;
        if (state.controller) state.controller.abort();
        state.controller = null;
        if (state.retryTimer) clearTimeout(state.retryTimer);
        state.retryTimer = 0;
        setTimeout(() => {
            if (!state.active || generation !== state.generation) return;
            state.reconnects += 1;
            connectStream(generation);
        }, 0);
        emit('bas:live-debug', { type: 'force-reconnect' });
        return true;
    }

    async function debugTestStaleRevision(domain) {
        if (!state.active || !supported()) return false;
        const key = String(domain || '').trim();
        if (!key) return false;
        const current = Number(state.revisions[key] || 0);
        state.revisions[key] = current - 1;
        state.debug.staleTests += 1;
        pushEventLog('fault.stale', { domain: key, revision: state.revisions[key], reason: 'developer' });
        emit('bas:live-debug', { type: 'stale-revision', domain: key, revision: state.revisions[key] });
        await fetchSnapshot('developer-stale');
        return true;
    }

    function debugReset() {
        state.debug.dropNextEvent = false;
        state.debug.delayMs = 0;
        clearDebugTimers();
        pushEventLog('fault.config', { reason: 'reset' });
        emit('bas:live-debug', { type: 'reset' });
    }

    function debugClearLog() {
        state.eventLog = [];
        emit('bas:live-debug', { type: 'clear-log' });
    }

    window.BASLiveSync = {
        supported,
        start,
        stop,
        suspend,
        resume,
        status,
        fetchSnapshot,
        refreshDomain: scheduleDomainRefresh,
        debug: Object.freeze({
            setDropNext: debugSetDropNext,
            setDelay: debugSetDelay,
            forceReconnect: debugForceReconnect,
            testStaleRevision: debugTestStaleRevision,
            reset: debugReset,
            clearLog: debugClearLog
        })
    };
})();
