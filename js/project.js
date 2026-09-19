function createMarkerState() {
    return { m0: null, m1: null, m2: null, m3: null };
}

function createTemporalProject(sourceType, sourceBlob, options = {}) {
    return {
        sourceType,
        sourceMode: 'temporal',
        sourceBlob: sourceBlob || null,
        sourceName: options.sourceName || (sourceBlob && typeof sourceBlob.name === 'string' ? sourceBlob.name : ''),
        previewBlob: options.previewBlob || sourceBlob || null,
        width: options.width || 0,
        height: options.height || 0,
        fps: options.fps || null,
        sourceDuration: options.sourceDuration || 0,
        previewDuration: 0,
        frames: [],
        parts: [],
        descText: null,
        descHasSoundDirectives: false,
        audioRolePartIndexes: { intro: null, loop: null, final: null },
        editorBaseline: null,
        markers: createMarkerState(),
        initialMarkersSource: null,
        initialMarkersApplied: true,
        framingFocus: { x: 0.5, y: 0.5, zoom: 1 },
        advancedParts: [],
        advancedPartsEnabled: false,
        advancedPartsDirty: false,
        advancedPartsBaseline: null,
        advancedExpandedId: null,
        advancedPartCounter: 0,
        sourceLibrary: [],
        sourceLibraryCounter: 0,
        primarySourceId: '',
        masterSequence: [],
        masterSequenceCounter: 0,
        compositionLayers: [],
        compositionCounter: 0
    };
}

function createFrameProject(options) {
    return {
        sourceType: options.sourceType || 'bootanimation',
        sourceMode: 'frames',
        sourceBlob: options.sourceBlob || null,
        sourceName: options.sourceName || (options.sourceBlob && typeof options.sourceBlob.name === 'string' ? options.sourceBlob.name : ''),
        previewBlob: options.previewBlob || null,
        width: options.width || 0,
        height: options.height || 0,
        fps: options.fps || 30,
        sourceDuration: options.sourceDuration || 0,
        previewDuration: 0,
        frames: options.frames || [],
        parts: options.parts || [],
        descText: options.descText || null,
        descHasSoundDirectives: !!options.descHasSoundDirectives,
        audioRolePartIndexes: options.audioRolePartIndexes || { intro: null, loop: null, final: null },
        editorBaseline: options.editorBaseline || null,
        markers: createMarkerState(),
        initialMarkersSource: options.initialMarkersSource || null,
        initialMarkersApplied: false,
        framingFocus: options.framingFocus || { x: 0.5, y: 0.5, zoom: 1 },
        advancedParts: options.advancedParts || [],
        advancedPartsEnabled: !!options.advancedPartsEnabled,
        advancedPartsDirty: !!options.advancedPartsDirty,
        advancedPartsBaseline: options.advancedPartsBaseline || null,
        advancedExpandedId: options.advancedExpandedId || null,
        advancedPartCounter: options.advancedPartCounter || 0,
        sourceLibrary: Array.isArray(options.sourceLibrary) ? options.sourceLibrary : [],
        sourceLibraryCounter: options.sourceLibraryCounter || 0,
        primarySourceId: options.primarySourceId || '',
        masterSequence: Array.isArray(options.masterSequence) ? options.masterSequence : [],
        masterSequenceCounter: options.masterSequenceCounter || 0,
        compositionLayers: Array.isArray(options.compositionLayers) ? options.compositionLayers : [],
        compositionCounter: options.compositionCounter || 0
    };
}

