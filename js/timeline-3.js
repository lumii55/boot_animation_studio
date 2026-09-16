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
    pinchZoom: 84,
    zoomUserSet: false
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
    const filmstrip = document.getElementById('filmstrip');
    const measured = filmstrip ? filmstrip.offsetWidth : 0;
    if (measured > 0) return measured;
    return Math.max(320, Math.ceil(timeline3Duration() * timeline3Runtime.zoom));
}

function timeline3Percent(time) {
    const duration = timeline3Duration();
    if (!(duration > 0)) return 0;
    return Math.max(0, Math.min(100, (Math.max(0, Number(time) || 0) / duration) * 100));
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

function timeline3MarkerHtml() {
    const duration = timeline3Duration();
    if (!(duration > 0) || typeof marcadores !== 'object' || !marcadores) return '';
    return ['m0', 'm1', 'm2', 'm3'].map((id, index) => {
        const raw = marcadores[id];
        if (raw === null || raw === undefined || raw === '') return '';
        const value = Number(raw);
        if (!Number.isFinite(value)) return '';
        const time = Math.max(0, Math.min(duration, value));
        return `<span class="timeline3-marker-line timeline3-marker-${id}" data-marker-label="${index + 1}" style="left:${timeline3Percent(time)}%"></span>`;
    }).join('');
}

function timeline3GetLayer(id) {
    const layers = currentProject && Array.isArray(currentProject.compositionLayers) ? currentProject.compositionLayers : [];
    return layers.find(layer => layer.id === id) || null;
}

function timeline3SeekFromLane(event, lane) {
    if (!lane || typeof seekTimelineTo !== 'function') return;
    const duration = timeline3Duration();
    if (!(duration > 0)) return;
    const rect = lane.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    const time = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration));
    seekTimelineTo(time);
}

