const BAS_COMPOSITION_VERSION = 2;
const BAS_COMPOSITION_LAYER_LIMIT = 24;

const compositionRuntime = {
    initialized: false,
    projectRef: null,
    selectedId: '',
    previewTime: 0,
    renderGeneration: 0,
    previewTimer: 0,
    pointerId: null,
    pointerStart: null,
    pointerLayerStart: null,
    moved: false,
    lastBounds: [],
    imageCache: new Map(),
    exportCanvas: document.createElement('canvas'),
    dragFrame: 0,
    playbackFrame: 0,
    playbackStamp: 0,
    suppressMainClick: false
};

function compositionText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual];
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function compositionClamp(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

const BAS_COMPOSITION_MOTION_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity'];
const BAS_COMPOSITION_EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

function compositionMotionSnapshot(layer) {
    return {
        x: compositionClamp(layer && layer.x, 0, 1, 0.5),
        y: compositionClamp(layer && layer.y, 0, 1, 0.5),
        scale: compositionClamp(layer && layer.scale, 0.1, 5, 1),
        rotation: compositionClamp(layer && layer.rotation, -360, 360, 0),
        opacity: compositionClamp(layer && layer.opacity, 0, 1, 1)
    };
}

function normalizeCompositionKeyframe(keyframe, index, start, end, fallback) {
    return {
        id: String(keyframe && keyframe.id || `kf-${index + 1}`),
        time: compositionClamp(keyframe && keyframe.time, start, end, start),
        x: compositionClamp(keyframe && keyframe.x, 0, 1, fallback.x),
        y: compositionClamp(keyframe && keyframe.y, 0, 1, fallback.y),
        scale: compositionClamp(keyframe && keyframe.scale, 0.1, 5, fallback.scale),
        rotation: compositionClamp(keyframe && keyframe.rotation, -360, 360, fallback.rotation),
        opacity: compositionClamp(keyframe && keyframe.opacity, 0, 1, fallback.opacity),
        easing: BAS_COMPOSITION_EASINGS.includes(keyframe && keyframe.easing) ? keyframe.easing : 'linear'
    };
}

function compositionNormalizeKeyframes(layer) {
    if (!layer) return [];
    const fallback = compositionMotionSnapshot(layer);
    const start = Math.max(0, Number(layer.start) || 0);
    const end = Math.max(start + 0.001, Number(layer.end) || start + 0.001);
    const source = Array.isArray(layer.keyframes) ? layer.keyframes : [];
    const normalized = source.map((item, index) => normalizeCompositionKeyframe(item, index, start, end, fallback)).sort((a, b) => a.time - b.time);
    const merged = [];
    normalized.forEach(item => {
        const previous = merged[merged.length - 1];
        if (previous && Math.abs(previous.time - item.time) < 0.0005) merged[merged.length - 1] = item;
        else merged.push(item);
    });
    layer.keyframes = merged;
    return layer.keyframes;
}

function compositionEase(value, easing) {
    const t = Math.max(0, Math.min(1, Number(value) || 0));
    if (easing === 'ease-in') return t * t;
    if (easing === 'ease-out') return 1 - Math.pow(1 - t, 2);
    if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return t;
}

function compositionInterpolateMotion(from, to, progress, easing) {
    const t = compositionEase(progress, easing);
    const result = {};
    BAS_COMPOSITION_MOTION_KEYS.forEach(key => {
        result[key] = Number(from[key]) + (Number(to[key]) - Number(from[key])) * t;
    });
    return result;
}

function compositionResolvedTransform(layer, time) {
    const base = compositionMotionSnapshot(layer);
    const keyframes = compositionNormalizeKeyframes(layer);
    if (!keyframes.length) return base;
    const current = compositionClamp(time, Number(layer.start) || 0, Number(layer.end) || 0, Number(layer.start) || 0);
    const first = keyframes[0];
    if (current <= first.time) {
        const origin = Math.max(0, Number(layer.start) || 0);
        if (first.time <= origin + 0.0005) return compositionMotionSnapshot(first);
        return compositionInterpolateMotion(base, first, (current - origin) / Math.max(0.0005, first.time - origin), first.easing);
    }
    for (let index = 1; index < keyframes.length; index++) {
        const next = keyframes[index];
        const previous = keyframes[index - 1];
        if (current <= next.time) return compositionInterpolateMotion(previous, next, (current - previous.time) / Math.max(0.0005, next.time - previous.time), next.easing);
    }
    return compositionMotionSnapshot(keyframes[keyframes.length - 1]);
}

function compositionResolvedLayer(layer, time) {
    return { ...layer, ...compositionResolvedTransform(layer, time) };
}

function compositionKeyframeTolerance() {
    const fps = Math.max(1, Number(currentProject && currentProject.fps) || Number(document.getElementById('input-fps')?.value) || 30);
    return Math.max(0.004, 0.5 / fps);
}

function compositionKeyframeAt(layer, time) {
    const tolerance = compositionKeyframeTolerance();
    return compositionNormalizeKeyframes(layer).find(item => Math.abs(item.time - time) <= tolerance) || null;
}

function compositionCurrentTime() {
    return compositionClamp(compositionMainPreviewTime(), 0, Math.max(0, compositionDuration()), 0);
}

function compositionNextKeyframeId(layer) {
    return `${layer.id}-kf-${Date.now().toString(36)}-${compositionNormalizeKeyframes(layer).length + 1}`;
}

function compositionSetMotionAtTime(layer, values, time, forceKeyframe = false) {
    if (!layer) return null;
    const hasMotion = compositionNormalizeKeyframes(layer).length > 0;
    if (!hasMotion && !forceKeyframe) {
        BAS_COMPOSITION_MOTION_KEYS.forEach(key => {
            if (values[key] !== undefined) layer[key] = values[key];
        });
        return null;
    }
    const clampedTime = compositionClamp(time, layer.start, layer.end, layer.start);
    let keyframe = compositionKeyframeAt(layer, clampedTime);
    if (!keyframe) {
        const snapshot = compositionResolvedTransform(layer, clampedTime);
        keyframe = { id: compositionNextKeyframeId(layer), time: clampedTime, ...snapshot, easing: 'linear' };
        layer.keyframes.push(keyframe);
        compositionNormalizeKeyframes(layer);
        keyframe = compositionKeyframeAt(layer, clampedTime) || keyframe;
    }
    BAS_COMPOSITION_MOTION_KEYS.forEach(key => {
        if (values[key] !== undefined) keyframe[key] = values[key];
    });
    return keyframe;
}

function compositionToggleKeyframe(layer, time) {
    if (!layer) return null;
    const existing = compositionKeyframeAt(layer, time);
    if (existing) {
        layer.keyframes = compositionNormalizeKeyframes(layer).filter(item => item.id !== existing.id);
        return { removed: true, keyframe: existing };
    }
    const snapshot = compositionResolvedTransform(layer, time);
    const keyframe = { id: compositionNextKeyframeId(layer), time: compositionClamp(time, layer.start, layer.end, layer.start), ...snapshot, easing: 'linear' };
    layer.keyframes.push(keyframe);
    compositionNormalizeKeyframes(layer);
    return { removed: false, keyframe: compositionKeyframeAt(layer, keyframe.time) || keyframe };
}

function compositionDuration() {
    if (!currentProject) return 0;
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        return getAdvancedParts().reduce((total, part) => total + Math.max(0, Number(part.end) - Number(part.start)), 0);
    }
    if (window.BASMasterSequence) return Math.max(0, Number(BASMasterSequence.getDuration()) || 0);
    return Math.max(0, Number(currentProject.sourceDuration) || 0);
}

