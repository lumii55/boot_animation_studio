const BAS_COMPATIBILITY_VERSION = 3;
const BAS_LEGACY_DIRECT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const BAS_LARGE_BOOT_WARNING_BYTES = 25 * 1024 * 1024;

const compatibilityRuntime = {
    timer: 0,
    result: null,
    diagnosticsById: new Map(),
    generation: 0
};

function compatibilityText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function compatibilityTemplate(key, fallback, values = {}) {
    let text = compatibilityText(key, fallback);
    Object.entries(values).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value));
    });
    return text;
}

function compatibilityFormatBytes(bytes) {
    if (typeof formatByteEstimate === 'function') return formatByteEstimate(bytes);
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 100 * 1024 * 1024 ? 1 : 0)} MB`;
}

function compatibilityDiagnostic(code, severity, scope, title, description, options = {}) {
    return {
        id: `${scope}:${code}:${options.instance || ''}`,
        code,
        severity: ['blocked', 'warning', 'unknown', 'info'].includes(severity) ? severity : 'warning',
        certainty: options.certainty || (severity === 'unknown' ? 'unknown' : 'confirmed'),
        scope: ['project', 'delivery', 'device'].includes(scope) ? scope : 'project',
        title,
        description,
        action: options.action || null,
        fix: options.fix || null,
        extraBlocker: !!options.extraBlocker
    };
}

function compatibilityGetOutputValues() {
    const widthInput = document.getElementById('input-largura');
    const heightInput = document.getElementById('input-altura');
    const fpsInput = document.getElementById('input-fps');
    const rawWidth = Number(widthInput && widthInput.value);
    const rawHeight = Number(heightInput && heightInput.value);
    const rawFps = Number(fpsInput && fpsInput.value);
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? Math.floor(rawWidth) : Math.max(0, Math.floor(Number(originalW) || 0));
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.floor(rawHeight) : Math.max(0, Math.floor(Number(originalH) || 0));
    const fps = Number.isFinite(rawFps) ? rawFps : 30;
    return { rawWidth, rawHeight, rawFps, width, height, fps };
}

function compatibilityGetDeviceResolution() {
    const probed = window.BASDeviceIntelligence?.get?.()?.system?.resolution;
    const explicit = String(probed || window.connectedPhoneResolution || '').trim();
    const fallback = document.getElementById('opt-auto')?.value || '';
    const value = explicit && explicit !== 'Unknown' ? explicit : fallback;
    const match = String(value).match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height, label: `${width} × ${height}` } : null;
}

function compatibilityHasAudio() {
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive() && typeof getAdvancedParts === 'function') {
        return getAdvancedParts().some(part => part && part.audio && part.audio.mode && part.audio.mode !== 'none');
    }
    if (typeof captureAudioEditorState !== 'function') return false;
    const state = captureAudioEditorState();
    return !!state && !!state.enabled && ['intro', 'loop', 'final'].some(role => state[role] && state[role].mode !== 'none');
}

function compatibilitySimpleMarkerDiagnostics(diagnostics) {
    const markers = typeof getProjectSourceMarkers === 'function' ? getProjectSourceMarkers() : null;
    const names = ['m0', 'm1', 'm2', 'm3'];
    if (!markers || names.some(name => !Number.isFinite(markers[name]))) {
        diagnostics.push(compatibilityDiagnostic(
            'MARKERS_INCOMPLETE', 'blocked', 'project',
            compatibilityText('compatMarkersMissingTitle', 'Section markers are incomplete'),
            compatibilityText('compatMarkersMissingDesc', 'Mark the start, intro end, loop end and final end before building.'),
            { action: { type: 'markers', labelKey: 'compatActionReviewMarkers' } }
        ));
        return;
    }
    if (!(markers.m0 <= markers.m1 && markers.m1 <= markers.m2 && markers.m2 <= markers.m3)) {
        diagnostics.push(compatibilityDiagnostic(
            'MARKERS_ORDER', 'blocked', 'project',
            compatibilityText('compatMarkersOrderTitle', 'Section markers are out of order'),
            compatibilityText('compatMarkersOrderDesc', 'Markers must move forward from start to intro, loop and final end.'),
            { action: { type: 'markers', labelKey: 'compatActionReviewMarkers' } }
        ));
        return;
    }
    const sections = [
        ['intro', markers.m0, markers.m1],
        ['loop', markers.m1, markers.m2],
        ['outro', markers.m2, markers.m3]
    ];
    sections.forEach(([name, start, end]) => {
        if (end - start > 0.0005) return;
        const sectionLabel = compatibilityText(`compatSection${name[0].toUpperCase()}${name.slice(1)}`, name);
        diagnostics.push(compatibilityDiagnostic(
            'EMPTY_SECTION', 'warning', 'project',
            compatibilityTemplate('compatEmptySectionTitle', '{section} has no duration', { section: sectionLabel }),
            compatibilityText('compatEmptySectionDesc', 'This section is effectively empty. The ZIP can still be built, but some boot renderers may handle empty sections differently.'),
            { instance: name, action: { type: 'markers', labelKey: 'compatActionReviewMarkers' } }
        ));
    });
}

function compatibilityAdvancedDiagnostics(diagnostics) {
    if (typeof validateAdvancedParts !== 'function') return;
    const validation = validateAdvancedParts();
    if (!validation || validation.valid) return;
    (validation.issues || []).forEach((issue, index) => {
        const partNumber = issue.index >= 0 ? String(issue.index + 1).padStart(2, '0') : '—';
        diagnostics.push(compatibilityDiagnostic(
            `ADVANCED_${String(issue.code || 'INVALID').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
            'blocked', 'project',
            issue.index >= 0
                ? compatibilityTemplate('compatAdvancedPartTitle', 'Part {part} needs attention', { part: partNumber })
                : compatibilityText('compatAdvancedStructureTitle', 'Advanced Parts need attention'),
            typeof formatAdvancedValidationIssue === 'function' ? formatAdvancedValidationIssue(issue) : (issue.message || compatibilityText('compatAdvancedStructureDesc', 'Review the Advanced Parts sequence before building.')),
            { instance: `${issue.partId || index}:${issue.field || ''}`, action: { type: 'parts', labelKey: 'compatActionOpenParts', issue } }
        ));
    });
}

