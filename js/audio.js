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
                let settled = false;
                const finish = value => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(value || null);
                };
                const timer = setTimeout(() => finish(null), 12000);
                try {
                    const res = audioCtx.decodeAudioData(arrBuf, finish, () => finish(null));
                    if (res && res.then) res.then(finish).catch(() => finish(null));
                } catch (error) {
                    finish(null);
                }
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
        fadeCurve: normalizeAudioFadeCurve(options.fadeCurve),
        gainDb: normalizeAudioGainDb(options.gainDb, options.volume),
        delay: clampAudioControlValue(hasDelay ? options.delay : Math.max(0, legacyOffset), 0, 86400, 0),
        sourceIn: clampAudioControlValue(hasSourceIn ? options.sourceIn : Math.max(0, -legacyOffset), 0, 86400, 0),
        endTrim: clampAudioControlValue(options.endTrim, 0, 86400, 0),
        normalize: !!options.normalize,
        normalizeTargetDb: normalizeAudioTargetDb(options.normalizeTargetDb)
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
        destinationEnd,
        destinationAvailable,
        sourceStart,
        sourceAvailable,
        sourceWindow,
        playDuration,
        fadeIn,
        fadeOut,
        fadeCurve: advanced.fadeCurve,
        gainDb: advanced.gainDb,
        normalize: advanced.normalize,
        normalizeTargetDb: advanced.normalizeTargetDb
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

function audioDbToLinear(value) {
    return Math.pow(10, (Number(value) || 0) / 20);
}

function audioPeakToDb(value) {
    const peak = Math.max(0, Number(value) || 0);
    return peak > 0.000001 ? 20 * Math.log10(peak) : -120;
}

function audioFadeCurveProgress(value, curve) {
    const t = Math.max(0, Math.min(1, Number(value) || 0));
    if (curve === 'smooth') return t * t * (3 - 2 * t);
    if (curve === 'exponential') return t <= 0 ? 0 : (Math.pow(256, t) - 1) / 255;
    return t;
}

function buildAudioGainEnvelope(plan, finalGain, points = 384) {
    const count = Math.max(32, Math.min(1024, Math.floor(points)));
    const values = new Float32Array(count);
    const duration = Math.max(0.000001, plan.playDuration);
    for (let i = 0; i < count; i++) {
        const time = (i / Math.max(1, count - 1)) * duration;
        let factor = 1;
        if (plan.fadeIn > 0 && time < plan.fadeIn) factor *= audioFadeCurveProgress(time / plan.fadeIn, plan.fadeCurve);
        if (plan.fadeOut > 0 && time > duration - plan.fadeOut) factor *= audioFadeCurveProgress((duration - time) / plan.fadeOut, plan.fadeCurve);
        values[i] = Math.max(0, finalGain * factor);
    }
    return values;
}

const audioRenderMetadata = new WeakMap();

