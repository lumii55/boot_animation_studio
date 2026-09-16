const timeline3Runtime = {
    initialized: false,
    zoom: 84,
    minZoom: 36,
    maxZoom: 220,
    selectedType: '',
    selectedId: '',
    trim: null,
    pressTimer: 0,
    pressStart: null,
    pointers: new Map(),
    pinchDistance: 0,
    pinchZoom: 84
};

function timeline3Text(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function timeline3Escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function timeline3Format(value) {
    const seconds = Math.max(0, Number(value) || 0);
    const fixed = seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1);
    return `${['pt', 'es', 'fr'].includes(idiomaAtual) ? fixed.replace('.', ',') : fixed}s`;
}

function timeline3IsAdvanced() {
    return typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive();
}

function timeline3SimpleLayout() {
    if (window.BASMasterSequence) return BASMasterSequence.getLayout();
    return [];
}

function timeline3AdvancedLayout() {
    let cursor = 0;
    return (typeof getAdvancedParts === 'function' ? getAdvancedParts() : []).map((part, index) => {
        const span = Math.max(0.001, Number(part.end) - Number(part.start));
        const start = cursor;
        cursor += span;
        return { part, index, start, end: cursor, duration: span };
    });
}

function timeline3Duration() {
    if (timeline3IsAdvanced()) {
        const layout = timeline3AdvancedLayout();
        return layout.length ? layout[layout.length - 1].end : 0;
    }
    if (window.BASMasterSequence) return Math.max(0, Number(BASMasterSequence.getDuration()) || 0);
    return typeof getTimelineDurationExact === 'function' ? getTimelineDurationExact() : 0;
}

function timeline3TrackWidth() {
    return Math.max(320, Math.ceil(timeline3Duration() * timeline3Runtime.zoom));
}

function timeline3VisualHue(sourceId) {
    const visual = window.BASSourceLibrary ? BASSourceLibrary.getVisual() : [];
    const index = Math.max(0, visual.findIndex(source => source.id === sourceId));
    return [270, 174, 32, 338, 210, 105][index % 6];
}

function timeline3SourceName(sourceId) {
    const source = window.BASSourceLibrary ? BASSourceLibrary.getById(sourceId) : null;
    return source && source.name ? source.name : timeline3Text('timeline3PrimarySource', 'Primary source');
}

function timeline3RulerHtml() {
    const duration = timeline3Duration();
    if (!(duration > 0)) return '';
    const targetSpacing = 72;
    const secondsPerTick = Math.max(0.25, targetSpacing / timeline3Runtime.zoom);
    const choices = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = choices.find(value => value >= secondsPerTick) || 60;
    let html = '';
    for (let time = 0; time <= duration + 0.0001; time += step) {
        html += `<span class="timeline3-ruler-tick" style="left:${time * timeline3Runtime.zoom}px"><i></i><b>${timeline3Escape(timeline3Format(time))}</b></span>`;
    }
    return html;
}

function timeline3SimpleVisualHtml() {
    const layout = timeline3SimpleLayout();
    if (!layout.length) return `<div class="timeline3-empty">${timeline3Escape(timeline3Text('timeline3NoMedia', 'No visual media'))}</div>`;
    return layout.map((item, index) => {
        const sourceId = item.clip.sourceId;
        const selected = timeline3Runtime.selectedType === 'clip' && timeline3Runtime.selectedId === item.clip.id;
        const left = item.start * timeline3Runtime.zoom;
        const width = Math.max(34, item.duration * timeline3Runtime.zoom);
        const range = `${timeline3Format(item.sourceIn)} – ${timeline3Format(item.sourceOut)}`;
        const boundary = index < layout.length - 1 ? `<button class="timeline3-boundary" type="button" data-timeline3-boundary="${timeline3Escape(item.clip.id)}" style="left:${(item.end * timeline3Runtime.zoom) - 13}px" aria-label="${timeline3Escape(timeline3Text('timeline3BoundaryAria', 'Clip boundary'))}"><span></span></button>` : '';
        return `<article class="timeline3-item timeline3-clip${selected ? ' is-selected' : ''}" data-timeline3-type="clip" data-timeline3-id="${timeline3Escape(item.clip.id)}" style="left:${left}px;width:${width}px;--track-hue:${timeline3VisualHue(sourceId)}">
            <button class="timeline3-trim timeline3-trim-start" data-timeline3-trim="start" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimStart', 'Trim clip start'))}"></button>
            <div class="timeline3-item-copy"><strong>${timeline3Escape(timeline3SourceName(sourceId))}</strong><small>${timeline3Escape(range)}</small></div>
            <button class="timeline3-trim timeline3-trim-end" data-timeline3-trim="end" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimEnd', 'Trim clip end'))}"></button>
        </article>${boundary}`;
    }).join('');
}

