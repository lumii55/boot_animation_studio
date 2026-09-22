const playlistRuntime = {
    playlists: [],
    selectedId: '',
    busy: false,
    loaded: false,
    pickerResolver: null,
    nameResolver: null,
    objectUrls: new Set()
};

function playlistText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table?.[key] || fallback;
    } catch (_) {
        return fallback;
    }
}

function playlistSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('playlists');
}

function playlistTestSupported() {
    return playlistSupported() && typeof hasModuleFeature === 'function' && hasModuleFeature('playlist_test') && hasModuleFeature('test_staging');
}

function playlistFormatBytes(bytes) {
    if (typeof historyFormatBytes === 'function') return historyFormatBytes(bytes);
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function playlistRequest(path, options = {}) {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || playlistText('playlistError', 'Playlist action failed.'));
    return data;
}

function playlistJson(path, payload) {
    return playlistRequest(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

function selectedPlaylist() {
    return playlistRuntime.playlists.find(item => item.id === playlistRuntime.selectedId) || null;
}

function revokePlaylistUrls() {
    playlistRuntime.objectUrls.forEach(url => URL.revokeObjectURL(url));
    playlistRuntime.objectUrls.clear();
}

function playlistPreviewElement(item) {
    const wrap = document.createElement('div');
    wrap.className = 'playlist-item-preview';
    const placeholder = document.createElement('span');
    placeholder.textContent = playlistText('playlistPreviewLoading', 'Preparing preview…');
    wrap.appendChild(placeholder);
    (async () => {
        try {
            const response = await apiFetch('/playlist/preview?object=' + encodeURIComponent(item.object_id));
            if (!response.ok) throw new Error('preview');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            playlistRuntime.objectUrls.add(url);
            if (!wrap.isConnected) {
                URL.revokeObjectURL(url);
                playlistRuntime.objectUrls.delete(url);
                return;
            }
            const image = document.createElement('img');
            image.src = url;
            image.alt = playlistText('playlistPreviewAlt', 'Boot animation preview');
            image.dataset.objectUrl = url;
            wrap.replaceChildren(image);
        } catch (_) {
            if (wrap.isConnected) placeholder.textContent = playlistText('playlistPreviewUnavailable', 'Preview unavailable');
        }
    })();
    return wrap;
}

function playlistMetaText(item) {
    const parts = [];
    if (Number(item.width) > 0 && Number(item.height) > 0) parts.push(`${item.width}×${item.height}`);
    if (Number(item.fps) > 0) parts.push(`${item.fps} FPS`);
    if (item.frame_format) parts.push(String(item.frame_format));
    if (Number(item.size_bytes) > 0) parts.push(playlistFormatBytes(item.size_bytes));
    return parts.join(' · ');
}

function playlistFacts(item) {
    const facts = [];
    if (Number(item.frame_count) > 0) facts.push(playlistText('playlistFrames', '{count} frames').replace('{count}', item.frame_count));
    if (Number(item.parts) > 0) facts.push(playlistText('playlistParts', '{count} parts').replace('{count}', item.parts));
    if (item.has_audio) facts.push(playlistText('playlistAudio', 'Audio'));
    return facts;
}

function syncPlaylistCount() {
    const count = document.getElementById('module-workspace-playlist-count');
    if (count) count.textContent = String(playlistRuntime.playlists.length);
}

function syncPlaylistText() {
    const bindings = {
        'playlist-kicker': ['playlistKicker', 'PLAYLISTS'],
        'playlist-title': ['playlistTitle', 'Your boot animation library'],
        'playlist-desc': ['playlistDesc', 'Keep animations you want to reuse. Playlists are independent from History retention.'],
        'playlist-create-label': ['playlistCreate', 'New playlist'],
        'playlist-empty-title': ['playlistEmptyTitle', 'No playlists yet'],
        'playlist-empty-desc': ['playlistEmptyDesc', 'Create a playlist to keep animations without depending on History.'],
        'playlist-items-empty-title': ['playlistItemsEmptyTitle', 'This playlist is empty'],
        'playlist-items-empty-desc': ['playlistItemsEmptyDesc', 'Add a ZIP, a History item or a staged test animation.'],
        'playlist-upload-label': ['playlistAddZip', 'Add bootanimation.zip'],
        'playlist-rename-label': ['playlistRename', 'Rename'],
        'playlist-duplicate-label': ['playlistDuplicate', 'Duplicate'],
        'playlist-delete-label': ['playlistDelete', 'Delete'],
        'playlist-name-title': ['playlistNameTitle', 'Playlist name'],
        'playlist-name-save': ['playlistNameSave', 'Save'],
        'playlist-name-cancel': ['playlistCancel', 'Cancel'],
        'playlist-picker-title': ['playlistPickerTitle', 'Choose a playlist'],
        'playlist-picker-desc': ['playlistPickerDesc', 'Choose where this animation should be kept.'],
        'playlist-picker-cancel': ['playlistCancel', 'Cancel']
    };
    Object.entries(bindings).forEach(([id, pair]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = playlistText(pair[0], pair[1]);
    });
    const input = document.getElementById('playlist-name-input');
    if (input) input.placeholder = playlistText('playlistNamePlaceholder', 'Example: Favorites');
}

function syncPlaylistVisibility() {
    const wrapper = document.getElementById('module-playlists');
    const tab = document.getElementById('module-workspace-tab-playlists');
    const supported = playlistSupported();
    if (tab) {
        tab.hidden = !supported;
        tab.style.display = supported ? '' : 'none';
    }
    if (wrapper && !supported) wrapper.hidden = true;
    syncPlaylistCount();
    if (typeof syncModuleWorkspaceUi === 'function') syncModuleWorkspaceUi();
}

function renderPlaylistSidebar() {
    const list = document.getElementById('playlist-list');
    if (!list) return;
    list.innerHTML = '';
    if (!playlistRuntime.playlists.length) {
        const empty = document.createElement('div');
        empty.className = 'playlist-empty';
        const strong = document.createElement('strong');
        strong.textContent = playlistText('playlistEmptyTitle', 'No playlists yet');
        const span = document.createElement('span');
        span.textContent = playlistText('playlistEmptyDesc', 'Create a playlist to keep animations without depending on History.');
        empty.append(strong, span);
        list.appendChild(empty);
        return;
    }
    playlistRuntime.playlists.forEach((playlist, index) => {
        const row = document.createElement('div');
        row.className = 'playlist-list-row' + (playlist.id === playlistRuntime.selectedId ? ' is-active' : '');
        const select = document.createElement('button');
        select.className = 'playlist-list-select';
        select.type = 'button';
        const name = document.createElement('strong');
        name.textContent = playlist.name;
        const count = document.createElement('span');
        count.textContent = playlistText('playlistItemCount', '{count} items').replace('{count}', playlist.items?.length || 0);
        select.append(name, count);
        select.onclick = () => {
            playlistRuntime.selectedId = playlist.id;
            renderPlaylists();
        };
        const reorder = document.createElement('div');
        reorder.className = 'playlist-list-reorder';
        const up = document.createElement('button');
        up.type = 'button';
        up.textContent = '↑';
        up.disabled = index === 0 || playlistRuntime.busy;
        up.setAttribute('aria-label', playlistText('playlistMoveUp', 'Move playlist up'));
        up.onclick = () => movePlaylist(index, -1);
        const down = document.createElement('button');
        down.type = 'button';
        down.textContent = '↓';
        down.disabled = index === playlistRuntime.playlists.length - 1 || playlistRuntime.busy;
        down.setAttribute('aria-label', playlistText('playlistMoveDown', 'Move playlist down'));
        down.onclick = () => movePlaylist(index, 1);
        reorder.append(up, down);
        row.append(select, reorder);
        list.appendChild(row);
    });
}

async function renderPlaylistItems() {
    const playlist = selectedPlaylist();
    const header = document.getElementById('playlist-selected-header');
    const title = document.getElementById('playlist-selected-name');
    const count = document.getElementById('playlist-selected-count');
    const items = document.getElementById('playlist-items');
    const addBar = document.getElementById('playlist-add-bar');
    if (!header || !items) return;
    revokePlaylistUrls();
    items.innerHTML = '';
    header.hidden = !playlist;
    if (addBar) addBar.hidden = !playlist;
    if (!playlist) {
        const empty = document.createElement('div');
        empty.className = 'playlist-empty playlist-main-empty';
        const strong = document.createElement('strong');
        strong.textContent = playlistText('playlistEmptyTitle', 'No playlists yet');
        const span = document.createElement('span');
        span.textContent = playlistText('playlistEmptyDesc', 'Create a playlist to keep animations without depending on History.');
        empty.append(strong, span);
        items.appendChild(empty);
        return;
    }
    if (title) title.textContent = playlist.name;
    if (count) count.textContent = playlistText('playlistItemCount', '{count} items').replace('{count}', playlist.items?.length || 0);
    if (!playlist.items?.length) {
        const empty = document.createElement('div');
        empty.className = 'playlist-empty playlist-main-empty';
        const strong = document.createElement('strong');
        strong.textContent = playlistText('playlistItemsEmptyTitle', 'This playlist is empty');
        const span = document.createElement('span');
        span.textContent = playlistText('playlistItemsEmptyDesc', 'Add a ZIP, a History item or a staged test animation.');
        empty.append(strong, span);
        items.appendChild(empty);
        return;
    }
    for (let index = 0; index < playlist.items.length; index++) {
        const item = playlist.items[index];
        const card = document.createElement('article');
        card.className = 'playlist-item-card';
        const preview = playlistPreviewElement(item);
        const body = document.createElement('div');
        body.className = 'playlist-item-body';
        const heading = document.createElement('div');
        heading.className = 'playlist-item-heading';
        const itemName = document.createElement('strong');
        itemName.textContent = item.name || playlistText('playlistDefaultItemName', 'Boot animation');
        const controls = document.createElement('div');
        controls.className = 'playlist-item-order';
        const up = document.createElement('button');
        up.type = 'button'; up.textContent = '↑'; up.disabled = index === 0 || playlistRuntime.busy;
        up.setAttribute('aria-label', playlistText('playlistMoveItemUp', 'Move animation up'));
        up.onclick = () => movePlaylistItem(index, -1);
        const down = document.createElement('button');
        down.type = 'button'; down.textContent = '↓'; down.disabled = index === playlist.items.length - 1 || playlistRuntime.busy;
        down.setAttribute('aria-label', playlistText('playlistMoveItemDown', 'Move animation down'));
        down.onclick = () => movePlaylistItem(index, 1);
        controls.append(up, down);
        heading.append(itemName, controls);
        const meta = document.createElement('span');
        meta.className = 'playlist-item-meta';
        meta.textContent = playlistMetaText(item) || '—';
        const facts = document.createElement('div');
        facts.className = 'playlist-item-facts';
        playlistFacts(item).forEach(text => {
            const fact = document.createElement('span'); fact.textContent = text; facts.appendChild(fact);
        });
        const actions = document.createElement('div');
        actions.className = 'playlist-item-actions';
        if (playlistTestSupported()) {
            const test = document.createElement('button');
            test.type = 'button'; test.textContent = playlistText('playlistTest', 'Test');
            test.onclick = () => testPlaylistItem(item);
            actions.appendChild(test);
        }
        const apply = document.createElement('button');
        apply.type = 'button'; apply.className = 'is-primary'; apply.textContent = playlistText('playlistApply', 'Apply');
        apply.onclick = () => applyPlaylistItem(item);
        const open = document.createElement('button');
        open.type = 'button'; open.textContent = playlistText('playlistOpenStudio', 'Open in Studio');
        open.onclick = () => openPlaylistItem(item);
        const download = document.createElement('button');
        download.type = 'button'; download.textContent = playlistText('playlistDownload', 'Download');
        download.onclick = () => downloadPlaylistItem(item);
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'is-danger'; remove.textContent = playlistText('playlistRemoveItem', 'Remove');
        remove.onclick = () => removePlaylistItem(item);
        actions.append(apply, open, download, remove);
        body.append(heading, meta);
        if (facts.childNodes.length) body.appendChild(facts);
        body.appendChild(actions);
        card.append(preview, body);
        items.appendChild(card);
    }
}

function renderPlaylists() {
    if (playlistRuntime.selectedId && !playlistRuntime.playlists.some(item => item.id === playlistRuntime.selectedId)) playlistRuntime.selectedId = '';
    if (!playlistRuntime.selectedId && playlistRuntime.playlists.length) playlistRuntime.selectedId = playlistRuntime.playlists[0].id;
    renderPlaylistSidebar();
    renderPlaylistItems();
    syncPlaylistCount();
    syncPlaylistText();
}

async function refreshPlaylists() {
    if (!playlistSupported()) {
        playlistRuntime.playlists = [];
        playlistRuntime.selectedId = '';
        playlistRuntime.loaded = false;
        syncPlaylistVisibility();
        return [];
    }
    try {
        const data = await playlistRequest('/playlist/list');
        playlistRuntime.playlists = Array.isArray(data.playlists) ? data.playlists : [];
        playlistRuntime.loaded = true;
        renderPlaylists();
        return playlistRuntime.playlists;
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4400);
        return [];
    }
}

function closePlaylistNameDialog(value = null) {
    const modal = document.getElementById('modal-playlist-name');
    if (modal) modal.style.display = 'none';
    const resolver = playlistRuntime.nameResolver;
    playlistRuntime.nameResolver = null;
    if (resolver) resolver(value);
}

function askPlaylistName(initial = '', mode = 'create') {
    return new Promise(resolve => {
        const modal = document.getElementById('modal-playlist-name');
        const input = document.getElementById('playlist-name-input');
        const title = document.getElementById('playlist-name-title');
        if (!modal || !input || !title) return resolve(null);
        playlistRuntime.nameResolver = resolve;
        title.textContent = mode === 'rename' ? playlistText('playlistRenameTitle', 'Rename playlist') : mode === 'duplicate' ? playlistText('playlistDuplicateTitle', 'Duplicate playlist') : playlistText('playlistCreateTitle', 'Create playlist');
        input.value = initial;
        modal.style.display = 'flex';
        requestAnimationFrame(() => { input.focus(); input.select(); });
    });
}

async function createPlaylist(prefill = '') {
    const name = await askPlaylistName(prefill, 'create');
    if (name === null) return null;
    const result = await playlistJson('/playlist/create', { name });
    playlistRuntime.selectedId = result.id || '';
    await refreshPlaylists();
    if (typeof showToast === 'function') showToast(playlistText('playlistCreated', 'Playlist created.'), 'success', 2600);
    return result.id || null;
}

async function renamePlaylist() {
    const playlist = selectedPlaylist(); if (!playlist) return;
    const name = await askPlaylistName(playlist.name, 'rename'); if (name === null) return;
    await playlistJson('/playlist/rename', { id: playlist.id, name });
    await refreshPlaylists();
}

async function duplicatePlaylist() {
    const playlist = selectedPlaylist(); if (!playlist) return;
    const name = await askPlaylistName(`${playlist.name} ${playlistText('playlistCopySuffix', 'copy')}`, 'duplicate'); if (name === null) return;
    const result = await playlistJson('/playlist/duplicate', { id: playlist.id, name });
    playlistRuntime.selectedId = result.id || playlistRuntime.selectedId;
    await refreshPlaylists();
}

async function deletePlaylist() {
    const playlist = selectedPlaylist(); if (!playlist) return;
    const confirmed = typeof askConfirmation === 'function' ? await askConfirmation(playlistText('playlistDeleteConfirm', 'Delete this playlist? Animations used only by it will also be removed from Playlist storage.'), true) : confirm(playlistText('playlistDeleteConfirm', 'Delete this playlist?'));
    if (!confirmed) return;
    await playlistJson('/playlist/delete', { id: playlist.id });
    playlistRuntime.selectedId = '';
    await refreshPlaylists();
}

async function movePlaylist(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= playlistRuntime.playlists.length) return;
    const ordered = playlistRuntime.playlists.map(item => item.id);
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    await playlistJson('/playlist/reorder', { ids: ordered });
    await refreshPlaylists();
}

