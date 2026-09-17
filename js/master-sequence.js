const masterSequenceRuntime = {
    initialized: false,
    projectRef: null,
    currentTime: 0,
    activeClipId: '',
    playing: false,
    switchingPlayer: false,
    transitioning: false,
    switchGeneration: 0,
    wasTimelineActive: false,
    preview: {
        active: false,
        element: null,
        start: 0,
        end: 0,
        time: 0,
        activeClipId: '',
        switching: false,
        transitioning: false,
        generation: 0,
        looped: false
    }
};

function masterSequenceText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function masterSequenceCreateClipId(project = currentProject) {
    if (!project) return `clip-${Date.now().toString(36)}`;
    project.masterSequenceCounter = Math.max(0, Number(project.masterSequenceCounter) || 0) + 1;
    return `clip-${project.masterSequenceCounter}`;
}

function masterSequenceVisualSources() {
    return window.BASSourceLibrary ? BASSourceLibrary.getVisual() : [];
}

function masterSequenceSourceDuration(sourceId) {
    if (!window.BASSourceLibrary) return 0;
    return Math.max(0, Number(BASSourceLibrary.getDuration(sourceId)) || 0);
}

function ensureProjectMasterSequence(project = currentProject) {
    if (!project) return [];
    if (!Array.isArray(project.masterSequence)) project.masterSequence = [];
    if (!Number.isInteger(project.masterSequenceCounter)) project.masterSequenceCounter = 0;
    const visual = masterSequenceVisualSources();
    const validIds = new Set(visual.map(source => source.id));
    const seen = new Set();
    project.masterSequence = project.masterSequence.filter(clip => {
        if (!clip || !validIds.has(clip.sourceId) || seen.has(clip.sourceId)) return false;
        seen.add(clip.sourceId);
        if (!clip.id) clip.id = masterSequenceCreateClipId(project);
        const duration = masterSequenceSourceDuration(clip.sourceId);
        const rawIn = Math.max(0, Number(clip.in) || 0);
        const rawOut = Number(clip.out);
        if (duration > 0) {
            const fps = Math.max(1, Number(project && project.fps) || 30);
            const provisionalOut = rawIn <= 0.00001 && Number.isFinite(rawOut) && rawOut > 0 && rawOut <= 0.0011 && duration > Math.max(0.05, 2 / fps);
            clip.in = Math.max(0, Math.min(duration, rawIn));
            clip.out = !Number.isFinite(rawOut) || rawOut <= 0 || provisionalOut ? duration : Math.max(clip.in, Math.min(duration, rawOut));
            if (!(clip.out > clip.in)) {
                clip.in = 0;
                clip.out = duration;
            }
        } else {
            clip.in = rawIn;
            clip.out = Number.isFinite(rawOut) && rawOut > rawIn ? rawOut : 0;
        }
        const match = /^clip-(\d+)$/.exec(String(clip.id));
        if (match) project.masterSequenceCounter = Math.max(project.masterSequenceCounter, Number(match[1]) || 0);
        return true;
    });
    visual.forEach(source => {
        if (seen.has(source.id)) return;
        project.masterSequence.push({ id: masterSequenceCreateClipId(project), sourceId: source.id, in: 0, out: masterSequenceSourceDuration(source.id) });
        seen.add(source.id);
    });
    return project.masterSequence;
}

function getMasterSequence() {
    return ensureProjectMasterSequence();
}

function masterSequenceHasMultipleClips() {
    return getMasterSequence().length > 1;
}

function masterSequenceTimelineActive() {
    const advanced = typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive();
    return getMasterSequence().length > 0 && !advanced && (masterSequenceHasMultipleClips() || getMasterSequence().some(clip => Math.abs((Number(clip.in) || 0)) > 0.00001 || Math.abs((Number(clip.out) || masterSequenceSourceDuration(clip.sourceId)) - masterSequenceSourceDuration(clip.sourceId)) > 0.00001));
}

function masterSequenceGetDuration() {
    return getMasterSequence().reduce((sum, clip) => sum + Math.max(0, (Number(clip.out) || masterSequenceSourceDuration(clip.sourceId)) - (Number(clip.in) || 0)), 0);
}

function masterSequenceLayout() {
    let cursor = 0;
    return getMasterSequence().map((clip, index) => {
        const sourceDuration = masterSequenceSourceDuration(clip.sourceId);
        const sourceIn = Math.max(0, Math.min(sourceDuration, Number(clip.in) || 0));
        const sourceOut = Math.max(sourceIn, Math.min(sourceDuration, Number(clip.out) || sourceDuration));
        const duration = Math.max(0, sourceOut - sourceIn);
        const start = cursor;
        cursor += duration;
        return { clip, index, start, end: cursor, duration, sourceIn, sourceOut, sourceDuration, source: window.BASSourceLibrary ? BASSourceLibrary.getById(clip.sourceId) : null };
    });
}

