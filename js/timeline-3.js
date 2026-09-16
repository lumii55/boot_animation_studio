const timeline3Runtime = {
    initialized: false,
    projectRef: null,
    zoom: 88,
    minZoom: 36,
    maxZoom: 220,
    gutter: 86,
    currentTime: 0,
    selectedKey: '',
    items: new Map(),
    renderTimer: 0,
    playFrame: 0,
    trim: null,
    hold: null,
    pinch: null,
    reorder: null,
    scrub: null,
    itemDrag: null,
    suppressClickUntil: 0,
    restoreSimpleAfterAdvanced: false,
    lastAdvancedActive: false,
    thumbnailCache: new Map(),
    thumbnailGeneration: 0,
    thumbnailBuild: null,
    thumbnailLayoutSignature: '',
    seekGeneration: 0
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

function timeline3AdvancedActive() {
    return typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive();
}

function timeline3AdvancedLayout() {
    const parts = typeof getAdvancedParts === 'function' ? getAdvancedParts() : [];
    let cursor = 0;
    return parts.map((part, index) => {
        const duration = Math.max(0.001, Number(part.end) - Number(part.start));
        const start = cursor;
        cursor += duration;
        const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
        const source = window.BASSourceLibrary ? BASSourceLibrary.getPartSource(part) : null;
        return { key: `visual:advanced:${part.id}`, kind: 'visual-advanced', id: part.id, index, start, end: cursor, duration, part, sourceId, source };
    });
}

function timeline3SimpleLayout() {
    if (!currentProject) return [];
    if (window.BASMasterSequence && Array.isArray(currentProject.masterSequence) && currentProject.masterSequence.length) {
        const serialized = BASMasterSequence.serialize();
        let cursor = 0;
        return serialized.clips.map((clip, index) => {
            const source = window.BASSourceLibrary ? BASSourceLibrary.getById(clip.sourceId) : null;
            const duration = window.BASSourceLibrary ? Math.max(0.001, Number(BASSourceLibrary.getDuration(clip.sourceId)) || 0.001) : Math.max(0.001, Number(currentProject.sourceDuration) || 0.001);
            const start = cursor;
            cursor += duration;
            return { key: `visual:simple:${clip.id}`, kind: 'visual-simple', id: clip.id, index, start, end: cursor, duration, clip, sourceId: clip.sourceId, source };
        });
    }
    const primaryId = window.BASSourceLibrary ? BASSourceLibrary.getPrimaryId() : '';
    const source = window.BASSourceLibrary ? BASSourceLibrary.getById(primaryId) : null;
    const duration = Math.max(0.001, Number(currentProject.sourceDuration) || (typeof timelineTimeToProjectTime === 'function' ? timelineTimeToProjectTime(playerVideo.duration || 0) : playerVideo.duration || 0.001));
    return [{ key: 'visual:simple:primary', kind: 'visual-simple', id: 'primary', index: 0, start: 0, end: duration, duration, clip: null, sourceId: primaryId, source }];
}

function timeline3VisualLayout() {
    return timeline3AdvancedActive() ? timeline3AdvancedLayout() : timeline3SimpleLayout();
}

function timeline3Duration() {
    const layout = timeline3VisualLayout();
    return layout.length ? layout[layout.length - 1].end : 0;
}

function timeline3CurrentSimpleTime() {
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return Math.max(0, Number(BASMasterSequence.getCurrentTime()) || 0);
    const preview = Math.max(0, Number(playerVideo && playerVideo.currentTime) || 0);
    return typeof timelineTimeToProjectTime === 'function' ? Math.max(0, Number(timelineTimeToProjectTime(preview)) || 0) : preview;
}

function timeline3CurrentTime() {
    if (timeline3Runtime.scrub && Number.isFinite(timeline3Runtime.scrub.previewTime)) return Math.max(0, Math.min(timeline3Duration(), timeline3Runtime.scrub.previewTime));
    if (timeline3AdvancedActive()) return Math.max(0, Math.min(timeline3Duration(), Number(timeline3Runtime.currentTime) || 0));
    return Math.max(0, Math.min(timeline3Duration(), timeline3CurrentSimpleTime()));
}

function timeline3LocateAdvanced(time) {
    const layout = timeline3AdvancedLayout();
    if (!layout.length) return null;
    const safe = Math.max(0, Math.min(layout[layout.length - 1].end, Number(time) || 0));
    return layout.find((item, index) => safe < item.end || index === layout.length - 1) || layout[layout.length - 1];
}

async function timeline3SeekAdvanced(time, options = {}) {
    const located = timeline3LocateAdvanced(time);
    if (!located) return false;
    const safe = Math.max(located.start, Math.min(located.end, Number(time) || 0));
    const generation = Number(options.generation) || timeline3Runtime.seekGeneration;
    const part = located.part;
    currentProject.advancedExpandedId = part.id;
    if (typeof renderAdvancedPartsEditor === 'function' && options.renderPart !== false) renderAdvancedPartsEditor();
    const sourceTime = Math.max(Number(part.start) || 0, Math.min(Number(part.end) || 0, Number(part.start) + (safe - located.start)));
    if (window.BASSourceLibrary && located.sourceId) {
        await BASSourceLibrary.setVideoElementSource(playerVideo, located.sourceId);
        if (generation !== timeline3Runtime.seekGeneration) return false;
        const previewTime = BASSourceLibrary.sourceTimeToPreview(located.sourceId, sourceTime, playerVideo);
        playerVideo.pause();
        playerVideo.currentTime = Math.max(0, Math.min(playerVideo.duration || previewTime, previewTime));
    } else if (playerVideo) {
        if (generation !== timeline3Runtime.seekGeneration) return false;
        playerVideo.pause();
        playerVideo.currentTime = typeof projectTimeToTimelineTime === 'function' ? projectTimeToTimelineTime(sourceTime) : sourceTime;
    }
    if (generation !== timeline3Runtime.seekGeneration) return false;
    timeline3Runtime.currentTime = safe;
    if (window.BASComposition && typeof BASComposition.renderPreview === 'function') BASComposition.renderPreview();
    timeline3UpdatePlayhead({ follow: options.follow });
    return true;
}

async function timeline3Seek(time, options = {}) {
    const duration = timeline3Duration();
    if (!(duration > 0)) return false;
    const safe = Math.max(0, Math.min(duration, Number(time) || 0));
    const generation = ++timeline3Runtime.seekGeneration;
    if (timeline3AdvancedActive()) return await timeline3SeekAdvanced(safe, { ...options, generation });
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) {
        const ready = await BASMasterSequence.seek(safe, { scroll: false });
        if (!ready || generation !== timeline3Runtime.seekGeneration) return false;
    } else {
        playerVideo.pause();
        const previewTime = typeof projectTimeToTimelineTime === 'function' ? projectTimeToTimelineTime(safe) : safe;
        playerVideo.currentTime = Math.max(0, Math.min(playerVideo.duration || previewTime, previewTime));
        if (generation !== timeline3Runtime.seekGeneration) return false;
    }
    timeline3Runtime.currentTime = safe;
    timeline3UpdatePlayhead({ follow: options.follow });
    return true;
}

function timeline3FormatTime(value) {
    const safe = Math.max(0, Number(value) || 0);
    const fixed = safe < 10 ? safe.toFixed(2) : safe.toFixed(1);
    return `${['pt', 'es', 'fr'].includes(idiomaAtual) ? fixed.replace('.', ',') : fixed}s`;
}

function timeline3X(time) {
    return timeline3Runtime.gutter + Math.max(0, Number(time) || 0) * timeline3Runtime.zoom;
}

function timeline3Width(duration) {
    return Math.max(18, Math.max(0.001, Number(duration) || 0.001) * timeline3Runtime.zoom);
}