function timeline3AdvancedVisualHtml() {
    const layout = timeline3AdvancedLayout();
    if (!layout.length) return `<div class="timeline3-empty">${timeline3Escape(timeline3Text('timeline3NoParts', 'No Parts'))}</div>`;
    return layout.map(item => {
        const part = item.part;
        const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
        const selected = timeline3Runtime.selectedType === 'part' && timeline3Runtime.selectedId === part.id;
        const repeat = part.repeat === 0 ? '∞' : `${Math.max(1, Number(part.repeat) || 1)}×`;
        return `<article class="timeline3-item timeline3-clip${selected ? ' is-selected' : ''}" data-timeline3-type="part" data-timeline3-id="${timeline3Escape(part.id)}" style="left:${item.start * timeline3Runtime.zoom}px;width:${Math.max(34, item.duration * timeline3Runtime.zoom)}px;--track-hue:${timeline3VisualHue(sourceId)}">
            <button class="timeline3-trim timeline3-trim-start" data-timeline3-trim="start" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimStart', 'Trim clip start'))}"></button>
            <div class="timeline3-item-copy"><strong>${timeline3Escape(part.label || part.folder || timeline3Text('timeline3Part', 'Part'))}</strong><small>${timeline3Escape(timeline3SourceName(sourceId))} · ${timeline3Escape(repeat)}</small></div>
            <button class="timeline3-trim timeline3-trim-end" data-timeline3-trim="end" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimEnd', 'Trim clip end'))}"></button>
        </article>`;
    }).join('');
}

function timeline3AudioSegments() {
    if (timeline3IsAdvanced()) {
        return timeline3AdvancedLayout().filter(item => item.part.audio && item.part.audio.mode !== 'none').map(item => ({ id: item.part.id, start: item.start, end: item.end, label: item.part.audio.sourceName || timeline3Text('timeline3PartAudio', 'Part audio') }));
    }
    if (!document.getElementById('input-usar-som')?.checked) return [];
    const duration = timeline3Duration();
    const points = {
        m0: Math.max(0, Number(marcadores.m0) || 0),
        m1: Math.max(0, Number(marcadores.m1) || 0),
        m2: Math.max(0, Number(marcadores.m2) || 0),
        m3: Number.isFinite(Number(marcadores.m3)) ? Math.max(0, Number(marcadores.m3)) : duration
    };
    const definitions = [
        ['intro', points.m0, points.m1],
        ['loop', points.m1, points.m2],
        ['final', points.m2, points.m3]
    ];
    return definitions.filter(([role, start, end]) => end > start && document.getElementById(`sel-audio-${role}`)?.value !== 'none').map(([role, start, end]) => ({ id: role, start, end, label: timeline3Text(`timeline3Audio${role[0].toUpperCase()}${role.slice(1)}`, role === 'final' ? 'Outro audio' : `${role[0].toUpperCase()}${role.slice(1)} audio`) }));
}

function timeline3AudioHtml() {
    const segments = timeline3AudioSegments();
    if (!segments.length) return `<div class="timeline3-empty timeline3-empty-inline">${timeline3Escape(timeline3Text('timeline3NoAudio', 'No active audio'))}</div>`;
    return segments.map(segment => {
        const selected = timeline3Runtime.selectedType === 'audio' && timeline3Runtime.selectedId === segment.id;
        return `<article class="timeline3-item timeline3-audio${selected ? ' is-selected' : ''}" data-timeline3-type="audio" data-timeline3-id="${timeline3Escape(segment.id)}" style="left:${segment.start * timeline3Runtime.zoom}px;width:${Math.max(30, (segment.end - segment.start) * timeline3Runtime.zoom)}px"><div class="timeline3-wave"></div><strong>${timeline3Escape(segment.label)}</strong></article>`;
    }).join('');
}

