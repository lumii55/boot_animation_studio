let performanceEstimateTimer = null;
let performanceFrameSampleTimer = null;
let performanceFrameSampleVersion = 0;
let lastPerformanceEstimate = null;
const performanceFrameSamples = new WeakMap();

function formatByteEstimate(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unit]}`;
}

function getPerformanceOptions() {
    let fps = parseInt(document.getElementById('input-fps').value) || 30;
    fps = Math.min(60, Math.max(1, fps));
    return {
        fps,
        width: Math.max(1, parseInt(document.getElementById('input-largura').value) || originalW || 1),
        height: Math.max(1, parseInt(document.getElementById('input-altura').value) || originalH || 1),
        format: document.getElementById('input-formato').value,
        framing: normalizeFramingMode(document.getElementById('input-enquadramento').value),
        framingFocus: getCurrentFramingFocus(),
        manufacturer: document.getElementById('input-fabricante').value,
        generateModule: document.getElementById('input-gerar-modulo').checked,
        audio: captureAudioEditorState()
    };
}

function getValidSourceMarkerRange() {
    const source = getProjectSourceMarkers();
    if (!source || ['m0', 'm1', 'm2', 'm3'].some(key => !Number.isFinite(source[key]))) return null;
    if (!(source.m0 <= source.m1 && source.m1 <= source.m2 && source.m2 <= source.m3)) return null;
    return source;
}

function getSimpleFrameCount(fps) {
    const source = getValidSourceMarkerRange();
    if (!source) return 0;
    return Math.max(1, Math.floor((source.m3 - source.m0) * fps) + 1);
}

function getImportedRoundTripFrameCount(fps) {
    if (!projectUsesFrames()) return 0;
    const sourceFps = Math.max(1, currentProject.fps || 30);
    const seen = new Set();
    let total = 0;
    currentProject.parts.forEach((part, index) => {
        if (seen.has(part.name)) return;
        seen.add(part.name);
        const count = getProjectPartFrames(index).length;
        if (count > 0) total += Math.max(1, Math.round(count * fps / sourceFps));
    });
    return total;
}

function getKnownImportedFrameBytes() {
    if (!projectUsesFrames()) return { total: 0, count: 0, average: 0 };
    let total = 0;
    let count = 0;
    currentProject.frames.forEach(frame => {
        const size = Number.isFinite(frame.byteSize) ? frame.byteSize : frame.blob && frame.blob.size;
        if (Number.isFinite(size) && size > 0) {
            total += size;
            count++;
        }
    });
    return { total, count, average: count > 0 ? total / count : 0 };
}

function getImportedFormatFactor(targetFormat) {
    const formats = projectUsesFrames() ? currentProject.frames.map(frame => frame.format) : [];
    if (formats.length === 0) return 1;
    const pngCount = formats.filter(format => format === 'png').length;
    const sourceMostlyPng = pngCount >= formats.length / 2;
    if (sourceMostlyPng && targetFormat === 'jpeg') return 0.38;
    if (!sourceMostlyPng && targetFormat === 'png') return 2.4;
    return 1;
}

function getPerformanceSampleKey(options) {
    const source = getValidSourceMarkerRange();
    const start = source ? source.m0.toFixed(3) : '0';
    const end = source ? source.m3.toFixed(3) : '0';
    return `${options.width}x${options.height}:${options.format}:${options.framing}:${options.framingFocus.x.toFixed(3)}:${options.framingFocus.y.toFixed(3)}:${options.framingFocus.zoom.toFixed(3)}:${start}:${end}`;
}

function getCalibratedFrameBytes(options) {
    if (!currentProject) return 0;
    const samples = performanceFrameSamples.get(currentProject);
    if (!samples) return 0;
    return samples.get(getPerformanceSampleKey(options)) || 0;
}

function estimateEncodedFrameBytes(options) {
    const pixels = Math.max(1, options.width * options.height);
    const calibrated = getCalibratedFrameBytes(options);
    if (calibrated > 0) return calibrated;
    if (projectUsesFrames()) {
        const known = getKnownImportedFrameBytes();
        if (known.average > 0 && currentProject.width > 0 && currentProject.height > 0) {
            const sourcePixels = currentProject.width * currentProject.height;
            const areaScale = Math.max(0.05, pixels / sourcePixels);
            return Math.max(2048, known.average * areaScale * getImportedFormatFactor(options.format));
        }
    }
    return Math.max(2048, pixels * (options.format === 'jpeg' ? 0.035 : 0.32));
}

function waitForSampleVideoEvent(video, eventName) {
    return new Promise((resolve, reject) => {
        const done = () => {
            cleanup();
            resolve();
        };
        const fail = () => {
            cleanup();
            reject(new Error('Unable to sample video'));
        };
        const cleanup = () => {
            video.removeEventListener(eventName, done);
            video.removeEventListener('error', fail);
        };
        video.addEventListener(eventName, done, { once: true });
        video.addEventListener('error', fail, { once: true });
    });
}

async function seekSampleVideo(video, time) {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = duration > 0 ? Math.max(0, Math.min(time, Math.max(0, duration - 0.001))) : Math.max(0, time);
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.001) return;
    const ready = waitForSampleVideoEvent(video, 'seeked');
    video.currentTime = target;
    await ready;
}

async function sampleTemporalFrameBytes(options, project, version) {
    if (!project || project !== currentProject || project.sourceMode !== 'temporal' || isGenerating) return;
    const sourceBlob = project.sourceType === 'gif' ? project.previewBlob : (project.sourceBlob || project.previewBlob);
    if (!sourceBlob) return;
    const source = getValidSourceMarkerRange();
    if (!source || source.m3 <= source.m0) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(sourceBlob);
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = options.format === 'jpeg' ? 0.90 : undefined;

    try {
        const metadataReady = waitForSampleVideoEvent(video, 'loadedmetadata');
        video.src = url;
        video.load();
        await metadataReady;
        if (video.readyState < 2) await waitForSampleVideoEvent(video, 'loadeddata');

        const span = source.m3 - source.m0;
        const times = [0.2, 0.5, 0.8].map(fraction => source.m0 + span * fraction);
        const sizes = [];

        for (const time of times) {
            if (version !== performanceFrameSampleVersion || project !== currentProject || isGenerating) return;
            await seekSampleVideo(video, projectTimeToTimelineTime(time));
            drawFramedDrawable(ctx, video, options.width, options.height, options.framing, options.framingFocus);
            const blob = await canvasToBlobAsync(canvas, mimeType, quality);
            sizes.push(blob.size);
            await cooperativeYield();
        }

        if (sizes.length > 0 && version === performanceFrameSampleVersion && project === currentProject) {
            const average = sizes.reduce((sum, value) => sum + value, 0) / sizes.length;
            const estimated = Math.max(2048, average * 1.08);
            let samples = performanceFrameSamples.get(project);
            if (!samples) {
                samples = new Map();
                performanceFrameSamples.set(project, samples);
            }
            samples.set(getPerformanceSampleKey(options), estimated);
            updatePerformanceEstimate();
        }
    } catch (error) {
    } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        canvas.width = 1;
        canvas.height = 1;
    }
}


async function sampleFrameProjectBytes(options, project, version) {
    if (!project || project !== currentProject || project.sourceMode !== 'frames' || isGenerating) return;
    const source = getValidSourceMarkerRange();
    if (!source || source.m3 <= source.m0) return;

    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = options.format === 'jpeg' ? 0.90 : undefined;

    try {
        const span = source.m3 - source.m0;
        const times = [0.2, 0.5, 0.8].map(fraction => source.m0 + span * fraction);
        const sizes = [];

        for (const time of times) {
            if (version !== performanceFrameSampleVersion || project !== currentProject || isGenerating) return;
            const frame = getProjectFrameAtTime(time);
            if (!frame) continue;
            const blob = await getProjectFrameBlob(frame);
            const drawable = await blobToDrawable(blob);
            drawFramedDrawable(ctx, drawable, options.width, options.height, options.framing, options.framingFocus);
            releaseDrawable(drawable);
            const encoded = await canvasToBlobAsync(canvas, mimeType, quality);
            sizes.push(encoded.size);
            await cooperativeYield();
        }

        if (sizes.length > 0 && version === performanceFrameSampleVersion && project === currentProject) {
            const average = sizes.reduce((sum, value) => sum + value, 0) / sizes.length;
            const estimated = Math.max(2048, average * 1.08);
            let samples = performanceFrameSamples.get(project);
            if (!samples) {
                samples = new Map();
                performanceFrameSamples.set(project, samples);
            }
            samples.set(getPerformanceSampleKey(options), estimated);
            updatePerformanceEstimate();
        }
    } catch (error) {
    } finally {
        canvas.width = 1;
        canvas.height = 1;
    }
}

function schedulePerformanceFrameSample() {
    clearTimeout(performanceFrameSampleTimer);
    const project = currentProject;
    if (!project || isGenerating) return;
    const options = getPerformanceOptions();
    const key = getPerformanceSampleKey(options);
    const existing = performanceFrameSamples.get(project);
    if (existing && existing.has(key)) return;
    const version = ++performanceFrameSampleVersion;
    performanceFrameSampleTimer = setTimeout(() => {
        if (project.sourceMode === 'frames') sampleFrameProjectBytes(options, project, version);
        else sampleTemporalFrameBytes(options, project, version);
    }, 250);
}

function estimateAudioBytes(options, importedPreserve) {
    if (!options.audio.enabled) return 0;
    if (importedPreserve && currentProject && currentProject.parts) {
        const seen = new Set();
        let total = 0;
        currentProject.parts.forEach(part => {
            if (!part.audioBlob || seen.has(part.audioBlob)) return;
            seen.add(part.audioBlob);
            total += part.audioBlob.size || 0;
        });
        if (total > 0) return total;
    }
    const source = getValidSourceMarkerRange();
    if (!source) return 0;
    const ranges = {
        intro: Math.max(0, source.m1 - source.m0),
        loop: Math.max(0, source.m2 - source.m1),
        final: Math.max(0, source.m3 - source.m2)
    };
    let seconds = 0;
    ['intro', 'loop', 'final'].forEach(role => {
        if (options.audio[role] && options.audio[role].mode !== 'none') seconds += ranges[role];
    });
    return seconds * 192000;
}

function getGeneratedModuleCopyCount(manufacturer) {
    const counts = { standard: 3, miui: 5, mtk: 4, motorola: 4, emui: 4 };
    return counts[manufacturer] || counts.standard;
}

function estimateExportPerformance(options = getPerformanceOptions()) {
    const sourceMarkers = getValidSourceMarkerRange();
    if (!sourceMarkers) return null;

    const importedPreserve = typeof canPreserveImportedRoundTrip === 'function' && canPreserveImportedRoundTrip(options);
    const untouched = importedPreserve && typeof importedExportIsUntouched === 'function' && importedExportIsUntouched(options);
    const frameSettingsChanged = importedPreserve && !frameSettingsMatchProjectBaseline(options);
    const simpleFrames = getSimpleFrameCount(options.fps);
    const totalFrames = importedPreserve ? (frameSettingsChanged ? getImportedRoundTripFrameCount(options.fps) : currentProject.frames.length) : simpleFrames;
    const framesToProcess = untouched || (importedPreserve && !frameSettingsChanged) ? 0 : totalFrames;
    const frameBytes = estimateEncodedFrameBytes(options);
    const audioBytes = estimateAudioBytes(options, importedPreserve);

    let bootBytes;
    let exactBootSize = false;
    if (untouched && currentProject.sourceBlob) {
        bootBytes = currentProject.sourceBlob.size;
        exactBootSize = true;
    } else if (importedPreserve && !frameSettingsChanged && currentProject.sourceBlob) {
        bootBytes = Math.max(currentProject.sourceBlob.size, currentProject.sourceBlob.size + Math.max(0, audioBytes - estimateAudioBytes(currentProject.editorBaseline.frame ? { ...options, audio: currentProject.editorBaseline.audio } : options, true)));
    } else {
        const framePayload = totalFrames * frameBytes;
        const structuralBytes = importedPreserve && currentProject.sourceBlob ? Math.max(8192, currentProject.sourceBlob.size * 0.04) : 8192;
        bootBytes = framePayload + audioBytes + structuralBytes;
    }

    const copies = !isConnectedMode && options.generateModule ? getGeneratedModuleCopyCount(options.manufacturer) : 1;
    const deliveredBytes = bootBytes * copies + (copies > 1 ? 32768 : 0);
    const pixels = options.width * options.height;
    const rawWorkingBytes = pixels * 4 * (projectUsesFrames() ? 2.2 : 1.6);
    const sourceBytes = currentProject
        ? ((currentProject.sourceBlob && currentProject.sourceBlob.size) || 0) + ((currentProject.previewBlob && currentProject.previewBlob.size) || 0) + (projectUsesFrames() && currentProject.sourceBlob ? currentProject.sourceBlob.size : 0)
        : 0;
    const zipWorkingBytes = untouched ? bootBytes * 0.15 : bootBytes * 2.05;
    const deliveryWorkingBytes = copies > 1 ? deliveredBytes + bootBytes : 0;
    const estimatedMemoryBytes = sourceBytes + rawWorkingBytes + zipWorkingBytes + deliveryWorkingBytes;
    const workPixels = pixels * framesToProcess;

    let level = 'light';
    if (framesToProcess > 800 || estimatedMemoryBytes > 384 * 1024 * 1024 || deliveredBytes > 100 * 1024 * 1024 || workPixels > 900000000) level = 'moderate';
    if (framesToProcess > 1800 || estimatedMemoryBytes > 768 * 1024 * 1024 || deliveredBytes > 300 * 1024 * 1024 || workPixels > 2500000000) level = 'heavy';
    if (untouched && copies === 1) level = 'light';
    const exactOutputSize = exactBootSize && copies === 1;
    let bootLevel = 'recommended';
    if (bootBytes > 20 * 1024 * 1024) bootLevel = 'caution';
    if (bootBytes > 25 * 1024 * 1024) bootLevel = 'large';

    return {
        totalFrames,
        framesToProcess,
        bootBytes,
        deliveredBytes,
        estimatedMemoryBytes,
        exactBootSize,
        exactOutputSize,
        untouched,
        importedPreserve,
        frameSettingsChanged,
        level,
        bootLevel,
        copies
    };
}

function getPerformanceLevelLabel(level, t) {
    if (level === 'heavy') return t.perfHeavy;
    if (level === 'moderate') return t.perfModerate;
    return t.perfLight;
}

function getBootSizeLevelLabel(level, t) {
    if (level === 'large') return t.perfBootLarge;
    if (level === 'caution') return t.perfBootCaution;
    return t.perfBootRecommended;
}

function getBootSizeNote(level, t) {
    if (level === 'large') return t.perfBootLargeNote;
    if (level === 'caution') return t.perfBootCautionNote;
    return t.perfBootRecommendedNote;
}

function updatePerformanceEstimate() {
    const panel = document.getElementById('performance-estimate');
    if (!panel) return;
    const estimate = estimateExportPerformance();
    lastPerformanceEstimate = estimate;
    if (!estimate) {
        panel.style.display = 'none';
        return;
    }

    const t = traducoes[idiomaAtual];
    panel.style.display = 'flex';
    document.getElementById('perf-frames').textContent = estimate.totalFrames.toLocaleString();
    document.getElementById('perf-process').textContent = estimate.framesToProcess.toLocaleString();
    document.getElementById('perf-boot-size').textContent = `${estimate.exactBootSize ? '' : '≈ '}${formatByteEstimate(estimate.bootBytes)}`;
    document.getElementById('perf-size').textContent = `${estimate.exactOutputSize ? '' : '≈ '}${formatByteEstimate(estimate.deliveredBytes)}`;
    document.getElementById('perf-memory').textContent = `≈ ${formatByteEstimate(estimate.estimatedMemoryBytes)}`;

    const badge = document.getElementById('perf-risk');
    badge.textContent = `${t.perfGenerationPrefix}: ${getPerformanceLevelLabel(estimate.level, t)}`;
    badge.dataset.level = estimate.level;

    const bootBadge = document.getElementById('perf-boot-risk');
    bootBadge.textContent = `${t.perfBootPrefix}: ${getBootSizeLevelLabel(estimate.bootLevel, t)}`;
    bootBadge.dataset.level = estimate.bootLevel;

    let generationNote;
    if (estimate.untouched && estimate.copies === 1) {
        generationNote = t.perfFastPath;
    } else if (estimate.level === 'heavy') {
        generationNote = t.perfHeavyNote;
    } else if (estimate.level === 'moderate') {
        generationNote = t.perfModerateNote;
    } else if (estimate.framesToProcess === 0) {
        generationNote = t.perfNoFrames;
    } else {
        generationNote = t.perfLightNote;
    }
    document.getElementById('perf-note').textContent = `${generationNote} ${getBootSizeNote(estimate.bootLevel, t)}`;
}

function schedulePerformanceEstimate() {
    clearTimeout(performanceEstimateTimer);
    performanceEstimateTimer = setTimeout(() => {
        updatePerformanceEstimate();
        schedulePerformanceFrameSample();
    }, 80);
}

function confirmHeavyExport(estimate) {
    if (!estimate || estimate.level !== 'heavy') return true;
    const t = traducoes[idiomaAtual];
    const message = `${t.perfConfirmHeavy}\n\n${t.perfFrames}: ${estimate.totalFrames.toLocaleString()}\n${t.perfProcess}: ${estimate.framesToProcess.toLocaleString()}\n${t.perfSize}: ≈ ${formatByteEstimate(estimate.deliveredBytes)}\n${t.perfMemory}: ≈ ${formatByteEstimate(estimate.estimatedMemoryBytes)}`;
    return window.confirm(message);
}

window.addEventListener('DOMContentLoaded', () => {
    const config = document.getElementById('configuracoes');
    if (config) {
        config.addEventListener('input', schedulePerformanceEstimate);
        config.addEventListener('change', schedulePerformanceEstimate);
    }
    schedulePerformanceEstimate();
});