function timeline3SimpleVisualHtml() {
    const layout = timeline3SimpleLayout();
    if (!layout.length) return `<div class="timeline3-empty">${timeline3Escape(timeline3Text('timeline3NoMedia', 'No visual media'))}</div>`;
    return layout.map((item, index) => {
        const sourceId = item.clip.sourceId;
        const selected = timeline3Runtime.selectedType === 'clip' && timeline3Runtime.selectedId === item.clip.id;
        const left = timeline3Percent(item.start);
        const width = Math.max(0.8, timeline3Percent(item.end) - left);
        const range = `${timeline3Format(item.sourceIn)} – ${timeline3Format(item.sourceOut)}`;
        const boundary = index < layout.length - 1 ? `<button class="timeline3-boundary" type="button" data-timeline3-boundary="${timeline3Escape(item.clip.id)}" style="left:calc(${timeline3Percent(item.end)}% - 13px)" aria-label="${timeline3Escape(timeline3Text('timeline3BoundaryAria', 'Clip boundary'))}"><span></span></button>` : '';
        return `<article class="timeline3-item timeline3-clip${selected ? ' is-selected' : ''}" data-timeline3-type="clip" data-timeline3-id="${timeline3Escape(item.clip.id)}" style="left:${left}%;width:${width}%;--track-hue:${timeline3VisualHue(sourceId)}">
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
        return `<article class="timeline3-item timeline3-clip${selected ? ' is-selected' : ''}" data-timeline3-type="part" data-timeline3-id="${timeline3Escape(part.id)}" style="left:${timeline3Percent(item.start)}%;width:${Math.max(0.8, timeline3Percent(item.end) - timeline3Percent(item.start))}%;--track-hue:${timeline3VisualHue(sourceId)}">
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

function timeline3AudioHtml(segments = timeline3AudioSegments()) {
    return segments.map(segment => {
        const selected = timeline3Runtime.selectedType === 'audio' && timeline3Runtime.selectedId === segment.id;
        const left = timeline3Percent(segment.start);
        const width = Math.max(0.8, timeline3Percent(segment.end) - left);
        return `<article class="timeline3-item timeline3-audio${selected ? ' is-selected' : ''}" data-timeline3-type="audio" data-timeline3-id="${timeline3Escape(segment.id)}" style="left:${left}%;width:${width}%"><div class="timeline3-wave"></div><strong>${timeline3Escape(segment.label)}</strong></article>`;
    }).join('');
}

function timeline3CompositionRows() {
    const layers = currentProject && Array.isArray(currentProject.compositionLayers) ? currentProject.compositionLayers : [];
    const duration = timeline3Duration();
    return layers.map(layer => {
        const start = Math.max(0, Math.min(duration, Number(layer.start) || 0));
        const end = Math.max(start, Math.min(duration, Number(layer.end) || duration));
        const selected = timeline3Runtime.selectedType === 'layer' && timeline3Runtime.selectedId === layer.id;
        const label = layer.name || (layer.type === 'image' ? timeline3Text('timeline3ImageLayer', 'Image') : timeline3Text('timeline3TextLayer', 'Text'));
        const left = timeline3Percent(start);
        const width = Math.max(0.8, timeline3Percent(end) - left);
        const type = layer.type === 'image' ? 'IMG' : 'TXT';
        return `<div class="timeline3-track timeline3-layer-track" data-timeline3-layer-row="${timeline3Escape(layer.id)}"><div class="timeline3-track-lane">${timeline3MarkerHtml()}<span class="timeline3-track-chip">${type} · ${timeline3Escape(label)}</span><article class="timeline3-item timeline3-layer${selected ? ' is-selected' : ''}" data-timeline3-type="layer" data-timeline3-id="${timeline3Escape(layer.id)}" style="left:${left}%;width:${width}%"><button class="timeline3-trim timeline3-trim-start" data-timeline3-trim="start" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimLayerStart', 'Trim layer start'))}"></button><strong>${timeline3Escape(label)}</strong><small>${timeline3Escape(timeline3Format(end - start))}</small><button class="timeline3-trim timeline3-trim-end" data-timeline3-trim="end" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimLayerEnd', 'Trim layer end'))}"></button></article></div></div>`;
    }).join('');
}

function timeline3AdvancedTrackHtml() {
    if (!timeline3IsAdvanced()) return '';
    const visual = timeline3AdvancedVisualHtml();
    return `<div class="timeline3-track timeline3-main-track"><div class="timeline3-track-lane">${timeline3MarkerHtml()}<span class="timeline3-track-chip">V1 · ${timeline3Escape(timeline3Text('timeline3PartsTrack', 'Parts'))}</span>${visual}</div></div>`;
}

function timeline3AudioTrackHtml() {
    const segments = timeline3AudioSegments();
    if (!segments.length) return '';
    return `<div class="timeline3-track timeline3-audio-track"><div class="timeline3-track-lane">${timeline3MarkerHtml()}<span class="timeline3-track-chip">A1 · ${timeline3Escape(timeline3Text('timeline3AudioTrack', 'Audio'))}</span>${timeline3AudioHtml(segments)}</div></div>`;
}

function timeline3MediaOverlayHtml() {
    if (timeline3IsAdvanced()) return '';
    const layout = timeline3SimpleLayout();
    if (!layout.length) return '';
    let html = '';
    layout.forEach((item, index) => {
        const left = timeline3Percent(item.start);
        const width = Math.max(0.2, timeline3Percent(item.end) - left);
        const selected = timeline3Runtime.selectedType === 'clip' && timeline3Runtime.selectedId === item.clip.id;
        if (selected) {
            html += `<div class="timeline3-media-clip is-selected" data-timeline3-type="clip" data-timeline3-id="${timeline3Escape(item.clip.id)}" style="left:${left}%;width:${width}%"><button class="timeline3-trim timeline3-trim-start" data-timeline3-trim="start" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimStart', 'Trim clip start'))}"></button><button class="timeline3-trim timeline3-trim-end" data-timeline3-trim="end" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimEnd', 'Trim clip end'))}"></button></div>`;
        }
        if (index < layout.length - 1) html += `<button class="timeline3-media-boundary" type="button" data-timeline3-boundary="${timeline3Escape(item.clip.id)}" style="left:${timeline3Percent(item.end)}%" aria-label="${timeline3Escape(timeline3Text('timeline3BoundaryAria', 'Clip boundary'))}"></button>`;
    });
    return html;
}

function timeline3Render() {
    const tracks = document.getElementById('timeline3-tracks');
    const overlay = document.getElementById('timeline3-media-overlay');
    const stack = document.getElementById('timeline-integrated-stack');
    const wrapper = document.getElementById('timeline-wrapper');
    const filmstrip = document.getElementById('filmstrip');
    const zoom = document.getElementById('timeline3-zoom');
    if (!tracks || !overlay || !stack || !wrapper || !filmstrip) return;
    document.getElementById('timeline-editor')?.classList.add('timeline3-active');
    const duration = timeline3Duration();
    if (!timeline3Runtime.zoomUserSet && duration > 0 && filmstrip.offsetWidth > 0) {
        timeline3Runtime.zoom = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, filmstrip.offsetWidth / duration));
    }
    overlay.innerHTML = timeline3MediaOverlayHtml();
    const rows = [];
    const advanced = timeline3AdvancedTrackHtml();
    const audio = timeline3AudioTrackHtml();
    const layers = timeline3CompositionRows();
    if (advanced) rows.push(advanced);
    if (audio) rows.push(audio);
    if (layers) rows.push(layers);
    tracks.innerHTML = rows.join('');
    const rowCount = tracks.querySelectorAll(':scope > .timeline3-track').length;
    tracks.hidden = rowCount === 0;
    wrapper.style.setProperty('--timeline-extra-height', `${rowCount * 52}px`);
    const width = Math.max(1, filmstrip.offsetWidth);
    stack.style.width = `${width}px`;
    tracks.style.width = `${width}px`;
    if (zoom) zoom.value = String(Math.round(timeline3Runtime.zoom));
}

function timeline3ApplyZoom() {
    const filmstrip = document.getElementById('filmstrip');
    const stack = document.getElementById('timeline-integrated-stack');
    const duration = timeline3Duration();
    if (!filmstrip || !stack || !(duration > 0)) return;
    const width = Math.max(160, Math.round(duration * timeline3Runtime.zoom));
    const masterBlocks = Array.from(filmstrip.querySelectorAll('.master-filmstrip-clip'));
    if (masterBlocks.length) {
        const layout = timeline3SimpleLayout();
        masterBlocks.forEach((block, index) => {
            const item = layout[index];
            if (!item) return;
            const itemWidth = Math.max(1, item.duration * timeline3Runtime.zoom);
            block.style.width = `${itemWidth}px`;
            block.style.flexBasis = `${itemWidth}px`;
        });
    } else {
        const frames = Array.from(filmstrip.querySelectorAll('img'));
        if (frames.length) {
            const frameWidth = width / frames.length;
            frames.forEach(frame => {
                frame.style.width = `${frameWidth}px`;
                frame.style.flexBasis = `${frameWidth}px`;
            });
        }
    }
    filmstrip.style.width = `${width}px`;
    stack.style.width = `${width}px`;
    if (typeof renderTimelineRuler === 'function') renderTimelineRuler();
    if (typeof atualizarBotoesELinhas === 'function') atualizarBotoesELinhas();
}

function timeline3SetZoom(value, anchorClientX = null) {
    const scroll = document.getElementById('timeline-scroll');
    const oldWidth = document.getElementById('filmstrip')?.offsetWidth || 0;
    const oldZoom = timeline3Runtime.zoom;
    const next = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, Number(value) || oldZoom));
    if (Math.abs(next - oldZoom) < 0.001) return;
    let anchorRatio = 0;
    let anchorOffset = 0;
    if (scroll && oldWidth > 0) {
        const rect = scroll.getBoundingClientRect();
        anchorOffset = anchorClientX == null ? scroll.clientWidth / 2 : anchorClientX - rect.left;
        anchorRatio = Math.max(0, Math.min(1, (scroll.scrollLeft + anchorOffset) / oldWidth));
    }
    timeline3Runtime.zoom = next;
    timeline3Runtime.zoomUserSet = true;
    timeline3ApplyZoom();
    timeline3Render();
    const newWidth = document.getElementById('filmstrip')?.offsetWidth || 0;
    if (scroll && newWidth > 0) scroll.scrollLeft = Math.max(0, anchorRatio * newWidth - anchorOffset);
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
}