function masterSequenceLocate(globalTime, preferPreviousAtBoundary = false) {
    const layout = masterSequenceLayout();
    if (!layout.length) return null;
    const total = layout[layout.length - 1].end;
    const safe = Math.max(0, Math.min(total, Number(globalTime) || 0));
    for (let index = 0; index < layout.length; index++) {
        const item = layout[index];
        const atEnd = Math.abs(safe - item.end) < 0.00001;
        if (safe < item.end || (preferPreviousAtBoundary && atEnd) || index === layout.length - 1) {
            const local = Math.max(0, Math.min(item.duration, safe - item.start));
            return { ...item, globalTime: safe, sourceTime: item.sourceIn + local };
        }
    }
    const last = layout[layout.length - 1];
    return { ...last, globalTime: total, sourceTime: last.sourceOut };
}

function masterSequenceSerialize() {
    if (!currentProject) return { counter: 0, clips: [] };
    return {
        counter: Math.max(0, Number(currentProject.masterSequenceCounter) || 0),
        clips: getMasterSequence().map(clip => ({ id: String(clip.id || ''), sourceId: String(clip.sourceId || ''), in: Math.max(0, Number(clip.in) || 0), out: Math.max(0, Number(clip.out) || masterSequenceSourceDuration(clip.sourceId)) }))
    };
}

function masterSequenceRestoreState(state) {
    if (!currentProject) return false;
    const saved = state && Array.isArray(state.clips) ? state.clips : [];
    currentProject.masterSequenceCounter = Math.max(0, Number(state && state.counter) || 0);
    currentProject.masterSequence = saved.map(clip => ({ id: String(clip.id || ''), sourceId: String(clip.sourceId || ''), in: Math.max(0, Number(clip.in) || 0), out: Math.max(0, Number(clip.out) || masterSequenceSourceDuration(clip.sourceId)) }));
    ensureProjectMasterSequence();
    if (typeof renderSourceLibrary === 'function') renderSourceLibrary();
    masterSequenceRuntime.currentTime = Math.min(masterSequenceRuntime.currentTime, masterSequenceGetDuration());
    renderMasterSequenceOverview();
    masterSequenceRefreshTimeline({ seekToStart: false });
    return true;
}

function masterSequenceAppendSource(sourceId, options = {}) {
    if (!currentProject || !window.BASSourceLibrary) return false;
    const source = BASSourceLibrary.getById(sourceId);
    if (!source || source.role !== 'visual') return false;
    const sequence = getMasterSequence();
    if (sequence.some(clip => clip.sourceId === sourceId)) return false;
    sequence.push({ id: masterSequenceCreateClipId(), sourceId, in: 0, out: masterSequenceSourceDuration(sourceId) });
    renderMasterSequenceOverview();
    if (!options.silent && typeof window.projectEngineTouch === 'function') window.projectEngineTouch('master-sequence', { changeKey: 'master-sequence', immediate: true });
    masterSequenceRefreshTimeline({ seekToStart: false });
    return true;
}

function masterSequenceRemoveSource(sourceId, options = {}) {
    if (!currentProject) return false;
    const before = getMasterSequence().length;
    currentProject.masterSequence = getMasterSequence().filter(clip => clip.sourceId !== sourceId);
    ensureProjectMasterSequence();
    const changed = currentProject.masterSequence.length !== before;
    if (!changed) return false;
    const duration = masterSequenceGetDuration();
    masterSequenceRuntime.currentTime = Math.min(masterSequenceRuntime.currentTime, duration);
    ['m0', 'm1', 'm2', 'm3'].forEach(key => {
        if (marcadores[key] !== null && marcadores[key] !== undefined) marcadores[key] = Math.max(0, Math.min(duration, Number(marcadores[key]) || 0));
    });
    currentProject.markers = marcadores;
    if (typeof notifyAudioMarkersChanged === 'function') notifyAudioMarkersChanged();
    renderMasterSequenceOverview();
    if (!options.silent && typeof window.projectEngineTouch === 'function') window.projectEngineTouch('master-sequence', { changeKey: 'master-sequence', immediate: true });
    masterSequenceRefreshTimeline({ seekToStart: true });
    return true;
}