function timeline3CompositionRows() {
    const layers = currentProject && Array.isArray(currentProject.compositionLayers) ? currentProject.compositionLayers : [];
    const duration = timeline3Duration();
    return layers.map((layer, index) => {
        const start = Math.max(0, Math.min(duration, Number(layer.start) || 0));
        const end = Math.max(start, Math.min(duration, Number(layer.end) || duration));
        const selected = timeline3Runtime.selectedType === 'layer' && timeline3Runtime.selectedId === layer.id;
        const label = layer.name || (layer.type === 'image' ? timeline3Text('timeline3ImageLayer', 'Image') : timeline3Text('timeline3TextLayer', 'Text'));
        return `<div class="timeline3-track timeline3-layer-track" data-timeline3-layer-row="${timeline3Escape(layer.id)}"><div class="timeline3-track-label"><span>${layer.type === 'image' ? 'IMG' : 'TXT'}</span><strong>${timeline3Escape(label)}</strong></div><div class="timeline3-track-lane" style="width:${timeline3TrackWidth()}px"><article class="timeline3-item timeline3-layer${selected ? ' is-selected' : ''}" data-timeline3-type="layer" data-timeline3-id="${timeline3Escape(layer.id)}" style="left:${start * timeline3Runtime.zoom}px;width:${Math.max(28, (end - start) * timeline3Runtime.zoom)}px"><strong>${timeline3Escape(label)}</strong><small>${timeline3Escape(timeline3Format(end - start))}</small></article></div></div>`;
    }).join('');
}

function timeline3Render() {
    const shell = document.getElementById('timeline3-shell');
    const ruler = document.getElementById('timeline3-ruler');
    const tracks = document.getElementById('timeline3-tracks');
    const zoom = document.getElementById('timeline3-zoom');
    const summary = document.getElementById('timeline3-summary');
    if (!shell || !ruler || !tracks) return;
    document.getElementById('timeline-editor')?.classList.add('timeline3-active');
    const width = timeline3TrackWidth();
    ruler.style.width = `${width}px`;
    ruler.innerHTML = timeline3RulerHtml();
    const visual = timeline3IsAdvanced() ? timeline3AdvancedVisualHtml() : timeline3SimpleVisualHtml();
    const visualLabel = timeline3IsAdvanced() ? timeline3Text('timeline3PartsTrack', 'Parts') : timeline3Text('timeline3MediaTrack', 'Media');
    tracks.innerHTML = `<div class="timeline3-track timeline3-main-track"><div class="timeline3-track-label"><span>V1</span><strong>${timeline3Escape(visualLabel)}</strong></div><div class="timeline3-track-lane" style="width:${width}px">${visual}</div></div>
        <div class="timeline3-track timeline3-audio-track"><div class="timeline3-track-label"><span>A1</span><strong>${timeline3Escape(timeline3Text('timeline3AudioTrack', 'Audio'))}</strong></div><div class="timeline3-track-lane" style="width:${width}px">${timeline3AudioHtml()}</div></div>${timeline3CompositionRows()}`;
    if (zoom) zoom.value = String(Math.round(timeline3Runtime.zoom));
    if (summary) summary.textContent = `${timeline3IsAdvanced() ? timeline3Text('timeline3AdvancedMode', 'Advanced Parts') : timeline3Text('timeline3SimpleMode', 'Master Sequence')} · ${timeline3Format(timeline3Duration())}`;
    timeline3UpdatePlayhead();
}

function timeline3UpdatePlayhead() {
    const playhead = document.getElementById('timeline3-playhead');
    if (!playhead) return;
    const time = typeof getTimelineCurrentTimeExact === 'function' && !timeline3IsAdvanced() ? getTimelineCurrentTimeExact() : 0;
    playhead.style.transform = `translateX(${Math.max(0, time) * timeline3Runtime.zoom}px)`;
}

