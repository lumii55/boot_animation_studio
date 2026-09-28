const trustCenterState = {
    clients: [],
    sessions: [],
    audit: [],
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

function trustCenterSessionsSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('trust_session_management');
}

function trustCenterAuditSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('security_audit');
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

function trustCenterPermissionLabel(permission) {
    const normalized = ['view', 'control', 'manage', 'admin'].includes(permission) ? permission : 'admin';
    return trustCenterText('trustPermission' + normalized.replace(/^./, c => c.toUpperCase()), normalized);
}

function trustCenterSetStatus(message = '', state = '') {
    const element = document.getElementById('trust-center-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
    element.hidden = !message;
}

function trustCenterFact(container, label, value) {
    const item = document.createElement('div');
    const small = document.createElement('span');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(small, strong);
    container.appendChild(item);
}

function trustCenterRenderSessions() {
    const list = document.getElementById('trust-session-list');
    const block = document.getElementById('trust-session-block');
    const count = document.getElementById('trust-session-count');
    const disconnectAll = document.getElementById('trust-center-disconnect-all');
    if (!list || !block) return;

    const supported = trustCenterSessionsSupported();
    block.hidden = !supported;
    if (!supported) return;

    if (count) count.textContent = String(trustCenterState.sessions.length);
    if (disconnectAll) disconnectAll.disabled = trustCenterState.loading || !trustCenterState.sessions.length;

    if (trustCenterState.loading && !trustCenterState.sessions.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('trustSessionsLoading', 'Loading active sessions…')}</strong></div>`;
        return;
    }
    if (!trustCenterState.sessions.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('trustSessionsEmpty', 'No active BAS sessions')}</strong><span>${trustCenterText('trustSessionsEmptyDesc', 'New approved connections will appear here until they disconnect or the module server restarts.')}</span></div>`;
        return;
    }

    list.innerHTML = '';
    trustCenterState.sessions.forEach(session => {
        const card = document.createElement('article');
        card.className = 'trust-client-card trust-session-card';
        if (session.current) card.dataset.current = 'true';

        const head = document.createElement('div');
        head.className = 'trust-client-head';
        const identity = document.createElement('div');
        identity.className = 'trust-client-identity';
        const title = document.createElement('strong');
        title.textContent = String(session.label || trustCenterText('trustGenericClient', 'Boot Animation Studio browser'));
        const meta = document.createElement('span');
        meta.textContent = session.legacy ? trustCenterText('trustLegacySession', 'Legacy session') : trustCenterShortId(session.client_id || session.id);
        identity.append(title, meta);
        head.appendChild(identity);

        const badges = document.createElement('div');
        badges.className = 'trust-client-badges';
        if (session.current) {
            const badge = document.createElement('span');
            badge.className = 'trust-client-current';
            badge.textContent = trustCenterText('trustCurrent', 'CURRENT');
            badges.appendChild(badge);
        }
        const kind = document.createElement('span');
        kind.className = 'trust-session-kind';
        kind.textContent = session.legacy
            ? trustCenterText('trustSessionLegacy', 'Legacy')
            : session.persistent
                ? trustCenterText('trustSessionTrusted', 'Trusted')
                : trustCenterText('trustSessionTemporary', 'Temporary');
        badges.appendChild(kind);
        head.appendChild(badges);

        const facts = document.createElement('div');
        facts.className = 'trust-client-facts';
        trustCenterFact(facts, trustCenterText('trustPermission', 'Access level'), trustCenterPermissionLabel(session.permission));
        trustCenterFact(facts, trustCenterText('trustSessionIP', 'IP address'), String(session.client_ip || '—'));
        trustCenterFact(facts, trustCenterText('trustSessionStarted', 'Connected'), trustCenterFormatTime(session.created_at));
        trustCenterFact(facts, trustCenterText('trustLastSeen', 'Last access'), trustCenterFormatTime(session.last_seen_at));

        const actions = document.createElement('div');
        actions.className = 'trust-client-actions';
        const disconnect = document.createElement('button');
        disconnect.type = 'button';
        disconnect.className = 'btn-upload is-danger';
        disconnect.textContent = session.current ? trustCenterText('trustDisconnectCurrent', 'Disconnect this session') : trustCenterText('trustDisconnectSession', 'Disconnect');
        disconnect.disabled = trustCenterState.loading;
        disconnect.addEventListener('click', () => trustCenterDisconnectSession(session));
        actions.appendChild(disconnect);

        card.append(head, facts, actions);
        list.appendChild(card);
    });
}