function timeline3Fit() {
    const scroll = document.getElementById('timeline-scroll');
    const duration = timeline3Duration();
    if (!scroll || !(duration > 0)) return;
    timeline3SetZoom(Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, scroll.clientWidth / duration)));
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
    if (type === 'layer') return timeline3GetLayer(id);
    return null;
}

function timeline3StartTrim(event, handle) {
    const item = handle.closest('[data-timeline3-type]');
    if (!item || !['clip', 'part', 'layer'].includes(item.dataset.timeline3Type)) return;
    event.preventDefault();
    event.stopPropagation();
    const type = item.dataset.timeline3Type;
    const id = item.dataset.timeline3Id;
    const found = type === 'layer' ? timeline3GetLayer(id) : timeline3FindItem(type, id);
    if (!found) return;
    const edge = handle.dataset.timeline3Trim;
    const start = type === 'clip' ? found.sourceIn : type === 'part' ? found.part.start : found.start;
    const end = type === 'clip' ? found.sourceOut : type === 'part' ? found.part.end : found.end;
    const lane = item.closest('.timeline3-track-lane, .timeline3-media-overlay');
    const duration = timeline3Duration();
    const secondsPerPixel = lane && lane.clientWidth > 0 && duration > 0 ? duration / lane.clientWidth : 1 / Math.max(1, timeline3Runtime.zoom);
    timeline3Runtime.trim = { pointerId: event.pointerId, type, id, edge, startX: event.clientX, originalStart: start, originalEnd: end, secondsPerPixel, changed: false };
    item.classList.add('is-trimming');
    handle.setPointerCapture?.(event.pointerId);
    timeline3Select(type, id, { seek: false });
}