function setCurrentProject(project) {
    const projectChanged = project !== currentProject;
    currentProject = project;
    if (projectChanged) jpegExportQuality = 0.90;
    if (currentProject && !currentProject.framingFocus) currentProject.framingFocus = { x: 0.5, y: 0.5, zoom: 1 };
    if (currentProject && currentProject.framingFocus && !Number.isFinite(Number(currentProject.framingFocus.zoom))) currentProject.framingFocus.zoom = 1;
    if (currentProject && !Array.isArray(currentProject.advancedParts)) currentProject.advancedParts = [];
    if (currentProject && typeof currentProject.advancedPartsEnabled !== 'boolean') currentProject.advancedPartsEnabled = false;
    if (currentProject && typeof currentProject.advancedPartsDirty !== 'boolean') currentProject.advancedPartsDirty = false;
    if (currentProject && !Number.isInteger(currentProject.advancedPartCounter)) currentProject.advancedPartCounter = 0;
    if (currentProject && !Array.isArray(currentProject.sourceLibrary)) currentProject.sourceLibrary = [];
    if (currentProject && !Number.isInteger(currentProject.sourceLibraryCounter)) currentProject.sourceLibraryCounter = 0;
    if (currentProject && typeof currentProject.primarySourceId !== 'string') currentProject.primarySourceId = '';
    if (currentProject && !Array.isArray(currentProject.masterSequence)) currentProject.masterSequence = [];
    if (currentProject && !Number.isInteger(currentProject.masterSequenceCounter)) currentProject.masterSequenceCounter = 0;
    if (currentProject && !Array.isArray(currentProject.compositionLayers)) currentProject.compositionLayers = [];
    if (currentProject && !Number.isInteger(currentProject.compositionCounter)) currentProject.compositionCounter = 0;
    marcadores = currentProject ? currentProject.markers : createMarkerState();
    originalW = currentProject ? currentProject.width || 0 : 0;
    originalH = currentProject ? currentProject.height || 0 : 0;
    if (typeof window.initializeSourceLibraryForProject === 'function') window.initializeSourceLibraryForProject();
    if (typeof window.initializeMasterSequenceForProject === 'function') window.initializeMasterSequenceForProject();
    if (typeof window.initializeCompositionForProject === 'function') window.initializeCompositionForProject();
    if (typeof window.initializeProjectEngineForCurrentProject === 'function') window.initializeProjectEngineForCurrentProject(projectChanged ? 'source' : 'sync');
}

function resetProjectMarkers() {
    const nextMarkers = createMarkerState();
    if (currentProject) currentProject.markers = nextMarkers;
    marcadores = nextMarkers;
    if (typeof notifyAudioMarkersChanged === 'function') notifyAudioMarkersChanged();
}

function setPlayerBlob(blob) {
    if (currentPlayerObjectUrl) {
        URL.revokeObjectURL(currentPlayerObjectUrl);
        currentPlayerObjectUrl = null;
    }
    playerVideo.defaultPlaybackRate = 1;
    playerVideo.playbackRate = 1;
    playerVideo.muted = true;
    if (!blob) {
        playerVideo.removeAttribute('src');
        playerVideo.load();
        return '';
    }
    currentPlayerObjectUrl = URL.createObjectURL(blob);
    playerVideo.preload = 'auto';
    playerVideo.src = currentPlayerObjectUrl;
    playerVideo.load();
    return currentPlayerObjectUrl;
}

function projectUsesFrames() {
    return !!currentProject && currentProject.sourceMode === 'frames' && currentProject.frames.length > 0;
}

function syncCurrentProjectWithPlayer() {
    if (!currentProject) {
        setCurrentProject(createTemporalProject('video', null));
    }

    currentProject.previewDuration = Number.isFinite(playerVideo.duration) ? playerVideo.duration : 0;

    if (currentProject.sourceMode === 'temporal') {
        currentProject.width = playerVideo.videoWidth || currentProject.width;
        currentProject.height = playerVideo.videoHeight || currentProject.height;
        currentProject.sourceDuration = currentProject.previewDuration || currentProject.sourceDuration;
    }

    originalW = currentProject.width || playerVideo.videoWidth || 0;
    originalH = currentProject.height || playerVideo.videoHeight || 0;

    playerVideo.defaultPlaybackRate = 1;
    playerVideo.playbackRate = 1;
    if (currentProject.sourceType === 'gif' && currentProject.sourceMode === 'frames' && currentProject.previewDuration > 0 && currentProject.sourceDuration > 0) {
        const rate = Math.max(0.0625, Math.min(16, currentProject.previewDuration / currentProject.sourceDuration));
        playerVideo.defaultPlaybackRate = rate;
        playerVideo.playbackRate = rate;
    }

    if (currentProject.sourceMode === 'frames' && currentProject.initialMarkersSource && !currentProject.initialMarkersApplied) {
        Object.keys(currentProject.initialMarkersSource).forEach(key => {
            const value = currentProject.initialMarkersSource[key];
            marcadores[key] = value === null ? null : projectTimeToTimelineTime(value);
        });
        currentProject.initialMarkersApplied = true;
        if (typeof notifyAudioMarkersChanged === 'function') notifyAudioMarkersChanged();
    }
    if (typeof window.syncPrimarySourceLibraryMetadata === 'function') window.syncPrimarySourceLibraryMetadata();
    if (window.BASMasterSequence) BASMasterSequence.ensure();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('source-metadata', { baseline: true, emit: true });
}