function trustCenterAuditActionLabel(action) {
    const key = 'securityAuditAction' + String(action || '').split(/[._-]/).filter(Boolean).map(part => part.replace(/^./, c => c.toUpperCase())).join('');
    const fallbacks = {
        'auth.approved': 'Connection approved',
        'auth.denied': 'Connection denied',
        'auth.reconnected': 'Trusted browser reconnected',
        'session.disconnected.self': 'Website disconnected',
        'session.disconnected.page_unload': 'Website closed or reloaded',
        'session.disconnected.admin': 'Session disconnected by Admin',
        'session.disconnected.all': 'All website sessions disconnected',
        'trust.permission.changed': 'Trusted browser access changed',
        'trust.revoked': 'Trusted browser revoked',
        'trust.revoked.all': 'All trusted browsers revoked',
        'animation.applied': 'Animation applied',
        'animation.restored_default': 'Default animation restored',
        'module.reset': 'Module data reset',
        'module.rescan': 'Boot paths rescanned',
        'module.factory_reset': 'Factory reset',
        'history.applied': 'History animation applied',
        'history.deleted': 'History item deleted',
        'playlist.applied': 'Playlist animation applied',
        'rotation.configured': 'Rotation changed',
        'rotation.next_prepared': 'Next rotation animation changed',
        'rotation.pause_changed': 'Rotation pause changed',
        'queue.changed': 'Boot Queue changed',
        'queue.cleared': 'Boot Queue cleared',
        'queue.next_skipped': 'Next boot skipped',
        'test.applied': 'Test animation applied',
        'audit.cleared': 'Security audit cleared'
    };
    return trustCenterText(key, fallbacks[action] || String(action || 'Security event'));
}

function trustCenterAuditActorLabel(actor) {
    if (actor?.label) return String(actor.label);
    const type = String(actor?.type || 'unknown');
    if (type === 'webui') return trustCenterText('securityAuditActorWebUI', 'Local Module WebUI');
    if (type === 'legacy') return trustCenterText('securityAuditActorLegacy', 'Legacy BAS website');
    if (type === 'companion') return trustCenterText('securityAuditActorCompanion', 'Companion approval');
    if (type === 'trusted') return trustCenterText('securityAuditActorTrusted', 'Trusted BAS browser');
    return trustCenterText('securityAuditActorUnknown', 'Unknown client');
}