function timeline3SetZoom(value, anchorClientX = null) {
    const scroll = document.getElementById('timeline3-scroll');
    const oldZoom = timeline3Runtime.zoom;
    const next = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, Number(value) || oldZoom));
    if (Math.abs(next - oldZoom) < 0.001) return;
    let anchorTime = 0;
    let anchorOffset = 0;
    if (scroll) {
        const rect = scroll.getBoundingClientRect();
        anchorOffset = anchorClientX == null ? scroll.clientWidth / 2 : anchorClientX - rect.left;
        anchorTime = (scroll.scrollLeft + anchorOffset) / oldZoom;
    }
    timeline3Runtime.zoom = next;
    timeline3Render();
    if (scroll) scroll.scrollLeft = Math.max(0, anchorTime * next - anchorOffset);
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
}

function timeline3Fit() {
    const scroll = document.getElementById('timeline3-scroll');
    const duration = timeline3Duration();
    if (!scroll || !(duration > 0)) return;
    timeline3SetZoom(Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, (scroll.clientWidth - 84) / duration)));
    scroll.scrollLeft = 0;
}

function timeline3Select(type, id, options = {}) {
    timeline3Runtime.selectedType = type;
    timeline3Runtime.selectedId = id;
    if (type === 'part' && currentProject) {
        currentProject.advancedExpandedId = id;
        if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    }
    if (type === 'layer' && window.BASComposition && typeof BASComposition.select === 'function') BASComposition.select(id);
    timeline3Render();
    if (options.seek !== false && type === 'clip') {
        const item = timeline3SimpleLayout().find(entry => entry.clip.id === id);
        if (item && window.BASMasterSequence && BASMasterSequence.isTimelineActive()) BASMasterSequence.seek(item.start, { scroll: false }).catch(() => {});
        else if (item && playerVideo) playerVideo.currentTime = Math.max(0, item.sourceIn || 0);
    }
}

function timeline3FindItem(type, id) {
    if (type === 'clip') return timeline3SimpleLayout().find(item => item.clip.id === id) || null;
    if (type === 'part') return timeline3AdvancedLayout().find(item => item.part.id === id) || null;
    return null;
}

function timeline3StartTrim(event, handle) {
    const item = handle.closest('[data-timeline3-type]');
    if (!item || !['clip', 'part'].includes(item.dataset.timeline3Type)) return;
    event.preventDefault();
    event.stopPropagation();
    const type = item.dataset.timeline3Type;
    const id = item.dataset.timeline3Id;
    const found = timeline3FindItem(type, id);
    if (!found) return;
    const edge = handle.dataset.timeline3Trim;
    const start = type === 'clip' ? found.sourceIn : found.part.start;
    const end = type === 'clip' ? found.sourceOut : found.part.end;
    timeline3Runtime.trim = { pointerId: event.pointerId, type, id, edge, startX: event.clientX, originalStart: start, originalEnd: end, changed: false };
    item.classList.add('is-trimming');
    handle.setPointerCapture?.(event.pointerId);
    timeline3Select(type, id, { seek: false });
}

function timeline3MoveTrim(event) {
    const state = timeline3Runtime.trim;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = (event.clientX - state.startX) / timeline3Runtime.zoom;
    let start = state.originalStart;
    let end = state.originalEnd;
    if (state.edge === 'start') start += delta;
    else end += delta;
    if (state.type === 'clip') {
        const found = timeline3FindItem('clip', state.id);
        if (!found || !window.BASMasterSequence) return;
        const sourceDuration = found.sourceDuration;
        const frame = 1 / Math.max(1, Number(found.source && found.source.fps) || Number(currentProject && currentProject.fps) || 30);
        start = Math.max(0, Math.min(end - frame, start));
        end = Math.min(sourceDuration, Math.max(start + frame, end));
        found.clip.in = start;
        found.clip.out = end;
    } else {
        const found = timeline3FindItem('part', state.id);
        if (!found) return;
        const sourceDuration = typeof getAdvancedSourceDuration === 'function' ? getAdvancedSourceDuration(found.part) : found.part.end;
        const frame = 1 / Math.max(1, Number(window.BASSourceLibrary && BASSourceLibrary.getById(BASSourceLibrary.getPartSourceId(found.part))?.fps) || Number(currentProject && currentProject.fps) || 30);
        start = Math.max(0, Math.min(end - frame, start));
        end = Math.min(sourceDuration, Math.max(start + frame, end));
        found.part.start = start;
        found.part.end = end;
    }
    state.changed = true;
    timeline3Render();
}