function masterSequenceSetClipRange(clipId, sourceIn, sourceOut, options = {}) {
    const clip = getMasterSequence().find(item => item.id === clipId);
    if (!clip) return false;
    const duration = masterSequenceSourceDuration(clip.sourceId);
    const minSpan = Math.min(duration || 0.001, Math.max(0.001, 1 / Math.max(1, Number(currentProject && currentProject.fps) || 30)));
    let nextIn = Math.max(0, Math.min(duration, Number(sourceIn) || 0));
    let nextOut = Math.max(0, Math.min(duration, Number(sourceOut) || duration));
    if (nextOut - nextIn < minSpan) {
        if (options.edge === 'start') nextIn = Math.max(0, nextOut - minSpan);
        else nextOut = Math.min(duration, nextIn + minSpan);
    }
    if (!(nextOut > nextIn)) return false;
    const changed = Math.abs((Number(clip.in) || 0) - nextIn) > 0.00001 || Math.abs((Number(clip.out) || duration) - nextOut) > 0.00001;
    if (!changed) return false;
    clip.in = nextIn;
    clip.out = nextOut;
    const total = masterSequenceGetDuration();
    masterSequenceRuntime.currentTime = Math.min(masterSequenceRuntime.currentTime, total);
    ['m0', 'm1', 'm2', 'm3'].forEach(key => {
        if (marcadores[key] !== null && marcadores[key] !== undefined) marcadores[key] = Math.max(0, Math.min(total, Number(marcadores[key]) || 0));
    });
    currentProject.markers = marcadores;
    if (typeof notifyAudioMarkersChanged === 'function') notifyAudioMarkersChanged();
    masterSequenceRefreshTimeline({ seekToStart: false });
    if (!options.silent && typeof window.projectEngineTouch === 'function') window.projectEngineTouch('master-sequence-trim', { changeKey: `master-sequence:${clipId}:trim`, immediate: true });
    return true;
}

function masterSequenceMoveClip(clipId, direction) {
    if (!currentProject) return false;
    const sequence = getMasterSequence();
    const index = sequence.findIndex(clip => clip.id === clipId);
    if (index < 0) return false;
    const nextIndex = direction < 0 ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= sequence.length) return false;
    [sequence[index], sequence[nextIndex]] = [sequence[nextIndex], sequence[index]];
    masterSequenceRuntime.currentTime = 0;
    renderMasterSequenceOverview();
    if (typeof renderSourceLibrary === 'function') renderSourceLibrary();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('master-sequence-order', { changeKey: 'master-sequence', immediate: true });
    masterSequenceRefreshTimeline({ seekToStart: true });
    if (typeof showToast === 'function') showToast(masterSequenceText('masterSequenceReordered', 'Source order updated'), 'success');
    return true;
}

function masterSequenceIndexOfSource(sourceId) {
    return getMasterSequence().findIndex(clip => clip.sourceId === sourceId);
}