function compatibilitySourceDiagnostics(diagnostics) {
    if (!window.BASSourceLibrary || !currentProject) return;
    const sources = BASSourceLibrary.getAll();
    const missing = sources.filter(source => source && !(source.blob instanceof Blob) && !(Array.isArray(source.runtimeFrames) && source.runtimeFrames.length));
    missing.forEach(source => {
        diagnostics.push(compatibilityDiagnostic(
            'SOURCE_UNAVAILABLE', 'blocked', 'project',
            compatibilityText('compatSourceMissingTitle', 'A project source is unavailable'),
            compatibilityTemplate('compatSourceMissingDesc', '“{name}” no longer has readable media attached to it.', { name: source.name || source.id || 'Source' }),
            { instance: source.id || source.name || '', action: { type: 'sources', labelKey: 'compatActionOpenSources' }, extraBlocker: true }
        ));
    });
    if (typeof getAdvancedParts === 'function' && typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        getAdvancedParts().forEach((part, index) => {
            if (!part || !part.sourceId || BASSourceLibrary.getById(part.sourceId)) return;
            diagnostics.push(compatibilityDiagnostic(
                'PART_SOURCE_REMOVED', 'blocked', 'project',
                compatibilityTemplate('compatAdvancedPartTitle', 'Part {part} needs attention', { part: String(index + 1).padStart(2, '0') }),
                compatibilityText('compatPartSourceRemovedDesc', 'The visual source assigned to this Part is no longer available.'),
                { instance: part.id || index, action: { type: 'parts', labelKey: 'compatActionOpenParts' }, extraBlocker: true }
            ));
        });
    }
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) {
        const state = BASMasterSequence.serialize();
        (state.clips || []).forEach((clip, index) => {
            if (clip && BASSourceLibrary.getById(clip.sourceId)) return;
            diagnostics.push(compatibilityDiagnostic(
                'MASTER_SOURCE_REMOVED', 'blocked', 'project',
                compatibilityText('compatSourceMissingTitle', 'A project source is unavailable'),
                compatibilityText('compatMasterSourceRemovedDesc', 'The Master Sequence references a visual source that is no longer available.'),
                { instance: `${clip && clip.sourceId}:${index}`, action: { type: 'sources', labelKey: 'compatActionOpenSources' }, extraBlocker: true }
            ));
        });
    }
}

function compatibilityCompositionDiagnostics(diagnostics) {
    if (!window.BASComposition || !BASComposition.hasLayers()) return;
    const validation = BASComposition.validate();
    if (!validation.valid) {
        diagnostics.push(compatibilityDiagnostic(
            'COMPOSITION_INVALID', 'blocked', 'project',
            compatibilityText('compatCompositionInvalidTitle', 'Composition needs attention'),
            validation.message || compatibilityText('compatCompositionInvalidDesc', 'A composition layer cannot be rendered with its current settings.'),
            { action: { type: 'composition', labelKey: 'compatActionOpenComposition' }, extraBlocker: true }
        ));
    }
    BASComposition.getLayers().forEach((layer, index) => {
        const keyframes = Array.isArray(layer.keyframes) ? layer.keyframes : [];
        if (!keyframes.some(keyframe => Number(keyframe.time) < Number(layer.start) - 0.001 || Number(keyframe.time) > Number(layer.end) + 0.001)) return;
        diagnostics.push(compatibilityDiagnostic(
            'KEYFRAME_OUTSIDE_LAYER', 'warning', 'project',
            compatibilityText('compatKeyframeRangeTitle', 'A keyframe falls outside its layer'),
            compatibilityTemplate('compatKeyframeRangeDesc', 'Layer “{name}” contains a keyframe outside its visible time range.', { name: layer.name || String(index + 1) }),
            { instance: layer.id || index, action: { type: 'composition', labelKey: 'compatActionOpenComposition', layerId: layer.id } }
        ));
    });
}

function compatibilityOutputDiagnostics(diagnostics) {
    const output = compatibilityGetOutputValues();
    if (output.width <= 0 || output.height <= 0) {
        diagnostics.push(compatibilityDiagnostic(
            'OUTPUT_DIMENSIONS_INVALID', 'blocked', 'project',
            compatibilityText('compatOutputInvalidTitle', 'Output dimensions are invalid'),
            compatibilityText('compatOutputInvalidDesc', 'Choose a positive width and height before generating the animation.'),
            { action: { type: 'output', labelKey: 'compatActionReviewOutput' }, extraBlocker: true }
        ));
        return;
    }
    if (output.width % 2 !== 0 || output.height % 2 !== 0) {
        diagnostics.push(compatibilityDiagnostic(
            'OUTPUT_ODD_DIMENSIONS', 'warning', 'project',
            compatibilityText('compatOddDimensionsTitle', 'Output dimensions are odd'),
            compatibilityTemplate('compatOddDimensionsDesc', '{width} × {height} can work, but even dimensions are safer for boot renderers and frame encoders.', { width: output.width, height: output.height }),
            {
                action: { type: 'output', labelKey: 'compatActionReviewOutput' },
                fix: { type: 'even-dimensions', labelKey: 'compatFixAutomatically' }
            }
        ));
    }
    if (!Number.isFinite(output.rawFps) || output.rawFps < 1 || output.rawFps > 60) {
        diagnostics.push(compatibilityDiagnostic(
            'OUTPUT_FPS_RANGE', 'warning', 'project',
            compatibilityText('compatFpsRangeTitle', 'Frame rate is outside the supported range'),
            compatibilityText('compatFpsRangeDesc', 'BAS exports between 1 and 60 FPS. The current value would be clamped during generation.'),
            {
                action: { type: 'output', labelKey: 'compatActionReviewOutput' },
                fix: { type: 'clamp-fps', labelKey: 'compatFixAutomatically' }
            }
        ));
    }
}

