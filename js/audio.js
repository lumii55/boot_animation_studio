function audioBufferToWav(buffer) {
    let numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferData = new ArrayBuffer(length),
        view = new DataView(bufferData),
        channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(offset, data, true); offset += 2; }
    function setUint32(data) { view.setUint32(offset, data, true); offset += 4; }

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); 
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan); 
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4); 

    for(i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while(pos < buffer.length) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
        pos++;
    }
    return new Blob([bufferData], { type: "audio/wav" });
}

const decodedAudioBufferCache = new WeakMap();

async function decodificarAudioFonte(fonte, audioCtx) {
    try {
        if (fonte instanceof Blob && decodedAudioBufferCache.has(fonte)) return await decodedAudioBufferCache.get(fonte);
        const decode = async () => {
            let arrBuf;
            if (fonte instanceof Blob) {
                arrBuf = await fonte.arrayBuffer();
            } else if (typeof fonte === 'string' && fonte.length > 0) {
                const res = await fetch(fonte);
                arrBuf = await res.arrayBuffer();
            } else {
                return null;
            }
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            return await new Promise((resolve) => {
                const res = audioCtx.decodeAudioData(arrBuf, resolve, () => resolve(null));
                if (res && res.then) res.then(resolve).catch(() => resolve(null));
            });
        };
        if (fonte instanceof Blob) {
            const promise = decode().then(buffer => {
                if (!buffer) decodedAudioBufferCache.delete(fonte);
                return buffer;
            }).catch(() => {
                decodedAudioBufferCache.delete(fonte);
                return null;
            });
            decodedAudioBufferCache.set(fonte, promise);
            return await promise;
        }
        return await decode();
    } catch (e) {
        console.error("Failed to decode audio source:", e);
        return null;
    }
}

function normalizeAudioProcessingOptions(options = {}) {
    const legacyOffset = clampAudioControlValue(options.offset, -86400, 86400, 0);
    const hasDelay = options.delay !== undefined && options.delay !== null;
    const hasSourceIn = options.sourceIn !== undefined && options.sourceIn !== null;
    return {
        fadeIn: clampAudioControlValue(options.fadeIn, 0, 5, 0),
        fadeOut: clampAudioControlValue(options.fadeOut, 0, 5, 0),
        delay: clampAudioControlValue(hasDelay ? options.delay : Math.max(0, legacyOffset), 0, 86400, 0),
        sourceIn: clampAudioControlValue(hasSourceIn ? options.sourceIn : Math.max(0, -legacyOffset), 0, 86400, 0),
        endTrim: clampAudioControlValue(options.endTrim, 0, 86400, 0),
        normalize: !!options.normalize
    };
}

function createAudioRenderPlan(bufferDuration, startSec, endSec, options = {}) {
    const advanced = normalizeAudioProcessingOptions(options);
    const requestedStart = Math.max(0, Number(startSec) || 0);
    const requestedEnd = Math.max(requestedStart, Number(endSec) || requestedStart);
    const outputDuration = Math.max(0, requestedEnd - requestedStart);
    const destinationStart = Math.min(outputDuration, Math.max(0, advanced.delay));
    const sourceStart = Math.min(Math.max(0, bufferDuration), requestedStart + Math.max(0, advanced.sourceIn));
    const sourceAvailable = Math.max(0, bufferDuration - sourceStart);
    const destinationEnd = Math.max(destinationStart, outputDuration - advanced.endTrim);
    const destinationAvailable = Math.max(0, destinationEnd - destinationStart);
    const sourceWindow = Math.max(0, requestedEnd - sourceStart);
    const playDuration = Math.max(0, Math.min(sourceAvailable, destinationAvailable, sourceWindow));
    let fadeIn = Math.min(advanced.fadeIn, playDuration);
    let fadeOut = Math.min(advanced.fadeOut, playDuration);
    const fadeTotal = fadeIn + fadeOut;
    if (fadeTotal > playDuration && fadeTotal > 0) {
        const scale = playDuration / fadeTotal;
        fadeIn *= scale;
        fadeOut *= scale;
    }
    return {
        outputDuration,
        destinationStart,
        sourceStart,
        playDuration,
        fadeIn,
        fadeOut,
        normalize: advanced.normalize
    };
}

function getAudioBufferPeak(audioBuf, startSec, durationSec) {
    if (!audioBuf || durationSec <= 0) return 0;
    const sampleRate = audioBuf.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sampleRate));
    const end = Math.min(audioBuf.length, Math.ceil((startSec + durationSec) * sampleRate));
    const frames = Math.max(0, end - start);
    if (frames <= 0) return 0;
    let peak = 0;
    for (let channel = 0; channel < audioBuf.numberOfChannels; channel++) {
        const data = audioBuf.getChannelData(channel);
        for (let i = start; i < end; i++) {
            const value = Math.abs(data[i]);
            if (value > peak) peak = value;
        }
    }
    return peak;
}

