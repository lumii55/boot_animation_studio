const BAS_COMPOSITION_VERSION = 1;
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
    previewBaseCanvas: document.createElement('canvas'),
    previewBaseReady: false,
    dragFrame: 0
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
    return {
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
        blob: layer && layer.blob instanceof Blob ? layer.blob : null
    };
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
        const box = await drawCompositionLayer(ctx, layer, width, height, { selected: options.showSelection && layer.id === compositionRuntime.selectedId });
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
            assetType: layer.assetType
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

function compositionOutputSettings(maxDimension = 720) {
    const sourceWidth = Math.max(1, parseInt(document.getElementById('input-largura')?.value, 10) || originalW || currentProject?.width || 1);
    const sourceHeight = Math.max(1, parseInt(document.getElementById('input-altura')?.value, 10) || originalH || currentProject?.height || 1);
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    return {
        sourceWidth,
        sourceHeight,
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale)),
        framing: normalizeFramingMode(document.getElementById('input-enquadramento')?.value || 'cover'),
        focus: getCurrentFramingFocus()
    };
}

function compositionAdvancedLocate(time) {
    const parts = typeof getAdvancedParts === 'function' ? getAdvancedParts() : [];
    let cursor = 0;
    for (const part of parts) {
        const duration = Math.max(0, Number(part.end) - Number(part.start));
        if (time <= cursor + duration + 0.0005) return { part, local: Math.max(0, Math.min(duration, time - cursor)) };
        cursor += duration;
    }
    const last = parts[parts.length - 1];
    return last ? { part: last, local: Math.max(0, Number(last.end) - Number(last.start)) } : null;
}

async function compositionBaseFrame(time, width, height) {
    const framing = normalizeFramingMode(document.getElementById('input-enquadramento')?.value || 'cover');
    const focus = getCurrentFramingFocus();
    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        const located = compositionAdvancedLocate(time);
        if (!located) throw new Error('No Part available');
        const sourceTime = Number(located.part.start) + located.local;
        const sourceId = window.BASSourceLibrary ? BASSourceLibrary.getPartSourceId(located.part) : '';
        return window.BASSourceLibrary
            ? BASSourceLibrary.frameBlob(sourceId, sourceTime, width, height, 'png', framing, focus, 1)
            : getProjectFrameOutputBlob(sourceTime, width, height, 'png', framing, focus, 1);
    }
    if (window.BASMasterSequence && BASMasterSequence.hasMultipleClips()) {
        return BASMasterSequence.frameBlob(time, width, height, 'png', framing, focus, 1);
    }
    if (window.BASSourceLibrary) {
        const primaryId = BASSourceLibrary.getPrimaryId();
        if (primaryId) return BASSourceLibrary.frameBlob(primaryId, time, width, height, 'png', framing, focus, 1);
    }
    return getProjectFrameOutputBlob(time, width, height, 'png', framing, focus, 1);
}

function syncCompositionPreviewGeometry(canvas, shell, settings) {
    if (canvas.width !== settings.width) canvas.width = settings.width;
    if (canvas.height !== settings.height) canvas.height = settings.height;
    shell.style.setProperty('--composition-aspect', `${settings.sourceWidth} / ${settings.sourceHeight}`);
    const previewRatio = settings.sourceWidth / Math.max(1, settings.sourceHeight);
    const previewHeight = Math.min(560, Math.max(280, window.innerHeight * 0.58));
    shell.style.setProperty('--composition-max-width', `${Math.max(120, Math.min(540, previewHeight * previewRatio))}px`);
}

function copyCompositionBaseFrame(ctx, canvas) {
    const base = compositionRuntime.previewBaseCanvas;
    if (!compositionRuntime.previewBaseReady || base.width !== canvas.width || base.height !== canvas.height) return false;
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    return true;
}

async function renderCompositionOverlayFromBase() {
    const canvas = document.getElementById('composition-stage-canvas');
    if (!canvas || !currentProject || !compositionRuntime.previewBaseReady) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!copyCompositionBaseFrame(ctx, canvas)) return;
    compositionRuntime.lastBounds = await renderCompositionLayers(ctx, compositionRuntime.previewTime, canvas.width, canvas.height, { showSelection: true });
}