function compositionDefaultEnd() {
    return Math.max(0.1, compositionDuration() || 1);
}

function normalizeCompositionLayer(layer, index = 0) {
    const type = layer && layer.type === 'image' ? 'image' : 'text';
    const endFallback = compositionDefaultEnd();
    const start = compositionClamp(layer && layer.start, 0, 86400, 0);
    const end = Math.max(start + 0.001, compositionClamp(layer && layer.end, 0.001, 86400, endFallback));
    const normalized = {
        id: String(layer && layer.id || `layer-${index + 1}`),
        type,
        name: String(layer && layer.name || (type === 'text' ? compositionText('compositionDefaultTextName', 'Text') : compositionText('compositionDefaultImageName', 'Image'))),
        visible: layer && layer.visible === false ? false : true,
        start,
        end,
        x: compositionClamp(layer && layer.x, 0, 1, 0.5),
        y: compositionClamp(layer && layer.y, 0, 1, 0.5),
        scale: compositionClamp(layer && layer.scale, 0.1, 5, 1),
        rotation: compositionClamp(layer && layer.rotation, -360, 360, 0),
        opacity: compositionClamp(layer && layer.opacity, 0, 1, 1),
        text: String(layer && layer.text !== undefined ? layer.text : 'Boot Animation'),
        fontFamily: ['fredoka', 'system', 'serif', 'mono'].includes(layer && layer.fontFamily) ? layer.fontFamily : 'fredoka',
        fontSize: compositionClamp(layer && layer.fontSize, 0.015, 0.4, 0.08),
        color: /^#[0-9a-f]{6}$/i.test(String(layer && layer.color || '')) ? String(layer.color) : '#ffffff',
        bold: layer && layer.bold === false ? false : true,
        align: ['left', 'center', 'right'].includes(layer && layer.align) ? layer.align : 'center',
        imageWidth: compositionClamp(layer && layer.imageWidth, 0.03, 1.5, 0.35),
        naturalWidth: Math.max(0, Number(layer && layer.naturalWidth) || 0),
        naturalHeight: Math.max(0, Number(layer && layer.naturalHeight) || 0),
        assetName: String(layer && layer.assetName || ''),
        assetType: String(layer && layer.assetType || ''),
        blob: layer && layer.blob instanceof Blob ? layer.blob : null,
        keyframes: Array.isArray(layer && layer.keyframes) ? layer.keyframes.map(item => ({ ...item })) : []
    };
    compositionNormalizeKeyframes(normalized);
    return normalized;
}

function ensureProjectComposition() {
    if (!currentProject) return [];
    if (!Array.isArray(currentProject.compositionLayers)) currentProject.compositionLayers = [];
    if (!Number.isInteger(currentProject.compositionCounter)) currentProject.compositionCounter = 0;
    currentProject.compositionLayers = currentProject.compositionLayers.map(normalizeCompositionLayer);
    currentProject.compositionCounter = Math.max(currentProject.compositionCounter, currentProject.compositionLayers.length);
    return currentProject.compositionLayers;
}

function getCompositionLayers() {
    return ensureProjectComposition();
}

function getCompositionLayer(id = compositionRuntime.selectedId) {
    return getCompositionLayers().find(layer => layer.id === id) || null;
}

function nextCompositionLayerId() {
    if (!currentProject) return `layer-${Date.now()}`;
    currentProject.compositionCounter = Math.max(0, Number(currentProject.compositionCounter) || 0) + 1;
    return `cl-${currentProject.compositionCounter}`;
}

function compositionLayerActive(layer, time) {
    return !!layer && layer.visible !== false && Number(time) >= Number(layer.start) - 0.0005 && Number(time) <= Number(layer.end) + 0.0005;
}

function compositionFontFamily(value) {
    if (value === 'serif') return 'Georgia, Times New Roman, serif';
    if (value === 'mono') return 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    if (value === 'system') return 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    return 'Fredoka, ui-rounded, system-ui, sans-serif';
}

async function compositionDrawableForLayer(layer) {
    if (!layer || !(layer.blob instanceof Blob)) return null;
    const cached = compositionRuntime.imageCache.get(layer.id);
    if (cached && cached.blob === layer.blob && cached.drawable) return cached.drawable;
    if (cached && cached.drawable && typeof cached.drawable.close === 'function') cached.drawable.close();
    const drawable = await blobToDrawable(layer.blob);
    compositionRuntime.imageCache.set(layer.id, { blob: layer.blob, drawable });
    return drawable;
}

function compositionTextBounds(ctx, layer, width, height) {
    const fontSize = Math.max(6, height * layer.fontSize * layer.scale);
    ctx.font = `${layer.bold ? 700 : 500} ${fontSize}px ${compositionFontFamily(layer.fontFamily)}`;
    const lines = String(layer.text || '').split(/\r?\n/).slice(0, 8);
    const metrics = lines.map(line => ctx.measureText(line || ' '));
    const textWidth = Math.max(1, ...metrics.map(item => item.width));
    const lineHeight = fontSize * 1.12;
    const textHeight = Math.max(lineHeight, lines.length * lineHeight);
    return { fontSize, lines, textWidth, lineHeight, textHeight };
}

async function drawCompositionLayer(ctx, layer, width, height, options = {}) {
    const x = width * layer.x;
    const y = height * layer.y;
    const angle = layer.rotation * Math.PI / 180;
    ctx.save();
    ctx.globalAlpha = compositionClamp(layer.opacity, 0, 1, 1);
    ctx.translate(x, y);
    ctx.rotate(angle);
    let localWidth = 1;
    let localHeight = 1;
    if (layer.type === 'image') {
        const drawable = await compositionDrawableForLayer(layer);
        if (!drawable) {
            ctx.restore();
            return null;
        }
        const naturalWidth = drawable.naturalWidth || drawable.videoWidth || drawable.width || layer.naturalWidth || 1;
        const naturalHeight = drawable.naturalHeight || drawable.videoHeight || drawable.height || layer.naturalHeight || 1;
        localWidth = Math.max(1, width * layer.imageWidth * layer.scale);
        localHeight = Math.max(1, localWidth * naturalHeight / Math.max(1, naturalWidth));
        ctx.drawImage(drawable, -localWidth / 2, -localHeight / 2, localWidth, localHeight);
    } else {
        const data = compositionTextBounds(ctx, layer, width, height);
        localWidth = data.textWidth;
        localHeight = data.textHeight;
        ctx.fillStyle = layer.color;
        ctx.textAlign = layer.align;
        ctx.textBaseline = 'middle';
        const anchorX = layer.align === 'left' ? -localWidth / 2 : layer.align === 'right' ? localWidth / 2 : 0;
        const firstY = -((data.lines.length - 1) * data.lineHeight) / 2;
        data.lines.forEach((line, index) => ctx.fillText(line || ' ', anchorX, firstY + index * data.lineHeight));
    }
    if (options.selected) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#7ff6ea';
        ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.003);
        ctx.setLineDash([Math.max(5, width * 0.009), Math.max(4, width * 0.006)]);
        ctx.strokeRect(-localWidth / 2 - 6, -localHeight / 2 - 6, localWidth + 12, localHeight + 12);
        ctx.setLineDash([]);
    }
    ctx.restore();
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const boxWidth = localWidth * cos + localHeight * sin;
    const boxHeight = localWidth * sin + localHeight * cos;
    return { id: layer.id, left: x - boxWidth / 2, top: y - boxHeight / 2, right: x + boxWidth / 2, bottom: y + boxHeight / 2 };
}

