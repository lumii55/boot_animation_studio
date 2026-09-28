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

function basPresencePermissionLabel(permission) {
    const key = {
        view: 'trustPermissionView',
        control: 'trustPermissionControl',
        manage: 'trustPermissionManage',
        admin: 'trustPermissionAdmin'
    }[String(permission || '').toLowerCase()] || 'trustPermissionAdmin';
    return basPresenceText(key, String(permission || 'Admin'));
}

function basPresenceClientTypeLabel(type) {
    switch (type) {
        case 'trusted_browser': return basPresenceText('presenceTypeTrusted', 'Trusted browser');
        case 'temporary_browser': return basPresenceText('presenceTypeTemporary', 'Temporary browser');
        case 'legacy_browser': return basPresenceText('presenceTypeLegacy', 'Legacy browser');
        case 'webui': return basPresenceText('presenceTypeWebUI', 'Module WebUI');
        default: return basPresenceText('presenceTypeBrowser', 'BAS browser');
    }
}

function basPresenceOperationLabel(type) {
    switch (type) {
        case 'apply': return basPresenceText('presenceOperationApply', 'Applying animation');
        case 'restore': return basPresenceText('presenceOperationRestore', 'Restoring default animation');
        case 'rescan': return basPresenceText('presenceOperationRescan', 'Rescanning boot paths');
        case 'factory_reset': return basPresenceText('presenceOperationFactoryReset', 'Running factory reset');
        case 'maintenance': return basPresenceText('presenceOperationMaintenance', 'Running maintenance');
        case 'preview': return basPresenceText('presenceOperationPreview', 'Updating device preview');
        case 'automation_prepare': return basPresenceText('presenceOperationAutomation', 'Preparing next boot animation');
        default: return basPresenceText('presenceOperationGeneric', 'Device operation');
    }
}

function basPresenceFormatTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!Number.isFinite(value) || value <= 0) return '—';
    try { return new Intl.DateTimeFormat(idiomaAtual || undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }
    catch (error) { return new Date(value).toLocaleTimeString(); }
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
    const section = document.getElementById('module-presence');
    if (!section) return;
    const visible = Boolean(isConnectedMode && basPresenceSupported() && moduleWorkspaceUi?.open && moduleWorkspaceUi?.currentTab === 'overview');
    section.hidden = !visible;
    if (!visible) return;

    const title = document.getElementById('module-presence-title');
    const desc = document.getElementById('module-presence-desc');
    const kicker = document.getElementById('module-presence-kicker');
    const refresh = document.getElementById('module-presence-refresh');
    const count = document.getElementById('module-presence-count');
    if (kicker) kicker.textContent = basPresenceText('presenceKicker', 'LIVE CLIENTS');
    if (title) title.textContent = basPresenceText('presenceTitle', 'Connected BAS clients');
    if (desc) desc.textContent = basPresenceText('presenceDesc', 'See which BAS browsers are actively connected to this Companion Module.');
    if (refresh) {
        refresh.textContent = basPresenceText('presenceRefresh', 'Refresh');
        refresh.disabled = basPresenceState.loading;
    }
    if (count) count.textContent = basPresenceText('presenceCount', '{count} live').replace('{count}', String(basPresenceState.clients.length));

    const list = document.getElementById('module-presence-list');
    if (list) {
        list.innerHTML = '';
        if (basPresenceState.loading && !basPresenceState.clients.length) {
            const empty = document.createElement('div');
            empty.className = 'module-presence-empty';
            empty.textContent = basPresenceText('presenceLoading', 'Loading live clients…');
            list.appendChild(empty);
        } else if (!basPresenceState.clients.length) {
            const empty = document.createElement('div');
            empty.className = 'module-presence-empty';
            empty.textContent = basPresenceText('presenceEmpty', 'No live BAS client streams are visible right now.');
            list.appendChild(empty);
        } else {
            basPresenceState.clients.forEach(client => {
                const card = document.createElement('article');
                card.className = 'module-presence-client';
                if (client.current) card.dataset.current = 'true';
                const main = document.createElement('div');
                main.className = 'module-presence-client-main';
                const name = document.createElement('strong');
                name.textContent = String(client.label || basPresenceText('trustGenericClient', 'Boot Animation Studio browser'));
                const meta = document.createElement('span');
                meta.textContent = `${basPresenceClientTypeLabel(client.client_type)} · ${basPresencePermissionLabel(client.permission)}`;
                main.append(name, meta);
                card.appendChild(main);
                if (client.current) {
                    const badge = document.createElement('span');
                    badge.className = 'module-presence-current';
                    badge.textContent = basPresenceText('presenceCurrent', 'THIS CLIENT');
                    card.appendChild(badge);
                }
                list.appendChild(card);
            });
        }
    }

    const operationKicker = document.getElementById('module-operation-kicker');
    if (operationKicker) operationKicker.textContent = basPresenceText('presenceOperationKicker', 'ACTIVE DEVICE OPERATION');

    const operation = document.getElementById('module-operation');
    if (operation) {
        const active = Boolean(basOperationCoordinationSupported() && basPresenceState.operation);
        operation.hidden = !active;
        if (active) {
            operation.dataset.current = basPresenceState.operation.current_owner ? 'true' : 'false';
            const label = document.getElementById('module-operation-label');
            const owner = document.getElementById('module-operation-owner');
            const timing = document.getElementById('module-operation-time');
            if (label) label.textContent = basPresenceOperationLabel(basPresenceState.operation.type);
            if (owner) {
                const ownerText = basPresenceState.operation.current_owner
                    ? basPresenceText('presenceOperationYou', 'This client is running the operation.')
                    : basPresenceText('presenceOperationOwner', 'In use by {client}.').replace('{client}', String(basPresenceState.operation.owner_label || basPresenceText('trustGenericClient', 'another BAS client')));
                owner.textContent = ownerText;
            }
            if (timing) timing.textContent = basPresenceText('presenceOperationStarted', 'Started {time}').replace('{time}', basPresenceFormatTime(basPresenceState.operation.started_at));
        }
    }

    const error = document.getElementById('module-presence-error');
    if (error) {
        error.hidden = !basPresenceState.lastError;
        error.textContent = basPresenceState.lastError;
    }
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

document.getElementById('module-presence-refresh')?.addEventListener('click', () => basPresenceRefresh());

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