function compatibilityJpegQualityDiagnostics(diagnostics) {
    const status = typeof getJpegQualityStatus === 'function' ? getJpegQualityStatus() : null;
    if (!status || !status.customized) return;
    diagnostics.push(compatibilityDiagnostic(
        'JPEG_QUALITY_CUSTOM', 'info', 'project',
        compatibilityText('compatJpegQualityCustomTitle', 'Custom JPEG quality is active'),
        compatibilityTemplate(
            'compatJpegQualityCustomDesc',
            'JPEG quality is set to {value}% instead of the default 90%. Size estimates and Smart Optimize use this exact value.',
            { value: status.percent }
        ),
        { action: { type: 'output', labelKey: 'compatActionReviewOutput' } }
    ));
}

function compatibilityPerformanceDiagnostics(diagnostics) {
    if (typeof estimateExportPerformance !== 'function' || !currentProject) return;
    const estimate = estimateExportPerformance();
    if (!estimate) return;
    if (estimate.level === 'heavy') {
        diagnostics.push(compatibilityDiagnostic(
            'EXPORT_HEAVY', 'warning', 'project',
            compatibilityText('compatHeavyExportTitle', 'This export is very demanding'),
            compatibilityTemplate('compatHeavyExportDesc', 'About {frames} frames, {memory} working memory and {size} of delivered data are estimated. Generation may be slow or fail on memory-constrained devices.', {
                frames: estimate.framesToProcess.toLocaleString(),
                memory: compatibilityFormatBytes(estimate.estimatedMemoryBytes),
                size: compatibilityFormatBytes(estimate.deliveredBytes)
            }),
            { action: { type: 'optimize', labelKey: 'compatActionOptimize' } }
        ));
    } else if (estimate.level === 'moderate') {
        diagnostics.push(compatibilityDiagnostic(
            'EXPORT_MODERATE', 'warning', 'project',
            compatibilityText('compatModerateExportTitle', 'This export is relatively demanding'),
            compatibilityTemplate('compatModerateExportDesc', 'BAS estimates {frames} frames and about {memory} of working memory. You can still generate it, or review Smart Optimize first.', {
                frames: estimate.framesToProcess.toLocaleString(),
                memory: compatibilityFormatBytes(estimate.estimatedMemoryBytes)
            }),
            { action: { type: 'optimize', labelKey: 'compatActionOptimize' } }
        ));
    }
    if (estimate.bootLevel === 'large' && estimate.level !== 'heavy') {
        diagnostics.push(compatibilityDiagnostic(
            'BOOT_ARCHIVE_LARGE', 'warning', 'project',
            compatibilityText('compatLargeBootTitle', 'The boot animation is estimated above 25 MB'),
            compatibilityTemplate('compatLargeBootDesc', 'Estimated bootanimation.zip size: {size}. ROM memory limits vary, so large archives may not play reliably everywhere.', { size: compatibilityFormatBytes(estimate.bootBytes) }),
            { action: { type: 'optimize', labelKey: 'compatActionOptimize' } }
        ));
    }
    const format = document.getElementById('input-formato')?.value;
    if (format === 'png' && estimate.bootBytes > 20 * 1024 * 1024 && !diagnostics.some(item => item.code === 'BOOT_ARCHIVE_LARGE')) {
        diagnostics.push(compatibilityDiagnostic(
            'PNG_LARGE_PROJECT', 'warning', 'project',
            compatibilityText('compatPngLargeTitle', 'PNG is making this project large'),
            compatibilityTemplate('compatPngLargeDesc', 'The current PNG output is estimated at about {size}. Lossless frames are valid, but JPEG may reduce boot cost substantially.', { size: compatibilityFormatBytes(estimate.bootBytes) }),
            { action: { type: 'optimize', labelKey: 'compatActionOptimize' } }
        ));
    }
}

function compatibilitySimpleAudioDiagnostics(diagnostics) {
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) return;
    if (typeof captureAudioEditorState !== 'function') return;
    const state = captureAudioEditorState();
    if (!state || !state.enabled) return;
    const summary = typeof getAudioExportCompatibilitySummary === 'function' ? getAudioExportCompatibilitySummary() : {};
    const roleLabels = {
        intro: compatibilityText('compatSectionIntro', 'Intro'),
        loop: compatibilityText('compatSectionLoop', 'Loop'),
        final: compatibilityText('compatSectionOutro', 'Outro')
    };
    ['intro', 'loop', 'final'].forEach(role => {
        if (!state[role] || state[role].mode === 'none') return;
        const result = summary && summary[role];
        if (!result || result.severity === 'checking') {
            diagnostics.push(compatibilityDiagnostic(
                'AUDIO_CHECK_PENDING', 'unknown', 'project',
                compatibilityTemplate('compatAudioPendingTitle', '{section} audio is still being checked', { section: roleLabels[role] }),
                compatibilityText('compatAudioPendingDesc', 'Open Audio Studio for the detailed final WAV analysis. This does not block generation.'),
                { instance: role, action: { type: 'audio', role, labelKey: 'compatActionOpenAudio' } }
            ));
            return;
        }
        if (!['warning', 'danger'].includes(result.severity)) return;
        const firstMessage = Array.isArray(result.messages) && result.messages.length ? result.messages[0].text : '';
        diagnostics.push(compatibilityDiagnostic(
            result.severity === 'danger' ? 'AUDIO_CLIPPING' : 'AUDIO_COMPATIBILITY_WARNING',
            'warning', 'project',
            result.severity === 'danger'
                ? compatibilityTemplate('compatAudioClippingTitle', '{section} audio may clip', { section: roleLabels[role] })
                : compatibilityTemplate('compatAudioWarningTitle', '{section} audio needs a review', { section: roleLabels[role] }),
            firstMessage || compatibilityText('compatAudioWarningDesc', 'Audio Studio detected timing or level conditions worth reviewing before export.'),
            { instance: role, action: { type: 'audio', role, labelKey: 'compatActionOpenAudio' } }
        ));
    });
}