function timeline3SourceHue(sourceId, index = 0) {
    let hash = 0;
    for (const char of String(sourceId || index || 'source')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % 360;
}

function timeline3VisualSignature(layout = timeline3VisualLayout()) {
    return layout.map(item => {
        const source = item.source || {};
        return [item.key, item.sourceId || '', Number(item.start) || 0, Number(item.end) || 0, Number(item.duration) || 0, source.size || 0, source.lastModified || 0, source.name || ''].join(':');
    }).join('|');
}

function timeline3ClearThumbnailCache() {
    timeline3Runtime.thumbnailGeneration += 1;
    timeline3Runtime.thumbnailBuild = null;
    timeline3Runtime.thumbnailCache.forEach(url => URL.revokeObjectURL(url));
    timeline3Runtime.thumbnailCache.clear();
}

function timeline3ThumbnailCount(item, totalDuration) {
    if (item.source && item.source.kind === 'image') return 1;
    const total = Math.max(0.001, Number(totalDuration) || 0.001);
    const target = Math.max(12, Math.min(64, Math.ceil(total * (total < 5 ? 5 : total < 10 ? 3 : total < 20 ? 2 : 1))));
    const proportional = Math.round(target * (Math.max(0.001, item.duration) / total));
    return Math.max(2, Math.min(18, proportional || 2));
}

function timeline3ThumbnailSourceTime(item, index, count) {
    const fraction = Math.max(0, Math.min(1, (index + 0.5) / Math.max(1, count)));
    if (item.kind === 'visual-advanced' && item.part) {
        const start = Math.max(0, Number(item.part.start) || 0);
        const end = Math.max(start, Number(item.part.end) || start);
        return start + (end - start) * fraction;
    }
    const duration = window.BASSourceLibrary && item.sourceId
        ? Math.max(0.001, Number(BASSourceLibrary.getDuration(item.sourceId)) || item.duration || 0.001)
        : Math.max(0.001, Number(item.duration) || 0.001);
    return duration * fraction;
}

function timeline3ThumbnailKey(item, sourceTime) {
    const projectId = currentProject && currentProject.projectMeta && currentProject.projectMeta.id ? currentProject.projectMeta.id : 'project';
    const source = item.source || {};
    const stamp = `${source.size || 0}:${source.lastModified || 0}:${source.name || ''}`;
    return `${projectId}|${item.sourceId || 'primary'}|${stamp}|${Math.round(Math.max(0, sourceTime) * 1000)}`;
}

function timeline3ThumbnailCells(item, totalDuration) {
    const count = timeline3ThumbnailCount(item, totalDuration);
    const cells = [];
    for (let index = 0; index < count; index++) {
        const sourceTime = timeline3ThumbnailSourceTime(item, index, count);
        const cacheKey = timeline3ThumbnailKey(item, sourceTime);
        cells.push(`<span class="timeline3-thumb-cell${timeline3Runtime.thumbnailCache.has(cacheKey) ? ' is-ready' : ''}" data-timeline3-thumb-key="${timeline3Escape(cacheKey)}"${timeline3Runtime.thumbnailCache.has(cacheKey) ? ` style="background-image:url('${timeline3Escape(timeline3Runtime.thumbnailCache.get(cacheKey))}')"` : ''}></span>`);
    }
    return `<div class="timeline3-thumbnail-strip" aria-hidden="true">${cells.join('')}</div>`;
}

function timeline3ApplyThumbnail(cacheKey, url) {
    document.querySelectorAll('[data-timeline3-thumb-key]').forEach(cell => {
        if (cell.dataset.timeline3ThumbKey !== cacheKey) return;
        cell.style.backgroundImage = `url("${url}")`;
        cell.classList.add('is-ready');
    });
}

async function timeline3CreateThumbnail(item, sourceTime) {
    if (!window.BASSourceLibrary || typeof BASSourceLibrary.frameBlob !== 'function' || !item.sourceId) return null;
    const blob = await BASSourceLibrary.frameBlob(item.sourceId, sourceTime, 120, 72, 'jpeg', 'cover', { x: 0.5, y: 0.5, zoom: 1 }, 0.62);
    if (!(blob instanceof Blob)) return null;
    return URL.createObjectURL(blob);
}

async function timeline3RefreshFrames(options = {}) {
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) return false;
    if (timeline3Runtime.projectRef !== currentProject) {
        timeline3ClearThumbnailCache();
        timeline3Runtime.projectRef = currentProject;
    }
    if (isGenerating) return false;
    const layout = timeline3VisualLayout();
    if (!layout.length) return false;
    const totalDuration = Math.max(0.001, timeline3Duration());
    const jobs = [];
    layout.forEach(item => {
        const count = timeline3ThumbnailCount(item, totalDuration);
        for (let index = 0; index < count; index++) {
            const sourceTime = timeline3ThumbnailSourceTime(item, index, count);
            const cacheKey = timeline3ThumbnailKey(item, sourceTime);
            if (!options.force && timeline3Runtime.thumbnailCache.has(cacheKey)) {
                timeline3ApplyThumbnail(cacheKey, timeline3Runtime.thumbnailCache.get(cacheKey));
                continue;
            }
            jobs.push({ item, sourceTime, cacheKey });
        }
    });
    if (!jobs.length) return true;
    if (timeline3Runtime.thumbnailBuild && !options.force) return timeline3Runtime.thumbnailBuild;
    const generation = ++timeline3Runtime.thumbnailGeneration;
    const overlay = document.getElementById('loading-overlay');
    const loading = document.getElementById('txt-loading-timeline');
    const ownsOverlay = !!options.showLoading && overlay && overlay.style.display !== 'flex';
    if (ownsOverlay) {
        if (typeof setLoadingTipContext === 'function') setLoadingTipContext('timeline');
        overlay.style.display = 'flex';
    }
    const build = (async () => {
        for (let index = 0; index < jobs.length; index++) {
            if (generation !== timeline3Runtime.thumbnailGeneration) return false;
            const job = jobs[index];
            if (loading && (options.showLoading || overlay && overlay.style.display === 'flex')) {
                loading.textContent = timeline3Text('timeline3LoadingFrames', 'Building timeline frames {current}/{total}...').replace('{current}', String(index + 1)).replace('{total}', String(jobs.length));
            }
            try {
                const previous = timeline3Runtime.thumbnailCache.get(job.cacheKey);
                if (previous && options.force) URL.revokeObjectURL(previous);
                const url = await timeline3CreateThumbnail(job.item, job.sourceTime);
                if (generation !== timeline3Runtime.thumbnailGeneration) {
                    if (url) URL.revokeObjectURL(url);
                    return false;
                }
                if (url) {
                    timeline3Runtime.thumbnailCache.set(job.cacheKey, url);
                    timeline3ApplyThumbnail(job.cacheKey, url);
                }
            } catch (error) {
                const cell = Array.from(document.querySelectorAll('[data-timeline3-thumb-key]')).find(element => element.dataset.timeline3ThumbKey === job.cacheKey);
                if (cell) cell.classList.add('is-error');
            }
            if (index % 3 === 2 && typeof cooperativeYield === 'function') await cooperativeYield();
        }
        return true;
    })();
    timeline3Runtime.thumbnailBuild = build;
    try {
        return await build;
    } finally {
        if (timeline3Runtime.thumbnailBuild === build) timeline3Runtime.thumbnailBuild = null;
        if (ownsOverlay && overlay) overlay.style.display = 'none';
    }
}

function timeline3RulerStep() {
    const zoom = timeline3Runtime.zoom;
    if (zoom >= 180) return 0.5;
    if (zoom >= 110) return 1;
    if (zoom >= 70) return 2;
    if (zoom >= 46) return 5;
    return 10;
}

function timeline3RenderRuler() {
    const ruler = document.getElementById('timeline3-ruler');
    if (!ruler) return;
    const duration = timeline3Duration();
    const step = timeline3RulerStep();
    const ticks = [];
    for (let time = 0; time <= duration + step * 0.25; time += step) {
        const major = Math.abs((time / step) % 5) < 0.0001;
        ticks.push(`<span class="timeline3-tick${major ? ' is-major' : ''}" style="left:${timeline3X(time)}px"><i></i><b>${timeline3Escape(timeline3FormatTime(time))}</b></span>`);
    }
    ruler.innerHTML = `<span class="timeline3-ruler-label">${timeline3Escape(timeline3Text('timeline3Time', 'TIME'))}</span>${ticks.join('')}`;
}

function timeline3MarkerTimes() {
    if (timeline3AdvancedActive()) return [];
    const master = !!(window.BASMasterSequence && BASMasterSequence.isTimelineActive());
    return ['m0', 'm1', 'm2', 'm3'].map((key, index) => {
        const raw = marcadores[key];
        if (!Number.isFinite(raw)) return null;
        const time = master ? raw : typeof timelineTimeToProjectTime === 'function' ? timelineTimeToProjectTime(raw) : raw;
        return { key, index, time: Math.max(0, Number(time) || 0) };
    }).filter(Boolean);
}