async function movePlaylistItem(index, delta) {
    const playlist = selectedPlaylist(); if (!playlist) return;
    const next = index + delta;
    if (next < 0 || next >= playlist.items.length) return;
    const ordered = playlist.items.map(item => item.id);
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    await playlistJson('/playlist/item/reorder', { playlist_id: playlist.id, ids: ordered });
    await refreshPlaylists();
}

async function addPlaylistZip(file) {
    const playlist = selectedPlaylist(); if (!playlist || !file) return;
    const maxBytes = Math.max(0, Number(moduleInfo?.max_direct_upload_bytes) || 0);
    if (maxBytes && file.size > maxBytes) throw new Error(playlistText('playlistTooLarge', 'This ZIP exceeds the module transport safety limit ({limit}).').replace('{limit}', playlistFormatBytes(maxBytes)));
    const warningBytes = Math.max(1, Number(moduleInfo?.direct_upload_warning_bytes) || 25 * 1024 * 1024);
    if (file.size > warningBytes && typeof askConfirmation === 'function') {
        const proceed = await askConfirmation(playlistText('playlistLargeWarning', 'This boot animation is large ({size}). Keep it in the playlist anyway?').replace('{size}', playlistFormatBytes(file.size)), false);
        if (!proceed) return;
    }
    const form = new FormData();
    form.append('playlist_id', playlist.id);
    form.append('name', file.name || 'bootanimation.zip');
    form.append('bootanimation', file, 'bootanimation.zip');
    await playlistRequest('/playlist/item/upload', { method: 'POST', body: form });
    await refreshPlaylists();
    if (typeof showToast === 'function') showToast(playlistText('playlistAdded', 'Animation added to playlist.'), 'success', 2800);
}