async function renderCompositionLayers(ctx, time, width, height, options = {}) {
    const bounds = [];
    const layers = getCompositionLayers();
    for (const layer of layers) {
        if (!compositionLayerActive(layer, time)) continue;
        const resolved = compositionResolvedLayer(layer, time);
        const box = await drawCompositionLayer(ctx, resolved, width, height, { selected: options.showSelection && layer.id === compositionRuntime.selectedId });
        if (box) bounds.push(box);
    }
    return bounds;
}

function compositionSerialize() {
    return {
        version: BAS_COMPOSITION_VERSION,
        counter: currentProject ? Math.max(0, Number(currentProject.compositionCounter) || 0) : 0,
        layers: getCompositionLayers().map(layer => ({
            id: layer.id,
            type: layer.type,
            name: layer.name,
            visible: layer.visible,
            start: layer.start,
            end: layer.end,
            x: layer.x,
            y: layer.y,
            scale: layer.scale,
            rotation: layer.rotation,
            opacity: layer.opacity,
            text: layer.text,
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize,
            color: layer.color,
            bold: layer.bold,
            align: layer.align,
            imageWidth: layer.imageWidth,
            naturalWidth: layer.naturalWidth,
            naturalHeight: layer.naturalHeight,
            assetName: layer.assetName,
            assetType: layer.assetType,
            keyframes: compositionNormalizeKeyframes(layer).map(keyframe => ({ ...keyframe }))
        }))
    };
}

function compositionGetAssets() {
    return getCompositionLayers()
        .filter(layer => layer.type === 'image' && layer.blob instanceof Blob)
        .map(layer => ({
            key: `composition:${layer.id}`,
            kind: 'composition-image',
            name: layer.assetName || `${layer.id}.png`,
            blob: layer.blob,
            transient: false,
            size: layer.blob.size || 0,
            type: layer.blob.type || layer.assetType || '',
            lastModified: Number(layer.blob.lastModified) || 0
        }));
}

function compositionRestoreState(state, assetMap = new Map()) {
    if (!currentProject) return;
    const saved = state && Array.isArray(state.layers) ? state.layers : [];
    currentProject.compositionCounter = Math.max(Number(state && state.counter) || 0, saved.length);
    currentProject.compositionLayers = saved.map((item, index) => {
        const asset = assetMap.get(`composition:${item.id}`);
        return normalizeCompositionLayer({
            ...item,
            blob: asset && asset.blob instanceof Blob ? asset.blob : null,
            assetName: item.assetName || asset && asset.name || '',
            assetType: item.assetType || asset && asset.type || ''
        }, index);
    });
    compositionRuntime.imageCache.forEach(entry => {
        if (entry.drawable && typeof entry.drawable.close === 'function') entry.drawable.close();
    });
    compositionRuntime.imageCache.clear();
    const preferred = compositionRuntime.selectedId;
    compositionRuntime.selectedId = currentProject.compositionLayers.some(layer => layer.id === preferred) ? preferred : currentProject.compositionLayers[0]?.id || '';
    renderCompositionUi();
    scheduleCompositionPreview();
}

function compositionGetUiState() {
    return { selectedId: compositionRuntime.selectedId, previewTime: compositionRuntime.previewTime };
}

function compositionRestoreUiState(state = {}) {
    const layers = getCompositionLayers();
    const selected = String(state.selectedId || '');
    compositionRuntime.selectedId = layers.some(layer => layer.id === selected) ? selected : layers[0]?.id || '';
    compositionRuntime.previewTime = compositionClamp(state.previewTime, 0, Math.max(0, compositionDuration()), 0);
    renderCompositionUi();
    scheduleCompositionPreview();
}


function validateComposition() {
    const layers = getCompositionLayers();
    for (let index = 0; index < layers.length; index++) {
        const layer = layers[index];
        if (!(Number(layer.end) > Number(layer.start))) {
            return { valid: false, message: compositionText('compositionInvalidTiming', 'A composition layer has an invalid time range.') };
        }
        if (layer.type === 'image' && !(layer.blob instanceof Blob)) {
            return { valid: false, message: compositionText('compositionMissingImage', 'One of the image layers is missing its file.') };
        }
    }
    return { valid: true, message: '' };
}

function compositionHasLayers() {
    return getCompositionLayers().some(layer => layer.visible !== false);
}

function compositionAdvancedTime(part, sourceTime) {
    const parts = typeof getAdvancedParts === 'function' ? getAdvancedParts() : [];
    let base = 0;
    for (const item of parts) {
        if (item.id === part.id) return base + Math.max(0, Math.min(Number(item.end) - Number(item.start), Number(sourceTime) - Number(item.start)));
        base += Math.max(0, Number(item.end) - Number(item.start));
    }
    return Math.max(0, Number(sourceTime) || 0);
}

async function applyCompositionToFrameBlob(blob, time, width, height, format, jpegQuality = 0.9) {
    if (!(blob instanceof Blob) || !compositionHasLayers()) return blob;
    const active = getCompositionLayers().some(layer => compositionLayerActive(layer, time));
    if (!active) return blob;
    const canvas = compositionRuntime.exportCanvas;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d', { alpha: false });
    const drawable = await blobToDrawable(blob);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
    releaseDrawable(drawable);
    await renderCompositionLayers(ctx, time, canvas.width, canvas.height, { showSelection: false });
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? normalizeJpegExportQuality(jpegQuality) : undefined;
    return canvasToBlobAsync(canvas, mime, quality);
}