function timeline3VisualLane() {
    const layout = timeline3VisualLayout();
    const advanced = timeline3AdvancedActive();
    const totalDuration = Math.max(0.001, timeline3Duration());
    const items = layout.map(item => {
        timeline3Runtime.items.set(item.key, item);
        const sourceName = item.source && item.source.name ? item.source.name : advanced ? (item.part.label || item.part.folder || `Part ${item.index + 1}`) : timeline3Text('timeline3Primary', 'Primary source');
        const title = advanced ? (item.part.label || item.part.folder || sourceName) : sourceName;
        const subtitle = advanced ? `${sourceName} · ${item.part.type === 'p' ? 'p' : 'c'}` : timeline3FormatTime(item.duration);
        const hue = timeline3SourceHue(item.sourceId, item.index);
        const badges = advanced ? `<span class="timeline3-badge">${item.part.type === 'p' ? 'p' : 'c'}</span>${item.part.repeat === 0 ? '<span class="timeline3-badge">∞</span>' : item.part.repeat > 1 ? `<span class="timeline3-badge">${item.part.repeat}×</span>` : ''}` : '';
        const handles = advanced ? `<button class="timeline3-trim timeline3-trim-start" data-timeline3-trim="start" data-timeline3-key="${timeline3Escape(item.key)}" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimStart', 'Trim start'))}"></button><button class="timeline3-trim timeline3-trim-end" data-timeline3-trim="end" data-timeline3-key="${timeline3Escape(item.key)}" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimEnd', 'Trim end'))}"></button>` : '';
        const reorder = layout.length > 1 ? `<button class="timeline3-reorder-grip" data-timeline3-reorder="${timeline3Escape(item.key)}" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3Reorder', 'Reorder clip'))}"><span></span><span></span><span></span></button>` : '';
        return `<article class="timeline3-item timeline3-visual-item${timeline3Runtime.selectedKey === item.key ? ' is-selected' : ''}" data-timeline3-key="${timeline3Escape(item.key)}" style="left:${timeline3X(item.start)}px;width:${timeline3Width(item.duration)}px;--track-hue:${hue}">${timeline3ThumbnailCells(item, totalDuration)}${handles}${reorder}<div class="timeline3-item-copy"><strong>${timeline3Escape(title)}</strong><small>${timeline3Escape(subtitle)}</small></div><div class="timeline3-item-badges">${badges}</div></article>`;
    }).join('');
    return `<div class="timeline3-lane timeline3-lane-visual"><div class="timeline3-lane-label"><span class="timeline3-lane-icon">V</span><strong>${timeline3Escape(timeline3Text('timeline3Visual', 'Frames'))}</strong></div><div class="timeline3-lane-body">${items || `<span class="timeline3-empty-lane">${timeline3Escape(timeline3Text('timeline3NoVisual', 'No visual source'))}</span>`}</div></div>`;
}

function timeline3LayerLanes() {
    if (!window.BASComposition) return '';
    const layers = BASComposition.getLayers();
    return layers.map((layer, index) => {
        const key = `layer:${layer.id}`;
        const item = { key, kind: 'layer', id: layer.id, index, start: Number(layer.start) || 0, end: Number(layer.end) || 0, duration: Math.max(0.001, Number(layer.end) - Number(layer.start)), layer };
        timeline3Runtime.items.set(key, item);
        const type = layer.type === 'image' ? timeline3Text('timeline3Image', 'Image') : timeline3Text('timeline3Text', 'Text');
        return `<div class="timeline3-lane timeline3-lane-layer${layer.visible === false ? ' is-muted' : ''}"><div class="timeline3-lane-label"><span class="timeline3-lane-icon">${layer.type === 'image' ? 'I' : 'T'}</span><strong>${timeline3Escape(layer.name || `${timeline3Text('timeline3Layer', 'Layer')} ${index + 1}`)}</strong></div><div class="timeline3-lane-body"><article class="timeline3-item timeline3-layer-item is-timeline-draggable${timeline3Runtime.selectedKey === key ? ' is-selected' : ''}" data-timeline3-key="${timeline3Escape(key)}" style="left:${timeline3X(item.start)}px;width:${timeline3Width(item.duration)}px"><button class="timeline3-trim timeline3-trim-start" data-timeline3-trim="start" data-timeline3-key="${timeline3Escape(key)}" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimStart', 'Trim start'))}"></button><button class="timeline3-trim timeline3-trim-end" data-timeline3-trim="end" data-timeline3-key="${timeline3Escape(key)}" type="button" aria-label="${timeline3Escape(timeline3Text('timeline3TrimEnd', 'Trim end'))}"></button><div class="timeline3-item-copy"><strong>${timeline3Escape(layer.name || type)}</strong><small>${timeline3Escape(type)} · ${timeline3Escape(timeline3FormatTime(item.duration))}</small></div></article></div></div>`;
    }).join('');
}

function timeline3SimpleAudioItems() {
    if (typeof captureAudioEditorState !== 'function') return [];
    const state = captureAudioEditorState();
    if (!state.enabled) return [];
    const master = !!(window.BASMasterSequence && BASMasterSequence.isTimelineActive());
    const marker = key => {
        const raw = marcadores[key];
        if (!Number.isFinite(raw)) return null;
        return master ? Number(raw) : typeof timelineTimeToProjectTime === 'function' ? timelineTimeToProjectTime(raw) : Number(raw);
    };
    const ranges = [
        ['intro', marker('m0'), marker('m1')],
        ['loop', marker('m1'), marker('m2')],
        ['final', marker('m2'), marker('m3')]
    ];
    return ranges.flatMap(([role, baseStart, baseEnd]) => {
        const roleState = state[role];
        if (!roleState || roleState.mode === 'none' || !Number.isFinite(baseStart) || !Number.isFinite(baseEnd) || baseEnd <= baseStart) return [];
        const maxOffset = Math.max(0, Math.min(5, baseEnd - baseStart - 0.02));
        const offset = Math.max(0, Math.min(maxOffset, Number(roleState.offset) || 0));
        const start = baseStart + offset;
        const end = baseEnd;
        return [{ key: `audio:simple:${role}`, kind: 'audio-simple', id: role, role, start, end, duration: Math.max(0.02, end - start), baseStart, baseEnd, maxOffset, state: roleState }];
    });
}

function timeline3AdvancedAudioItems() {
    return timeline3AdvancedLayout().flatMap(item => {
        const audio = item.part && item.part.audio;
        if (!audio || !audio.mode || audio.mode === 'none') return [];
        const maxOffset = Math.max(0, Math.min(5, item.duration - 0.02));
        const offset = Math.max(0, Math.min(maxOffset, Number(audio.offset) || 0));
        const start = item.start + offset;
        const end = item.end;
        return [{ key: `audio:advanced:${item.part.id}`, kind: 'audio-advanced', id: item.part.id, part: item.part, start, end, duration: Math.max(0.02, end - start), baseStart: item.start, baseEnd: item.end, maxOffset, state: audio }];
    });
}

function timeline3AudioLanes() {
    const items = timeline3AdvancedActive() ? timeline3AdvancedAudioItems() : timeline3SimpleAudioItems();
    if (!items.length) return '';
    return items.map((item, index) => {
        timeline3Runtime.items.set(item.key, item);
        const label = item.kind === 'audio-simple'
            ? timeline3Text(item.role === 'intro' ? 'timeline3AudioIntro' : item.role === 'loop' ? 'timeline3AudioLoop' : 'timeline3AudioOutro', item.role === 'intro' ? 'Intro audio' : item.role === 'loop' ? 'Loop audio' : 'Outro audio')
            : item.part.label || item.part.folder || `${timeline3Text('timeline3Part', 'Part')} ${index + 1}`;
        const mode = item.state.mode === 'video' ? timeline3Text('timeline3VideoAudio', 'Video audio') : timeline3Text('timeline3FileAudio', 'Audio file');
        const offset = Math.max(0, Number(item.state.offset) || 0);
        const timing = offset > 0.005 ? `${timeline3FormatTime(item.duration)} · +${timeline3FormatTime(offset)}` : timeline3FormatTime(item.duration);
        return `<div class="timeline3-lane timeline3-lane-audio"><div class="timeline3-lane-label"><span class="timeline3-lane-icon">A</span><strong>${timeline3Escape(label)}</strong></div><div class="timeline3-lane-body"><article class="timeline3-item timeline3-audio-item is-timeline-draggable${timeline3Runtime.selectedKey === item.key ? ' is-selected' : ''}" data-timeline3-key="${timeline3Escape(item.key)}" style="left:${timeline3X(item.start)}px;width:${timeline3Width(item.duration)}px"><span class="timeline3-wave" aria-hidden="true"></span><div class="timeline3-item-copy"><strong>${timeline3Escape(label)}</strong><small>${timeline3Escape(mode)} · ${timeline3Escape(timing)}</small></div></article></div></div>`;
    }).join('');
}