function compatibilityAdvancedAudioDiagnostics(diagnostics) {
    if (typeof isAdvancedPartsActive !== 'function' || !isAdvancedPartsActive() || typeof getAdvancedParts !== 'function') return;
    const threshold = 0.100001;
    getAdvancedParts().forEach((part, index) => {
        const audio = part && part.audio;
        if (!audio || audio.mode === 'none') return;
        const duration = Math.max(0, Number(part.end) - Number(part.start));
        const gainDb = typeof normalizeAudioGainDb === 'function' ? normalizeAudioGainDb(audio.gainDb, audio.volume) : Number(audio.gainDb) || 0;
        const delay = Math.max(0, Number(audio.delay) || 0);
        const endTrim = Math.max(0, Number(audio.endTrim) || 0);
        const available = Math.max(0, duration - delay - endTrim);
        let message = '';
        if (gainDb <= -59.5) message = compatibilityText('compatAdvancedAudioGainSilent', 'Gain makes this Part effectively silent.');
        else if (available <= threshold && (delay > 0 || endTrim > 0)) message = compatibilityText('compatAdvancedAudioTimingSilent', 'Delay or End trim leaves 0.1s or less of meaningful audio in this Part.');
        else if (audio.mode === 'video' && typeof createAudioRenderPlan === 'function') {
            const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
            const sourceDuration = window.BASSourceLibrary ? BASSourceLibrary.getDuration(sourceId) : Number(currentProject && currentProject.sourceDuration) || 0;
            if (sourceDuration > 0) {
                const plan = createAudioRenderPlan(sourceDuration, Number(part.start) || 0, Number(part.end) || 0, audio);
                if (plan.playDuration <= threshold) message = compatibilityText('compatAdvancedAudioTimingSilent', 'Current timing leaves 0.1s or less of meaningful audio in this Part.');
            }
        }
        if (!message) return;
        diagnostics.push(compatibilityDiagnostic(
            'ADVANCED_AUDIO_WARNING', 'warning', 'project',
            compatibilityTemplate('compatAdvancedAudioTitle', 'Part {part} audio needs a review', { part: String(index + 1).padStart(2, '0') }),
            message,
            { instance: part.id || index, action: { type: 'parts', labelKey: 'compatActionOpenParts' } }
        ));
    });
}

function compatibilityDeliveryDiagnostics(diagnostics) {
    const target = typeof getBuildDeliveryTarget === 'function' ? getBuildDeliveryTarget() : 'download';
    if (target !== 'phone') return;
    if (!isConnectedMode) {
        diagnostics.push(compatibilityDiagnostic(
            'PHONE_NOT_CONNECTED', 'blocked', 'delivery',
            compatibilityText('compatPhoneDisconnectedTitle', 'Phone delivery is not connected'),
            compatibilityText('compatPhoneDisconnectedDesc', 'Connect the companion module or switch the destination to Download.'),
            {
                action: { type: 'connect', labelKey: 'compatActionConnectPhone' },
                fix: { type: 'download-target', labelKey: 'compatActionDownloadInstead' },
                extraBlocker: true
            }
        ));
        return;
    }
    if (typeof hasModuleFeature === 'function' && !hasModuleFeature('direct_upload')) {
        diagnostics.push(compatibilityDiagnostic(
            'DIRECT_UPLOAD_UNAVAILABLE', 'blocked', 'delivery',
            compatibilityText('compatDirectUnavailableTitle', 'Direct apply is not available'),
            compatibilityText('compatDirectUnavailableDesc', 'The connected Companion does not advertise direct upload support. Download the ZIP instead or update the companion bridge.'),
            { fix: { type: 'download-target', labelKey: 'compatActionDownloadInstead' }, extraBlocker: true }
        ));
        return;
    }
    if (typeof estimateExportPerformance !== 'function') return;
    const estimate = estimateExportPerformance();
    if (!estimate) return;

    const advertisedLimit = Number(moduleInfo && moduleInfo.max_direct_upload_bytes);
    const hardLimit = hasModuleFeature('large_upload') && Number.isFinite(advertisedLimit) && advertisedLimit > 0
        ? advertisedLimit
        : BAS_LEGACY_DIRECT_UPLOAD_LIMIT_BYTES;
    const advertisedWarning = Number(moduleInfo && moduleInfo.direct_upload_warning_bytes);
    const warningThreshold = Number.isFinite(advertisedWarning) && advertisedWarning > 0
        ? advertisedWarning
        : BAS_LARGE_BOOT_WARNING_BYTES;

    if (estimate.bootBytes > hardLimit) {
        const exactKnown = !!estimate.exactBootSize;
        diagnostics.push(compatibilityDiagnostic(
            'DIRECT_UPLOAD_LIMIT', exactKnown ? 'blocked' : 'warning', 'delivery',
            exactKnown
                ? compatibilityText('compatDirectLimitBlockedTitle', 'This ZIP exceeds the direct-transfer safety limit')
                : compatibilityText('compatDirectLimitWarningTitle', 'Direct apply may exceed the transfer safety limit'),
            compatibilityTemplate(
                exactKnown ? 'compatDirectLimitBlockedDesc' : 'compatDirectLimitWarningDesc',
                exactKnown
                    ? 'This archive is {size}, above the connected module transport limit of {limit}. Download or reduce the project first.'
                    : 'Estimated bootanimation.zip size is {size}, above the connected module transport limit of {limit}. The final size is still an estimate.',
                { size: compatibilityFormatBytes(estimate.bootBytes), limit: compatibilityFormatBytes(hardLimit) }
            ),
            {
                action: { type: 'optimize', labelKey: 'compatActionOptimize' },
                fix: { type: 'download-target', labelKey: 'compatActionDownloadInstead' },
                extraBlocker: exactKnown
            }
        ));
        return;
    }

    if (estimate.bootBytes > warningThreshold) {
        diagnostics.push(compatibilityDiagnostic(
            'LARGE_BOOT_ANIMATION', 'warning', 'project',
            compatibilityText('compatLargeBootTitle', 'Large boot animation'),
            compatibilityTemplate(
                'compatLargeBootDesc',
                'This boot animation is {size}. Large animations can stutter during startup or fail on devices with limited boot-time resources. Testing on the phone before applying is recommended.',
                { size: compatibilityFormatBytes(estimate.bootBytes) }
            ),
            { action: { type: 'optimize', labelKey: 'compatActionOptimize' } }
        ));
    }
}