function timelineTimeToProjectTime(time) {
    if (!currentProject || currentProject.sourceMode !== 'frames') return time;
    const previewDuration = currentProject.previewDuration;
    const sourceDuration = currentProject.sourceDuration;
    if (!previewDuration || !sourceDuration) return time;
    return Math.max(0, Math.min(sourceDuration, time * (sourceDuration / previewDuration)));
}

function projectTimeToTimelineTime(time) {
    if (!currentProject || currentProject.sourceMode !== 'frames') return time;
    const previewDuration = currentProject.previewDuration;
    const sourceDuration = currentProject.sourceDuration;
    if (!previewDuration || !sourceDuration) return time;
    return Math.max(0, Math.min(previewDuration, time * (previewDuration / sourceDuration)));
}

function getProjectSourceMarkers() {
    const master = window.BASMasterSequence && BASMasterSequence.isTimelineActive();
    return {
        m0: marcadores.m0 === null ? null : master ? Math.max(0, Number(marcadores.m0) || 0) : timelineTimeToProjectTime(marcadores.m0),
        m1: marcadores.m1 === null ? null : master ? Math.max(0, Number(marcadores.m1) || 0) : timelineTimeToProjectTime(marcadores.m1),
        m2: marcadores.m2 === null ? null : master ? Math.max(0, Number(marcadores.m2) || 0) : timelineTimeToProjectTime(marcadores.m2),
        m3: marcadores.m3 === null ? null : master ? Math.max(0, Number(marcadores.m3) || 0) : timelineTimeToProjectTime(marcadores.m3)
    };
}


function isImportedBootanimationProject() {
    return !!currentProject && currentProject.sourceType === 'bootanimation' && currentProject.sourceMode === 'frames' && !!currentProject.sourceBlob;
}

function projectMarkersMatchInitial() {
    if (!isImportedBootanimationProject() || !currentProject.initialMarkersSource) return false;
    const current = getProjectSourceMarkers();
    const initial = currentProject.initialMarkersSource;
    const epsilon = 1 / (Math.max(1, currentProject.fps || 30) * 4);
    return ['m0', 'm1', 'm2', 'm3'].every(key => {
        if (current[key] === null || initial[key] === null) return current[key] === initial[key];
        return Math.abs(current[key] - initial[key]) <= epsilon;
    });
}

function getProjectPartFrames(partIndex) {
    if (!projectUsesFrames()) return [];
    return currentProject.frames.filter(frame => frame.partIndex === partIndex);
}

function setProjectEditorBaseline(frameSettings, audioState) {
    if (!currentProject) return;
    currentProject.editorBaseline = {
        frame: {
            width: frameSettings.width,
            height: frameSettings.height,
            fps: frameSettings.fps,
            format: frameSettings.format,
            jpegQuality: 0.90
        },
        audio: audioState
    };
}

function normalizeJpegExportQuality(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.90;
    return Math.max(0.55, Math.min(0.95, numeric));
}

function frameSettingsMatchProjectBaseline(settings) {
    const baseline = currentProject && currentProject.editorBaseline && currentProject.editorBaseline.frame;
    if (!baseline) return false;
    const focus = settings.framingFocus || getCurrentFramingFocus();
    const baselineQuality = normalizeJpegExportQuality(baseline.jpegQuality);
    const activeQuality = normalizeJpegExportQuality(settings.jpegQuality);
    const qualityMatches = settings.format !== 'jpeg' || Math.abs(activeQuality - baselineQuality) < 0.0001;
    return baseline.width === settings.width &&
        baseline.height === settings.height &&
        baseline.fps === settings.fps &&
        baseline.format === settings.format &&
        qualityMatches &&
        normalizeFramingZoomValue(focus.zoom) === 1;
}