function timeline3RenderMarkers() {
    return timeline3MarkerTimes().map(marker => `<span class="timeline3-marker timeline3-marker-${marker.key}" style="left:${timeline3X(marker.time)}px"><i></i><b>${marker.index + 1}</b></span>`).join('');
}

function timeline3RestoreSimplePreview() {
    if (!currentProject || !playerVideo) return;
    const duration = timeline3Duration();
    const target = Math.max(0, Math.min(duration, Number(timeline3Runtime.currentTime) || 0));
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) {
        BASMasterSequence.seek(target, { scroll: false }).catch(() => {});
        return;
    }
    const primaryId = window.BASSourceLibrary ? BASSourceLibrary.getPrimaryId() : '';
    if (window.BASSourceLibrary && primaryId) {
        BASSourceLibrary.setVideoElementSource(playerVideo, primaryId).then(() => {
            const previewTime = BASSourceLibrary.sourceTimeToPreview(primaryId, target, playerVideo);
            playerVideo.pause();
            playerVideo.currentTime = Math.max(0, Math.min(playerVideo.duration || previewTime, previewTime));
            if (window.BASComposition && typeof BASComposition.renderPreview === 'function') BASComposition.renderPreview();
        }).catch(() => {});
        return;
    }
    playerVideo.pause();
    const previewTime = typeof projectTimeToTimelineTime === 'function' ? projectTimeToTimelineTime(target) : target;
    playerVideo.currentTime = Math.max(0, Math.min(playerVideo.duration || previewTime, previewTime));
}

function timeline3Render() {
    const shell = document.getElementById('timeline3-shell');
    const content = document.getElementById('timeline3-content');
    const lanes = document.getElementById('timeline3-lanes');
    const summary = document.getElementById('timeline3-summary');
    const mode = document.getElementById('timeline3-mode');
    if (!shell || !content || !lanes) return;
    const advanced = timeline3AdvancedActive();
    if (timeline3Runtime.lastAdvancedActive && !advanced) timeline3RestoreSimplePreview();
    timeline3Runtime.lastAdvancedActive = advanced;
    const hasProject = !!(currentProject && currentProject.sourceBlob);
    shell.classList.toggle('is-empty', !hasProject);
    if (timeline3Runtime.projectRef !== currentProject) {
        timeline3ClearThumbnailCache();
        timeline3Runtime.thumbnailLayoutSignature = '';
        timeline3Runtime.projectRef = currentProject;
    }
    timeline3Runtime.items.clear();
    const visualLayout = timeline3VisualLayout();
    const visualSignature = timeline3VisualSignature(visualLayout);
    if (timeline3Runtime.thumbnailLayoutSignature !== visualSignature) {
        timeline3ClearThumbnailCache();
        timeline3Runtime.thumbnailLayoutSignature = visualSignature;
    }
    const duration = timeline3Duration();
    const width = Math.max(320, timeline3X(duration) + 72);
    content.style.width = `${width}px`;
    content.style.setProperty('--timeline3-gutter', `${timeline3Runtime.gutter}px`);
    timeline3RenderRuler();
    lanes.innerHTML = `${timeline3VisualLane()}${timeline3LayerLanes()}${timeline3AudioLanes()}${timeline3RenderMarkers()}`;
    if (mode) mode.textContent = advanced ? timeline3Text('timeline3AdvancedMode', 'Advanced Parts') : timeline3Text('timeline3SimpleMode', 'Simple sequence');
    if (summary) {
        const layerCount = window.BASComposition ? BASComposition.getLayers().length : 0;
        const audioCount = advanced ? timeline3AdvancedAudioItems().length : timeline3SimpleAudioItems().length;
        summary.textContent = `${timeline3FormatTime(duration)} · ${timeline3Text('timeline3LayerCount', '{count} layers').replace('{count}', String(layerCount))} · ${timeline3Text('timeline3AudioCount', '{count} audio').replace('{count}', String(audioCount))}`;
    }
    const zoom = document.getElementById('timeline3-zoom');
    if (zoom) zoom.value = String(Math.round(timeline3Runtime.zoom));
    timeline3UpdatePlayhead();
    timeline3SyncTransport();
    timeline3RefreshFrames({ showLoading: false }).catch(() => {});
}

function timeline3ScheduleRender(delay = 20) {
    clearTimeout(timeline3Runtime.renderTimer);
    timeline3Runtime.renderTimer = setTimeout(() => {
        timeline3Runtime.renderTimer = 0;
        timeline3Render();
    }, delay);
}

function timeline3UpdatePlayhead(options = {}) {
    const playhead = document.getElementById('timeline3-playhead');
    const scroll = document.getElementById('timeline3-scroll');
    if (!playhead || !scroll) return;
    const time = timeline3CurrentTime();
    if (!timeline3AdvancedActive()) timeline3Runtime.currentTime = time;
    const x = timeline3X(time);
    playhead.style.left = `${x}px`;
    const currentEl = document.getElementById('video-current-time');
    const totalEl = document.getElementById('video-total-time');
    const readout = document.getElementById('video-time-readout');
    if (currentEl) currentEl.textContent = timeline3FormatTime(time);
    if (totalEl) totalEl.textContent = timeline3FormatTime(timeline3Duration());
    if (readout && timeline3Duration() > 0) readout.style.display = 'flex';
    if (options.follow) {
        const left = scroll.scrollLeft;
        const right = left + scroll.clientWidth;
        const margin = Math.min(140, scroll.clientWidth * 0.28);
        if (x < left + margin || x > right - margin) scroll.scrollTo({ left: Math.max(0, x - scroll.clientWidth * 0.45), behavior: options.smooth ? 'smooth' : 'auto' });
    }
}

function timeline3SyncTransport() {
    const ready = timeline3Duration() > 0;
    const play = document.getElementById('timeline3-play');
    const start = document.getElementById('timeline3-start');
    const end = document.getElementById('timeline3-end');
    const icon = document.getElementById('timeline3-play-icon');
    const label = document.getElementById('timeline3-play-label');
    const advanced = timeline3AdvancedActive();
    const playing = !advanced && (window.BASMasterSequence && BASMasterSequence.isTimelineActive() ? BASMasterSequence.isPlaying() : !playerVideo.paused);
    if (play) play.disabled = !ready;
    if (start) start.disabled = !ready;
    if (end) end.disabled = !ready;
    if (icon) icon.textContent = playing ? 'Ⅱ' : '▶';
    if (label) label.textContent = advanced ? timeline3Text('timeline3Preview', 'Preview') : playing ? timeline3Text('timeline3Pause', 'Pause') : timeline3Text('timeline3Play', 'Play');
}

function timeline3Fit(options = {}) {
    const scroll = document.getElementById('timeline3-scroll');
    const duration = timeline3Duration();
    if (!scroll || !(duration > 0)) return;
    const available = Math.max(180, scroll.clientWidth - timeline3Runtime.gutter - 38);
    const zoom = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, available / duration));
    timeline3SetZoom(zoom, options);
    scroll.scrollLeft = 0;
}

function timeline3SetZoom(value, options = {}) {
    const scroll = document.getElementById('timeline3-scroll');
    const oldZoom = timeline3Runtime.zoom;
    const next = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, Number(value) || oldZoom));
    if (!scroll || Math.abs(next - oldZoom) < 0.01) return;
    const focusX = Number.isFinite(options.focusX) ? options.focusX : scroll.clientWidth / 2;
    const focusTime = Number.isFinite(options.focusTime) ? options.focusTime : Math.max(0, (scroll.scrollLeft + focusX - timeline3Runtime.gutter) / oldZoom);
    timeline3Runtime.zoom = next;
    timeline3Render();
    scroll.scrollLeft = Math.max(0, timeline3X(focusTime) - focusX);
    if (!options.silent && typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
}

function timeline3GetUiState() {
    const scroll = document.getElementById('timeline3-scroll');
    return { zoom: Math.round(timeline3Runtime.zoom), scrollLeft: Math.max(0, Number(scroll && scroll.scrollLeft) || 0), currentTime: timeline3CurrentTime() };
}

function timeline3RestoreUiState(state = {}) {
    const zoom = Number(state.zoom);
    if (Number.isFinite(zoom)) timeline3Runtime.zoom = Math.max(timeline3Runtime.minZoom, Math.min(timeline3Runtime.maxZoom, zoom));
    const current = Number(state.currentTime);
    if (Number.isFinite(current)) timeline3Runtime.currentTime = Math.max(0, current);
    timeline3Render();
    const scroll = document.getElementById('timeline3-scroll');
    if (scroll && Number.isFinite(Number(state.scrollLeft))) requestAnimationFrame(() => { scroll.scrollLeft = Math.max(0, Number(state.scrollLeft) || 0); });
}