async function removePlaylistItem(item) {
    const playlist = selectedPlaylist(); if (!playlist) return;
    const confirmed = typeof askConfirmation === 'function' ? await askConfirmation(playlistText('playlistRemoveConfirm', 'Remove this animation from the playlist?'), true) : true;
    if (!confirmed) return;
    await playlistJson('/playlist/item/remove', { playlist_id: playlist.id, entry_id: item.id });
    await refreshPlaylists();
}

async function playlistDownloadBlob(item) {
    const response = await apiFetch('/playlist/download?object=' + encodeURIComponent(item.object_id));
    if (!response.ok) throw new Error(playlistText('playlistDownloadError', 'Could not download this playlist animation.'));
    return response.blob();
}

async function openPlaylistItem(item) {
    try {
        const blob = await playlistDownloadBlob(item);
        await abrirZipNoEditor(blob);
        if (typeof isModuleWorkspaceOpen === 'function' && isModuleWorkspaceOpen() && typeof leaveModuleWorkspaceToStudio === 'function') leaveModuleWorkspaceToStudio();
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4200);
    }
}

async function downloadPlaylistItem(item) {
    try {
        const blob = await playlistDownloadBlob(item);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${String(item.name || 'bootanimation').replace(/[^a-z0-9._-]+/gi, '_') || 'bootanimation'}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4200);
    }
}