async function fatiarEGerarWav(audioBuf, startSec, endSec, audioCtx, volume = 1.0, advancedOptions = {}) {
    if (!audioBuf) return null;
    try {
        const sampleRate = audioBuf.sampleRate;
        const plan = createAudioRenderPlan(audioBuf.duration, startSec, endSec, advancedOptions);
        if (plan.outputDuration <= 0) return null;

        const totalFrames = Math.max(1, Math.floor(plan.outputDuration * sampleRate));
        const channels = Math.max(1, audioBuf.numberOfChannels);
        const offlineCtx = new OfflineAudioContext(channels, totalFrames, sampleRate);
        const gainNode = offlineCtx.createGain();
        let normalizeGain = 1;

        if (plan.normalize && plan.playDuration > 0) {
            const peak = getAudioBufferPeak(audioBuf, plan.sourceStart, plan.playDuration);
            if (peak > 0.00001) normalizeGain = Math.min(8, 0.95 / peak);
        }

        const finalGain = Math.max(0, Number(volume) || 0) * normalizeGain;
        gainNode.gain.setValueAtTime(finalGain, 0);
        gainNode.connect(offlineCtx.destination);

        if (plan.playDuration > 0) {
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuf;
            source.connect(gainNode);
            const audioStart = plan.destinationStart;
            const audioEnd = audioStart + plan.playDuration;

            if (plan.fadeIn > 0) {
                gainNode.gain.setValueAtTime(0, audioStart);
                gainNode.gain.linearRampToValueAtTime(finalGain, audioStart + plan.fadeIn);
            } else {
                gainNode.gain.setValueAtTime(finalGain, audioStart);
            }

            if (plan.fadeOut > 0) {
                gainNode.gain.setValueAtTime(finalGain, Math.max(audioStart, audioEnd - plan.fadeOut));
                gainNode.gain.linearRampToValueAtTime(0, audioEnd);
            }

            source.start(audioStart, plan.sourceStart, plan.playDuration);
        }

        const rendered = await offlineCtx.startRendering();
        return audioBufferToWav(rendered);
    } catch (e) {
        console.error("Failed to process audio segment:", e);
        return null;
    }
}

let previewAudioBuildGeneration = 0;

function cancelPreviewAudioBuild() {
    previewAudioBuildGeneration++;
}

