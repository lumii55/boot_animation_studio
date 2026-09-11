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

async function decodificarAudioFonte(fonte, audioCtx) {
    try {
        let arrBuf;
        if (fonte instanceof Blob) {
            arrBuf = await fonte.arrayBuffer();
        } else if (typeof fonte === 'string' && fonte.length > 0) {
            const res = await fetch(fonte);
            arrBuf = await res.arrayBuffer();
        } else {
            return null;
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        return await new Promise((resolve) => {
            const res = audioCtx.decodeAudioData(arrBuf, resolve, () => resolve(null));
            if (res && res.then) res.then(resolve).catch(() => resolve(null));
        });
    } catch (e) {
        console.error("Failed to decode audio source:", e);
        return null;
    }
}

function normalizeAudioProcessingOptions(options = {}) {
    return {
        fadeIn: clampAudioControlValue(options.fadeIn, 0, 5, 0),
        fadeOut: clampAudioControlValue(options.fadeOut, 0, 5, 0),
        offset: clampAudioControlValue(options.offset, -5, 5, 0),
        normalize: !!options.normalize
    };
}

function createAudioRenderPlan(bufferDuration, startSec, endSec, options = {}) {
    const advanced = normalizeAudioProcessingOptions(options);
    const requestedStart = Math.max(0, Number(startSec) || 0);
    const requestedEnd = Math.max(requestedStart, Number(endSec) || requestedStart);
    const outputDuration = Math.max(0, requestedEnd - requestedStart);
    const destinationStart = Math.max(0, advanced.offset);
    const sourceShift = Math.max(0, -advanced.offset);
    const sourceStart = Math.min(Math.max(0, bufferDuration), requestedStart + sourceShift);
    const sourceAvailable = Math.max(0, bufferDuration - sourceStart);
    const destinationAvailable = Math.max(0, outputDuration - destinationStart);
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
        if (needsVideo) videoAudioBuffer = await decodificarAudioFonte(playerVideo.src, audioCtx);

        for (const definition of definitions) {
            if (generation !== previewAudioBuildGeneration) return;
            const state = audioState[definition.role];
            if (!state || state.mode === 'none') continue;
            let blob = null;

            if (state.mode === 'video') {
                if (videoAudioBuffer && Number.isFinite(definition.start) && Number.isFinite(definition.end)) {
                    blob = await fatiarEGerarWav(videoAudioBuffer, definition.start, definition.end, audioCtx, state.volume / 100, state);
                }
            } else if (state.mode === 'file') {
                const source = getSelectedAudioFile(definition.role);
                const decoded = await decodificarAudioFonte(source, audioCtx);
                if (decoded) blob = await fatiarEGerarWav(decoded, 0, decoded.duration, audioCtx, state.volume / 100, state);
            }

            if (generation !== previewAudioBuildGeneration) return;
            if (blob) setPreviewAudio(definition.preview, blob);
        }
    } finally {
        videoAudioBuffer = null;
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}