function timeline3OpenContext(key) {
    const item = timeline3Runtime.items.get(key);
    const panel = document.getElementById('timeline3-context');
    const title = document.getElementById('timeline3-context-title');
    const kind = document.getElementById('timeline3-context-kind');
    const actions = document.getElementById('timeline3-context-actions');
    if (!item || !panel || !title || !kind || !actions) return;
    timeline3Runtime.selectedKey = key;
    let itemTitle = '';
    let itemKind = '';
    const buttons = [];
    const add = (action, label, tone = '') => buttons.push(`<button type="button" data-timeline3-action="${timeline3Escape(action)}" data-timeline3-key="${timeline3Escape(key)}"${tone ? ` class="${tone}"` : ''}>${timeline3Escape(label)}</button>`);
    if (item.kind === 'visual-simple') {
        itemTitle = item.source && item.source.name ? item.source.name : timeline3Text('timeline3Primary', 'Primary source');
        itemKind = timeline3Text('timeline3Visual', 'Frames');
        add('seek-start', timeline3Text('timeline3GoStart', 'Go to start'));
        if (item.sourceId && window.BASSourceLibrary) add('preview-source', timeline3Text('timeline3PreviewSource', 'Preview source'));
        if (item.clip) {
            if (item.index > 0) add('move-left', timeline3Text('timeline3MoveLeft', 'Move earlier'));
            if (item.index < timeline3VisualLayout().length - 1) add('move-right', timeline3Text('timeline3MoveRight', 'Move later'));
        }
    } else if (item.kind === 'visual-advanced') {
        itemTitle = item.part.label || item.part.folder || timeline3Text('timeline3Part', 'Part');
        itemKind = timeline3Text('timeline3AdvancedPart', 'Advanced Part');
        add('edit-part', timeline3Text('timeline3EditPart', 'Edit Part'));
        add('preview-part', timeline3Text('timeline3PreviewPart', 'Preview Part'));
        add('duplicate-part', timeline3Text('timeline3Duplicate', 'Duplicate'));
    } else if (item.kind === 'layer') {
        itemTitle = item.layer.name || timeline3Text('timeline3Layer', 'Layer');
        itemKind = item.layer.type === 'image' ? timeline3Text('timeline3Image', 'Image') : timeline3Text('timeline3Text', 'Text');
        add('edit-layer', timeline3Text('timeline3EditLayer', 'Edit layer'));
        add('toggle-layer', item.layer.visible === false ? timeline3Text('timeline3ShowLayer', 'Show layer') : timeline3Text('timeline3HideLayer', 'Hide layer'));
        add('delete-layer', timeline3Text('timeline3DeleteLayer', 'Delete layer'), 'is-danger');
    } else if (item.kind === 'audio-simple') {
        itemTitle = timeline3Text(item.role === 'intro' ? 'timeline3AudioIntro' : item.role === 'loop' ? 'timeline3AudioLoop' : 'timeline3AudioOutro', item.role);
        itemKind = timeline3Text('timeline3Audio', 'Audio');
        add('edit-audio', timeline3Text('timeline3EditAudio', 'Edit audio'));
        add('disable-audio', timeline3Text('timeline3DisableAudio', 'Disable this audio'), 'is-danger');
    } else if (item.kind === 'audio-advanced') {
        itemTitle = item.part.label || item.part.folder || timeline3Text('timeline3Part', 'Part');
        itemKind = timeline3Text('timeline3Audio', 'Audio');
        add('edit-part-audio', timeline3Text('timeline3EditPartAudio', 'Edit Part audio'));
    }
    title.textContent = itemTitle;
    kind.textContent = itemKind.toUpperCase();
    actions.innerHTML = buttons.join('');
    panel.hidden = false;
    timeline3Render();
}

function timeline3CloseContext() {
    const panel = document.getElementById('timeline3-context');
    if (panel) panel.hidden = true;
}

