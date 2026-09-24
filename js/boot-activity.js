const bootActivityRuntime = {
    loading: false,
    items: [],
    limit: 50
};

function bootActivityText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en || {};
        return table[key] || fallback;
    } catch (_) {
        return fallback;
    }
}

function bootActivitySupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('boot_activity');
}

function bootActivityFormatTime(value) {
    const time = Number(value);
    if (!(time > 0)) return bootActivityText('bootActivityUnknownTime', 'Unknown time');
    try { return new Date(time).toLocaleString(); } catch (_) { return String(time); }
}

function bootActivitySource(source) {
    switch (source) {
        case 'override': return bootActivityText('bootActivitySourceOverride', 'Next boot override');
        case 'queue': return bootActivityText('bootActivitySourceQueue', 'Boot Queue');
        case 'rotation': return bootActivityText('bootActivitySourceRotation', 'Rotation');
        default: return bootActivityText('bootActivitySourceOther', 'Automation');
    }
}

function bootActivityReason(reason) {
    switch (reason) {
        case 'post-boot': return bootActivityText('bootActivityReasonPostBoot', 'Prepared after the previous completed boot');
        case 'use-next-boot': return bootActivityText('bootActivityReasonOverride', 'Explicit next-boot override');
        case 'override-skipped': return bootActivityText('bootActivityReasonNextControl', 'Next boot control change');
        case 'queue-added':
        case 'queue-reordered':
        case 'queue-remove':
        case 'queue-cleared':
        case 'queue-skipped': return bootActivityText('bootActivityReasonQueue', 'Boot Queue change');
        case 'configuration':
        case 'manual':
        case 'resume':
        case 'skip-next':
        case 'rotation-disabled':
        case 'rotation-playlist-deleted': return bootActivityText('bootActivityReasonRotation', 'Rotation change');
        default: return String(reason || bootActivityText('bootActivityReasonUnknown', 'Preparation reason unavailable'));
    }
}

function renderBootActivity() {
    const section = document.getElementById('boot-activity');
    const supported = bootActivitySupported();
    if (section) section.hidden = !supported || moduleWorkspaceUi?.currentTab !== 'activity';
    if (!supported) return;
    const list = document.getElementById('boot-activity-list');
    const count = document.getElementById('boot-activity-count');
    const clear = document.getElementById('boot-activity-clear');
    const refresh = document.getElementById('boot-activity-refresh');
    if (count) count.textContent = `${bootActivityRuntime.items.length} / ${bootActivityRuntime.limit}`;
    if (clear) clear.disabled = bootActivityRuntime.loading || bootActivityRuntime.items.length === 0;
    if (refresh) refresh.disabled = bootActivityRuntime.loading;
    if (!list) return;
    list.replaceChildren();
    if (bootActivityRuntime.loading && !bootActivityRuntime.items.length) {
        const loading = document.createElement('div');
        loading.className = 'boot-activity-empty';
        loading.textContent = bootActivityText('bootActivityLoading', 'Loading boot activity…');
        list.appendChild(loading);
        return;
    }
    if (!bootActivityRuntime.items.length) {
        const empty = document.createElement('div');
        empty.className = 'boot-activity-empty';
        const strong = document.createElement('strong');
        strong.textContent = bootActivityText('bootActivityEmpty', 'No completed automated boots recorded yet');
        const span = document.createElement('span');
        span.textContent = bootActivityText('bootActivityEmptyDesc', 'Boot Activity appears when automation prepares the next boot, observes a completed boot, or records a preparation error.');
        empty.append(strong, span);
        list.appendChild(empty);
        return;
    }
    bootActivityRuntime.items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'boot-activity-card';
        card.dataset.status = item.status === 'error' ? 'error' : item.status === 'prepared' ? 'prepared' : 'completed';
        const head = document.createElement('div');
        head.className = 'boot-activity-card-head';
        const copy = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = item.name || bootActivityText('playlistDefaultItemName', 'Boot animation');
        const source = document.createElement('span');
        source.textContent = item.kind === 'diagnostic'
            ? bootActivityText('bootActivityDiagnostic', 'Automation diagnostic')
            : bootActivitySource(item.source);
        copy.append(name, source);
        const badge = document.createElement('span');
        badge.className = 'boot-activity-status';
        badge.textContent = item.status === 'error'
            ? bootActivityText('bootActivityStatusError', 'Error')
            : item.status === 'prepared'
                ? bootActivityText('bootActivityStatusPrepared', 'Prepared')
                : bootActivityText('bootActivityStatusCompleted', 'Boot completed');
        head.append(copy, badge);
        const facts = document.createElement('div');
        facts.className = 'boot-activity-facts';
        const addFact = (label, value) => {
            const fact = document.createElement('div');
            const small = document.createElement('span');
            small.textContent = label;
            const strong = document.createElement('strong');
            strong.textContent = value;
            fact.append(small, strong);
            facts.appendChild(fact);
        };
        if (item.prepared_at) addFact(bootActivityText('bootActivityPreparedAt', 'Prepared'), bootActivityFormatTime(item.prepared_at));
        if (item.boot_completed_at) addFact(bootActivityText('bootActivityCompletedAt', 'Boot completed'), bootActivityFormatTime(item.boot_completed_at));
        else if (item.created_at) addFact(bootActivityText('bootActivityObservedAt', 'Observed'), bootActivityFormatTime(item.created_at));
        addFact(bootActivityText('bootActivityReason', 'Reason'), bootActivityReason(item.reason));
        card.append(head, facts);
        if (item.message) {
            const message = document.createElement('p');
            message.className = 'boot-activity-message';
            message.textContent = item.message;
            card.appendChild(message);
        }
        list.appendChild(card);
    });
}