function compatibilityDeviceDiagnostics(diagnostics) {
    if (!isConnectedMode) {
        diagnostics.push(compatibilityDiagnostic(
            'DEVICE_NOT_CONNECTED', 'unknown', 'device',
            compatibilityText('compatNoDeviceTitle', 'No connected device'),
            compatibilityText('compatNoDeviceDesc', 'Project and download checks still work. Connect the companion module to compare device-specific information.'),
            { action: { type: 'connect', labelKey: 'compatActionConnectPhone' } }
        ));
        return;
    }
    const resolution = compatibilityGetDeviceResolution();
    const output = compatibilityGetOutputValues();
    if (!resolution) {
        diagnostics.push(compatibilityDiagnostic(
            'DEVICE_RESOLUTION_UNKNOWN', 'unknown', 'device',
            compatibilityText('compatDeviceResolutionUnknownTitle', 'Device resolution is not available'),
            compatibilityText('compatDeviceResolutionUnknownDesc', 'The connected module did not provide a usable screen resolution.'),
            { certainty: 'unknown' }
        ));
    } else if (output.width !== resolution.width || output.height !== resolution.height) {
        diagnostics.push(compatibilityDiagnostic(
            'DEVICE_RESOLUTION_MISMATCH', 'warning', 'device',
            compatibilityText('compatDeviceResolutionTitle', 'Output does not match the connected screen'),
            compatibilityTemplate('compatDeviceResolutionDesc', 'Project: {project}. Device: {device}. This can be intentional, but matching the device avoids extra scaling by the boot renderer.', {
                project: `${output.width} × ${output.height}`,
                device: resolution.label
            }),
            {
                action: { type: 'output', labelKey: 'compatActionReviewOutput' },
                fix: { type: 'match-device', labelKey: 'compatActionMatchDevice' }
            }
        ));
    }
    const intelligence = window.BASDeviceIntelligence?.get?.() || null;
    const bootProbe = intelligence && intelligence.boot ? intelligence.boot : null;
    const audioProbe = bootProbe && bootProbe.audio ? bootProbe.audio : null;
    if (compatibilityHasAudio()) {
        const audioAction = (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive())
            ? { type: 'parts', labelKey: 'compatActionOpenParts' }
            : { type: 'audio', role: 'intro', labelKey: 'compatActionOpenAudio' };
        if (audioProbe && audioProbe.state === 'observed') {
            diagnostics.push(compatibilityDiagnostic(
                'DEVICE_AUDIO_SUPPORT_OBSERVED', 'info', 'device',
                compatibilityText('compatDeviceAudioObservedTitle', 'Boot audio support was observed'),
                compatibilityText('compatDeviceAudioObservedDesc', 'The connected bootanimation renderer exposes evidence for audio.wav support. Playback can still depend on ROM sound policy, so a phone test is recommended.'),
                { certainty: 'observed', action: audioAction }
            ));
        } else {
            diagnostics.push(compatibilityDiagnostic(
                'DEVICE_AUDIO_SUPPORT_UNKNOWN', 'unknown', 'device',
                compatibilityText('compatDeviceAudioUnknownTitle', 'Boot audio support cannot be confirmed'),
                compatibilityText('compatDeviceAudioUnknownDesc', 'The connected device has not provided safe evidence that this ROM plays audio.wav inside bootanimation Parts.'),
                { certainty: 'unknown', action: audioAction }
            ));
        }
    }
    if (bootProbe && bootProbe.primary_path_confidence === 'fallback') {
        diagnostics.push(compatibilityDiagnostic(
            'DEVICE_BOOT_TARGET_FALLBACK', 'unknown', 'device',
            compatibilityText('compatDeviceTargetFallbackTitle', 'Boot target is not fully verified'),
            compatibilityText('compatDeviceTargetFallbackDesc', 'The module is using a safe fallback bootanimation path, but it has not confirmed that path as an original system target on this installation.'),
            { certainty: 'unknown' }
        ));
    }
    const hasDeviceIntelligence = typeof hasModuleFeature === 'function' && hasModuleFeature('device_intelligence');
    if (!hasDeviceIntelligence) {
        const model = String(window.connectedPhoneModel || '').trim();
        if (/\bsamsung\b/i.test(model) || /^SM[-_]/i.test(model)) {
            diagnostics.push(compatibilityDiagnostic(
                'SAMSUNG_QMG_UNKNOWN', 'unknown', 'device',
                compatibilityText('compatSamsungTitle', 'Samsung stock boot format may be incompatible'),
                compatibilityText('compatSamsungDesc', 'Stock Samsung firmware commonly uses QMG instead of standard bootanimation.zip. Custom ROMs and GSIs may still support the generated ZIP.'),
                { certainty: 'unknown' }
            ));
        }
    }
}