async function timeline3RunAction(action, key) {
    const item = timeline3Runtime.items.get(key);
    if (!item) return;
    if (action === 'seek-start') await timeline3Seek(item.start, { follow: true });
    else if (action === 'preview-source' && window.BASSourceLibrary && item.sourceId) await BASSourceLibrary.preview(item.sourceId);
    else if (action === 'move-left' && window.BASMasterSequence && item.clip) BASMasterSequence.moveClip(item.clip.id, -1);
    else if (action === 'move-right' && window.BASMasterSequence && item.clip) BASMasterSequence.moveClip(item.clip.id, 1);
    else if (action === 'edit-part' && item.part) {
        currentProject.advancedExpandedId = item.part.id;
        if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
        document.getElementById('advanced-parts-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'preview-part' && item.part && typeof previewAdvancedPartSource === 'function') await previewAdvancedPartSource(item.part);
    else if (action === 'duplicate-part' && item.part && typeof duplicateAdvancedPart === 'function') duplicateAdvancedPart(item.part.id);
    else if (action === 'edit-layer' && item.layer) {
        const button = document.querySelector(`[data-composition-select="${CSS.escape(item.layer.id)}"]`);
        if (button) button.click();
        document.getElementById('composition-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'toggle-layer' && item.layer) {
        item.layer.visible = item.layer.visible === false;
        if (window.BASComposition) {
            BASComposition.render();
            BASComposition.renderPreview();
        }
        if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('composition', { changeKey: `composition:${item.layer.id}:visible`, immediate: true });
    } else if (action === 'delete-layer' && item.layer && typeof deleteCompositionLayer === 'function') deleteCompositionLayer(item.layer.id);
    else if (action === 'edit-audio' && item.role) {
        if (typeof setAudioRole === 'function') setAudioRole(item.role);
        document.getElementById('output-panel-audio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'disable-audio' && item.role) {
        const select = document.getElementById(`sel-audio-${item.role}`);
        if (select) {
            select.value = 'none';
            if (typeof handleAudioSelect === 'function') handleAudioSelect(item.role);
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('audio', { changeKey: `audio:${item.role}`, immediate: true });
        }
    } else if (action === 'edit-part-audio' && item.part) {
        currentProject.advancedExpandedId = item.part.id;
        if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
        document.getElementById('advanced-parts-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    timeline3CloseContext();
    timeline3ScheduleRender(0);
}

function timeline3StartReorder(event, grip) {
    const key = grip.dataset.timeline3Reorder;
    const item = timeline3Runtime.items.get(key);
    if (!item || !['visual-simple', 'visual-advanced'].includes(item.kind)) return;
    event.preventDefault();
    event.stopPropagation();
    const element = grip.closest('.timeline3-item');
    timeline3Runtime.reorder = { key, pointerId: event.pointerId, startX: event.clientX, currentX: event.clientX, initialIndex: item.index, element };
    grip.setPointerCapture(event.pointerId);
    element?.classList.add('is-reordering');
    timeline3Runtime.suppressClickUntil = Date.now() + 900;
}

function timeline3MoveReorder(event) {
    const state = timeline3Runtime.reorder;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    state.currentX = event.clientX;
    if (state.element) state.element.style.transform = `translateX(${event.clientX - state.startX}px)`;
    const scroll = document.getElementById('timeline3-scroll');
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    if (event.clientX < rect.left + 46) scroll.scrollLeft = Math.max(0, scroll.scrollLeft - 12);
    else if (event.clientX > rect.right - 46) scroll.scrollLeft += 12;
}

function timeline3TargetReorderIndex(event, layout) {
    if (!layout.length) return 0;
    const scroll = document.getElementById('timeline3-scroll');
    if (!scroll) return 0;
    const rect = scroll.getBoundingClientRect();
    const x = scroll.scrollLeft + event.clientX - rect.left;
    let closest = 0;
    let distance = Infinity;
    layout.forEach((item, index) => {
        const center = timeline3X(item.start + item.duration / 2);
        const delta = Math.abs(center - x);
        if (delta < distance) {
            distance = delta;
            closest = index;
        }
    });
    return closest;
}

function timeline3FinishReorder(event, cancelled = false) {
    const state = timeline3Runtime.reorder;
    if (!state || state.pointerId !== event.pointerId) return;
    const item = timeline3Runtime.items.get(state.key);
    if (state.element) {
        state.element.style.transform = '';
        state.element.classList.remove('is-reordering');
    }
    timeline3Runtime.reorder = null;
    if (cancelled || !item) {
        timeline3ScheduleRender(0);
        return;
    }
    const layout = item.kind === 'visual-advanced' ? timeline3AdvancedLayout() : timeline3SimpleLayout();
    const from = layout.findIndex(entry => entry.key === state.key);
    const to = timeline3TargetReorderIndex(event, layout);
    if (from < 0 || to === from) {
        timeline3ScheduleRender(0);
        return;
    }
    if (item.kind === 'visual-simple' && window.BASMasterSequence && item.clip) {
        const step = to > from ? 1 : -1;
        for (let index = from; index !== to; index += step) BASMasterSequence.moveClip(item.clip.id, step);
    } else if (item.kind === 'visual-advanced' && item.part && typeof moveAdvancedPart === 'function') {
        const step = to > from ? 1 : -1;
        for (let index = from; index !== to; index += step) moveAdvancedPart(item.part.id, step);
    }
    timeline3ScheduleRender(0);
}

function timeline3StartTrim(event, handle) {
    const key = handle.dataset.timeline3Key;
    const item = timeline3Runtime.items.get(key);
    if (!item || !['layer', 'visual-advanced'].includes(item.kind)) return;
    event.preventDefault();
    event.stopPropagation();
    timeline3Runtime.trim = { key, edge: handle.dataset.timeline3Trim, pointerId: event.pointerId, startX: event.clientX, initialStart: item.kind === 'layer' ? item.layer.start : item.part.start, initialEnd: item.kind === 'layer' ? item.layer.end : item.part.end };
    handle.setPointerCapture(event.pointerId);
    handle.closest('.timeline3-item')?.classList.add('is-trimming');
}

function timeline3MoveTrim(event) {
    const trim = timeline3Runtime.trim;
    if (!trim || trim.pointerId !== event.pointerId) return;
    const item = timeline3Runtime.items.get(trim.key);
    if (!item) return;
    event.preventDefault();
    const delta = (event.clientX - trim.startX) / timeline3Runtime.zoom;
    if (item.kind === 'layer') {
        const duration = timeline3Duration();
        const liveLayer = window.BASComposition ? BASComposition.getLayers().find(layer => layer.id === item.id) : item.layer;
        if (!liveLayer) return;
        if (trim.edge === 'start') liveLayer.start = Math.max(0, Math.min(liveLayer.end - 0.02, trim.initialStart + delta));
        else liveLayer.end = Math.max(liveLayer.start + 0.02, Math.min(duration, trim.initialEnd + delta));
        item.layer = liveLayer;
        item.start = liveLayer.start;
        item.end = liveLayer.end;
        item.duration = item.end - item.start;
    } else if (item.kind === 'visual-advanced') {
        const sourceDuration = window.BASSourceLibrary ? Math.max(0, Number(BASSourceLibrary.getDuration(item.sourceId)) || 0) : Math.max(0, Number(currentProject.sourceDuration) || 0);
        const fps = Math.max(1, Number(item.source && item.source.fps) || Number(currentProject.fps) || 30);
        const snap = value => Math.round(value * fps) / fps;
        if (trim.edge === 'start') item.part.start = Math.max(0, Math.min(item.part.end - 1 / fps, snap(trim.initialStart + delta)));
        else item.part.end = Math.max(item.part.start + 1 / fps, Math.min(sourceDuration, snap(trim.initialEnd + delta)));
        item.duration = Math.max(0.001, item.part.end - item.part.start);
    }
    const element = document.querySelector(`[data-timeline3-key="${CSS.escape(trim.key)}"]`);
    if (element) {
        if (item.kind === 'layer') element.style.left = `${timeline3X(item.start)}px`;
        element.style.width = `${timeline3Width(item.duration)}px`;
    }
    if (window.BASComposition) BASComposition.renderPreview();
}

function timeline3FinishTrim(event, cancelled = false) {
    const trim = timeline3Runtime.trim;
    if (!trim || trim.pointerId !== event.pointerId) return;
    const item = timeline3Runtime.items.get(trim.key);
    if (cancelled && item) {
        if (item.kind === 'layer') {
            const liveLayer = window.BASComposition ? BASComposition.getLayers().find(layer => layer.id === item.id) : item.layer;
            if (liveLayer) {
                liveLayer.start = trim.initialStart;
                liveLayer.end = trim.initialEnd;
                item.layer = liveLayer;
            }
        } else if (item.kind === 'visual-advanced') {
            item.part.start = trim.initialStart;
            item.part.end = trim.initialEnd;
        }
    } else if (item) {
        if (item.kind === 'layer') {
            if (window.BASComposition) {
                BASComposition.render();
                BASComposition.renderPreview();
            }
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('composition', { changeKey: `composition:${item.id}:timing`, immediate: true });
        } else if (item.kind === 'visual-advanced') {
            if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
            if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
            if (typeof atualizarBotoesELinhas === 'function') atualizarBotoesELinhas();
        }
    }
    document.querySelectorAll('.timeline3-item.is-trimming').forEach(element => element.classList.remove('is-trimming'));
    timeline3Runtime.trim = null;
    timeline3ScheduleRender(0);
}

function timeline3TapTime(event) {
    const scroll = document.getElementById('timeline3-scroll');
    if (!scroll) return 0;
    const rect = scroll.getBoundingClientRect();
    const contentX = scroll.scrollLeft + event.clientX - rect.left;
    return Math.max(0, Math.min(timeline3Duration(), (contentX - timeline3Runtime.gutter) / timeline3Runtime.zoom));
}

function timeline3PauseForGesture() {
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive() && BASMasterSequence.isPlaying()) BASMasterSequence.pause();
    if (playerVideo && !playerVideo.paused) playerVideo.pause();
}

function timeline3ScrubAutoScroll(event) {
    const scroll = document.getElementById('timeline3-scroll');
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const edge = Math.min(54, rect.width * 0.16);
    if (event.clientX < rect.left + edge) scroll.scrollLeft = Math.max(0, scroll.scrollLeft - Math.max(7, (rect.left + edge - event.clientX) * 0.34));
    else if (event.clientX > rect.right - edge) scroll.scrollLeft += Math.max(7, (event.clientX - (rect.right - edge)) * 0.34);
}

function timeline3ScheduleScrubSeek(scrub, immediate = false) {
    if (!scrub || timeline3Runtime.scrub !== scrub || scrub.finishing || scrub.seekTimer) return;
    const run = () => {
        scrub.seekTimer = 0;
        if (timeline3Runtime.scrub !== scrub || scrub.finishing || !Number.isFinite(scrub.pendingTime)) return;
        const target = scrub.pendingTime;
        scrub.pendingTime = NaN;
        timeline3Seek(target, { follow: false, renderPart: false }).catch(() => {});
        if (Number.isFinite(scrub.pendingTime)) timeline3ScheduleScrubSeek(scrub, false);
    };
    if (immediate) run();
    else scrub.seekTimer = setTimeout(run, 54);
}

function timeline3QueueScrub(time) {
    const scrub = timeline3Runtime.scrub;
    if (!scrub || scrub.finishing) return;
    const safe = Math.max(0, Math.min(timeline3Duration(), Number(time) || 0));
    scrub.previewTime = safe;
    scrub.pendingTime = safe;
    timeline3Runtime.currentTime = safe;
    timeline3UpdatePlayhead();
    timeline3ScheduleScrubSeek(scrub, !scrub.hasSeeked);
    scrub.hasSeeked = true;
}

function timeline3StartScrub(event, target, immediate = false) {
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    timeline3PauseForGesture();
    const scrub = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: !!immediate,
        previewTime: timeline3CurrentTime(),
        pendingTime: NaN,
        seekTimer: 0,
        hasSeeked: false,
        finishing: false,
        target
    };
    timeline3Runtime.scrub = scrub;
    if (target && typeof target.setPointerCapture === 'function') {
        try { target.setPointerCapture(event.pointerId); } catch (error) {}
    }
    if (immediate) {
        event.preventDefault();
        timeline3QueueScrub(timeline3TapTime(event));
    }
    return true;
}

function timeline3MoveScrub(event) {
    const scrub = timeline3Runtime.scrub;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    const holdState = timeline3Runtime.hold;
    if (holdState && holdState.pointerId === event.pointerId && holdState.fired) return;
    const distance = Math.hypot(event.clientX - scrub.startX, event.clientY - scrub.startY);
    if (!scrub.moved && distance < 6) return;
    if (!scrub.moved) {
        scrub.moved = true;
        timeline3Runtime.suppressClickUntil = Date.now() + 700;
        const hold = timeline3Runtime.hold;
        if (hold && hold.pointerId === event.pointerId) {
            clearTimeout(hold.timer);
            timeline3Runtime.hold = null;
        }
    }
    event.preventDefault();
    timeline3ScrubAutoScroll(event);
    timeline3QueueScrub(timeline3TapTime(event));
}

function timeline3FinishScrub(event, cancelled = false) {
    const scrub = timeline3Runtime.scrub;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    if (scrub.seekTimer) {
        clearTimeout(scrub.seekTimer);
        scrub.seekTimer = 0;
    }
    if (cancelled && !scrub.moved) {
        timeline3Runtime.scrub = null;
        timeline3Runtime.currentTime = timeline3CurrentSimpleTime();
        timeline3UpdatePlayhead();
        timeline3SyncTransport();
        return;
    }
    if (!scrub.moved) {
        timeline3Runtime.scrub = null;
        return;
    }
    timeline3Runtime.suppressClickUntil = Date.now() + 500;
    scrub.finishing = true;
    const finalTime = scrub.previewTime;
    timeline3Seek(finalTime, { follow: false, renderPart: false }).catch(() => false).finally(() => {
        if (timeline3Runtime.scrub !== scrub) return;
        timeline3Runtime.scrub = null;
        timeline3Runtime.currentTime = finalTime;
        timeline3UpdatePlayhead();
        timeline3SyncTransport();
    });
}

function timeline3LiveLayer(item) {
    if (!item || item.kind !== 'layer' || !window.BASComposition) return item && item.layer ? item.layer : null;
    return BASComposition.getLayers().find(layer => layer.id === item.id) || null;
}

function timeline3StartItemDrag(event, element, item) {
    if (!item || !['layer', 'audio-simple', 'audio-advanced'].includes(item.kind)) return false;
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    let initialStart = item.start;
    let initialEnd = item.end;
    let initialOffset = 0;
    if (item.kind === 'layer') {
        const layer = timeline3LiveLayer(item);
        if (!layer) return false;
        item.layer = layer;
        initialStart = Number(layer.start) || 0;
        initialEnd = Number(layer.end) || initialStart;
    } else {
        initialOffset = Math.max(0, Number(item.state && item.state.offset) || 0);
    }
    timeline3Runtime.itemDrag = {
        key: item.key,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialStart,
        initialEnd,
        initialOffset,
        moved: false,
        element
    };
    if (element && typeof element.setPointerCapture === 'function') {
        try { element.setPointerCapture(event.pointerId); } catch (error) {}
    }
    return true;
}

function timeline3SetSimpleAudioOffset(item, value) {
    const maxOffset = Math.max(0, Number(item.maxOffset) || 0);
    const offset = Math.max(0, Math.min(maxOffset, Number(value) || 0));
    const input = document.getElementById(`audio-offset-${item.role}`);
    if (input) input.value = offset.toFixed(2);
    if (item.state) item.state.offset = offset;
    if (typeof syncAudioAdvancedLabels === 'function') syncAudioAdvancedLabels(item.role);
    item.start = item.baseStart + offset;
    item.end = item.baseEnd;
    item.duration = Math.max(0.02, item.end - item.start);
    return offset;
}

function timeline3SetAdvancedAudioOffset(item, value) {
    const maxOffset = Math.max(0, Number(item.maxOffset) || 0);
    const offset = Math.max(0, Math.min(maxOffset, Number(value) || 0));
    if (item.part && item.part.audio) item.part.audio.offset = offset;
    if (item.state) item.state.offset = offset;
    item.start = item.baseStart + offset;
    item.end = item.baseEnd;
    item.duration = Math.max(0.02, item.end - item.start);
    return offset;
}

function timeline3MoveItemDrag(event) {
    const drag = timeline3Runtime.itemDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const item = timeline3Runtime.items.get(drag.key);
    if (!item) return;
    const holdState = timeline3Runtime.hold;
    if (holdState && holdState.pointerId === event.pointerId && holdState.fired) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < 6) return;
    if (!drag.moved) {
        drag.moved = true;
        timeline3PauseForGesture();
        timeline3Runtime.suppressClickUntil = Date.now() + 700;
        const hold = timeline3Runtime.hold;
        if (hold && hold.pointerId === event.pointerId) {
            clearTimeout(hold.timer);
            timeline3Runtime.hold = null;
        }
        drag.element?.classList.add('is-timeline-dragging');
    }
    event.preventDefault();
    const delta = (event.clientX - drag.startX) / timeline3Runtime.zoom;
    if (item.kind === 'layer') {
        const layer = timeline3LiveLayer(item);
        if (!layer) return;
        const span = Math.max(0.02, drag.initialEnd - drag.initialStart);
        const limit = Math.max(0, timeline3Duration() - span);
        const start = Math.max(0, Math.min(limit, drag.initialStart + delta));
        layer.start = start;
        layer.end = start + span;
        item.layer = layer;
        item.start = layer.start;
        item.end = layer.end;
        item.duration = span;
        if (window.BASComposition) BASComposition.renderPreview();
    } else if (item.kind === 'audio-simple') {
        timeline3SetSimpleAudioOffset(item, drag.initialOffset + delta);
    } else if (item.kind === 'audio-advanced') {
        timeline3SetAdvancedAudioOffset(item, drag.initialOffset + delta);
    }
    if (drag.element) {
        drag.element.style.left = `${timeline3X(item.start)}px`;
        drag.element.style.width = `${timeline3Width(item.duration)}px`;
    }
}

function timeline3FinishItemDrag(event, cancelled = false) {
    const drag = timeline3Runtime.itemDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const item = timeline3Runtime.items.get(drag.key);
    if (item && cancelled && drag.moved) {
        if (item.kind === 'layer') {
            const layer = timeline3LiveLayer(item);
            if (layer) {
                layer.start = drag.initialStart;
                layer.end = drag.initialEnd;
                item.layer = layer;
            }
        } else if (item.kind === 'audio-simple') timeline3SetSimpleAudioOffset(item, drag.initialOffset);
        else if (item.kind === 'audio-advanced') timeline3SetAdvancedAudioOffset(item, drag.initialOffset);
    } else if (item && drag.moved) {
        if (item.kind === 'layer') {
            if (window.BASComposition) {
                BASComposition.render();
                BASComposition.renderPreview();
            }
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('composition', { changeKey: `composition:${item.id}:timing`, immediate: true });
        } else if (item.kind === 'audio-simple') {
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('audio', { changeKey: `audio:${item.role}:offset`, immediate: true });
        } else if (item.kind === 'audio-advanced') {
            if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
            if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
        }
    }
    drag.element?.classList.remove('is-timeline-dragging');
    timeline3Runtime.itemDrag = null;
    if (drag.moved) timeline3Runtime.suppressClickUntil = Date.now() + 500;
    timeline3ScheduleRender(0);
}

function timeline3StartHold(event, item) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearTimeout(timeline3Runtime.hold && timeline3Runtime.hold.timer);
    const hold = { key: item.dataset.timeline3Key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, fired: false, timer: 0 };
    hold.timer = setTimeout(() => {
        hold.fired = true;
        timeline3Runtime.suppressClickUntil = Date.now() + 650;
        if (typeof navigator.vibrate === 'function') navigator.vibrate(18);
        timeline3OpenContext(hold.key);
    }, 460);
    timeline3Runtime.hold = hold;
}

function timeline3MoveHold(event) {
    const hold = timeline3Runtime.hold;
    if (!hold || hold.pointerId !== event.pointerId || hold.fired) return;
    if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 16) {
        clearTimeout(hold.timer);
        timeline3Runtime.hold = null;
    }
}

function timeline3EndHold(event) {
    const hold = timeline3Runtime.hold;
    if (!hold || hold.pointerId !== event.pointerId) return;
    clearTimeout(hold.timer);
    timeline3Runtime.hold = null;
}

function timeline3BindPinch(scroll) {
    scroll.addEventListener('touchstart', event => {
        if (event.touches.length !== 2) return;
        const a = event.touches[0];
        const b = event.touches[1];
        const rect = scroll.getBoundingClientRect();
        const centerX = (a.clientX + b.clientX) / 2 - rect.left;
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const focusTime = Math.max(0, (scroll.scrollLeft + centerX - timeline3Runtime.gutter) / timeline3Runtime.zoom);
        timeline3Runtime.pinch = { distance, zoom: timeline3Runtime.zoom, centerX, focusTime };
        event.preventDefault();
    }, { passive: false });
    scroll.addEventListener('touchmove', event => {
        if (!timeline3Runtime.pinch || event.touches.length !== 2) return;
        const a = event.touches[0];
        const b = event.touches[1];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const ratio = distance / Math.max(1, timeline3Runtime.pinch.distance);
        timeline3SetZoom(timeline3Runtime.pinch.zoom * ratio, { focusX: timeline3Runtime.pinch.centerX, focusTime: timeline3Runtime.pinch.focusTime, silent: true });
        event.preventDefault();
    }, { passive: false });
    scroll.addEventListener('touchend', event => {
        if (timeline3Runtime.pinch && event.touches.length < 2) {
            timeline3Runtime.pinch = null;
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true });
        }
    }, { passive: true });
}

