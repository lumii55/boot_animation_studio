const BAS_OUTPUT_PRESET_VERSION = 3;
const BAS_OUTPUT_PRESET_BALANCED_PIXELS = 1080 * 2400;
const BAS_OUTPUT_PRESET_LIGHT_PIXELS = 720 * 1600;

const outputPresetRuntime = {
    selectedId: '',
    applying: false,
    initialized: false,
    expanded: false
};

const BAS_OUTPUT_PRESET_EXPANDED_KEY = 'bas-output-presets-expanded';

function outputPresetText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function outputPresetStoredExpanded() {
    try {
        return localStorage.getItem(BAS_OUTPUT_PRESET_EXPANDED_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function outputPresetSetExpanded(expanded, options = {}) {
    outputPresetRuntime.expanded = !!expanded;
    const root = document.getElementById('output-presets');
    const body = document.getElementById('output-presets-body');
    const toggle = document.getElementById('output-presets-toggle');
    if (root) root.classList.toggle('is-collapsed', !outputPresetRuntime.expanded);
    if (body) body.hidden = !outputPresetRuntime.expanded;
    if (toggle) toggle.setAttribute('aria-expanded', outputPresetRuntime.expanded ? 'true' : 'false');
    if (options.persist !== false) {
        try { localStorage.setItem(BAS_OUTPUT_PRESET_EXPANDED_KEY, outputPresetRuntime.expanded ? '1' : '0'); } catch (error) {}
    }
    syncOutputPresetsToggleText();
}

function syncOutputPresetsToggleText() {
    const label = document.getElementById('output-presets-toggle-label');
    if (!label) return;
    const text = outputPresetRuntime.expanded
        ? outputPresetText('presetHide', 'Hide presets')
        : outputPresetText('presetShow', 'Show presets');
    label.textContent = text;
    const toggle = document.getElementById('output-presets-toggle');
    if (toggle) toggle.setAttribute('aria-label', text);
}

function outputPresetClampFps(value, fallback = 30) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(1, Math.min(60, Math.round(Number(fallback) || 30)));
    return Math.max(1, Math.min(60, numeric));
}

function outputPresetDimension(value) {
    return Math.max(1, Math.floor(Number(value) || 1));
}

function outputPresetEvenDimension(value) {
    const numeric = Math.max(2, Math.floor(Number(value) || 2));
    return Math.max(2, Math.floor(numeric / 2) * 2);
}

function outputPresetFitPixelBudget(width, height, maxPixels) {
    const sourceWidth = outputPresetEvenDimension(width);
    const sourceHeight = outputPresetEvenDimension(height);
    const pixels = sourceWidth * sourceHeight;
    if (!Number.isFinite(maxPixels) || maxPixels <= 0 || pixels <= maxPixels) return { width: sourceWidth, height: sourceHeight };
    const scale = Math.sqrt(maxPixels / pixels);
    return {
        width: outputPresetEvenDimension(sourceWidth * scale),
        height: outputPresetEvenDimension(sourceHeight * scale)
    };
}

function outputPresetCurrentOptions() {
    if (typeof getPerformanceOptions === 'function') return { ...getPerformanceOptions() };
    const width = Math.max(1, parseInt(document.getElementById('input-largura')?.value, 10) || originalW || 1);
    const height = Math.max(1, parseInt(document.getElementById('input-altura')?.value, 10) || originalH || 1);
    const fps = outputPresetClampFps(document.getElementById('input-fps')?.value, 30);
    return {
        width,
        height,
        fps,
        format: document.getElementById('input-formato')?.value || 'jpeg',
        jpegQuality: typeof normalizeJpegExportQuality === 'function' ? normalizeJpegExportQuality(jpegExportQuality) : 0.9,
        framing: document.getElementById('input-enquadramento')?.value || 'cover',
        framingFocus: typeof getCurrentFramingFocus === 'function' ? getCurrentFramingFocus() : { x: 0.5, y: 0.5, zoom: 1 },
        manufacturer: document.getElementById('input-fabricante')?.value || 'standard',
        generateModule: !!document.getElementById('input-gerar-modulo')?.checked,
        audio: typeof captureAudioEditorState === 'function' ? captureAudioEditorState() : { enabled: false }
    };
}

function outputPresetSourceMetadata() {
    let source = null;
    if (window.BASSourceLibrary) {
        const primaryId = BASSourceLibrary.getPrimaryId();
        source = BASSourceLibrary.getById(primaryId);
    }
    const width = Math.max(0, Number(source && source.width) || Number(currentProject && currentProject.width) || Number(originalW) || 0);
    const height = Math.max(0, Number(source && source.height) || Number(currentProject && currentProject.height) || Number(originalH) || 0);
    const fps = Math.max(0, Number(source && source.fps) || Number(currentProject && currentProject.fps) || 0);
    return { width, height, fps };
}

function outputPresetDeviceResolution() {
    if (typeof compatibilityGetDeviceResolution === 'function') return compatibilityGetDeviceResolution();
    const value = String(window.connectedPhoneResolution || '').trim();
    const match = value.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height, label: `${width} × ${height}` } : null;
}

function outputPresetImportedBaseline() {
    const baseline = currentProject && currentProject.sourceType === 'bootanimation' && currentProject.editorBaseline && currentProject.editorBaseline.frame;
    if (!baseline) return null;
    const width = Number(baseline.width);
    const height = Number(baseline.height);
    const fps = Number(baseline.fps);
    if (!(width > 0 && height > 0 && fps > 0)) return null;
    return {
        width: outputPresetDimension(width),
        height: outputPresetDimension(height),
        fps: outputPresetClampFps(fps),
        format: baseline.format === 'png' ? 'png' : 'jpeg',
        jpegQuality: typeof normalizeJpegExportQuality === 'function' ? normalizeJpegExportQuality(baseline.jpegQuality) : 0.9
    };
}

function outputPresetDefinitions() {
    return [
        {
            id: 'source-quality',
            titleKey: 'presetSourceQualityTitle',
            title: 'Source Quality',
            descKey: 'presetSourceQualityDesc',
            desc: 'Uses the source resolution and frame rate with high-quality JPEG frames.',
            summaryKey: 'presetSourceQualitySummary',
            summary: 'Source size · Source FPS · JPEG 93%',
            resolve(current) {
                const source = outputPresetSourceMetadata();
                if (!(source.width > 0 && source.height > 0)) return null;
                return {
                    ...current,
                    width: outputPresetDimension(source.width),
                    height: outputPresetDimension(source.height),
                    fps: outputPresetClampFps(source.fps, current.fps),
                    format: 'jpeg',
                    jpegQuality: 0.93
                };
            }
        },
        {
            id: 'balanced',
            titleKey: 'presetBalancedTitle',
            title: 'Balanced',
            descKey: 'presetBalancedDesc',
            desc: 'Keeps good visual quality while limiting frame rate, pixel load and JPEG size.',
            summaryKey: 'presetBalancedSummary',
            summary: '≤ 2.59 MP · ≤ 30 FPS · JPEG 88%',
            resolve(current) {
                const source = outputPresetSourceMetadata();
                const width = source.width || current.width;
                const height = source.height || current.height;
                if (!(width > 0 && height > 0)) return null;
                const fitted = outputPresetFitPixelBudget(width, height, BAS_OUTPUT_PRESET_BALANCED_PIXELS);
                return {
                    ...current,
                    ...fitted,
                    fps: Math.min(30, outputPresetClampFps(source.fps, current.fps)),
                    format: 'jpeg',
                    jpegQuality: 0.88
                };
            }
        },
        {
            id: 'lightweight',
            titleKey: 'presetLightweightTitle',
            title: 'Lightweight',
            descKey: 'presetLightweightDesc',
            desc: 'Reduces pixel load, frame rate and JPEG quality for a lighter animation.',
            summaryKey: 'presetLightweightSummary',
            summary: '≤ 1.15 MP · ≤ 24 FPS · JPEG 78%',
            resolve(current) {
                const source = outputPresetSourceMetadata();
                const width = source.width || current.width;
                const height = source.height || current.height;
                if (!(width > 0 && height > 0)) return null;
                const fitted = outputPresetFitPixelBudget(width, height, BAS_OUTPUT_PRESET_LIGHT_PIXELS);
                return {
                    ...current,
                    ...fitted,
                    fps: Math.min(24, outputPresetClampFps(source.fps, current.fps)),
                    format: 'jpeg',
                    jpegQuality: 0.78
                };
            }
        },
        {
            id: 'lossless',
            titleKey: 'presetLosslessTitle',
            title: 'Lossless Frames',
            descKey: 'presetLosslessDesc',
            desc: 'Keeps the current resolution and frame rate and switches frame output to PNG.',
            summaryKey: 'presetLosslessSummary',
            summary: 'Current size · Current FPS · PNG',
            resolve(current) {
                if (!(current.width > 0 && current.height > 0)) return null;
                return { ...current, format: 'png' };
            }
        },
        {
            id: 'match-device',
            titleKey: 'presetMatchDeviceTitle',
            title: 'Match Connected Device',
            descKey: 'presetMatchDeviceDesc',
            desc: 'Matches the output resolution to the screen reported by the connected device.',
            summaryKey: 'presetMatchDeviceSummary',
            summary: 'Connected screen · Keep FPS and format',
            resolve(current) {
                if (!isConnectedMode) return null;
                const resolution = outputPresetDeviceResolution();
                if (!resolution) return null;
                return {
                    ...current,
                    width: outputPresetDimension(resolution.width),
                    height: outputPresetDimension(resolution.height)
                };
            },
            unavailableKey: 'presetUnavailableDevice',
            unavailable: 'Connect a device that reports its screen resolution.'
        },
        {
            id: 'imported-original',
            titleKey: 'presetImportedTitle',
            title: 'Imported Original',
            descKey: 'presetImportedDesc',
            desc: 'Restores the original frame settings preserved from an imported bootanimation.zip.',
            summaryKey: 'presetImportedSummary',
            summary: 'Imported resolution · FPS · Format',
            resolve(current) {
                const baseline = outputPresetImportedBaseline();
                return baseline ? { ...current, ...baseline } : null;
            },
            unavailableKey: 'presetUnavailableImported',
            unavailable: 'Available after importing a bootanimation.zip with preserved output settings.'
        }
    ];
}

function outputPresetGetDefinition(id) {
    return outputPresetDefinitions().find(item => item.id === id) || null;
}

function outputPresetFormatResolution(options) {
    return options && options.width > 0 && options.height > 0 ? `${Math.round(options.width)} × ${Math.round(options.height)}` : '— × —';
}

function outputPresetFormatFormat(options) {
    return options && options.format === 'png' ? 'PNG' : 'JPEG';
}

function outputPresetFormatQuality(options) {
    if (!options || options.format !== 'jpeg') return outputPresetText('presetNotUsed', 'Not used');
    return `${Math.round((Number(options.jpegQuality) || 0.9) * 100)}%`;
}

function outputPresetEstimate(options) {
    if (!options || typeof estimateExportPerformance !== 'function' || !currentProject) return null;
    try {
        return estimateExportPerformance(options);
    } catch (error) {
        return null;
    }
}

function outputPresetFormatEstimate(estimate) {
    if (!estimate || !Number.isFinite(estimate.bootBytes)) return '—';
    const value = typeof formatByteEstimate === 'function' ? formatByteEstimate(estimate.bootBytes) : `${Math.round(estimate.bootBytes / (1024 * 1024))} MB`;
    return estimate.exactBootSize ? value : `≈ ${value}`;
}

function outputPresetSetCompare(id, before, after) {
    const row = document.querySelector(`[data-preset-compare="${id}"]`);
    if (!row) return;
    const beforeElement = row.querySelector('[data-preset-before]');
    const afterElement = row.querySelector('[data-preset-after]');
    if (beforeElement) beforeElement.textContent = before;
    if (afterElement) afterElement.textContent = after;
    row.classList.toggle('is-changed', before !== after);
}

function outputPresetRenderPreview() {
    const preview = document.getElementById('output-preset-preview');
    const definition = outputPresetGetDefinition(outputPresetRuntime.selectedId);
    if (!preview || !definition) {
        if (preview) preview.hidden = true;
        return;
    }
    const current = outputPresetCurrentOptions();
    const candidate = definition.resolve(current);
    preview.hidden = false;
    preview.dataset.preset = definition.id;
    const title = document.getElementById('output-preset-preview-title');
    const desc = document.getElementById('output-preset-preview-desc');
    const apply = document.getElementById('output-preset-apply');
    if (title) title.textContent = outputPresetText(definition.titleKey, definition.title);
    if (desc) desc.textContent = candidate
        ? outputPresetText('presetPreviewReady', 'Review the exact output changes before applying this preset.')
        : outputPresetText(definition.unavailableKey || 'presetUnavailableProject', definition.unavailable || 'Load a project before using this preset.');
    outputPresetSetCompare('resolution', outputPresetFormatResolution(current), candidate ? outputPresetFormatResolution(candidate) : '—');
    outputPresetSetCompare('fps', `${current.fps} FPS`, candidate ? `${candidate.fps} FPS` : '—');
    outputPresetSetCompare('format', outputPresetFormatFormat(current), candidate ? outputPresetFormatFormat(candidate) : '—');
    outputPresetSetCompare('quality', outputPresetFormatQuality(current), candidate ? outputPresetFormatQuality(candidate) : '—');
    outputPresetSetCompare('size', outputPresetFormatEstimate(outputPresetEstimate(current)), candidate ? outputPresetFormatEstimate(outputPresetEstimate(candidate)) : '—');
    if (apply) {
        apply.disabled = !candidate || outputPresetRuntime.applying;
        apply.textContent = outputPresetText('presetApply', 'Apply preset');
    }
}

function outputPresetSelect(id) {
    const definition = outputPresetGetDefinition(id);
    if (!definition) return;
    outputPresetRuntime.selectedId = id;
    document.querySelectorAll('[data-output-preset]').forEach(card => {
        const selected = card.dataset.outputPreset === id;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    outputPresetRenderPreview();
}

function outputPresetApplyResolvedOptions(candidate, options = {}) {
    if (!candidate) return false;
    const current = outputPresetCurrentOptions();
    const format = document.getElementById('input-formato');
    const fps = document.getElementById('input-fps');
    const width = document.getElementById('input-largura');
    const height = document.getElementById('input-altura');
    const framing = document.getElementById('input-enquadramento');
    const manufacturer = document.getElementById('input-fabricante');
    if (format && candidate.format !== undefined) format.value = candidate.format === 'png' ? 'png' : 'jpeg';
    if (fps && candidate.fps !== undefined) fps.value = outputPresetClampFps(candidate.fps, current.fps);
    if (width && candidate.width !== undefined) width.value = outputPresetDimension(candidate.width);
    if (height && candidate.height !== undefined) height.value = outputPresetDimension(candidate.height);
    if (candidate.jpegQuality !== undefined) {
        jpegExportQuality = typeof normalizeJpegExportQuality === 'function'
            ? normalizeJpegExportQuality(candidate.jpegQuality)
            : Math.max(0.55, Math.min(0.95, Number(candidate.jpegQuality) || 0.9));
        if (typeof setJpegQualityChangeSource === 'function') setJpegQualityChangeSource(options.qualitySource || 'preset');
    }
    if (framing && candidate.framing !== undefined) framing.value = candidate.framing;
    if (manufacturer && candidate.manufacturer !== undefined) manufacturer.value = candidate.manufacturer;
    if (typeof aoMudarTamanhoManual === 'function') aoMudarTamanhoManual();
    if (typeof atualizarPreviewEnquadramento === 'function') atualizarPreviewEnquadramento();
    if (typeof invalidateOptimizerResult === 'function') invalidateOptimizerResult();
    if (typeof syncJpegQualityControl === 'function') syncJpegQualityControl();
    if (typeof updateOptimizerQualityBadge === 'function') updateOptimizerQualityBadge();
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
    if (typeof updateOutputIntent === 'function') updateOutputIntent();
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
    if (typeof syncCustomProfilesUi === 'function') syncCustomProfilesUi();
    if (typeof projectEngineTouch === 'function' && options.reason !== false) {
        const reason = options.reason || 'output-preset';
        projectEngineTouch(reason, { changeKey: options.changeKey || reason, immediate: true });
    }
    return true;
}

function outputPresetApply() {
    const definition = outputPresetGetDefinition(outputPresetRuntime.selectedId);
    if (!definition || outputPresetRuntime.applying) return;
    const current = outputPresetCurrentOptions();
    const candidate = definition.resolve(current);
    if (!candidate) return;
    outputPresetRuntime.applying = true;
    try {
        outputPresetApplyResolvedOptions(candidate, {
            reason: 'output-preset',
            changeKey: `output-preset:${definition.id}`,
            qualitySource: 'preset'
        });
        if (typeof showToast === 'function') {
            const message = outputPresetText('presetAppliedToast', 'Preset applied: {name}').replace('{name}', outputPresetText(definition.titleKey, definition.title));
            showToast(message, 'success', 2600);
        }
    } finally {
        outputPresetRuntime.applying = false;
        syncOutputPresetsUi();
    }
}

function syncOutputPresetsText() {
    const kicker = document.getElementById('output-presets-kicker');
    const title = document.getElementById('output-presets-title');
    const desc = document.getElementById('output-presets-desc');
    const previewKicker = document.getElementById('output-preset-preview-kicker');
    if (kicker) kicker.textContent = outputPresetText('presetKicker', 'OUTPUT PRESETS');
    if (title) title.textContent = outputPresetText('presetTitle', 'Start from a predictable output profile');
    if (desc) desc.textContent = outputPresetText('presetDesc', 'Presets change only output settings. Smart Optimize remains a project-specific recommendation.');
    syncOutputPresetsToggleText();
    if (previewKicker) previewKicker.textContent = outputPresetText('presetPreviewKicker', 'BEFORE → AFTER');
    const labels = {
        resolution: ['presetCompareResolution', 'Resolution'],
        fps: ['presetCompareFps', 'Frame rate'],
        format: ['presetCompareFormat', 'Frame format'],
        quality: ['presetCompareQuality', 'JPEG quality'],
        size: ['presetCompareSize', 'Estimated boot size']
    };
    Object.entries(labels).forEach(([id, values]) => {
        const element = document.querySelector(`[data-preset-compare="${id}"] [data-preset-label]`);
        if (element) element.textContent = outputPresetText(values[0], values[1]);
    });
    outputPresetDefinitions().forEach(definition => {
        const card = document.querySelector(`[data-output-preset="${definition.id}"]`);
        if (!card) return;
        const name = card.querySelector('[data-preset-name]');
        const description = card.querySelector('[data-preset-desc]');
        const summary = card.querySelector('[data-preset-summary]');
        const button = card.querySelector('[data-preset-preview-button]');
        if (name) name.textContent = outputPresetText(definition.titleKey, definition.title);
        if (description) description.textContent = outputPresetText(definition.descKey, definition.desc);
        if (summary) summary.textContent = outputPresetText(definition.summaryKey, definition.summary);
        if (button) button.textContent = outputPresetText('presetPreview', 'Preview');
    });
    outputPresetRenderPreview();
}

function syncOutputPresetsUi() {
    outputPresetDefinitions().forEach(definition => {
        const card = document.querySelector(`[data-output-preset="${definition.id}"]`);
        if (!card) return;
        const current = outputPresetCurrentOptions();
        const candidate = definition.resolve(current);
        const button = card.querySelector('[data-preset-preview-button]');
        const unavailable = card.querySelector('[data-preset-unavailable]');
        card.classList.toggle('is-unavailable', !candidate);
        if (button) button.disabled = !candidate;
        if (unavailable) {
            unavailable.hidden = !!candidate;
            unavailable.textContent = candidate ? '' : outputPresetText(definition.unavailableKey || 'presetUnavailableProject', definition.unavailable || 'Load a project before using this preset.');
        }
    });
    syncOutputPresetsText();
}

function bindOutputPresets() {
    if (outputPresetRuntime.initialized) return;
    outputPresetRuntime.initialized = true;
    document.querySelectorAll('[data-output-preset]').forEach(card => {
        const button = card.querySelector('[data-preset-preview-button]');
        if (button) button.addEventListener('click', () => outputPresetSelect(card.dataset.outputPreset));
    });
    document.getElementById('output-presets-toggle')?.addEventListener('click', () => outputPresetSetExpanded(!outputPresetRuntime.expanded));
    document.getElementById('output-preset-apply')?.addEventListener('click', outputPresetApply);
    const config = document.getElementById('configuracoes');
    if (config) {
        config.addEventListener('input', () => {
            if (!outputPresetRuntime.applying && outputPresetRuntime.selectedId) outputPresetRenderPreview();
        });
        config.addEventListener('change', () => {
            if (!outputPresetRuntime.applying && outputPresetRuntime.selectedId) outputPresetRenderPreview();
        });
    }
    window.addEventListener('bas:projectchange', () => syncOutputPresetsUi());
    outputPresetSetExpanded(outputPresetStoredExpanded(), { persist: false });
    syncOutputPresetsUi();
}

window.BASOutputPresets = Object.freeze({
    version: BAS_OUTPUT_PRESET_VERSION,
    select: outputPresetSelect,
    apply: outputPresetApply,
    applyOptions: outputPresetApplyResolvedOptions,
    sync: syncOutputPresetsUi,
    getDefinitions: outputPresetDefinitions,
    setExpanded: outputPresetSetExpanded
});
window.outputPresetApplyResolvedOptions = outputPresetApplyResolvedOptions;
window.syncOutputPresetsUi = syncOutputPresetsUi;
window.syncOutputPresetsText = syncOutputPresetsText;
window.addEventListener('DOMContentLoaded', bindOutputPresets);