function masterSequenceHue(sourceId) {
    let hash = 0;
    for (const char of String(sourceId || 'source')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % 360;
}

function masterSequenceEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function masterSequenceFormatSeconds(value) {
    const safe = Math.max(0, Number(value) || 0);
    return `${safe < 10 ? safe.toFixed(2) : safe.toFixed(1)}s`;
}

function renderMasterSequenceOverview() {
    const section = document.getElementById('master-sequence-overview');
    const list = document.getElementById('master-sequence-list');
    const summary = document.getElementById('master-sequence-summary');
    if (!section || !list) return;
    const sequence = masterSequenceLayout();
    section.hidden = !currentProject || sequence.length < 2 || (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive());
    if (section.hidden) {
        list.innerHTML = '';
        return;
    }
    if (summary) summary.textContent = masterSequenceText('masterSequenceSummary', '{count} sources · {duration}').replace('{count}', String(sequence.length)).replace('{duration}', masterSequenceFormatSeconds(masterSequenceGetDuration()));
    list.innerHTML = sequence.map(item => {
        const source = item.source;
        const name = source ? source.name : masterSequenceText('sourceLibraryPrimaryFallback', 'Primary source');
        const kind = source ? (source.kind === 'gif' ? 'GIF' : source.kind === 'image' ? masterSequenceText('sourceLibraryImage', 'Image') : source.kind === 'bootanimation' ? 'bootanimation.zip' : masterSequenceText('sourceLibraryVideo', 'Video')) : '';
        const hue = masterSequenceHue(item.clip.sourceId);
        return `<article class="master-sequence-item" data-master-clip-id="${masterSequenceEscape(item.clip.id)}" style="--master-hue:${hue}">
            <span class="master-sequence-index">${String(item.index + 1).padStart(2, '0')}</span>
            <span class="master-sequence-swatch"></span>
            <div class="master-sequence-copy"><strong>${masterSequenceEscape(name)}</strong><small>${masterSequenceEscape(kind)} · ${masterSequenceEscape(masterSequenceFormatSeconds(item.duration))}</small></div>
            <div class="master-sequence-move"><button type="button" data-master-move="-1" data-master-clip="${masterSequenceEscape(item.clip.id)}" ${item.index === 0 ? 'disabled' : ''} aria-label="${masterSequenceEscape(masterSequenceText('masterSequenceMoveEarlier', 'Move earlier'))}">←</button><button type="button" data-master-move="1" data-master-clip="${masterSequenceEscape(item.clip.id)}" ${item.index === sequence.length - 1 ? 'disabled' : ''} aria-label="${masterSequenceEscape(masterSequenceText('masterSequenceMoveLater', 'Move later'))}">→</button></div>
        </article>`;
    }).join('');
}

function syncMasterSequenceText() {
    const bindings = {
        'master-sequence-kicker': masterSequenceText('masterSequenceKicker', 'MASTER SEQUENCE'),
        'master-sequence-title': masterSequenceText('masterSequenceTitle', 'Sources play in this order'),
        'master-sequence-desc': masterSequenceText('masterSequenceDesc', 'Visual sources are appended automatically. Reorder them here; the simple timeline treats them as one continuous animation.')
    };
    Object.entries(bindings).forEach(([id, text]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    });
    renderMasterSequenceOverview();
}

function masterSequenceRenderFilmstrip() {
    if (!masterSequenceTimelineActive()) return false;
    const layout = masterSequenceLayout();
    filmstrip.innerHTML = '';
    const total = masterSequenceGetDuration();
    const pxPerSecond = Math.max(64, Math.min(120, 720 / Math.max(6, total)));
    let totalWidth = 0;
    layout.forEach(item => {
        const source = item.source;
        const width = Math.max(1, item.duration * pxPerSecond);
        totalWidth += width;
        const block = document.createElement('button');
        block.type = 'button';
        block.className = 'master-filmstrip-clip';
        block.dataset.masterClipId = item.clip.id;
        block.style.width = `${width}px`;
        block.style.flexBasis = `${width}px`;
        block.style.setProperty('--master-hue', String(masterSequenceHue(item.clip.sourceId)));
        const kind = source && source.kind === 'gif' ? 'GIF' : source && source.kind === 'image' ? masterSequenceText('sourceLibraryImage', 'Image') : source && source.kind === 'bootanimation' ? 'bootanimation.zip' : masterSequenceText('sourceLibraryVideo', 'Video');
        block.innerHTML = `<span class="master-filmstrip-order">${String(item.index + 1).padStart(2, '0')}</span><strong>${masterSequenceEscape(source ? source.name : '')}</strong><small>${masterSequenceEscape(kind)} · ${masterSequenceEscape(masterSequenceFormatSeconds(item.duration))}</small>`;
        block.addEventListener('click', event => {
            event.preventDefault();
            masterSequenceSeek(item.start, { scroll: true }).catch(() => {});
        });
        filmstrip.appendChild(block);
    });
    filmstrip.style.width = `${Math.max(totalWidth, 1)}px`;
    if (typeof renderTimelineRuler === 'function') renderTimelineRuler();
    return true;
}

function masterSequenceScrollToTime(time) {
    if (!masterSequenceTimelineActive() || !filmstrip.offsetWidth) return;
    const total = masterSequenceGetDuration();
    if (!(total > 0)) return;
    isProgrammaticScroll = true;
    scrollTimeline.scrollLeft = (Math.max(0, Math.min(total, time)) / total) * filmstrip.offsetWidth;
    setTimeout(() => { isProgrammaticScroll = false; }, 20);
}

async function masterSequenceSetElementSource(element, located, generation, isPreview = false) {
    if (!located || !window.BASSourceLibrary) return false;
    const previewState = masterSequenceRuntime.preview;
    if (isPreview) previewState.switching = true;
    else masterSequenceRuntime.switchingPlayer = true;
    try {
        const source = await BASSourceLibrary.setVideoElementSource(element, located.clip.sourceId);
        if (isPreview && generation !== previewState.generation) return false;
        if (!isPreview && generation !== masterSequenceRuntime.switchGeneration) return false;
        if (!source) return false;
        const previewTime = BASSourceLibrary.sourceTimeToPreview(located.clip.sourceId, located.sourceTime, element);
        const safe = Number.isFinite(element.duration) && element.duration > 0 ? Math.max(0, Math.min(previewTime, Math.max(0, element.duration - 0.001))) : Math.max(0, previewTime);
        if (Math.abs((element.currentTime || 0) - safe) > 0.004) {
            await new Promise(resolve => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    element.removeEventListener('seeked', finish);
                    element.removeEventListener('error', finish);
                    resolve();
                };
                element.addEventListener('seeked', finish, { once: true });
                element.addEventListener('error', finish, { once: true });
                setTimeout(finish, 900);
                element.currentTime = safe;
            });
        }
        if (isPreview) previewState.activeClipId = located.clip.id;
        else masterSequenceRuntime.activeClipId = located.clip.id;
        return true;
    } finally {
        if (isPreview && generation === previewState.generation) previewState.switching = false;
        if (!isPreview && generation === masterSequenceRuntime.switchGeneration) masterSequenceRuntime.switchingPlayer = false;
    }
}