function timeline3FinishTrim(event, cancelled = false) {
    const state = timeline3Runtime.trim;
    if (!state || state.pointerId !== event.pointerId) return;
    timeline3Runtime.trim = null;
    if (cancelled) {
        const found = timeline3FindItem(state.type, state.id);
        if (found) {
            if (state.type === 'clip') {
                found.clip.in = state.originalStart;
                found.clip.out = state.originalEnd;
            } else {
                found.part.start = state.originalStart;
                found.part.end = state.originalEnd;
            }
        }
        timeline3Render();
        return;
    }
    if (!state.changed) return;
    if (state.type === 'clip' && window.BASMasterSequence) {
        const found = timeline3FindItem('clip', state.id);
        if (found) {
            const nextIn = found.clip.in;
            const nextOut = found.clip.out;
            found.clip.in = state.originalStart;
            found.clip.out = state.originalEnd;
            BASMasterSequence.setClipRange(state.id, nextIn, nextOut, { edge: state.edge });
        }
    } else {
        const found = timeline3FindItem('part', state.id);
        if (found && typeof normalizeAdvancedPartRange === 'function') normalizeAdvancedPartRange(found.part);
        if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
        if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    }
    timeline3Render();
}

function timeline3CloseMenu() {
    const menu = document.getElementById('timeline3-menu');
    if (menu) menu.hidden = true;
}

function timeline3OpenMenu(type, id, clientX, clientY) {
    const menu = document.getElementById('timeline3-menu');
    if (!menu) return;
    timeline3Select(type, id, { seek: false });
    const actions = [];
    if (type === 'clip') {
        actions.push(['preview', timeline3Text('timeline3ActionPreview', 'Preview from here')]);
        actions.push(['reset-trim', timeline3Text('timeline3ActionResetTrim', 'Reset trim')]);
        actions.push(['move-left', timeline3Text('timeline3ActionMoveLeft', 'Move left')]);
        actions.push(['move-right', timeline3Text('timeline3ActionMoveRight', 'Move right')]);
    } else if (type === 'part') {
        actions.push(['edit-part', timeline3Text('timeline3ActionEditPart', 'Edit Part')]);
        actions.push(['preview-part', timeline3Text('timeline3ActionPreviewPart', 'Preview source')]);
    } else if (type === 'layer') {
        actions.push(['edit-layer', timeline3Text('timeline3ActionEditLayer', 'Edit layer')]);
    } else if (type === 'audio') {
        actions.push(['edit-audio', timeline3Text('timeline3ActionEditAudio', 'Edit audio')]);
    }
    menu.dataset.timeline3Type = type;
    menu.dataset.timeline3Id = id;
    menu.innerHTML = actions.map(([action, label]) => `<button type="button" data-timeline3-action="${action}">${timeline3Escape(label)}</button>`).join('');
    menu.hidden = false;
    const shell = document.getElementById('timeline3-shell');
    const shellRect = shell?.getBoundingClientRect();
    if (shellRect) {
        menu.style.left = `${Math.max(8, Math.min(shellRect.width - 190, clientX - shellRect.left))}px`;
        menu.style.top = `${Math.max(52, clientY - shellRect.top)}px`;
    }
}