function scheduleCompositionDragPreview() {
    if (compositionRuntime.dragFrame) return;
    compositionRuntime.dragFrame = requestAnimationFrame(() => {
        compositionRuntime.dragFrame = 0;
        renderCompositionOverlayFromBase();
    });
}

async function renderCompositionPreview() {
    const canvas = document.getElementById('composition-stage-canvas');
    const shell = document.getElementById('composition-stage-shell');
    if (!canvas || !shell || !currentProject || !(currentProject.sourceBlob instanceof Blob)) return;
    const generation = ++compositionRuntime.renderGeneration;
    const settings = compositionOutputSettings();
    syncCompositionPreviewGeometry(canvas, shell, settings);
    const duration = compositionDuration();
    compositionRuntime.previewTime = compositionClamp(compositionRuntime.previewTime, 0, duration, 0);
    const base = compositionRuntime.previewBaseCanvas;
    if (base.width !== canvas.width || base.height !== canvas.height) {
        base.width = canvas.width;
        base.height = canvas.height;
        compositionRuntime.previewBaseReady = false;
    }
    try {
        const blob = await compositionBaseFrame(compositionRuntime.previewTime, canvas.width, canvas.height);
        if (generation !== compositionRuntime.renderGeneration) return;
        const drawable = await blobToDrawable(blob);
        if (generation !== compositionRuntime.renderGeneration) {
            releaseDrawable(drawable);
            return;
        }
        const baseCtx = base.getContext('2d', { alpha: false });
        baseCtx.fillStyle = '#000000';
        baseCtx.fillRect(0, 0, base.width, base.height);
        baseCtx.drawImage(drawable, 0, 0, base.width, base.height);
        releaseDrawable(drawable);
        compositionRuntime.previewBaseReady = true;
        const ctx = canvas.getContext('2d', { alpha: false });
        copyCompositionBaseFrame(ctx, canvas);
        compositionRuntime.lastBounds = await renderCompositionLayers(ctx, compositionRuntime.previewTime, canvas.width, canvas.height, { showSelection: true });
    } catch (error) {
        if (!compositionRuntime.previewBaseReady) {
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.fillStyle = '#05070b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
}

function scheduleCompositionPreview(delay = 45) {
    clearTimeout(compositionRuntime.previewTimer);
    compositionRuntime.previewTimer = setTimeout(() => renderCompositionPreview(), delay);
}

function compositionFormatTime(value) {
    const time = Math.max(0, Number(value) || 0);
    return `${time.toFixed(time < 10 ? 2 : 1)}s`;
}

function syncCompositionPreviewControls() {
    const duration = compositionDuration();
    const slider = document.getElementById('composition-preview-time');
    const value = document.getElementById('composition-preview-time-value');
    if (slider) {
        slider.max = String(Math.max(0.01, duration));
        slider.value = String(compositionClamp(compositionRuntime.previewTime, 0, duration, 0));
    }
    if (value) value.textContent = `${compositionFormatTime(compositionRuntime.previewTime)} / ${compositionFormatTime(duration)}`;
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
    compositionSetField('composition-layer-x', Math.round(layer.x * 100));
    compositionSetField('composition-layer-y', Math.round(layer.y * 100));
    compositionSetField('composition-layer-scale', Math.round(layer.scale * 100));
    compositionSetField('composition-layer-rotation', Math.round(layer.rotation));
    compositionSetField('composition-layer-opacity', Math.round(layer.opacity * 100));
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
    syncCompositionPreviewControls();
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
    else if (id === 'composition-layer-x') layer.x = compositionClamp(input.value, 0, 100, 50) / 100;
    else if (id === 'composition-layer-y') layer.y = compositionClamp(input.value, 0, 100, 50) / 100;
    else if (id === 'composition-layer-scale') layer.scale = compositionClamp(input.value, 10, 500, 100) / 100;
    else if (id === 'composition-layer-rotation') layer.rotation = compositionClamp(input.value, -360, 360, 0);
    else if (id === 'composition-layer-opacity') layer.opacity = compositionClamp(input.value, 0, 100, 100) / 100;
    else if (id === 'composition-text-content') layer.text = input.value;
    else if (id === 'composition-text-font') layer.fontFamily = input.value;
    else if (id === 'composition-text-size') layer.fontSize = compositionClamp(input.value, 1.5, 40, 8) / 100;
    else if (id === 'composition-text-color') layer.color = input.value;
    else if (id === 'composition-text-bold') layer.bold = !!input.checked;
    else if (id === 'composition-text-align') layer.align = input.value;
    else if (id === 'composition-image-width') layer.imageWidth = compositionClamp(input.value, 3, 150, 35) / 100;
    if (layer.end <= layer.start) layer.end = layer.start + 0.001;
    renderCompositionLayerList();
    renderCompositionInspector();
    scheduleCompositionPreview();
    touchComposition('composition', `composition:${layer.id}:${id}`);
}

function compositionCanvasPoint(event) {
    const canvas = document.getElementById('composition-stage-canvas');
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
    const canvas = document.getElementById('composition-stage-canvas');
    const point = compositionCanvasPoint(event);
    if (!canvas || !point) return;
    const hit = compositionHitLayer(point);
    if (hit) {
        compositionRuntime.selectedId = hit;
        renderCompositionUi();
        scheduleCompositionPreview(0);
    }
    const layer = getCompositionLayer();
    if (!layer || hit !== layer.id) return;
    compositionRuntime.pointerId = event.pointerId;
    compositionRuntime.pointerStart = point;
    compositionRuntime.pointerLayerStart = { x: layer.x, y: layer.y };
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
    layer.x = compositionClamp(compositionRuntime.pointerLayerStart.x + dx, 0, 1, 0.5);
    layer.y = compositionClamp(compositionRuntime.pointerLayerStart.y + dy, 0, 1, 0.5);
    renderCompositionInspector();
    scheduleCompositionDragPreview();
    event.preventDefault();
}

function compositionPointerUp(event) {
    if (compositionRuntime.pointerId !== event.pointerId) return;
    const canvas = document.getElementById('composition-stage-canvas');
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
        touchComposition('composition', `composition:${layer.id}:position`);
    }
}

function syncCompositionText() {
    const bindings = {
        'p12-tool-composition': ['contextToolComposition', 'Compose'],
        'composition-kicker': ['compositionKicker', 'COMPOSITION'],
        'composition-title': ['compositionTitle', 'Build on top of the animation'],
        'composition-desc': ['compositionDesc', 'Add text, logos and image layers. Position them visually and choose when each layer appears.'],
        'composition-preview-label': ['compositionPreviewLabel', 'Preview time'],
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
        compositionRuntime.previewBaseReady = false;
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
    document.getElementById('composition-delete')?.addEventListener('click', () => {
        const layer = getCompositionLayer();
        if (layer) deleteCompositionLayer(layer.id);
    });
    const timeSlider = document.getElementById('composition-preview-time');
    timeSlider?.addEventListener('input', () => {
        compositionRuntime.previewTime = compositionClamp(timeSlider.value, 0, compositionDuration(), 0);
        syncCompositionPreviewControls();
        scheduleCompositionPreview(0);
    });
    const canvas = document.getElementById('composition-stage-canvas');
    canvas?.addEventListener('pointerdown', compositionPointerDown);
    canvas?.addEventListener('pointermove', compositionPointerMove);
    canvas?.addEventListener('pointerup', compositionPointerUp);
    canvas?.addEventListener('pointercancel', compositionPointerUp);
    window.addEventListener('resize', () => scheduleCompositionPreview(120), { passive: true });
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
    syncText: syncCompositionText
});
window.initializeCompositionForProject = initializeCompositionForProject;
window.syncCompositionText = syncCompositionText;
window.addEventListener('DOMContentLoaded', bindComposition);