async function masterSequenceSeek(time, options = {}) {
    if (!masterSequenceTimelineActive()) return false;
    const total = masterSequenceGetDuration();
    const safe = Math.max(0, Math.min(total, Number(time) || 0));
    const located = masterSequenceLocate(safe, safe >= total);
    if (!located) return false;
    const keepPlaying = !!options.keepPlaying;
    if (!keepPlaying) masterSequenceRuntime.playing = false;
    playerVideo.pause();
    masterSequenceRuntime.currentTime = safe;
    const generation = ++masterSequenceRuntime.switchGeneration;
    try {
        const ready = await masterSequenceSetElementSource(playerVideo, located, generation, false);
        if (!ready || generation !== masterSequenceRuntime.switchGeneration) return false;
        masterSequenceRuntime.currentTime = safe;
        if (typeof updatePlayerTimeReadout === 'function') updatePlayerTimeReadout(safe);
        if (options.scroll !== false) masterSequenceScrollToTime(safe);
        if (typeof applyFramingFocusVisuals === 'function') applyFramingFocusVisuals();
        if (keepPlaying && masterSequenceRuntime.playing) await playerVideo.play().catch(() => {});
        return true;
    } finally {
        if (generation === masterSequenceRuntime.switchGeneration) masterSequenceRuntime.switchingPlayer = false;
    }
}

function masterSequencePause() {
    masterSequenceRuntime.playing = false;
    playerVideo.pause();
    if (typeof syncTimelineTransportUi === 'function') syncTimelineTransportUi();
}

async function masterSequencePlay() {
    if (!masterSequenceTimelineActive() || isGenerating || isBuildingTimeline) return false;
    const total = masterSequenceGetDuration();
    if (!(total > 0)) return false;
    if (masterSequenceRuntime.currentTime >= total - 0.001) masterSequenceRuntime.currentTime = 0;
    masterSequenceRuntime.playing = true;
    const ok = await masterSequenceSeek(masterSequenceRuntime.currentTime, { keepPlaying: true, scroll: true });
    if (!ok) masterSequenceRuntime.playing = false;
    if (typeof syncTimelineTransportUi === 'function') syncTimelineTransportUi();
    return ok;
}

function masterSequenceTogglePlay() {
    if (masterSequenceRuntime.playing) masterSequencePause();
    else masterSequencePlay().catch(() => {});
}

function masterSequenceCurrentTimeFromPlayer() {
    if (!masterSequenceTimelineActive()) return Number(playerVideo.currentTime) || 0;
    const layout = masterSequenceLayout();
    const item = layout.find(entry => entry.clip.id === masterSequenceRuntime.activeClipId);
    if (!item || masterSequenceRuntime.switchingPlayer) return masterSequenceRuntime.currentTime;
    const sourceTime = window.BASSourceLibrary ? BASSourceLibrary.previewTimeToSource(item.clip.sourceId, playerVideo.currentTime || 0, playerVideo) : playerVideo.currentTime || 0;
    return Math.max(item.start, Math.min(item.end, item.start + Math.max(0, sourceTime - item.sourceIn)));
}

function masterSequenceGetCurrentTime() {
    const live = masterSequenceCurrentTimeFromPlayer();
    if (masterSequenceTimelineActive() && Number.isFinite(live)) masterSequenceRuntime.currentTime = live;
    return masterSequenceTimelineActive() ? masterSequenceRuntime.currentTime : Number(playerVideo.currentTime) || 0;
}

async function masterSequenceAdvance() {
    if (!masterSequenceRuntime.playing || masterSequenceRuntime.transitioning || !masterSequenceTimelineActive()) return;
    const layout = masterSequenceLayout();
    const index = layout.findIndex(item => item.clip.id === masterSequenceRuntime.activeClipId);
    if (index < 0) return;
    if (index >= layout.length - 1) {
        masterSequenceRuntime.currentTime = masterSequenceGetDuration();
        masterSequencePause();
        if (typeof updatePlayerTimeReadout === 'function') updatePlayerTimeReadout(masterSequenceRuntime.currentTime);
        masterSequenceScrollToTime(masterSequenceRuntime.currentTime);
        return;
    }
    masterSequenceRuntime.transitioning = true;
    const next = layout[index + 1];
    masterSequenceRuntime.currentTime = next.start;
    try {
        await masterSequenceSeek(next.start, { keepPlaying: true, scroll: true });
    } finally {
        masterSequenceRuntime.transitioning = false;
    }
}

