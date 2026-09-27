const trustCenterState = {
    clients: [],
    loading: false,
    bound: false
};

function trustCenterText(key, fallback) {
    try {
        return traducoes?.[idiomaAtual]?.[key] || fallback;
    } catch (error) {
        return fallback;
    }
}

function trustCenterSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('trusted_clients') && (!hasModuleFeature('trust_permissions') || (typeof hasModulePermission === 'function' && hasModulePermission('admin')));
}

function trustCenterPermissionsSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('trust_permissions');
}

function trustCenterShortId(value) {
    const id = String(value || '');
    return id.length > 16 ? `…${id.slice(-10)}` : id;
}

function trustCenterFormatTime(value) {
    const stamp = Number(value) || 0;
    if (!stamp) return trustCenterText('trustNever', 'Never');
    try {
        const locales = { en: 'en-US', pt: 'pt-BR', es: 'es-ES', fr: 'fr-FR' };
        return new Intl.DateTimeFormat(locales[idiomaAtual] || undefined, {
            dateStyle: 'medium', timeStyle: 'short'
        }).format(new Date(stamp));
    } catch (error) {
        return new Date(stamp).toLocaleString();
    }
}

function trustCenterSetStatus(message = '', state = '') {
    const element = document.getElementById('trust-center-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
    element.hidden = !message;
}

function trustCenterRender() {
    const section = document.getElementById('module-trust-center');
    const list = document.getElementById('trust-center-list');
    const count = document.getElementById('trust-center-count');
    const revokeAll = document.getElementById('trust-center-revoke-all');
    if (!section || !list) return;

    const supported = trustCenterSupported();
    section.hidden = !supported || moduleWorkspaceUi?.currentTab !== 'access';
    if (!supported) return;

    if (count) count.textContent = String(trustCenterState.clients.length);
    if (revokeAll) revokeAll.disabled = trustCenterState.loading || !trustCenterState.clients.length;

    if (trustCenterState.loading && !trustCenterState.clients.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('trustLoading', 'Loading trusted clients…')}</strong></div>`;
        return;
    }

    if (!trustCenterState.clients.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('trustEmpty', 'No trusted clients yet')}</strong><span>${trustCenterText('trustEmptyDesc', 'Approve a BAS browser to create its trusted identity.')}</span></div>`;
        return;
    }

    list.innerHTML = '';
    trustCenterState.clients.forEach(client => {
        const card = document.createElement('article');
        card.className = 'trust-client-card';
        if (client.current) card.dataset.current = 'true';

        const head = document.createElement('div');
        head.className = 'trust-client-head';
        const identity = document.createElement('div');
        identity.className = 'trust-client-identity';
        const title = document.createElement('strong');
        title.textContent = String(client.label || trustCenterText('trustGenericClient', 'Boot Animation Studio browser'));
        const id = document.createElement('span');
        id.textContent = trustCenterShortId(client.id);
        identity.append(title, id);
        head.appendChild(identity);
        if (client.current) {
            const badge = document.createElement('span');
            badge.className = 'trust-client-current';
            badge.textContent = trustCenterText('trustCurrent', 'CURRENT');
            head.appendChild(badge);
        }

        const facts = document.createElement('div');
        facts.className = 'trust-client-facts';
        const addFact = (label, value) => {
            const item = document.createElement('div');
            const small = document.createElement('span');
            small.textContent = label;
            const strong = document.createElement('strong');
            strong.textContent = value;
            item.append(small, strong);
            facts.appendChild(item);
        };
        addFact(trustCenterText('trustLastSeen', 'Last access'), trustCenterFormatTime(client.last_seen_at));
        addFact(trustCenterText('trustApproved', 'Approved'), trustCenterFormatTime(client.last_approved_at || client.created_at));
        addFact(trustCenterText('trustSessions', 'Active sessions'), String(Number(client.active_sessions) || 0));
        if (trustCenterPermissionsSupported()) addFact(trustCenterText('trustPermission', 'Access level'), trustCenterText('trustPermission' + String(client.permission || 'admin').replace(/^./, c => c.toUpperCase()), String(client.permission || 'admin')));

        const actions = document.createElement('div');
        actions.className = 'trust-client-actions';
        if (trustCenterPermissionsSupported()) {
            const roleWrap = document.createElement('label');
            roleWrap.className = 'trust-client-role';
            const roleLabel = document.createElement('span');
            roleLabel.textContent = trustCenterText('trustPermission', 'Access level');
            const role = document.createElement('select');
            role.setAttribute('aria-label', trustCenterText('trustPermission', 'Access level'));
            [
                ['view', trustCenterText('trustPermissionView', 'View')],
                ['control', trustCenterText('trustPermissionControl', 'Control')],
                ['manage', trustCenterText('trustPermissionManage', 'Manage')],
                ['admin', trustCenterText('trustPermissionAdmin', 'Admin')]
            ].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value; option.textContent = label; role.appendChild(option);
            });
            role.value = ['view','control','manage','admin'].includes(client.permission) ? client.permission : 'admin';
            role.disabled = trustCenterState.loading || client.current;
            if (client.current) role.title = trustCenterText('trustPermissionCurrentHint', 'Use another Admin client to change this browser access level.');
            role.addEventListener('change', () => trustCenterSetPermission(client, role.value));
            roleWrap.append(roleLabel, role);
            actions.appendChild(roleWrap);
        }
        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.className = 'btn-upload is-danger';
        revoke.textContent = client.current ? trustCenterText('trustRevokeCurrent', 'Revoke this browser') : trustCenterText('trustRevoke', 'Revoke');
        revoke.disabled = trustCenterState.loading;
        revoke.addEventListener('click', () => trustCenterRevoke(client));
        actions.appendChild(revoke);

        card.append(head, facts, actions);
        list.appendChild(card);
    });
}

