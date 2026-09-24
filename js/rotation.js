const rotationRuntime = {
    status: null,
    loaded: false,
    busy: false
};

function rotationText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table?.[key] || fallback;
    } catch (_) {
        return fallback;
    }
}

function rotationSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('boot_rotation') && hasModuleFeature('playlists');
}

async function rotationRequest(path, options = {}) {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || rotationText('rotationError', 'Rotation action failed.'));
    return data;
}

function rotationJson(path, payload) {
    return rotationRequest(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

function rotationPlaylists() {
    const state = window.BASPlaylist?.state?.();
    return Array.isArray(state?.playlists) ? state.playlists : [];
}

function syncRotationText() {
    const bindings = {
        'rotation-kicker': ['rotationKicker', 'BOOT ROTATION'],
        'rotation-title': ['rotationTitle', 'Boot rotation'],
        'rotation-desc': ['rotationDesc', 'Prepare a playlist animation for the next boot after each completed boot.'],
        'rotation-enabled-label': ['rotationEnabled', 'Enable rotation'],
        'rotation-playlist-label': ['rotationPlaylist', 'Playlist'],
        'rotation-mode-label': ['rotationMode', 'Mode'],
        'rotation-mode-sequential': ['rotationModeSequential', 'Sequential'],
        'rotation-mode-random': ['rotationModeRandom', 'Random'],
        'rotation-mode-shuffle': ['rotationModeShuffle', 'Shuffle'],
        'rotation-next-label': ['rotationNextBoot', 'Next boot'],
        'rotation-last-label': ['rotationLastBoot', 'Previous boot'],
        'rotation-note': ['rotationDisableNote', 'Disabling rotation stops future changes; the animation already installed on the module is left unchanged.'],
        'rotation-save-label': ['rotationSave', 'Save rotation'],
        'rotation-prepare-next-label': ['rotationPrepareNext', 'Choose another next animation']
    };
    Object.entries(bindings).forEach(([id, pair]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = rotationText(pair[0], pair[1]);
    });
    renderRotationState();
}

function syncRotationPlaylists() {
    const select = document.getElementById('rotation-playlist');
    if (!select) return;
    const playlists = rotationPlaylists();
    const desired = select.value || rotationRuntime.status?.playlist_id || '';
    select.replaceChildren();
    if (!playlists.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = rotationText('rotationNeedPlaylist', 'Create a playlist with at least one animation first.');
        select.appendChild(option);
        select.value = '';
        return;
    }
    playlists.forEach(playlist => {
        const option = document.createElement('option');
        option.value = playlist.id;
        option.textContent = playlist.name;
        option.disabled = !(playlist.items?.length > 0);
        select.appendChild(option);
    });
    if (playlists.some(item => item.id === desired && item.items?.length > 0)) {
        select.value = desired;
    } else {
        const first = playlists.find(item => item.items?.length > 0);
        select.value = first?.id || '';
    }
}

function renderRotationState() {
    const wrapper = document.getElementById('playlist-rotation');
    const enabled = document.getElementById('rotation-enabled');
    const playlist = document.getElementById('rotation-playlist');
    const mode = document.getElementById('rotation-mode');
    const save = document.getElementById('rotation-save');
    const prepare = document.getElementById('rotation-prepare-next');
    const statusBadge = document.getElementById('rotation-status');
    const next = document.getElementById('rotation-next');
    const last = document.getElementById('rotation-last');
    const note = document.getElementById('rotation-note');
    const supported = rotationSupported();
    if (wrapper) wrapper.hidden = !supported;
    if (!supported) return;

    const data = rotationRuntime.status || {};
    const playlists = rotationPlaylists();
    const hasUsablePlaylist = playlists.some(item => item.items?.length > 0);
    if (enabled) enabled.disabled = rotationRuntime.busy || !hasUsablePlaylist;
    if (playlist) playlist.disabled = rotationRuntime.busy || !hasUsablePlaylist;
    if (mode) mode.disabled = rotationRuntime.busy || !hasUsablePlaylist;
    if (save) save.disabled = rotationRuntime.busy || !hasUsablePlaylist;
    if (prepare) prepare.disabled = rotationRuntime.busy || !data.enabled || data.paused || !data.playlist_id || (!!data.next_source && data.next_source !== 'rotation');
    if (statusBadge) {
        statusBadge.dataset.state = data.enabled ? 'on' : 'off';
        statusBadge.textContent = data.enabled ? (data.paused ? rotationText('bootQueuePaused', 'Rotation paused') : rotationText('rotationStatusOn', 'Rotation active')) : rotationText('rotationStatusOff', 'Rotation off');
    }
    if (next) next.textContent = data.enabled && data.next_name ? data.next_name : rotationText('rotationNothingPrepared', 'Nothing prepared');
    if (last) last.textContent = data.last_boot_name || rotationText('rotationUnknown', 'Not tracked yet');
    if (note) {
        note.textContent = data.enabled && data.last_error ? data.last_error : rotationText('rotationDisableNote', 'Disabling rotation stops future changes; the animation already installed on the module is left unchanged.');
        note.dataset.state = data.enabled && data.last_error ? 'error' : 'normal';
    }
    if (window.BASBootQueue?.sync) window.BASBootQueue.sync();
}

function applyRotationStatusToControls() {
    const data = rotationRuntime.status || {};
    const enabled = document.getElementById('rotation-enabled');
    const playlist = document.getElementById('rotation-playlist');
    const mode = document.getElementById('rotation-mode');
    const playlists = rotationPlaylists();
    if (enabled) enabled.checked = !!data.enabled;
    if (playlist && data.playlist_id && playlists.some(item => item.id === data.playlist_id)) playlist.value = data.playlist_id;
    if (mode && ['sequential', 'random', 'shuffle'].includes(data.mode)) mode.value = data.mode;
}

function syncRotationVisibility() {
    const wrapper = document.getElementById('playlist-rotation');
    if (wrapper) wrapper.hidden = !rotationSupported();
    syncRotationPlaylists();
    renderRotationState();
}

async function refreshRotation() {
    if (!rotationSupported()) {
        rotationRuntime.status = null;
        rotationRuntime.loaded = false;
        syncRotationVisibility();
        return null;
    }
    try {
        const data = await rotationRequest('/rotation/status');
        rotationRuntime.status = data;
        rotationRuntime.loaded = true;
        syncRotationPlaylists();
        applyRotationStatusToControls();
        renderRotationState();
        return data;
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4400);
        return null;
    }
}

async function saveRotation() {
    if (!rotationSupported() || rotationRuntime.busy) return;
    const enabled = !!document.getElementById('rotation-enabled')?.checked;
    const playlistId = document.getElementById('rotation-playlist')?.value || '';
    const mode = document.getElementById('rotation-mode')?.value || 'sequential';
    if (enabled && !playlistId) {
        if (typeof showToast === 'function') showToast(rotationText('rotationNeedPlaylist', 'Create a playlist with at least one animation first.'), 'error', 4200);
        return;
    }
    rotationRuntime.busy = true;
    renderRotationState();
    try {
        const data = await rotationJson('/rotation/configure', { enabled, playlist_id: playlistId, mode });
        rotationRuntime.status = data;
        rotationRuntime.loaded = true;
        syncRotationPlaylists();
        applyRotationStatusToControls();
        renderRotationState();
        if (typeof showToast === 'function') showToast(rotationText('rotationSaved', 'Boot rotation updated.'), 'success', 3000);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4800);
    } finally {
        rotationRuntime.busy = false;
        renderRotationState();
    }
}