function timeline3MoveTrim(event) {
    const state = timeline3Runtime.trim;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = (event.clientX - state.startX) * state.secondsPerPixel;
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
    } else if (state.type === 'part') {
        const found = timeline3FindItem('part', state.id);
        if (!found) return;
        const sourceDuration = typeof getAdvancedSourceDuration === 'function' ? getAdvancedSourceDuration(found.part) : found.part.end;
        const frame = 1 / Math.max(1, Number(window.BASSourceLibrary && BASSourceLibrary.getById(BASSourceLibrary.getPartSourceId(found.part))?.fps) || Number(currentProject && currentProject.fps) || 30);
        start = Math.max(0, Math.min(end - frame, start));
        end = Math.min(sourceDuration, Math.max(start + frame, end));
        found.part.start = start;
        found.part.end = end;
    } else {
        const layer = timeline3GetLayer(state.id);
        if (!layer) return;
        const duration = timeline3Duration();
        const frame = 1 / Math.max(1, Number(currentProject && currentProject.fps) || 30);
        start = Math.max(0, Math.min(end - frame, start));
        end = Math.min(duration, Math.max(start + frame, end));
        layer.start = start;
        layer.end = end;
        if (window.BASComposition) {
            BASComposition.render();
            BASComposition.renderPreview();
        }
    }
    state.changed = true;
    timeline3Render();
}

function timeline3FinishTrim(event, cancelled = false) {
    const state = timeline3Runtime.trim;
    if (!state || state.pointerId !== event.pointerId) return;
    timeline3Runtime.trim = null;
    if (cancelled) {
        const found = state.type === 'layer' ? timeline3GetLayer(state.id) : timeline3FindItem(state.type, state.id);
        if (found) {
            if (state.type === 'clip') {
                found.clip.in = state.originalStart;
                found.clip.out = state.originalEnd;
            } else if (state.type === 'part') {
                found.part.start = state.originalStart;
                found.part.end = state.originalEnd;
            }
            else {
                found.start = state.originalStart;
                found.end = state.originalEnd;
                if (window.BASComposition) { BASComposition.render(); BASComposition.renderPreview(); }
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
    } else if (state.type === 'part') {
        const found = timeline3FindItem('part', state.id);
        if (found && typeof normalizeAdvancedPartRange === 'function') normalizeAdvancedPartRange(found.part);
        if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
        if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    } else {
        const layer = timeline3GetLayer(state.id);
        if (layer) {
            if (window.BASComposition) { BASComposition.render(); BASComposition.renderPreview(); }
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('composition', { changeKey: `composition:${state.id}:timing` });
        }
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
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 190, clientX))}px`;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 220, clientY))}px`;
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
    const fitLabel = document.getElementById('timeline3-fit-label');
    if (fitLabel) fitLabel.textContent = timeline3Text('timeline3Fit', 'Fit');
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
        selectedId: timeline3Runtime.selectedId,
        zoomUserSet: timeline3Runtime.zoomUserSet
    };
}