function getAudioRenderMetadata(blob) {
    return blob instanceof Blob ? audioRenderMetadata.get(blob) || null : null;
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
        let sourcePeak = 0;

        if (plan.playDuration > 0) sourcePeak = getAudioBufferPeak(audioBuf, plan.sourceStart, plan.playDuration);
        if (plan.normalize && sourcePeak > 0.00001) {
            normalizeGain = Math.min(16, audioDbToLinear(plan.normalizeTargetDb) / sourcePeak);
        }

        const finalGain = Math.max(0, Number(volume) || 0) * audioDbToLinear(plan.gainDb) * normalizeGain;
        gainNode.gain.setValueAtTime(0, 0);
        gainNode.connect(offlineCtx.destination);

        if (plan.playDuration > 0) {
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuf;
            source.connect(gainNode);
            const audioStart = plan.destinationStart;
            const envelope = buildAudioGainEnvelope(plan, finalGain);
            gainNode.gain.setValueAtTime(0, audioStart);
            gainNode.gain.setValueCurveAtTime(envelope, audioStart, Math.max(0.000001, plan.playDuration));
            source.start(audioStart, plan.sourceStart, plan.playDuration);
        }

        const rendered = await offlineCtx.startRendering();
        const peak = getAudioBufferPeak(rendered, 0, rendered.duration);
        const blob = audioBufferToWav(rendered);
        audioRenderMetadata.set(blob, {
            peak,
            peakDb: audioPeakToDb(peak),
            clipped: peak > 1.0001,
            sourcePeak,
            normalizeGain,
            finalGain,
            gainDb: plan.gainDb,
            normalizeTargetDb: plan.normalizeTargetDb,
            fadeCurve: plan.fadeCurve
        });
        return blob;
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
let audioStudioSeamAudio = null;
let audioStudioSeamUrl = null;
let audioStudioSeamRole = '';

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

function disposeAudioStudioSeamPreview() {
    if (audioStudioSeamAudio) {
        audioStudioSeamAudio.pause();
        audioStudioSeamAudio.removeAttribute('src');
        audioStudioSeamAudio.load();
        audioStudioSeamAudio = null;
    }
    if (audioStudioSeamUrl) {
        URL.revokeObjectURL(audioStudioSeamUrl);
        audioStudioSeamUrl = null;
    }
    const role = audioStudioSeamRole;
    audioStudioSeamRole = '';
    if (role) {
        const button = document.querySelector(`[data-audio-sync-role="${role}"][data-audio-sync-action="seam"]`);
        if (button) button.classList.remove('is-active');
    }
}

function disposeAudioStudioPreview() {
    disposeAudioStudioSeamPreview();
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
    audioStudioPreviewAudio.loop = audioWaveformRuntime.loopPreviewRole === role;
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
    generation: 0,
    loopPreviewRole: ''
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
        gainDb: normalizeAudioGainDb(roleState.gainDb, roleState.volume),
        fadeIn: Number(roleState.fadeIn) || 0,
        fadeOut: Number(roleState.fadeOut) || 0,
        fadeCurve: normalizeAudioFadeCurve(roleState.fadeCurve),
        delay: Number(roleState.delay) || 0,
        sourceIn: Number(roleState.sourceIn) || 0,
        endTrim: Number(roleState.endTrim) || 0,
        normalize: !!roleState.normalize,
        normalizeTargetDb: normalizeAudioTargetDb(roleState.normalizeTargetDb),
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
    disposeAudioStudioSeamPreview();
    if (options.transport !== false) stopAudioStudioPreview();
    if (options.waveforms !== false) {
        audioWaveformRuntime.generation += 1;
        audioWaveformRuntime.cache.clear();
        ['intro', 'loop', 'final'].forEach(role => {
            if (typeof markAudioExportCompatibilityPending === 'function') markAudioExportCompatibilityPending(role);
            scheduleAudioWaveformRefresh(role, 80);
        });
    }
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    if (playerVideo && !playerVideo.paused) ensureEditorPreviewAudioReady().then(() => syncEditorPreviewAudio(true)).catch(() => {});
}

function notifyAudioMarkersChanged() {
    invalidateAudioPreviewState({ transport: true, waveforms: true });
    refreshAudioStudioSyncUi();
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
    if (normalizeAudioGainDb(state.gainDb, state.volume) > 0.001) return false;
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
    let gain = Math.max(0, Math.min(1, audioDbToLinear(normalizeAudioGainDb(state.gainDb, state.volume))));
    const fadeIn = Math.min(audibleDuration, Math.max(0, Number(state.fadeIn) || 0));
    const fadeOut = Math.min(audibleDuration, Math.max(0, Number(state.fadeOut) || 0));
    const fadeCurve = normalizeAudioFadeCurve(state.fadeCurve);
    if (fadeIn > 0 && audible < fadeIn) gain *= audioFadeCurveProgress(audible / fadeIn, fadeCurve);
    if (fadeOut > 0 && audible > audibleDuration - fadeOut) gain *= audioFadeCurveProgress((audibleDuration - audible) / fadeOut, fadeCurve);
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
        return `advanced:${id}:${JSON.stringify({ start: part.start, end: part.end, sourceId: part.sourceId || '', audio: { mode: part.audio.mode, volume: part.audio.volume, gainDb: normalizeAudioGainDb(part.audio.gainDb, part.audio.volume), fadeIn: part.audio.fadeIn, fadeOut: part.audio.fadeOut, fadeCurve: normalizeAudioFadeCurve(part.audio.fadeCurve), delay: part.audio.delay, sourceIn: part.audio.sourceIn, endTrim: part.audio.endTrim, normalize: !!part.audio.normalize, normalizeTargetDb: normalizeAudioTargetDb(part.audio.normalizeTargetDb), source: audioStudioBlobIdentity(part.audio.source) } })}`;
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
        return { peaks: Array.from(peaks), duration: buffer.duration, blob, rawPeak: maxPeak };
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

function audioStudioRoleMarkerIds(role) {
    return role === 'intro' ? ['m0', 'm1'] : role === 'loop' ? ['m1', 'm2'] : ['m2', 'm3'];
}

function audioStudioGlobalPlayheadTime() {
    return typeof getTimelineCurrentTimeExact === 'function' ? Math.max(0, Number(getTimelineCurrentTimeExact()) || 0) : Math.max(0, Number(playerVideo && playerVideo.currentTime) || 0);
}

function ensureAudioStudioSyncControls(role) {
    const shell = document.getElementById(`audio-studio-waveform-shell-${role}`);
    if (!shell || shell.querySelector(`[data-audio-sync-tools="${role}"]`)) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'audio-studio-sync-tools';
    toolbar.dataset.audioSyncTools = role;
    toolbar.innerHTML = `<div class="audio-studio-sync-actions"><button type="button" data-audio-sync-role="${role}" data-audio-sync-action="start"></button><button type="button" data-audio-sync-role="${role}" data-audio-sync-action="end"></button><button type="button" data-audio-sync-role="${role}" data-audio-sync-action="center"></button></div>${role === 'loop' ? `<div class="audio-studio-loop-actions"><button type="button" data-audio-sync-role="${role}" data-audio-sync-action="loop" aria-pressed="false"></button><button type="button" data-audio-sync-role="${role}" data-audio-sync-action="seam"></button></div>` : ''}`;
    const scroll = document.getElementById(`audio-studio-waveform-scroll-${role}`);
    shell.insertBefore(toolbar, scroll || shell.firstChild);
    toolbar.addEventListener('click', event => {
        const button = event.target.closest('[data-audio-sync-action]');
        if (!button) return;
        const action = button.dataset.audioSyncAction;
        if (action === 'start' || action === 'end') setAudioTimingFromPlayhead(role, action);
        else if (action === 'center') centerAudioWaveformOnPlayhead(role);
        else if (action === 'loop') toggleAudioStudioLoopPreview(role).catch(() => {});
        else if (action === 'seam') previewAudioStudioLoopSeam(role).catch(() => {});
    });
    syncAudioStudioSyncControlsText(role);
}

function syncAudioStudioSyncControlsText(role) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const labels = {
        start: t.audioSyncSetStart || 'Start at playhead',
        end: t.audioSyncSetEnd || 'End at playhead',
        center: t.audioSyncCenter || 'Center playhead',
        loop: t.audioSyncLoop || 'Loop preview',
        seam: t.audioSyncSeam || 'Loop seam'
    };
    document.querySelectorAll(`[data-audio-sync-role="${role}"][data-audio-sync-action]`).forEach(button => {
        const action = button.dataset.audioSyncAction;
        if (labels[action]) button.textContent = labels[action];
    });
    const loopButton = document.querySelector(`[data-audio-sync-role="${role}"][data-audio-sync-action="loop"]`);
    if (loopButton) {
        const active = audioWaveformRuntime.loopPreviewRole === role;
        loopButton.classList.toggle('is-active', active);
        loopButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
}

function refreshAudioStudioSyncUi() {
    ['intro', 'loop', 'final'].forEach(role => {
        ensureAudioStudioSyncControls(role);
        syncAudioStudioSyncControlsText(role);
        renderAudioWaveformMarkers(role);
    });
}

function setAudioTimingFromPlayhead(role, edge) {
    const [start, end] = audioStudioRoleRange(role);
    const current = audioStudioGlobalPlayheadTime();
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (!(end > start) || current < start - 0.0001 || current > end + 0.0001) {
        if (typeof showToast === 'function') showToast(t.audioSyncOutside || 'Move the playhead inside this section first.', 'warning');
        return false;
    }
    const delayInput = document.getElementById(`audio-delay-${role}`);
    const endInput = document.getElementById(`audio-end-trim-${role}`);
    if (!delayInput || !endInput) return false;
    const span = end - start;
    const delay = Math.max(0, Number(delayInput.value) || 0);
    const endTrim = Math.max(0, Number(endInput.value) || 0);
    if (edge === 'start') delayInput.value = String(Math.max(0, Math.min(span - endTrim, current - start)));
    else endInput.value = String(Math.max(0, Math.min(span - delay, end - current)));
    if (typeof handleAudioAdvancedInput === 'function') handleAudioAdvancedInput(role);
    centerAudioWaveformOnPlayhead(role);
    return true;
}

function centerAudioWaveformOnPlayhead(role) {
    const scroll = document.getElementById(`audio-studio-waveform-scroll-${role}`);
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    if (!scroll || !canvas) return false;
    const [start, end] = audioStudioRoleRange(role);
    if (!(end > start)) return false;
    const current = Math.max(start, Math.min(end, audioStudioGlobalPlayheadTime()));
    const ratio = (current - start) / (end - start);
    const x = ratio * (canvas.getBoundingClientRect().width || canvas.clientWidth || 0);
    scroll.scrollLeft = Math.max(0, x - scroll.clientWidth / 2);
    renderAudioWaveformMarkers(role);
    return true;
}

function renderAudioWaveformMarkers(role) {
    const scroll = document.getElementById(`audio-studio-waveform-scroll-${role}`);
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    if (!scroll || !canvas) return;
    let overlay = scroll.querySelector(`[data-audio-marker-overlay="${role}"]`);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'audio-studio-marker-overlay';
        overlay.dataset.audioMarkerOverlay = role;
        scroll.appendChild(overlay);
    }
    const width = Math.max(1, canvas.getBoundingClientRect().width || canvas.clientWidth || 1);
    overlay.style.width = `${width}px`;
    const [start, end] = audioStudioRoleRange(role);
    const ids = audioStudioRoleMarkerIds(role);
    const t = traducoes[idiomaAtual] || traducoes.en;
    const global = audioStudioGlobalPlayheadTime();
    const ratio = end > start ? Math.max(0, Math.min(1, (global - start) / (end - start))) : 0;
    const inside = end > start && global >= start && global <= end;
    overlay.innerHTML = `<span class="audio-studio-marker audio-studio-marker-start" style="left:0"><b>${String(t[ids[0]] || ids[0]).replace(/^\d+\.\s*/, '')}</b></span><span class="audio-studio-marker audio-studio-marker-end" style="left:${width}px"><b>${String(t[ids[1]] || ids[1]).replace(/^\d+\.\s*/, '')}</b></span><span class="audio-studio-global-playhead${inside ? ' is-visible' : ''}" style="left:${ratio * width}px"></span>`;
}

function updateAllAudioStudioGlobalPlayheads() {
    ['intro', 'loop', 'final'].forEach(renderAudioWaveformMarkers);
}

async function toggleAudioStudioLoopPreview(role) {
    const ready = await ensureAudioStudioPreview(role);
    if (!ready || !audioStudioPreviewAudio) return false;
    const active = audioWaveformRuntime.loopPreviewRole === role;
    audioWaveformRuntime.loopPreviewRole = active ? '' : role;
    audioStudioPreviewAudio.loop = !active;
    syncAudioStudioSyncControlsText(role);
    if (!active && audioStudioPreviewAudio.paused) await audioStudioPreviewAudio.play().catch(() => {});
    return !active;
}

async function buildAudioStudioLoopSeamBlob(role) {
    const blob = await buildAudioStudioRoleBlob(role);
    if (!blob) return null;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const decoded = await decodificarAudioFonte(blob, audioCtx);
        if (!decoded || !(decoded.duration > 0.08)) return null;
        const windowSec = Math.min(0.8, decoded.duration / 2);
        const sampleRate = decoded.sampleRate;
        const frames = Math.max(1, Math.ceil(windowSec * 2 * sampleRate));
        const offline = new OfflineAudioContext(Math.max(1, decoded.numberOfChannels), frames, sampleRate);
        const tail = offline.createBufferSource();
        tail.buffer = decoded;
        tail.connect(offline.destination);
        tail.start(0, Math.max(0, decoded.duration - windowSec), windowSec);
        const head = offline.createBufferSource();
        head.buffer = decoded;
        head.connect(offline.destination);
        head.start(windowSec, 0, windowSec);
        return audioBufferToWav(await offline.startRendering());
    } finally {
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

async function previewAudioStudioLoopSeam(role) {
    disposeAudioStudioSeamPreview();
    stopAudioStudioPreview({ reset: false });
    const blob = await buildAudioStudioLoopSeamBlob(role).catch(() => null);
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (!blob) {
        if (typeof showToast === 'function') showToast(t.audioSyncSeamUnavailable || 'Not enough audio is available to preview the loop seam.', 'warning');
        return false;
    }
    audioStudioSeamRole = role;
    audioStudioSeamAudio = new Audio();
    audioStudioSeamUrl = URL.createObjectURL(blob);
    audioStudioSeamAudio.src = audioStudioSeamUrl;
    audioStudioSeamAudio.preload = 'auto';
    const button = document.querySelector(`[data-audio-sync-role="${role}"][data-audio-sync-action="seam"]`);
    if (button) button.classList.add('is-active');
    audioStudioSeamAudio.addEventListener('ended', disposeAudioStudioSeamPreview, { once: true });
    await audioStudioSeamAudio.play().catch(() => {});
    return !audioStudioSeamAudio.paused;
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
        renderAudioFadeHandles(role);
        resetAudioProcessingMeter(role);
        if (typeof resetAudioExportCompatibility === 'function') resetAudioExportCompatibility(role);
        return;
    }
    shell.dataset.loading = 'true';
    const expectedKey = audioWaveformCacheKey(role, false);
    const data = await getAudioWaveformData(role, false);
    if (!canvas.isConnected || expectedKey !== audioWaveformCacheKey(role, false)) return;
    shell.dataset.loading = 'false';
    shell.dataset.ready = data ? 'true' : 'false';
    if (!data) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        resetAudioProcessingMeter(role);
        markAudioExportCompatibilityUnavailable(role);
        return;
    }
    const zoom = Math.max(1, Number(audioWaveformRuntime.roleZoom[role]) || 1);
    const width = Math.max(scroll.clientWidth || 280, (scroll.clientWidth || 280) * zoom);
    drawWaveformCanvas(canvas, data, { width, height: canvas.clientHeight || 96 });
    if (audioStudioPreviewRole === role && audioStudioPreviewAudio) syncAudioStudioTransportProgress();
    else updateAudioWaveformPlayhead(role, 0, data.duration);
    renderAudioWaveformMarkers(role);
    renderAudioFadeHandles(role);
    renderAudioProcessingMeter(role, data.blob, data.rawPeak);
    if (typeof renderAudioExportCompatibility === 'function') renderAudioExportCompatibility(role, data).catch(() => {});
}

