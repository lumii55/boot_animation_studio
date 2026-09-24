const bootQueueRuntime = {
    busy: false
};

function bootQueueText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en || {};
        return table[key] || fallback;
    } catch (_) {
        return fallback;
    }
}

function bootQueueSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('boot_queue');
}

function bootQueueState() {
    return window.BASRotation?.state?.() || {};
}

async function bootQueueRequest(path, payload = null) {
    const options = { method: 'POST' };
    if (payload !== null) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(payload);
    }
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || bootQueueText('bootQueueError', 'Boot Queue action failed.'));
    if (window.BASRotation?.refresh) await window.BASRotation.refresh();
    syncBootQueueUi();
    return data;
}

function bootQueueSourceLabel(source) {
    switch (source) {
        case 'override': return bootQueueText('bootQueueSourceOverride', 'Next boot override');
        case 'queue': return bootQueueText('bootQueueSourceQueue', 'Boot Queue');
        case 'rotation': return bootQueueText('bootQueueSourceRotation', 'Rotation');
        default: return bootQueueText('bootQueueSourceManual', 'Current animation');
    }
}

function syncBootQueueText() {
    const bindings = {
        'boot-queue-kicker': ['bootQueueKicker', 'NEXT BOOT CONTROLS'],
        'boot-queue-title': ['bootQueueTitle', 'Boot Queue'],
        'boot-queue-desc': ['bootQueueDesc', 'Choose one-shot or ordered animations before returning to rotation.'],
        'boot-queue-next-label': ['bootQueueNext', 'Next boot'],
        'boot-queue-skip-label': ['bootQueueSkip', 'Skip next'],
        'boot-queue-clear-label': ['bootQueueClear', 'Clear queue'],
        'boot-queue-priority': ['bootQueuePriority', 'Priority: one-shot override → Boot Queue → Rotation.']
    };
    Object.entries(bindings).forEach(([id, pair]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = bootQueueText(pair[0], pair[1]);
    });
    syncBootQueueUi();
}

function renderBootQueueList(state) {
    const list = document.getElementById('boot-queue-list');
    if (!list) return;
    list.replaceChildren();
    const queue = Array.isArray(state.queue) ? state.queue : [];
    if (!queue.length) {
        const empty = document.createElement('div');
        empty.className = 'boot-queue-empty';
        const strong = document.createElement('strong');
        strong.textContent = bootQueueText('bootQueueEmpty', 'No queued boots');
        const span = document.createElement('span');
        span.textContent = bootQueueText('bootQueueEmptyDesc', 'Add animations from Playlists, History, or the Test Lab.');
        empty.append(strong, span);
        list.appendChild(empty);
        return;
    }
    queue.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'boot-queue-row';
        if (state.next_source === 'queue' && state.next_entry_id === item.id) row.classList.add('is-next');
        const position = document.createElement('span');
        position.className = 'boot-queue-position';
        position.textContent = String(index + 1);
        const copy = document.createElement('div');
        copy.className = 'boot-queue-copy';
        const name = document.createElement('strong');
        name.textContent = item.name || bootQueueText('playlistDefaultItemName', 'Boot animation');
        const origin = document.createElement('span');
        origin.textContent = state.next_source === 'queue' && state.next_entry_id === item.id
            ? bootQueueText('bootQueueSourceQueue', 'Boot Queue') + ' · ' + bootQueueText('bootQueueNext', 'Next boot')
            : bootQueueText('bootQueueSourceQueue', 'Boot Queue');
        copy.append(name, origin);
        const actions = document.createElement('div');
        actions.className = 'boot-queue-row-actions';
        const up = document.createElement('button');
        up.type = 'button'; up.textContent = '↑'; up.disabled = index === 0 || bootQueueRuntime.busy;
        up.setAttribute('aria-label', bootQueueText('bootQueueMoveUp', 'Move up'));
        up.onclick = () => reorderBootQueue(index, -1);
        const down = document.createElement('button');
        down.type = 'button'; down.textContent = '↓'; down.disabled = index === queue.length - 1 || bootQueueRuntime.busy;
        down.setAttribute('aria-label', bootQueueText('bootQueueMoveDown', 'Move down'));
        down.onclick = () => reorderBootQueue(index, 1);
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'is-danger'; remove.textContent = '×'; remove.disabled = bootQueueRuntime.busy;
        remove.setAttribute('aria-label', bootQueueText('bootQueueRemove', 'Remove'));
        remove.onclick = () => removeBootQueueItem(item.id);
        actions.append(up, down, remove);
        row.append(position, copy, actions);
        list.appendChild(row);
    });
}

