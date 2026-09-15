const sequenceTimelineRuntime = {
    initialized: false,
    view: 'sequence',
    zoom: 92,
    minZoom: 48,
    maxZoom: 180,
    drag: null,
    trim: null
};

function sequenceTimelineText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function sequenceTimelineParts() {
    return typeof getAdvancedParts === 'function' ? getAdvancedParts() : [];
}

function sequenceTimelineIsActive() {
    return typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive();
}

function sequenceTimelineSourceForPart(part) {
    if (window.BASSourceLibrary) return BASSourceLibrary.getPartSource(part);
    return null;
}

function sequenceTimelineSourceId(part) {
    if (window.BASSourceLibrary) return BASSourceLibrary.getPartSourceId(part);
    return '';
}

function sequenceTimelineSourceName(part) {
    const source = sequenceTimelineSourceForPart(part);
    if (source && source.name) return source.name;
    return currentProject && currentProject.sourceName ? currentProject.sourceName : sequenceTimelineText('timeline2PrimarySource', 'Primary source');
}

function sequenceTimelineSourceDuration(part) {
    if (window.BASSourceLibrary) return Math.max(0, Number(BASSourceLibrary.getDuration(sequenceTimelineSourceId(part))) || 0);
    return Math.max(0, Number(currentProject && currentProject.sourceDuration) || 0);
}

function sequenceTimelineSourceFps(part) {
    const source = sequenceTimelineSourceForPart(part);
    return Math.max(1, Number(source && source.fps) || Number(document.getElementById('input-fps')?.value) || Number(currentProject && currentProject.fps) || 30);
}

function sequenceTimelinePartSpan(part) {
    return Math.max(0.001, Number(part && part.end) - Number(part && part.start));
}

function sequenceTimelineBaseDuration() {
    return sequenceTimelineParts().reduce((sum, part) => sum + sequenceTimelinePartSpan(part), 0);
}

function sequenceTimelineFormatSeconds(value) {
    const numeric = Math.max(0, Number(value) || 0);
    const fixed = numeric < 10 ? numeric.toFixed(2) : numeric.toFixed(1);
    return `${['pt', 'es', 'fr'].includes(idiomaAtual) ? fixed.replace('.', ',') : fixed}s`;
}

function sequenceTimelineEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function sequenceTimelineSourceHue(sourceId) {
    const visual = window.BASSourceLibrary ? BASSourceLibrary.getVisual() : [];
    const index = Math.max(0, visual.findIndex(source => source.id === sourceId));
    return [270, 174, 32, 338, 210, 105][index % 6];
}

function sequenceTimelinePartWidth(part) {
    return Math.max(118, Math.round(sequenceTimelinePartSpan(part) * sequenceTimelineRuntime.zoom));
}

function sequenceTimelineRepeatLabel(part) {
    if (part.repeat === 0) return sequenceTimelineText('timeline2Infinite', '∞ loop');
    if (typeof getAdvancedRepeatText === 'function') return getAdvancedRepeatText(part);
    return `${Math.max(1, Number(part.repeat) || 1)}×`;
}

function sequenceTimelineGetUiState() {
    return {
        view: sequenceTimelineRuntime.view,
        zoom: Math.round(sequenceTimelineRuntime.zoom)
    };
}

function sequenceTimelineRestoreUiState(state = {}) {
    if (state.view === 'source' || state.view === 'sequence') sequenceTimelineRuntime.view = state.view;
    const zoom = Number(state.zoom);
    if (Number.isFinite(zoom)) sequenceTimelineRuntime.zoom = Math.max(sequenceTimelineRuntime.minZoom, Math.min(sequenceTimelineRuntime.maxZoom, zoom));
    syncSequenceTimelineUi();
}