function timeline3PlaybackFrame() {
    timeline3UpdatePlayhead({ follow: true });
    timeline3SyncTransport();
    const playing = !timeline3AdvancedActive() && (window.BASMasterSequence && BASMasterSequence.isTimelineActive() ? BASMasterSequence.isPlaying() : !playerVideo.paused);
    if (playing) timeline3Runtime.playFrame = requestAnimationFrame(timeline3PlaybackFrame);
    else timeline3Runtime.playFrame = 0;
}

function timeline3StartPlaybackTracking() {
    if (timeline3Runtime.playFrame) cancelAnimationFrame(timeline3Runtime.playFrame);
    timeline3Runtime.playFrame = requestAnimationFrame(timeline3PlaybackFrame);
}

function timeline3SyncText() {
    const bindings = {
        'timeline3-kicker': ['timeline3Kicker', 'MULTITRACK'],
        'timeline3-title': ['timeline3Title', 'Timeline 3.0'],
        'timeline3-desc': ['timeline3Desc', 'See visuals, layers and audio together. Tap an item for actions; drag the timeline to navigate.'],
        'timeline3-zoom-fit-label': ['timeline3Fit', 'Fit'],
        'timeline3-start-label': ['timeline3Start', 'Start'],
        'timeline3-end-label': ['timeline3End', 'End'],
        'timeline3-hint': ['timeline3Hint', 'Pinch or use the zoom controls for precision. Tap or hold a clip, layer or audio item for actions.']
    };
    Object.entries(bindings).forEach(([id, [key, fallback]]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = timeline3Text(key, fallback);
    });
    const close = document.getElementById('timeline3-context-close');
    if (close) close.setAttribute('aria-label', timeline3Text('timeline3Close', 'Close'));
    timeline3Render();
}