function getAudioProcessingMeterElements(role) {
    return {
        root: document.getElementById(`audio-processing-meter-${role}`),
        fill: document.getElementById(`audio-processing-meter-fill-${role}`),
        value: document.getElementById(`val-processing-peak-${role}`),
        status: document.getElementById(`audio-processing-status-${role}`)
    };
}

function resetAudioProcessingMeter(role) {
    const els = getAudioProcessingMeterElements(role);
    if (!els.root) return;
    els.root.dataset.state = 'idle';
    if (els.fill) els.fill.style.width = '0%';
    if (els.value) els.value.textContent = '—';
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (els.status) els.status.textContent = t.audioProcessingAnalyzeHint || 'Play or edit audio to analyze the processed output.';
}

function renderAudioProcessingMeter(role, blob, fallbackPeak = 0) {
    const els = getAudioProcessingMeterElements(role);
    if (!els.root) return;
    const metadata = getAudioRenderMetadata(blob);
    const peak = Math.max(0, Number(metadata && metadata.peak !== undefined ? metadata.peak : fallbackPeak) || 0);
    const db = audioPeakToDb(peak);
    const clipped = peak > 1.0001;
    const hot = !clipped && db > -1;
    els.root.dataset.state = clipped ? 'clipping' : hot ? 'hot' : 'safe';
    const normalized = Math.max(0, Math.min(1, (Math.max(-60, Math.min(6, db)) + 60) / 66));
    if (els.fill) els.fill.style.width = `${normalized * 100}%`;
    if (els.value) els.value.textContent = db <= -119 ? '−∞ dBFS' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dBFS`;
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (els.status) {
        if (clipped) els.status.textContent = (t.audioProcessingClipping || 'Clipping by {db} dB. Lower Gain or enable Normalize.').replace('{db}', Math.max(0, db).toFixed(1));
        else els.status.textContent = (t.audioProcessingHeadroom || '{db} dB of headroom before clipping.').replace('{db}', Math.max(0, -db).toFixed(1));
    }
}

function ensureAudioFadeHandles(role) {
    const scroll = document.getElementById(`audio-studio-waveform-scroll-${role}`);
    if (!scroll) return [];
    const t = traducoes[idiomaAtual] || traducoes.en;
    return ['in', 'out'].map(kind => {
        let handle = scroll.querySelector(`.audio-fade-handle[data-fade-kind="${kind}"]`);
        if (!handle) {
            handle = document.createElement('button');
            handle.type = 'button';
            handle.className = `audio-fade-handle audio-fade-handle-${kind}`;
            handle.dataset.fadeKind = kind;
            handle.dataset.role = role;
            scroll.appendChild(handle);
            const begin = event => {
                event.stopPropagation();
                handle.setPointerCapture?.(event.pointerId);
                handle.dataset.dragging = 'true';
                updateAudioFadeHandleFromPointer(role, kind, event, false);
            };
            const move = event => {
                if (handle.dataset.dragging !== 'true') return;
                event.preventDefault();
                updateAudioFadeHandleFromPointer(role, kind, event, false);
            };
            const end = event => {
                if (handle.dataset.dragging !== 'true') return;
                handle.dataset.dragging = 'false';
                updateAudioFadeHandleFromPointer(role, kind, event, true);
            };
            handle.addEventListener('pointerdown', begin);
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', end);
            handle.addEventListener('pointercancel', end);
        }
        handle.setAttribute('aria-label', kind === 'in' ? (t.audioFadeHandleIn || 'Adjust fade in') : (t.audioFadeHandleOut || 'Adjust fade out'));
        return handle;
    });
}

function renderAudioFadeHandles(role) {
    const handles = ensureAudioFadeHandles(role);
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    const select = document.getElementById(`sel-audio-${role}`);
    const duration = getAudioRoleDuration(role);
    if (!canvas || !select || select.value === 'none' || duration <= 0) {
        handles.forEach(handle => { handle.hidden = true; });
        return;
    }
    const state = getAudioAdvancedState(role);
    const audibleStart = Math.max(0, Math.min(duration, state.delay));
    const audibleEnd = Math.max(audibleStart, duration - state.endTrim);
    const fadeInEnd = Math.min(audibleEnd, audibleStart + state.fadeIn);
    const fadeOutStart = Math.max(audibleStart, audibleEnd - state.fadeOut);
    const width = canvas.getBoundingClientRect().width || canvas.clientWidth || 1;
    const positions = [fadeInEnd / duration, fadeOutStart / duration];
    handles.forEach((handle, index) => {
        handle.hidden = false;
        handle.style.left = `${Math.max(0, Math.min(width, positions[index] * width))}px`;
    });
}

function updateAudioFadeHandleFromPointer(role, kind, event, commit) {
    const canvas = document.getElementById(`audio-studio-waveform-${role}`);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const duration = getAudioRoleDuration(role);
    if (!(rect.width > 0) || duration <= 0) return;
    const position = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration));
    const state = getAudioAdvancedState(role);
    const audibleStart = Math.max(0, Math.min(duration, state.delay));
    const audibleEnd = Math.max(audibleStart, duration - state.endTrim);
    if (kind === 'in') {
        const input = document.getElementById(`fade-in-${role}`);
        if (input) input.value = String(Math.max(0, Math.min(audibleEnd - audibleStart - state.fadeOut, position - audibleStart)));
    } else {
        const input = document.getElementById(`fade-out-${role}`);
        if (input) input.value = String(Math.max(0, Math.min(audibleEnd - audibleStart - state.fadeIn, audibleEnd - position)));
    }
    syncAudioAdvancedLabels(role);
    renderAudioFadeHandles(role);
    if (commit) handleAudioAdvancedInput(role);
}

async function getAudioSourceBufferForRole(role, audioCtx) {
    const state = captureAudioEditorState();
    const roleState = state && state[role] ? state[role] : null;
    if (!roleState || roleState.mode === 'none') return null;
    if (roleState.mode === 'file') return await decodificarAudioFonte(getSelectedAudioFile(role), audioCtx);
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return null;
    return await decodificarAudioFonte(currentProject && currentProject.sourceBlob ? currentProject.sourceBlob : playerVideo.src, audioCtx);
}

async function fitAudioToPartEnd(role) {
    const state = captureAudioEditorState();
    const roleState = state && state[role] ? state[role] : null;
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (!state.enabled || !roleState || roleState.mode === 'none') {
        if (typeof showToast === 'function') showToast(t.audioProcessingNoSource || 'Choose audio for this section first.', 'warning');
        return false;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || (roleState.mode === 'video' && window.BASMasterSequence && BASMasterSequence.isTimelineActive())) {
        if (typeof showToast === 'function') showToast(t.audioProcessingFitUnavailable || 'This source cannot be aligned automatically in the current sequence.', 'warning');
        return false;
    }
    const audioCtx = new AudioContextClass();
    try {
        const buffer = await getAudioSourceBufferForRole(role, audioCtx);
        if (!buffer) return false;
        const range = audioStudioRoleRange(role);
        const duration = Math.max(0, range[1] - range[0]);
        const startSec = roleState.mode === 'video' ? range[0] : 0;
        const endSec = roleState.mode === 'video' ? range[1] : duration;
        const plan = createAudioRenderPlan(buffer.duration, startSec, endSec, { ...roleState, delay: 0, endTrim: 0 });
        const delay = Math.max(0, duration - plan.playDuration);
        const delayInput = document.getElementById(`audio-delay-${role}`);
        const endTrimInput = document.getElementById(`audio-end-trim-${role}`);
        if (delayInput) delayInput.value = String(delay);
        if (endTrimInput) endTrimInput.value = '0';
        handleAudioAdvancedInput(role);
        if (typeof showToast === 'function') showToast(t.audioProcessingFitDone || 'Audio end aligned to the Part.', 'success');
        return true;
    } finally {
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

function resetAudioProcessing(role) {
    const gain = document.getElementById(`vol-${role}`);
    const fadeIn = document.getElementById(`fade-in-${role}`);
    const fadeOut = document.getElementById(`fade-out-${role}`);
    const fadeCurve = document.getElementById(`audio-fade-curve-${role}`);
    const normalize = document.getElementById(`audio-normalize-${role}`);
    const target = document.getElementById(`audio-normalize-target-${role}`);
    if (gain) gain.value = '0';
    if (fadeIn) fadeIn.value = '0';
    if (fadeOut) fadeOut.value = '0';
    if (fadeCurve) fadeCurve.value = 'linear';
    if (normalize) normalize.checked = false;
    if (target) target.value = '-1';
    syncAudioAdvancedLabels(role);
    handleAudioAdvancedInput(role);
}


const audioExportCompatibilityRuntime = {
    generations: { intro: 0, loop: 0, final: 0 },
    results: { intro: null, loop: null, final: null }
};

function formatAudioExportBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

function formatAudioExportRate(value) {
    const rate = Math.max(0, Number(value) || 0);
    if (!rate) return '—';
    return rate >= 1000 && rate % 1000 === 0 ? `${rate / 1000} kHz` : `${(rate / 1000).toFixed(1)} kHz`;
}

function formatAudioExportChannels(value) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const count = Math.max(0, Math.round(Number(value) || 0));
    if (count === 1) return t.audioExportMono || 'Mono';
    if (count === 2) return t.audioExportStereo || 'Stereo';
    return count > 0 ? (t.audioExportChannels || '{count} channels').replace('{count}', count) : '—';
}

function audioExportSourceFormat(blob, fallbackName = '') {
    const type = String(blob && blob.type || '').toLowerCase();
    const name = String(blob && blob.name || fallbackName || '').toLowerCase();
    if (/wav|wave/.test(type) || /\.wav$/i.test(name)) return 'WAV';
    if (/mpeg|mp3/.test(type) || /\.mp3$/i.test(name)) return 'MP3';
    if (/ogg/.test(type) || /\.ogg$/i.test(name)) return 'OGG';
    if (/aac/.test(type) || /\.aac$/i.test(name)) return 'AAC';
    if (/flac/.test(type) || /\.flac$/i.test(name)) return 'FLAC';
    if (/mp4|m4a/.test(type) || /\.(m4a|mp4)$/i.test(name)) return 'M4A/MP4';
    if (/webm/.test(type) || /\.webm$/i.test(name)) return 'WebM';
    if (/video\//.test(type)) return 'Video';
    if (/audio\//.test(type)) return type.split('/')[1].toUpperCase();
    return 'Media';
}

function ensureAudioExportCompatibilityCard(role) {
    const host = document.querySelector(`.audio-role-card[data-audio-panel="${role}"]`);
    if (!host) return null;
    let card = host.querySelector(`[data-audio-export-card="${role}"]`);
    if (card) return card;
    card = document.createElement('section');
    card.className = 'audio-export-compatibility';
    card.dataset.audioExportCard = role;
    card.dataset.state = 'idle';
    card.innerHTML = `<div class="audio-export-head"><div><span data-audio-export-field="kicker"></span><strong data-audio-export-field="title"></strong></div><span class="audio-export-status" data-audio-export-field="status"></span></div><div class="audio-export-grid"><div class="audio-export-fact"><span data-audio-export-field="source-label"></span><strong data-audio-export-field="source-name">—</strong><small data-audio-export-field="source-meta">—</small></div><div class="audio-export-fact"><span data-audio-export-field="output-label"></span><strong data-audio-export-field="output-name">WAV PCM 16-bit</strong><small data-audio-export-field="output-meta">—</small></div></div><div class="audio-export-conversion" data-audio-export-field="conversion"></div><div class="audio-export-warnings" data-audio-export-field="warnings"></div><p class="audio-export-hint" data-audio-export-field="hint"></p>`;
    host.appendChild(card);
    syncAudioExportCompatibilityText(role);
    return card;
}

function getAudioExportCardFields(role) {
    const card = ensureAudioExportCompatibilityCard(role);
    const get = name => card ? card.querySelector(`[data-audio-export-field="${name}"]`) : null;
    return {
        card,
        kicker: get('kicker'),
        title: get('title'),
        status: get('status'),
        sourceLabel: get('source-label'),
        sourceName: get('source-name'),
        sourceMeta: get('source-meta'),
        outputLabel: get('output-label'),
        outputName: get('output-name'),
        outputMeta: get('output-meta'),
        conversion: get('conversion'),
        warnings: get('warnings'),
        hint: get('hint')
    };
}

function syncAudioExportCompatibilityText(role) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const els = getAudioExportCardFields(role);
    if (!els.card) return;
    if (els.kicker) els.kicker.textContent = t.audioExportKicker || 'EXPORT & COMPATIBILITY';
    if (els.title) els.title.textContent = t.audioExportTitle || 'Final audio check';
    if (els.sourceLabel) els.sourceLabel.textContent = t.audioExportSource || 'Source';
    if (els.outputLabel) els.outputLabel.textContent = t.audioExportFinal || 'Final WAV';
    if (els.outputName) els.outputName.textContent = t.audioExportWav || 'WAV PCM 16-bit';
    if (els.hint) els.hint.textContent = t.audioExportAutoHint || 'Updates automatically whenever timing, markers, source or processing changes.';
    const currentState = els.card.dataset.state || 'idle';
    const labels = {
        idle: t.audioExportStatusIdle || 'Waiting',
        checking: t.audioExportStatusChecking || 'Checking',
        ready: t.audioExportStatusReady || 'Ready',
        warning: t.audioExportStatusWarning || 'Check',
        danger: t.audioExportStatusDanger || 'Clipping',
        empty: t.audioExportStatusEmpty || 'No audio'
    };
    if (els.status) els.status.textContent = labels[currentState] || labels.idle;
}

function resetAudioExportCompatibility(role) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const els = getAudioExportCardFields(role);
    if (!els.card) return;
    audioExportCompatibilityRuntime.generations[role] = (audioExportCompatibilityRuntime.generations[role] || 0) + 1;
    audioExportCompatibilityRuntime.results[role] = null;
    els.card.hidden = true;
    els.card.dataset.state = 'empty';
    if (els.status) els.status.textContent = t.audioExportStatusEmpty || 'No audio';
    if (els.sourceName) els.sourceName.textContent = '—';
    if (els.sourceMeta) els.sourceMeta.textContent = t.audioExportNoSource || 'Choose an audio source for this section.';
    if (els.outputMeta) els.outputMeta.textContent = '—';
    if (els.conversion) els.conversion.textContent = '';
    if (els.warnings) els.warnings.replaceChildren();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
}

function audioExportSourceDescriptor(role, roleState) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (!roleState || roleState.mode === 'none') return { name: '—', blob: null, format: '—', kind: 'none' };
    if (roleState.mode === 'file') {
        const blob = getSelectedAudioFile(role);
        const sourceState = roleState.source || {};
        const name = sourceState.name || (blob && blob.name) || (t.audioExportAudioFile || 'Audio file');
        return { name, blob, format: audioExportSourceFormat(blob, name), kind: 'file' };
    }
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) {
        return { name: t.audioExportMasterSequence || 'Master Sequence audio', blob: null, format: t.audioExportSequence || 'Sequence', kind: 'master' };
    }
    const blob = currentProject && currentProject.sourceBlob instanceof Blob ? currentProject.sourceBlob : null;
    const name = currentProject && currentProject.sourceName ? currentProject.sourceName : (blob && blob.name) || (t.audioExportVideoAudio || 'Video audio');
    return { name, blob, format: audioExportSourceFormat(blob, name), kind: 'video' };
}

async function decodeAudioExportBlob(blob) {
    if (!(blob instanceof Blob)) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();
    try {
        return await decodificarAudioFonte(blob, ctx);
    } finally {
        if (ctx.state !== 'closed') await ctx.close().catch(() => {});
    }
}

function appendAudioExportMessage(container, kind, text) {
    if (!container || !text) return;
    const item = document.createElement('div');
    item.className = `audio-export-message audio-export-message-${kind}`;
    item.textContent = text;
    container.appendChild(item);
}

function markAudioExportCompatibilityPending(role) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const els = getAudioExportCardFields(role);
    if (!els.card) return;
    const state = captureAudioEditorState();
    const roleState = state && state[role] ? state[role] : null;
    if (!state.enabled || !roleState || roleState.mode === 'none') {
        resetAudioExportCompatibility(role);
        return;
    }
    els.card.hidden = false;
    els.card.dataset.state = 'checking';
    audioExportCompatibilityRuntime.results[role] = { role, severity: 'checking', messages: [] };
    if (els.status) els.status.textContent = t.audioExportStatusChecking || 'Checking';
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
}

function markAudioExportCompatibilityUnavailable(role) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const els = getAudioExportCardFields(role);
    if (!els.card) return;
    const state = captureAudioEditorState();
    const roleState = state && state[role] ? state[role] : null;
    if (!state.enabled || !roleState || roleState.mode === 'none') {
        resetAudioExportCompatibility(role);
        return;
    }
    audioExportCompatibilityRuntime.generations[role] = (audioExportCompatibilityRuntime.generations[role] || 0) + 1;
    els.card.hidden = false;
    els.card.dataset.state = 'warning';
    const unavailableMessage = t.audioExportUnavailable || 'Final WAV could not be rendered.';
    audioExportCompatibilityRuntime.results[role] = { role, severity: 'warning', messages: [{ kind: 'warning', text: unavailableMessage }], unavailable: true };
    if (els.status) els.status.textContent = t.audioExportStatusWarning || 'Check';
    if (els.outputMeta) els.outputMeta.textContent = unavailableMessage;
    if (els.warnings) {
        els.warnings.replaceChildren();
        appendAudioExportMessage(els.warnings, 'warning', unavailableMessage);
    }
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
}

function getAudioCompatibilitySilenceCauses(roleState, plan, waveformData) {
    const gainDb = normalizeAudioGainDb(roleState && roleState.gainDb, roleState && roleState.volume);
    const effectivePeakDb = audioPeakToDb(Number(waveformData && waveformData.rawPeak) || 0);
    const meaningfulDuration = 0.100001;
    const delay = Math.max(0, Number(roleState && roleState.delay) || 0);
    const sourceIn = Math.max(0, Number(roleState && roleState.sourceIn) || 0);
    const endTrim = Math.max(0, Number(roleState && roleState.endTrim) || 0);
    const sourceAudibleAvailable = plan ? Math.max(0, Math.min(plan.sourceAvailable, plan.sourceWindow)) : 0;
    return {
        gainDb,
        effectivePeakDb,
        meaningfulDuration,
        delayConsumesWindow: !!plan && plan.destinationAvailable <= meaningfulDuration && delay > 0,
        sourceInConsumesWindow: !!plan && sourceAudibleAvailable <= meaningfulDuration && sourceIn > 0,
        endTrimConsumesWindow: !!plan && plan.destinationAvailable <= meaningfulDuration && endTrim > 0,
        gainEffectivelySilent: gainDb <= -59.5 || (effectivePeakDb <= -60 && gainDb < -24)
    };
}

async function renderAudioExportCompatibility(role, waveformData = null) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const els = getAudioExportCardFields(role);
    if (!els.card) return null;
    const state = captureAudioEditorState();
    const roleState = state && state[role] ? state[role] : null;
    if (!state.enabled || !roleState || roleState.mode === 'none') {
        resetAudioExportCompatibility(role);
        return null;
    }

    const generation = (audioExportCompatibilityRuntime.generations[role] || 0) + 1;
    audioExportCompatibilityRuntime.generations[role] = generation;
    els.card.hidden = false;
    els.card.dataset.state = 'checking';
    audioExportCompatibilityRuntime.results[role] = { role, severity: 'checking', messages: [] };
    if (els.status) els.status.textContent = t.audioExportStatusChecking || 'Checking';
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();

    const signature = audioStudioStateSignature(role, state);
    const data = waveformData || await getAudioWaveformData(role, false);
    if (generation !== audioExportCompatibilityRuntime.generations[role] || signature !== audioStudioStateSignature(role)) return null;
    if (!data || !(data.blob instanceof Blob)) {
        const unavailableMessage = t.audioExportUnavailable || 'Final WAV could not be rendered.';
        els.card.dataset.state = 'warning';
        audioExportCompatibilityRuntime.results[role] = { role, severity: 'warning', messages: [{ kind: 'warning', text: unavailableMessage }], unavailable: true };
        if (els.status) els.status.textContent = t.audioExportStatusWarning || 'Check';
        if (els.outputMeta) els.outputMeta.textContent = unavailableMessage;
        if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
        return null;
    }

    const source = audioExportSourceDescriptor(role, roleState);
    const [rangeStart, rangeEnd] = audioStudioRoleRange(role);
    const partDuration = Math.max(0, rangeEnd - rangeStart);
    const outputBuffer = await decodeAudioExportBlob(data.blob);
    let sourceBuffer = null;
    if (source.blob instanceof Blob) sourceBuffer = await decodeAudioExportBlob(source.blob);
    if (generation !== audioExportCompatibilityRuntime.generations[role] || signature !== audioStudioStateSignature(role)) return null;

    const metadata = getAudioRenderMetadata(data.blob);
    const sourceMetaParts = [];
    if (sourceBuffer) {
        sourceMetaParts.push(formatAudioStudioClock(sourceBuffer.duration));
        sourceMetaParts.push(formatAudioExportRate(sourceBuffer.sampleRate));
        sourceMetaParts.push(formatAudioExportChannels(sourceBuffer.numberOfChannels));
    }
    if (source.blob instanceof Blob) sourceMetaParts.push(formatAudioExportBytes(source.blob.size));

    const outputMetaParts = [];
    if (outputBuffer) {
        outputMetaParts.push(formatAudioStudioClock(outputBuffer.duration));
        outputMetaParts.push(formatAudioExportRate(outputBuffer.sampleRate));
        outputMetaParts.push(formatAudioExportChannels(outputBuffer.numberOfChannels));
    } else if (Number.isFinite(data.duration)) {
        outputMetaParts.push(formatAudioStudioClock(data.duration));
    }
    outputMetaParts.push(formatAudioExportBytes(data.blob.size));

    if (els.sourceName) els.sourceName.textContent = source.name || '—';
    if (els.sourceMeta) els.sourceMeta.textContent = sourceMetaParts.length ? sourceMetaParts.join(' · ') : source.format;
    if (els.outputMeta) els.outputMeta.textContent = outputMetaParts.join(' · ');
    if (els.conversion) els.conversion.textContent = (t.audioExportConversion || '{source} → WAV PCM 16-bit').replace('{source}', source.format || 'Media');
    if (els.warnings) els.warnings.replaceChildren();

    let severity = 'ready';
    let warningCount = 0;
    const compatibilityMessages = [];
    const warn = (kind, text) => {
        appendAudioExportMessage(els.warnings, kind, text);
        compatibilityMessages.push({ kind, text });
        warningCount++;
        if (kind === 'danger') severity = 'danger';
        else if (severity !== 'danger') severity = 'warning';
    };
    const info = text => appendAudioExportMessage(els.warnings, 'info', text);

    const peakDb = metadata && Number.isFinite(metadata.peakDb) ? metadata.peakDb : audioPeakToDb(Number(data.rawPeak) || 0);
    if (metadata && metadata.clipped) {
        warn('danger', (t.audioExportWarnClipping || 'The processed signal exceeds 0 dBFS by {db} dB before WAV encoding.').replace('{db}', Math.max(0, peakDb).toFixed(1)));
    }

    let plan = null;
    if (sourceBuffer) {
        const sourceStart = roleState.mode === 'video' ? rangeStart : 0;
        const sourceEnd = roleState.mode === 'video' ? rangeEnd : partDuration;
        plan = createAudioRenderPlan(sourceBuffer.duration, sourceStart, sourceEnd, roleState);
        const silence = getAudioCompatibilitySilenceCauses(roleState, plan, data);
        if (silence.delayConsumesWindow) {
            warn('warning', t.audioExportWarnDelaySilent || 'Delay leaves 0.1s or less of meaningful audible content in the Part window.');
        }
        if (silence.sourceInConsumesWindow) {
            warn('warning', t.audioExportWarnSourceInSilent || 'Source start leaves 0.1s or less of source audio available to this Part.');
        }
        if (silence.endTrimConsumesWindow) {
            warn('warning', t.audioExportWarnEndTrimSilent || 'End trim leaves 0.1s or less of meaningful audible content in the Part window.');
        }
        if (silence.gainEffectivelySilent) {
            warn('warning', (t.audioExportWarnGainSilent || 'Gain leaves the final signal effectively silent ({db} dBFS peak).').replace('{db}', silence.effectivePeakDb <= -119 ? '−∞' : silence.effectivePeakDb.toFixed(1)));
        }
        if (!silence.delayConsumesWindow && !silence.sourceInConsumesWindow && !silence.endTrimConsumesWindow && !silence.gainEffectivelySilent && plan.playDuration <= silence.meaningfulDuration) {
            warn('warning', t.audioExportWarnSilent || 'Current timing leaves no meaningful audible content in this section.');
        }
        if (plan.playDuration > silence.meaningfulDuration) {
            if (plan.sourceAvailable + 0.03 < plan.destinationAvailable) {
                const gap = Math.max(0, plan.destinationAvailable - plan.playDuration);
                warn('warning', (t.audioExportWarnSourceShort || 'The source ends about {time} before the available section window.').replace('{time}', formatAudioSeconds(gap)));
            }
            if (roleState.sourceIn > 0 && roleState.sourceIn >= sourceBuffer.duration * 0.5) {
                info((t.audioExportInfoSkipped || '{time} of the source is skipped before playback.').replace('{time}', formatAudioSeconds(roleState.sourceIn)));
            }
            const fades = Math.max(0, Number(plan.fadeIn) || 0) + Math.max(0, Number(plan.fadeOut) || 0);
            if (plan.playDuration > 0 && fades >= plan.playDuration * 0.8) {
                info(t.audioExportInfoFades || 'Fade In + Fade Out cover most of the audible section.');
            }
        }
    }

    if (source.kind === 'file' && source.format !== 'WAV') {
        info((t.audioExportInfoConverted || '{format} will be decoded and exported as PCM 16-bit WAV.').replace('{format}', source.format));
    }
    if (!warningCount && !els.warnings.children.length) {
        info(t.audioExportReadyHint || 'Final WAV timing and level look ready for export.');
    }

    els.card.dataset.state = severity;
    const statusLabels = {
        ready: t.audioExportStatusReady || 'Ready',
        warning: t.audioExportStatusWarning || 'Check',
        danger: t.audioExportStatusDanger || 'Clipping'
    };
    if (els.status) els.status.textContent = statusLabels[severity] || statusLabels.ready;
    const result = { role, severity, source, outputBlob: data.blob, outputBuffer, sourceBuffer, metadata, plan, messages: compatibilityMessages };
    audioExportCompatibilityRuntime.results[role] = result;
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
    return result;
}

function getAudioExportCompatibilitySummary() {
    const result = {};
    ['intro', 'loop', 'final'].forEach(role => {
        const item = audioExportCompatibilityRuntime.results[role];
        result[role] = item ? {
            role: item.role,
            severity: item.severity,
            unavailable: !!item.unavailable,
            messages: Array.isArray(item.messages) ? item.messages.map(message => ({ kind: message.kind, text: message.text })) : []
        } : null;
    });
    return result;
}

window.getAudioExportCompatibilitySummary = getAudioExportCompatibilitySummary;

async function refreshAudioExportCompatibility(role) {
    const key = audioWaveformCacheKey(role, false);
    const cached = audioWaveformRuntime.cache.get(key);
    if (cached && cached.data) return await renderAudioExportCompatibility(role, cached.data);
    return await renderAudioExportCompatibility(role);
}

function initializeAudioExportCompatibility() {
    ['intro', 'loop', 'final'].forEach(role => {
        ensureAudioExportCompatibilityCard(role);
        syncAudioExportCompatibilityText(role);
        const select = document.getElementById(`sel-audio-${role}`);
        if (!document.getElementById('input-usar-som')?.checked || !select || select.value === 'none') resetAudioExportCompatibility(role);
        else refreshAudioExportCompatibility(role).catch(() => {});
    });
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

function syncAudioProcessingStudioText(role) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    const map = {
        [`lbl-gain-${role}`]: t.audioGain || 'Gain',
        [`lbl-fade-curve-${role}`]: t.audioFadeCurve || 'Fade curve',
        [`lbl-normalize-target-${role}`]: t.audioNormalizeTarget || 'Normalize target',
        [`lbl-processing-peak-${role}`]: t.audioProcessingPeak || 'Output peak',
        [`audio-fit-part-${role}`]: t.audioProcessingFit || 'Align end to Part',
        [`audio-reset-processing-${role}`]: t.audioProcessingReset || 'Reset processing'
    };
    Object.entries(map).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
    const curve = document.getElementById(`audio-fade-curve-${role}`);
    if (curve) {
        const labels = {
            linear: t.audioFadeCurveLinear || 'Linear',
            smooth: t.audioFadeCurveSmooth || 'Smooth',
            exponential: t.audioFadeCurveExponential || 'Exponential'
        };
        Array.from(curve.options).forEach(option => { option.textContent = labels[option.value] || option.textContent; });
    }
    ensureAudioFadeHandles(role);
    renderAudioFadeHandles(role);
    const meter = getAudioProcessingMeterElements(role);
    if (meter.root && meter.root.dataset.state === 'idle' && meter.status) meter.status.textContent = t.audioProcessingAnalyzeHint || 'Play or edit audio to analyze the processed output.';
}

function initializeAudioProcessingStudio() {
    ['intro', 'loop', 'final'].forEach(role => {
        syncAudioProcessingStudioText(role);
        syncAudioAdvancedLabels(role);
        resetAudioProcessingMeter(role);
    });
}

function initializeAudioWaveformUi() {
    ['intro', 'loop', 'final'].forEach(role => {
        ensureAudioStudioSyncControls(role);
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
    playerVideo.addEventListener('timeupdate', () => { syncEditorPreviewAudio(false); updateAllAudioStudioGlobalPlayheads(); });
    playerVideo.addEventListener('seeked', () => { syncEditorPreviewAudio(true); updateAllAudioStudioGlobalPlayheads(); });
    playerVideo.addEventListener('ended', handleEditorAudioPreviewPause);
}

initializeAudioWaveformUi();
initializeAudioProcessingStudio();
initializeAudioExportCompatibility();
setTimeout(() => { refreshAllAudioWaveforms(); refreshAudioStudioSyncUi(); }, 0);

function invalidateAdvancedAudioWaveform(id) {
    const prefix = `advanced:${id}:`;
    Array.from(audioWaveformRuntime.cache.keys()).forEach(key => {
        if (String(key).startsWith(prefix)) audioWaveformRuntime.cache.delete(key);
    });
    if (typeof renderTimeline3 === 'function') renderTimeline3();
}
