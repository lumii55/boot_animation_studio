let performanceEstimateTimer = null;
let performanceFrameSampleTimer = null;
let performanceFrameSampleVersion = 0;
let lastPerformanceEstimate = null;
const performanceFrameSamples = new WeakMap();

const jpegQualityIntentRuntime = {
    source: 'default',
    changedAt: 0
};

function setJpegQualityChangeSource(source = 'system') {
    jpegQualityIntentRuntime.source = String(source || 'system');
    jpegQualityIntentRuntime.changedAt = Date.now();
}

function getJpegQualityStatus() {
    const value = normalizeJpegExportQuality(jpegExportQuality);
    const format = document.getElementById('input-formato')?.value || 'jpeg';
    return {
        format,
        value,
        percent: Math.round(value * 100),
        customized: format === 'jpeg' && Math.abs(value - 0.90) >= 0.005,
        source: jpegQualityIntentRuntime.source
    };
}


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
        jpegQuality: normalizeJpegExportQuality(jpegExportQuality),
        framing: normalizeFramingMode(document.getElementById('input-enquadramento').value),
        framingFocus: getCurrentFramingFocus(),
        manufacturer: document.getElementById('input-fabricante').value,
        generateModule: document.getElementById('input-gerar-modulo').checked,
        audio: captureAudioEditorState()
    };
}

function getValidSourceMarkerRange() {
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive() && typeof getAdvancedPerformanceRange === 'function') {
        const range = getAdvancedPerformanceRange();
        if (range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start) {
            return { m0: range.start, m1: range.start, m2: range.end, m3: range.end };
        }
    }
    const source = getProjectSourceMarkers();
    if (!source || ['m0', 'm1', 'm2', 'm3'].some(key => !Number.isFinite(source[key]))) return null;
    if (!(source.m0 <= source.m1 && source.m1 <= source.m2 && source.m2 <= source.m3)) return null;
    return source;
}

function getSimpleFrameCount(fps) {
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive() && typeof getAdvancedOutputFrameCount === 'function' && !(typeof advancedPartsCanUseSimpleExport === 'function' && advancedPartsCanUseSimpleExport())) return getAdvancedOutputFrameCount(fps);
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
    const advancedSignature = typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive() && typeof getAdvancedParts === 'function'
        ? getAdvancedParts().map(part => {
            const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
            return `${sourceId}:${part.start.toFixed(3)}-${part.end.toFixed(3)}`;
        }).join(',')
        : '';
    const masterSignature = window.BASMasterSequence && BASMasterSequence.isTimelineActive()
        ? BASMasterSequence.serialize().clips.map(clip => `${clip.sourceId}:${Number(clip.in || 0).toFixed(4)}-${Number(clip.out || 0).toFixed(4)}`).join('>')
        : '';
    return `${options.width}x${options.height}:${options.format}:${options.jpegQuality.toFixed(3)}:${options.framing}:${options.framingFocus.x.toFixed(3)}:${options.framingFocus.y.toFixed(3)}:${options.framingFocus.zoom.toFixed(3)}:${start}:${end}:${advancedSignature}:${masterSignature}`;
}

function performanceUsesMultipleVisualSources() {
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return true;
    if (!window.BASSourceLibrary || typeof isAdvancedPartsActive !== 'function' || !isAdvancedPartsActive() || typeof getAdvancedParts !== 'function') return false;
    const primaryId = BASSourceLibrary.getPrimaryId();
    return getAdvancedParts().some(part => BASSourceLibrary.getPartSourceId(part) !== primaryId);
}

function getMultiSourcePerformanceSamples(limit = 3) {
    if (!performanceUsesMultipleVisualSources()) return [];
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return BASMasterSequence.getSamplePoints(limit);
    if (typeof getAdvancedParts !== 'function') return [];
    const parts = getAdvancedParts().filter(part => Number.isFinite(part.start) && Number.isFinite(part.end) && part.end > part.start);
    if (!parts.length) return [];
    const count = Math.min(Math.max(1, limit), parts.length);
    const samples = [];
    for (let index = 0; index < count; index++) {
        const partIndex = count === 1 ? 0 : Math.round(index * (parts.length - 1) / (count - 1));
        const part = parts[partIndex];
        samples.push({
            sourceId: BASSourceLibrary.getPartSourceId(part),
            time: part.start + (part.end - part.start) * 0.5
        });
    }
    return samples;
}