function getProjectFrameAtTime(time) {
    if (!projectUsesFrames()) return null;
    const frames = currentProject.frames;
    if (time <= frames[0].startTime) return frames[0];
    if (time >= frames[frames.length - 1].startTime) return frames[frames.length - 1];

    let low = 0;
    let high = frames.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const frame = frames[mid];
        const endTime = frame.startTime + frame.duration;
        if (time < frame.startTime) {
            high = mid - 1;
        } else if (time >= endTime) {
            low = mid + 1;
        } else {
            return frame;
        }
    }

    return frames[Math.max(0, Math.min(frames.length - 1, low))];
}

function inferFrameType(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.png')) return { mimeType: 'image/png', format: 'png' };
    return { mimeType: 'image/jpeg', format: 'jpeg' };
}

function getImportedProjectFormat() {
    if (!projectUsesFrames()) return null;
    const formats = new Set(currentProject.frames.map(frame => frame.format).filter(Boolean));
    if (formats.size === 1) return Array.from(formats)[0];
    return null;
}

async function getProjectFrameBlob(frame) {
    if (!frame) throw new Error('Frame not found');
    if (frame.blob) {
        if (!Number.isFinite(frame.byteSize)) frame.byteSize = frame.blob.size || 0;
        return frame.blob;
    }
    if (!frame.sourceEntry || typeof frame.sourceEntry.async !== 'function') throw new Error('Frame source unavailable');
    const rawBlob = await frame.sourceEntry.async('blob');
    const blob = rawBlob.type === frame.mimeType ? rawBlob : rawBlob.slice(0, rawBlob.size, frame.mimeType);
    frame.byteSize = blob.size || 0;
    return blob;
}

async function cooperativeYield() {
    if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
        await globalThis.scheduler.yield();
        return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function cooperativePaintYield() {
    if (typeof requestAnimationFrame !== 'function' || (typeof document !== 'undefined' && document.hidden)) {
        await new Promise(resolve => setTimeout(resolve, 16));
        return;
    }
    await new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(fallback);
            resolve();
        };
        const fallback = setTimeout(finish, 120);
        requestAnimationFrame(() => setTimeout(finish, 0));
    });
}

function releaseExportCanvas() {
    canvasInvisivel.width = 1;
    canvasInvisivel.height = 1;
}

async function blobToDrawable(blob) {
    if (window.createImageBitmap) {
        try {
            return await createImageBitmap(blob);
        } catch (e) {}
    }

    return await new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(blob);
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Unable to decode frame'));
        };
        image.src = url;
    });
}

function releaseDrawable(drawable) {
    if (drawable && typeof drawable.close === 'function') drawable.close();
}


function normalizeFramingMode(mode) {
    return ['cover', 'contain', 'stretch'].includes(mode) ? mode : 'cover';
}

function normalizeFramingFocusValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.5;
    return Math.max(0, Math.min(1, numeric));
}

function normalizeFramingZoomValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.max(1, Math.min(4, numeric));
}

function getCurrentFramingFocus() {
    const focus = currentProject && currentProject.framingFocus ? currentProject.framingFocus : { x: 0.5, y: 0.5, zoom: 1 };
    return {
        x: normalizeFramingFocusValue(focus.x),
        y: normalizeFramingFocusValue(focus.y),
        zoom: normalizeFramingZoomValue(focus.zoom)
    };
}

function setCurrentFramingFocus(x, y, zoom = null) {
    if (!currentProject) return { x: 0.5, y: 0.5, zoom: 1 };
    const current = getCurrentFramingFocus();
    currentProject.framingFocus = {
        x: normalizeFramingFocusValue(x),
        y: normalizeFramingFocusValue(y),
        zoom: normalizeFramingZoomValue(zoom === null ? current.zoom : zoom)
    };
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('framing');
    return getCurrentFramingFocus();
}

function resetCurrentFramingFocus() {
    return setCurrentFramingFocus(0.5, 0.5, 1);
}