function syncBootActivityText() {
    const bindings = {
        'boot-activity-kicker': ['bootActivityKicker', 'BOOT ACTIVITY'],
        'boot-activity-title': ['bootActivityTitle', 'Completed boot activity'],
        'boot-activity-desc': ['bootActivityDesc', 'See which automated animation was prepared and observed across completed boots.'],
        'boot-activity-refresh-label': ['bootActivityRefresh', 'Refresh'],
        'boot-activity-clear-label': ['bootActivityClear', 'Clear activity'],
        'boot-activity-note': ['bootActivityNote', 'Boot Activity is observational. A missing completion record does not prove that a boot animation caused a boot problem.']
    };
    Object.entries(bindings).forEach(([id, pair]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = bootActivityText(pair[0], pair[1]);
    });
    renderBootActivity();
}

async function refreshBootActivity() {
    if (!bootActivitySupported() || bootActivityRuntime.loading) return null;
    bootActivityRuntime.loading = true;
    renderBootActivity();
    try {
        const response = await apiFetch('/activity/list');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || bootActivityText('bootActivityError', 'Could not load Boot Activity.'));
        bootActivityRuntime.items = Array.isArray(data.items) ? data.items : [];
        bootActivityRuntime.limit = Math.max(1, Number(data.limit) || 50);
        return data;
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message || bootActivityText('bootActivityError', 'Could not load Boot Activity.'), 'error', 4500);
        return null;
    } finally {
        bootActivityRuntime.loading = false;
        renderBootActivity();
    }
}

async function clearBootActivity() {
    if (!bootActivitySupported() || bootActivityRuntime.loading || !bootActivityRuntime.items.length) return;
    const confirmed = typeof askConfirmation === 'function'
        ? await askConfirmation(bootActivityText('bootActivityClearConfirm', 'Clear the Boot Activity log?'), true)
        : true;
    if (!confirmed) return;
    bootActivityRuntime.loading = true;
    renderBootActivity();
    try {
        const response = await apiFetch('/activity/clear', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || bootActivityText('bootActivityClearError', 'Could not clear Boot Activity.'));
        bootActivityRuntime.items = [];
        if (typeof showToast === 'function') showToast(bootActivityText('bootActivityCleared', 'Boot Activity cleared.'), 'success', 2600);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message || bootActivityText('bootActivityClearError', 'Could not clear Boot Activity.'), 'error', 4500);
    } finally {
        bootActivityRuntime.loading = false;
        renderBootActivity();
    }
}

function syncBootActivity() {
    const section = document.getElementById('boot-activity');
    if (section && !bootActivitySupported()) section.hidden = true;
    syncBootActivityText();
}

function resetBootActivityConnection() {
    bootActivityRuntime.loading = false;
    bootActivityRuntime.items = [];
    bootActivityRuntime.limit = 50;
    renderBootActivity();
}

function bindBootActivity() {
    document.getElementById('boot-activity-refresh')?.addEventListener('click', refreshBootActivity);
    document.getElementById('boot-activity-clear')?.addEventListener('click', clearBootActivity);
    window.addEventListener('bas:languagechange', syncBootActivityText);
    syncBootActivityText();
}

window.BASBootActivity = Object.freeze({
    supported: bootActivitySupported,
    refresh: refreshBootActivity,
    sync: syncBootActivity,
    resetConnection: resetBootActivityConnection,
    state: () => ({ items: [...bootActivityRuntime.items], limit: bootActivityRuntime.limit })
});
window.addEventListener('DOMContentLoaded', bindBootActivity);