async function trustCenterRefresh(options = {}) {
    if (!trustCenterSupported() || !isConnectedMode || trustCenterState.loading) return;
    trustCenterState.loading = true;
    if (!options.silent) trustCenterSetStatus(trustCenterText('trustLoading', 'Loading trusted clients…'), 'loading');
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/clients', { signal: AbortSignal.timeout(5000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'ok' || !Array.isArray(data.clients)) throw new Error(data.message || 'trust_list_failed');
        trustCenterState.clients = data.clients;
        trustCenterSetStatus('', '');
    } catch (error) {
        const signal = window.BASMultiDevice?.activeSignal?.();
        if (!signal?.aborted) trustCenterSetStatus(trustCenterText('trustLoadError', 'Could not load trusted clients.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterSetPermission(client, permission) {
    if (!client?.id || trustCenterState.loading || !trustCenterPermissionsSupported()) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/permission', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: client.id, permission })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'ok') throw new Error(data.message || 'trust_permission_failed');
        client.permission = data.permission || permission;
        if (client.current) {
            moduleAccessPermission = normalizeModuleAccessPermission(client.permission);
            syncModulePermissionUi();
        }
        trustCenterSetStatus(trustCenterText('trustPermissionSaved', 'Access level updated.'), 'success');
        await trustCenterRefresh({ silent: true });
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustPermissionError', 'Could not update this client access level.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterRevoke(client) {
    if (!client?.id || trustCenterState.loading) return;
    const question = client.current
        ? trustCenterText('trustRevokeCurrentConfirm', 'Revoke this browser? Its current BAS session will end immediately.')
        : trustCenterText('trustRevokeConfirm', 'Revoke this trusted client and end all of its active sessions?');
    if (!confirm(question)) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/revoke', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: client.id })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'revoked') throw new Error(data.message || 'trust_revoke_failed');
        if (client.current) {
            trustCenterState.clients = [];
            await disconnectPhone();
            return;
        }
        await trustCenterRefresh({ silent: true });
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustRevokeError', 'Could not revoke this trusted client.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterRevokeAll() {
    if (trustCenterState.loading || !trustCenterState.clients.length) return;
    if (!confirm(trustCenterText('trustRevokeAllConfirm', 'Revoke every trusted BAS client and end all website sessions? The local Module WebUI session is not removed.'))) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/revoke-all', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'revoked') throw new Error(data.message || 'trust_revoke_all_failed');
        trustCenterState.clients = [];
        await disconnectPhone();
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustRevokeAllError', 'Could not revoke all trusted clients.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

function trustCenterSyncText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = trustCenterText(key, fallback);
    };
    set('trust-center-kicker', 'trustKicker', 'TRUST & ACCESS');
    set('trust-center-title', 'trustTitle', 'Trusted clients');
    set('trust-center-desc', 'trustDesc', 'Manage browsers that have been approved to control this Companion Module.');
    set('trust-center-security-note', 'trustSecurityNote', 'Trusted reconnects use a browser-held signing key. Session tokens remain temporary and are never stored in BAS localStorage.');
    set('trust-center-refresh-label', 'trustRefresh', 'Refresh');
    set('trust-center-revoke-all-label', 'trustRevokeAll', 'Revoke all');
    set('module-workspace-tab-access-label', 'moduleWorkspaceAccess', 'Access');
    trustCenterRender();
}

function trustCenterResetConnection() {
    trustCenterState.clients = [];
    trustCenterState.loading = false;
    trustCenterSetStatus('', '');
    trustCenterRender();
}

function trustCenterBind() {
    if (trustCenterState.bound) return;
    trustCenterState.bound = true;
    document.getElementById('trust-center-refresh')?.addEventListener('click', () => trustCenterRefresh());
    document.getElementById('trust-center-revoke-all')?.addEventListener('click', trustCenterRevokeAll);
    trustCenterSyncText();
}

window.BASTrustCenter = {
    supported: trustCenterSupported,
    refresh: trustCenterRefresh,
    sync: trustCenterRender,
    syncText: trustCenterSyncText,
    resetConnection: trustCenterResetConnection
};

window.addEventListener('DOMContentLoaded', trustCenterBind);