function compositionMainPreviewTime() {
    if (!currentProject) return 0;
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        const part = typeof getAdvancedPartById === 'function' ? getAdvancedPartById(currentProject.advancedExpandedId) : null;
        if (part) {
            const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(part) : '';
            const primaryId = window.BASSourceLibrary ? BASSourceLibrary.getPrimaryId() : sourceId;
            if (!sourceId || sourceId === primaryId) {
                const sourceTime = typeof timelineTimeToProjectTime === 'function'
                    ? timelineTimeToProjectTime(Number(playerVideo.currentTime) || 0)
                    : Number(playerVideo.currentTime) || 0;
                return compositionAdvancedTime(part, Math.max(Number(part.start) || 0, Math.min(Number(part.end) || 0, sourceTime)));
            }
            return compositionAdvancedTime(part, Number(part.start) || 0);
        }
    }
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) return Math.max(0, Number(BASMasterSequence.getCurrentTime()) || 0);
    const timelineTime = Number(playerVideo && playerVideo.currentTime) || 0;
    return typeof timelineTimeToProjectTime === 'function' ? Math.max(0, timelineTimeToProjectTime(timelineTime)) : Math.max(0, timelineTime);
}

function syncCompositionMainCanvas() {
    const canvas = document.getElementById('composition-main-canvas');
    const shell = document.getElementById('framing-preview');
    if (!canvas || !shell) return null;
    const rect = shell.getBoundingClientRect();
    const scale = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
    const width = Math.max(1, Math.round((rect.width || shell.clientWidth || 1) * scale));
    const height = Math.max(1, Math.round((rect.height || shell.clientHeight || 1) * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return canvas;
}

async function renderCompositionPreview() {
    const canvas = syncCompositionMainCanvas();
    if (!canvas) return;
    const generation = ++compositionRuntime.renderGeneration;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) {
        compositionRuntime.lastBounds = [];
        canvas.classList.remove('is-interactive');
        return;
    }
    compositionRuntime.previewTime = compositionClamp(compositionMainPreviewTime(), 0, Math.max(0, compositionDuration()), 0);
    const bounds = await renderCompositionLayers(ctx, compositionRuntime.previewTime, canvas.width, canvas.height, { showSelection: true });
    if (generation !== compositionRuntime.renderGeneration) return;
    compositionRuntime.lastBounds = bounds;
    canvas.classList.toggle('is-interactive', bounds.length > 0);
}

function renderCompositionOverlayFromBase() {
    return renderCompositionPreview();
}

function scheduleCompositionDragPreview() {
    if (compositionRuntime.dragFrame) return;
    compositionRuntime.dragFrame = requestAnimationFrame(() => {
        compositionRuntime.dragFrame = 0;
        renderCompositionPreview();
    });
}

function scheduleCompositionPreview(delay = 35) {
    clearTimeout(compositionRuntime.previewTimer);
    compositionRuntime.previewTimer = setTimeout(() => renderCompositionPreview(), delay);
}

function compositionPlaybackLoop(timestamp = 0) {
    compositionRuntime.playbackFrame = 0;
    if (!playerVideo || playerVideo.paused || playerVideo.ended || isGenerating || isBuildingTimeline) return;
    if (!compositionRuntime.playbackStamp || timestamp - compositionRuntime.playbackStamp >= 32) {
        compositionRuntime.playbackStamp = timestamp;
        renderCompositionPreview();
    }
    compositionRuntime.playbackFrame = requestAnimationFrame(compositionPlaybackLoop);
}

function startCompositionPlaybackLoop() {
    if (compositionRuntime.playbackFrame) cancelAnimationFrame(compositionRuntime.playbackFrame);
    compositionRuntime.playbackFrame = requestAnimationFrame(compositionPlaybackLoop);
}

function stopCompositionPlaybackLoop() {
    if (compositionRuntime.playbackFrame) cancelAnimationFrame(compositionRuntime.playbackFrame);
    compositionRuntime.playbackFrame = 0;
    compositionRuntime.playbackStamp = 0;
    scheduleCompositionPreview(0);
}

function compositionFormatTime(value) {
    const time = Math.max(0, Number(value) || 0);
    return `${time.toFixed(time < 10 ? 2 : 1)}s`;
}

function compositionLayerSummary(layer) {
    const type = layer.type === 'image' ? compositionText('compositionTypeImage', 'Image') : compositionText('compositionTypeText', 'Text');
    return `${type} · ${compositionFormatTime(layer.start)}–${compositionFormatTime(layer.end)}`;
}

function renderCompositionLayerList() {
    const list = document.getElementById('composition-layer-list');
    const empty = document.getElementById('composition-layer-empty');
    if (!list || !empty) return;
    const layers = getCompositionLayers();
    list.innerHTML = '';
    empty.hidden = layers.length > 0;
    [...layers].reverse().forEach(layer => {
        const index = layers.findIndex(item => item.id === layer.id);
        const card = document.createElement('div');
        card.className = `composition-layer-card${layer.id === compositionRuntime.selectedId ? ' is-selected' : ''}${layer.visible === false ? ' is-hidden' : ''}`;
        card.dataset.layerId = layer.id;
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'composition-layer-main';
        main.dataset.compositionSelect = layer.id;
        const icon = document.createElement('span');
        icon.className = `composition-layer-icon composition-layer-icon-${layer.type}`;
        const copy = document.createElement('span');
        copy.className = 'composition-layer-copy';
        const strong = document.createElement('strong');
        strong.textContent = layer.name || `${compositionText('compositionLayer', 'Layer')} ${index + 1}`;
        const small = document.createElement('small');
        small.textContent = compositionLayerSummary(layer);
        copy.append(strong, small);
        main.append(icon, copy);
        const actions = document.createElement('div');
        actions.className = 'composition-layer-actions';
        const visible = document.createElement('button');
        visible.type = 'button';
        visible.dataset.compositionVisibility = layer.id;
        visible.title = layer.visible === false ? compositionText('compositionShow', 'Show layer') : compositionText('compositionHide', 'Hide layer');
        visible.textContent = layer.visible === false ? '○' : '●';
        const up = document.createElement('button');
        up.type = 'button';
        up.dataset.compositionMove = layer.id;
        up.dataset.direction = '1';
        up.disabled = index === layers.length - 1;
        up.title = compositionText('compositionMoveUp', 'Move forward');
        up.textContent = '↑';
        const down = document.createElement('button');
        down.type = 'button';
        down.dataset.compositionMove = layer.id;
        down.dataset.direction = '-1';
        down.disabled = index === 0;
        down.title = compositionText('compositionMoveDown', 'Move backward');
        down.textContent = '↓';
        actions.append(visible, up, down);
        card.append(main, actions);
        list.append(card);
    });
}

function compositionSetField(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    if (element.type === 'checkbox') element.checked = !!value;
    else element.value = String(value);
}

function renderCompositionInspector() {
    const empty = document.getElementById('composition-inspector-empty');
    const inspector = document.getElementById('composition-inspector');
    const textFields = document.getElementById('composition-text-fields');
    const imageFields = document.getElementById('composition-image-fields');
    const layer = getCompositionLayer();
    if (!empty || !inspector) return;
    empty.hidden = getCompositionLayers().length === 0 || !!layer;
    inspector.hidden = !layer;
    if (!layer) return;
    compositionSetField('composition-layer-name', layer.name);
    compositionSetField('composition-layer-start', layer.start.toFixed(3));
    compositionSetField('composition-layer-end', layer.end.toFixed(3));
    const currentTime = compositionCurrentTime();
    const transform = compositionResolvedTransform(layer, currentTime);
    compositionSetField('composition-layer-x', Math.round(transform.x * 100));
    compositionSetField('composition-layer-y', Math.round(transform.y * 100));
    compositionSetField('composition-layer-scale', Math.round(transform.scale * 100));
    compositionSetField('composition-layer-rotation', Math.round(transform.rotation));
    compositionSetField('composition-layer-opacity', Math.round(transform.opacity * 100));
    if (textFields) textFields.hidden = layer.type !== 'text';
    if (imageFields) imageFields.hidden = layer.type !== 'image';
    if (layer.type === 'text') {
        compositionSetField('composition-text-content', layer.text);
        compositionSetField('composition-text-font', layer.fontFamily);
        compositionSetField('composition-text-size', Math.round(layer.fontSize * 100));
        compositionSetField('composition-text-color', layer.color);
        compositionSetField('composition-text-bold', layer.bold);
        compositionSetField('composition-text-align', layer.align);
    } else {
        compositionSetField('composition-image-width', Math.round(layer.imageWidth * 100));
        const filename = document.getElementById('composition-image-filename');
        if (filename) filename.textContent = layer.assetName || compositionText('compositionImageFileMissing', 'Image file unavailable');
    }
    document.querySelectorAll('[data-composition-value]').forEach(element => {
        const targetId = element.dataset.compositionValue;
        const input = document.getElementById(targetId);
        if (!input) return;
        const suffix = element.dataset.suffix || '';
        element.textContent = `${input.value}${suffix}`;
    });
}

function renderCompositionMotionUi() {
    const layer = getCompositionLayer();
    const panel = document.getElementById('composition-motion-panel');
    if (!panel) return;
    panel.hidden = !layer;
    if (!layer) return;
    const keyframes = compositionNormalizeKeyframes(layer);
    const time = compositionCurrentTime();
    const active = compositionKeyframeAt(layer, time);
    const count = document.getElementById('composition-keyframe-count');
    const timeLabel = document.getElementById('composition-motion-time');
    const toggleLabel = document.getElementById('composition-keyframe-toggle-label');
    const toggle = document.getElementById('composition-keyframe-toggle');
    const previous = document.getElementById('composition-keyframe-prev');
    const next = document.getElementById('composition-keyframe-next');
    const easing = document.getElementById('composition-keyframe-easing');
    const reset = document.getElementById('composition-keyframe-reset');
    if (count) count.textContent = keyframes.length === 1 ? compositionText('compositionKeyframeOne', '1 keyframe') : compositionText('compositionKeyframesCount', '{count} keyframes').replace('{count}', String(keyframes.length));
    if (timeLabel) timeLabel.textContent = compositionText('compositionKeyframeTime', 'Playhead {time}').replace('{time}', compositionFormatTime(time));
    if (toggleLabel) toggleLabel.textContent = active ? compositionText('compositionKeyframeRemove', 'Remove keyframe') : compositionText('compositionKeyframeAdd', 'Add keyframe');
    if (toggle) toggle.classList.toggle('is-active', !!active);
    const previousFrame = [...keyframes].reverse().find(item => item.time < time - compositionKeyframeTolerance());
    const nextFrame = keyframes.find(item => item.time > time + compositionKeyframeTolerance());
    if (previous) previous.disabled = !previousFrame;
    if (next) next.disabled = !nextFrame;
    if (easing) {
        easing.disabled = !active;
        easing.value = active ? active.easing : 'linear';
    }
    if (reset) reset.disabled = keyframes.length === 0;
}

function compositionRefreshMotionUi() {
    renderCompositionInspector();
    renderCompositionMotionUi();
    scheduleCompositionPreview(0);
    if (typeof renderTimeline3 === 'function') renderTimeline3();
}

function compositionSeekKeyframe(direction) {
    const layer = getCompositionLayer();
    if (!layer) return;
    const time = compositionCurrentTime();
    const keyframes = compositionNormalizeKeyframes(layer);
    const target = direction < 0
        ? [...keyframes].reverse().find(item => item.time < time - compositionKeyframeTolerance())
        : keyframes.find(item => item.time > time + compositionKeyframeTolerance());
    if (!target) return;
    if (typeof seekTimelineTo === 'function') seekTimelineTo(target.time);
    compositionRuntime.previewTime = target.time;
    compositionRefreshMotionUi();
}

function compositionToggleCurrentKeyframe() {
    const layer = getCompositionLayer();
    if (!layer) return;
    const time = compositionCurrentTime();
    compositionToggleKeyframe(layer, time);
    compositionRefreshMotionUi();
    touchComposition('composition', `composition:${layer.id}:keyframe`);
}

function compositionSetCurrentKeyframeEasing(value) {
    const layer = getCompositionLayer();
    if (!layer || !BAS_COMPOSITION_EASINGS.includes(value)) return;
    const keyframe = compositionKeyframeAt(layer, compositionCurrentTime());
    if (!keyframe) return;
    keyframe.easing = value;
    compositionRefreshMotionUi();
    touchComposition('composition', `composition:${layer.id}:easing`);
}

function compositionClearKeyframes() {
    const layer = getCompositionLayer();
    if (!layer || !compositionNormalizeKeyframes(layer).length) return;
    const message = compositionText('compositionKeyframeClearConfirm', 'Clear all keyframes from this layer?');
    if (typeof window.confirm === 'function' && !window.confirm(message)) return;
    layer.keyframes = [];
    compositionRefreshMotionUi();
    touchComposition('composition', `composition:${layer.id}:keyframes-clear`);
}

function compositionSetKeyframeTime(layerId, keyframeId, time, options = {}) {
    const layer = getCompositionLayer(layerId);
    if (!layer) return false;
    const keyframe = compositionNormalizeKeyframes(layer).find(item => item.id === keyframeId);
    if (!keyframe) return false;
    keyframe.time = compositionClamp(time, layer.start, layer.end, keyframe.time);
    compositionNormalizeKeyframes(layer);
    if (options.render !== false) {
        renderCompositionInspector();
        renderCompositionMotionUi();
        scheduleCompositionPreview(0);
    }
    if (options.commit) touchComposition('composition', `composition:${layer.id}:keyframe-time`);
    return true;
}

function renderCompositionUi() {
    if (compositionRuntime.projectRef !== currentProject) compositionRuntime.projectRef = currentProject;
    const layers = getCompositionLayers();
    if (!layers.some(layer => layer.id === compositionRuntime.selectedId)) compositionRuntime.selectedId = layers[0]?.id || '';
    const count = document.getElementById('composition-layer-count');
    if (count) count.textContent = layers.length === 1
        ? compositionText('compositionCountOne', '1 layer')
        : compositionText('compositionCount', '{count} layers').replace('{count}', String(layers.length));
    renderCompositionLayerList();
    renderCompositionInspector();
    renderCompositionMotionUi();
}


function selectCompositionLayer(id, options = {}) {
    const layers = getCompositionLayers();
    const next = layers.find(layer => layer.id === id);
    if (!next) return false;
    compositionRuntime.selectedId = next.id;
    renderCompositionUi();
    scheduleCompositionPreview(0);
    if (options.scroll) document.getElementById('composition-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
}

function touchComposition(reason = 'composition', changeKey = '') {
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch(reason, { changeKey: changeKey || reason });
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
}

function addCompositionTextLayer() {
    if (!currentProject || getCompositionLayers().length >= BAS_COMPOSITION_LAYER_LIMIT) return;
    const duration = compositionDefaultEnd();
    const layer = normalizeCompositionLayer({
        id: nextCompositionLayerId(),
        type: 'text',
        name: compositionText('compositionDefaultTextName', 'Text'),
        text: compositionText('compositionDefaultText', 'Boot Animation'),
        start: 0,
        end: duration,
        x: 0.5,
        y: 0.5,
        fontSize: 0.08,
        color: '#ffffff'
    }, getCompositionLayers().length);
    currentProject.compositionLayers.push(layer);
    compositionRuntime.selectedId = layer.id;
    renderCompositionUi();
    scheduleCompositionPreview(0);
    touchComposition('composition', `composition:${layer.id}:add`);
}

async function addCompositionImageLayer(file) {
    if (!currentProject || !(file instanceof Blob) || getCompositionLayers().length >= BAS_COMPOSITION_LAYER_LIMIT) return;
    if (!String(file.type || '').startsWith('image/')) {
        if (typeof showToast === 'function') showToast(compositionText('compositionImageInvalid', 'Choose a valid image file.'), 'error', 3600);
        return;
    }
    let naturalWidth = 0;
    let naturalHeight = 0;
    try {
        const drawable = await blobToDrawable(file);
        naturalWidth = drawable.naturalWidth || drawable.width || 0;
        naturalHeight = drawable.naturalHeight || drawable.height || 0;
        releaseDrawable(drawable);
    } catch (error) {}
    const layer = normalizeCompositionLayer({
        id: nextCompositionLayerId(),
        type: 'image',
        name: String(file.name || compositionText('compositionDefaultImageName', 'Image')).replace(/\.[^.]+$/, ''),
        start: 0,
        end: compositionDefaultEnd(),
        x: 0.5,
        y: 0.5,
        imageWidth: 0.35,
        naturalWidth,
        naturalHeight,
        assetName: file.name || 'overlay.png',
        assetType: file.type || '',
        blob: file
    }, getCompositionLayers().length);
    currentProject.compositionLayers.push(layer);
    compositionRuntime.selectedId = layer.id;
    renderCompositionUi();
    scheduleCompositionPreview(0);
    touchComposition('composition', `composition:${layer.id}:add`);
}

function deleteCompositionLayer(id) {
    if (!currentProject) return;
    const layers = getCompositionLayers();
    const index = layers.findIndex(layer => layer.id === id);
    if (index < 0) return;
    const cached = compositionRuntime.imageCache.get(id);
    if (cached && cached.drawable && typeof cached.drawable.close === 'function') cached.drawable.close();
    compositionRuntime.imageCache.delete(id);
    layers.splice(index, 1);
    compositionRuntime.selectedId = layers[Math.min(index, layers.length - 1)]?.id || '';
    renderCompositionUi();
    scheduleCompositionPreview(0);
    touchComposition('composition', `composition:${id}:delete`);
}

function moveCompositionLayer(id, direction) {
    const layers = getCompositionLayers();
    const index = layers.findIndex(layer => layer.id === id);
    const target = index + Number(direction || 0);
    if (index < 0 || target < 0 || target >= layers.length) return;
    const [layer] = layers.splice(index, 1);
    layers.splice(target, 0, layer);
    renderCompositionUi();
    scheduleCompositionPreview(0);
    touchComposition('composition', `composition:${id}:order`);
}

function updateCompositionLayerFromInput(input) {
    const layer = getCompositionLayer();
    if (!layer || !input) return;
    const id = input.id;
    if (id === 'composition-layer-name') layer.name = input.value.trim() || compositionText(layer.type === 'image' ? 'compositionDefaultImageName' : 'compositionDefaultTextName', layer.type === 'image' ? 'Image' : 'Text');
    else if (id === 'composition-layer-start') layer.start = compositionClamp(input.value, 0, 86400, 0);
    else if (id === 'composition-layer-end') layer.end = Math.max(layer.start + 0.001, compositionClamp(input.value, 0.001, 86400, compositionDefaultEnd()));
    else if (id === 'composition-layer-x') compositionSetMotionAtTime(layer, { x: compositionClamp(input.value, 0, 100, 50) / 100 }, compositionCurrentTime());
    else if (id === 'composition-layer-y') compositionSetMotionAtTime(layer, { y: compositionClamp(input.value, 0, 100, 50) / 100 }, compositionCurrentTime());
    else if (id === 'composition-layer-scale') compositionSetMotionAtTime(layer, { scale: compositionClamp(input.value, 10, 500, 100) / 100 }, compositionCurrentTime());
    else if (id === 'composition-layer-rotation') compositionSetMotionAtTime(layer, { rotation: compositionClamp(input.value, -360, 360, 0) }, compositionCurrentTime());
    else if (id === 'composition-layer-opacity') compositionSetMotionAtTime(layer, { opacity: compositionClamp(input.value, 0, 100, 100) / 100 }, compositionCurrentTime());
    else if (id === 'composition-text-content') layer.text = input.value;
    else if (id === 'composition-text-font') layer.fontFamily = input.value;
    else if (id === 'composition-text-size') layer.fontSize = compositionClamp(input.value, 1.5, 40, 8) / 100;
    else if (id === 'composition-text-color') layer.color = input.value;
    else if (id === 'composition-text-bold') layer.bold = !!input.checked;
    else if (id === 'composition-text-align') layer.align = input.value;
    else if (id === 'composition-image-width') layer.imageWidth = compositionClamp(input.value, 3, 150, 35) / 100;
    if (layer.end <= layer.start) layer.end = layer.start + 0.001;
    compositionNormalizeKeyframes(layer);
    renderCompositionLayerList();
    renderCompositionInspector();
    renderCompositionMotionUi();
    scheduleCompositionPreview();
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    touchComposition('composition', `composition:${layer.id}:${id}`);
}

function compositionCanvasPoint(event) {
    const canvas = document.getElementById('composition-main-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
        y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
        width: canvas.width,
        height: canvas.height
    };
}

function compositionHitLayer(point) {
    for (let index = compositionRuntime.lastBounds.length - 1; index >= 0; index--) {
        const box = compositionRuntime.lastBounds[index];
        if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) return box.id;
    }
    return '';
}

function compositionPointerDown(event) {
    const canvas = document.getElementById('composition-main-canvas');
    const point = compositionCanvasPoint(event);
    if (!canvas || !point) return;
    const hit = compositionHitLayer(point);
    compositionRuntime.suppressMainClick = !!hit;
    if (hit) {
        compositionRuntime.selectedId = hit;
        renderCompositionUi();
        scheduleCompositionPreview(0);
    }
    const layer = getCompositionLayer();
    if (!layer || hit !== layer.id) return;
    if (typeof pauseTimelinePlayback === 'function') pauseTimelinePlayback();
    else playerVideo?.pause();
    compositionRuntime.pointerId = event.pointerId;
    compositionRuntime.pointerStart = point;
    const transform = compositionResolvedTransform(layer, compositionCurrentTime());
    compositionRuntime.pointerLayerStart = { x: transform.x, y: transform.y };
    compositionRuntime.moved = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    event.preventDefault();
}

function compositionPointerMove(event) {
    if (compositionRuntime.pointerId !== event.pointerId) return;
    const point = compositionCanvasPoint(event);
    const layer = getCompositionLayer();
    if (!point || !layer || !compositionRuntime.pointerStart || !compositionRuntime.pointerLayerStart) return;
    const dx = (point.x - compositionRuntime.pointerStart.x) / Math.max(1, point.width);
    const dy = (point.y - compositionRuntime.pointerStart.y) / Math.max(1, point.height);
    if (!compositionRuntime.moved && Math.hypot(dx * point.width, dy * point.height) > 2) compositionRuntime.moved = true;
    if (!compositionRuntime.moved) return;
    const nextX = compositionClamp(compositionRuntime.pointerLayerStart.x + dx, 0, 1, 0.5);
    const nextY = compositionClamp(compositionRuntime.pointerLayerStart.y + dy, 0, 1, 0.5);
    compositionSetMotionAtTime(layer, { x: nextX, y: nextY }, compositionCurrentTime());
    renderCompositionInspector();
    scheduleCompositionDragPreview();
    event.preventDefault();
}

function compositionPointerUp(event) {
    if (compositionRuntime.pointerId !== event.pointerId) return;
    const canvas = document.getElementById('composition-main-canvas');
    if (canvas && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (canvas) canvas.classList.remove('is-dragging');
    const moved = compositionRuntime.moved;
    const layer = getCompositionLayer();
    compositionRuntime.pointerId = null;
    compositionRuntime.pointerStart = null;
    compositionRuntime.pointerLayerStart = null;
    compositionRuntime.moved = false;
    if (compositionRuntime.dragFrame) {
        cancelAnimationFrame(compositionRuntime.dragFrame);
        compositionRuntime.dragFrame = 0;
    }
    if (moved && layer) {
        renderCompositionOverlayFromBase();
        renderCompositionMotionUi();
        if (typeof renderTimeline3 === 'function') renderTimeline3();
        touchComposition('composition', `composition:${layer.id}:position`);
    }
}

function syncCompositionText() {
    const bindings = {
        'p12-tool-composition': ['contextToolComposition', 'Compose'],
        'composition-kicker': ['compositionKicker', 'COMPOSITION'],
        'composition-title': ['compositionTitle', 'Build on top of the animation'],
        'composition-desc': ['compositionDesc', 'Add text, logos and image layers. Position them visually and choose when each layer appears.'],
        'composition-main-preview-kicker': ['compositionMainPreviewKicker', 'MAIN PREVIEW'],
        'composition-main-preview-title': ['compositionMainPreviewTitle', 'Compose directly on the editor preview'],
        'composition-main-preview-desc': ['compositionMainPreviewDesc', 'Move the timeline playhead to choose the moment, then drag the selected layer directly on the preview above.'],
        'composition-add-text-label': ['compositionAddText', 'Add text'],
        'composition-add-image-label': ['compositionAddImage', 'Add image'],
        'composition-layers-title': ['compositionLayersTitle', 'Layers'],
        'composition-empty-title': ['compositionEmptyTitle', 'No layers yet'],
        'composition-empty-desc': ['compositionEmptyDesc', 'Add text or an image to start composing over the animation.'],
        'composition-inspector-empty-title': ['compositionInspectorEmptyTitle', 'Select a layer'],
        'composition-inspector-empty-desc': ['compositionInspectorEmptyDesc', 'Choose a layer to edit position, timing and appearance.'],
        'composition-inspector-title': ['compositionInspectorTitle', 'Layer settings'],
        'composition-label-name': ['compositionLabelName', 'Layer name'],
        'composition-label-start': ['compositionLabelStart', 'Start'],
        'composition-label-end': ['compositionLabelEnd', 'End'],
        'composition-label-x': ['compositionLabelX', 'Horizontal position'],
        'composition-label-y': ['compositionLabelY', 'Vertical position'],
        'composition-label-scale': ['compositionLabelScale', 'Scale'],
        'composition-label-rotation': ['compositionLabelRotation', 'Rotation'],
        'composition-label-opacity': ['compositionLabelOpacity', 'Opacity'],
        'composition-motion-section': ['compositionMotionSection', 'MOTION & KEYFRAMES'],
        'composition-motion-title': ['compositionMotionTitle', 'Animate this layer'],
        'composition-motion-desc': ['compositionMotionDesc', 'Add keyframes at the playhead to animate position, scale, rotation and opacity.'],
        'composition-keyframe-prev': ['compositionKeyframePrev', 'Previous'],
        'composition-keyframe-next': ['compositionKeyframeNext', 'Next'],
        'composition-keyframe-easing-label': ['compositionKeyframeEasing', 'Easing'],
        'composition-ease-linear': ['compositionEaseLinear', 'Linear'],
        'composition-ease-in': ['compositionEaseIn', 'Ease in'],
        'composition-ease-out': ['compositionEaseOut', 'Ease out'],
        'composition-ease-in-out': ['compositionEaseInOut', 'Ease in/out'],
        'composition-keyframe-reset': ['compositionKeyframeClear', 'Clear keyframes'],
        'composition-text-section': ['compositionTextSection', 'TEXT'],
        'composition-label-text': ['compositionLabelText', 'Content'],
        'composition-label-font': ['compositionLabelFont', 'Font'],
        'composition-label-size': ['compositionLabelSize', 'Text size'],
        'composition-label-color': ['compositionLabelColor', 'Color'],
        'composition-label-bold': ['compositionLabelBold', 'Bold'],
        'composition-label-align': ['compositionLabelAlign', 'Alignment'],
        'composition-font-fredoka': ['compositionFontFredoka', 'Fredoka'],
        'composition-font-system': ['compositionFontSystem', 'System'],
        'composition-font-serif': ['compositionFontSerif', 'Serif'],
        'composition-font-mono': ['compositionFontMono', 'Monospace'],
        'composition-align-left': ['compositionAlignLeft', 'Left'],
        'composition-align-center': ['compositionAlignCenter', 'Center'],
        'composition-align-right': ['compositionAlignRight', 'Right'],
        'composition-image-section': ['compositionImageSection', 'IMAGE'],
        'composition-label-image-width': ['compositionLabelImageWidth', 'Base width'],
        'composition-delete': ['compositionDelete', 'Delete layer'],
        'composition-timing-hint': ['compositionTimingHint', 'Timing uses the final base sequence. Advanced Part repeats do not duplicate layer timing.']
    };
    Object.entries(bindings).forEach(([id, [key, fallback]]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = compositionText(key, fallback);
    });
    renderCompositionUi();
}

function compositionOpen() {
    renderCompositionUi();
    const duration = compositionDuration();
    if (compositionRuntime.previewTime > duration) compositionRuntime.previewTime = Math.max(0, duration);
    scheduleCompositionPreview(0);
}

function initializeCompositionForProject() {
    if (compositionRuntime.projectRef !== currentProject) {
        compositionRuntime.projectRef = currentProject;
        compositionRuntime.selectedId = '';
        compositionRuntime.previewTime = 0;
        compositionRuntime.renderGeneration += 1;
        if (compositionRuntime.playbackFrame) {
            cancelAnimationFrame(compositionRuntime.playbackFrame);
            compositionRuntime.playbackFrame = 0;
        }
        if (compositionRuntime.dragFrame) {
            cancelAnimationFrame(compositionRuntime.dragFrame);
            compositionRuntime.dragFrame = 0;
        }
        compositionRuntime.imageCache.forEach(entry => {
            if (entry.drawable && typeof entry.drawable.close === 'function') entry.drawable.close();
        });
        compositionRuntime.imageCache.clear();
    }
    if (currentProject) ensureProjectComposition();
    renderCompositionUi();
    if (currentProject && currentProject.sourceBlob instanceof Blob) scheduleCompositionPreview(0);
}

function bindComposition() {
    if (compositionRuntime.initialized) return;
    compositionRuntime.initialized = true;
    document.getElementById('composition-add-text')?.addEventListener('click', addCompositionTextLayer);
    document.getElementById('composition-add-image')?.addEventListener('change', event => {
        const file = event.target.files && event.target.files[0];
        if (file) addCompositionImageLayer(file);
        event.target.value = '';
    });
    document.getElementById('composition-layer-list')?.addEventListener('click', event => {
        const select = event.target.closest('[data-composition-select]');
        if (select) {
            compositionRuntime.selectedId = select.dataset.compositionSelect;
            renderCompositionUi();
            scheduleCompositionPreview(0);
            return;
        }
        const visibility = event.target.closest('[data-composition-visibility]');
        if (visibility) {
            const layer = getCompositionLayer(visibility.dataset.compositionVisibility);
            if (layer) {
                layer.visible = !layer.visible;
                renderCompositionUi();
                scheduleCompositionPreview(0);
                touchComposition('composition', `composition:${layer.id}:visible`);
            }
            return;
        }
        const move = event.target.closest('[data-composition-move]');
        if (move) moveCompositionLayer(move.dataset.compositionMove, Number(move.dataset.direction));
    });
    document.getElementById('composition-inspector')?.addEventListener('input', event => {
        if (event.target.matches('input, textarea, select')) updateCompositionLayerFromInput(event.target);
    });
    document.getElementById('composition-inspector')?.addEventListener('change', event => {
        if (event.target.matches('input, textarea, select')) updateCompositionLayerFromInput(event.target);
    });
    document.getElementById('composition-keyframe-prev')?.addEventListener('click', () => compositionSeekKeyframe(-1));
    document.getElementById('composition-keyframe-next')?.addEventListener('click', () => compositionSeekKeyframe(1));
    document.getElementById('composition-keyframe-toggle')?.addEventListener('click', compositionToggleCurrentKeyframe);
    document.getElementById('composition-keyframe-easing')?.addEventListener('change', event => compositionSetCurrentKeyframeEasing(event.target.value));
    document.getElementById('composition-keyframe-reset')?.addEventListener('click', compositionClearKeyframes);
    document.getElementById('composition-delete')?.addEventListener('click', () => {
        const layer = getCompositionLayer();
        if (layer) deleteCompositionLayer(layer.id);
    });
    const canvas = document.getElementById('composition-main-canvas');
    canvas?.addEventListener('pointerdown', compositionPointerDown);
    canvas?.addEventListener('pointermove', compositionPointerMove);
    canvas?.addEventListener('pointerup', compositionPointerUp);
    canvas?.addEventListener('pointercancel', compositionPointerUp);
    canvas?.addEventListener('click', event => {
        if (compositionRuntime.suppressMainClick) {
            compositionRuntime.suppressMainClick = false;
            return;
        }
        const point = compositionCanvasPoint(event);
        if (point && compositionHitLayer(point)) return;
        if (!isGenerating && !isBuildingTimeline) playerVideo?.click();
    });
    playerVideo?.addEventListener('timeupdate', () => {
        scheduleCompositionPreview(0);
        if (getCompositionLayer()?.keyframes?.length) {
            renderCompositionInspector();
            renderCompositionMotionUi();
        }
    });
    playerVideo?.addEventListener('seeked', () => {
        scheduleCompositionPreview(0);
        renderCompositionInspector();
        renderCompositionMotionUi();
    });
    playerVideo?.addEventListener('loadeddata', () => scheduleCompositionPreview(0));
    playerVideo?.addEventListener('play', startCompositionPlaybackLoop);
    playerVideo?.addEventListener('pause', stopCompositionPlaybackLoop);
    playerVideo?.addEventListener('ended', stopCompositionPlaybackLoop);
    window.addEventListener('resize', () => scheduleCompositionPreview(90), { passive: true });
    initializeCompositionForProject();
    syncCompositionText();
}

window.BASComposition = Object.freeze({
    version: BAS_COMPOSITION_VERSION,
    initializeCurrentProject: initializeCompositionForProject,
    serialize: compositionSerialize,
    restoreState: compositionRestoreState,
    getAssets: compositionGetAssets,
    getUiState: compositionGetUiState,
    restoreUiState: compositionRestoreUiState,
    hasLayers: compositionHasLayers,
    validate: validateComposition,
    getLayers: getCompositionLayers,
    renderLayers: renderCompositionLayers,
    applyToFrameBlob: applyCompositionToFrameBlob,
    getAdvancedTime: compositionAdvancedTime,
    getDuration: compositionDuration,
    open: compositionOpen,
    render: renderCompositionUi,
    renderPreview: renderCompositionPreview,
    select: selectCompositionLayer,
    syncText: syncCompositionText,
    getKeyframes: id => compositionNormalizeKeyframes(getCompositionLayer(id)),
    getResolvedTransform: (id, time) => {
        const layer = getCompositionLayer(id);
        return layer ? compositionResolvedTransform(layer, time) : null;
    },
    normalizeKeyframes: id => compositionNormalizeKeyframes(getCompositionLayer(id)),
    setKeyframeTime: compositionSetKeyframeTime
});
window.initializeCompositionForProject = initializeCompositionForProject;
window.syncCompositionText = syncCompositionText;
window.addEventListener('DOMContentLoaded', bindComposition);
