const basPresenceState = {
    clients: [],
    operation: null,
    loading: false,
    lastError: '',
    expiryTimer: 0
};

function basPresenceText(key, fallback) {
    try {
        if (typeof traducoes !== 'undefined' && typeof idiomaAtual !== 'undefined' && traducoes[idiomaAtual]?.[key]) return traducoes[idiomaAtual][key];
    } catch (error) {}
    return fallback;
}

function basPresenceSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('client_presence');
}

function basOperationCoordinationSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('operation_coordination');
}

function basPresenceScheduleExpiryRefresh() {
    clearTimeout(basPresenceState.expiryTimer);
    basPresenceState.expiryTimer = 0;
    const expiresAt = Number(basPresenceState.operation?.expires_at || 0);
    if (!expiresAt) return;
    const delay = Math.max(250, Math.min(2147480000, expiresAt - Date.now() + 250));
    basPresenceState.expiryTimer = setTimeout(() => {
        basPresenceState.expiryTimer = 0;
        if (isConnectedMode && basPresenceSupported()) basPresenceRefresh({ silent: true });
    }, delay);
}

function basPresenceRender() {
    basPresenceScheduleExpiryRefresh();
}

async function basPresenceRefresh(options = {}) {
    if (!isConnectedMode || !basPresenceSupported() || basPresenceState.loading) return null;
    basPresenceState.loading = true;
    if (!options.silent) basPresenceState.lastError = '';
    basPresenceRender();
    try {
        const response = await apiFetch('/presence/status', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'ok' || !Array.isArray(data.clients)) throw new Error(data.message || 'presence_failed');
        basPresenceState.clients = data.clients;
        basPresenceState.operation = data.operation || null;
        basPresenceState.lastError = '';
        return data;
    } catch (error) {
        if (!options.silent) basPresenceState.lastError = basPresenceText('presenceLoadError', 'Could not load live client presence.');
        return null;
    } finally {
        basPresenceState.loading = false;
        basPresenceRender();
    }
}

function basPresenceHandleBusy(operation) {
    if (!operation || typeof operation !== 'object') return;
    basPresenceState.operation = operation;
    basPresenceState.lastError = basPresenceText('presenceBusyError', 'Another device operation is already in progress.');
    basPresenceRender();
}

function basPresenceReset() {
    clearTimeout(basPresenceState.expiryTimer);
    basPresenceState.expiryTimer = 0;
    basPresenceState.clients = [];
    basPresenceState.operation = null;
    basPresenceState.loading = false;
    basPresenceState.lastError = '';
    basPresenceRender();
}

function basPresenceSyncText() {
    basPresenceRender();
}


window.BASPresence = {
    supported: basPresenceSupported,
    operationSupported: basOperationCoordinationSupported,
    refresh: basPresenceRefresh,
    render: basPresenceRender,
    sync: basPresenceRender,
    syncText: basPresenceSyncText,
    handleBusy: basPresenceHandleBusy,
    resetConnection: basPresenceReset,
    state: () => ({ clients: basPresenceState.clients.slice(), operation: basPresenceState.operation ? { ...basPresenceState.operation } : null, lastError: basPresenceState.lastError })
};
