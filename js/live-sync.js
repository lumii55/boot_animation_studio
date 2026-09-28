(() => {
    const state = {
        active: false,
        connected: false,
        epoch: '',
        revisions: {},
        reconnects: 0,
        events: 0,
        lastEvent: null,
        lastError: '',
        controller: null,
        retryTimer: 0,
        generation: 0
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

    async function fetchSnapshot(reason = 'sync') {
        const response = await apiFetch('/live/revisions', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error(`live revisions ${response.status}`);
        const data = await response.json();
        const nextEpoch = String(data.epoch || '');
        const next = cloneRevisions(data.revisions);
        const changed = changedDomains(state.epoch, state.revisions, nextEpoch, next);
        const previousEpoch = state.epoch;
        state.epoch = nextEpoch;
        state.revisions = next;
        if (changed.length) emit('bas:live-resync', { reason, changed, previousEpoch, epoch: nextEpoch, revisions: { ...next } });
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
            if (changed.length) emit('bas:live-resync', { reason: 'stream-ready', changed, previousEpoch, epoch: nextEpoch, revisions: { ...next } });
            return;
        }
        const domain = String(event.domain || '');
        const revision = Number(event.revision || 0);
        if (domain && Number.isFinite(revision) && revision >= 0) state.revisions[domain] = revision;
        state.events += 1;
        state.lastEvent = event;
        emit('bas:live-event', event);
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
            if (!response.ok) throw new Error(`live events ${response.status}`);
            state.connected = true;
            state.lastError = '';
            emit('bas:live-status', status());
            await consumeStream(response, generation);
            if (state.active && generation === state.generation) throw new Error('live stream ended');
        } catch (error) {
            if (!state.active || generation !== state.generation || controller.signal.aborted) return;
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
        state.lastEvent = null;
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
            lastEvent: state.lastEvent,
            lastError: state.lastError
        };
    }

    window.BASLiveSync = { supported, start, stop, status, fetchSnapshot };
})();