function compatibilityScopeStatus(scope, diagnostics) {
    const items = diagnostics.filter(item => item.scope === scope);
    if (items.some(item => item.severity === 'blocked')) return 'blocked';
    if (items.some(item => item.severity === 'warning')) return 'warning';
    if (items.some(item => item.severity === 'unknown')) return 'unknown';
    return 'ready';
}

function compatibilityOverallStatus(scopes, diagnostics) {
    if (scopes.project === 'blocked' || scopes.delivery === 'blocked') return 'blocked';
    const target = typeof getBuildDeliveryTarget === 'function' ? getBuildDeliveryTarget() : 'download';
    if (target === 'phone' && scopes.device === 'blocked') return 'blocked';
    if (scopes.project === 'warning' || scopes.delivery === 'warning' || (target === 'phone' && scopes.device === 'warning')) return 'warning';
    const relevantUnknown = diagnostics.some(item => item.severity === 'unknown' && (item.scope !== 'device' || target === 'phone'));
    if (relevantUnknown) return 'unknown';
    return 'ready';
}

function analyzeCompatibility() {
    const diagnostics = [];
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) {
        diagnostics.push(compatibilityDiagnostic(
            'NO_SOURCE', 'blocked', 'project',
            compatibilityText('compatNoSourceTitle', 'No project source is loaded'),
            compatibilityText('compatNoSourceDesc', 'Add a video, GIF, image or bootanimation.zip before building.'),
            { action: { type: 'edit', labelKey: 'compatActionBackToEdit' } }
        ));
    } else {
        compatibilitySourceDiagnostics(diagnostics);
        if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) compatibilityAdvancedDiagnostics(diagnostics);
        else compatibilitySimpleMarkerDiagnostics(diagnostics);
        compatibilityCompositionDiagnostics(diagnostics);
        compatibilityOutputDiagnostics(diagnostics);
        compatibilityJpegQualityDiagnostics(diagnostics);
        compatibilityPerformanceDiagnostics(diagnostics);
        compatibilitySimpleAudioDiagnostics(diagnostics);
        compatibilityAdvancedAudioDiagnostics(diagnostics);
    }
    compatibilityDeliveryDiagnostics(diagnostics);
    compatibilityDeviceDiagnostics(diagnostics);
    const scopes = {
        project: compatibilityScopeStatus('project', diagnostics),
        delivery: compatibilityScopeStatus('delivery', diagnostics),
        device: compatibilityScopeStatus('device', diagnostics)
    };
    return {
        version: BAS_COMPATIBILITY_VERSION,
        checkedAt: Date.now(),
        diagnostics,
        scopes,
        overall: compatibilityOverallStatus(scopes, diagnostics)
    };
}

function compatibilityStateLabel(state) {
    const labels = {
        ready: ['compatStateReady', 'Ready'],
        warning: ['compatStateWarning', 'Warning'],
        blocked: ['compatStateBlocked', 'Blocked'],
        unknown: ['compatStateUnknown', 'Unknown']
    };
    const entry = labels[state] || labels.unknown;
    return compatibilityText(entry[0], entry[1]);
}

function compatibilityScopeLabel(scope) {
    const labels = {
        project: ['compatProject', 'Project'],
        delivery: ['compatDelivery', 'Delivery'],
        device: ['compatDevice', 'Device']
    };
    const entry = labels[scope] || labels.project;
    return compatibilityText(entry[0], entry[1]);
}

function compatibilityActionLabel(action) {
    if (!action) return '';
    const fallbacks = {
        compatActionReviewMarkers: 'Review markers',
        compatActionOpenParts: 'Open Parts',
        compatActionOpenComposition: 'Open Composition',
        compatActionReviewOutput: 'Review Output',
        compatActionOptimize: 'Open Smart Optimize',
        compatActionOpenAudio: 'Open Audio',
        compatActionOpenSources: 'Open sources',
        compatActionConnectPhone: 'Connect phone',
        compatActionDownloadInstead: 'Use Download',
        compatActionMatchDevice: 'Match device',
        compatFixAutomatically: 'Fix automatically',
        compatActionBackToEdit: 'Back to Edit'
    };
    return compatibilityText(action.labelKey || '', fallbacks[action.labelKey] || 'Open');
}

function compatibilityRenderSummaryCard(scope, state) {
    const card = document.querySelector(`.compatibility-scope[data-compat-scope="${scope}"]`);
    if (!card) return;
    card.dataset.state = state;
    const label = card.querySelector('[data-compat-scope-label]');
    const status = card.querySelector('[data-compat-scope-status]');
    if (label) label.textContent = compatibilityScopeLabel(scope);
    if (status) status.textContent = compatibilityStateLabel(state);
}