async function sampleMultiSourceFrameBytes(options, project, version) {
    if (!project || project !== currentProject || isGenerating || !window.BASSourceLibrary) return;
    const samplesToRead = getMultiSourcePerformanceSamples(3);
    if (!samplesToRead.length) return;
    const sizes = [];
    try {
        for (const sample of samplesToRead) {
            if (version !== performanceFrameSampleVersion || project !== currentProject || isGenerating) return;
            const blob = await BASSourceLibrary.frameBlob(
                sample.sourceId,
                sample.time,
                options.width,
                options.height,
                options.format,
                options.framing,
                options.framingFocus,
                options.jpegQuality
            );
            if (blob && blob.size > 0) sizes.push(blob.size);
            await cooperativeYield();
        }
        if (sizes.length && version === performanceFrameSampleVersion && project === currentProject) {
            const average = sizes.reduce((sum, value) => sum + value, 0) / sizes.length;
            let projectSamples = performanceFrameSamples.get(project);
            if (!projectSamples) {
                projectSamples = new Map();
                performanceFrameSamples.set(project, projectSamples);
            }
            projectSamples.set(getPerformanceSampleKey(options), Math.max(2048, average * 1.08));
            updatePerformanceEstimate();
        }
    } catch (error) {
    }
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
    if (projectUsesFrames() && !performanceUsesMultipleVisualSources()) {
        const known = getKnownImportedFrameBytes();
        if (known.average > 0 && currentProject.width > 0 && currentProject.height > 0) {
            const sourcePixels = currentProject.width * currentProject.height;
            const areaScale = Math.max(0.05, pixels / sourcePixels);
            return Math.max(2048, known.average * areaScale * getImportedFormatFactor(options.format));
        }
    }
    return Math.max(2048, pixels * (options.format === 'jpeg' ? 0.035 : 0.32));
}





async function sampleTemporalFrameBytes(options, project, version) {
    if (!project || project !== currentProject || project.sourceMode !== 'temporal' || isGenerating) return;
    const source = getValidSourceMarkerRange();
    if (!source || source.m3 <= source.m0) return;
    try {
        const span = source.m3 - source.m0;
        const times = [0.2, 0.5, 0.8].map(fraction => source.m0 + span * fraction);
        const sizes = [];
        for (const time of times) {
            if (version !== performanceFrameSampleVersion || project !== currentProject || isGenerating) return;
            const encoded = await getProjectFrameOutputBlob(time, options.width, options.height, options.format, options.framing, options.framingFocus, options.jpegQuality);
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
    } catch (error) {}
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
    const quality = options.format === 'jpeg' ? options.jpegQuality : undefined;

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
        if (performanceUsesMultipleVisualSources()) sampleMultiSourceFrameBytes(options, project, version);
        else if (project.sourceMode === 'frames') sampleFrameProjectBytes(options, project, version);
        else sampleTemporalFrameBytes(options, project, version);
    }, 250);
}

function estimateAudioBytes(options, importedPreserve) {
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive() && !importedPreserve && typeof getAdvancedAudioDurationSeconds === 'function') {
        return getAdvancedAudioDurationSeconds() * 192000;
    }
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