function masterSequenceHandlePlayerTimeUpdate() {
    if (!masterSequenceTimelineActive() || masterSequenceRuntime.switchingPlayer) return false;
    const layout = masterSequenceLayout();
    const item = layout.find(entry => entry.clip.id === masterSequenceRuntime.activeClipId);
    if (!item) return true;
    const sourceTime = window.BASSourceLibrary ? BASSourceLibrary.previewTimeToSource(item.clip.sourceId, playerVideo.currentTime || 0, playerVideo) : playerVideo.currentTime || 0;
    masterSequenceRuntime.currentTime = Math.max(item.start, Math.min(item.end, item.start + Math.max(0, sourceTime - item.sourceIn)));
    if (masterSequenceRuntime.playing && sourceTime >= Math.max(item.sourceIn, item.sourceOut - 0.025)) masterSequenceAdvance().catch(() => {});
    return true;
}

function masterSequenceHandlePlayerEnded() {
    if (!masterSequenceTimelineActive()) return false;
    if (masterSequenceRuntime.playing) masterSequenceAdvance().catch(() => {});
    return true;
}

function masterSequenceIsPlayerSwitching() {
    return !!masterSequenceRuntime.switchingPlayer;
}

function masterSequenceIsPlaying() {
    return masterSequenceTimelineActive() ? !!masterSequenceRuntime.playing : !playerVideo.paused;
}

function masterSequenceGetGlobalRangeSegments(start, end) {
    const from = Math.max(0, Number(start) || 0);
    const to = Math.max(from, Number(end) || from);
    return masterSequenceLayout().map(item => {
        const intersectionStart = Math.max(from, item.start);
        const intersectionEnd = Math.min(to, item.end);
        if (intersectionEnd <= intersectionStart) return null;
        return {
            ...item,
            globalStart: intersectionStart,
            globalEnd: intersectionEnd,
            sourceStart: item.sourceIn + intersectionStart - item.start,
            sourceEnd: item.sourceIn + intersectionEnd - item.start,
            destinationStart: intersectionStart - from
        };
    }).filter(Boolean);
}

async function masterSequenceFrameBlob(globalTime, width, height, format, framing, framingFocus, jpegQuality) {
    const total = masterSequenceGetDuration();
    const located = masterSequenceLocate(globalTime, Number(globalTime) >= total - 0.000001);
    if (!located || !window.BASSourceLibrary) throw new Error(masterSequenceText('masterSequenceMissingSource', 'A source in the sequence is unavailable.'));
    const sourceTime = Math.min(Math.max(0, located.duration - 0.0001), located.sourceTime);
    return await BASSourceLibrary.frameBlob(located.clip.sourceId, sourceTime, width, height, format, framing, framingFocus, jpegQuality);
}

async function masterSequenceAudioBlob(start, end, audioCtx, volume = 1, options = {}) {
    if (!window.BASSourceLibrary || !audioCtx) return null;
    const segments = masterSequenceGetGlobalRangeSegments(start, end);
    const rangeDuration = Math.max(0, Number(end) - Number(start));
    if (!segments.length || !(rangeDuration > 0)) return null;
    const decoded = new Map();
    let hasAudio = false;
    for (const segment of segments) {
        const blob = BASSourceLibrary.getVideoAudioBlob(segment.clip.sourceId);
        if (!(blob instanceof Blob)) continue;
        if (!decoded.has(segment.clip.sourceId)) decoded.set(segment.clip.sourceId, await decodificarAudioFonte(blob, audioCtx));
        if (decoded.get(segment.clip.sourceId)) hasAudio = true;
    }
    if (!hasAudio) return null;
    const OfflineClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineClass) return null;
    const sampleRate = Math.max(22050, Number(audioCtx.sampleRate) || 48000);
    const offline = new OfflineClass(2, Math.max(1, Math.ceil(rangeDuration * sampleRate)), sampleRate);
    segments.forEach(segment => {
        const buffer = decoded.get(segment.clip.sourceId);
        if (!buffer) return;
        const sourceOffset = Math.max(0, segment.sourceStart);
        const available = Math.max(0, buffer.duration - sourceOffset);
        const duration = Math.min(segment.globalEnd - segment.globalStart, available);
        if (!(duration > 0)) return;
        const node = offline.createBufferSource();
        node.buffer = buffer;
        node.connect(offline.destination);
        node.start(Math.max(0, segment.destinationStart), sourceOffset, duration);
    });
    const combined = await offline.startRendering();
    return await fatiarEGerarWav(combined, 0, rangeDuration, audioCtx, volume, options);
}