function compatibilityRenderDiagnostic(diagnostic) {
    const row = document.createElement('article');
    row.className = 'compatibility-diagnostic';
    row.dataset.severity = diagnostic.severity;
    row.dataset.scope = diagnostic.scope;
    row.dataset.compatId = diagnostic.id;

    const icon = document.createElement('span');
    icon.className = 'compatibility-diagnostic-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = diagnostic.severity === 'blocked' ? '!' : diagnostic.severity === 'warning' ? '!' : diagnostic.severity === 'info' ? 'i' : '?';

    const body = document.createElement('div');
    body.className = 'compatibility-diagnostic-body';
    const meta = document.createElement('div');
    meta.className = 'compatibility-diagnostic-meta';
    const scope = document.createElement('span');
    scope.textContent = compatibilityScopeLabel(diagnostic.scope);
    const state = document.createElement('span');
    state.textContent = compatibilityStateLabel(diagnostic.severity === 'info' ? 'ready' : diagnostic.severity);
    meta.append(scope, state);
    const title = document.createElement('strong');
    title.textContent = diagnostic.title;
    const description = document.createElement('p');
    description.textContent = diagnostic.description;
    body.append(meta, title, description);

    if (diagnostic.action || diagnostic.fix) {
        const actions = document.createElement('div');
        actions.className = 'compatibility-diagnostic-actions';
        if (diagnostic.action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.compatAction = diagnostic.id;
            button.textContent = compatibilityActionLabel(diagnostic.action);
            actions.appendChild(button);
        }
        if (diagnostic.fix) {
            const fix = document.createElement('button');
            fix.type = 'button';
            fix.className = 'compatibility-fix';
            fix.dataset.compatFix = diagnostic.id;
            fix.textContent = compatibilityActionLabel(diagnostic.fix);
            actions.appendChild(fix);
        }
        body.appendChild(actions);
    }
    row.append(icon, body);
    return row;
}

function renderCompatibilityCenter(result = compatibilityRuntime.result) {
    const center = document.getElementById('compatibility-center');
    if (!center || !result) return;
    center.dataset.state = result.overall;
    const kicker = document.getElementById('compatibility-kicker');
    const title = document.getElementById('compatibility-title');
    const desc = document.getElementById('compatibility-desc');
    const badge = document.getElementById('compatibility-overall');
    if (kicker) kicker.textContent = compatibilityText('compatKicker', 'COMPATIBILITY CENTER');
    if (title) title.textContent = compatibilityText('compatTitle', 'Know what is ready before you build');
    if (desc) desc.textContent = compatibilityText('compatDesc', 'Checks the project, selected destination, and connected device.');
    if (badge) {
        badge.dataset.state = result.overall;
        badge.textContent = compatibilityStateLabel(result.overall);
    }
    compatibilityRenderSummaryCard('project', result.scopes.project);
    compatibilityRenderSummaryCard('delivery', result.scopes.delivery);
    compatibilityRenderSummaryCard('device', result.scopes.device);

    compatibilityRuntime.diagnosticsById.clear();
    result.diagnostics.forEach(item => compatibilityRuntime.diagnosticsById.set(item.id, item));
    const list = document.getElementById('compatibility-diagnostics');
    if (!list) return;
    list.replaceChildren();
    if (!result.diagnostics.length) {
        const ready = document.createElement('div');
        ready.className = 'compatibility-empty';
        const strong = document.createElement('strong');
        strong.textContent = compatibilityText('compatAllClearTitle', 'All current checks passed');
        const p = document.createElement('p');
        p.textContent = compatibilityText('compatAllClearDesc', 'The project and selected delivery have no known issues.');
        ready.append(strong, p);
        list.appendChild(ready);
        return;
    }
    result.diagnostics.forEach(item => list.appendChild(compatibilityRenderDiagnostic(item)));
}

function compatibilityBaseBuildReady() {
    const hasMedia = document.getElementById('video-container')?.style.display === 'block';
    if (!hasMedia || !currentProject) return false;
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        return typeof validateAdvancedParts === 'function' && validateAdvancedParts().valid;
    }
    const markers = typeof getProjectSourceMarkers === 'function' ? getProjectSourceMarkers() : null;
    return !!markers && ['m0', 'm1', 'm2', 'm3'].every(key => Number.isFinite(markers[key])) && markers.m0 <= markers.m1 && markers.m1 <= markers.m2 && markers.m2 <= markers.m3;
}

function applyCompatibilityBuildGate(result = compatibilityRuntime.result) {
    const button = document.getElementById('btn-gerar');
    if (!button || !result || isGenerating) return;
    const extraBlocker = result.diagnostics.find(item => item.severity === 'blocked' && item.extraBlocker);
    if (extraBlocker) {
        button.dataset.compatibilityBlocked = 'true';
        button.classList.add('btn-desativado');
        button.textContent = compatibilityText('compatBuildBlocked', 'Resolve blocked compatibility checks');
        return;
    }
    if (button.dataset.compatibilityBlocked === 'true') {
        delete button.dataset.compatibilityBlocked;
        if (compatibilityBaseBuildReady()) {
            button.classList.remove('btn-desativado');
            const t = traducoes[idiomaAtual] || traducoes.en;
            button.textContent = typeof getGenerateReadyLabel === 'function' ? getGenerateReadyLabel(t) : (isConnectedMode ? t.btnInjectReady : t.btnGerarPronto);
        }
    }
}

function runCompatibilityCheck() {
    clearTimeout(compatibilityRuntime.timer);
    compatibilityRuntime.timer = 0;
    compatibilityRuntime.generation += 1;
    compatibilityRuntime.result = analyzeCompatibility();
    renderCompatibilityCenter(compatibilityRuntime.result);
    applyCompatibilityBuildGate(compatibilityRuntime.result);
    if (typeof syncReleaseReadiness === 'function') syncReleaseReadiness();
    return compatibilityRuntime.result;
}

function scheduleCompatibilityCheck(delay = 70) {
    clearTimeout(compatibilityRuntime.timer);
    compatibilityRuntime.timer = setTimeout(runCompatibilityCheck, Math.max(0, delay));
}