async function preparePreviewAudioFromCurrentState(audioState = captureAudioEditorState()) {
    const generation = ++previewAudioBuildGeneration;
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);
    if (!audioState.enabled) return;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let videoAudioBuffer = null;
    const definitions = [
        { role: 'intro', preview: 'm0', start: marcadores.m0, end: marcadores.m1 },
        { role: 'loop', preview: 'm1', start: marcadores.m1, end: marcadores.m2 },
        { role: 'final', preview: 'm2', start: marcadores.m2, end: marcadores.m3 }
    ];

    try {
        const needsVideo = definitions.some(definition => audioState[definition.role].mode === 'video');
        const masterAudio = window.BASMasterSequence && BASMasterSequence.isTimelineActive();
        if (needsVideo && !masterAudio) videoAudioBuffer = await decodificarAudioFonte(currentProject && currentProject.sourceBlob ? currentProject.sourceBlob : playerVideo.src, audioCtx);

        for (const definition of definitions) {
            if (generation !== previewAudioBuildGeneration) return;
            const state = audioState[definition.role];
            if (!state || state.mode === 'none') continue;
            let blob = null;

            if (state.mode === 'video') {
                if (masterAudio && Number.isFinite(definition.start) && Number.isFinite(definition.end)) {
                    blob = await BASMasterSequence.audioBlob(definition.start, definition.end, audioCtx, state.volume / 100, state);
                } else if (videoAudioBuffer && Number.isFinite(definition.start) && Number.isFinite(definition.end)) {
                    blob = await fatiarEGerarWav(videoAudioBuffer, definition.start, definition.end, audioCtx, state.volume / 100, state);
                }
            } else if (state.mode === 'file') {
                const source = getSelectedAudioFile(definition.role);
                const decoded = await decodificarAudioFonte(source, audioCtx);
                if (decoded) blob = await fatiarEGerarWav(decoded, 0, Math.max(0.001, definition.end - definition.start), audioCtx, state.volume / 100, state);
            }

            if (generation !== previewAudioBuildGeneration) return;
            if (blob) setPreviewAudio(definition.preview, blob);
        }
        if (generation === previewAudioBuildGeneration && typeof getEditorAudioPreviewSignature === 'function') {
            editorAudioPreviewSignature = getEditorAudioPreviewSignature(audioState);
        }
    } finally {
        videoAudioBuffer = null;
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

let audioStudioPreviewAudio = null;
let audioStudioPreviewUrl = null;
let audioStudioPreviewRole = '';
let audioStudioPreviewBlob = null;
let audioStudioPreviewBuilding = false;

function formatAudioStudioClock(value) {
    const seconds = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

function getAudioStudioTransportElements(role) {
    return {
        root: document.getElementById(`audio-studio-transport-${role}`),
        button: document.getElementById(`audio-studio-preview-${role}`),
        progress: document.getElementById(`audio-studio-progress-${role}`),
        current: document.getElementById(`audio-studio-time-current-${role}`),
        total: document.getElementById(`audio-studio-time-total-${role}`)
    };
}

function setAudioStudioTransportState(role, state = 'idle') {
    ['intro', 'loop', 'final'].forEach(candidate => {
        const els = getAudioStudioTransportElements(candidate);
        if (!els.root || !els.button) return;
        const active = candidate === role;
        els.root.dataset.state = active ? state : 'idle';
        els.button.classList.toggle('is-playing', active && state === 'playing');
        els.button.classList.toggle('is-loading', active && state === 'loading');
        els.button.disabled = active && state === 'loading';
        const table = traducoes[idiomaAtual] || traducoes.en;
        const label = active && state === 'playing'
            ? (table.audioStudioPause || 'Pause audio')
            : active && state === 'loading'
                ? (table.audioStudioLoading || 'Preparing audio')
                : (table.audioStudioPlay || 'Play audio');
        els.button.setAttribute('aria-label', label);
    });
}

function syncAudioStudioTransportProgress() {
    if (!audioStudioPreviewRole) return;
    const els = getAudioStudioTransportElements(audioStudioPreviewRole);
    if (!els.progress || !audioStudioPreviewAudio) return;
    const duration = Number.isFinite(audioStudioPreviewAudio.duration) ? audioStudioPreviewAudio.duration : 0;
    const current = Math.max(0, Math.min(duration || Infinity, Number(audioStudioPreviewAudio.currentTime) || 0));
    els.progress.max = String(Math.max(0.001, duration || 0.001));
    els.progress.value = String(current);
    if (els.current) els.current.textContent = formatAudioStudioClock(current);
    if (els.total) els.total.textContent = formatAudioStudioClock(duration);
    if (typeof updateAudioWaveformPlayhead === 'function') updateAudioWaveformPlayhead(audioStudioPreviewRole, current, duration);
}

function resetAudioStudioTransportProgress(role) {
    const els = getAudioStudioTransportElements(role);
    if (els.progress) {
        els.progress.max = '1';
        els.progress.value = '0';
    }
    if (els.current) els.current.textContent = '0:00.0';
    if (els.total) els.total.textContent = '0:00.0';
}

function disposeAudioStudioPreview() {
    const previousRole = audioStudioPreviewRole;
    if (audioStudioPreviewAudio) {
        audioStudioPreviewAudio.pause();
        audioStudioPreviewAudio.removeAttribute('src');
        audioStudioPreviewAudio.load();
        audioStudioPreviewAudio = null;
    }
    if (audioStudioPreviewUrl) {
        URL.revokeObjectURL(audioStudioPreviewUrl);
        audioStudioPreviewUrl = null;
    }
    audioStudioPreviewRole = '';
    audioStudioPreviewBlob = null;
    audioStudioPreviewBuilding = false;
    if (previousRole) resetAudioStudioTransportProgress(previousRole);
    setAudioStudioTransportState('', 'idle');
}

function stopAudioStudioPreview(options = {}) {
    const reset = options.reset !== false;
    if (!audioStudioPreviewAudio) {
        if (reset) disposeAudioStudioPreview();
        return;
    }
    audioStudioPreviewAudio.pause();
    if (reset) disposeAudioStudioPreview();
    else setAudioStudioTransportState(audioStudioPreviewRole, 'paused');
}

async function buildAudioStudioRoleBlob(role, audioState = captureAudioEditorState()) {
    if (!audioState || !audioState.enabled || !audioState[role] || audioState[role].mode === 'none') return null;
    const ranges = {
        intro: [marcadores.m0, marcadores.m1],
        loop: [marcadores.m1, marcadores.m2],
        final: [marcadores.m2, marcadores.m3]
    };
    const range = ranges[role];
    if (!range || !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[1] <= range[0]) return null;
    const state = audioState[role];
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        if (state.mode === 'video') {
            if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return await BASMasterSequence.audioBlob(range[0], range[1], audioCtx, state.volume / 100, state);
            const decoded = await decodificarAudioFonte(currentProject && currentProject.sourceBlob ? currentProject.sourceBlob : playerVideo.src, audioCtx);
            if (!decoded) return null;
            return await fatiarEGerarWav(decoded, range[0], range[1], audioCtx, state.volume / 100, state);
        }
        if (state.mode === 'file') {
            const source = getSelectedAudioFile(role);
            const decoded = await decodificarAudioFonte(source, audioCtx);
            if (!decoded) return null;
            return await fatiarEGerarWav(decoded, 0, Math.max(0.001, range[1] - range[0]), audioCtx, state.volume / 100, state);
        }
        return null;
    } finally {
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

function attachAudioStudioPreviewEvents(role) {
    if (!audioStudioPreviewAudio) return;
    audioStudioPreviewAudio.addEventListener('loadedmetadata', syncAudioStudioTransportProgress);
    audioStudioPreviewAudio.addEventListener('durationchange', syncAudioStudioTransportProgress);
    audioStudioPreviewAudio.addEventListener('timeupdate', syncAudioStudioTransportProgress);
    audioStudioPreviewAudio.addEventListener('play', () => setAudioStudioTransportState(role, 'playing'));
    audioStudioPreviewAudio.addEventListener('pause', () => {
        if (!audioStudioPreviewAudio || audioStudioPreviewAudio.ended) return;
        setAudioStudioTransportState(role, 'paused');
    });
    audioStudioPreviewAudio.addEventListener('ended', () => {
        if (!audioStudioPreviewAudio) return;
        audioStudioPreviewAudio.currentTime = 0;
        syncAudioStudioTransportProgress();
        setAudioStudioTransportState(role, 'paused');
    });
}

async function ensureAudioStudioPreview(role) {
    if (audioStudioPreviewAudio && audioStudioPreviewRole === role && audioStudioPreviewBlob) return true;
    if (audioStudioPreviewBuilding) return false;
    disposeAudioStudioPreview();
    audioStudioPreviewBuilding = true;
    audioStudioPreviewRole = role;
    setAudioStudioTransportState(role, 'loading');
    const blob = await buildAudioStudioRoleBlob(role).catch(() => null);
    audioStudioPreviewBuilding = false;
    if (!blob || audioStudioPreviewRole !== role) {
        disposeAudioStudioPreview();
        const t = traducoes[idiomaAtual] || traducoes.en;
        if (typeof showToast === 'function') showToast(t.audioStudioPreviewUnavailable || 'No audio is available for this section.', 'warning');
        return false;
    }
    audioStudioPreviewBlob = blob;
    if (typeof primeAudioWaveformFromBlob === 'function') primeAudioWaveformFromBlob(role, false, blob).catch(() => {});
    audioStudioPreviewAudio = new Audio();
    audioStudioPreviewUrl = URL.createObjectURL(blob);
    audioStudioPreviewAudio.preload = 'auto';
    audioStudioPreviewAudio.src = audioStudioPreviewUrl;
    attachAudioStudioPreviewEvents(role);
    audioStudioPreviewAudio.load();
    setAudioStudioTransportState(role, 'paused');
    return true;
}

async function toggleAudioStudioPreview(role) {
    if (audioStudioPreviewAudio && audioStudioPreviewRole === role && !audioStudioPreviewAudio.paused) {
        stopAudioStudioPreview({ reset: false });
        return true;
    }
    const ready = await ensureAudioStudioPreview(role);
    if (!ready || !audioStudioPreviewAudio) return false;
    if (audioStudioPreviewAudio.ended) audioStudioPreviewAudio.currentTime = 0;
    await audioStudioPreviewAudio.play().catch(() => {});
    syncAudioStudioTransportProgress();
    return !audioStudioPreviewAudio.paused;
}

function seekAudioStudioPreview(role, value) {
    if (!audioStudioPreviewAudio || audioStudioPreviewRole !== role) return;
    const duration = Number.isFinite(audioStudioPreviewAudio.duration) ? audioStudioPreviewAudio.duration : 0;
    audioStudioPreviewAudio.currentTime = Math.max(0, Math.min(duration, Number(value) || 0));
    syncAudioStudioTransportProgress();
}

async function previewAudioStudioRole(role) {
    return toggleAudioStudioPreview(role);
}





const audioWaveformRuntime = {
    cache: new Map(),
    roleZoom: { intro: 1, loop: 1, final: 1 },
    refreshTimers: new Map(),
    pointers: new Map(),
    pinch: null,
    generation: 0
};

let editorAudioPreviewSignature = '';
let editorAudioPreviewBuildPromise = null;
let editorAudioPreviewActiveRole = '';
let editorAudioPreviewDirectVideo = false;

function audioStudioBlobIdentity(blob) {
    if (!(blob instanceof Blob)) return 'none';
    return [blob.name || '', blob.size || 0, blob.type || '', blob.lastModified || 0].join(':');
}

function audioStudioRoleRange(role) {
    const total = Math.max(0, Number.isFinite(Number(marcadores.m3)) ? Number(marcadores.m3) : (typeof getTimelineDurationExact === 'function' ? getTimelineDurationExact() : 0));
    const ranges = {
        intro: [Number(marcadores.m0) || 0, Number(marcadores.m1) || 0],
        loop: [Number(marcadores.m1) || 0, Number(marcadores.m2) || 0],
        final: [Number(marcadores.m2) || 0, total]
    };
    return ranges[role] || [0, 0];
}

function audioStudioStateSignature(role, state = null) {
    const audioState = state || captureAudioEditorState();
    const roleState = audioState && audioState[role] ? audioState[role] : {};
    const source = roleState.mode === 'file' ? getSelectedAudioFile(role) : (currentProject && currentProject.sourceBlob ? currentProject.sourceBlob : null);
    const range = audioStudioRoleRange(role);
    return JSON.stringify({
        role,
        range,
        mode: roleState.mode || 'none',
        volume: Number(roleState.volume) || 0,
        fadeIn: Number(roleState.fadeIn) || 0,
        fadeOut: Number(roleState.fadeOut) || 0,
        delay: Number(roleState.delay) || 0,
        sourceIn: Number(roleState.sourceIn) || 0,
        endTrim: Number(roleState.endTrim) || 0,
        normalize: !!roleState.normalize,
        source: audioStudioBlobIdentity(source),
        master: window.BASMasterSequence && BASMasterSequence.isTimelineActive() ? BASMasterSequence.serialize() : null
    });
}

function getEditorAudioPreviewSignature(state = null) {
    const audioState = state || captureAudioEditorState();
    return JSON.stringify({
        enabled: !!audioState.enabled,
        markers: ['m0', 'm1', 'm2', 'm3'].map(key => marcadores[key] == null ? null : Number(marcadores[key])),
        roles: ['intro', 'loop', 'final'].map(role => audioStudioStateSignature(role, audioState))
    });
}

function pauseEditorPreviewAudio() {
    ['m0', 'm1', 'm2'].forEach(key => {
        const audio = previewAudios[key];
        if (audio) audio.pause();
    });
    editorAudioPreviewActiveRole = '';
    editorAudioPreviewDirectVideo = false;
    if (playerVideo) {
        playerVideo.muted = true;
        playerVideo.volume = 1;
    }
}

function invalidateAudioPreviewState(options = {}) {
    cancelPreviewAudioBuild();
    editorAudioPreviewSignature = '';
    if (editorAudioPreviewBuildPromise) editorAudioPreviewBuildPromise = null;
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);
    pauseEditorPreviewAudio();
    if (options.transport !== false) stopAudioStudioPreview();
    if (options.waveforms !== false) {
        audioWaveformRuntime.generation += 1;
        audioWaveformRuntime.cache.clear();
        ['intro', 'loop', 'final'].forEach(role => scheduleAudioWaveformRefresh(role, 80));
    }
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    if (playerVideo && !playerVideo.paused) ensureEditorPreviewAudioReady().then(() => syncEditorPreviewAudio(true)).catch(() => {});
}

function notifyAudioMarkersChanged() {
    invalidateAudioPreviewState({ transport: true, waveforms: true });
}

async function ensureEditorPreviewAudioReady() {
    const state = captureAudioEditorState();
    const signature = getEditorAudioPreviewSignature(state);
    if (editorAudioPreviewSignature === signature) return true;
    if (editorAudioPreviewBuildPromise) return editorAudioPreviewBuildPromise;
    editorAudioPreviewBuildPromise = preparePreviewAudioFromCurrentState(state).then(() => editorAudioPreviewSignature === signature).catch(() => false).finally(() => {
        editorAudioPreviewBuildPromise = null;
    });
    return editorAudioPreviewBuildPromise;
}

function editorAudioRoleAtTime(time) {
    const t = Math.max(0, Number(time) || 0);
    const definitions = [
        { role: 'intro', key: 'm0', start: Number(marcadores.m0), end: Number(marcadores.m1) },
        { role: 'loop', key: 'm1', start: Number(marcadores.m1), end: Number(marcadores.m2) },
        { role: 'final', key: 'm2', start: Number(marcadores.m2), end: Number(marcadores.m3) }
    ];
    return definitions.find(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && t >= item.start && t < item.end) || null;
}

function directVideoAudioCompatible(state) {
    if (!state || state.mode !== 'video' || state.normalize) return false;
    return Math.abs((Number(state.sourceIn) || 0) - (Number(state.delay) || 0)) < 0.015;
}

function directVideoAudioGain(state, localTime, roleDuration) {
    const delay = Math.max(0, Number(state.delay) || 0);
    const endTrim = Math.max(0, Number(state.endTrim) || 0);
    const start = delay;
    const end = Math.max(start, roleDuration - endTrim);
    if (localTime < start || localTime >= end) return 0;
    const audible = localTime - start;
    const audibleDuration = Math.max(0, end - start);
    let gain = Math.max(0, Math.min(1, (Number(state.volume) || 0) / 100));
    const fadeIn = Math.min(audibleDuration, Math.max(0, Number(state.fadeIn) || 0));
    const fadeOut = Math.min(audibleDuration, Math.max(0, Number(state.fadeOut) || 0));
    if (fadeIn > 0 && audible < fadeIn) gain *= audible / fadeIn;
    if (fadeOut > 0 && audible > audibleDuration - fadeOut) gain *= Math.max(0, (audibleDuration - audible) / fadeOut);
    return Math.max(0, Math.min(1, gain));
}

function syncEditorPreviewAudio(forceSeek = false) {
    if (!playerVideo) return;
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        pauseEditorPreviewAudio();
        return;
    }
    const audioState = captureAudioEditorState();
    if (!audioState.enabled) {
        pauseEditorPreviewAudio();
        return;
    }
    const time = typeof getTimelineCurrentTimeExact === 'function' ? getTimelineCurrentTimeExact() : Number(playerVideo.currentTime) || 0;
    const active = editorAudioRoleAtTime(time);
    if (!active) {
        pauseEditorPreviewAudio();
        return;
    }
    const state = audioState[active.role];
    if (!state || state.mode === 'none') {
        pauseEditorPreviewAudio();
        return;
    }
    const local = Math.max(0, time - active.start);
    const roleDuration = Math.max(0, active.end - active.start);
    const audibleStart = Math.max(0, Number(state.delay) || 0);
    const audibleEnd = Math.max(audibleStart, roleDuration - Math.max(0, Number(state.endTrim) || 0));
    if (local < audibleStart || local >= audibleEnd) {
        pauseEditorPreviewAudio();
        return;
    }
    if (directVideoAudioCompatible(state)) {
        ['m0', 'm1', 'm2'].forEach(key => previewAudios[key].pause());
        editorAudioPreviewActiveRole = active.role;
        editorAudioPreviewDirectVideo = true;
        playerVideo.muted = false;
        playerVideo.volume = directVideoAudioGain(state, local, roleDuration);
        return;
    }
    playerVideo.muted = true;
    playerVideo.volume = 1;
    editorAudioPreviewDirectVideo = false;
    if (editorAudioPreviewSignature !== getEditorAudioPreviewSignature(audioState)) {
        ensureEditorPreviewAudioReady().then(() => syncEditorPreviewAudio(true)).catch(() => {});
        return;
    }
    const target = previewAudios[active.key];
    if (!target || !target.src) return;
    ['m0', 'm1', 'm2'].forEach(key => {
        if (key !== active.key) previewAudios[key].pause();
    });
    if (editorAudioPreviewActiveRole !== active.role || forceSeek || Math.abs((Number(target.currentTime) || 0) - local) > 0.18) {
        try { target.currentTime = Math.max(0, Math.min(Number(target.duration) || roleDuration, local)); } catch (error) {}
    }
    editorAudioPreviewActiveRole = active.role;
    if (!playerVideo.paused && target.paused) target.play().catch(() => {});
}

async function handleEditorAudioPreviewPlay() {
    if (!playerVideo) return;
    playerVideo.muted = true;
    const state = captureAudioEditorState();
    const time = typeof getTimelineCurrentTimeExact === 'function' ? getTimelineCurrentTimeExact() : Number(playerVideo.currentTime) || 0;
    const active = editorAudioRoleAtTime(time);
    if (state.enabled && active && state[active.role] && state[active.role].mode !== 'none' && !directVideoAudioCompatible(state[active.role])) {
        await ensureEditorPreviewAudioReady().catch(() => false);
    }
    syncEditorPreviewAudio(true);
}

function handleEditorAudioPreviewPause() {
    ['m0', 'm1', 'm2'].forEach(key => previewAudios[key].pause());
    if (playerVideo) playerVideo.muted = true;
}

function audioWaveformCacheKey(id, advanced = false) {
    if (advanced) {
        const part = typeof getAdvancedParts === 'function' ? getAdvancedParts().find(item => item.id === id) : null;
        if (!part || !part.audio) return `advanced:${id}:none`;
        return `advanced:${id}:${JSON.stringify({ start: part.start, end: part.end, sourceId: part.sourceId || '', audio: { mode: part.audio.mode, volume: part.audio.volume, fadeIn: part.audio.fadeIn, fadeOut: part.audio.fadeOut, delay: part.audio.delay, sourceIn: part.audio.sourceIn, endTrim: part.audio.endTrim, normalize: !!part.audio.normalize, source: audioStudioBlobIdentity(part.audio.source) } })}`;
    }
    return `simple:${audioStudioStateSignature(id)}`;
}

async function buildWaveformBlob(id, advanced = false) {
    if (!advanced) return await buildAudioStudioRoleBlob(id);
    const part = typeof getAdvancedParts === 'function' ? getAdvancedParts().find(item => item.id === id) : null;
    if (!part || !part.audio || part.audio.mode === 'none' || typeof buildAdvancedPartAudioBlob !== 'function') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const audioCtx = new AudioContextClass();
    try {
        let videoAudioBuffer = null;
        if (part.audio.mode === 'video') {
            const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
            const sourceBlob = window.BASSourceLibrary ? BASSourceLibrary.getVideoAudioBlob(sourceId) : currentProject && currentProject.sourceBlob;
            if (sourceBlob) videoAudioBuffer = await decodificarAudioFonte(sourceBlob, audioCtx);
        }
        return await buildAdvancedPartAudioBlob(part, audioCtx, videoAudioBuffer);
    } finally {
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

async function analyzeWaveformBlob(blob, bins = 640) {
    if (!(blob instanceof Blob)) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const audioCtx = new AudioContextClass();
    try {
        const buffer = await decodificarAudioFonte(blob, audioCtx);
        if (!buffer) return null;
        const count = Math.max(80, Math.min(1200, Math.round(bins)));
        const peaks = new Float32Array(count);
        const length = buffer.length;
        const channels = Math.max(1, buffer.numberOfChannels);
        let maxPeak = 0;
        for (let i = 0; i < count; i++) {
            const start = Math.floor((i / count) * length);
            const end = Math.max(start + 1, Math.floor(((i + 1) / count) * length));
            let peak = 0;
            for (let channel = 0; channel < channels; channel++) {
                const data = buffer.getChannelData(channel);
                const stride = Math.max(1, Math.floor((end - start) / 32));
                for (let sample = start; sample < end; sample += stride) peak = Math.max(peak, Math.abs(data[sample] || 0));
            }
            peaks[i] = peak;
            maxPeak = Math.max(maxPeak, peak);
        }
        if (maxPeak > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= maxPeak;
        return { peaks: Array.from(peaks), duration: buffer.duration, blob };
    } finally {
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

async function primeAudioWaveformFromBlob(id, advanced, blob) {
    const key = audioWaveformCacheKey(id, advanced);
    const cached = audioWaveformRuntime.cache.get(key);
    if (cached && cached.data) return cached.data;
    if (cached && cached.promise) return cached.promise;
    const promise = analyzeWaveformBlob(blob).then(data => {
        if (data) audioWaveformRuntime.cache.set(key, { data });
        else audioWaveformRuntime.cache.delete(key);
        return data;
    }).catch(() => {
        audioWaveformRuntime.cache.delete(key);
        return null;
    });
    audioWaveformRuntime.cache.set(key, { promise });
    return promise;
}

async function getAudioWaveformData(id, advanced = false) {
    const key = audioWaveformCacheKey(id, advanced);
    const cached = audioWaveformRuntime.cache.get(key);
    if (cached && cached.data) return cached.data;
    if (cached && cached.promise) return cached.promise;
    const promise = buildWaveformBlob(id, advanced).then(blob => blob ? analyzeWaveformBlob(blob) : null).then(data => {
        if (data) audioWaveformRuntime.cache.set(key, { data });
        else audioWaveformRuntime.cache.delete(key);
        return data;
    }).catch(() => {
        audioWaveformRuntime.cache.delete(key);
        return null;
    });
    audioWaveformRuntime.cache.set(key, { promise });
    return promise;
}

function waveformCanvasColors(canvas) {
    const style = getComputedStyle(document.documentElement);
    return {
        wave: style.getPropertyValue('--accent-strong').trim() || '#6fe3f4',
        center: style.getPropertyValue('--border').trim() || 'rgba(255,255,255,.12)',
        silent: style.getPropertyValue('--muted-2').trim() || '#6b7788'
    };
}

function drawWaveformCanvas(canvas, data, options = {}) {
    if (!canvas || !data || !Array.isArray(data.peaks)) return;
    const cssWidth = Math.max(1, Number(options.width) || canvas.clientWidth || 320);
    const cssHeight = Math.max(1, Number(options.height) || canvas.clientHeight || 96);
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const colors = waveformCanvasColors(canvas);
    ctx.fillStyle = colors.center;
    ctx.fillRect(0, Math.floor(cssHeight / 2), cssWidth, 1);
    const from = Math.max(0, Math.min(1, Number(options.fromRatio) || 0));
    const to = Math.max(from, Math.min(1, Number(options.toRatio) || 1));
    const startIndex = Math.floor(from * data.peaks.length);
    const endIndex = Math.max(startIndex + 1, Math.ceil(to * data.peaks.length));
    const count = Math.max(1, endIndex - startIndex);
    const barWidth = cssWidth / count;
    ctx.fillStyle = colors.wave;
    for (let i = 0; i < count; i++) {
        const peak = Math.max(0.015, Number(data.peaks[startIndex + i]) || 0);
        const height = Math.max(1, peak * (cssHeight * 0.82));
        const x = i * barWidth;
        ctx.fillRect(x, (cssHeight - height) / 2, Math.max(1, barWidth * 0.72), height);
    }
}

function updateAudioWaveformPlayhead(role, current, duration) {
    const shell = document.getElementById(`audio-studio-waveform-shell-${role}`);
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    const playhead = document.getElementById(`audio-studio-waveform-playhead-${role}`);
    if (!shell || !canvas || !playhead) return;
    const safeDuration = Math.max(0, Number(duration) || 0);
    const ratio = safeDuration > 0 ? Math.max(0, Math.min(1, (Number(current) || 0) / safeDuration)) : 0;
    playhead.style.left = `${ratio * canvas.getBoundingClientRect().width}px`;
}

function audioWaveformZoom(role, factor) {
    const current = Math.max(1, Number(audioWaveformRuntime.roleZoom[role]) || 1);
    audioWaveformRuntime.roleZoom[role] = Math.max(1, Math.min(8, factor === 0 ? 1 : current * factor));
    renderAudioStudioWaveform(role).catch(() => {});
}

async function renderAudioStudioWaveform(role) {
    const shell = document.getElementById(`audio-studio-waveform-shell-${role}`);
    const scroll = document.getElementById(`audio-studio-waveform-scroll-${role}`);
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    if (!shell || !scroll || !canvas) return;
    const select = document.getElementById(`sel-audio-${role}`);
    if (!document.getElementById('input-usar-som')?.checked || !select || select.value === 'none') {
        shell.dataset.ready = 'false';
        shell.dataset.loading = 'false';
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    shell.dataset.loading = 'true';
    const expectedKey = audioWaveformCacheKey(role, false);
    const data = await getAudioWaveformData(role, false);
    if (!canvas.isConnected || expectedKey !== audioWaveformCacheKey(role, false)) return;
    shell.dataset.loading = 'false';
    shell.dataset.ready = data ? 'true' : 'false';
    if (!data) return;
    const zoom = Math.max(1, Number(audioWaveformRuntime.roleZoom[role]) || 1);
    const width = Math.max(scroll.clientWidth || 280, (scroll.clientWidth || 280) * zoom);
    drawWaveformCanvas(canvas, data, { width, height: canvas.clientHeight || 96 });
    if (audioStudioPreviewRole === role && audioStudioPreviewAudio) syncAudioStudioTransportProgress();
    else updateAudioWaveformPlayhead(role, 0, data.duration);
}

function scheduleAudioWaveformRefresh(role, delay = 160) {
    clearTimeout(audioWaveformRuntime.refreshTimers.get(role));
    const timer = setTimeout(() => {
        audioWaveformRuntime.refreshTimers.delete(role);
        renderAudioStudioWaveform(role).catch(() => {});
        if (typeof renderTimelineAudioWaveforms === 'function') renderTimelineAudioWaveforms();
    }, delay);
    audioWaveformRuntime.refreshTimers.set(role, timer);
}

async function scrubAudioWaveform(role, event) {
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    if (!canvas) return;
    const ready = await ensureAudioStudioPreview(role);
    if (!ready || !audioStudioPreviewAudio) return;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const duration = Number(audioStudioPreviewAudio.duration) || 0;
    seekAudioStudioPreview(role, ratio * duration);
}

function initializeAudioWaveformUi() {
    ['intro', 'loop', 'final'].forEach(role => {
        const canvas = document.getElementById(`audio-studio-waveform-${role}`);
        const scroll = document.getElementById(`audio-studio-waveform-scroll-${role}`);
        document.getElementById(`audio-studio-waveform-zoom-out-${role}`)?.addEventListener('click', () => audioWaveformZoom(role, 0.75));
        document.getElementById(`audio-studio-waveform-zoom-in-${role}`)?.addEventListener('click', () => audioWaveformZoom(role, 1.333333));
        document.getElementById(`audio-studio-waveform-fit-${role}`)?.addEventListener('click', () => audioWaveformZoom(role, 0));
        if (!canvas || !scroll) return;
        canvas.addEventListener('pointerdown', event => {
            audioWaveformRuntime.pointers.set(event.pointerId, { x: event.clientX, role });
            canvas.setPointerCapture?.(event.pointerId);
            if (audioWaveformRuntime.pointers.size === 1) scrubAudioWaveform(role, event).catch(() => {});
            if (audioWaveformRuntime.pointers.size === 2) {
                const points = Array.from(audioWaveformRuntime.pointers.values()).filter(item => item.role === role);
                if (points.length === 2) audioWaveformRuntime.pinch = { role, distance: Math.abs(points[0].x - points[1].x), zoom: audioWaveformRuntime.roleZoom[role] || 1 };
            }
        });
        canvas.addEventListener('pointermove', event => {
            if (!audioWaveformRuntime.pointers.has(event.pointerId)) return;
            audioWaveformRuntime.pointers.set(event.pointerId, { x: event.clientX, role });
            const points = Array.from(audioWaveformRuntime.pointers.values()).filter(item => item.role === role);
            if (points.length >= 2 && audioWaveformRuntime.pinch && audioWaveformRuntime.pinch.role === role) {
                event.preventDefault();
                const distance = Math.max(1, Math.abs(points[0].x - points[1].x));
                const next = Math.max(1, Math.min(8, audioWaveformRuntime.pinch.zoom * distance / Math.max(1, audioWaveformRuntime.pinch.distance)));
                audioWaveformRuntime.roleZoom[role] = next;
                renderAudioStudioWaveform(role).catch(() => {});
            } else if (points.length === 1 && (event.buttons & 1)) {
                scrubAudioWaveform(role, event).catch(() => {});
            }
        });
        const finish = event => {
            audioWaveformRuntime.pointers.delete(event.pointerId);
            if (audioWaveformRuntime.pointers.size < 2) audioWaveformRuntime.pinch = null;
        };
        canvas.addEventListener('pointerup', finish);
        canvas.addEventListener('pointercancel', finish);
    });
}

async function renderTimelineAudioWaveforms() {
    const canvases = Array.from(document.querySelectorAll('.timeline3-mini-waveform'));
    await Promise.all(canvases.map(async canvas => {
        const id = canvas.dataset.audioWaveformId || '';
        const advanced = canvas.dataset.audioWaveformAdvanced === 'true';
        if (!id) return;
        const expectedKey = audioWaveformCacheKey(id, advanced);
        const data = await getAudioWaveformData(id, advanced);
        if (!data || !canvas.isConnected || expectedKey !== audioWaveformCacheKey(id, advanced)) return;
        const baseDuration = Math.max(0.001, Number(canvas.dataset.audioBaseDuration) || data.duration || 0.001);
        const delay = Math.max(0, Number(canvas.dataset.audioDelay) || 0);
        const endTrim = Math.max(0, Number(canvas.dataset.audioEndTrim) || 0);
        const fromRatio = Math.max(0, Math.min(1, delay / Math.max(data.duration, baseDuration)));
        const toRatio = Math.max(fromRatio, Math.min(1, (baseDuration - endTrim) / Math.max(data.duration, baseDuration)));
        drawWaveformCanvas(canvas, data, { width: canvas.clientWidth || 180, height: canvas.clientHeight || 30, fromRatio, toRatio });
    }));
}

function refreshAllAudioWaveforms() {
    ['intro', 'loop', 'final'].forEach(role => scheduleAudioWaveformRefresh(role, 20));
    if (typeof renderTimelineAudioWaveforms === 'function') renderTimelineAudioWaveforms();
}

if (playerVideo) {
    playerVideo.muted = true;
    playerVideo.addEventListener('play', () => { handleEditorAudioPreviewPlay().catch(() => {}); });
    playerVideo.addEventListener('pause', handleEditorAudioPreviewPause);
    playerVideo.addEventListener('timeupdate', () => syncEditorPreviewAudio(false));
    playerVideo.addEventListener('seeked', () => syncEditorPreviewAudio(true));
    playerVideo.addEventListener('ended', handleEditorAudioPreviewPause);
}

initializeAudioWaveformUi();
setTimeout(() => refreshAllAudioWaveforms(), 0);

function invalidateAdvancedAudioWaveform(id) {
    const prefix = `advanced:${id}:`;
    Array.from(audioWaveformRuntime.cache.keys()).forEach(key => {
        if (String(key).startsWith(prefix)) audioWaveformRuntime.cache.delete(key);
    });
    if (typeof renderTimeline3 === 'function') renderTimeline3();
}