function estimateExportPerformance(options = getPerformanceOptions(), frameBytesOverride = 0) {
    const sourceMarkers = getValidSourceMarkerRange();
    if (!sourceMarkers) return null;

    const importedPreserve = typeof canPreserveImportedRoundTrip === 'function' && canPreserveImportedRoundTrip(options);
    const untouched = importedPreserve && typeof importedExportIsUntouched === 'function' && importedExportIsUntouched(options);
    const frameSettingsChanged = importedPreserve && !frameSettingsMatchProjectBaseline(options);
    const simpleFrames = getSimpleFrameCount(options.fps);
    const totalFrames = importedPreserve ? (frameSettingsChanged ? getImportedRoundTripFrameCount(options.fps) : currentProject.frames.length) : simpleFrames;
    const framesToProcess = untouched || (importedPreserve && !frameSettingsChanged) ? 0 : totalFrames;
    const frameBytes = frameBytesOverride > 0 ? frameBytesOverride : estimateEncodedFrameBytes(options);
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

    const deliveryTarget = typeof getBuildDeliveryTarget === 'function' ? getBuildDeliveryTarget() : 'download';
    const copies = options.generateModule && deliveryTarget === 'download' ? getGeneratedModuleCopyCount(options.manufacturer) : 1;
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
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
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


let optimizerAnalysisVersion = 0;
let optimizerRecommendation = null;
let optimizerBaseEstimate = null;
let optimizerApplying = false;

function getOptimizationSourceRange() {
    const source = getValidSourceMarkerRange();
    if (!source || source.m3 <= source.m0) return null;
    return source;
}

function cloneOptimizationOptions(options) {
    return {
        ...options,
        framingFocus: { ...options.framingFocus },
        audio: options.audio
    };
}

function evenDimension(value) {
    return Math.max(2, Math.floor(Math.max(2, value) / 2) * 2);
}

const OPTIMIZER_RECOMMENDED_BOOT_BYTES = 20 * 1024 * 1024;

function optimizerClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function optimizerRoundQuality(value) {
    return normalizeJpegExportQuality(Math.round(Number(value) * 100) / 100);
}

function getOptimizerDeviceResolution() {
    if (window.BASDeviceProfile && typeof BASDeviceProfile.getResolution === 'function') {
        const resolved = BASDeviceProfile.getResolution();
        if (resolved && resolved.width > 0 && resolved.height > 0) return resolved;
    }
    if (typeof compatibilityGetDeviceResolution === 'function') {
        const resolved = compatibilityGetDeviceResolution();
        if (resolved && resolved.width > 0 && resolved.height > 0) return resolved;
    }
    return null;
}

function getOptimizationTargetBytes(baseEstimate) {
    const baseBytes = Math.max(1, Number(baseEstimate && baseEstimate.bootBytes) || 1);
    if (baseBytes > OPTIMIZER_RECOMMENDED_BOOT_BYTES) return OPTIMIZER_RECOMMENDED_BOOT_BYTES;
    // A project already inside the recommended boot-size band does not need a
    // forced quality drop. Smart Optimize still looks for a small, low-impact
    // saving so the manual action remains useful.
    return Math.max(1, baseBytes * 0.90);
}

function getOptimizationRequiredRatio(baseEstimate) {
    const baseBytes = Math.max(1, Number(baseEstimate && baseEstimate.bootBytes) || 1);
    return optimizerClamp(getOptimizationTargetBytes(baseEstimate) / baseBytes, 0.12, 0.98);
}

function getOptimizationQualityCandidates(base, baseEstimate) {
    const ratio = getOptimizationRequiredRatio(baseEstimate);
    const baseQuality = base.format === 'jpeg' ? normalizeJpegExportQuality(base.jpegQuality) : 0.92;
    // JPEG size is not linear with the quality slider. The encoder estimate in
    // BAS uses an exponent around 1.7, so invert that relationship to place the
    // first sample near the amount of reduction actually required.
    const predicted = optimizerRoundQuality(baseQuality * Math.pow(ratio, 1 / 1.7));
    const halfway = optimizerRoundQuality((baseQuality + predicted) / 2);
    const stronger = optimizerRoundQuality(predicted - Math.min(0.05, Math.max(0.02, (1 - ratio) * 0.08)));
    const values = [halfway, predicted, stronger]
        .filter(value => value < baseQuality - 0.005)
        .filter((value, index, list) => list.indexOf(value) === index);
    if (base.format === 'png') {
        // PNG -> JPEG is already a major size lever. Start conservatively and
        // let real frame samples decide whether more compression is necessary.
        return [0.92, Math.max(0.78, predicted), Math.max(0.68, stronger)]
            .map(optimizerRoundQuality)
            .filter((value, index, list) => list.indexOf(value) === index);
    }
    return values;
}

function getOptimizationResolutionCandidates(base, baseEstimate) {
    const candidates = [];
    const seen = new Set();
    const add = (width, height, reason = 'size') => {
        const resolved = { width: evenDimension(width), height: evenDimension(height), reason };
        if (resolved.width >= base.width && resolved.height >= base.height) return;
        const key = `${resolved.width}x${resolved.height}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(resolved);
    };

    const device = getOptimizerDeviceResolution();
    if (device && device.width > 0 && device.height > 0) {
        const basePixels = Math.max(1, base.width * base.height);
        const devicePixels = device.width * device.height;
        if (devicePixels < basePixels || base.width !== device.width || base.height !== device.height) {
            // Never use a larger connected display as an optimization step, but
            // prefer the exact native screen when it is a genuine reduction.
            if (devicePixels <= basePixels) add(device.width, device.height, 'device');
        }
    }

    const ratio = getOptimizationRequiredRatio(baseEstimate);
    const neededScale = optimizerClamp(Math.sqrt(ratio), 0.58, 0.94);
    const gentleScale = optimizerClamp((1 + neededScale) / 2, 0.78, 0.96);
    add(base.width * gentleScale, base.height * gentleScale);
    add(base.width * neededScale, base.height * neededScale);
    return candidates;
}

function getOptimizationFpsCandidates(base, baseEstimate) {
    const fps = Math.max(1, Math.round(Number(base.fps) || 30));
    if (fps <= 15) return [];
    const ratio = getOptimizationRequiredRatio(baseEstimate);
    const desired = fps * ratio;
    const common = [60, 50, 48, 45, 40, 36, 30, 25, 24, 20, 18, 15, 12];
    const lower = common.filter(value => value < fps);
    if (!lower.length) return [];
    const nearestNeeded = lower.reduce((best, value) => Math.abs(value - desired) < Math.abs(best - desired) ? value : best, lower[0]);
    const gentleTarget = fps - Math.max(1, (fps - nearestNeeded) / 2);
    const nearestGentle = lower.reduce((best, value) => Math.abs(value - gentleTarget) < Math.abs(best - gentleTarget) ? value : best, lower[0]);
    return [nearestGentle, nearestNeeded].filter((value, index, list) => value > 0 && list.indexOf(value) === index);
}

function addOptimizationCandidate(list, seen, base, patch) {
    const candidate = cloneOptimizationOptions(base);
    Object.assign(candidate, patch);
    candidate.jpegQuality = normalizeJpegExportQuality(candidate.jpegQuality);
    candidate.width = evenDimension(candidate.width);
    candidate.height = evenDimension(candidate.height);
    candidate.fps = Math.max(1, Math.min(60, Math.round(candidate.fps)));
    const key = `${candidate.width}x${candidate.height}:${candidate.fps}:${candidate.format}:${candidate.jpegQuality.toFixed(3)}`;
    const baseKey = `${base.width}x${base.height}:${base.fps}:${base.format}:${base.jpegQuality.toFixed(3)}`;
    if (key === baseKey || seen.has(key)) return;
    seen.add(key);
    list.push(candidate);
}

function buildOptimizationCandidates(base, baseEstimate) {
    const list = [];
    const seen = new Set();
    const qualities = getOptimizationQualityCandidates(base, baseEstimate);
    const resolutions = getOptimizationResolutionCandidates(base, baseEstimate);
    const fpsValues = getOptimizationFpsCandidates(base, baseEstimate);
    const makeImagePatch = quality => base.format === 'png'
        ? { format: 'jpeg', jpegQuality: quality }
        : { jpegQuality: quality };

    // Single-lever samples let BAS avoid changing resolution/FPS when a quality
    // adjustment alone is enough for the requested reduction.
    qualities.forEach(quality => addOptimizationCandidate(list, seen, base, makeImagePatch(quality)));
    fpsValues.forEach(fps => addOptimizationCandidate(list, seen, base, { fps }));
    resolutions.forEach(resolution => addOptimizationCandidate(list, seen, base, { width: resolution.width, height: resolution.height }));

    const qualityMain = qualities[Math.min(1, Math.max(0, qualities.length - 1))];
    const qualityStrong = qualities[qualities.length - 1];
    const fpsMain = fpsValues[fpsValues.length - 1];
    const resolutionMain = resolutions[resolutions.length - 1];
    const deviceResolution = resolutions.find(item => item.reason === 'device');

    if (qualityMain && fpsMain) addOptimizationCandidate(list, seen, base, { ...makeImagePatch(qualityMain), fps: fpsMain });
    if (qualityMain && resolutionMain) addOptimizationCandidate(list, seen, base, { ...makeImagePatch(qualityMain), width: resolutionMain.width, height: resolutionMain.height });
    if (fpsMain && resolutionMain) addOptimizationCandidate(list, seen, base, { fps: fpsMain, width: resolutionMain.width, height: resolutionMain.height });
    if (qualityMain && fpsMain && resolutionMain) addOptimizationCandidate(list, seen, base, { ...makeImagePatch(qualityMain), fps: fpsMain, width: resolutionMain.width, height: resolutionMain.height });
    if (qualityStrong && resolutionMain) addOptimizationCandidate(list, seen, base, { ...makeImagePatch(qualityStrong), width: resolutionMain.width, height: resolutionMain.height });
    if (deviceResolution && qualityMain) addOptimizationCandidate(list, seen, base, { ...makeImagePatch(qualityMain), width: deviceResolution.width, height: deviceResolution.height });
    if (deviceResolution && qualityMain && fpsMain) addOptimizationCandidate(list, seen, base, { ...makeImagePatch(qualityMain), fps: fpsMain, width: deviceResolution.width, height: deviceResolution.height });

    return list.slice(0, 16);
}

function getOptimizationPenalty(base, candidate) {
    let penalty = 0;
    if (base.format !== candidate.format) penalty += 0.9;
    if (candidate.format === 'jpeg') {
        const baseQuality = base.format === 'jpeg' ? base.jpegQuality : 0.90;
        penalty += Math.max(0, baseQuality - candidate.jpegQuality) * 8;
    }
    if (candidate.fps < base.fps) penalty += (1 - candidate.fps / base.fps) * 2.5;
    const basePixels = Math.max(1, base.width * base.height);
    const candidatePixels = Math.max(1, candidate.width * candidate.height);
    if (candidatePixels < basePixels) penalty += (1 - candidatePixels / basePixels) * 2.5;
    return penalty;
}

function getOptimizationImpact(penalty) {
    if (penalty <= 1.0) return 'low';
    if (penalty <= 1.8) return 'medium';
    return 'high';
}

function getOptimizationChanges(base, candidate) {
    const changes = [];
    if (base.format !== candidate.format) changes.push(candidate.format.toUpperCase());
    if (candidate.format === 'jpeg' && (base.format !== 'jpeg' || Math.abs(candidate.jpegQuality - base.jpegQuality) >= 0.005)) {
        changes.push(`JPEG ${Math.round(candidate.jpegQuality * 100)}%`);
    }
    if (candidate.fps !== base.fps) changes.push(`${candidate.fps} FPS`);
    if (candidate.width !== base.width || candidate.height !== base.height) changes.push(`${candidate.width}×${candidate.height}`);
    return changes;
}

function getOptimizationEncodingWeight(options) {
    const pixels = Math.max(1, options.width * options.height);
    if (options.format === 'png') return pixels * 0.32;
    const quality = normalizeJpegExportQuality(options.jpegQuality);
    const qualityFactor = Math.pow(Math.max(0.45, quality) / 0.90, 1.7);
    return pixels * 0.035 * qualityFactor;
}

function getOptimizationFallbackFrameBytes(base, options, baseFrameBytes) {
    const calibrated = getCalibratedFrameBytes(options);
    if (calibrated > 0) return calibrated;
    const baseWeight = getOptimizationEncodingWeight(base);
    const optionWeight = getOptimizationEncodingWeight(options);
    if (baseFrameBytes > 0 && baseWeight > 0) {
        return Math.max(2048, baseFrameBytes * optionWeight / baseWeight);
    }
    const estimated = estimateEncodedFrameBytes(options);
    if (options.format !== 'jpeg') return estimated;
    const quality = normalizeJpegExportQuality(options.jpegQuality);
    return Math.max(2048, estimated * Math.pow(quality / 0.90, 1.7));
}

function storeOptimizationRealSample(project, options, sizes) {
    if (!project || !sizes.length) return 0;
    const average = Math.max(2048, (sizes.reduce((sum, size) => sum + size, 0) / sizes.length) * 1.08);
    let samples = performanceFrameSamples.get(project);
    if (!samples) {
        samples = new Map();
        performanceFrameSamples.set(project, samples);
    }
    samples.set(getPerformanceSampleKey(options), average);
    return average;
}

async function measureMultiSourceOptimizationFrameBytes(optionsList, version) {
    const project = currentProject;
    if (!project || version !== optimizerAnalysisVersion || !window.BASSourceLibrary) throw new Error('cancelled');
    const values = new Map();
    const pending = [];
    const sizes = new Map();
    optionsList.forEach(options => {
        const cached = getCalibratedFrameBytes(options);
        if (cached > 0) values.set(options, cached);
        else {
            pending.push(options);
            sizes.set(options, []);
        }
    });
    if (!pending.length) return { values, approximate: false };
    const points = getMultiSourcePerformanceSamples(3);
    if (!points.length) return { values, approximate: true };
    let approximate = false;
    for (const point of points) {
        if (version !== optimizerAnalysisVersion || project !== currentProject) throw new Error('cancelled');
        for (const options of pending) {
            try {
                const blob = await BASSourceLibrary.frameBlob(
                    point.sourceId,
                    point.time,
                    options.width,
                    options.height,
                    options.format,
                    options.framing,
                    options.framingFocus,
                    options.jpegQuality
                );
                if (blob && blob.size > 0) sizes.get(options).push(blob.size);
                else approximate = true;
            } catch (error) {
                approximate = true;
            }
            await cooperativeYield();
        }
    }
    pending.forEach(options => {
        const optionSizes = sizes.get(options) || [];
        if (optionSizes.length) values.set(options, storeOptimizationRealSample(project, options, optionSizes));
        if (optionSizes.length < points.length) approximate = true;
    });
    const base = optionsList[0];
    let baseFrameBytes = values.get(base) || 0;
    if (!(baseFrameBytes > 0)) {
        baseFrameBytes = getOptimizationFallbackFrameBytes(base, base, 0);
        values.set(base, baseFrameBytes);
        approximate = true;
    }
    optionsList.slice(1).forEach(options => {
        if (values.has(options)) return;
        values.set(options, getOptimizationFallbackFrameBytes(base, options, baseFrameBytes));
        approximate = true;
    });
    return { values, approximate };
}

async function measureOptimizationFrameBytesBatch(optionsList, version) {
    if (performanceUsesMultipleVisualSources()) return await measureMultiSourceOptimizationFrameBytes(optionsList, version);
    const project = currentProject;
    if (!project || version !== optimizerAnalysisVersion) throw new Error('cancelled');
    const values = new Map();
    const pending = [];
    const sizes = new Map();
    optionsList.forEach(options => {
        const cached = getCalibratedFrameBytes(options);
        if (cached > 0) values.set(options, cached);
        else {
            pending.push(options);
            sizes.set(options, []);
        }
    });
    if (!pending.length) return { values, approximate: false };
    const source = getOptimizationSourceRange();
    if (!source) throw new Error('range');
    const span = source.m3 - source.m0;
    const largestPixels = pending.reduce((max, options) => Math.max(max, options.width * options.height), 0);
    const fractions = largestPixels > 2400000 ? [0.32, 0.68] : [0.22, 0.50, 0.78];
    const times = fractions.map(fraction => source.m0 + span * fraction);
    let sourceAvailable = true;
    try {
        for (const time of times) {
            if (version !== optimizerAnalysisVersion || project !== currentProject) throw new Error('cancelled');
            for (const options of pending) {
                if (version !== optimizerAnalysisVersion || project !== currentProject) throw new Error('cancelled');
                try {
                    const encoded = await getProjectFrameOutputBlob(time, options.width, options.height, options.format, options.framing, options.framingFocus, options.jpegQuality);
                    if (encoded) sizes.get(options).push(encoded.size);
                } catch (error) {
                    if (error && error.message === 'cancelled') throw error;
                }
                await cooperativeYield();
            }
        }
    } catch (error) {
        if (error && error.message === 'cancelled') throw error;
        sourceAvailable = false;
    }
    let approximate = !sourceAvailable;
    pending.forEach(options => {
        const optionSizes = sizes.get(options) || [];
        if (optionSizes.length) {
            values.set(options, storeOptimizationRealSample(project, options, optionSizes));
            if (optionSizes.length < times.length) approximate = true;
        } else approximate = true;
    });
    const base = optionsList[0];
    let baseFrameBytes = values.get(base) || 0;
    if (!(baseFrameBytes > 0)) {
        baseFrameBytes = getOptimizationFallbackFrameBytes(base, base, 0);
        values.set(base, baseFrameBytes);
        approximate = true;
    }
    optionsList.slice(1).forEach(options => {
        if (values.has(options)) return;
        values.set(options, getOptimizationFallbackFrameBytes(base, options, baseFrameBytes));
        approximate = true;
    });
    return { values, approximate };
}

function chooseOptimizationRecommendation(baseEstimate, results) {
    const targetBytes = getOptimizationTargetBytes(baseEstimate);
    const useful = results.filter(item => item.savingPercent >= 4 && item.estimate.bootBytes < baseEstimate.bootBytes);
    if (!useful.length) return null;

    const baseAboveRecommended = baseEstimate.bootBytes > OPTIMIZER_RECOMMENDED_BOOT_BYTES;
    if (baseAboveRecommended) {
        const underTarget = useful.filter(item => item.estimate.bootBytes <= targetBytes);
        if (underTarget.length) {
            // Reach the goal with the smallest visual cost. When two options
            // cost about the same, prefer the one that lands closest to target
            // instead of over-compressing for no reason.
            return underTarget.sort((a, b) =>
                a.penalty - b.penalty ||
                Math.abs(a.estimate.bootBytes - targetBytes) - Math.abs(b.estimate.bootBytes - targetBytes) ||
                b.estimate.bootBytes - a.estimate.bootBytes
            )[0];
        }
        // If no tested combination reaches the recommended band, return the
        // strongest useful improvement rather than pretending the target was met.
        return useful.sort((a, b) =>
            a.estimate.bootBytes - b.estimate.bootBytes ||
            a.penalty - b.penalty
        )[0];
    }

    const low = useful.filter(item => item.impact === 'low').sort((a, b) => a.penalty - b.penalty || b.savingPercent - a.savingPercent);
    if (low.length) return low[0];
    const medium = useful.filter(item => item.impact === 'medium').sort((a, b) => a.penalty - b.penalty || b.savingPercent - a.savingPercent);
    if (medium.length) return medium[0];
    return useful.sort((a, b) => a.penalty - b.penalty || b.savingPercent - a.savingPercent)[0];
}

function setOptimizerBusy(busy) {
    const button = document.getElementById('btn-optimize');
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
}

function setOptimizerStatus(text) {
    const status = document.getElementById('optimizer-status');
    if (status) status.textContent = text || '';
}

function syncJpegQualityControl() {
    const wrapper = document.getElementById('wrap-jpeg-quality');
    const input = document.getElementById('input-jpeg-quality');
    const value = document.getElementById('jpeg-quality-value');
    const format = document.getElementById('input-formato')?.value || 'jpeg';
    const percent = Math.round(normalizeJpegExportQuality(jpegExportQuality) * 100);
    if (wrapper) wrapper.hidden = format !== 'jpeg';
    if (input) {
        input.value = String(percent);
        input.setAttribute('aria-valuetext', `${percent}%`);
    }
    if (value) value.textContent = `${percent}%`;
}

function setJpegQualityFromControl() {
    const input = document.getElementById('input-jpeg-quality');
    if (!input) return;
    jpegExportQuality = normalizeJpegExportQuality(Number(input.value) / 100);
    setJpegQualityChangeSource('manual');
    syncJpegQualityControl();
    updateOptimizerQualityBadge();
    invalidateOptimizerResult();
    schedulePerformanceEstimate();
    if (typeof updateOutputIntent === 'function') updateOutputIntent();
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
}

function updateOptimizerQualityBadge() {
    const badge = document.getElementById('optimizer-quality-badge');
    if (!badge) return;
    const t = traducoes[idiomaAtual];
    const status = getJpegQualityStatus();
    if (status.customized) {
        badge.textContent = t.optimizeQualityActive.replace('{value}', status.percent);
        const resetText = (t.optimizeQualityReset || 'Custom JPEG quality is active. Click to reset to 90%.').replace('{value}', status.percent);
        badge.title = resetText;
        badge.setAttribute('aria-label', resetText);
        badge.style.display = 'inline-flex';
    } else {
        badge.removeAttribute('title');
        badge.removeAttribute('aria-label');
        badge.style.display = 'none';
    }
}

function renderOptimizerRecommendation(recommendation, baseEstimate) {
    const result = document.getElementById('optimizer-result');
    if (!result) return;
    const t = traducoes[idiomaAtual];
    if (!recommendation) {
        result.style.display = 'none';
        setOptimizerStatus(t.optimizeNoGain);
        return;
    }
    optimizerRecommendation = recommendation;
    result.style.display = 'flex';
    const targetBytes = getOptimizationTargetBytes(baseEstimate);
    const target = document.getElementById('optimizer-target');
    if (target) {
        const targetLabel = baseEstimate.bootBytes > OPTIMIZER_RECOMMENDED_BOOT_BYTES
            ? (t.optimizeTargetRecommended || 'Recommended target: ≤ {size}')
            : (t.optimizeTargetLighter || 'Low-impact target: ≈ {size}');
        target.textContent = targetLabel.replace('{size}', formatByteEstimate(targetBytes));
        target.dataset.state = recommendation.estimate.bootBytes <= targetBytes ? 'reached' : 'progress';
    }
    document.getElementById('optimizer-current-size').textContent = `≈ ${formatByteEstimate(baseEstimate.bootBytes)}`;
    document.getElementById('optimizer-new-size').textContent = `≈ ${formatByteEstimate(recommendation.estimate.bootBytes)}`;
    document.getElementById('optimizer-saving').textContent = t.optimizeSaving.replace('{percent}', recommendation.savingPercent.toFixed(0));
    const impactText = recommendation.impact === 'low' ? t.optimizeImpactLow : recommendation.impact === 'medium' ? t.optimizeImpactMedium : t.optimizeImpactHigh;
    const impact = document.getElementById('optimizer-impact');
    impact.textContent = `${t.optimizeImpact}: ${impactText}`;
    impact.dataset.level = recommendation.impact;
    const changes = document.getElementById('optimizer-changes');
    changes.innerHTML = '';
    recommendation.changes.forEach(change => {
        const chip = document.createElement('span');
        chip.textContent = change;
        changes.appendChild(chip);
    });
    document.getElementById('btn-optimizer-apply').disabled = false;
    document.getElementById('btn-optimizer-apply').textContent = t.optimizeApply;
    setOptimizerStatus(t.optimizeReady);
}

function invalidateOptimizerResult() {
    if (optimizerApplying) return;
    optimizerAnalysisVersion++;
    optimizerRecommendation = null;
    optimizerBaseEstimate = null;
    const result = document.getElementById('optimizer-result');
    if (result) result.style.display = 'none';
    const target = document.getElementById('optimizer-target');
    if (target) {
        target.textContent = '';
        delete target.dataset.state;
    }
    setOptimizerStatus('');
    setOptimizerBusy(false);
    updateOptimizerQualityBadge();
}

async function runSmartOptimizer(options = {}) {
    if (!currentProject || isGenerating) return;
    const t = traducoes[idiomaAtual];
    const base = getPerformanceOptions();
    const version = ++optimizerAnalysisVersion;
    optimizerRecommendation = null;
    const panel = document.getElementById('optimizer-panel');
    const result = document.getElementById('optimizer-result');
    if (panel) panel.style.display = 'flex';
    if (result) result.style.display = 'none';
    setOptimizerBusy(true);

    try {
        // Pass 1 measures the actual current project. Candidate quality/resolution
        // is derived only after BAS knows how far the build is from its target.
        setOptimizerStatus(t.optimizeSamplingBase || t.optimizeSampling || 'Sampling current output…');
        const baseMeasured = await measureOptimizationFrameBytesBatch([base], version);
        if (version !== optimizerAnalysisVersion) return;
        const baseFrameBytes = baseMeasured.values.get(base) || getOptimizationFallbackFrameBytes(base, base, 0);
        const baseEstimate = estimateExportPerformance(base, baseFrameBytes);
        if (!baseEstimate) throw new Error('estimate');
        optimizerBaseEstimate = baseEstimate;

        const candidates = buildOptimizationCandidates(base, baseEstimate);
        if (!candidates.length) {
            renderOptimizerRecommendation(null, baseEstimate);
            return;
        }
        setOptimizerStatus((t.optimizeAdaptiveSampling || 'Testing {total} adaptive combinations…').replace('{total}', String(candidates.length)));
        const measured = await measureOptimizationFrameBytesBatch([base, ...candidates], version);
        if (version !== optimizerAnalysisVersion) return;
        const results = [];

        for (let i = 0; i < candidates.length; i++) {
            if (version !== optimizerAnalysisVersion) return;
            const candidate = candidates[i];
            const frameBytes = measured.values.get(candidate) || getOptimizationFallbackFrameBytes(base, candidate, baseFrameBytes);
            const estimate = estimateExportPerformance(candidate, frameBytes);
            if (!estimate) continue;
            const savingPercent = Math.max(0, (1 - estimate.bootBytes / Math.max(1, baseEstimate.bootBytes)) * 100);
            const penalty = getOptimizationPenalty(base, candidate);
            results.push({
                options: candidate,
                estimate,
                savingPercent,
                penalty,
                impact: getOptimizationImpact(penalty),
                changes: getOptimizationChanges(base, candidate)
            });
        }

        if (version !== optimizerAnalysisVersion) return;
        const recommendation = chooseOptimizationRecommendation(baseEstimate, results);
        renderOptimizerRecommendation(recommendation, baseEstimate);
        if (recommendation && (baseMeasured.approximate || measured.approximate)) setOptimizerStatus(t.optimizeReadyApproximate || t.optimizeReady);
    } catch (error) {
        if (version !== optimizerAnalysisVersion || error.message === 'cancelled') return;
        setOptimizerStatus(t.optimizeFailed);
        if (typeof showToast === 'function') showToast(t.optimizeFailed, 'error', 4200);
    } finally {
        if (version === optimizerAnalysisVersion) setOptimizerBusy(false);
    }
}

function applyOptimizerRecommendation() {
    if (!optimizerRecommendation) return;
    const t = traducoes[idiomaAtual];
    const options = optimizerRecommendation.options;
    optimizerApplying = true;
    document.getElementById('input-formato').value = options.format;
    document.getElementById('input-fps').value = options.fps;
    document.getElementById('input-largura').value = options.width;
    document.getElementById('input-altura').value = options.height;
    jpegExportQuality = normalizeJpegExportQuality(options.jpegQuality);
    setJpegQualityChangeSource('optimizer');
    if (typeof aoMudarTamanhoManual === 'function') aoMudarTamanhoManual();
    if (typeof atualizarPreviewEnquadramento === 'function') atualizarPreviewEnquadramento();
    optimizerApplying = false;
    syncJpegQualityControl();
    updateOptimizerQualityBadge();
    schedulePerformanceEstimate();
    if (typeof syncDeviceProfileUi === 'function') syncDeviceProfileUi();
    const button = document.getElementById('btn-optimizer-apply');
    if (button) {
        button.disabled = true;
        button.textContent = t.optimizeAppliedButton;
    }
    setOptimizerStatus(t.optimizeApplied);
    if (typeof showToast === 'function') showToast(t.optimizeApplied, 'success', 3400);
}

function syncOptimizerText() {
    const t = traducoes[idiomaAtual];
    const button = document.getElementById('btn-optimize');
    const title = document.getElementById('optimizer-title');
    const hint = document.getElementById('optimizer-hint');
    const current = document.getElementById('optimizer-current-label');
    const suggested = document.getElementById('optimizer-new-label');
    const apply = document.getElementById('btn-optimizer-apply');
    if (button) button.textContent = t.optimizeButton;
    if (title) title.textContent = t.optimizeTitle;
    if (hint) hint.textContent = t.optimizeHint;
    if (current) current.textContent = t.optimizeCurrent;
    if (suggested) suggested.textContent = t.optimizeSuggested;
    if (apply && !apply.disabled) apply.textContent = t.optimizeApply;
    updateOptimizerQualityBadge();
    if (optimizerRecommendation && optimizerBaseEstimate) {
        const target = document.getElementById('optimizer-target');
        if (target) {
            const targetBytes = getOptimizationTargetBytes(optimizerBaseEstimate);
            const targetLabel = optimizerBaseEstimate.bootBytes > OPTIMIZER_RECOMMENDED_BOOT_BYTES
                ? (t.optimizeTargetRecommended || 'Recommended target: ≤ {size}')
                : (t.optimizeTargetLighter || 'Low-impact target: ≈ {size}');
            target.textContent = targetLabel.replace('{size}', formatByteEstimate(targetBytes));
            target.dataset.state = optimizerRecommendation.estimate.bootBytes <= targetBytes ? 'reached' : 'progress';
        }
    }
    if (optimizerRecommendation) {
        const saving = document.getElementById('optimizer-saving');
        const impact = document.getElementById('optimizer-impact');
        const apply = document.getElementById('btn-optimizer-apply');
        if (saving) saving.textContent = t.optimizeSaving.replace('{percent}', optimizerRecommendation.savingPercent.toFixed(0));
        if (impact) {
            const impactText = optimizerRecommendation.impact === 'low' ? t.optimizeImpactLow : optimizerRecommendation.impact === 'medium' ? t.optimizeImpactMedium : t.optimizeImpactHigh;
            impact.textContent = `${t.optimizeImpact}: ${impactText}`;
        }
        if (apply) apply.textContent = apply.disabled ? t.optimizeAppliedButton : t.optimizeApply;
    }
}

window.setJpegQualityChangeSource = setJpegQualityChangeSource;
window.getJpegQualityStatus = getJpegQualityStatus;
window.BASSmartOptimizer = Object.freeze({ run: runSmartOptimizer, targetBytes: getOptimizationTargetBytes, recommendedBytes: OPTIMIZER_RECOMMENDED_BOOT_BYTES });

window.addEventListener('DOMContentLoaded', () => {
    const config = document.getElementById('configuracoes');
    if (config) {
        config.addEventListener('input', event => {
            schedulePerformanceEstimate();
            if (event.target && event.target.id !== 'btn-optimize') invalidateOptimizerResult();
        });
        config.addEventListener('change', event => {
            schedulePerformanceEstimate();
            if (event.target && event.target.id === 'input-formato') syncJpegQualityControl();
            invalidateOptimizerResult();
        });
    }
    document.getElementById('input-jpeg-quality')?.addEventListener('input', setJpegQualityFromControl);
    document.getElementById('input-jpeg-quality')?.addEventListener('change', setJpegQualityFromControl);
    document.getElementById('btn-optimize')?.addEventListener('click', runSmartOptimizer);
    document.getElementById('btn-optimizer-apply')?.addEventListener('click', applyOptimizerRecommendation);
    document.getElementById('optimizer-quality-badge')?.addEventListener('click', () => {
        jpegExportQuality = 0.90;
        setJpegQualityChangeSource('reset');
        syncJpegQualityControl();
        invalidateOptimizerResult();
        schedulePerformanceEstimate();
        if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck(0);
        if (typeof syncReleaseUi === 'function') syncReleaseUi();
        if (typeof projectEngineTouch === 'function') projectEngineTouch('jpeg-quality-reset', { changeKey: 'input-jpeg-quality', immediate: true });
    });
    syncJpegQualityControl();
    syncOptimizerText();
    schedulePerformanceEstimate();
});
