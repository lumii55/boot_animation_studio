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

function getAdvancedSourceDuration(part = null) {
    if (!currentProject) return 0;
    if (part && window.BASSourceLibrary) return Math.max(0, BASSourceLibrary.getDuration(BASSourceLibrary.getPartSourceId(part)) || 0);
    return Math.max(0, Number(currentProject.sourceDuration) || timelineTimeToProjectTime(playerVideo.duration || 0) || 0);
}

function cloneAdvancedAudioState(audio = {}) {
    const volume = Number(audio.volume);
    const legacyVolume = Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : 100));
    const legacyOffset = clampAudioControlValue(audio.offset, -86400, 86400, 0);
    return {
        mode: ['none', 'video', 'file'].includes(audio.mode) ? audio.mode : 'none',
        volume: 100,
        gainDb: normalizeAudioGainDb(audio.gainDb, legacyVolume),
        fadeIn: clampAudioControlValue(audio.fadeIn, 0, 5, 0),
        fadeOut: clampAudioControlValue(audio.fadeOut, 0, 5, 0),
        fadeCurve: normalizeAudioFadeCurve(audio.fadeCurve),
        delay: clampAudioControlValue(audio.delay !== undefined ? audio.delay : Math.max(0, legacyOffset), 0, 86400, 0),
        sourceIn: clampAudioControlValue(audio.sourceIn !== undefined ? audio.sourceIn : Math.max(0, -legacyOffset), 0, 86400, 0),
        endTrim: clampAudioControlValue(audio.endTrim, 0, 86400, 0),
        normalize: !!audio.normalize,
        normalizeTargetDb: normalizeAudioTargetDb(audio.normalizeTargetDb),
        source: audio.source instanceof Blob ? audio.source : null,
        sourceName: String(audio.sourceName || ''),
        sourceKind: ['imported', 'file', 'library'].includes(audio.sourceKind) ? audio.sourceKind : 'none',
        sourceLibraryId: String(audio.sourceLibraryId || '')
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
        sourceId: String(part.sourceId || (window.BASSourceLibrary ? BASSourceLibrary.getPrimaryId() : '')),
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

function getAdvancedPrimarySourceId() {
    return window.BASSourceLibrary ? BASSourceLibrary.getPrimaryId() : '';
}

function normalizeAdvancedPartRange(part) {
    const duration = getAdvancedSourceDuration(part);
    const source = window.BASSourceLibrary && part ? BASSourceLibrary.getPartSource(part) : null;
    const fps = Math.max(1, Number(source && source.fps) || Number(currentProject && currentProject.fps) || 30);
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
        volume: 100,
        gainDb: roleState.gainDb,
        fadeIn: roleState.fadeIn,
        fadeOut: roleState.fadeOut,
        fadeCurve: roleState.fadeCurve,
        delay: roleState.delay,
        sourceIn: roleState.sourceIn,
        endTrim: roleState.endTrim,
        normalize: roleState.normalize,
        normalizeTargetDb: roleState.normalizeTargetDb,
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
        sourceId: getAdvancedPrimarySourceId(),
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
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return BASMasterSequence.createAdvancedParts(nextAdvancedPartId, cloneAdvancedAudioState);
    const markers = getProjectSourceMarkers();
    const ordered = markers && ['m0', 'm1', 'm2', 'm3'].every(key => Number.isFinite(markers[key])) && markers.m0 <= markers.m1 && markers.m1 <= markers.m2 && markers.m2 <= markers.m3;
    if (ordered && markers.m3 > markers.m0) {
        return [
            {
                id: nextAdvancedPartId(), label: t.advIntro, folder: 'part0', type: 'c', repeat: 1, pause: 0, sourceId: getAdvancedPrimarySourceId(),
                start: markers.m0, end: markers.m1, extraTokens: [], audio: advancedAudioFromSimpleRole('intro')
            },
            {
                id: nextAdvancedPartId(), label: t.advLoop, folder: 'part1', type: 'p', repeat: 0, pause: 0, sourceId: getAdvancedPrimarySourceId(),
                start: markers.m1, end: markers.m2, extraTokens: [], audio: advancedAudioFromSimpleRole('loop')
            },
            {
                id: nextAdvancedPartId(), label: t.advOutro, folder: 'part2', type: 'c', repeat: 1, pause: 0, sourceId: getAdvancedPrimarySourceId(),
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
        sourceId: getAdvancedPrimarySourceId(),
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
        currentProject.advancedParts = window.BASMasterSequence && BASMasterSequence.isTimelineActive()
            ? buildAdvancedPartsFromSimpleEditor()
            : isImportedBootanimationProject() && currentProject.parts.length > 0 && simpleEditorStillMatchesImportedBaseline()
                ? buildAdvancedPartsFromImportedProject()
                : buildAdvancedPartsFromSimpleEditor();
        currentProject.advancedParts.forEach(normalizeAdvancedPartRange);
        currentProject.advancedPartsBaseline = cloneAdvancedParts(currentProject.advancedParts);
        currentProject.advancedPartsDirty = false;
        currentProject.advancedExpandedId = currentProject.advancedParts[0] ? currentProject.advancedParts[0].id : null;
    }
    return currentProject.advancedParts.length > 0;
}

function getAdvancedValidationIssues() {
    const t = traducoes[idiomaAtual];
    if (!isAdvancedPartsActive()) return [{ partId: '', index: -1, field: '', code: 'structure', message: t.advInvalidParts }];
    const parts = getAdvancedParts();
    if (isImportedBootanimationProject() && !isAdvancedPartsDirty() && parts.length > 0) return [];
    const folderOwners = new Map();
    const issues = [];
    parts.forEach((part, index) => {
        const source = window.BASSourceLibrary ? BASSourceLibrary.getPartSource(part) : null;
        const duration = getAdvancedSourceDuration(part);
        if (window.BASSourceLibrary && (!source || source.role !== 'visual')) issues.push({ partId: part.id, index, field: 'source', code: 'source', message: t.advMissingSource || t.advInvalidRange });
        if (!Number.isFinite(part.start) || part.start < 0 || part.start >= part.end) issues.push({ partId: part.id, index, field: 'start', code: 'range-start', message: t.advInvalidRange });
        else if (!Number.isFinite(part.end) || part.end <= part.start || part.end > duration + 0.001) issues.push({ partId: part.id, index, field: 'end', code: 'range-end', message: t.advInvalidRange });
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(part.folder)) issues.push({ partId: part.id, index, field: 'folder', code: 'folder', message: t.advInvalidFolder });
        const folderKey = String(part.folder || '').toLowerCase();
        if (folderKey) {
            if (folderOwners.has(folderKey)) issues.push({ partId: part.id, index, field: 'folder', code: 'duplicate-folder', message: t.advDuplicateFolder });
            else folderOwners.set(folderKey, part.id);
        }
        if (!Number.isInteger(part.repeat) || part.repeat < 0 || part.repeat > 999) issues.push({ partId: part.id, index, field: 'repeat-select', code: 'repeat', message: t.advInvalidRepeat });
        if (!Number.isInteger(part.pause) || part.pause < 0 || part.pause > 9999) issues.push({ partId: part.id, index, field: 'pause', code: 'pause', message: t.advInvalidPause });
        if (part.audio && part.audio.mode === 'file' && !(part.audio.source instanceof Blob)) issues.push({ partId: part.id, index, field: 'audio-mode', code: 'audio', message: t.advMissingAudioFile });
    });
    return issues;
}

function formatAdvancedValidationIssue(issue) {
    if (!issue) return '';
    const t = traducoes[idiomaAtual];
    if (issue.index < 0) return issue.message || t.advInvalidParts;
    const template = t.advIssuePart || 'Part {index}: {message}';
    return template.replace('{index}', String(issue.index + 1).padStart(2, '0')).replace('{message}', issue.message || t.advInvalidParts);
}

function validateAdvancedParts() {
    const issues = getAdvancedValidationIssues();
    const first = issues[0] || null;
    return {
        valid: issues.length === 0,
        message: first ? formatAdvancedValidationIssue(first) : '',
        partId: first ? first.partId : '',
        field: first ? first.field : '',
        issues
    };
}

function getAdvancedPartValidationIssue(id) {
    if (!id) return null;
    return getAdvancedValidationIssues().find(issue => issue.partId === id) || null;
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
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('advanced-parts');
}

function escapeAdvancedHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatAdvancedSeconds(value) {
    const numeric = Math.max(0, Number(value) || 0);
    return `${numeric.toFixed(2)}s`;
}

function getAdvancedPartIcon(part, index) {
    return String(index + 1).padStart(2, '0');
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

function getAdvancedTypeLabel(part) {
    const t = traducoes[idiomaAtual];
    return part.type === 'p' ? (t.advTypeShortNormal || 'p · normal') : (t.advTypeShortComplete || 'c · complete');
}

function getAdvancedAudioLabel(part) {
    const t = traducoes[idiomaAtual];
    if (!part.audio || part.audio.mode === 'none') return t.advAudioNone || 'No audio';
    if (part.audio.mode === 'video') return t.advAudioVideo || 'Source audio';
    if (part.audio.sourceKind === 'library' && part.audio.sourceName) return part.audio.sourceName;
    if (part.audio.sourceName) return part.audio.sourceName;
    return t.advAudioFile || 'Audio file';
}

function getAdvancedFlowBadges(part) {
    const t = traducoes[idiomaAtual];
    const repeat = part.repeat === 0 ? '∞' : `${Math.max(1, part.repeat)}×`;
    const pause = part.pause > 0 ? `${part.pause}f` : '0f';
    const audio = part.audio && part.audio.mode !== 'none' ? (t.advBadgeAudio || 'AUDIO') : (t.advBadgeSilent || 'SILENT');
    return `<span class="advanced-flow-badges"><b class="advanced-flow-type">${escapeAdvancedHtml(part.type === 'p' ? 'p' : 'c')}</b><b>${escapeAdvancedHtml(repeat)}</b><b>${escapeAdvancedHtml(pause)}</b><b class="advanced-flow-audio${part.audio && part.audio.mode !== 'none' ? ' is-on' : ''}">${escapeAdvancedHtml(audio)}</b></span>`;
}

function getAdvancedSequenceStats() {
    const parts = getAdvancedParts();
    const sources = new Set();
    let loops = 0;
    let audio = 0;
    let pauses = 0;
    parts.forEach(part => {
        if (window.BASSourceLibrary) sources.add(BASSourceLibrary.getPartSourceId(part));
        else sources.add('primary');
        if (part.repeat === 0 || part.repeat > 1) loops++;
        if (part.audio && part.audio.mode !== 'none') audio++;
        if (part.pause > 0) pauses++;
    });
    return { parts: parts.length, sources: sources.size, loops, audio, pauses };
}

function renderAdvancedSequenceHealth() {
    const shell = document.getElementById('advanced-sequence-health');
    const statsShell = document.getElementById('advanced-sequence-stats');
    if (!shell || !statsShell) return;
    const t = traducoes[idiomaAtual];
    const validation = validateAdvancedParts();
    const title = document.getElementById('advanced-health-title');
    const label = document.getElementById('advanced-health-label');
    const message = document.getElementById('advanced-health-message');
    const focus = document.getElementById('advanced-health-focus');
    if (label) label.textContent = t.advHealthLabel || 'SEQUENCE CHECK';
    shell.dataset.state = validation.valid ? 'ready' : 'issue';
    if (title) title.textContent = validation.valid ? (t.advHealthReady || 'Sequence ready') : (t.advHealthIssue || 'Sequence needs attention');
    if (message) message.textContent = validation.valid ? (t.advHealthReadyDesc || 'All Parts are valid and ready to build.') : validation.message;
    if (focus) {
        focus.hidden = validation.valid || !validation.partId;
        focus.textContent = t.advReviewPart || 'Review Part';
        focus.dataset.partId = validation.partId || '';
        focus.dataset.field = validation.field || '';
    }
    const stats = getAdvancedSequenceStats();
    const items = [
        [t.advStatParts || '{count} Parts', stats.parts],
        [t.advStatSources || '{count} sources', stats.sources],
        [t.advStatLoops || '{count} loops', stats.loops],
        [t.advStatAudio || '{count} with audio', stats.audio],
        [t.advStatPauses || '{count} pauses', stats.pauses]
    ];
    statsShell.innerHTML = items.map(([template, count]) => `<span>${escapeAdvancedHtml(template.replace('{count}', String(count)))}</span>`).join('');
}

function focusAdvancedValidationIssue(issue = null) {
    const validation = validateAdvancedParts();
    const targetIssue = issue || validation.issues[0];
    if (!targetIssue || !targetIssue.partId || !currentProject) return false;
    currentProject.advancedExpandedId = targetIssue.partId;
    renderAdvancedPartsEditor();
    const card = document.querySelector(`[data-part-card="${CSS.escape(targetIssue.partId)}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (targetIssue.field) {
        setTimeout(() => {
            const field = document.querySelector(`[data-advanced-field="${CSS.escape(targetIssue.field)}"][data-part-id="${CSS.escape(targetIssue.partId)}"]`);
            if (field) {
                const details = field.closest('details');
                if (details) details.open = true;
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                field.focus({ preventScroll: true });
                field.classList.add('advanced-field-attention');
                setTimeout(() => field.classList.remove('advanced-field-attention'), 1300);
            }
        }, 80);
    }
    return true;
}

function updateAdvancedHoldHint(sourceTime = getAdvancedPlayheadSourceTime()) {
    const hint = document.getElementById('advanced-hold-hint');
    if (!hint) return;
    const t = traducoes[idiomaAtual];
    if (!t || !t.advHoldHint) return;
    hint.textContent = t.advHoldHint.replace('{time}', `${formatTimelineSecondsExact(sourceTime)}s`);
}


function getAdvancedPartSource(part) {
    return window.BASSourceLibrary ? BASSourceLibrary.getPartSource(part) : null;
}

function getAdvancedPartSourceName(part) {
    const source = getAdvancedPartSource(part);
    return source ? source.name : (currentProject && currentProject.sourceName ? currentProject.sourceName : '');
}

function renderAdvancedSourceField(part) {
    const t = traducoes[idiomaAtual];
    if (!window.BASSourceLibrary) return '';
    const sources = BASSourceLibrary.getVisual();
    const activeId = BASSourceLibrary.getPartSourceId(part);
    const active = BASSourceLibrary.getById(activeId);
    const options = sources.map(source => `<option value="${escapeAdvancedHtml(source.id)}"${source.id === activeId ? ' selected' : ''}>${escapeAdvancedHtml(source.name)}</option>`).join('');
    const meta = active ? `${active.width && active.height ? `${active.width} × ${active.height} · ` : ''}${formatAdvancedSeconds(BASSourceLibrary.getDuration(active.id))}` : '';
    return `<div class="advanced-field advanced-field-wide advanced-source-field"><label>${escapeAdvancedHtml(t.advVisualSource || 'Visual source')}</label><select data-advanced-field="source" data-part-id="${escapeAdvancedHtml(part.id)}">${options}</select><small class="advanced-source-meta">${escapeAdvancedHtml(meta)}</small></div>`;
}

function renderAdvancedLibraryAudioPicker(part) {
    const t = traducoes[idiomaAtual];
    if (!window.BASSourceLibrary) return '';
    const sources = BASSourceLibrary.getAudio();
    if (!sources.length) return '';
    const activeId = part.audio && part.audio.sourceKind === 'library' ? part.audio.sourceLibraryId || '' : '';
    const options = [`<option value="">${escapeAdvancedHtml(t.advAudioExternal || 'External file')}</option>`]
        .concat(sources.map(source => `<option value="${escapeAdvancedHtml(source.id)}"${source.id === activeId ? ' selected' : ''}>${escapeAdvancedHtml(source.name)}</option>`))
        .join('');
    return `<div class="advanced-field advanced-field-wide"><label>${escapeAdvancedHtml(t.advLibraryAudio || 'Library audio')}</label><select data-advanced-field="audio-library" data-part-id="${escapeAdvancedHtml(part.id)}">${options}</select></div>`;
}

function renderAdvancedFlow() {
    const flow = document.getElementById('advanced-parts-flow');
    if (!flow) return;
    const parts = getAdvancedParts();
    if (!parts.length) {
        flow.innerHTML = '';
        return;
    }
    if (!getAdvancedPartById(currentProject.advancedExpandedId)) currentProject.advancedExpandedId = parts[0].id;
    const issues = new Map(getAdvancedValidationIssues().map(issue => [issue.partId, issue]));
    const totalDuration = Math.max(0.001, parts.reduce((sum, part) => sum + Math.max(0.001, part.end - part.start), 0));
    flow.innerHTML = parts.map((part, index) => {
        const tone = index % 4;
        const selected = currentProject.advancedExpandedId === part.id;
        const issue = issues.get(part.id);
        const span = Math.max(0.001, part.end - part.start);
        const weight = Math.max(92, Math.round((span / totalDuration) * 1000));
        return `<button type="button" class="advanced-flow-chip tone-${tone}${selected ? ' is-selected' : ''}${issue ? ' is-invalid' : ''}" style="--part-weight:${weight}" data-advanced-action="select" data-part-id="${escapeAdvancedHtml(part.id)}"><span class="advanced-flow-top"><span class="advanced-flow-index">${getAdvancedPartIcon(part, index)}</span>${issue ? '<span class="advanced-flow-warning">!</span>' : ''}</span><strong>${escapeAdvancedHtml(part.label || part.folder)}</strong><small>${escapeAdvancedHtml(getAdvancedPartSourceName(part))}</small>${getAdvancedFlowBadges(part)}<em>${formatAdvancedSeconds(part.start)} – ${formatAdvancedSeconds(part.end)}</em></button>`;
    }).join('');
}

function renderAdvancedAudioEditor(part) {
    const t = traducoes[idiomaAtual];
    const audio = part.audio;
    const hasAudio = audio.mode !== 'none';
    const videoDisabled = window.BASSourceLibrary ? !BASSourceLibrary.supportsVideoAudio(BASSourceLibrary.getPartSourceId(part)) : currentProject && currentProject.sourceMode === 'frames';
    const sourceLabel = audio.mode === 'file' && audio.sourceName ? `<div class="advanced-audio-file-name">${escapeAdvancedHtml(audio.sourceName)}</div>` : '';
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
        ${audio.mode === 'file' ? renderAdvancedLibraryAudioPicker(part) : ''}
        ${hasAudio ? `
        <div class="advanced-field advanced-field-wide advanced-volume-row">
            <label>${escapeAdvancedHtml(t.audioGain || 'Gain')} <strong data-advanced-value="gain-${escapeAdvancedHtml(part.id)}">${escapeAdvancedHtml(formatAudioGainDb(audio.gainDb))}</strong></label>
            <input type="range" min="-60" max="12" step="0.5" value="${audio.gainDb}" data-advanced-field="audio-gain" data-part-id="${escapeAdvancedHtml(part.id)}">
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
                <div class="advanced-field">
                    <label>${escapeAdvancedHtml(t.audioDelay || 'Delay')} <strong data-advanced-value="delay-${escapeAdvancedHtml(part.id)}">${formatAudioSeconds(audio.delay)}</strong></label>
                    <input type="range" min="0" max="${Math.max(0, (part.end - part.start) - audio.endTrim)}" step="0.1" value="${audio.delay}" data-advanced-field="audio-delay" data-part-id="${escapeAdvancedHtml(part.id)}">
                </div>
                <div class="advanced-field">
                    <label>${escapeAdvancedHtml(t.audioSourceIn || 'Source start')} <strong data-advanced-value="sourceIn-${escapeAdvancedHtml(part.id)}">${formatAudioSeconds(audio.sourceIn)}</strong></label>
                    <input type="range" min="0" max="${Math.max(30, part.end - part.start, audio.sourceIn)}" step="0.1" value="${audio.sourceIn}" data-advanced-field="audio-source-in" data-part-id="${escapeAdvancedHtml(part.id)}">
                </div>
                <div class="advanced-field advanced-field-wide">
                    <label>${escapeAdvancedHtml(t.audioEndTrim || 'End trim')} <strong data-advanced-value="endTrim-${escapeAdvancedHtml(part.id)}">${formatAudioSeconds(audio.endTrim)}</strong></label>
                    <input type="range" min="0" max="${Math.max(0, (part.end - part.start) - audio.delay)}" step="0.1" value="${audio.endTrim}" data-advanced-field="audio-end-trim" data-part-id="${escapeAdvancedHtml(part.id)}">
                    <small>${escapeAdvancedHtml(t.audioTimingHint || 'Audio cannot start before its Part. Delay moves it later; Source start skips into the source.')}</small>
                </div>
                <div class="advanced-field">
                    <label>${escapeAdvancedHtml(t.audioFadeCurve || 'Fade curve')}</label>
                    <select data-advanced-field="audio-fade-curve" data-part-id="${escapeAdvancedHtml(part.id)}"><option value="linear"${audio.fadeCurve === 'linear' ? ' selected' : ''}>${escapeAdvancedHtml(t.audioFadeCurveLinear || 'Linear')}</option><option value="smooth"${audio.fadeCurve === 'smooth' ? ' selected' : ''}>${escapeAdvancedHtml(t.audioFadeCurveSmooth || 'Smooth')}</option><option value="exponential"${audio.fadeCurve === 'exponential' ? ' selected' : ''}>${escapeAdvancedHtml(t.audioFadeCurveExponential || 'Exponential')}</option></select>
                </div>
                <div class="advanced-field">
                    <label>${escapeAdvancedHtml(t.audioNormalizeTarget || 'Normalize target')}</label>
                    <select data-advanced-field="audio-normalize-target" data-part-id="${escapeAdvancedHtml(part.id)}"${audio.normalize ? '' : ' disabled'}><option value="-0.1"${audio.normalizeTargetDb === -0.1 ? ' selected' : ''}>-0.1 dBFS</option><option value="-1"${audio.normalizeTargetDb === -1 ? ' selected' : ''}>-1.0 dBFS</option><option value="-3"${audio.normalizeTargetDb === -3 ? ' selected' : ''}>-3.0 dBFS</option><option value="-6"${audio.normalizeTargetDb === -6 ? ' selected' : ''}>-6.0 dBFS</option></select>
                </div>
                <label class="advanced-normalize advanced-field-wide"><input type="checkbox" data-advanced-field="audio-normalize" data-part-id="${escapeAdvancedHtml(part.id)}"${audio.normalize ? ' checked' : ''}><span>${escapeAdvancedHtml(t.audioNormalize)}</span></label>
            </div>
        </details>` : ''}
    `;
}

function renderAdvancedPartCard(part, index) {
    const t = traducoes[idiomaAtual];
    const repeatValue = getAdvancedRepeatSelectValue(part.repeat);
    const customRepeat = repeatValue === 'custom';
    const tone = index % 4;
    const issue = getAdvancedPartValidationIssue(part.id);
    const audioLabel = getAdvancedAudioLabel(part);
    return `
        <article class="advanced-part-card tone-${tone} expanded${issue ? ' is-invalid' : ''}" data-part-card="${escapeAdvancedHtml(part.id)}">
            <div class="advanced-part-summary">
                <button type="button" class="advanced-part-summary-main" data-advanced-action="select" data-part-id="${escapeAdvancedHtml(part.id)}">
                    <span class="advanced-part-icon">${getAdvancedPartIcon(part, index)}</span>
                    <span class="advanced-part-summary-text"><small>${escapeAdvancedHtml(t.advSelectedPart)}</small><strong>${escapeAdvancedHtml(part.label || part.folder)}</strong><span>${escapeAdvancedHtml(getAdvancedPartSourceName(part))} · ${formatAdvancedSeconds(part.start)} – ${formatAdvancedSeconds(part.end)}</span></span>
                </button>
                <div class="advanced-part-summary-badges"><span class="advanced-part-type-badge">${escapeAdvancedHtml(getAdvancedTypeLabel(part))}</span><span>${escapeAdvancedHtml(getAdvancedRepeatText(part))}</span>${part.pause > 0 ? `<span>${escapeAdvancedHtml((t.advPauseBadge || '{count}f pause').replace('{count}', String(part.pause)))}</span>` : ''}<span class="${part.audio && part.audio.mode !== 'none' ? 'is-audio' : ''}">${escapeAdvancedHtml(audioLabel)}</span></div>
            </div>
            <div class="advanced-part-body">
                ${issue ? `<button type="button" class="advanced-part-issue" data-advanced-action="focus-issue" data-part-id="${escapeAdvancedHtml(part.id)}"><span>!</span><div><strong>${escapeAdvancedHtml(t.advPartIssue || 'This Part needs attention')}</strong><small>${escapeAdvancedHtml(issue.message)}</small></div></button>` : ''}
                <section class="advanced-inspector-section advanced-inspector-content">
                    <div class="advanced-inspector-heading"><div><span>${escapeAdvancedHtml(t.advContentKicker || 'CONTENT')}</span><strong>${escapeAdvancedHtml(t.advContentTitle || 'Source and range')}</strong></div><button type="button" data-advanced-action="preview-part" data-part-id="${escapeAdvancedHtml(part.id)}">${escapeAdvancedHtml(t.advPreviewPart || 'Preview Part')}</button></div>
                    <div class="advanced-fields-grid">
                        <div class="advanced-field advanced-field-wide">
                            <label>${escapeAdvancedHtml(t.advPartName)}</label>
                            <input type="text" maxlength="50" value="${escapeAdvancedHtml(part.label)}" data-advanced-field="label" data-part-id="${escapeAdvancedHtml(part.id)}">
                        </div>
                        ${renderAdvancedSourceField(part)}
                        <div class="advanced-field">
                            <label>${escapeAdvancedHtml(t.advStart)}</label>
                            <input type="number" min="0" max="${getAdvancedSourceDuration(part)}" step="0.01" value="${part.start.toFixed(2)}" data-advanced-field="start" data-part-id="${escapeAdvancedHtml(part.id)}">
                        </div>
                        <div class="advanced-field">
                            <label>${escapeAdvancedHtml(t.advEnd)}</label>
                            <input type="number" min="0" max="${getAdvancedSourceDuration(part)}" step="0.01" value="${part.end.toFixed(2)}" data-advanced-field="end" data-part-id="${escapeAdvancedHtml(part.id)}">
                        </div>
                    </div>
                </section>
                <section class="advanced-inspector-section advanced-inspector-playback">
                    <div class="advanced-inspector-heading"><div><span>${escapeAdvancedHtml(t.advPlaybackKicker || 'PLAYBACK')}</span><strong>${escapeAdvancedHtml(t.advPlaybackTitle || 'How this Part behaves')}</strong></div></div>
                    <div class="advanced-type-choice" role="group" aria-label="${escapeAdvancedHtml(t.advType)}">
                        <button type="button" class="${part.type === 'c' ? 'is-active' : ''}" data-advanced-action="set-type" data-value="c" data-part-id="${escapeAdvancedHtml(part.id)}"><b>c</b><span><strong>${escapeAdvancedHtml(t.advTypeCompleteName || 'Complete')}</strong><small>${escapeAdvancedHtml(t.advTypeCompleteHint || 'Always finishes before the next Part.')}</small></span></button>
                        <button type="button" class="${part.type === 'p' ? 'is-active' : ''}" data-advanced-action="set-type" data-value="p" data-part-id="${escapeAdvancedHtml(part.id)}"><b>p</b><span><strong>${escapeAdvancedHtml(t.advTypeNormalName || 'Normal')}</strong><small>${escapeAdvancedHtml(t.advTypeNormalHint || 'May stop when Android finishes booting.')}</small></span></button>
                    </div>
                    <div class="advanced-fields-grid advanced-playback-grid">
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
                    </div>
                </section>
                <section class="advanced-inspector-section advanced-inspector-audio">
                    <div class="advanced-inspector-heading"><div><span>${escapeAdvancedHtml(t.advAudioKicker || 'AUDIO')}</span><strong>${escapeAdvancedHtml(t.advAudioTitle || 'Sound for this Part')}</strong></div><em>${escapeAdvancedHtml(audioLabel)}</em></div>
                    <div class="advanced-fields-grid">${renderAdvancedAudioEditor(part)}</div>
                </section>
                <details class="advanced-technical-details">
                    <summary>${escapeAdvancedHtml(t.advTechnical)}</summary>
                    <div class="advanced-fields-grid advanced-technical-grid">
                        <div class="advanced-field advanced-field-wide">
                            <label>${escapeAdvancedHtml(t.advFolder)}</label>
                            <input type="text" maxlength="64" value="${escapeAdvancedHtml(part.folder)}" data-advanced-field="folder" data-part-id="${escapeAdvancedHtml(part.id)}">
                        </div>
                    </div>
                </details>
                <div class="advanced-card-actions advanced-card-actions-primary">
                    <button type="button" data-advanced-action="move-up" data-part-id="${escapeAdvancedHtml(part.id)}"${index === 0 ? ' disabled' : ''}>${escapeAdvancedHtml(t.advMoveUp)}</button>
                    <button type="button" data-advanced-action="move-down" data-part-id="${escapeAdvancedHtml(part.id)}"${index === getAdvancedParts().length - 1 ? ' disabled' : ''}>${escapeAdvancedHtml(t.advMoveDown)}</button>
                    <button type="button" data-advanced-action="duplicate" data-part-id="${escapeAdvancedHtml(part.id)}">${escapeAdvancedHtml(t.advDuplicate)}</button>
                    <button type="button" data-advanced-action="merge-next" data-part-id="${escapeAdvancedHtml(part.id)}"${index === getAdvancedParts().length - 1 ? ' disabled' : ''}>${escapeAdvancedHtml(t.advMergeNext)}</button>
                    <button type="button" class="danger" data-advanced-action="delete" data-part-id="${escapeAdvancedHtml(part.id)}"${getAdvancedParts().length <= 1 ? ' disabled' : ''}>${escapeAdvancedHtml(t.advDelete)}</button>
                </div>
            </div>
        </article>
    `;
}

function renderAdvancedPartsEditor() {
    const editor = document.getElementById('advanced-parts-editor');
    if (!editor || !currentProject) return;
    const t = traducoes[idiomaAtual];
    const parts = getAdvancedParts();
    if (!getAdvancedPartById(currentProject.advancedExpandedId)) currentProject.advancedExpandedId = parts[0]?.id || null;
    const selectedIndex = parts.findIndex(part => part.id === currentProject.advancedExpandedId);
    const selectedPart = selectedIndex >= 0 ? parts[selectedIndex] : null;
    document.getElementById('advanced-parts-title').textContent = t.advTitle;
    document.getElementById('advanced-parts-subtitle').textContent = t.advSubtitle;
    document.getElementById('lbl-advanced-add').textContent = t.advAdd;
    document.getElementById('lbl-advanced-split').textContent = t.advSplit;
    document.getElementById('lbl-advanced-back').textContent = t.advBackSimple;
    document.getElementById('advanced-parts-count').textContent = t.advPartCount.replace('{count}', String(parts.length));
    document.getElementById('advanced-parts-note').textContent = t.advEditorNote;
    const sequenceLabel = document.getElementById('advanced-sequence-label');
    const sequenceHint = document.getElementById('advanced-sequence-hint');
    const modeKicker = document.getElementById('advanced-mode-kicker');
    if (sequenceLabel) sequenceLabel.textContent = t.advSequenceLabel;
    if (sequenceHint) sequenceHint.textContent = t.advSequenceHint;
    if (modeKicker) modeKicker.textContent = t.advModeKicker;
    renderAdvancedFlow();
    renderAdvancedSequenceHealth();
    updateAdvancedHoldHint();
    document.getElementById('advanced-parts-list').innerHTML = selectedPart ? renderAdvancedPartCard(selectedPart, selectedIndex) : '';
    renderAdvancedPartLines();
    if (typeof renderSourceLibrary === 'function') renderSourceLibrary();
    if (window.BASSequenceTimeline) BASSequenceTimeline.render();
}

function syncAdvancedPartsUi() {
    const launch = document.getElementById('advanced-parts-launch');
    const editor = document.getElementById('advanced-parts-editor');
    if (!launch || !editor) return;
    const hasMedia = !!currentProject && document.getElementById('video-container').style.display === 'block';
    const active = isAdvancedPartsActive();
    const t = traducoes[idiomaAtual];
    if (!active) closeAdvancedTimePopover();
    document.getElementById('advanced-options-label').textContent = t.advOptions;
    document.getElementById('advanced-parts-launch-title').textContent = t.advOpen;
    document.getElementById('advanced-parts-launch-hint').textContent = t.advOpenHint;
    launch.style.display = hasMedia && !active ? 'block' : 'none';
    if (!hasMedia || active) launch.open = false;
    editor.style.display = hasMedia && active ? 'flex' : 'none';
    const simpleAudio = document.getElementById('simple-audio-toggle-wrap');
    const audioPanel = document.getElementById('painel-audio');
    const simpleSequence = document.getElementById('simple-sequence');
    if (active) {
        gridMarcadores.style.display = 'none';
        document.getElementById('txt-hint-tooltip').style.display = 'none';
        if (simpleSequence) simpleSequence.style.display = 'none';
        if (simpleAudio) simpleAudio.style.display = 'none';
        if (audioPanel) audioPanel.style.display = 'none';
        renderAdvancedPartsEditor();
    } else if (hasMedia) {
        gridMarcadores.style.display = 'grid';
        document.getElementById('txt-hint-tooltip').style.display = 'block';
        if (simpleSequence) simpleSequence.style.display = '';
        if (simpleAudio) simpleAudio.style.display = '';
        if (typeof renderSimpleSegmentTrack === 'function') renderSimpleSegmentTrack();
        if (typeof verificarPainelAudio === 'function') verificarPainelAudio();
    }
    if (window.BASSequenceTimeline) BASSequenceTimeline.sync();
    if (window.BASMasterSequence) BASMasterSequence.refreshTimeline({ seekToStart: false });
}


function getAdvancedPartById(id) {
    return getAdvancedParts().find(part => part.id === id) || null;
}

function seekToAdvancedPart(part) {
    if (!part || !playerVideo.duration) return;
    if (window.BASSourceLibrary && BASSourceLibrary.getPartSourceId(part) !== BASSourceLibrary.getPrimaryId()) return;
    playerVideo.pause();
    const timelineTime = projectTimeToTimelineTime(part.start);
    playerVideo.currentTime = Math.max(0, Math.min(playerVideo.duration, timelineTime));
    isProgrammaticScroll = true;
    scrollTimeline.scrollLeft = (playerVideo.currentTime / playerVideo.duration) * filmstrip.offsetWidth;
    setTimeout(() => { isProgrammaticScroll = false; }, 20);
}

async function previewAdvancedPartSource(part) {
    if (!part) return;
    currentProject.advancedExpandedId = part.id;
    const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
    if (window.BASSourceLibrary && sourceId) {
        await BASSourceLibrary.preview(sourceId);
        const video = document.getElementById('source-library-preview-video');
        if (video && !video.hidden && Number.isFinite(video.duration) && video.duration > 0) {
            const target = BASSourceLibrary.sourceTimeToPreview(sourceId, part.start, video);
            video.currentTime = Math.max(0, Math.min(video.duration, target));
        }
        return;
    }
    seekToAdvancedPart(part);
}

function getAdvancedPlayheadSourceTime() {
    return timelineTimeToProjectTime(playerVideo.currentTime || 0);
}

function setAdvancedPartBoundaryToTime(part, boundary, sourceTime) {
    if (!part || !currentProject || !['start', 'end'].includes(boundary)) return false;
    const t = traducoes[idiomaAtual];
    const parts = getAdvancedParts();
    const index = parts.findIndex(item => item.id === part.id);
    if (index < 0) return false;
    if (window.BASSourceLibrary && BASSourceLibrary.getPartSourceId(part) !== BASSourceLibrary.getPrimaryId()) {
        if (typeof showToast === 'function') showToast(t.advSecondaryBoundaryHint || 'Use the source preview to set boundaries for this Part.', 'info', 3200);
        return false;
    }
    const duration = getAdvancedSourceDuration(part);
    const source = window.BASSourceLibrary ? BASSourceLibrary.getPartSource(part) : null;
    const fps = Math.max(1, Number(source && source.fps) || Number(currentProject.fps) || 30);
    const minSpan = Math.max(0.02, 0.5 / fps);
    const epsilon = Math.max(0.02, 0.5 / fps);
    const oldStart = part.start;
    const oldEnd = part.end;
    const oldSpan = Math.max(minSpan, oldEnd - oldStart);
    const target = Math.max(0, Math.min(duration, Number(sourceTime) || 0));

    if (boundary === 'start') {
        let nextStart = target;
        if (nextStart >= part.end - minSpan) {
            part.end = Math.min(duration, nextStart + oldSpan);
            if (part.end <= nextStart + minSpan * 0.5) nextStart = Math.max(0, part.end - minSpan);
        }
        nextStart = Math.max(0, Math.min(nextStart, Math.max(0, part.end - minSpan)));
        const previous = index > 0 ? parts[index - 1] : null;
        const samePreviousSource = !window.BASSourceLibrary || !previous || BASSourceLibrary.getPartSourceId(previous) === BASSourceLibrary.getPartSourceId(part);
        if (previous && samePreviousSource && Math.abs(previous.end - oldStart) <= epsilon && nextStart > previous.start + minSpan) previous.end = nextStart;
        part.start = nextStart;
    } else {
        let nextEnd = target;
        if (nextEnd <= part.start + minSpan) {
            part.start = Math.max(0, nextEnd - oldSpan);
            if (nextEnd <= part.start + minSpan * 0.5) nextEnd = Math.min(duration, part.start + minSpan);
        }
        nextEnd = Math.min(duration, Math.max(nextEnd, Math.min(duration, part.start + minSpan)));
        const next = index < parts.length - 1 ? parts[index + 1] : null;
        const sameNextSource = !window.BASSourceLibrary || !next || BASSourceLibrary.getPartSourceId(next) === BASSourceLibrary.getPartSourceId(part);
        if (next && sameNextSource && Math.abs(next.start - oldEnd) <= epsilon && nextEnd < next.end - minSpan) next.start = nextEnd;
        part.end = nextEnd;
    }

    normalizeAdvancedPartRange(part);
    currentProject.advancedExpandedId = part.id;
    markAdvancedPartsDirty();
    renderAdvancedPartsEditor();
    atualizarBotoesELinhas();
    if (typeof navigator.vibrate === 'function') navigator.vibrate(24);
    if (typeof showToast === 'function') {
        const key = boundary === 'start' ? 'advHoldDone' : 'advHoldEndDone';
        const applied = boundary === 'start' ? part.start : part.end;
        showToast(t[key].replace('{name}', part.label || part.folder).replace('{time}', `${formatTimelineSecondsExact(applied)}s`), 'success');
    }
    return true;
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
        sourceId: getAdvancedPrimarySourceId(),
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
    const primaryId = window.BASSourceLibrary ? BASSourceLibrary.getPrimaryId() : '';
    const index = getAdvancedParts().findIndex(part => (!window.BASSourceLibrary || BASSourceLibrary.getPartSourceId(part) === primaryId) && time > part.start + margin && time < part.end - margin);
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
        sourceId: String(part.sourceId || getAdvancedPrimarySourceId()),
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
    if (window.BASSourceLibrary && BASSourceLibrary.getPartSourceId(current) !== BASSourceLibrary.getPartSourceId(next)) {
        if (typeof showToast === 'function') showToast(t.advMergeSourceMismatch || t.advMergeUnavailable, 'warning');
        return;
    }
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
    if (field === 'source') {
        if (window.BASSourceLibrary) BASSourceLibrary.assignVisual(part, value, true);
        return;
    }
    if (field === 'audio-library') {
        if (window.BASSourceLibrary && value) BASSourceLibrary.assignAudio(part, value);
        else if (part.audio) {
            part.audio.source = null;
            part.audio.sourceName = '';
            part.audio.sourceKind = 'none';
            part.audio.sourceLibraryId = '';
            part.audio.mode = 'file';
            markAdvancedPartsDirty();
            renderAdvancedPartsEditor();
            setTimeout(() => document.querySelector(`[data-advanced-audio-file="${CSS.escape(part.id)}"]`)?.click(), 0);
        }
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
        const requested = ['none', 'video', 'file'].includes(value) ? value : 'none';
        const supportsVideo = !window.BASSourceLibrary || BASSourceLibrary.supportsVideoAudio(BASSourceLibrary.getPartSourceId(part));
        part.audio.mode = requested === 'video' && !supportsVideo ? 'none' : requested;
        if (part.audio.mode !== 'file' && part.audio.sourceKind === 'library') {
            part.audio.source = null;
            part.audio.sourceName = '';
            part.audio.sourceKind = 'none';
            part.audio.sourceLibraryId = '';
        }
    } else if (field === 'audio-gain') {
        part.audio.volume = 100;
        part.audio.gainDb = normalizeAudioGainDb(value, 100);
        const label = document.querySelector(`[data-advanced-value="gain-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioGainDb(part.audio.gainDb);
        markAdvancedPartsDirty();
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
        return;
    } else if (field === 'audio-fade-in') {
        part.audio.fadeIn = clampAudioControlValue(value, 0, 5, 0);
        const label = document.querySelector(`[data-advanced-value="fadeIn-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.fadeIn);
        markAdvancedPartsDirty();
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
        return;
    } else if (field === 'audio-fade-out') {
        part.audio.fadeOut = clampAudioControlValue(value, 0, 5, 0);
        const label = document.querySelector(`[data-advanced-value="fadeOut-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.fadeOut);
        markAdvancedPartsDirty();
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
        return;
    } else if (field === 'audio-delay') {
        const span = Math.max(0, part.end - part.start);
        part.audio.delay = clampAudioControlValue(value, 0, Math.max(0, span - Math.max(0, Number(part.audio.endTrim) || 0)), 0);
        const label = document.querySelector(`[data-advanced-value="delay-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.delay);
        markAdvancedPartsDirty();
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
        renderAdvancedPartsEditor();
        if (typeof renderTimeline3 === 'function') renderTimeline3();
        return;
    } else if (field === 'audio-source-in') {
        part.audio.sourceIn = clampAudioControlValue(value, 0, 86400, 0);
        const label = document.querySelector(`[data-advanced-value="sourceIn-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.sourceIn);
        markAdvancedPartsDirty();
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
        return;
    } else if (field === 'audio-end-trim') {
        const span = Math.max(0, part.end - part.start);
        part.audio.endTrim = clampAudioControlValue(value, 0, Math.max(0, span - Math.max(0, Number(part.audio.delay) || 0)), 0);
        const label = document.querySelector(`[data-advanced-value="endTrim-${CSS.escape(part.id)}"]`);
        if (label) label.textContent = formatAudioSeconds(part.audio.endTrim);
        markAdvancedPartsDirty();
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
        renderAdvancedPartsEditor();
        if (typeof renderTimeline3 === 'function') renderTimeline3();
        return;
    } else if (field === 'audio-fade-curve') {
        part.audio.fadeCurve = normalizeAudioFadeCurve(value);
    } else if (field === 'audio-normalize-target') {
        part.audio.normalizeTargetDb = normalizeAudioTargetDb(value);
    } else if (field === 'audio-normalize') {
        part.audio.normalize = !!element.checked;
    }
    markAdvancedPartsDirty();
    if (field === 'audio-mode' || field === 'audio-normalize' || field === 'audio-fade-curve' || field === 'audio-normalize-target') {
        if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
    }
    renderAdvancedPartsEditor();
    if (typeof renderTimeline3 === 'function') renderTimeline3();
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
        if (window.BASSourceLibrary && BASSourceLibrary.getPartSourceId(part) !== BASSourceLibrary.getPrimaryId()) return;
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
    if (typeof setEditTool === 'function') setEditTool('parts');
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
    return Math.abs(normalizeAudioGainDb(audio.gainDb, audio.volume)) < 0.0001 && Math.abs(audio.fadeIn) < 0.0001 && Math.abs(audio.fadeOut) < 0.0001 && normalizeAudioFadeCurve(audio.fadeCurve) === 'linear' && Math.abs(audio.delay || 0) < 0.0001 && Math.abs(audio.sourceIn || 0) < 0.0001 && Math.abs(audio.endTrim || 0) < 0.0001 && !audio.normalize;
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
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const videoAudioBuffers = new Map();
    try {
        for (const part of parts) {
            if (generation !== advancedPreviewGeneration) return;
            let videoAudioBuffer = null;
            if (part.audio && part.audio.mode === 'video') {
                const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
                const key = sourceId || 'primary';
                if (!videoAudioBuffers.has(key)) {
                    const sourceBlob = window.BASSourceLibrary ? BASSourceLibrary.getVideoAudioBlob(sourceId) : currentProject.sourceBlob;
                    videoAudioBuffers.set(key, sourceBlob ? await decodificarAudioFonte(sourceBlob, audioCtx) : null);
                }
                videoAudioBuffer = videoAudioBuffers.get(key);
            }
            const blob = await buildAdvancedPartAudioBlob(part, audioCtx, videoAudioBuffer);
            if (blob) advancedPreviewAudioBlobs.set(part.id, blob);
        }
    } finally {
        videoAudioBuffers.clear();
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
    const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
    try {
        if (window.BASSourceLibrary) await BASSourceLibrary.setVideoElementSource(videoPreview, sourceId);
        const target = window.BASSourceLibrary ? BASSourceLibrary.sourceTimeToPreview(sourceId, part.start, videoPreview) : projectTimeToTimelineTime(part.start);
        if (Math.abs(videoPreview.currentTime - target) > 0.02) {
            if (!window.BASMediaSeek) throw new Error('Media seek helper unavailable');
            await BASMediaSeek.seek(videoPreview, target, { timeout: 700, retries: 1, tolerance: 0.02, requireData: true });
        }
    } catch (error) {
        state.transitioning = false;
        videoPreview.pause();
        clearAdvancedPreviewAudio();
        if (typeof showToast === 'function') showToast((traducoes[idiomaAtual] || traducoes.en).sourceLibrarySeekError || 'Could not seek this source.', 'error');
        return;
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
    const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
    const end = window.BASSourceLibrary ? BASSourceLibrary.sourceTimeToPreview(sourceId, part.end, videoPreview) : projectTimeToTimelineTime(part.end);
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
        if (window.BASSourceLibrary && BASSourceLibrary.getPartSourceId(part) !== BASSourceLibrary.getPrimaryId()) return false;
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

let advancedHoldTimer = 0;
let advancedHoldTarget = null;
let advancedHoldPointerId = null;
let advancedHoldStartX = 0;
let advancedHoldStartY = 0;
let advancedHoldTriggered = false;
let advancedSuppressClickId = null;
let advancedSuppressClickUntil = 0;
let advancedHoldMenuPartId = null;
let advancedHoldMenuTime = 0;
let advancedHoldMenuAnchor = null;

function closeAdvancedTimePopover() {
    const popover = document.getElementById('advanced-time-popover');
    if (!popover) return;
    popover.classList.remove('visible');
    popover.setAttribute('aria-hidden', 'true');
    advancedHoldMenuPartId = null;
    advancedHoldMenuAnchor = null;
}

function positionAdvancedTimePopover(anchor) {
    const popover = document.getElementById('advanced-time-popover');
    if (!popover || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 10;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(window.innerWidth - width - 12, left));
    let top = rect.top - height - gap;
    if (top < 12) top = Math.min(window.innerHeight - height - 12, rect.bottom + gap);
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(12, top)}px`;
}

function openAdvancedTimePopover(part, anchor, sourceTime) {
    const popover = document.getElementById('advanced-time-popover');
    if (!popover || !part || !anchor) return;
    const t = traducoes[idiomaAtual];
    if (window.BASSourceLibrary && BASSourceLibrary.getPartSourceId(part) !== BASSourceLibrary.getPrimaryId()) {
        if (typeof showToast === 'function') showToast(t.advSecondaryBoundaryHint || 'Use the source preview to set boundaries for this Part.', 'info', 3200);
        BASSourceLibrary.preview(BASSourceLibrary.getPartSourceId(part));
        return;
    }
    advancedHoldMenuPartId = part.id;
    advancedHoldMenuTime = Math.max(0, Math.min(getAdvancedSourceDuration(), Number(sourceTime) || 0));
    advancedHoldMenuAnchor = anchor;
    document.getElementById('advanced-time-popover-title').textContent = t.advHoldMenuTitle;
    document.getElementById('advanced-time-popover-prompt').textContent = t.advHoldMenuPrompt
        .replace('{time}', `${formatTimelineSecondsExact(advancedHoldMenuTime)}s`)
        .replace('{name}', part.label || part.folder);
    document.getElementById('advanced-time-start-label').textContent = t.advHoldSetStart;
    document.getElementById('advanced-time-end-label').textContent = t.advHoldSetEnd;
    document.getElementById('advanced-time-cancel').textContent = t.advHoldCancel;
    popover.classList.add('visible');
    popover.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => positionAdvancedTimePopover(anchor));
}

function applyAdvancedHoldBoundary(boundary) {
    const part = getAdvancedPartById(advancedHoldMenuPartId);
    const sourceTime = advancedHoldMenuTime;
    closeAdvancedTimePopover();
    if (part) setAdvancedPartBoundaryToTime(part, boundary, sourceTime);
}

function cancelAdvancedPartHold(clearComplete = true) {
    clearTimeout(advancedHoldTimer);
    advancedHoldTimer = 0;
    if (advancedHoldTarget) {
        advancedHoldTarget.classList.remove('hold-arming');
        if (clearComplete) advancedHoldTarget.classList.remove('hold-complete');
    }
    advancedHoldTarget = null;
    advancedHoldPointerId = null;
}

const advancedTimePopover = document.getElementById('advanced-time-popover');
if (advancedTimePopover) {
    document.getElementById('advanced-time-start')?.addEventListener('click', () => applyAdvancedHoldBoundary('start'));
    document.getElementById('advanced-time-end')?.addEventListener('click', () => applyAdvancedHoldBoundary('end'));
    document.getElementById('advanced-time-cancel')?.addEventListener('click', closeAdvancedTimePopover);
    window.addEventListener('resize', closeAdvancedTimePopover);
    window.addEventListener('scroll', closeAdvancedTimePopover, true);
    document.addEventListener('pointerdown', event => {
        if (!advancedTimePopover.classList.contains('visible')) return;
        if (advancedTimePopover.contains(event.target)) return;
        closeAdvancedTimePopover();
    });
}

const advancedEditor = document.getElementById('advanced-parts-editor');
if (advancedEditor) {
    advancedEditor.addEventListener('click', event => {
        const target = event.target.closest('[data-advanced-action]');
        if (!target) return;
        const action = target.dataset.advancedAction;
        const id = target.dataset.partId;
        if (id && id === advancedSuppressClickId && Date.now() < advancedSuppressClickUntil) {
            event.preventDefault();
            return;
        }
        const part = getAdvancedPartById(id);
        if (action === 'toggle') {
            currentProject.advancedExpandedId = id;
            renderAdvancedPartsEditor();
        } else if (action === 'select') {
            currentProject.advancedExpandedId = id;
            renderAdvancedPartsEditor();
            seekToAdvancedPart(part);
            document.querySelector(`[data-part-card="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (action === 'pick-audio') {
            document.querySelector(`[data-advanced-audio-file="${CSS.escape(id)}"]`)?.click();
        } else if (action === 'preview-part') {
            previewAdvancedPartSource(part);
        } else if (action === 'set-type') {
            if (part) {
                part.type = target.dataset.value === 'p' ? 'p' : 'c';
                markAdvancedPartsDirty();
                renderAdvancedPartsEditor();
            }
        } else if (action === 'focus-issue') {
            focusAdvancedValidationIssue(getAdvancedPartValidationIssue(id));
        } else if (action === 'move-up') moveAdvancedPart(id, -1);
        else if (action === 'move-down') moveAdvancedPart(id, 1);
        else if (action === 'duplicate') duplicateAdvancedPart(id);
        else if (action === 'merge-next') mergeAdvancedPartWithNext(id);
        else if (action === 'delete') deleteAdvancedPart(id);
    });

    advancedEditor.addEventListener('pointerdown', event => {
        const chip = event.target.closest('.advanced-flow-chip[data-part-id], .advanced-part-summary-main[data-part-id]');
        if (!chip || isGenerating || isBuildingTimeline) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        cancelAdvancedPartHold();
        advancedHoldTarget = chip;
        advancedHoldPointerId = event.pointerId;
        advancedHoldStartX = event.clientX;
        advancedHoldStartY = event.clientY;
        advancedHoldTriggered = false;
        chip.classList.add('hold-arming');
        advancedHoldTimer = setTimeout(() => {
            if (!advancedHoldTarget || advancedHoldPointerId !== event.pointerId) return;
            const id = advancedHoldTarget.dataset.partId;
            const part = getAdvancedPartById(id);
            if (!part) {
                cancelAdvancedPartHold();
                return;
            }
            advancedHoldTriggered = true;
            advancedSuppressClickId = id;
            advancedSuppressClickUntil = Date.now() + 700;
            const held = advancedHoldTarget;
            held.classList.remove('hold-arming');
            held.classList.add('hold-complete');
            if (typeof navigator.vibrate === 'function') navigator.vibrate(18);
            openAdvancedTimePopover(part, held, getAdvancedPlayheadSourceTime());
            setTimeout(() => held?.classList.remove('hold-complete'), 220);
        }, 520);
    });

    advancedEditor.addEventListener('pointermove', event => {
        if (!advancedHoldTarget || advancedHoldPointerId !== event.pointerId || advancedHoldTriggered) return;
        if (Math.hypot(event.clientX - advancedHoldStartX, event.clientY - advancedHoldStartY) > 18) cancelAdvancedPartHold();
    });

    advancedEditor.addEventListener('pointerup', event => {
        if (advancedHoldPointerId !== event.pointerId) return;
        const keepSuppress = advancedHoldTriggered;
        cancelAdvancedPartHold();
        if (keepSuppress) advancedSuppressClickUntil = Date.now() + 550;
    });

    advancedEditor.addEventListener('pointercancel', event => {
        if (advancedHoldPointerId === event.pointerId) cancelAdvancedPartHold();
    });

    advancedEditor.addEventListener('contextmenu', event => {
        if (event.target.closest('.advanced-flow-chip[data-part-id], .advanced-part-summary-main[data-part-id]')) event.preventDefault();
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
                part.audio.sourceLibraryId = '';
                markAdvancedPartsDirty();
                if (typeof invalidateAdvancedAudioWaveform === 'function') invalidateAdvancedAudioWaveform(part.id);
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
        if (!field || !id || !['audio-gain', 'audio-fade-in', 'audio-fade-out', 'audio-delay', 'audio-source-in', 'audio-end-trim'].includes(field)) return;
        const part = getAdvancedPartById(id);
        updateAdvancedPartField(part, field, event.target.value, event.target);
    });
}

document.getElementById('advanced-health-focus')?.addEventListener('click', () => focusAdvancedValidationIssue());
document.getElementById('btn-gerar')?.addEventListener('click', () => {
    if (!isAdvancedPartsActive()) return;
    const validation = validateAdvancedParts();
    if (!validation.valid) focusAdvancedValidationIssue(validation.issues[0]);
});
document.getElementById('btn-open-advanced-parts')?.addEventListener('click', enterAdvancedPartsMode);
document.getElementById('btn-advanced-add')?.addEventListener('click', createNewAdvancedPartAtPlayhead);
document.getElementById('btn-advanced-split')?.addEventListener('click', splitAdvancedPartAtPlayhead);
document.getElementById('btn-advanced-back')?.addEventListener('click', exitAdvancedPartsMode);