async function applyPlaylistItem(item) {
    try {
        await playlistRequest('/playlist/apply?object=' + encodeURIComponent(item.object_id), { method: 'POST' });
        window.hasCustomAnimApplied = true;
        const remove = document.getElementById('btn-remove');
        if (remove && hasModuleFeature('remove')) remove.style.display = 'flex';
        if (hasModuleFeature('history') && typeof loadHistory === 'function') await loadHistory();
        if (typeof syncConnectedDeviceSurfaces === 'function') syncConnectedDeviceSurfaces();
        if (typeof showToast === 'function') showToast(playlistText('playlistApplied', 'Playlist animation applied.'), 'success', 3200);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4600);
    }
}

async function testPlaylistItem(item) {
    if (!playlistTestSupported()) return;
    try {
        await playlistRequest('/playlist/stage?object=' + encodeURIComponent(item.object_id), { method: 'POST' });
        await window.BASModuleTest?.refreshStatus?.();
        await window.BASModuleTest?.start?.();
        if (typeof setModuleWorkspaceTab === 'function') setModuleWorkspaceTab('test', { focus: false });
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4600);
    }
}

function renderPlaylistPicker() {
    const list = document.getElementById('playlist-picker-list');
    if (!list) return;
    list.innerHTML = '';
    playlistRuntime.playlists.forEach(playlist => {
        const button = document.createElement('button');
        button.type = 'button';
        const strong = document.createElement('strong'); strong.textContent = playlist.name;
        const span = document.createElement('span'); span.textContent = playlistText('playlistItemCount', '{count} items').replace('{count}', playlist.items?.length || 0);
        button.append(strong, span);
        button.onclick = () => closePlaylistPicker(playlist.id);
        list.appendChild(button);
    });
    const create = document.createElement('button');
    create.type = 'button'; create.className = 'playlist-picker-create';
    create.textContent = playlistText('playlistCreateNewHere', '+ Create new playlist');
    create.onclick = async () => {
        const id = await createPlaylist();
        if (id && playlistRuntime.pickerResolver) closePlaylistPicker(id);
        else renderPlaylistPicker();
    };
    list.appendChild(create);
}