function compatibilityScrollTo(element) {
    if (!element) return;
    requestAnimationFrame(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

function runCompatibilityAction(action) {
    if (!action) return;
    if (action.type === 'edit') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit');
        return;
    }
    if (action.type === 'markers') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit');
        compatibilityScrollTo(document.getElementById('timeline-wrapper'));
        return;
    }
    if (action.type === 'parts') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit', { scroll: false });
        if (typeof setEditTool === 'function') setEditTool('parts', { scroll: true });
        if (action.issue && typeof focusAdvancedValidationIssue === 'function') setTimeout(() => focusAdvancedValidationIssue(action.issue), 90);
        else compatibilityScrollTo(document.getElementById('advanced-parts-editor'));
        return;
    }
    if (action.type === 'composition') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit', { scroll: false });
        if (typeof setEditTool === 'function') setEditTool('composition', { scroll: true });
        if (action.layerId && window.BASComposition) BASComposition.select(action.layerId);
        return;
    }
    if (action.type === 'audio') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit', { scroll: false });
        if (typeof setEditTool === 'function') setEditTool('audio', { scroll: true });
        if (action.role && typeof setAudioRole === 'function') setAudioRole(action.role);
        return;
    }
    if (action.type === 'sources') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit', { scroll: false });
        compatibilityScrollTo(document.getElementById('source-library'));
        return;
    }
    if (action.type === 'output') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('settings', { scroll: false });
        if (typeof setOutputTool === 'function') setOutputTool('basics', { scroll: true });
        return;
    }
    if (action.type === 'optimize') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('settings', { scroll: false });
        if (typeof setOutputTool === 'function') setOutputTool('performance', { scroll: true });
        compatibilityScrollTo(document.getElementById('performance-estimate'));
        return;
    }
    if (action.type === 'connect') {
        if (typeof connectToPhone === 'function') connectToPhone();
    }
}

function compatibilityCommitOutputFix(reason) {
    if (typeof aoMudarTamanhoManual === 'function') aoMudarTamanhoManual();
    if (typeof atualizarPreviewEnquadramento === 'function') atualizarPreviewEnquadramento();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch(reason, { changeKey: reason, immediate: true });
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
    scheduleCompatibilityCheck(0);
}

function runCompatibilityFix(fix) {
    if (!fix) return;
    if (fix.type === 'even-dimensions') {
        const output = compatibilityGetOutputValues();
        const even = value => value % 2 === 0 ? value : Math.max(2, value - 1);
        if (typeof outputPresetApplyResolvedOptions === 'function') {
            outputPresetApplyResolvedOptions({ width: even(output.width), height: even(output.height) }, {
                reason: 'compatibility-even-dimensions',
                changeKey: 'compatibility-even-dimensions'
            });
        } else {
            document.getElementById('input-largura').value = even(output.width);
            document.getElementById('input-altura').value = even(output.height);
            compatibilityCommitOutputFix('compatibility-even-dimensions');
        }
        return;
    }
    if (fix.type === 'clamp-fps') {
        const input = document.getElementById('input-fps');
        const fps = Math.min(60, Math.max(1, Math.round(Number(input?.value) || 30)));
        if (typeof outputPresetApplyResolvedOptions === 'function') {
            outputPresetApplyResolvedOptions({ fps }, {
                reason: 'compatibility-fps',
                changeKey: 'compatibility-fps'
            });
        } else {
            if (input) input.value = fps;
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('compatibility-fps', { changeKey: 'compatibility-fps', immediate: true });
            if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
            scheduleCompatibilityCheck(0);
        }
        return;
    }
    if (fix.type === 'match-device') {
        const resolution = compatibilityGetDeviceResolution();
        if (!resolution) return;
        if (typeof outputPresetApplyResolvedOptions === 'function') {
            outputPresetApplyResolvedOptions({ width: resolution.width, height: resolution.height }, {
                reason: 'compatibility-match-device',
                changeKey: 'compatibility-match-device'
            });
        } else {
            document.getElementById('input-largura').value = resolution.width;
            document.getElementById('input-altura').value = resolution.height;
            compatibilityCommitOutputFix('compatibility-match-device');
        }
        return;
    }
    if (fix.type === 'download-target') {
        if (typeof setBuildDeliveryTarget === 'function') setBuildDeliveryTarget('download');
        scheduleCompatibilityCheck(0);
    }
}

function syncCompatibilityText() {
    if (!compatibilityRuntime.result) {
        scheduleCompatibilityCheck(0);
        return;
    }
    runCompatibilityCheck();
}

function bindCompatibilityCenter() {
    const center = document.getElementById('compatibility-center');
    if (!center) return;
    center.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-compat-action]');
        if (actionButton) {
            const diagnostic = compatibilityRuntime.diagnosticsById.get(actionButton.dataset.compatAction);
            if (diagnostic) runCompatibilityAction(diagnostic.action);
            return;
        }
        const fixButton = event.target.closest('[data-compat-fix]');
        if (fixButton) {
            const diagnostic = compatibilityRuntime.diagnosticsById.get(fixButton.dataset.compatFix);
            if (diagnostic) runCompatibilityFix(diagnostic.fix);
        }
    });
    document.addEventListener('input', event => {
        if (event.target.closest('#editor-section')) scheduleCompatibilityCheck();
    });
    document.addEventListener('change', event => {
        if (event.target.closest('#editor-section')) scheduleCompatibilityCheck();
    });
    window.addEventListener('bas:projectchange', () => scheduleCompatibilityCheck());
    runCompatibilityCheck();
}

window.BASCompatibility = Object.freeze({
    version: BAS_COMPATIBILITY_VERSION,
    analyze: analyzeCompatibility,
    refresh: runCompatibilityCheck,
    schedule: scheduleCompatibilityCheck,
    getResult: () => compatibilityRuntime.result
});
window.scheduleCompatibilityCheck = scheduleCompatibilityCheck;
window.syncCompatibilityText = syncCompatibilityText;
window.applyCompatibilityBuildGate = applyCompatibilityBuildGate;
window.addEventListener('DOMContentLoaded', bindCompatibilityCenter);