function timeline3RunAction(action, type, id) {
    timeline3CloseMenu();
    if (type === 'clip') {
        const item = timeline3SimpleLayout().find(entry => entry.clip.id === id);
        if (!item) return;
        if (action === 'preview' && window.BASMasterSequence && BASMasterSequence.isTimelineActive()) BASMasterSequence.seek(item.start, { scroll: false }).catch(() => {});
        else if (action === 'preview' && playerVideo) playerVideo.currentTime = Math.max(0, item.sourceIn || 0);
        if (action === 'reset-trim' && window.BASMasterSequence) BASMasterSequence.setClipRange(id, 0, item.sourceDuration);
        if (action === 'move-left' && window.BASMasterSequence) BASMasterSequence.moveClip(id, -1);
        if (action === 'move-right' && window.BASMasterSequence) BASMasterSequence.moveClip(id, 1);
    }
    if (type === 'part') {
        const part = typeof getAdvancedPartById === 'function' ? getAdvancedPartById(id) : null;
        if (action === 'edit-part') document.getElementById('advanced-parts-launch')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (action === 'preview-part' && part && window.BASSourceLibrary) BASSourceLibrary.preview(BASSourceLibrary.getPartSourceId(part));
    }
    if (type === 'layer' && action === 'edit-layer') document.getElementById('composition-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (type === 'audio' && action === 'edit-audio') document.getElementById('output-panel-audio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    timeline3Render();
}

function timeline3HandleBoundary() {
    if (typeof showToast === 'function') showToast(timeline3Text('timeline3BoundaryInfo', 'Boot animations use a hard cut between clips.'), 'info', 2600);
}

function timeline3SyncText() {
    const bindings = {
        'timeline3-kicker': timeline3Text('timeline3Kicker', 'TIMELINE 3.0'),
        'timeline3-title': timeline3Text('timeline3Title', 'Tracks that match the final animation'),
        'timeline3-desc': timeline3Text('timeline3Desc', 'Select clips, trim edges, zoom with two fingers and hold an item for editing actions.'),
        'timeline3-fit-label': timeline3Text('timeline3Fit', 'Fit')
    };
    Object.entries(bindings).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
    const out = document.getElementById('timeline3-zoom-out');
    const input = document.getElementById('timeline3-zoom');
    const inside = document.getElementById('timeline3-zoom-in');
    const fit = document.getElementById('timeline3-fit');
    if (out) out.setAttribute('aria-label', timeline3Text('timeline3ZoomOut', 'Zoom out'));
    if (input) input.setAttribute('aria-label', timeline3Text('timeline3Zoom', 'Timeline zoom'));
    if (inside) inside.setAttribute('aria-label', timeline3Text('timeline3ZoomIn', 'Zoom in'));
    if (fit) fit.setAttribute('aria-label', timeline3Text('timeline3FitAria', 'Fit timeline to view'));
    timeline3Render();
}


function timeline3GetUiState() {
    return {
        zoom: timeline3Runtime.zoom,
        selectedType: timeline3Runtime.selectedType,
        selectedId: timeline3Runtime.selectedId
    };
}

function timeline3RestoreUiState(state = {}) {
    timeline3Runtime.zoom = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, Number(state.zoom) || timeline3Runtime.zoom));
    timeline3Runtime.selectedType = String(state.selectedType || '');
    timeline3Runtime.selectedId = String(state.selectedId || '');
    timeline3Render();
}

