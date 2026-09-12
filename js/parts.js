let advancedPreviewState = null;
let advancedPreviewGeneration = 0;
let advancedPreviewPauseTimer = null;
let advancedPreviewAudio = new Audio();
let advancedPreviewAudioUrl = null;
let advancedPreviewAudioBlobs = new Map();

function getAdvancedParts() {
    return currentProject && Array.isArray(currentProject.advancedParts) ? currentProject.advancedParts : [];
}

function isAdvancedPartsActive() {
    return !!currentProject && !!currentProject.advancedPartsEnabled && getAdvancedParts().length > 0;
}

function isAdvancedPartsDirty() {
    return !!currentProject && !!currentProject.advancedPartsDirty;
}

function getAdvancedSourceDuration() {
    if (!currentProject) return 0;
    return Math.max(0, Number(currentProject.sourceDuration) || timelineTimeToProjectTime(playerVideo.duration || 0) || 0);
}

function cloneAdvancedAudioState(audio = {}) {
    const volume = Number(audio.volume);
    return {
        mode: ['none', 'video', 'file'].includes(audio.mode) ? audio.mode : 'none',
        volume: Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : 100)),
        fadeIn: clampAudioControlValue(audio.fadeIn, 0, 5, 0),
        fadeOut: clampAudioControlValue(audio.fadeOut, 0, 5, 0),
        offset: clampAudioControlValue(audio.offset, -5, 5, 0),
        normalize: !!audio.normalize,
        source: audio.source instanceof Blob ? audio.source : null,
        sourceName: String(audio.sourceName || ''),
        sourceKind: ['imported', 'file'].includes(audio.sourceKind) ? audio.sourceKind : 'none'
    };
}

function cloneAdvancedPart(part) {
    return {
        id: String(part.id || ''),
        label: String(part.label || ''),
        folder: String(part.folder || ''),
        type: part.type === 'p' ? 'p' : 'c',
        repeat: Math.max(0, Math.floor(Number(part.repeat) || 0)),
        pause: Math.max(0, Math.floor(Number(part.pause) || 0)),
        start: Math.max(0, Number(part.start) || 0),
        end: Math.max(0, Number(part.end) || 0),
        extraTokens: Array.isArray(part.extraTokens) ? [...part.extraTokens] : [],
        audio: cloneAdvancedAudioState(part.audio)
    };
}

function cloneAdvancedParts(parts = getAdvancedParts()) {
    return parts.map(cloneAdvancedPart);
}

function nextAdvancedPartId() {
    if (!currentProject) return `ap-${Date.now()}`;
    currentProject.advancedPartCounter = Math.max(0, Number(currentProject.advancedPartCounter) || 0) + 1;
    return `ap-${currentProject.advancedPartCounter}`;
}

function getUsedAdvancedFolders(exceptId = null) {
    return new Set(getAdvancedParts().filter(part => part.id !== exceptId).map(part => part.folder.toLowerCase()));
}

function nextAdvancedFolder() {
    const used = getUsedAdvancedFolders();
    let index = 0;
    while (used.has(`part${index}`)) index++;
    return `part${index}`;
}

function getAdvancedDefaultLabel(index) {
    const t = traducoes[idiomaAtual];
    return `${t.advDefaultPart} ${index + 1}`;
}

function normalizeAdvancedPartRange(part) {
    const duration = getAdvancedSourceDuration();
    const fps = Math.max(1, Number(currentProject && currentProject.fps) || 30);
    const minSpan = Math.min(0.05, 1 / fps);
    part.start = Math.max(0, Math.min(duration, Number(part.start) || 0));
    part.end = Math.max(0, Math.min(duration, Number(part.end) || 0));
    if (part.end <= part.start) part.end = Math.min(duration, part.start + minSpan);
    if (part.end <= part.start && duration > 0) {
        part.start = Math.max(0, duration - minSpan);
        part.end = duration;
    }
}

function advancedAudioFromSimpleRole(role) {
    const state = captureAudioEditorState();
    const roleState = state && state[role] ? state[role] : null;
    if (!state || !state.enabled || !roleState) return cloneAdvancedAudioState();
    return cloneAdvancedAudioState({
        mode: roleState.mode,
        volume: roleState.volume,
        fadeIn: roleState.fadeIn,
        fadeOut: roleState.fadeOut,
        offset: roleState.offset,
        normalize: roleState.normalize,
        source: roleState.source && roleState.source.ref instanceof Blob ? roleState.source.ref : null,
        sourceName: roleState.source && roleState.source.name ? roleState.source.name : '',
        sourceKind: roleState.source && roleState.source.kind === 'imported' ? 'imported' : roleState.source && roleState.source.kind === 'file' ? 'file' : 'none'
    });
}

function buildAdvancedPartsFromImportedProject() {
    const fps = Math.max(1, Number(currentProject.fps) || 30);
    const t = traducoes[idiomaAtual];
    return currentProject.parts.map((part, index) => ({
        id: nextAdvancedPartId(),
        label: part.name || `${t.advDefaultPart} ${index + 1}`,
        folder: part.name || `part${index}`,
        type: part.type === 'p' ? 'p' : 'c',
        repeat: Math.max(0, Number(part.repeat) || 0),
        pause: Math.max(0, Number(part.pause) || 0),
        start: Math.max(0, Number(part.frameStart) || 0) / fps,
        end: Math.max(0, (Number(part.frameStart) || 0) + (Number(part.frameCount) || 0)) / fps,
        extraTokens: Array.isArray(part.tokens) ? part.tokens.slice(4) : [],
        audio: cloneAdvancedAudioState({
            mode: part.audioBlob ? 'file' : 'none',
            volume: 100,
            source: part.audioBlob || null,
            sourceName: part.audioName || 'audio.wav',
            sourceKind: part.audioBlob ? 'imported' : 'none'
        })
    }));
}