function timeline3RestoreUiState(state = {}) {
    timeline3Runtime.zoom = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, Number(state.zoom) || timeline3Runtime.zoom));
    timeline3Runtime.selectedType = String(state.selectedType || '');
    timeline3Runtime.selectedId = String(state.selectedId || '');
    timeline3Runtime.zoomUserSet = state.zoomUserSet === true;
    if (timeline3Runtime.zoomUserSet) timeline3ApplyZoom();
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
    const overlay = document.getElementById('timeline3-media-overlay');
    const filmstrip = document.getElementById('filmstrip');
    overlay?.addEventListener('click', event => {
        const boundary = event.target.closest('[data-timeline3-boundary]');
        if (boundary) {
            event.preventDefault();
            event.stopPropagation();
            timeline3HandleBoundary();
        }
    });
    overlay?.addEventListener('pointerdown', event => {
        const trim = event.target.closest('[data-timeline3-trim]');
        if (trim) timeline3StartTrim(event, trim);
    });
    overlay?.addEventListener('pointermove', event => {
        if (timeline3Runtime.trim) timeline3MoveTrim(event);
    });
    overlay?.addEventListener('pointerup', event => {
        if (timeline3Runtime.trim) timeline3FinishTrim(event, false);
    });
    overlay?.addEventListener('pointercancel', event => {
        if (timeline3Runtime.trim) timeline3FinishTrim(event, true);
    });
    filmstrip?.addEventListener('click', event => {
        const block = event.target.closest('.master-filmstrip-clip');
        if (block?.dataset.masterClipId) timeline3Select('clip', block.dataset.masterClipId, { seek: false });
    });
    filmstrip?.addEventListener('pointerdown', event => {
        if (timeline3IsAdvanced() || event.pointerType === 'mouse' && event.button !== 0) return;
        const layout = timeline3SimpleLayout();
        const rect = filmstrip.getBoundingClientRect();
        const duration = timeline3Duration();
        if (!layout.length || !(rect.width > 0) || !(duration > 0)) return;
        const time = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration));
        const found = layout.find(item => time >= item.start && time <= item.end + 0.0001) || layout[layout.length - 1];
        if (!found) return;
        timeline3Runtime.pressStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, type: 'clip', id: found.clip.id };
        clearTimeout(timeline3Runtime.pressTimer);
        timeline3Runtime.pressTimer = setTimeout(() => {
            const state = timeline3Runtime.pressStart;
            if (state && state.pointerId === event.pointerId) timeline3OpenMenu('clip', state.id, state.x, state.y);
            timeline3Runtime.pressStart = null;
        }, 480);
    });
    filmstrip?.addEventListener('pointermove', event => {
        const state = timeline3Runtime.pressStart;
        if (state && state.pointerId === event.pointerId && state.type === 'clip' && Math.hypot(event.clientX - state.x, event.clientY - state.y) > 8) {
            clearTimeout(timeline3Runtime.pressTimer);
            timeline3Runtime.pressStart = null;
        }
    });
    const clearFilmstripPress = event => {
        const state = timeline3Runtime.pressStart;
        if (state && state.pointerId === event.pointerId && state.type === 'clip') {
            clearTimeout(timeline3Runtime.pressTimer);
            timeline3Runtime.pressStart = null;
        }
    };
    filmstrip?.addEventListener('pointerup', clearFilmstripPress);
    filmstrip?.addEventListener('pointercancel', clearFilmstripPress);
    tracks?.addEventListener('click', event => {
        if (event.target.closest('[data-timeline3-trim]')) return;
        const boundary = event.target.closest('[data-timeline3-boundary]');
        if (boundary) {
            timeline3HandleBoundary();
            return;
        }
        const item = event.target.closest('[data-timeline3-type][data-timeline3-id]');
        if (item) timeline3Select(item.dataset.timeline3Type, item.dataset.timeline3Id);
        else {
            const lane = event.target.closest('.timeline3-track-lane');
            if (lane) timeline3SeekFromLane(event, lane);
        }
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
    const scroll = document.getElementById('timeline-scroll');
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