function masterSequenceGetSamplePoints(limit = 3) {
    const layout = masterSequenceLayout();
    if (!layout.length) return [];
    const count = Math.min(Math.max(1, limit), layout.length);
    const indexes = [];
    for (let i = 0; i < count; i++) indexes.push(count === 1 ? 0 : Math.round(i * (layout.length - 1) / (count - 1)));
    return [...new Set(indexes)].map(index => {
        const item = layout[index];
        return { sourceId: item.clip.sourceId, time: item.sourceIn + item.duration * 0.5 };
    });
}

async function masterSequencePreviewSetSource(globalTime, play = true) {
    const state = masterSequenceRuntime.preview;
    if (!state.active || !state.element) return false;
    const located = masterSequenceLocate(globalTime, globalTime >= state.end);
    if (!located) return false;
    const generation = state.generation;
    state.time = Math.max(state.start, Math.min(state.end, globalTime));
    const ready = await masterSequenceSetElementSource(state.element, located, generation, true);
    if (!ready || generation !== state.generation || !state.active) return false;
    if (play) await state.element.play().catch(() => {});
    return true;
}

async function masterSequenceStartModalPreview(element, start, end) {
    if (!masterSequenceHasMultipleClips() || !element) return false;
    const total = masterSequenceGetDuration();
    const state = masterSequenceRuntime.preview;
    state.generation += 1;
    state.active = true;
    state.element = element;
    state.start = Math.max(0, Math.min(total, Number(start) || 0));
    state.end = Math.max(state.start, Math.min(total, Number(end) || total));
    state.time = state.start;
    state.activeClipId = '';
    state.switching = false;
    state.transitioning = false;
    state.looped = false;
    element.muted = true;
    return await masterSequencePreviewSetSource(state.start, false);
}

function masterSequenceStopModalPreview() {
    const state = masterSequenceRuntime.preview;
    state.generation += 1;
    state.active = false;
    state.switching = false;
    state.transitioning = false;
    state.activeClipId = '';
    if (state.element) state.element.pause();
    state.element = null;
}

async function masterSequenceAdvanceModalPreview() {
    const state = masterSequenceRuntime.preview;
    if (!state.active || state.transitioning || !state.element) return;
    state.transitioning = true;
    const layout = masterSequenceLayout();
    const currentIndex = layout.findIndex(item => item.clip.id === state.activeClipId);
    const current = currentIndex >= 0 ? layout[currentIndex] : masterSequenceLocate(state.time);
    let target = current ? current.end : state.start;
    if (target >= state.end - 0.001 || currentIndex >= layout.length - 1) {
        target = state.start;
        state.looped = true;
    }
    try {
        await masterSequencePreviewSetSource(target, true);
    } finally {
        state.transitioning = false;
    }
}

function masterSequenceHandleModalPreviewTimeUpdate(element) {
    const state = masterSequenceRuntime.preview;
    if (!state.active || state.element !== element || state.switching) return null;
    const layout = masterSequenceLayout();
    const item = layout.find(entry => entry.clip.id === state.activeClipId);
    if (!item) return { active: true, time: state.time, looped: false };
    const sourceTime = window.BASSourceLibrary ? BASSourceLibrary.previewTimeToSource(item.clip.sourceId, element.currentTime || 0, element) : element.currentTime || 0;
    state.time = Math.max(item.start, Math.min(item.end, item.start + Math.max(0, sourceTime - item.sourceIn)));
    const looped = state.looped;
    state.looped = false;
    if (state.time >= state.end - 0.02 || sourceTime >= item.sourceOut - 0.02) masterSequenceAdvanceModalPreview().catch(() => {});
    return { active: true, time: state.time, looped };
}

function masterSequenceModalPreviewActive() {
    return !!masterSequenceRuntime.preview.active;
}

function masterSequenceCreateAdvancedParts(nextId, cloneAudioState) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    return masterSequenceLayout().map((item, index) => ({
        id: nextId(),
        label: item.source && item.source.name ? item.source.name.replace(/\.[^.]+$/, '') : `${t.advDefaultPart} ${index + 1}`,
        folder: `part${index}`,
        type: 'c',
        repeat: 1,
        pause: 0,
        sourceId: item.clip.sourceId,
        start: item.sourceIn,
        end: item.sourceOut,
        extraTokens: [],
        audio: cloneAudioState ? cloneAudioState() : { mode: 'none', volume: 100, fadeIn: 0, fadeOut: 0, delay: 0, sourceIn: 0, endTrim: 0, normalize: false, source: null, sourceName: '', sourceKind: 'none', sourceLibraryId: '' }
    })).filter(part => part.end > part.start);
}