function sequenceTimelineSetView(view, options = {}) {
    sequenceTimelineRuntime.view = view === 'source' ? 'source' : 'sequence';
    syncSequenceTimelineUi();
    if (!options.silent && typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
}

function sequenceTimelineUsedSources() {
    const result = [];
    const seen = new Set();
    sequenceTimelineParts().forEach(part => {
        const id = sequenceTimelineSourceId(part);
        if (seen.has(id)) return;
        seen.add(id);
        const source = sequenceTimelineSourceForPart(part);
        result.push({ id, name: source && source.name ? source.name : sequenceTimelineSourceName(part), hue: sequenceTimelineSourceHue(id) });
    });
    return result;
}

function renderSequenceTimelineLegend() {
    const legend = document.getElementById('sequence-source-legend');
    if (!legend) return;
    const sources = sequenceTimelineUsedSources();
    legend.innerHTML = sources.map(source => `<button type="button" class="sequence-source-chip" data-sequence-source-id="${sequenceTimelineEscape(source.id)}" style="--source-hue:${source.hue}"><span></span><strong>${sequenceTimelineEscape(source.name)}</strong></button>`).join('');
}

function renderSequenceTimelineSummary() {
    const summary = document.getElementById('sequence-timeline-summary');
    if (!summary) return;
    const parts = sequenceTimelineParts();
    const sourceCount = sequenceTimelineUsedSources().length;
    const partText = sequenceTimelineText(parts.length === 1 ? 'timeline2PartOne' : 'timeline2Parts', parts.length === 1 ? '1 Part' : '{count} Parts').replace('{count}', String(parts.length));
    const sourceText = sequenceTimelineText(sourceCount === 1 ? 'timeline2SourceOne' : 'timeline2Sources', sourceCount === 1 ? '1 source' : '{count} sources').replace('{count}', String(sourceCount));
    summary.textContent = `${sequenceTimelineText('timeline2Base', 'Base')} ${sequenceTimelineFormatSeconds(sequenceTimelineBaseDuration())} · ${partText} · ${sourceText}`;
}


function renderSequenceTimelineSelectedPart() {
    const shell = document.getElementById('sequence-selected-part');
    const label = document.getElementById('sequence-selected-label');
    const name = document.getElementById('sequence-selected-name');
    const sourceLabel = document.getElementById('sequence-selected-source-label');
    const select = document.getElementById('sequence-selected-source');
    if (label) label.textContent = sequenceTimelineText('advSelectedPart', 'Selected Part');
    if (sourceLabel) sourceLabel.textContent = sequenceTimelineText('advVisualSource', 'Visual source');
    if (!shell || !name || !select) return;
    const part = currentProject ? getAdvancedPartById(currentProject.advancedExpandedId) : null;
    const visual = window.BASSourceLibrary ? BASSourceLibrary.getVisual() : [];
    shell.hidden = !sequenceTimelineIsActive() || !part;
    name.textContent = part ? (part.label || part.folder || '—') : '—';
    select.innerHTML = visual.map(source => `<option value="${sequenceTimelineEscape(source.id)}">${sequenceTimelineEscape(source.name || sequenceTimelineText('timeline2PrimarySource', 'Primary source'))}</option>`).join('');
    select.disabled = !part || !visual.length;
    if (part && visual.length) {
        const sourceId = sequenceTimelineSourceId(part);
        if (visual.some(source => source.id === sourceId)) select.value = sourceId;
    }
}

function renderSequenceTimeline() {
    const track = document.getElementById('sequence-timeline-track');
    if (!track) return;
    const parts = sequenceTimelineParts();
    if (!sequenceTimelineIsActive() || !parts.length) {
        track.innerHTML = `<div class="sequence-timeline-empty">${sequenceTimelineEscape(sequenceTimelineText('timeline2Empty', 'No Parts to show yet.'))}</div>`;
        renderSequenceTimelineSummary();
        renderSequenceTimelineLegend();
        renderSequenceTimelineSelectedPart();
        return;
    }
    if (!getAdvancedPartById(currentProject.advancedExpandedId)) currentProject.advancedExpandedId = parts[0].id;
    const invalidPartIds = new Set(typeof getAdvancedValidationIssues === 'function' ? getAdvancedValidationIssues().map(issue => issue.partId).filter(Boolean) : []);
    track.innerHTML = parts.map((part, index) => {
        const sourceId = sequenceTimelineSourceId(part);
        const hue = sequenceTimelineSourceHue(sourceId);
        const selected = currentProject.advancedExpandedId === part.id;
        const issue = invalidPartIds.has(part.id);
        const width = sequenceTimelinePartWidth(part);
        const type = part.type === 'p' ? 'p' : 'c';
        const duration = sequenceTimelinePartSpan(part);
        const sourceName = sequenceTimelineSourceName(part);
        const audioOn = !!(part.audio && part.audio.mode !== 'none');
        const pauseLabel = part.pause > 0 ? sequenceTimelineText('advPauseBadge', '{count}f pause').replace('{count}', String(part.pause)) : '';
        const audioLabel = audioOn ? sequenceTimelineText('advBadgeAudio', 'AUDIO') : sequenceTimelineText('advBadgeSilent', 'SILENT');
        return `<article class="sequence-part${selected ? ' is-selected' : ''}${issue ? ' is-invalid' : ''}" data-sequence-part-id="${sequenceTimelineEscape(part.id)}" style="--source-hue:${hue};width:${width}px">
            <button type="button" class="sequence-trim-handle sequence-trim-start" data-sequence-trim="start" data-part-id="${sequenceTimelineEscape(part.id)}" aria-label="${sequenceTimelineEscape(sequenceTimelineText('timeline2TrimStart', 'Trim Part start'))}"></button>
            <button type="button" class="sequence-trim-handle sequence-trim-end" data-sequence-trim="end" data-part-id="${sequenceTimelineEscape(part.id)}" aria-label="${sequenceTimelineEscape(sequenceTimelineText('timeline2TrimEnd', 'Trim Part end'))}"></button>
            <div class="sequence-part-top"><button type="button" class="sequence-drag-grip" data-sequence-drag="${sequenceTimelineEscape(part.id)}" aria-label="${sequenceTimelineEscape(sequenceTimelineText('timeline2Drag', 'Drag to reorder'))}"><span></span><span></span><span></span></button><span class="sequence-part-index">${String(index + 1).padStart(2, '0')}</span><span class="sequence-part-type">${type}</span>${issue ? '<span class="sequence-part-warning">!</span>' : ''}</div>
            <strong class="sequence-part-title">${sequenceTimelineEscape(part.label || part.folder)}</strong>
            <span class="sequence-part-source"><i></i>${sequenceTimelineEscape(sourceName)}</span>
            <div class="sequence-part-range"><span data-sequence-range-start>${sequenceTimelineFormatSeconds(part.start)}</span><b>→</b><span data-sequence-range-end>${sequenceTimelineFormatSeconds(part.end)}</span></div>
            <div class="sequence-part-flags"><span class="${audioOn ? 'is-audio' : ''}">${sequenceTimelineEscape(audioLabel)}</span>${pauseLabel ? `<span>${sequenceTimelineEscape(pauseLabel)}</span>` : ''}</div>
            <div class="sequence-part-footer"><span data-sequence-duration>${sequenceTimelineFormatSeconds(duration)}</span><span>${sequenceTimelineEscape(sequenceTimelineRepeatLabel(part))}</span><button type="button" data-sequence-preview="${sequenceTimelineEscape(part.id)}">${sequenceTimelineEscape(sequenceTimelineText('timeline2Preview', 'Preview'))}</button></div>
        </article>`;
    }).join('');
    renderSequenceTimelineSummary();
    renderSequenceTimelineLegend();
    renderSequenceTimelineSelectedPart();
    const zoom = document.getElementById('sequence-zoom');
    if (zoom) zoom.value = String(Math.round(sequenceTimelineRuntime.zoom));
}

function syncSequenceTimelineUi() {
    const active = sequenceTimelineIsActive();
    const switcher = document.getElementById('timeline-view-switch');
    const sourceView = document.getElementById('timeline-source-view');
    const sequenceView = document.getElementById('sequence-timeline-view');
    if (switcher) switcher.hidden = !active;
    if (!active) {
        if (sourceView) sourceView.hidden = false;
        if (sequenceView) sequenceView.hidden = true;
    } else {
        if (sourceView) sourceView.hidden = sequenceTimelineRuntime.view !== 'source';
        if (sequenceView) sequenceView.hidden = sequenceTimelineRuntime.view !== 'sequence';
    }
    document.querySelectorAll('[data-timeline-view]').forEach(button => {
        const selected = active && button.dataset.timelineView === sequenceTimelineRuntime.view;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    renderSequenceTimeline();
}

function syncSequenceTimelineText() {
    const bindings = {
        'timeline-view-sequence-label': sequenceTimelineText('timeline2Sequence', 'Sequence'),
        'timeline-view-source-label': sequenceTimelineText('timeline2Source', 'Primary source'),
        'sequence-timeline-kicker': sequenceTimelineText('timeline2Kicker', 'SEQUENCE TIMELINE'),
        'sequence-timeline-title': sequenceTimelineText('timeline2Title', 'Edit the final order directly'),
        'sequence-timeline-desc': sequenceTimelineText('timeline2Desc', 'Reorder Parts, trim their edges and see which source each one uses.'),
        'sequence-timeline-hint': sequenceTimelineText('timeline2Hint', 'Drag the grip to reorder. Drag either edge to trim. Trims snap to source frames.'),
        'sequence-zoom-fit-label': sequenceTimelineText('timeline2Fit', 'Fit')
    };
    Object.entries(bindings).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
    const viewSwitch = document.getElementById('timeline-view-switch');
    const zoomGroup = document.querySelector('.sequence-zoom-controls');
    const zoomOut = document.getElementById('sequence-zoom-out');
    const zoomIn = document.getElementById('sequence-zoom-in');
    const fit = document.getElementById('sequence-zoom-fit');
    if (viewSwitch) viewSwitch.setAttribute('aria-label', sequenceTimelineText('timeline2ViewAria', 'Timeline view'));
    if (zoomGroup) zoomGroup.setAttribute('aria-label', sequenceTimelineText('timeline2ZoomAria', 'Timeline zoom'));
    if (zoomOut) zoomOut.setAttribute('aria-label', sequenceTimelineText('timeline2ZoomOut', 'Zoom out'));
    if (zoomIn) zoomIn.setAttribute('aria-label', sequenceTimelineText('timeline2ZoomIn', 'Zoom in'));
    if (fit) fit.setAttribute('aria-label', sequenceTimelineText('timeline2FitAria', 'Fit sequence to view'));
    renderSequenceTimelineSelectedPart();
    renderSequenceTimeline();
}

function sequenceTimelineSelectPart(id, options = {}) {
    const part = getAdvancedPartById(id);
    if (!part || !currentProject) return;
    currentProject.advancedExpandedId = id;
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    if (options.seek !== false && typeof seekToAdvancedPart === 'function') seekToAdvancedPart(part);
}

function sequenceTimelineSnapTime(part, time) {
    const duration = sequenceTimelineSourceDuration(part);
    const fps = sequenceTimelineSourceFps(part);
    const step = 1 / fps;
    let value = Math.max(0, Math.min(duration, Number(time) || 0));
    value = Math.round(value / step) * step;
    const threshold = Math.max(step * 1.5, 8 / sequenceTimelineRuntime.zoom);
    const sourceId = sequenceTimelineSourceId(part);
    const candidates = [0, duration];
    sequenceTimelineParts().forEach(other => {
        if (other.id === part.id || sequenceTimelineSourceId(other) !== sourceId) return;
        candidates.push(other.start, other.end);
    });
    let closest = value;
    let distance = threshold + 1;
    candidates.forEach(candidate => {
        const delta = Math.abs(candidate - value);
        if (delta <= threshold && delta < distance) {
            closest = candidate;
            distance = delta;
        }
    });
    return Math.max(0, Math.min(duration, closest));
}

function sequenceTimelineUpdateTrimCard(card, part) {
    if (!card || !part) return;
    card.style.width = `${sequenceTimelinePartWidth(part)}px`;
    const start = card.querySelector('[data-sequence-range-start]');
    const end = card.querySelector('[data-sequence-range-end]');
    const duration = card.querySelector('[data-sequence-duration]');
    if (start) start.textContent = sequenceTimelineFormatSeconds(part.start);
    if (end) end.textContent = sequenceTimelineFormatSeconds(part.end);
    if (duration) duration.textContent = sequenceTimelineFormatSeconds(sequenceTimelinePartSpan(part));
    renderSequenceTimelineSummary();
}

function sequenceTimelineStartTrim(event, handle) {
    const part = getAdvancedPartById(handle.dataset.partId);
    if (!part || event.button > 0 || isGenerating || isBuildingTimeline) return;
    event.preventDefault();
    const card = handle.closest('.sequence-part');
    const boundary = handle.dataset.sequenceTrim;
    sequenceTimelineRuntime.trim = {
        pointerId: event.pointerId,
        boundary,
        part,
        card,
        startX: event.clientX,
        originalStart: part.start,
        originalEnd: part.end,
        changed: false
    };
    handle.setPointerCapture?.(event.pointerId);
    card?.classList.add('is-trimming');
}

function sequenceTimelineMoveTrim(event) {
    const state = sequenceTimelineRuntime.trim;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const part = state.part;
    const delta = (event.clientX - state.startX) / sequenceTimelineRuntime.zoom;
    const fps = sequenceTimelineSourceFps(part);
    const minSpan = Math.max(0.02, 1 / fps);
    if (state.boundary === 'start') {
        const target = sequenceTimelineSnapTime(part, state.originalStart + delta);
        part.start = Math.max(0, Math.min(target, part.end - minSpan));
    } else {
        const duration = sequenceTimelineSourceDuration(part);
        const target = sequenceTimelineSnapTime(part, state.originalEnd + delta);
        part.end = Math.min(duration, Math.max(target, part.start + minSpan));
    }
    state.changed = Math.abs(part.start - state.originalStart) > 0.0001 || Math.abs(part.end - state.originalEnd) > 0.0001;
    sequenceTimelineUpdateTrimCard(state.card, part);
}

function sequenceTimelineFinishTrim(event, cancelled = false) {
    const state = sequenceTimelineRuntime.trim;
    if (!state || state.pointerId !== event.pointerId) return;
    sequenceTimelineRuntime.trim = null;
    state.card?.classList.remove('is-trimming');
    if (cancelled) {
        state.part.start = state.originalStart;
        state.part.end = state.originalEnd;
        renderSequenceTimeline();
        return;
    }
    if (!state.changed) return;
    if (typeof normalizeAdvancedPartRange === 'function') normalizeAdvancedPartRange(state.part);
    currentProject.advancedExpandedId = state.part.id;
    if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    if (typeof showToast === 'function') showToast(sequenceTimelineText('timeline2Trimmed', 'Part range updated'), 'success', 1500);
}

function sequenceTimelineClearDropState() {
    document.querySelectorAll('.sequence-part.is-drop-before, .sequence-part.is-drop-after').forEach(card => card.classList.remove('is-drop-before', 'is-drop-after'));
}

function sequenceTimelineDragTargetIndex(clientX, draggedId) {
    const parts = sequenceTimelineParts();
    const originalIndex = parts.findIndex(part => part.id === draggedId);
    if (originalIndex < 0) return originalIndex;
    const cards = Array.from(document.querySelectorAll('.sequence-part[data-sequence-part-id]')).filter(card => card.dataset.sequencePartId !== draggedId);
    let insertion = cards.length;
    let targetCard = null;
    let before = false;
    for (let index = 0; index < cards.length; index++) {
        const rect = cards[index].getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) {
            insertion = index;
            targetCard = cards[index];
            before = true;
            break;
        }
        targetCard = cards[index];
        before = false;
    }
    sequenceTimelineClearDropState();
    if (targetCard) targetCard.classList.add(before ? 'is-drop-before' : 'is-drop-after');
    const idsWithout = parts.filter(part => part.id !== draggedId).map(part => part.id);
    const targetId = targetCard ? targetCard.dataset.sequencePartId : '';
    if (!targetCard) return idsWithout.length;
    const baseIndex = idsWithout.indexOf(targetId);
    return before ? baseIndex : baseIndex + 1;
}

function sequenceTimelineStartDrag(event, grip) {
    if (event.button > 0 || isGenerating || isBuildingTimeline) return;
    const id = grip.dataset.sequenceDrag;
    const part = getAdvancedPartById(id);
    if (!part) return;
    event.preventDefault();
    const card = grip.closest('.sequence-part');
    const originalIndex = sequenceTimelineParts().findIndex(item => item.id === id);
    sequenceTimelineRuntime.drag = {
        pointerId: event.pointerId,
        id,
        card,
        originalIndex,
        targetIndex: originalIndex,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
    };
    grip.setPointerCapture?.(event.pointerId);
    card?.classList.add('is-dragging');
}

function sequenceTimelineMoveDrag(event) {
    const state = sequenceTimelineRuntime.drag;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 6) return;
    state.moved = true;
    state.targetIndex = sequenceTimelineDragTargetIndex(event.clientX, state.id);
}

function sequenceTimelineFinishDrag(event, cancelled = false) {
    const state = sequenceTimelineRuntime.drag;
    if (!state || state.pointerId !== event.pointerId) return;
    sequenceTimelineRuntime.drag = null;
    state.card?.classList.remove('is-dragging');
    sequenceTimelineClearDropState();
    if (cancelled || !state.moved) return;
    const parts = sequenceTimelineParts();
    const currentIndex = parts.findIndex(part => part.id === state.id);
    if (currentIndex < 0) return;
    const [part] = parts.splice(currentIndex, 1);
    const target = Math.max(0, Math.min(parts.length, state.targetIndex));
    parts.splice(target, 0, part);
    if (target === state.originalIndex) {
        renderSequenceTimeline();
        return;
    }
    currentProject.advancedExpandedId = part.id;
    if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    if (typeof showToast === 'function') showToast(sequenceTimelineText('timeline2Reordered', 'Playback order updated'), 'success', 1500);
}

function sequenceTimelineFit() {
    const scroll = document.getElementById('sequence-timeline-scroll');
    const parts = sequenceTimelineParts();
    if (!scroll || !parts.length) return;
    const available = Math.max(220, scroll.clientWidth - Math.max(0, parts.length - 1) * 8 - 12);
    const total = Math.max(0.001, sequenceTimelineBaseDuration());
    sequenceTimelineRuntime.zoom = Math.max(sequenceTimelineRuntime.minZoom, Math.min(sequenceTimelineRuntime.maxZoom, available / total));
    renderSequenceTimeline();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
}

function sequenceTimelineSetZoom(value, options = {}) {
    const zoom = Math.max(sequenceTimelineRuntime.minZoom, Math.min(sequenceTimelineRuntime.maxZoom, Number(value) || sequenceTimelineRuntime.zoom));
    sequenceTimelineRuntime.zoom = zoom;
    renderSequenceTimeline();
    if (!options.silent && typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
}

function bindSequenceTimeline() {
    if (sequenceTimelineRuntime.initialized) return;
    sequenceTimelineRuntime.initialized = true;
    document.querySelectorAll('[data-timeline-view]').forEach(button => button.addEventListener('click', () => sequenceTimelineSetView(button.dataset.timelineView)));
    document.getElementById('sequence-zoom-out')?.addEventListener('click', () => sequenceTimelineSetZoom(sequenceTimelineRuntime.zoom - 16));
    document.getElementById('sequence-zoom-in')?.addEventListener('click', () => sequenceTimelineSetZoom(sequenceTimelineRuntime.zoom + 16));
    document.getElementById('sequence-zoom-fit')?.addEventListener('click', sequenceTimelineFit);
    document.getElementById('sequence-zoom')?.addEventListener('input', event => sequenceTimelineSetZoom(event.target.value, { silent: true }));
    document.getElementById('sequence-zoom')?.addEventListener('change', event => sequenceTimelineSetZoom(event.target.value));
    const track = document.getElementById('sequence-timeline-track');
    track?.addEventListener('click', event => {
        const preview = event.target.closest('[data-sequence-preview]');
        if (preview) {
            const part = getAdvancedPartById(preview.dataset.sequencePreview);
            if (part) sequenceTimelineSelectPart(part.id, { seek: false });
            if (part && window.BASSourceLibrary) BASSourceLibrary.preview(BASSourceLibrary.getPartSourceId(part));
            return;
        }
        if (event.target.closest('.sequence-drag-grip, .sequence-trim-handle')) return;
        const card = event.target.closest('.sequence-part[data-sequence-part-id]');
        if (card) sequenceTimelineSelectPart(card.dataset.sequencePartId);
    });
    track?.addEventListener('pointerdown', event => {
        const handle = event.target.closest('[data-sequence-trim]');
        if (handle) {
            sequenceTimelineStartTrim(event, handle);
            return;
        }
        const grip = event.target.closest('[data-sequence-drag]');
        if (grip) sequenceTimelineStartDrag(event, grip);
    });
    track?.addEventListener('pointermove', event => {
        if (sequenceTimelineRuntime.trim) sequenceTimelineMoveTrim(event);
        else if (sequenceTimelineRuntime.drag) sequenceTimelineMoveDrag(event);
    });
    track?.addEventListener('pointerup', event => {
        if (sequenceTimelineRuntime.trim) sequenceTimelineFinishTrim(event, false);
        else if (sequenceTimelineRuntime.drag) sequenceTimelineFinishDrag(event, false);
    });
    track?.addEventListener('pointercancel', event => {
        if (sequenceTimelineRuntime.trim) sequenceTimelineFinishTrim(event, true);
        else if (sequenceTimelineRuntime.drag) sequenceTimelineFinishDrag(event, true);
    });
    document.getElementById('sequence-selected-source')?.addEventListener('change', event => {
        if (!currentProject || !window.BASSourceLibrary) return;
        const part = getAdvancedPartById(currentProject.advancedExpandedId);
        if (!part) return;
        BASSourceLibrary.assignVisual(part, event.target.value, true);
    });
    document.getElementById('sequence-source-legend')?.addEventListener('click', event => {
        const button = event.target.closest('[data-sequence-source-id]');
        if (button && window.BASSourceLibrary) BASSourceLibrary.preview(button.dataset.sequenceSourceId);
    });
    window.addEventListener('bas:projectchange', event => {
        const reason = event.detail && event.detail.reason;
        if (reason === 'ui' && !event.detail.contentChanged) return;
        syncSequenceTimelineUi();
    });
    window.addEventListener('resize', () => {
        if (sequenceTimelineIsActive() && sequenceTimelineRuntime.view === 'sequence') renderSequenceTimeline();
    }, { passive: true });
    syncSequenceTimelineText();
    syncSequenceTimelineUi();
}

window.BASSequenceTimeline = Object.freeze({
    render: renderSequenceTimeline,
    sync: syncSequenceTimelineUi,
    syncText: syncSequenceTimelineText,
    setView: sequenceTimelineSetView,
    setZoom: sequenceTimelineSetZoom,
    fit: sequenceTimelineFit,
    getUiState: sequenceTimelineGetUiState,
    restoreUiState: sequenceTimelineRestoreUiState
});
window.renderSequenceTimeline = renderSequenceTimeline;
window.syncSequenceTimelineUi = syncSequenceTimelineUi;
window.syncSequenceTimelineText = syncSequenceTimelineText;
window.addEventListener('DOMContentLoaded', bindSequenceTimeline);