function trustCenterRenderAudit() {
    const block = document.getElementById('security-audit-block');
    const list = document.getElementById('security-audit-list');
    const count = document.getElementById('security-audit-count');
    const clear = document.getElementById('security-audit-clear');
    const download = document.getElementById('security-audit-download');
    if (!block || !list) return;
    const supported = trustCenterAuditSupported();
    block.hidden = !supported;
    if (!supported) return;
    if (count) count.textContent = String(trustCenterState.audit.length);
    if (clear) clear.disabled = trustCenterState.loading || !trustCenterState.audit.length;
    if (download) download.disabled = trustCenterState.loading || !trustCenterState.audit.length;
    if (trustCenterState.loading && !trustCenterState.audit.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('securityAuditLoading', 'Loading Security Audit…')}</strong></div>`;
        return;
    }
    if (!trustCenterState.audit.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('securityAuditEmpty', 'No sensitive actions recorded yet')}</strong><span>${trustCenterText('securityAuditEmptyDesc', 'Approvals, access changes and sensitive module controls will appear here.')}</span></div>`;
        return;
    }
    list.innerHTML = '';
    trustCenterState.audit.forEach(event => {
        const card = document.createElement('article');
        card.className = 'security-audit-event';
        const head = document.createElement('div');
        head.className = 'security-audit-event-head';
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = trustCenterAuditActionLabel(event.action);
        const when = document.createElement('span');
        when.textContent = trustCenterFormatTime(event.timestamp);
        copy.append(title, when);
        const category = document.createElement('span');
        category.className = 'security-audit-category';
        category.textContent = String(event.category || 'security');
        head.append(copy, category);
        const facts = document.createElement('div');
        facts.className = 'trust-client-facts security-audit-facts';
        trustCenterFact(facts, trustCenterText('securityAuditActor', 'Actor'), trustCenterAuditActorLabel(event.actor));
        if (event.actor?.permission) trustCenterFact(facts, trustCenterText('trustPermission', 'Access level'), trustCenterPermissionLabel(event.actor.permission));
        if (event.actor?.client_ip) trustCenterFact(facts, trustCenterText('trustSessionIP', 'IP address'), String(event.actor.client_ip));
        if (event.target) trustCenterFact(facts, trustCenterText('securityAuditTarget', 'Target'), trustCenterShortId(event.target));
        const details = event.details && typeof event.details === 'object' ? Object.entries(event.details).filter(([, value]) => String(value || '').trim()) : [];
        if (details.length) {
            const detail = document.createElement('p');
            detail.className = 'security-audit-details';
            detail.textContent = details.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`).join(' · ');
            card.append(head, facts, detail);
        } else {
            card.append(head, facts);
        }
        list.appendChild(card);
    });
}

function trustCenterRenderClients() {
    const list = document.getElementById('trust-center-list');
    const trustedCount = document.getElementById('trust-client-count');
    const revokeAll = document.getElementById('trust-center-revoke-all');
    if (!list) return;

    if (trustedCount) trustedCount.textContent = String(trustCenterState.clients.length);
    if (revokeAll) revokeAll.disabled = trustCenterState.loading || !trustCenterState.clients.length;

    if (trustCenterState.loading && !trustCenterState.clients.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('trustLoading', 'Loading trusted clients…')}</strong></div>`;
        return;
    }
    if (!trustCenterState.clients.length) {
        list.innerHTML = `<div class="trust-center-empty"><strong>${trustCenterText('trustEmpty', 'No trusted clients yet')}</strong><span>${trustCenterText('trustEmptyDesc', 'Approve a BAS browser with “Always trust” enabled to create its trusted identity.')}</span></div>`;
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
        trustCenterFact(facts, trustCenterText('trustLastSeen', 'Last access'), trustCenterFormatTime(client.last_seen_at));
        trustCenterFact(facts, trustCenterText('trustApproved', 'Approved'), trustCenterFormatTime(client.last_approved_at || client.created_at));
        trustCenterFact(facts, trustCenterText('trustSessions', 'Active sessions'), String(Number(client.active_sessions) || 0));
        if (trustCenterPermissionsSupported()) trustCenterFact(facts, trustCenterText('trustPermission', 'Access level'), trustCenterPermissionLabel(client.permission));

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
                option.value = value;
                option.textContent = label;
                role.appendChild(option);
            });
            role.value = ['view', 'control', 'manage', 'admin'].includes(client.permission) ? client.permission : 'admin';
            role.disabled = trustCenterState.loading || client.current;
            if (client.current) role.title = trustCenterText('trustPermissionCurrentHint', 'Use another Admin client to change this browser access level.');
            role.addEventListener('change', () => trustCenterSetPermission(client, role.value));
            roleWrap.append(roleLabel, role);
            actions.appendChild(roleWrap);
        }

        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.className = 'btn-upload is-danger';
        revoke.textContent = client.current ? trustCenterText('trustRevokeCurrent', 'Revoke this browser') : trustCenterText('trustRevoke', 'Revoke trust');
        revoke.disabled = trustCenterState.loading;
        revoke.addEventListener('click', () => trustCenterRevoke(client));
        actions.appendChild(revoke);

        card.append(head, facts, actions);
        list.appendChild(card);
    });
}

function trustCenterRender() {
    const section = document.getElementById('module-trust-center');
    if (!section) return;

    const supported = trustCenterSupported();
    const permissionAllowed = !hasModuleFeature('trust_permissions') || (typeof hasModulePermission === 'function' && hasModulePermission('admin'));
    section.hidden = !supported || !permissionAllowed || moduleWorkspaceUi?.currentTab !== 'device';
    if (!supported || !permissionAllowed) return;

    trustCenterRenderSessions();
    trustCenterRenderClients();
    trustCenterRenderAudit();
}