function buildAdvancedPartsFromSimpleEditor() {
    const t = traducoes[idiomaAtual];
    const markers = getProjectSourceMarkers();
    const ordered = markers && ['m0', 'm1', 'm2', 'm3'].every(key => Number.isFinite(markers[key])) && markers.m0 <= markers.m1 && markers.m1 <= markers.m2 && markers.m2 <= markers.m3;
    if (ordered && markers.m3 > markers.m0) {
        return [
            {
                id: nextAdvancedPartId(), label: t.advIntro, folder: 'part0', type: 'c', repeat: 1, pause: 0,
                start: markers.m0, end: markers.m1, extraTokens: [], audio: advancedAudioFromSimpleRole('intro')
            },
            {
                id: nextAdvancedPartId(), label: t.advLoop, folder: 'part1', type: 'p', repeat: 0, pause: 0,
                start: markers.m1, end: markers.m2, extraTokens: [], audio: advancedAudioFromSimpleRole('loop')
            },
            {
                id: nextAdvancedPartId(), label: t.advOutro, folder: 'part2', type: 'c', repeat: 1, pause: 0,
                start: markers.m2, end: markers.m3, extraTokens: [], audio: advancedAudioFromSimpleRole('final')
            }
        ].filter(part => part.end > part.start);
    }
    const duration = getAdvancedSourceDuration();
    return [{
        id: nextAdvancedPartId(),
        label: `${t.advDefaultPart} 1`,
        folder: 'part0',
        type: 'c',
        repeat: 1,
        pause: 0,
        start: 0,
        end: duration,
        extraTokens: [],
        audio: cloneAdvancedAudioState()
    }];
}

function simpleEditorStillMatchesImportedBaseline() {
    if (!isImportedBootanimationProject()) return false;
    if (typeof projectMarkersMatchInitial === 'function' && !projectMarkersMatchInitial()) return false;
    const baselineAudio = currentProject.editorBaseline && currentProject.editorBaseline.audio;
    if (baselineAudio && typeof audioEditorStatesEqual === 'function') {
        const currentAudio = captureAudioEditorState();
        if (!audioEditorStatesEqual(currentAudio, baselineAudio)) return false;
    }
    return true;
}

function ensureAdvancedPartsInitialized() {
    if (!currentProject) return false;
    if (getAdvancedParts().length === 0) {
        currentProject.advancedPartCounter = 0;
        currentProject.advancedParts = isImportedBootanimationProject() && currentProject.parts.length > 0 && simpleEditorStillMatchesImportedBaseline()
            ? buildAdvancedPartsFromImportedProject()
            : buildAdvancedPartsFromSimpleEditor();
        currentProject.advancedParts.forEach(normalizeAdvancedPartRange);
        currentProject.advancedPartsBaseline = cloneAdvancedParts(currentProject.advancedParts);
        currentProject.advancedPartsDirty = false;
        currentProject.advancedExpandedId = currentProject.advancedParts[0] ? currentProject.advancedParts[0].id : null;
    }
    return currentProject.advancedParts.length > 0;
}

function validateAdvancedParts() {
    const t = traducoes[idiomaAtual];
    if (!isAdvancedPartsActive()) return { valid: false, message: t.advInvalidParts };
    const parts = getAdvancedParts();
    if (isImportedBootanimationProject() && !isAdvancedPartsDirty() && parts.length > 0) return { valid: true, message: '' };
    const duration = getAdvancedSourceDuration();
    const folders = new Set();
    for (const part of parts) {
        if (!Number.isFinite(part.start) || !Number.isFinite(part.end) || part.start < 0 || part.end <= part.start || part.end > duration + 0.001) return { valid: false, message: t.advInvalidRange };
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(part.folder)) return { valid: false, message: t.advInvalidFolder };
        const folderKey = part.folder.toLowerCase();
        if (folders.has(folderKey)) return { valid: false, message: t.advDuplicateFolder };
        folders.add(folderKey);
        if (!Number.isInteger(part.repeat) || part.repeat < 0 || part.repeat > 999) return { valid: false, message: t.advInvalidRepeat };
        if (!Number.isInteger(part.pause) || part.pause < 0 || part.pause > 9999) return { valid: false, message: t.advInvalidPause };
        if (part.audio.mode === 'file' && !(part.audio.source instanceof Blob)) return { valid: false, message: t.advMissingAudioFile };
    }
    return { valid: true, message: '' };
}