function syncBootQueueUi() {
    const panel = document.getElementById('boot-queue');
    const supported = bootQueueSupported();
    if (panel) panel.hidden = !supported;
    const stagedButtons = ['module-test-use-next', 'module-test-add-queue', 'build-test-result-use-next', 'build-test-result-queue'];
    if (!supported) {
        stagedButtons.forEach(id => { const element = document.getElementById(id); if (element) element.hidden = true; });
        return;
    }
    const state = bootQueueState();
    const next = document.getElementById('boot-queue-next');
    const source = document.getElementById('boot-queue-next-source');
    const badge = document.getElementById('boot-queue-status');
    const clear = document.getElementById('boot-queue-clear');
    const skip = document.getElementById('boot-queue-skip');
    const pause = document.getElementById('boot-queue-pause');
    const after = document.getElementById('boot-queue-after');
    const queue = Array.isArray(state.queue) ? state.queue : [];
    if (next) next.textContent = state.next_name || bootQueueText('rotationNothingPrepared', 'Nothing prepared');
    if (source) source.textContent = bootQueueSourceLabel(state.next_source);
    if (badge) badge.textContent = bootQueueText('bootQueueQueueCount', '{count} queued').replace('{count}', queue.length);
    if (clear) clear.disabled = bootQueueRuntime.busy || queue.length === 0;
    if (skip) skip.disabled = bootQueueRuntime.busy || !state.next_source;
    if (pause) {
        pause.hidden = !state.enabled;
        pause.disabled = bootQueueRuntime.busy;
        pause.textContent = state.paused ? bootQueueText('bootQueueResume', 'Resume rotation') : bootQueueText('bootQueuePause', 'Pause rotation');
    }
    if (after) {
        after.textContent = state.enabled
            ? (state.paused ? bootQueueText('bootQueueAfterQueuePaused', 'After queue: rotation remains paused') : bootQueueText('bootQueueAfterQueueRotation', 'After queue: rotation resumes'))
            : bootQueueText('bootQueueAfterQueueNone', 'After queue: keep current animation');
    }
    renderBootQueueList(state);
    const staged = !!window.BASModuleTest?.state?.().staged;
    ['module-test-use-next', 'module-test-add-queue'].forEach(id => { const element = document.getElementById(id); if (element) element.hidden = !staged; });
    const buildSource = !!window.BASModuleTest?.state?.().buildSource;
    ['build-test-result-use-next', 'build-test-result-queue'].forEach(id => { const element = document.getElementById(id); if (element) element.hidden = !(staged && buildSource); });
    syncBootQueueTextLabelsOnly();
}

function syncBootQueueTextLabelsOnly() {
    const map = {
        'module-test-use-next-label': ['bootQueueUseNext', 'Use next boot'],
        'module-test-add-queue-label': ['bootQueueAdd', 'Add to queue'],
        'build-test-result-use-next-label': ['bootQueueUseNext', 'Use next boot'],
        'build-test-result-queue-label': ['bootQueueAdd', 'Add to queue']
    };
    Object.entries(map).forEach(([id, pair]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = bootQueueText(pair[0], pair[1]);
    });
}

async function addBootQueueSource(source, details, useNext = false) {
    if (!bootQueueSupported()) return null;
    bootQueueRuntime.busy = true; syncBootQueueUi();
    try {
        const data = await bootQueueRequest(useNext ? '/queue/use-next' : '/queue/add', { source, ...details });
        if (typeof showToast === 'function') showToast(bootQueueText(useNext ? 'bootQueueOverrideSet' : 'bootQueueAdded', useNext ? 'Next boot override prepared.' : 'Added to Boot Queue.'), 'success', 3000);
        return data;
    } finally {
        bootQueueRuntime.busy = false; syncBootQueueUi();
    }
}

function addPlaylistItemToQueue(item, useNext = false) {
    return addBootQueueSource('playlist', { object_id: item.object_id, name: item.name || bootQueueText('playlistDefaultItemName', 'Boot animation') }, useNext);
}

function addHistoryItemToQueue(id, name = '', useNext = false) {
    return addBootQueueSource('history', { history_id: String(id), name: name || bootQueueText('historyPlaylistName', 'History') }, useNext);
}