function closePlaylistPicker(value = null) {
    const modal = document.getElementById('modal-playlist-picker');
    if (modal) modal.style.display = 'none';
    const resolver = playlistRuntime.pickerResolver;
    playlistRuntime.pickerResolver = null;
    if (resolver) resolver(value);
}

async function pickPlaylist() {
    if (!playlistRuntime.loaded) await refreshPlaylists();
    if (!playlistRuntime.playlists.length) return createPlaylist();
    return new Promise(resolve => {
        playlistRuntime.pickerResolver = resolve;
        renderPlaylistPicker();
        const modal = document.getElementById('modal-playlist-picker');
        if (modal) modal.style.display = 'flex';
    });
}

async function addHistoryToPlaylist(historyId, name = '') {
    if (!playlistSupported()) return;
    const playlistId = await pickPlaylist(); if (!playlistId) return;
    try {
        await playlistJson('/playlist/item/from-history', { playlist_id: playlistId, entry_id: String(historyId), name });
        playlistRuntime.selectedId = playlistId;
        await refreshPlaylists();
        if (typeof showToast === 'function') showToast(playlistText('playlistAdded', 'Animation added to playlist.'), 'success', 2800);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4600);
    }
}

async function addStagedToPlaylist(name = '') {
    if (!playlistSupported() || !window.BASModuleTest?.state?.().staged) return;
    const playlistId = await pickPlaylist(); if (!playlistId) return;
    try {
        await playlistJson('/playlist/item/from-staged', { playlist_id: playlistId, name: name || playlistText('playlistStagedName', 'Tested animation') });
        playlistRuntime.selectedId = playlistId;
        await refreshPlaylists();
        if (typeof showToast === 'function') showToast(playlistText('playlistAdded', 'Animation added to playlist.'), 'success', 2800);
    } catch (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error', 4600);
    }
}