function bindTimeline3() {
    if (timeline3Runtime.initialized) return;
    timeline3Runtime.initialized = true;
    document.body.classList.add('timeline3-active');
    const scroll = document.getElementById('timeline3-scroll');
    if (!scroll) return;
    document.getElementById('timeline3-zoom-out')?.addEventListener('click', () => timeline3SetZoom(timeline3Runtime.zoom - 16));
    document.getElementById('timeline3-zoom-in')?.addEventListener('click', () => timeline3SetZoom(timeline3Runtime.zoom + 16));
    document.getElementById('timeline3-zoom')?.addEventListener('input', event => timeline3SetZoom(event.target.value, { silent: true }));
    document.getElementById('timeline3-zoom')?.addEventListener('change', () => { if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('ui', { emit: true }); });
    document.getElementById('timeline3-zoom-fit')?.addEventListener('click', () => timeline3Fit());
    document.getElementById('timeline3-start')?.addEventListener('click', () => timeline3Seek(0, { follow: true }));
    document.getElementById('timeline3-end')?.addEventListener('click', () => timeline3Seek(timeline3Duration(), { follow: true }));
    document.getElementById('timeline3-play')?.addEventListener('click', () => {
        if (timeline3AdvancedActive()) {
            if (typeof chamarModalPreview === 'function') chamarModalPreview();
            return;
        }
        if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) BASMasterSequence.togglePlay();
        else if (playerVideo.paused) playerVideo.play().catch(() => {});
        else playerVideo.pause();
        timeline3StartPlaybackTracking();
        timeline3SyncTransport();
    });
    document.getElementById('timeline3-context-close')?.addEventListener('click', timeline3CloseContext);
    document.getElementById('timeline3-context-actions')?.addEventListener('click', event => {
        const button = event.target.closest('[data-timeline3-action]');
        if (button) timeline3RunAction(button.dataset.timeline3Action, button.dataset.timeline3Key);
    });
    scroll.addEventListener('click', event => {
        if (Date.now() < timeline3Runtime.suppressClickUntil) return;
        const handle = event.target.closest('[data-timeline3-trim]');
        if (handle) return;
        const item = event.target.closest('[data-timeline3-key]');
        if (item) {
            timeline3OpenContext(item.dataset.timeline3Key);
            return;
        }
        if (event.target.closest('.timeline3-lane-label')) return;
        timeline3Seek(timeline3TapTime(event), { follow: false });
    });
    scroll.addEventListener('pointerdown', event => {
        const reorder = event.target.closest('[data-timeline3-reorder]');
        if (reorder) {
            timeline3StartReorder(event, reorder);
            return;
        }
        const handle = event.target.closest('[data-timeline3-trim]');
        if (handle) {
            timeline3StartTrim(event, handle);
            return;
        }
        const itemElement = event.target.closest('[data-timeline3-key]');
        const item = itemElement ? timeline3Runtime.items.get(itemElement.dataset.timeline3Key) : null;
        if (itemElement && item) {
            if (['layer', 'audio-simple', 'audio-advanced'].includes(item.kind)) timeline3StartItemDrag(event, itemElement, item);
            else if (['visual-simple', 'visual-advanced'].includes(item.kind)) timeline3StartScrub(event, itemElement, false);
            timeline3StartHold(event, itemElement);
            return;
        }
        if (event.target.closest('.timeline3-ruler')) timeline3StartScrub(event, event.target.closest('.timeline3-ruler'), true);
    });
    scroll.addEventListener('pointermove', event => {
        timeline3MoveReorder(event);
        timeline3MoveTrim(event);
        timeline3MoveItemDrag(event);
        timeline3MoveScrub(event);
        timeline3MoveHold(event);
    });
    scroll.addEventListener('pointerup', event => {
        timeline3FinishReorder(event, false);
        timeline3FinishTrim(event, false);
        timeline3FinishItemDrag(event, false);
        timeline3FinishScrub(event, false);
        timeline3EndHold(event);
    });
    scroll.addEventListener('pointercancel', event => {
        timeline3FinishReorder(event, true);
        timeline3FinishTrim(event, true);
        timeline3FinishItemDrag(event, true);
        timeline3FinishScrub(event, true);
        timeline3EndHold(event);
    });
    scroll.addEventListener('contextmenu', event => {
        if (event.target.closest('[data-timeline3-key]')) event.preventDefault();
    });
    timeline3BindPinch(scroll);
    window.addEventListener('bas:projectchange', () => timeline3ScheduleRender(30));
    window.addEventListener('resize', () => timeline3ScheduleRender(80), { passive: true });
    playerVideo?.addEventListener('timeupdate', () => {
        if (!timeline3AdvancedActive()) timeline3UpdatePlayhead({ follow: !playerVideo.paused });
    });
    playerVideo?.addEventListener('play', timeline3StartPlaybackTracking);
    playerVideo?.addEventListener('pause', () => {
        timeline3UpdatePlayhead();
        timeline3SyncTransport();
    });
    const advanced = document.getElementById('advanced-parts-editor');
    if (advanced) new MutationObserver(() => timeline3ScheduleRender(0)).observe(advanced, { attributes: true, childList: true, subtree: false });
    timeline3SyncText();
    setTimeout(() => timeline3Fit({ silent: true }), 80);
}

window.BASMultiTrackTimeline = Object.freeze({
    render: timeline3Render,
    scheduleRender: timeline3ScheduleRender,
    syncText: timeline3SyncText,
    fit: timeline3Fit,
    setZoom: timeline3SetZoom,
    getUiState: timeline3GetUiState,
    restoreUiState: timeline3RestoreUiState,
    getDuration: timeline3Duration,
    getCurrentTime: timeline3CurrentTime,
    seek: timeline3Seek,
    isAdvancedActive: timeline3AdvancedActive,
    refreshFrames: timeline3RefreshFrames,
    clearFrameCache: timeline3ClearThumbnailCache
});
window.syncTimeline3Text = timeline3SyncText;
window.addEventListener('DOMContentLoaded', bindTimeline3);
