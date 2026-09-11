let performanceEstimateTimer = null;
let lastPerformanceEstimate = null;

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

function estimateEncodedFrameBytes(options) {
    const pixels = Math.max(1, options.width * options.height);
    if (projectUsesFrames()) {
        const known = getKnownImportedFrameBytes();
        if (known.average > 0 && currentProject.width > 0 && currentProject.height > 0) {
            const sourcePixels = currentProject.width * currentProject.height;
            const areaScale = Math.max(0.05, pixels / sourcePixels);
            return Math.max(2048, known.average * areaScale * getImportedFormatFactor(options.format));
        }
    }
    return Math.max(2048, pixels * (options.format === 'jpeg' ? 0.18 : 0.62));
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
        copies
    };
}

function getPerformanceLevelLabel(level, t) {
    if (level === 'heavy') return t.perfHeavy;
    if (level === 'moderate') return t.perfModerate;
    return t.perfLight;
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
    document.getElementById('perf-size').textContent = `${estimate.exactOutputSize ? '' : '≈ '}${formatByteEstimate(estimate.deliveredBytes)}`;
    document.getElementById('perf-memory').textContent = `≈ ${formatByteEstimate(estimate.estimatedMemoryBytes)}`;

    const badge = document.getElementById('perf-risk');
    badge.textContent = getPerformanceLevelLabel(estimate.level, t);
    badge.dataset.level = estimate.level;

    const note = document.getElementById('perf-note');
    if (estimate.untouched && estimate.copies === 1) {
        note.textContent = t.perfFastPath;
    } else if (estimate.level === 'heavy') {
        note.textContent = t.perfHeavyNote;
    } else if (estimate.level === 'moderate') {
        note.textContent = t.perfModerateNote;
    } else if (estimate.framesToProcess === 0) {
        note.textContent = t.perfNoFrames;
    } else {
        note.textContent = t.perfLightNote;
    }
}

function schedulePerformanceEstimate() {
    clearTimeout(performanceEstimateTimer);
    performanceEstimateTimer = setTimeout(updatePerformanceEstimate, 80);
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