function resetPlaylistConnection() {
    revokePlaylistUrls();
    playlistRuntime.playlists = [];
    playlistRuntime.selectedId = '';
    playlistRuntime.loaded = false;
    renderPlaylists();
    syncPlaylistVisibility();
}

function bindPlaylistUi() {
    document.getElementById('playlist-create')?.addEventListener('click', () => createPlaylist().catch(error => showToast(error.message, 'error', 4500)));
    document.getElementById('playlist-rename')?.addEventListener('click', () => renamePlaylist().catch(error => showToast(error.message, 'error', 4500)));
    document.getElementById('playlist-duplicate')?.addEventListener('click', () => duplicatePlaylist().catch(error => showToast(error.message, 'error', 4500)));
    document.getElementById('playlist-delete')?.addEventListener('click', () => deletePlaylist().catch(error => showToast(error.message, 'error', 4500)));
    document.getElementById('playlist-upload')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        if (file) addPlaylistZip(file).catch(error => showToast(error.message, 'error', 4800));
        event.target.value = '';
    });
    document.getElementById('playlist-name-cancel')?.addEventListener('click', () => closePlaylistNameDialog(null));
    document.getElementById('playlist-name-save')?.addEventListener('click', () => closePlaylistNameDialog(document.getElementById('playlist-name-input')?.value || ''));
    document.getElementById('playlist-name-input')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); closePlaylistNameDialog(event.currentTarget.value); }
        if (event.key === 'Escape') { event.preventDefault(); closePlaylistNameDialog(null); }
    });
    document.getElementById('playlist-picker-cancel')?.addEventListener('click', () => closePlaylistPicker(null));
    document.getElementById('module-test-add-playlist')?.addEventListener('click', () => addStagedToPlaylist().catch(error => showToast(error.message, 'error', 4500)));
    document.getElementById('build-test-result-playlist')?.addEventListener('click', () => addStagedToPlaylist().catch(error => showToast(error.message, 'error', 4500)));
    window.addEventListener('bas:languagechange', () => { syncPlaylistText(); renderPlaylists(); });
    syncPlaylistText();
    syncPlaylistVisibility();
}

window.BASPlaylist = Object.freeze({
    supported: playlistSupported,
    refresh: refreshPlaylists,
    addHistory: addHistoryToPlaylist,
    addStaged: addStagedToPlaylist,
    resetConnection: resetPlaylistConnection,
    sync: syncPlaylistVisibility,
    syncText: syncPlaylistText,
    render: renderPlaylists,
    state: () => ({ playlists: playlistRuntime.playlists.map(item => ({ ...item, items: [...(item.items || [])] })), selectedId: playlistRuntime.selectedId })
});
window.addEventListener('DOMContentLoaded', bindPlaylistUi);
