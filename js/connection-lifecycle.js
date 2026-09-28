(() => {
    const state = {
        bound: false,
        timer: 0,
        running: false,
        dirty: false,
        resumes: 0,
        legacyRefreshes: 0,
        liveResumes: 0,
        lastReason: '',
        lastRunAt: 0,
        lastSuccessAt: 0,
        lastError: ''
    };

    function connected() {
        return Boolean(typeof isConnectedMode !== 'undefined' && isConnectedMode && typeof sessionToken !== 'undefined' && sessionToken);
    }

    function shouldDisconnectOnPageHide(event) {
        return !(event && event.type === 'pagehide' && event.persisted === true);
    }

    async function refreshLegacySurfaces() {
        const tasks = [];
        if (typeof globalThis.loadHistory === 'function' && typeof hasModuleFeature === 'function' && hasModuleFeature('history')) {
            tasks.push(Promise.resolve().then(() => globalThis.loadHistory()));
        }
        if (globalThis.BASModuleTest?.supported?.()) tasks.push(globalThis.BASModuleTest.refreshStatus?.());
        if (globalThis.BASPlaylist?.supported?.()) tasks.push(globalThis.BASPlaylist.refresh?.({ silent: true }));
        if (globalThis.BASRotation?.supported?.()) tasks.push(globalThis.BASRotation.refresh?.({ silent: true }));
        if (globalThis.BASBootActivity?.supported?.()) tasks.push(globalThis.BASBootActivity.refresh?.({ silent: true }));
        if (globalThis.BASHealthCenter?.supported?.()) tasks.push(globalThis.BASHealthCenter.refresh?.({ silent: true }));
        if (globalThis.BASTrustCenter?.supported?.()) tasks.push(globalThis.BASTrustCenter.refresh?.({ silent: true }));
        if (globalThis.BASDeviceIntelligence?.supported?.()) tasks.push(globalThis.BASDeviceIntelligence.refresh?.({ silent: true }));
        await Promise.allSettled(tasks.filter(Boolean));
        state.legacyRefreshes += 1;
    }

    async function run(reason = 'resume') {
        if (!connected() || navigator.onLine === false) return false;
        if (state.running) {
            state.dirty = true;
            state.lastReason = String(reason || 'resume');
            return false;
        }
        state.running = true;
        state.lastReason = String(reason || 'resume');
        state.lastRunAt = Date.now();
        state.lastError = '';
        try {
            await globalThis.BASRefreshConnectedModuleState?.({ silent: true });
            if (!connected()) return false;
            if (globalThis.BASLiveSync?.supported?.()) {
                const live = globalThis.BASLiveSync.status?.() || {};
                if (live.active) await globalThis.BASLiveSync.resume?.(state.lastReason);
                else globalThis.BASLiveSync.start?.();
                state.liveResumes += 1;
                if (globalThis.BASPresence?.supported?.()) await globalThis.BASPresence.refresh?.({ silent: true });
            } else {
                await refreshLegacySurfaces();
            }
            state.resumes += 1;
            state.lastSuccessAt = Date.now();
            return true;
        } catch (error) {
            state.lastError = String(error?.message || error || 'lifecycle refresh failed').slice(0, 220);
            if (Number(error?.status) === 401 || Number(error?.status) === 403) {
                window.dispatchEvent(new CustomEvent('bas:live-auth-lost', { detail: { status: Number(error.status), source: 'lifecycle-resume' } }));
            }
            return false;
        } finally {
            state.running = false;
            if (state.dirty) {
                state.dirty = false;
                schedule('coalesced', 120);
            }
        }
    }

    function schedule(reason = 'resume', delay = 80) {
        state.lastReason = String(reason || 'resume');
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            state.timer = 0;
            run(state.lastReason);
        }, Math.max(0, Number(delay) || 0));
    }

    function handleVisibility() {
        if (document.visibilityState === 'visible') schedule('visibility', 120);
    }

    function handleOnline() {
        schedule('online', 40);
    }

    function handleOffline() {
        globalThis.BASLiveSync?.suspend?.('offline');
    }

    function handlePageShow(event) {
        schedule(event?.persisted ? 'pageshow-bfcache' : 'pageshow', event?.persisted ? 40 : 120);
    }

    function bind() {
        if (state.bound) return;
        state.bound = true;
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('pageshow', handlePageShow);
    }

    function status() {
        return {
            bound: state.bound,
            running: state.running,
            resumes: state.resumes,
            legacyRefreshes: state.legacyRefreshes,
            liveResumes: state.liveResumes,
            lastReason: state.lastReason,
            lastRunAt: state.lastRunAt,
            lastSuccessAt: state.lastSuccessAt,
            lastError: state.lastError
        };
    }

    window.BASConnectionLifecycle = Object.freeze({
        bind,
        run,
        schedule,
        status,
        shouldDisconnectOnPageHide
    });

    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