function bindTimeline3() {
    if (timeline3Runtime.initialized) return;
    timeline3Runtime.initialized = true;
    document.getElementById('timeline3-zoom-out')?.addEventListener('click', () => timeline3SetZoom(timeline3Runtime.zoom - 16));
    document.getElementById('timeline3-zoom-in')?.addEventListener('click', () => timeline3SetZoom(timeline3Runtime.zoom + 16));
    document.getElementById('timeline3-fit')?.addEventListener('click', timeline3Fit);
    document.getElementById('timeline3-zoom')?.addEventListener('input', event => timeline3SetZoom(event.target.value));
    const tracks = document.getElementById('timeline3-tracks');
    tracks?.addEventListener('click', event => {
        if (event.target.closest('[data-timeline3-trim]')) return;
        const boundary = event.target.closest('[data-timeline3-boundary]');
        if (boundary) {
            timeline3HandleBoundary();
            return;
        }
        const item = event.target.closest('[data-timeline3-type][data-timeline3-id]');
        if (item) timeline3Select(item.dataset.timeline3Type, item.dataset.timeline3Id);
    });
    tracks?.addEventListener('pointerdown', event => {
        const trim = event.target.closest('[data-timeline3-trim]');
        if (trim) {
            timeline3StartTrim(event, trim);
            return;
        }
        const item = event.target.closest('[data-timeline3-type][data-timeline3-id]');
        if (!item) return;
        timeline3Runtime.pressStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, type: item.dataset.timeline3Type, id: item.dataset.timeline3Id };
        clearTimeout(timeline3Runtime.pressTimer);
        timeline3Runtime.pressTimer = setTimeout(() => {
            const state = timeline3Runtime.pressStart;
            if (state && state.pointerId === event.pointerId) timeline3OpenMenu(state.type, state.id, state.x, state.y);
            timeline3Runtime.pressStart = null;
        }, 480);
    });
    tracks?.addEventListener('pointermove', event => {
        if (timeline3Runtime.trim) {
            timeline3MoveTrim(event);
            return;
        }
        const state = timeline3Runtime.pressStart;
        if (state && state.pointerId === event.pointerId && Math.hypot(event.clientX - state.x, event.clientY - state.y) > 8) {
            clearTimeout(timeline3Runtime.pressTimer);
            timeline3Runtime.pressStart = null;
        }
    });
    tracks?.addEventListener('pointerup', event => {
        clearTimeout(timeline3Runtime.pressTimer);
        timeline3Runtime.pressStart = null;
        if (timeline3Runtime.trim) timeline3FinishTrim(event, false);
    });
    tracks?.addEventListener('pointercancel', event => {
        clearTimeout(timeline3Runtime.pressTimer);
        timeline3Runtime.pressStart = null;
        if (timeline3Runtime.trim) timeline3FinishTrim(event, true);
    });
    document.getElementById('timeline3-menu')?.addEventListener('click', event => {
        const button = event.target.closest('[data-timeline3-action]');
        const menu = document.getElementById('timeline3-menu');
        if (button && menu) timeline3RunAction(button.dataset.timeline3Action, menu.dataset.timeline3Type, menu.dataset.timeline3Id);
    });
    const scroll = document.getElementById('timeline3-scroll');
    scroll?.addEventListener('pointerdown', event => {
        timeline3Runtime.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (timeline3Runtime.pointers.size === 2) {
            const points = [...timeline3Runtime.pointers.values()];
            timeline3Runtime.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            timeline3Runtime.pinchZoom = timeline3Runtime.zoom;
        }
    });
    scroll?.addEventListener('pointermove', event => {
        if (!timeline3Runtime.pointers.has(event.pointerId)) return;
        timeline3Runtime.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (timeline3Runtime.pointers.size !== 2 || !(timeline3Runtime.pinchDistance > 0)) return;
        const points = [...timeline3Runtime.pointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const centerX = (points[0].x + points[1].x) / 2;
        timeline3SetZoom(timeline3Runtime.pinchZoom * distance / timeline3Runtime.pinchDistance, centerX);
    });
    const clearPointer = event => {
        timeline3Runtime.pointers.delete(event.pointerId);
        if (timeline3Runtime.pointers.size < 2) timeline3Runtime.pinchDistance = 0;
    };
    scroll?.addEventListener('pointerup', clearPointer);
    scroll?.addEventListener('pointercancel', clearPointer);
    document.addEventListener('click', event => {
        const menu = document.getElementById('timeline3-menu');
        if (menu && !menu.hidden && !event.target.closest('#timeline3-menu') && !event.target.closest('[data-timeline3-type]')) timeline3CloseMenu();
    });
    window.addEventListener('bas:projectchange', () => timeline3Render());
    playerVideo?.addEventListener('timeupdate', timeline3UpdatePlayhead);
    window.addEventListener('resize', () => timeline3Render(), { passive: true });
    timeline3SyncText();
}

window.BASTimeline3 = Object.freeze({
    render: timeline3Render,
    syncText: timeline3SyncText,
    setZoom: timeline3SetZoom,
    fit: timeline3Fit,
    getUiState: timeline3GetUiState,
    restoreUiState: timeline3RestoreUiState
});
window.syncTimeline3Text = timeline3SyncText;
window.renderTimeline3 = timeline3Render;
window.addEventListener('DOMContentLoaded', bindTimeline3);