function masterSequenceRefreshTimeline(options = {}) {
    renderMasterSequenceOverview();
    const active = masterSequenceTimelineActive();
    if (active) {
        masterSequenceRuntime.wasTimelineActive = true;
        if (typeof desenharFilmstrip === 'function') desenharFilmstrip().catch(() => {});
        if (options.seekToStart) masterSequenceSeek(0, { scroll: true }).catch(() => {});
    } else if (masterSequenceRuntime.wasTimelineActive && currentProject && window.BASSourceLibrary) {
        masterSequenceRuntime.wasTimelineActive = false;
        masterSequenceRuntime.playing = false;
        masterSequenceRuntime.currentTime = 0;
        const primaryId = BASSourceLibrary.getPrimaryId();
        if (primaryId) {
            masterSequenceRuntime.switchGeneration += 1;
            masterSequenceRuntime.switchingPlayer = false;
            BASSourceLibrary.setVideoElementSource(playerVideo, primaryId).then(() => {
                playerVideo.currentTime = 0;
                if (typeof desenharFilmstrip === 'function') desenharFilmstrip().catch(() => {});
            }).catch(() => {});
        }
    }
    if (typeof renderSimpleSegmentTrack === 'function') renderSimpleSegmentTrack();
    if (typeof atualizarBotoesELinhas === 'function') atualizarBotoesELinhas();
}

function initializeMasterSequenceForProject() {
    if (masterSequenceRuntime.projectRef !== currentProject) {
        masterSequenceRuntime.projectRef = currentProject;
        masterSequenceRuntime.currentTime = 0;
        masterSequenceRuntime.activeClipId = '';
        masterSequenceRuntime.playing = false;
        masterSequenceRuntime.switchingPlayer = false;
        masterSequenceRuntime.transitioning = false;
        masterSequenceRuntime.wasTimelineActive = false;
        masterSequenceStopModalPreview();
    }
    if (currentProject) ensureProjectMasterSequence();
    renderMasterSequenceOverview();
}

function bindMasterSequence() {
    if (masterSequenceRuntime.initialized) return;
    masterSequenceRuntime.initialized = true;
    document.getElementById('master-sequence-list')?.addEventListener('click', event => {
        const button = event.target.closest('[data-master-move]');
        if (!button || button.disabled) return;
        masterSequenceMoveClip(button.dataset.masterClip, Number(button.dataset.masterMove));
    });
    playerVideo.addEventListener('ended', () => masterSequenceHandlePlayerEnded());
    initializeMasterSequenceForProject();
    syncMasterSequenceText();
}

window.BASMasterSequence = Object.freeze({
    initializeCurrentProject: initializeMasterSequenceForProject,
    ensure: ensureProjectMasterSequence,
    serialize: masterSequenceSerialize,
    restoreState: masterSequenceRestoreState,
    appendSource: masterSequenceAppendSource,
    removeSource: masterSequenceRemoveSource,
    moveClip: masterSequenceMoveClip,
    setClipRange: masterSequenceSetClipRange,
    indexOfSource: masterSequenceIndexOfSource,
    hasMultipleClips: masterSequenceHasMultipleClips,
    isTimelineActive: masterSequenceTimelineActive,
    getDuration: masterSequenceGetDuration,
    getLayout: masterSequenceLayout,
    getCurrentTime: masterSequenceGetCurrentTime,
    seek: masterSequenceSeek,
    pause: masterSequencePause,
    play: masterSequencePlay,
    togglePlay: masterSequenceTogglePlay,
    isPlaying: masterSequenceIsPlaying,
    isPlayerSwitching: masterSequenceIsPlayerSwitching,
    handlePlayerTimeUpdate: masterSequenceHandlePlayerTimeUpdate,
    handlePlayerEnded: masterSequenceHandlePlayerEnded,
    renderFilmstrip: masterSequenceRenderFilmstrip,
    render: renderMasterSequenceOverview,
    syncText: syncMasterSequenceText,
    frameBlob: masterSequenceFrameBlob,
    audioBlob: masterSequenceAudioBlob,
    getSamplePoints: masterSequenceGetSamplePoints,
    getRangeSegments: masterSequenceGetGlobalRangeSegments,
    startModalPreview: masterSequenceStartModalPreview,
    stopModalPreview: masterSequenceStopModalPreview,
    handleModalPreviewTimeUpdate: masterSequenceHandleModalPreviewTimeUpdate,
    isModalPreviewActive: masterSequenceModalPreviewActive,
    createAdvancedParts: masterSequenceCreateAdvancedParts,
    refreshTimeline: masterSequenceRefreshTimeline
});
window.initializeMasterSequenceForProject = initializeMasterSequenceForProject;
window.renderMasterSequenceOverview = renderMasterSequenceOverview;
window.syncMasterSequenceText = syncMasterSequenceText;
window.addEventListener('DOMContentLoaded', bindMasterSequence);