async function trustCenterRefresh(options = {}) {
    if (!trustCenterSupported() || !isConnectedMode || trustCenterState.loading) return;
    trustCenterState.loading = true;
    if (!options.silent) trustCenterSetStatus(trustCenterText('trustLoadingAccess', 'Loading access information…'), 'loading');
    trustCenterRender();
    try {
        const clientRequest = apiFetch('/trust/clients', { signal: AbortSignal.timeout(5000) });
        const sessionRequest = trustCenterSessionsSupported()
            ? apiFetch('/trust/sessions', { signal: AbortSignal.timeout(5000) })
            : Promise.resolve(null);
        const auditRequest = trustCenterAuditSupported()
            ? apiFetch('/audit/list', { signal: AbortSignal.timeout(5000) })
            : Promise.resolve(null);
        const [clientResponse, sessionResponse, auditResponse] = await Promise.all([clientRequest, sessionRequest, auditRequest]);
        const clientData = await clientResponse.json().catch(() => ({}));
        if (!clientResponse.ok || clientData.status !== 'ok' || !Array.isArray(clientData.clients)) throw new Error(clientData.message || 'trust_list_failed');
        trustCenterState.clients = clientData.clients;
        if (sessionResponse) {
            const sessionData = await sessionResponse.json().catch(() => ({}));
            if (!sessionResponse.ok || sessionData.status !== 'ok' || !Array.isArray(sessionData.sessions)) throw new Error(sessionData.message || 'trust_sessions_failed');
            trustCenterState.sessions = sessionData.sessions;
        } else {
            trustCenterState.sessions = [];
        }
        if (auditResponse) {
            const auditData = await auditResponse.json().catch(() => ({}));
            if (!auditResponse.ok || auditData.status !== 'ok' || !Array.isArray(auditData.events)) throw new Error(auditData.message || 'security_audit_failed');
            trustCenterState.audit = auditData.events;
        } else {
            trustCenterState.audit = [];
        }
        trustCenterSetStatus('', '');
    } catch (error) {
        const signal = window.BASMultiDevice?.activeSignal?.();
        if (!signal?.aborted) trustCenterSetStatus(trustCenterText('trustLoadError', 'Could not load access information.'), 'error');
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
        trustCenterSetStatus(trustCenterText('trustPermissionSaved', 'Access level updated.'), 'success');
        await trustCenterRefresh({ silent: true });
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustPermissionError', 'Could not update this client access level.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterDisconnectSession(session) {
    if (!session?.id || trustCenterState.loading || !trustCenterSessionsSupported()) return;
    const question = session.current
        ? trustCenterText('trustDisconnectCurrentConfirm', 'Disconnect this BAS session now? You will be disconnected immediately, but persistent trust will not be removed.')
        : trustCenterText('trustDisconnectSessionConfirm', 'Disconnect this active BAS session? Persistent trust, if any, will be kept.');
    if (!confirm(question)) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/session/disconnect', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.id })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'disconnected') throw new Error(data.message || 'session_disconnect_failed');
        if (session.current) {
            trustCenterState.sessions = [];
            await disconnectPhone();
            return;
        }
        trustCenterSetStatus(trustCenterText('trustSessionDisconnected', 'Session disconnected. Persistent trust was not changed.'), 'success');
        await trustCenterRefresh({ silent: true });
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustSessionDisconnectError', 'Could not disconnect this session.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterDisconnectAllSessions() {
    if (trustCenterState.loading || !trustCenterState.sessions.length || !trustCenterSessionsSupported()) return;
    if (!confirm(trustCenterText('trustDisconnectAllConfirm', 'Disconnect every active BAS website session? Persistent trusted browsers will remain trusted and can reconnect later.'))) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/sessions/disconnect-all', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'disconnected') throw new Error(data.message || 'sessions_disconnect_failed');
        trustCenterState.sessions = [];
        await disconnectPhone();
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustDisconnectAllError', 'Could not disconnect all sessions.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterRevoke(client) {
    if (!client?.id || trustCenterState.loading) return;
    const question = client.current
        ? trustCenterText('trustRevokeCurrentConfirm', 'Revoke this browser trust? Its current BAS session will end immediately and it will need approval next time.')
        : trustCenterText('trustRevokeConfirm', 'Revoke persistent trust for this browser and end all of its active sessions?');
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
            trustCenterState.sessions = [];
            await disconnectPhone();
            return;
        }
        trustCenterSetStatus(trustCenterText('trustRevoked', 'Persistent trust revoked.'), 'success');
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
    const currentWillEnd = trustCenterState.clients.some(client => client.current);
    if (!confirm(trustCenterText('trustRevokeAllConfirm', 'Revoke persistent trust for every BAS browser? Active sessions belonging to those trusted browsers will end; temporary sessions are not affected.'))) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/trust/revoke-all', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'revoked') throw new Error(data.message || 'trust_revoke_all_failed');
        trustCenterState.clients = [];
        if (currentWillEnd) {
            trustCenterState.sessions = [];
            await disconnectPhone();
            return;
        }
        trustCenterSetStatus(trustCenterText('trustRevokeAllDone', 'All persistent trust was revoked.'), 'success');
        await trustCenterRefresh({ silent: true });
    } catch (error) {
        trustCenterSetStatus(trustCenterText('trustRevokeAllError', 'Could not revoke all trusted clients.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterClearAudit() {
    if (!trustCenterAuditSupported() || trustCenterState.loading || !trustCenterState.audit.length) return;
    if (!confirm(trustCenterText('securityAuditClearConfirm', 'Clear the Security & Access Audit? A new entry will record that the audit was cleared.'))) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/audit/clear', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'cleared') throw new Error(data.message || 'security_audit_clear_failed');
        trustCenterSetStatus(trustCenterText('securityAuditCleared', 'Security Audit cleared.'), 'success');
        await trustCenterRefresh({ silent: true });
    } catch (error) {
        trustCenterSetStatus(trustCenterText('securityAuditClearError', 'Could not clear Security Audit.'), 'error');
    } finally {
        trustCenterState.loading = false;
        trustCenterRender();
    }
}

async function trustCenterDownloadAudit() {
    if (!trustCenterAuditSupported() || trustCenterState.loading || !trustCenterState.audit.length) return;
    trustCenterState.loading = true;
    trustCenterRender();
    try {
        const response = await apiFetch('/audit/export');
        if (!response.ok) throw new Error('security_audit_export_failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'boot-animation-studio-security-audit.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
        trustCenterSetStatus(trustCenterText('securityAuditExportError', 'Could not export Security Audit.'), 'error');
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
    set('trust-center-title', 'trustAccessTitle', 'Access & sessions');
    set('trust-center-desc', 'trustAccessDesc', 'See who is connected now and manage which browsers remain trusted for future reconnects.');
    set('trust-center-security-note', 'trustSecurityNote', 'Disconnecting a session does not remove persistent trust. Revoking trust removes the saved browser identity and ends its active sessions.');
    set('trust-center-refresh-label', 'trustRefresh', 'Refresh');
    set('trust-session-title', 'trustActiveSessionsTitle', 'Active sessions');
    set('trust-session-desc', 'trustActiveSessionsDesc', 'Every website connection appears here, including temporary approvals that were never saved as trusted.');
    set('trust-center-disconnect-all-label', 'trustDisconnectAll', 'Disconnect all');
    set('trust-client-title', 'trustTrustedBrowsersTitle', 'Trusted browsers');
    set('trust-client-desc', 'trustTrustedBrowsersDesc', 'Browsers approved with “Always trust” can reconnect securely without another prompt.');
    set('trust-center-revoke-all-label', 'trustRevokeAll', 'Revoke all trust');
    set('security-audit-title', 'securityAuditTitle', 'Security & access audit');
    set('security-audit-desc', 'securityAuditDesc', 'A bounded on-device record of sensitive access and control actions. Tokens, private keys and animation media are never stored here.');
    set('security-audit-download-label', 'securityAuditDownload', 'Export');
    set('security-audit-clear-label', 'securityAuditClear', 'Clear audit');
    trustCenterRender();
}

function trustCenterResetConnection() {
    trustCenterState.clients = [];
    trustCenterState.sessions = [];
    trustCenterState.audit = [];
    trustCenterState.loading = false;
    trustCenterSetStatus('', '');
    trustCenterRender();
}

function trustCenterBind() {
    if (trustCenterState.bound) return;
    trustCenterState.bound = true;
    document.getElementById('trust-center-refresh')?.addEventListener('click', () => trustCenterRefresh());
    document.getElementById('trust-center-revoke-all')?.addEventListener('click', trustCenterRevokeAll);
    document.getElementById('trust-center-disconnect-all')?.addEventListener('click', trustCenterDisconnectAllSessions);
    document.getElementById('security-audit-clear')?.addEventListener('click', trustCenterClearAudit);
    document.getElementById('security-audit-download')?.addEventListener('click', trustCenterDownloadAudit);
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