async function prepareRotationNext() {
    if (!rotationSupported() || rotationRuntime.busy || !rotationRuntime.status?.enabled) return;
    rotationRuntime.busy = true;
    renderRotationState();
    try {
        const data = await rotationRequest('/rotation/prepare-next', { method: 'POST' });
        rotationRuntime.status = data;
        rotationRuntime.loaded = true;
        renderRotationState();
        if (typeof showToast === 'function') showToast(rotationText('rotationPrepared', 'Next boot animation prepared.'), 'success', 3000);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4800);
    } finally {
        rotationRuntime.busy = false;
        renderRotationState();
    }
}

function resetRotationConnection() {
    rotationRuntime.status = null;
    rotationRuntime.loaded = false;
    rotationRuntime.busy = false;
    syncRotationVisibility();
}

function bindRotationUi() {
    document.getElementById('rotation-save')?.addEventListener('click', saveRotation);
    document.getElementById('rotation-prepare-next')?.addEventListener('click', prepareRotationNext);
    document.getElementById('rotation-enabled')?.addEventListener('change', renderRotationState);
    document.getElementById('rotation-playlist')?.addEventListener('change', renderRotationState);
    document.getElementById('rotation-mode')?.addEventListener('change', renderRotationState);
    window.addEventListener('bas:languagechange', syncRotationText);
    syncRotationText();
    syncRotationVisibility();
}

window.BASRotation = Object.freeze({
    supported: rotationSupported,
    refresh: refreshRotation,
    resetConnection: resetRotationConnection,
    sync: syncRotationVisibility,
    syncPlaylists: syncRotationPlaylists,
    syncText: syncRotationText,
    state: () => ({ ...(rotationRuntime.status || {}), loaded: rotationRuntime.loaded })
});
window.addEventListener('DOMContentLoaded', bindRotationUi);