function markAdvancedPartsDirty() {
    if (!currentProject) return;
    currentProject.advancedPartsDirty = true;
    if (currentProject.descHasSoundDirectives && !currentProject.advancedSoundWarningShown) {
        currentProject.advancedSoundWarningShown = true;
        const t = traducoes[idiomaAtual];
        if (typeof showToast === 'function') showToast(t.advSoundDirectiveWarning, 'warning', 6200);
    }
    advancedPreviewAudioBlobs.clear();
    if (typeof atualizarBotoesELinhas === 'function') atualizarBotoesELinhas();
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

function escapeAdvancedHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatAdvancedSeconds(value) {
    const numeric = Math.max(0, Number(value) || 0);
    return `${numeric.toFixed(2)}s`;
}

function getAdvancedPartIcon(part, index) {
    const parts = getAdvancedParts();
    if (index === 0) return '🚀';
    if (index === parts.length - 1) return '🏁';
    if (part.repeat === 0 || part.repeat > 1) return '🔁';
    return '✨';
}

function getAdvancedRepeatText(part) {
    const t = traducoes[idiomaAtual];
    if (part.repeat === 0) return t.advRepeatForever;
    if (part.repeat === 1) return t.advRepeatOnce;
    return t.advRepeatTimes.replace('{count}', String(part.repeat));
}

function getAdvancedRepeatSelectValue(repeat) {
    return [0, 1, 2, 3].includes(repeat) ? String(repeat) : 'custom';
}

function renderAdvancedFlow() {
    const flow = document.getElementById('advanced-parts-flow');
    if (!flow) return;
    const parts = getAdvancedParts();
    flow.innerHTML = parts.map((part, index) => {
        const tone = index % 4;
        return `${index > 0 ? '<span class="advanced-flow-arrow">→</span>' : ''}<button type="button" class="advanced-flow-chip tone-${tone}" data-advanced-action="select" data-part-id="${escapeAdvancedHtml(part.id)}"><span>${getAdvancedPartIcon(part, index)}</span><strong>${escapeAdvancedHtml(part.label || part.folder)}</strong><small>${escapeAdvancedHtml(getAdvancedRepeatText(part))}</small></button>`;
    }).join('');
}

function renderAdvancedAudioEditor(part) {
    const t = traducoes[idiomaAtual];
    const audio = part.audio;
    const hasAudio = audio.mode !== 'none';
    const videoDisabled = currentProject && currentProject.sourceMode === 'frames';
    const sourceLabel = audio.mode === 'file' && audio.sourceName ? `<div class="advanced-audio-file-name">🎵 ${escapeAdvancedHtml(audio.sourceName)}</div>` : '';
    const fileButton = audio.mode === 'file' ? `<button type="button" class="advanced-audio-pick" data-advanced-action="pick-audio" data-part-id="${escapeAdvancedHtml(part.id)}">${escapeAdvancedHtml(audio.source instanceof Blob ? t.advReplaceAudio : t.advChooseAudio)}</button>` : '';
    return `
        <div class="advanced-field advanced-field-wide">
            <label>${escapeAdvancedHtml(t.advAudio)}</label>
            <select data-advanced-field="audio-mode" data-part-id="${escapeAdvancedHtml(part.id)}">
                <option value="none"${audio.mode === 'none' ? ' selected' : ''}>${escapeAdvancedHtml(t.optNone)}</option>
                <option value="video"${audio.mode === 'video' ? ' selected' : ''}${videoDisabled ? ' disabled' : ''}>${escapeAdvancedHtml(t.optVid)}</option>
                <option value="file"${audio.mode === 'file' ? ' selected' : ''}>${escapeAdvancedHtml(t.optFile)}</option>
            </select>
            <input type="file" accept="audio/*" hidden data-advanced-audio-file="${escapeAdvancedHtml(part.id)}">
            ${sourceLabel}
            ${fileButton}
        </div>
        ${hasAudio ? `
        <div class="advanced-field advanced-field-wide advanced-volume-row">
            <label>${escapeAdvancedHtml(t.advVolume)} <strong data-advanced-value="volume-${escapeAdvancedHtml(part.id)}">${Math.round(audio.volume)}%</strong></label>
            <input type="range" min="0" max="100" step="1" value="${audio.volume}" data-advanced-field="audio-volume" data-part-id="${escapeAdvancedHtml(part.id)}">
        </div>
        <details class="advanced-audio-details">
            <summary>${escapeAdvancedHtml(t.audioAdvanced)}</summary>
            <div class="advanced-audio-grid">
                <div class="advanced-field">
                    <label>${escapeAdvancedHtml(t.audioFadeIn)} <strong data-advanced-value="fadeIn-${escapeAdvancedHtml(part.id)}">${formatAudioSeconds(audio.fadeIn)}</strong></label>
                    <input type="range" min="0" max="5" step="0.1" value="${audio.fadeIn}" data-advanced-field="audio-fade-in" data-part-id="${escapeAdvancedHtml(part.id)}">
                </div>
                <div class="advanced-field">
                    <label>${escapeAdvancedHtml(t.audioFadeOut)} <strong data-advanced-value="fadeOut-${escapeAdvancedHtml(part.id)}">${formatAudioSeconds(audio.fadeOut)}</strong></label>
                    <input type="range" min="0" max="5" step="0.1" value="${audio.fadeOut}" data-advanced-field="audio-fade-out" data-part-id="${escapeAdvancedHtml(part.id)}">
                </div>
                <div class="advanced-field advanced-field-wide">
                    <label>${escapeAdvancedHtml(t.audioOffset)} <strong data-advanced-value="offset-${escapeAdvancedHtml(part.id)}">${formatAudioSeconds(audio.offset, true)}</strong></label>
                    <input type="range" min="-5" max="5" step="0.1" value="${audio.offset}" data-advanced-field="audio-offset" data-part-id="${escapeAdvancedHtml(part.id)}">
                </div>
                <label class="advanced-normalize advanced-field-wide"><input type="checkbox" data-advanced-field="audio-normalize" data-part-id="${escapeAdvancedHtml(part.id)}"${audio.normalize ? ' checked' : ''}><span>${escapeAdvancedHtml(t.audioNormalize)}</span></label>
            </div>
        </details>` : ''}
    `;
}

function renderAdvancedPartCard(part, index) {
    const t = traducoes[idiomaAtual];
    const expanded = currentProject.advancedExpandedId === part.id;
    const repeatValue = getAdvancedRepeatSelectValue(part.repeat);
    const customRepeat = repeatValue === 'custom';
    const tone = index % 4;
    return `
        <article class="advanced-part-card tone-${tone}${expanded ? ' expanded' : ''}" data-part-card="${escapeAdvancedHtml(part.id)}">
            <button type="button" class="advanced-part-summary" data-advanced-action="toggle" data-part-id="${escapeAdvancedHtml(part.id)}">
                <span class="advanced-part-icon">${getAdvancedPartIcon(part, index)}</span>
                <span class="advanced-part-summary-text"><strong>${escapeAdvancedHtml(part.label || part.folder)}</strong><small>${formatAdvancedSeconds(part.start)} – ${formatAdvancedSeconds(part.end)} · ${escapeAdvancedHtml(getAdvancedRepeatText(part))}</small></span>
                <span class="advanced-part-chevron">${expanded ? '⌃' : '⌄'}</span>
            </button>
            ${expanded ? `
            <div class="advanced-part-body">
                <div class="advanced-fields-grid">
                    <div class="advanced-field advanced-field-wide">
                        <label>${escapeAdvancedHtml(t.advPartName)}</label>
                        <input type="text" maxlength="50" value="${escapeAdvancedHtml(part.label)}" data-advanced-field="label" data-part-id="${escapeAdvancedHtml(part.id)}">
                    </div>
                    <div class="advanced-field">
                        <label>${escapeAdvancedHtml(t.advStart)}</label>
                        <input type="number" min="0" max="${getAdvancedSourceDuration()}" step="0.01" value="${part.start.toFixed(2)}" data-advanced-field="start" data-part-id="${escapeAdvancedHtml(part.id)}">
                    </div>
                    <div class="advanced-field">
                        <label>${escapeAdvancedHtml(t.advEnd)}</label>
                        <input type="number" min="0" max="${getAdvancedSourceDuration()}" step="0.01" value="${part.end.toFixed(2)}" data-advanced-field="end" data-part-id="${escapeAdvancedHtml(part.id)}">
                    </div>
                    <div class="advanced-field">
                        <label>${escapeAdvancedHtml(t.advRepeat)}</label>
                        <select data-advanced-field="repeat-select" data-part-id="${escapeAdvancedHtml(part.id)}">
                            <option value="1"${repeatValue === '1' ? ' selected' : ''}>${escapeAdvancedHtml(t.advRepeatOnce)}</option>
                            <option value="2"${repeatValue === '2' ? ' selected' : ''}>${escapeAdvancedHtml(t.advRepeatTimes.replace('{count}', '2'))}</option>
                            <option value="3"${repeatValue === '3' ? ' selected' : ''}>${escapeAdvancedHtml(t.advRepeatTimes.replace('{count}', '3'))}</option>
                            <option value="0"${repeatValue === '0' ? ' selected' : ''}>${escapeAdvancedHtml(t.advRepeatForever)}</option>
                            <option value="custom"${customRepeat ? ' selected' : ''}>${escapeAdvancedHtml(t.advRepeatCustom)}</option>
                        </select>
                        <input class="advanced-repeat-custom${customRepeat ? ' visible' : ''}" type="number" min="1" max="999" step="1" value="${part.repeat || 1}" data-advanced-field="repeat-custom" data-part-id="${escapeAdvancedHtml(part.id)}">
                    </div>
                    <div class="advanced-field">
                        <label>${escapeAdvancedHtml(t.advPause)}</label>
                        <input type="number" min="0" max="9999" step="1" value="${part.pause}" data-advanced-field="pause" data-part-id="${escapeAdvancedHtml(part.id)}">
                    </div>
                    ${renderAdvancedAudioEditor(part)}
                </div>
                <details class="advanced-technical-details">
                    <summary>${escapeAdvancedHtml(t.advTechnical)}</summary>
                    <div class="advanced-fields-grid advanced-technical-grid">
                        <div class="advanced-field">
                            <label>${escapeAdvancedHtml(t.advFolder)}</label>
                            <input type="text" maxlength="64" value="${escapeAdvancedHtml(part.folder)}" data-advanced-field="folder" data-part-id="${escapeAdvancedHtml(part.id)}">
                        </div>
                        <div class="advanced-field">
                            <label>${escapeAdvancedHtml(t.advType)}</label>
                            <select data-advanced-field="type" data-part-id="${escapeAdvancedHtml(part.id)}">
                                <option value="c"${part.type === 'c' ? ' selected' : ''}>${escapeAdvancedHtml(t.advTypeComplete)}</option>
                                <option value="p"${part.type === 'p' ? ' selected' : ''}>${escapeAdvancedHtml(t.advTypeNormal)}</option>
                            </select>
                        </div>
                    </div>
                </details>
                <div class="advanced-card-actions">
                    <button type="button" data-advanced-action="move-up" data-part-id="${escapeAdvancedHtml(part.id)}"${index === 0 ? ' disabled' : ''}>↑ ${escapeAdvancedHtml(t.advMoveUp)}</button>
                    <button type="button" data-advanced-action="move-down" data-part-id="${escapeAdvancedHtml(part.id)}"${index === getAdvancedParts().length - 1 ? ' disabled' : ''}>↓ ${escapeAdvancedHtml(t.advMoveDown)}</button>
                    <button type="button" data-advanced-action="duplicate" data-part-id="${escapeAdvancedHtml(part.id)}">⧉ ${escapeAdvancedHtml(t.advDuplicate)}</button>
                    <button type="button" data-advanced-action="merge-next" data-part-id="${escapeAdvancedHtml(part.id)}"${index === getAdvancedParts().length - 1 ? ' disabled' : ''}>⛓ ${escapeAdvancedHtml(t.advMergeNext)}</button>
                    <button type="button" class="danger" data-advanced-action="delete" data-part-id="${escapeAdvancedHtml(part.id)}"${getAdvancedParts().length <= 1 ? ' disabled' : ''}>🗑 ${escapeAdvancedHtml(t.advDelete)}</button>
                </div>
            </div>` : ''}
        </article>
    `;
}

function renderAdvancedPartsEditor() {
    const editor = document.getElementById('advanced-parts-editor');
    if (!editor || !currentProject) return;
    const t = traducoes[idiomaAtual];
    document.getElementById('advanced-parts-title').textContent = t.advTitle;
    document.getElementById('advanced-parts-subtitle').textContent = t.advSubtitle;
    document.getElementById('lbl-advanced-add').textContent = t.advAdd;
    document.getElementById('lbl-advanced-split').textContent = t.advSplit;
    document.getElementById('lbl-advanced-back').textContent = t.advBackSimple;
    document.getElementById('advanced-parts-count').textContent = t.advPartCount.replace('{count}', String(getAdvancedParts().length));
    document.getElementById('advanced-parts-note').textContent = t.advEditorNote;
    renderAdvancedFlow();
    document.getElementById('advanced-parts-list').innerHTML = getAdvancedParts().map(renderAdvancedPartCard).join('');
    renderAdvancedPartLines();
}

function syncAdvancedPartsUi() {
    const launch = document.getElementById('advanced-parts-launch');
    const editor = document.getElementById('advanced-parts-editor');
    if (!launch || !editor) return;
    const hasMedia = !!currentProject && document.getElementById('video-container').style.display === 'block';
    const active = isAdvancedPartsActive();
    const t = traducoes[idiomaAtual];
    document.getElementById('btn-open-advanced-parts').textContent = t.advOpen;
    document.getElementById('advanced-parts-launch-hint').textContent = t.advOpenHint;
    launch.style.display = hasMedia && !active ? 'flex' : 'none';
    editor.style.display = hasMedia && active ? 'flex' : 'none';
    const simpleAudio = document.getElementById('simple-audio-toggle-wrap');
    const audioPanel = document.getElementById('painel-audio');
    if (active) {
        gridMarcadores.style.display = 'none';
        document.getElementById('txt-hint-tooltip').style.display = 'none';
        if (simpleAudio) simpleAudio.style.display = 'none';
        if (audioPanel) audioPanel.style.display = 'none';
        renderAdvancedPartsEditor();
    } else if (hasMedia) {
        gridMarcadores.style.display = 'grid';
        document.getElementById('txt-hint-tooltip').style.display = 'block';
        if (simpleAudio) simpleAudio.style.display = '';
        if (typeof verificarPainelAudio === 'function') verificarPainelAudio();
    }
}

function getAdvancedPartById(id) {
    return getAdvancedParts().find(part => part.id === id) || null;
}

function seekToAdvancedPart(part) {
    if (!part || !playerVideo.duration) return;
    playerVideo.pause();
    const timelineTime = projectTimeToTimelineTime(part.start);
    playerVideo.currentTime = Math.max(0, Math.min(playerVideo.duration, timelineTime));
    isProgrammaticScroll = true;
    scrollTimeline.scrollLeft = (playerVideo.currentTime / playerVideo.duration) * filmstrip.offsetWidth;
    setTimeout(() => { isProgrammaticScroll = false; }, 20);
}

function getAdvancedPlayheadSourceTime() {
    return timelineTimeToProjectTime(playerVideo.currentTime || 0);
}

function createNewAdvancedPartAtPlayhead() {
    const t = traducoes[idiomaAtual];
    const duration = getAdvancedSourceDuration();
    if (duration <= 0) return null;
    let start = Math.max(0, Math.min(duration, getAdvancedPlayheadSourceTime()));
    let end = Math.min(duration, start + Math.max(0.5, Math.min(1, duration)));
    if (end <= start) {
        end = duration;
        start = Math.max(0, end - Math.max(0.5, Math.min(1, duration)));
    }
    const part = {
        id: nextAdvancedPartId(),
        label: getAdvancedDefaultLabel(getAdvancedParts().length),
        folder: nextAdvancedFolder(),
        type: 'c',
        repeat: 1,
        pause: 0,
        start,
        end,
        extraTokens: [],
        audio: cloneAdvancedAudioState()
    };
    getAdvancedParts().push(part);
    currentProject.advancedExpandedId = part.id;
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
    seekToAdvancedPart(part);
    if (typeof showToast === 'function') showToast(t.advAdded, 'success');
    return part;
}

function splitAdvancedPartAtPlayhead() {
    const t = traducoes[idiomaAtual];
    const time = getAdvancedPlayheadSourceTime();
    const fps = Math.max(1, Number(currentProject.fps) || 30);
    const margin = Math.max(0.02, 0.5 / fps);
    const index = getAdvancedParts().findIndex(part => time > part.start + margin && time < part.end - margin);
    if (index < 0) {
        if (typeof showToast === 'function') showToast(t.advSplitUnavailable, 'warning');
        return;
    }
    const part = getAdvancedParts()[index];
    const originalRepeat = part.repeat;
    const originalPause = part.pause;
    const newPart = {
        id: nextAdvancedPartId(),
        label: `${part.label} 2`,
        folder: nextAdvancedFolder(),
        type: part.type,
        repeat: originalRepeat,
        pause: originalPause,
        start: time,
        end: part.end,
        extraTokens: [...part.extraTokens],
        audio: cloneAdvancedAudioState()
    };
    part.end = time;
    part.repeat = 1;
    part.pause = 0;
    getAdvancedParts().splice(index + 1, 0, newPart);
    currentProject.advancedExpandedId = newPart.id;
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
    if (typeof showToast === 'function') showToast(t.advSplitDone, 'success');
}

function moveAdvancedPart(id, delta) {
    const parts = getAdvancedParts();
    const index = parts.findIndex(part => part.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= parts.length) return;
    const [part] = parts.splice(index, 1);
    parts.splice(next, 0, part);
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
}

function duplicateAdvancedPart(id) {
    const parts = getAdvancedParts();
    const index = parts.findIndex(part => part.id === id);
    if (index < 0) return;
    const copy = cloneAdvancedPart(parts[index]);
    copy.id = nextAdvancedPartId();
    copy.label = `${copy.label} 2`;
    copy.folder = nextAdvancedFolder();
    parts.splice(index + 1, 0, copy);
    currentProject.advancedExpandedId = copy.id;
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
}

async function deleteAdvancedPart(id) {
    const t = traducoes[idiomaAtual];
    const parts = getAdvancedParts();
    if (parts.length <= 1) return;
    const part = getAdvancedPartById(id);
    if (!part) return;
    if (typeof askConfirmation === 'function' && !await askConfirmation(t.advDeleteConfirm.replace('{name}', part.label || part.folder), true)) return;
    const index = parts.findIndex(item => item.id === id);
    parts.splice(index, 1);
    currentProject.advancedExpandedId = parts[Math.min(index, parts.length - 1)]?.id || null;
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
}

function mergeAdvancedPartWithNext(id) {
    const t = traducoes[idiomaAtual];
    const parts = getAdvancedParts();
    const index = parts.findIndex(part => part.id === id);
    if (index < 0 || index >= parts.length - 1) return;
    const current = parts[index];
    const next = parts[index + 1];
    const epsilon = Math.max(0.02, 0.5 / Math.max(1, Number(currentProject.fps) || 30));
    if (Math.abs(current.end - next.start) > epsilon) {
        if (typeof showToast === 'function') showToast(t.advMergeUnavailable, 'warning');
        return;
    }
    current.end = next.end;
    parts.splice(index + 1, 1);
    currentProject.advancedExpandedId = current.id;
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
}

function updateAdvancedPartField(part, field, value, element) {
    if (!part) return;
    if (field === 'label') {
        part.label = String(value || '').trim() || part.folder;
        renderAdvancedPartsEditor();
        return;
    }
    if (field === 'folder') {
        part.folder = String(value || '').trim();
    } else if (field === 'start' || field === 'end') {
        part[field] = Number(value);
        normalizeAdvancedPartRange(part);
    } else if (field === 'type') {
        part.type = value === 'p' ? 'p' : 'c';
    } else if (field === 'pause') {
        part.pause = Math.max(0, Math.min(9999, Math.floor(Number(value) || 0)));
    } else if (field === 'repeat-select') {
        if (value === 'custom') {
            if ([0, 1, 2, 3].includes(part.repeat)) part.repeat = 4;
        } else {
            part.repeat = Math.max(0, Math.min(999, Math.floor(Number(value) || 0)));
        }
    } else if (field === 'repeat-custom') {
        part.repeat = Math.max(1, Math.min(999, Math.floor(Number(value) || 1)));
    } else if (field === 'audio-mode') {
        part.audio.mode = ['none', 'video', 'file'].includes(value) ? value : 'none';
    } else if (field === 'audio-volume') {
        part.audio.volume = Math.max(0, Math.min(100, Number(value) || 0));
        const label = document.querySelector(`[data-advanced-value="volume-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = `${Math.round(part.audio.volume)}%`;
        markAdvancedPartsDirty();
        return;
    } else if (field === 'audio-fade-in') {
        part.audio.fadeIn = clampAudioControlValue(value, 0, 5, 0);
        const label = document.querySelector(`[data-advanced-value="fadeIn-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.fadeIn);
        markAdvancedPartsDirty();
        return;
    } else if (field === 'audio-fade-out') {
        part.audio.fadeOut = clampAudioControlValue(value, 0, 5, 0);
        const label = document.querySelector(`[data-advanced-value="fadeOut-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.fadeOut);
        markAdvancedPartsDirty();
        return;
    } else if (field === 'audio-offset') {
        part.audio.offset = clampAudioControlValue(value, -5, 5, 0);
        const label = document.querySelector(`[data-advanced-value="offset-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.offset, true);
        markAdvancedPartsDirty();
        return;
    } else if (field === 'audio-normalize') {
        part.audio.normalize = !!element.checked;
    }
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
    if (field === 'audio-mode' && part.audio.mode === 'file' && !(part.audio.source instanceof Blob)) {
        setTimeout(() => {
            const input = document.querySelector(`[data-advanced-audio-file="${part.id}"]`);
            if (input) input.click();
        }, 0);
    }
}

function renderAdvancedPartLines() {
    document.querySelectorAll('.linha-parte-avancada').forEach(el => el.remove());
    if (!isAdvancedPartsActive() || !playerVideo.duration || !filmstrip.offsetWidth) return;
    const seen = new Set();
    getAdvancedParts().forEach((part, index) => {
        [part.start, part.end].forEach(sourceTime => {
            const timelineTime = projectTimeToTimelineTime(sourceTime);
            const key = timelineTime.toFixed(4);
            if (seen.has(key)) return;
            seen.add(key);
            const line = document.createElement('div');
            line.className = `linha-parte-avancada tone-${index % 4}`;
            line.style.left = `${Math.max(0, Math.min(100, (timelineTime / playerVideo.duration) * 100))}%`;
            line.addEventListener('click', event => {
                event.stopPropagation();
                playerVideo.pause();
                playerVideo.currentTime = timelineTime;
            });
            filmstrip.appendChild(line);
        });
    });
}

async function enterAdvancedPartsMode() {
    if (!currentProject || isGenerating || isBuildingTimeline) return;
    if (!ensureAdvancedPartsInitialized()) return;
    currentProject.advancedPartsEnabled = true;
    syncAdvancedPartsUi();
    atualizarBotoesELinhas();
}

async function exitAdvancedPartsMode() {
    if (!currentProject) return;
    const t = traducoes[idiomaAtual];
    if (currentProject.advancedPartsDirty && typeof askConfirmation === 'function') {
        const accepted = await askConfirmation(t.advBackConfirm, true);
        if (!accepted) return;
    }
    currentProject.advancedParts = [];
    currentProject.advancedPartsBaseline = null;
    currentProject.advancedPartsDirty = false;
    currentProject.advancedPartsEnabled = false;
    currentProject.advancedExpandedId = null;
    currentProject.advancedPartCounter = 0;
    stopAdvancedPartsPreview();
    syncAdvancedPartsUi();
    atualizarBotoesELinhas();
}

function clearAdvancedPreviewAudio() {
    advancedPreviewAudio.pause();
    advancedPreviewAudio.removeAttribute('src');
    advancedPreviewAudio.load();
    if (advancedPreviewAudioUrl) {
        URL.revokeObjectURL(advancedPreviewAudioUrl);
        advancedPreviewAudioUrl = null;
    }
}

function advancedAudioIsNeutral(audio) {
    return audio.volume === 100 && Math.abs(audio.fadeIn) < 0.0001 && Math.abs(audio.fadeOut) < 0.0001 && Math.abs(audio.offset) < 0.0001 && !audio.normalize;
}

async function buildAdvancedPartAudioBlob(part, audioCtx, videoAudioBuffer = null) {
    if (!part || !part.audio || part.audio.mode === 'none') return null;
    const audio = part.audio;
    if (audio.mode === 'file' && audio.sourceKind === 'imported' && audio.source instanceof Blob && advancedAudioIsNeutral(audio)) return audio.source;
    if (audio.mode === 'video') {
        if (!videoAudioBuffer) return null;
        return await fatiarEGerarWav(videoAudioBuffer, part.start, part.end, audioCtx, audio.volume / 100, audio);
    }
    if (audio.mode === 'file' && audio.source instanceof Blob) {
        const decoded = await decodificarAudioFonte(audio.source, audioCtx);
        if (!decoded) return null;
        const duration = Math.max(0.001, part.end - part.start);
        return await fatiarEGerarWav(decoded, 0, duration, audioCtx, audio.volume / 100, audio);
    }
    return null;
}

async function prepareAdvancedPartsPreviewAudio() {
    const generation = ++advancedPreviewGeneration;
    advancedPreviewAudioBlobs.clear();
    clearAdvancedPreviewAudio();
    if (!isAdvancedPartsActive()) return;
    const parts = getAdvancedParts();
    const needsVideo = parts.some(part => part.audio.mode === 'video');
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    let videoAudioBuffer = null;
    try {
        if (needsVideo) videoAudioBuffer = await decodificarAudioFonte(playerVideo.src, audioCtx);
        for (const part of parts) {
            if (generation !== advancedPreviewGeneration) return;
            const blob = await buildAdvancedPartAudioBlob(part, audioCtx, videoAudioBuffer);
            if (blob) advancedPreviewAudioBlobs.set(part.id, blob);
        }
    } finally {
        videoAudioBuffer = null;
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

function playAdvancedPreviewAudio(part) {
    clearAdvancedPreviewAudio();
    const blob = advancedPreviewAudioBlobs.get(part.id);
    if (!blob) return;
    advancedPreviewAudioUrl = URL.createObjectURL(blob);
    advancedPreviewAudio.src = advancedPreviewAudioUrl;
    advancedPreviewAudio.currentTime = 0;
    advancedPreviewAudio.play().catch(() => {});
}

function getAdvancedPreviewRepeatCount(part) {
    if (part.repeat === 0) return 2;
    return Math.max(1, Math.min(3, part.repeat));
}

async function playAdvancedPreviewPart(index, played = 0) {
    const state = advancedPreviewState;
    const parts = getAdvancedParts();
    if (!state || !parts.length || state.generation !== advancedPreviewGeneration) return;
    const normalizedIndex = ((index % parts.length) + parts.length) % parts.length;
    const part = parts[normalizedIndex];
    state.transitioning = true;
    state.index = normalizedIndex;
    state.played = played;
    videoPreview.pause();
    clearAdvancedPreviewAudio();
    const target = projectTimeToTimelineTime(part.start);
    if (Math.abs(videoPreview.currentTime - target) > 0.02) {
        await new Promise(resolve => {
            let finished = false;
            const done = () => {
                if (finished) return;
                finished = true;
                videoPreview.removeEventListener('seeked', done);
                resolve();
            };
            videoPreview.addEventListener('seeked', done, { once: true });
            videoPreview.currentTime = Math.max(0, Math.min(videoPreview.duration || target, target));
            setTimeout(done, 500);
        });
    }
    if (!advancedPreviewState || state.generation !== advancedPreviewGeneration) return;
    state.transitioning = false;
    playAdvancedPreviewAudio(part);
    videoPreview.play().catch(() => {});
}

async function advanceAdvancedPreview() {
    const state = advancedPreviewState;
    if (!state || state.transitioning) return;
    const parts = getAdvancedParts();
    const part = parts[state.index];
    if (!part) return;
    state.transitioning = true;
    const nextPlayed = state.played + 1;
    if (nextPlayed < getAdvancedPreviewRepeatCount(part)) {
        await playAdvancedPreviewPart(state.index, nextPlayed);
        return;
    }
    videoPreview.pause();
    clearAdvancedPreviewAudio();
    const pauseSeconds = Math.max(0, part.pause) / Math.max(1, Number(document.getElementById('input-fps').value) || currentProject.fps || 30);
    const nextIndex = (state.index + 1) % parts.length;
    if (pauseSeconds > 0) {
        advancedPreviewPauseTimer = setTimeout(() => {
            advancedPreviewPauseTimer = null;
            if (advancedPreviewState && state.generation === advancedPreviewGeneration) playAdvancedPreviewPart(nextIndex, 0);
        }, Math.min(5000, pauseSeconds * 1000));
    } else {
        await playAdvancedPreviewPart(nextIndex, 0);
    }
}

function handleAdvancedPreviewTimeUpdate() {
    if (!isAdvancedPartsActive() || !advancedPreviewState) return false;
    const state = advancedPreviewState;
    if (state.transitioning) return true;
    const part = getAdvancedParts()[state.index];
    if (!part) return true;
    const end = projectTimeToTimelineTime(part.end);
    if (videoPreview.currentTime >= Math.max(0, end - 0.015)) advanceAdvancedPreview();
    return true;
}

async function startAdvancedPartsPreview() {
    stopAdvancedPartsPreview(false);
    if (!isAdvancedPartsActive()) return false;
    const generation = ++advancedPreviewGeneration;
    advancedPreviewState = { index: 0, played: 0, transitioning: true, generation };
    await prepareAdvancedPartsPreviewAudio();
    if (!advancedPreviewState) return false;
    advancedPreviewState.generation = advancedPreviewGeneration;
    await playAdvancedPreviewPart(0, 0);
    return true;
}

function stopAdvancedPartsPreview(incrementGeneration = true) {
    if (incrementGeneration) advancedPreviewGeneration++;
    if (advancedPreviewPauseTimer) {
        clearTimeout(advancedPreviewPauseTimer);
        advancedPreviewPauseTimer = null;
    }
    advancedPreviewState = null;
    clearAdvancedPreviewAudio();
    advancedPreviewAudioBlobs.clear();
}

function advancedPartsCanUseSimpleExport() {
    if (!isAdvancedPartsActive() || isImportedBootanimationProject() || isAdvancedPartsDirty()) return false;
    const parts = getAdvancedParts();
    if (parts.length !== 3) return false;
    const markers = getProjectSourceMarkers();
    if (!markers || ['m0', 'm1', 'm2', 'm3'].some(key => !Number.isFinite(markers[key]))) return false;
    const epsilon = 1 / (Math.max(1, Number(document.getElementById('input-fps')?.value) || currentProject.fps || 30) * 4);
    const expected = [
        { start: markers.m0, end: markers.m1, folder: 'part0', type: 'c', repeat: 1, pause: 0 },
        { start: markers.m1, end: markers.m2, folder: 'part1', type: 'p', repeat: 0, pause: 0 },
        { start: markers.m2, end: markers.m3, folder: 'part2', type: 'c', repeat: 1, pause: 0 }
    ];
    return parts.every((part, index) => {
        const target = expected[index];
        return Math.abs(part.start - target.start) <= epsilon &&
            Math.abs(part.end - target.end) <= epsilon &&
            part.folder === target.folder && part.type === target.type && part.repeat === target.repeat && part.pause === target.pause;
    });
}

function getAdvancedPerformanceRange() {
    const parts = getAdvancedParts();
    if (!isAdvancedPartsActive() || parts.length === 0) return null;
    const starts = parts.map(part => part.start).filter(Number.isFinite);
    const ends = parts.map(part => part.end).filter(Number.isFinite);
    if (!starts.length || !ends.length) return null;
    return { start: Math.min(...starts), end: Math.max(...ends) };
}

function getAdvancedOutputFrameCount(fps) {
    if (!isAdvancedPartsActive()) return 0;
    return getAdvancedParts().reduce((total, part) => total + Math.max(1, Math.ceil(Math.max(0, part.end - part.start) * fps)), 0);
}

function getAdvancedAudioDurationSeconds() {
    if (!isAdvancedPartsActive()) return 0;
    return getAdvancedParts().reduce((total, part) => part.audio.mode === 'none' ? total : total + Math.max(0, part.end - part.start), 0);
}

function getAdvancedPreviewSamplePart() {
    if (!isAdvancedPartsActive()) return null;
    return getAdvancedParts().find(part => part.repeat === 0) || getAdvancedParts()[0] || null;
}

const advancedEditor = document.getElementById('advanced-parts-editor');
if (advancedEditor) {
    advancedEditor.addEventListener('click', event => {
        const target = event.target.closest('[data-advanced-action]');
        if (!target) return;
        const action = target.dataset.advancedAction;
        const id = target.dataset.partId;
        const part = getAdvancedPartById(id);
        if (action === 'toggle') {
            currentProject.advancedExpandedId = currentProject.advancedExpandedId === id ? null : id;
            renderAdvancedPartsEditor();
        } else if (action === 'select') {
            currentProject.advancedExpandedId = id;
            renderAdvancedPartsEditor();
            seekToAdvancedPart(part);
            document.querySelector(`[data-part-card="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (action === 'pick-audio') {
            document.querySelector(`[data-advanced-audio-file="${CSS.escape(id)}"]`)?.click();
        } else if (action === 'move-up') moveAdvancedPart(id, -1);
        else if (action === 'move-down') moveAdvancedPart(id, 1);
        else if (action === 'duplicate') duplicateAdvancedPart(id);
        else if (action === 'merge-next') mergeAdvancedPartWithNext(id);
        else if (action === 'delete') deleteAdvancedPart(id);
    });

    advancedEditor.addEventListener('change', event => {
        const fileInput = event.target.closest('[data-advanced-audio-file]');
        if (fileInput) {
            const part = getAdvancedPartById(fileInput.dataset.advancedAudioFile);
            const file = fileInput.files && fileInput.files[0];
            if (part && file) {
                part.audio.mode = 'file';
                part.audio.source = file;
                part.audio.sourceName = file.name || 'audio';
                part.audio.sourceKind = 'file';
                markAdvancedPartsDirty();
                renderAdvancedPartsEditor();
            } else if (part && !(part.audio.source instanceof Blob)) {
                part.audio.mode = 'none';
                renderAdvancedPartsEditor();
            }
            return;
        }
        const field = event.target.dataset.advancedField;
        const id = event.target.dataset.partId;
        if (!field || !id) return;
        const part = getAdvancedPartById(id);
        updateAdvancedPartField(part, field, event.target.value, event.target);
    });

    advancedEditor.addEventListener('input', event => {
        const field = event.target.dataset.advancedField;
        const id = event.target.dataset.partId;
        if (!field || !id || !['audio-volume', 'audio-fade-in', 'audio-fade-out', 'audio-offset'].includes(field)) return;
        const part = getAdvancedPartById(id);
        updateAdvancedPartField(part, field, event.target.value, event.target);
    });
}

document.getElementById('btn-open-advanced-parts')?.addEventListener('click', enterAdvancedPartsMode);
document.getElementById('btn-advanced-add')?.addEventListener('click', createNewAdvancedPartAtPlayhead);
document.getElementById('btn-advanced-split')?.addEventListener('click', splitAdvancedPartAtPlayhead);
document.getElementById('btn-advanced-back')?.addEventListener('click', exitAdvancedPartsMode);