function getFramingDrawRect(sourceWidth, sourceHeight, targetWidth, targetHeight, mode, focusX = 0.5, focusY = 0.5, focusZoom = 1) {
    const sw = Math.max(1, sourceWidth || targetWidth || 1);
    const sh = Math.max(1, sourceHeight || targetHeight || 1);
    const tw = Math.max(1, targetWidth || sw);
    const th = Math.max(1, targetHeight || sh);
    const framing = normalizeFramingMode(mode);

    if (framing === 'stretch') {
        return { sx: 0, sy: 0, sw, sh, dx: 0, dy: 0, dw: tw, dh: th };
    }

    const sourceRatio = sw / sh;
    const targetRatio = tw / th;

    if (framing === 'cover') {
        const fx = normalizeFramingFocusValue(focusX);
        const fy = normalizeFramingFocusValue(focusY);
        const zoom = normalizeFramingZoomValue(focusZoom);
        let baseCropWidth;
        let baseCropHeight;
        if (sourceRatio > targetRatio) {
            baseCropHeight = sh;
            baseCropWidth = sh * targetRatio;
        } else {
            baseCropWidth = sw;
            baseCropHeight = sw / targetRatio;
        }
        const cropWidth = Math.min(sw, baseCropWidth / zoom);
        const cropHeight = Math.min(sh, baseCropHeight / zoom);
        return {
            sx: (sw - cropWidth) * fx,
            sy: (sh - cropHeight) * fy,
            sw: cropWidth,
            sh: cropHeight,
            dx: 0,
            dy: 0,
            dw: tw,
            dh: th
        };
    }

    if (sourceRatio > targetRatio) {
        const drawHeight = tw / sourceRatio;
        return { sx: 0, sy: 0, sw, sh, dx: 0, dy: (th - drawHeight) / 2, dw: tw, dh: drawHeight };
    }
    const drawWidth = th * sourceRatio;
    return { sx: 0, sy: 0, sw, sh, dx: (tw - drawWidth) / 2, dy: 0, dw: drawWidth, dh: th };
}

function getDrawableSize(drawable) {
    return {
        width: drawable.videoWidth || drawable.naturalWidth || drawable.width || 1,
        height: drawable.videoHeight || drawable.naturalHeight || drawable.height || 1
    };
}

function drawFramedDrawable(ctx, drawable, targetWidth, targetHeight, mode, focus = null) {
    const size = getDrawableSize(drawable);
    const activeFocus = focus || getCurrentFramingFocus();
    const rect = getFramingDrawRect(size.width, size.height, targetWidth, targetHeight, mode, activeFocus.x, activeFocus.y, activeFocus.zoom);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(drawable, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
}

function canvasToBlobAsync(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Unable to encode frame'));
        }, mimeType, quality);
    });
}

async function getProjectFrameOutputBlob(sourceTime, width, height, format, framing = 'cover', framingFocus = null, jpegQuality = 0.90) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? normalizeJpegExportQuality(jpegQuality) : undefined;

    if (projectUsesFrames()) {
        const frame = getProjectFrameAtTime(sourceTime);
        if (!frame) throw new Error('Frame not found');
        const frameBlob = await getProjectFrameBlob(frame);

        const activeFocus = framingFocus || getCurrentFramingFocus();
        if (width === currentProject.width && height === currentProject.height && frame.format === format && normalizeFramingZoomValue(activeFocus.zoom) === 1 && (format !== 'jpeg' || Math.abs(quality - 0.90) < 0.0001)) {
            return frameBlob;
        }

        const drawable = await blobToDrawable(frameBlob);
        drawFramedDrawable(contexto, drawable, width, height, framing, framingFocus);
        releaseDrawable(drawable);
        return await canvasToBlobAsync(canvasInvisivel, mimeType, quality);
    }

    if (!window.BASSourceLibrary || typeof BASSourceLibrary.frameBlob !== 'function' || typeof BASSourceLibrary.getPrimaryId !== 'function') throw new Error('Background media decoder unavailable');
    const primarySourceId = BASSourceLibrary.getPrimaryId();
    if (!primarySourceId) throw new Error('Primary source unavailable');
    return await BASSourceLibrary.frameBlob(primarySourceId, sourceTime, width, height, format, framing, framingFocus, jpegQuality);
}