function addStagedToQueue(useNext = false) {
    if (!window.BASModuleTest?.state?.().staged) return Promise.resolve(null);
    const name = window.BASModuleTest.state().browserFilename || bootQueueText('playlistStagedName', 'Tested animation');
    return addBootQueueSource('staged', { name }, useNext);
}

async function reorderBootQueue(index, delta) {
    const state = bootQueueState();
    const queue = Array.isArray(state.queue) ? state.queue : [];
    const next = index + delta;
    if (next < 0 || next >= queue.length) return;
    const ids = queue.map(item => item.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    bootQueueRuntime.busy = true; syncBootQueueUi();
    try { await bootQueueRequest('/queue/reorder', { ids }); }
    finally { bootQueueRuntime.busy = false; syncBootQueueUi(); }
}

async function removeBootQueueItem(id) {
    bootQueueRuntime.busy = true; syncBootQueueUi();
    try { await bootQueueRequest('/queue/remove', { id }); }
    finally { bootQueueRuntime.busy = false; syncBootQueueUi(); }
}

async function clearBootQueue() {
    const state = bootQueueState();
    if (!Array.isArray(state.queue) || !state.queue.length) return;
    const confirmed = typeof askConfirmation === 'function' ? await askConfirmation(bootQueueText('bootQueueClearConfirm', 'Clear every queued boot?'), true) : true;
    if (!confirmed) return;
    bootQueueRuntime.busy = true; syncBootQueueUi();
    try {
        await bootQueueRequest('/queue/clear');
        if (typeof showToast === 'function') showToast(bootQueueText('bootQueueCleared', 'Boot Queue cleared.'), 'info', 2600);
    } finally { bootQueueRuntime.busy = false; syncBootQueueUi(); }
}

async function skipBootQueueNext() {
    bootQueueRuntime.busy = true; syncBootQueueUi();
    try {
        await bootQueueRequest('/queue/skip-next');
        if (typeof showToast === 'function') showToast(bootQueueText('bootQueueSkipped', 'Next boot skipped.'), 'info', 2600);
    } finally { bootQueueRuntime.busy = false; syncBootQueueUi(); }
}

async function toggleRotationPause() {
    const state = bootQueueState();
    if (!state.enabled) return;
    bootQueueRuntime.busy = true; syncBootQueueUi();
    try {
        await bootQueueRequest('/rotation/pause', { paused: !state.paused });
        if (typeof showToast === 'function') showToast(bootQueueText(state.paused ? 'bootQueueResumedToast' : 'bootQueuePausedToast', state.paused ? 'Rotation resumed.' : 'Rotation paused.'), 'success', 2600);
    } finally { bootQueueRuntime.busy = false; syncBootQueueUi(); }
}

function bindBootQueueUi() {
    document.getElementById('boot-queue-skip')?.addEventListener('click', () => skipBootQueueNext().catch(error => showToast(error.message, 'error', 4600)));
    document.getElementById('boot-queue-clear')?.addEventListener('click', () => clearBootQueue().catch(error => showToast(error.message, 'error', 4600)));
    document.getElementById('boot-queue-pause')?.addEventListener('click', () => toggleRotationPause().catch(error => showToast(error.message, 'error', 4600)));
    document.getElementById('module-test-use-next')?.addEventListener('click', () => addStagedToQueue(true).catch(error => showToast(error.message, 'error', 4600)));
    document.getElementById('module-test-add-queue')?.addEventListener('click', () => addStagedToQueue(false).catch(error => showToast(error.message, 'error', 4600)));
    document.getElementById('build-test-result-use-next')?.addEventListener('click', () => addStagedToQueue(true).catch(error => showToast(error.message, 'error', 4600)));
    document.getElementById('build-test-result-queue')?.addEventListener('click', () => addStagedToQueue(false).catch(error => showToast(error.message, 'error', 4600)));
    window.addEventListener('bas:languagechange', syncBootQueueText);
    syncBootQueueText();
}

window.BASBootQueue = Object.freeze({
    supported: bootQueueSupported,
    sync: syncBootQueueUi,
    addPlaylist: (item) => addPlaylistItemToQueue(item, false),
    useNextPlaylist: (item) => addPlaylistItemToQueue(item, true),
    addHistory: (id, name) => addHistoryItemToQueue(id, name, false),
    useNextHistory: (id, name) => addHistoryItemToQueue(id, name, true),
    addStaged: () => addStagedToQueue(false),
    useNextStaged: () => addStagedToQueue(true),
    state: bootQueueState
});
window.addEventListener('DOMContentLoaded', bindBootQueueUi);
