const sourceLibraryRuntime = {
    initialized: false,
    selectedId: '',
    previewId: '',
    previewUrls: new Map(),
    videoElements: new Map(),
    videoWork: new Map(),
    decoding: new Map(),
    adding: false,
    projectRef: null
};

function sourceLibraryText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}


function sourceLibraryResetRuntimeForProject(project) {
    if (sourceLibraryRuntime.projectRef === project) return;
    sourceLibraryRuntime.previewUrls.forEach(url => URL.revokeObjectURL(url));
    sourceLibraryRuntime.previewUrls.clear();
    sourceLibraryRuntime.videoElements.forEach(record => {
        if (record && record.url) URL.revokeObjectURL(record.url);
        if (record && record.video) {
            record.video.removeAttribute('src');
            record.video.load();
            record.video.remove();
        }
    });
    sourceLibraryRuntime.videoElements.clear();
    sourceLibraryRuntime.videoWork.clear();
    sourceLibraryRuntime.decoding.clear();
    sourceLibraryRuntime.previewId = '';
    sourceLibraryRuntime.selectedId = '';
    sourceLibraryRuntime.projectRef = project || null;
    const modal = document.getElementById('modal-source-library');
    if (modal) modal.style.display = 'none';
}

function sourceLibraryCreateId() {
    if (!currentProject) return `src-${Date.now().toString(36)}`;
    currentProject.sourceLibraryCounter = Math.max(0, Number(currentProject.sourceLibraryCounter) || 0) + 1;
    return `src-${currentProject.sourceLibraryCounter}`;
}

function sourceLibraryKindForPrimary(project = currentProject) {
    if (!project) return 'video';
    if (project.runtimePrimaryKind) return String(project.runtimePrimaryKind);
    if (project.sourceType === 'gif') return 'gif';
    if (project.sourceType === 'bootanimation') return 'bootanimation';
    if (project.sourceType === 'image') return 'image';
    return 'video';
}

function sourceLibraryPrimaryBlob(project = currentProject) {
    if (!project) return null;
    if (project.runtimePrimaryBlob instanceof Blob) return project.runtimePrimaryBlob;
    return project.sourceBlob instanceof Blob ? project.sourceBlob : null;
}

function sourceLibraryCreatePrimary(project = currentProject) {
    if (!project || !(sourceLibraryPrimaryBlob(project) instanceof Blob)) return null;
    if (!Number.isInteger(project.sourceLibraryCounter)) project.sourceLibraryCounter = 0;
    const id = project.primarySourceId || sourceLibraryCreateId();
    project.primarySourceId = id;
    const kind = sourceLibraryKindForPrimary(project);
    const primaryBlob = sourceLibraryPrimaryBlob(project);
    return {
        id,
        kind,
        role: 'visual',
        name: project.runtimePrimaryName || (primaryBlob && primaryBlob.name) || project.sourceName || sourceLibraryText('sourceLibraryPrimaryFallback', 'Primary source'),
        blob: primaryBlob,
        mimeType: primaryBlob.type || '',
        size: primaryBlob.size || 0,
        lastModified: Number(primaryBlob.lastModified) || 0,
        width: Math.max(0, Number(project.runtimePrimaryWidth) || Number(project.width) || 0),
        height: Math.max(0, Number(project.runtimePrimaryHeight) || Number(project.height) || 0),
        duration: Math.max(0, Number(project.runtimePrimaryDuration) || Number(project.sourceDuration) || 0),
        fps: Math.max(0, Number(project.runtimePrimaryFps) || Number(project.fps) || 0),
        isPrimary: true,
        runtimeFrames: project.sourceMode === 'frames' ? project.frames : null,
        previewBlob: project.previewBlob || (kind === 'video' ? primaryBlob : null)
    };
}

function ensureProjectSourceLibrary(project = currentProject) {
    if (!project) return [];
    if (!Array.isArray(project.sourceLibrary)) project.sourceLibrary = [];
    if (!Number.isInteger(project.sourceLibraryCounter)) project.sourceLibraryCounter = 0;
    if (project.sourceBlob instanceof Blob) {
        let primary = project.sourceLibrary.find(source => source && source.isPrimary);
        if (!primary) {
            primary = sourceLibraryCreatePrimary(project);
            if (primary) project.sourceLibrary.unshift(primary);
        } else {
            const primaryBlob = sourceLibraryPrimaryBlob(project);
            project.primarySourceId = primary.id;
            primary.blob = primaryBlob;
            primary.kind = sourceLibraryKindForPrimary(project);
            primary.role = 'visual';
            primary.name = project.runtimePrimaryName || (primaryBlob && primaryBlob.name) || project.sourceName || primary.name;
            primary.mimeType = primaryBlob ? primaryBlob.type || primary.mimeType || '' : primary.mimeType || '';
            primary.size = primaryBlob ? primaryBlob.size || 0 : 0;
            primary.lastModified = primaryBlob ? Number(primaryBlob.lastModified) || primary.lastModified || 0 : primary.lastModified || 0;
            primary.width = Math.max(0, Number(project.runtimePrimaryWidth) || Number(project.width) || primary.width || 0);
            primary.height = Math.max(0, Number(project.runtimePrimaryHeight) || Number(project.height) || primary.height || 0);
            primary.duration = Math.max(0, Number(project.runtimePrimaryDuration) || Number(project.sourceDuration) || primary.duration || 0);
            primary.fps = Math.max(0, Number(project.runtimePrimaryFps) || Number(project.fps) || primary.fps || 0);
            primary.runtimeFrames = project.sourceMode === 'frames' ? project.frames : primary.runtimeFrames || null;
            primary.previewBlob = project.previewBlob || primary.previewBlob || (primary.kind === 'video' ? primaryBlob : null);
        }
    }
    return project.sourceLibrary;
}

function getProjectSourceLibrary() {
    return ensureProjectSourceLibrary();
}

function getPrimarySourceId() {
    ensureProjectSourceLibrary();
    return currentProject && currentProject.primarySourceId ? currentProject.primarySourceId : '';
}

function getProjectSourceById(id) {
    const library = getProjectSourceLibrary();
    if (!id) return library.find(source => source.isPrimary) || null;
    return library.find(source => source.id === id) || null;
}

function getProjectVisualSources() {
    return getProjectSourceLibrary().filter(source => source.role === 'visual');
}

function getProjectAudioSources() {
    return getProjectSourceLibrary().filter(source => source.role === 'audio');
}

function getPartSourceId(part) {
    return part && part.sourceId && getProjectSourceById(part.sourceId) ? part.sourceId : getPrimarySourceId();
}

function getPartSource(part) {
    return getProjectSourceById(getPartSourceId(part));
}

function getSourceDurationById(id) {
    const source = getProjectSourceById(id);
    if (!source) return Math.max(0, Number(currentProject && currentProject.sourceDuration) || 0);
    if (source.isPrimary) return Math.max(0, Number(currentProject && currentProject.sourceDuration) || Number(source.duration) || 0);
    return Math.max(0, Number(source.duration) || 0);
}

function sourceLibraryFormatSeconds(value) {
    const seconds = Math.max(0, Number(value) || 0);
    return `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)}s`;
}

function sourceLibraryFormatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function sourceLibraryKindLabel(source) {
    if (!source) return '';
    if (source.kind === 'gif') return 'GIF';
    if (source.kind === 'image') return sourceLibraryText('sourceLibraryImage', 'Image');
    if (source.kind === 'audio') return sourceLibraryText('sourceLibraryAudio', 'Audio');
    if (source.kind === 'bootanimation') return 'bootanimation.zip';
    return sourceLibraryText('sourceLibraryVideo', 'Video');
}

function sourceLibraryMeta(source) {
    const values = [sourceLibraryKindLabel(source)];
    if (source.role === 'visual' && source.width && source.height) values.push(`${source.width} × ${source.height}`);
    if (source.role === 'visual' && source.duration) values.push(sourceLibraryFormatSeconds(source.duration));
    if (source.size) values.push(sourceLibraryFormatBytes(source.size));
    return values.join(' · ');
}

function sourceLibraryEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function sourceLibrarySerialize() {
    if (!currentProject) return { primarySourceId: '', counter: 0, sources: [] };
    const library = ensureProjectSourceLibrary();
    return {
        primarySourceId: currentProject.primarySourceId || '',
        counter: Math.max(0, Number(currentProject.sourceLibraryCounter) || 0),
        sources: library.filter(source => source.isPrimary || !source.archiveDerived).map(source => ({
            id: String(source.id || ''),
            kind: String(source.kind || 'video'),
            role: source.role === 'audio' ? 'audio' : 'visual',
            name: String(source.name || ''),
            mimeType: String(source.mimeType || ''),
            size: Math.max(0, Number(source.size) || 0),
            lastModified: Math.max(0, Number(source.lastModified) || 0),
            width: Math.max(0, Number(source.width) || 0),
            height: Math.max(0, Number(source.height) || 0),
            duration: Math.max(0, Number(source.duration) || 0),
            fps: Math.max(0, Number(source.fps) || 0),
            isPrimary: !!source.isPrimary
        }))
    };
}

function sourceLibraryAssetInventory() {
    if (!currentProject) return [];
    return ensureProjectSourceLibrary().filter(source => !source.isPrimary && !source.archiveDerived && source.blob instanceof Blob).map(source => ({
        key: `source-library:${source.id}`,
        kind: source.role === 'audio' ? 'library-audio' : 'library-source',
        name: source.name || '',
        blob: source.blob,
        transient: false,
        size: source.blob.size || 0,
        type: source.blob.type || source.mimeType || '',
        lastModified: Number(source.blob.lastModified) || source.lastModified || 0
    }));
}

function sourceLibraryRestoreState(state, assetMap = new Map()) {
    if (!currentProject) return false;
    const archiveDerived = new Map((Array.isArray(currentProject.sourceLibrary) ? currentProject.sourceLibrary : [])
        .filter(source => source && !source.isPrimary && source.archiveDerived && source.blob instanceof Blob)
        .map(source => [String(source.id || ''), source]));
    if (Array.isArray(currentProject.sourceLibrary)) currentProject.sourceLibrary.forEach(source => {
        if (source && !source.isPrimary && !source.archiveDerived) sourceLibraryCleanupSource(source);
    });
    const saved = state && Array.isArray(state.sources) ? state.sources : [];
    const primaryDescriptor = saved.find(source => source.isPrimary) || null;
    const primary = sourceLibraryCreatePrimary(currentProject);
    if (primaryDescriptor && primary) {
        primary.id = String(primaryDescriptor.id || primary.id);
        primary.name = String(primaryDescriptor.name || primary.name);
        primary.width = Math.max(0, Number(primaryDescriptor.width) || primary.width || 0);
        primary.height = Math.max(0, Number(primaryDescriptor.height) || primary.height || 0);
        primary.duration = Math.max(0, Number(primaryDescriptor.duration) || primary.duration || 0);
        primary.fps = Math.max(0, Number(primaryDescriptor.fps) || primary.fps || 0);
    }
    const restored = primary ? [primary] : [];
    saved.filter(source => !source.isPrimary).forEach(descriptor => {
        const asset = assetMap instanceof Map ? assetMap.get(`source-library:${descriptor.id}`) : null;
        const derived = archiveDerived.get(String(descriptor.id || ''));
        const blob = asset && asset.blob instanceof Blob ? asset.blob : derived && derived.blob instanceof Blob ? derived.blob : null;
        if (!(blob instanceof Blob)) return;
        restored.push({
            id: String(descriptor.id || ''),
            kind: String(descriptor.kind || (descriptor.role === 'audio' ? 'audio' : 'video')),
            role: descriptor.role === 'audio' ? 'audio' : 'visual',
            name: String(descriptor.name || (asset && asset.name) || (derived && derived.name) || ''),
            blob,
            mimeType: String(descriptor.mimeType || (asset && asset.type) || blob.type || ''),
            size: Math.max(0, Number(descriptor.size) || blob.size || 0),
            lastModified: Math.max(0, Number(descriptor.lastModified) || Number(asset && asset.lastModified) || Number(derived && derived.lastModified) || 0),
            width: Math.max(0, Number(descriptor.width) || Number(derived && derived.width) || 0),
            height: Math.max(0, Number(descriptor.height) || Number(derived && derived.height) || 0),
            duration: Math.max(0, Number(descriptor.duration) || Number(derived && derived.duration) || 0),
            fps: Math.max(0, Number(descriptor.fps) || Number(derived && derived.fps) || 0),
            isPrimary: false,
            archiveDerived: !!derived,
            archiveEntryName: derived && derived.archiveEntryName ? String(derived.archiveEntryName) : '',
            runtimeFrames: null,
            previewBlob: descriptor.kind === 'video' ? blob : null
        });
    });
    archiveDerived.forEach(source => {
        if (!restored.some(item => item.id === source.id)) restored.push(source);
    });
    currentProject.sourceLibrary = restored;
    currentProject.primarySourceId = primary ? primary.id : String(state && state.primarySourceId || '');
    currentProject.sourceLibraryCounter = Math.max(Number(state && state.counter) || 0, restored.reduce((max, source) => {
        const match = /^src-(\d+)$/.exec(source.id);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0));
    renderSourceLibrary();
    return true;
}

async function sourceLibraryLoadVideoMetadata(blob) {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    try {
        await new Promise((resolve, reject) => {
            let settled = false;
            let timer = 0;
            const cleanup = () => {
                clearTimeout(timer);
                video.removeEventListener('loadedmetadata', done);
                video.removeEventListener('error', fail);
            };
            const done = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.')));
            };
            video.addEventListener('loadedmetadata', done);
            video.addEventListener('error', fail);
            timer = setTimeout(fail, 6000);
            video.src = url;
        });
        return {
            width: video.videoWidth || 0,
            height: video.videoHeight || 0,
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            fps: 0
        };
    } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
    }
}

async function sourceLibraryLoadImageMetadata(blob) {
    if (window.createImageBitmap) {
        let abandoned = false;
        try {
            const bitmapPromise = createImageBitmap(blob).then(bitmap => {
                if (abandoned) {
                    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
                    throw new Error('Image decode timed out');
                }
                return bitmap;
            });
            const bitmap = await Promise.race([
                bitmapPromise,
                new Promise((_, reject) => setTimeout(() => {
                    abandoned = true;
                    reject(new Error('Image decode timed out'));
                }, 5000))
            ]);
            const result = { width: bitmap.width || 0, height: bitmap.height || 0 };
            if (typeof bitmap.close === 'function') bitmap.close();
            return result;
        } catch (error) {
            abandoned = true;
        }
    }
    return await new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(blob);
        let settled = false;
        let timer = 0;
        const cleanup = () => {
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            URL.revokeObjectURL(url);
        };
        const finish = () => {
            if (settled) return;
            settled = true;
            const result = { width: image.naturalWidth || 0, height: image.naturalHeight || 0 };
            cleanup();
            resolve(result);
        };
        const fail = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.')));
        };
        image.onload = finish;
        image.onerror = fail;
        timer = setTimeout(fail, 5000);
        image.src = url;
    });
}

function sourceLibraryDetectFile(file) {
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    if (type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|flac)$/i.test(name)) return { kind: 'audio', role: 'audio' };
    if (type === 'image/gif' || name.endsWith('.gif')) return { kind: 'gif', role: 'visual' };
    if (type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) return { kind: 'image', role: 'visual' };
    if (type.startsWith('video/') || /\.(mp4|webm|m4v|mov|ogv)$/i.test(name)) return { kind: 'video', role: 'visual' };
    return null;
}

async function sourceLibraryBuildFramePreview(source, frames) {
    const previewProject = {
        width: source.width,
        height: source.height,
        fps: source.fps || 30,
        sourceDuration: source.duration,
        frames
    };
    const timingScale = typeof calcularEscalaTempoPreview === 'function' ? calcularEscalaTempoPreview(previewProject, 6) : 1;
    const blob = await createFrameProjectPreview(previewProject, frames.map(frame => frame.blob), { maxBuildSeconds: 6 });
    source.previewTimingScale = timingScale;
    return blob;
}

async function sourceLibraryCreateSource(file) {
    const detected = sourceLibraryDetectFile(file);
    if (!detected) throw new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.'));
    const source = {
        id: sourceLibraryCreateId(),
        kind: detected.kind,
        role: detected.role,
        name: file.name || `${detected.kind}-${Date.now()}`,
        blob: file,
        mimeType: file.type || '',
        size: file.size || 0,
        lastModified: Number(file.lastModified) || 0,
        width: 0,
        height: 0,
        duration: 0,
        fps: 0,
        isPrimary: false,
        runtimeFrames: null,
        previewBlob: detected.kind === 'video' ? file : null
    };
    if (source.kind === 'video') {
        Object.assign(source, await sourceLibraryLoadVideoMetadata(file));
    } else if (source.kind === 'image') {
        const meta = await sourceLibraryLoadImageMetadata(file);
        source.width = meta.width;
        source.height = meta.height;
        source.duration = 1;
        source.fps = 30;
        source.runtimeFrames = [{ blob: file, byteSize: file.size || 0, mimeType: file.type || 'image/png', format: /jpe?g/i.test(file.type || file.name || '') ? 'jpeg' : 'png', sourceName: file.name || 'image', partIndex: 0, startTime: 0, duration: 1 }];
        source.previewBlob = await sourceLibraryBuildFramePreview(source, source.runtimeFrames);
    } else if (source.kind === 'gif') {
        const t = traducoes[idiomaAtual] || traducoes.en;
        const data = await decodificarGifEmFrames(file, t);
        source.width = data.width;
        source.height = data.height;
        source.duration = data.duration;
        source.fps = data.fps;
        source.runtimeFrames = data.frames;
        source.previewBlob = await sourceLibraryBuildFramePreview(source, data.frames);
    }
    return source;
}

async function addFilesToSourceLibrary(files) {
    if (!currentProject || sourceLibraryRuntime.adding) return [];
    const queue = Array.from(files || []).filter(Boolean);
    if (!queue.length) return [];
    sourceLibraryRuntime.adding = true;
    const overlay = document.getElementById('loading-overlay');
    const loading = document.getElementById('txt-loading-timeline');
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('source');
    if (overlay) overlay.style.display = 'flex';
    const added = [];
    const failures = [];
    try {
        for (let index = 0; index < queue.length; index++) {
            if (loading) loading.textContent = sourceLibraryText('sourceLibraryAnalyzing', 'Analyzing source {current}/{total}...').replace('{current}', String(index + 1)).replace('{total}', String(queue.length));
            try {
                const source = await sourceLibraryCreateSource(queue[index]);
                ensureProjectSourceLibrary().push(source);
                added.push(source);
            } catch (error) {
                failures.push(error);
            }
            await cooperativeYield();
        }
        if (added.length) {
            if (window.BASMasterSequence) added.filter(source => source.role === 'visual').forEach(source => BASMasterSequence.appendSource(source.id, { silent: true }));
            renderSourceLibrary();
            if (window.BASMasterSequence) BASMasterSequence.refreshTimeline({ seekToStart: false });
            if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('source-library', { changeKey: 'source-library', immediate: true });
            if (typeof showToast === 'function') showToast(sourceLibraryText('sourceLibraryAdded', '{count} source(s) added').replace('{count}', String(added.length)), 'success');
        }
        if (failures.length && typeof showToast === 'function') showToast(failures[0].message || sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.'), 'error');
        return added;
    } finally {
        sourceLibraryRuntime.adding = false;
        if (overlay) overlay.style.display = 'none';
    }
}


async function openImageSourceInEditor(file, options = {}) {
    if (!file) return;
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('source');
    const overlay = document.getElementById('loading-overlay');
    const loading = document.getElementById('txt-loading-timeline');
    if (overlay) overlay.style.display = 'flex';
    if (loading) loading.textContent = sourceLibraryText('sourceLibraryPreparingImage', 'Preparing image source...');
    try {
        const meta = await sourceLibraryLoadImageMetadata(file);
        const frame = {
            blob: file,
            byteSize: file.size || 0,
            mimeType: file.type || 'image/png',
            format: /jpe?g/i.test(file.type || file.name || '') ? 'jpeg' : 'png',
            sourceName: file.name || 'image',
            partIndex: 0,
            startTime: 0,
            duration: 1
        };
        const project = createFrameProject({
            sourceType: 'image',
            sourceBlob: file,
            sourceName: options.sourceName || file.name || '',
            width: meta.width,
            height: meta.height,
            fps: 30,
            sourceDuration: 1,
            frames: [frame],
            initialMarkersSource: { m0: 0, m1: 0, m2: 1, m3: 1 },
            parts: [{
                index: 0,
                type: 'p',
                repeat: 1,
                pause: 0,
                name: 'image',
                rawLine: 'p 1 0 image',
                startFrame: 0,
                endFrame: 0,
                audioBlob: null
            }]
        });
        project.previewBlob = await createFrameProjectPreview(project, [file]);
        document.getElementById('dicas-iniciais').style.display = 'none';
        resetAudioState();
        setCurrentProject(project);
        document.getElementById('input-fps').value = 30;
        setPlayerBlob(project.previewBlob);
        document.getElementById('video-container').style.display = 'block';
        document.getElementById('timeline-wrapper').style.display = 'block';
        document.getElementById('grid-marcadores').style.display = 'grid';
        document.getElementById('configuracoes').style.display = 'grid';
        document.getElementById('botoes-exportacao').style.display = 'none';
        document.getElementById('btn-ver-preview').style.display = 'none';
        document.getElementById('txt-hint-tooltip').style.display = 'block';
        atualizarBotoesELinhas();
    } catch (error) {
        console.error(error);
        if (typeof showToast === 'function') showToast(error.message || sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.'), 'error');
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}

function sourceLibraryCleanupSource(source) {
    if (!source) return;
    const previewUrl = sourceLibraryRuntime.previewUrls.get(source.id);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    sourceLibraryRuntime.previewUrls.delete(source.id);
    const cachedVideo = sourceLibraryRuntime.videoElements.get(source.id);
    if (cachedVideo) sourceLibraryDisposeVideoRecord(source.id, cachedVideo);
    sourceLibraryRuntime.videoWork.delete(source.id);
}

async function removeSourceFromLibrary(id) {
    if (!currentProject) return false;
    const source = getProjectSourceById(id);
    if (!source || source.isPrimary) return false;
    const accepted = typeof askConfirmation === 'function'
        ? await askConfirmation(sourceLibraryText('sourceLibraryRemoveConfirm', 'Remove this source from the project?'), true)
        : globalThis.confirm(sourceLibraryText('sourceLibraryRemoveConfirm', 'Remove this source from the project?'));
    if (!accepted) return false;
    sourceLibraryCleanupSource(source);
    currentProject.sourceLibrary = getProjectSourceLibrary().filter(item => item.id !== id);
    if (window.BASMasterSequence && source.role === 'visual') BASMasterSequence.removeSource(id, { silent: true });
    const primaryId = getPrimarySourceId();
    let affectedPart = false;
    if (Array.isArray(currentProject.advancedParts)) {
        currentProject.advancedParts.forEach(part => {
            if (part.sourceId === id) {
                part.sourceId = primaryId;
                affectedPart = true;
                if (typeof normalizeAdvancedPartRange === 'function') normalizeAdvancedPartRange(part);
            }
            if (part.audio && part.audio.sourceLibraryId === id) {
                part.audio.mode = 'none';
                part.audio.source = null;
                part.audio.sourceName = '';
                part.audio.sourceKind = 'none';
                part.audio.sourceLibraryId = '';
                affectedPart = true;
            }
        });
    }
    if (affectedPart && typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
    else if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('source-library', { changeKey: 'source-library', immediate: true });
    renderSourceLibrary();
    if (window.BASMasterSequence) BASMasterSequence.refreshTimeline({ seekToStart: source.role === 'visual' });
    if (typeof renderAdvancedPartsEditor === 'function' && typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) renderAdvancedPartsEditor();
    return true;
}

async function ensureSourceFrames(source) {
    if (!source || source.role !== 'visual') return [];
    if (source.isPrimary && currentProject && currentProject.sourceMode === 'frames') return currentProject.frames;
    if (Array.isArray(source.runtimeFrames) && source.runtimeFrames.length) return source.runtimeFrames;
    if (source.kind === 'image') {
        source.runtimeFrames = [{ blob: source.blob, byteSize: source.blob.size || 0, mimeType: source.blob.type || source.mimeType || 'image/png', format: /jpe?g/i.test(source.blob.type || source.name || '') ? 'jpeg' : 'png', sourceName: source.name || 'image', partIndex: 0, startTime: 0, duration: Math.max(0.001, source.duration || 1) }];
        return source.runtimeFrames;
    }
    if (source.kind !== 'gif') return [];
    if (sourceLibraryRuntime.decoding.has(source.id)) return await sourceLibraryRuntime.decoding.get(source.id);
    const promise = (async () => {
        const t = traducoes[idiomaAtual] || traducoes.en;
        const data = await decodificarGifEmFrames(source.blob, t);
        source.width = data.width;
        source.height = data.height;
        source.duration = data.duration;
        source.fps = data.fps;
        source.runtimeFrames = data.frames;
        return data.frames;
    })();
    sourceLibraryRuntime.decoding.set(source.id, promise);
    try {
        return await promise;
    } finally {
        sourceLibraryRuntime.decoding.delete(source.id);
    }
}

async function ensureSourcePreviewBlob(source) {
    if (!source) return null;
    if (source.isPrimary && currentProject) {
        const primaryPreview = currentProject.previewBlob instanceof Blob ? currentProject.previewBlob : currentProject.sourceBlob instanceof Blob ? currentProject.sourceBlob : null;
        if (primaryPreview) {
            source.previewBlob = primaryPreview;
            return primaryPreview;
        }
    }
    if (source.previewBlob instanceof Blob) return source.previewBlob;
    if (source.kind === 'video') {
        source.previewBlob = source.blob;
        return source.previewBlob;
    }
    if (source.kind === 'gif' || source.kind === 'image') {
        const frames = await ensureSourceFrames(source);
        if (!frames.length) return null;
        source.previewBlob = await sourceLibraryBuildFramePreview(source, frames);
        return source.previewBlob;
    }
    return null;
}

function sourceLibraryGetPreviewUrl(source, blob) {
    const existing = sourceLibraryRuntime.previewUrls.get(source.id);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    sourceLibraryRuntime.previewUrls.set(source.id, url);
    return url;
}

function sourceLibraryVideoDurationCandidate(element) {
    const values = [];
    const duration = Number(element && element.duration);
    if (Number.isFinite(duration) && duration > 0) values.push(duration);
    ['seekable', 'buffered'].forEach(key => {
        const ranges = element && element[key];
        if (!ranges || ranges.length <= 0) return;
        try {
            const end = Number(ranges.end(ranges.length - 1));
            if (Number.isFinite(end) && end > 0) values.push(end);
        } catch (_) {}
    });
    return values.length ? Math.max(...values) : 0;
}

function sourceLibraryReconcileVideoDuration(source, element) {
    if (!source || source.kind !== 'video') return false;
    const observed = sourceLibraryVideoDurationCandidate(element);
    const previous = Math.max(0, Number(source.duration) || 0);
    const fps = Math.max(1, Number(source.fps) || Number(currentProject && currentProject.fps) || 30);
    const tolerance = Math.max(0.02, 2 / fps);
    if (!(observed > previous + tolerance)) return false;
    source.duration = observed;
    if (!currentProject) return true;
    if (source.isPrimary) {
        currentProject.runtimePrimaryDuration = observed;
        if (currentProject.sourceMode === 'video-sequence') currentProject.sourceDuration = observed;
    }
    if (Array.isArray(currentProject.parts)) {
        currentProject.parts.forEach(part => {
            if (String(part && part.sourceId || '') !== String(source.id || '')) return;
            const duration = Math.max(0, Number(part.duration) || 0);
            if (Math.abs(duration - previous) <= tolerance || duration <= previous + tolerance) part.duration = observed;
        });
    }
    const updatePartRange = part => {
        if (!part || String(part.sourceId || '') !== String(source.id || '')) return;
        const start = Math.max(0, Number(part.start) || 0);
        const end = Math.max(0, Number(part.end) || 0);
        if (part.followSourceEnd || (start <= tolerance && Math.abs(end - previous) <= tolerance)) part.end = observed;
    };
    if (Array.isArray(currentProject.advancedParts)) currentProject.advancedParts.forEach(updatePartRange);
    if (!currentProject.advancedPartsDirty && Array.isArray(currentProject.advancedPartsBaseline)) currentProject.advancedPartsBaseline.forEach(updatePartRange);
    if (Array.isArray(currentProject.masterSequence)) {
        currentProject.masterSequence.forEach(clip => {
            if (!clip || String(clip.sourceId || '') !== String(source.id || '')) return;
            const clipOut = Math.max(0, Number(clip.out) || 0);
            if (Math.abs(clipOut - previous) <= tolerance) clip.out = observed;
        });
    }
    if (currentProject.sourceMode === 'video-sequence' && typeof videoBootAnimationMarkers === 'function' && Array.isArray(currentProject.parts)) {
        currentProject.markers = videoBootAnimationMarkers(currentProject.parts);
        if (!currentProject.advancedPartsDirty) currentProject.initialMarkersSource = { ...currentProject.markers };
    }
    return true;
}

async function sourceLibraryStabilizeVideoDuration(source, element) {
    if (!source || !source.archiveDerived || source.kind !== 'video' || !element) return false;
    let changed = sourceLibraryReconcileVideoDuration(source, element);
    await new Promise(resolve => {
        let finished = false;
        let settleTimer = 0;
        let hardTimer = 0;
        const events = ['durationchange', 'loadeddata', 'canplay', 'canplaythrough', 'progress'];
        const cleanup = () => {
            clearTimeout(settleTimer);
            clearTimeout(hardTimer);
            events.forEach(event => element.removeEventListener(event, update));
        };
        const done = () => {
            if (finished) return;
            finished = true;
            changed = sourceLibraryReconcileVideoDuration(source, element) || changed;
            cleanup();
            resolve();
        };
        const armSettle = () => {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(done, 250);
        };
        const update = () => {
            changed = sourceLibraryReconcileVideoDuration(source, element) || changed;
            if (Number(element.readyState) >= 2) armSettle();
        };
        events.forEach(event => element.addEventListener(event, update));
        hardTimer = setTimeout(done, 1500);
        if (Number(element.readyState) >= 2) armSettle();
    });
    if (changed) {
        if (typeof renderSourceLibrary === 'function') renderSourceLibrary();
        if (typeof syncAdvancedPartsUi === 'function') syncAdvancedPartsUi();
        if (window.BASMasterSequence && typeof BASMasterSequence.refreshTimeline === 'function') BASMasterSequence.refreshTimeline({ seekToStart: false });
    }
    return changed;
}

async function sourceLibrarySetVideoElementSource(element, sourceId) {
    const source = getProjectSourceById(sourceId);
    if (!element || !source || source.role !== 'visual') return null;
    element.muted = true;
    const previewBlob = await ensureSourcePreviewBlob(source);
    if (!(previewBlob instanceof Blob)) return null;
    const src = sourceLibraryGetPreviewUrl(source, previewBlob);
    const sameSource = element.src === src && !element.error;
    const frameReady = () => (Number(element.readyState) || 0) >= 2 && (Number(element.videoWidth) || 0) > 0 && (Number(element.videoHeight) || 0) > 0 && !element.error;
    if (!sameSource || !frameReady()) {
        element.pause();
        if (!sameSource) element.src = src;
        await new Promise((resolve, reject) => {
            if (frameReady()) {
                resolve();
                return;
            }
            let done = false;
            let timer = 0;
            const cleanup = () => {
                clearTimeout(timer);
                element.removeEventListener('loadeddata', ready);
                element.removeEventListener('canplay', ready);
                element.removeEventListener('error', fail);
            };
            const ready = () => {
                if (done || !frameReady()) return;
                done = true;
                cleanup();
                resolve();
            };
            const fail = () => {
                if (done) return;
                done = true;
                cleanup();
                reject(new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.')));
            };
            element.addEventListener('loadeddata', ready);
            element.addEventListener('canplay', ready);
            element.addEventListener('error', fail);
            timer = setTimeout(fail, 6000);
            element.load();
        });
    }
    if (source.archiveDerived && source.kind === 'video') await sourceLibraryStabilizeVideoDuration(source, element);
    return source;
}

function sourceTimeToPreviewTime(sourceId, sourceTime, element) {
    const source = getProjectSourceById(sourceId);
    if (!source) return Math.max(0, Number(sourceTime) || 0);
    const duration = Math.max(0, Number(source.duration) || 0);
    const previewDuration = element && Number.isFinite(element.duration) ? element.duration : duration;
    if (!duration || !previewDuration) return Math.max(0, Number(sourceTime) || 0);
    return Math.max(0, Math.min(previewDuration, Number(sourceTime) * (previewDuration / duration)));
}

function previewTimeToSourceTime(sourceId, previewTime, element) {
    const source = getProjectSourceById(sourceId);
    if (!source) return Math.max(0, Number(previewTime) || 0);
    const duration = Math.max(0, Number(source.duration) || 0);
    const previewDuration = element && Number.isFinite(element.duration) ? element.duration : duration;
    if (!duration || !previewDuration) return Math.max(0, Number(previewTime) || 0);
    return Math.max(0, Math.min(duration, Number(previewTime) * (duration / previewDuration)));
}

function sourceLibraryDisposeVideoRecord(sourceId, record = null) {
    const current = sourceLibraryRuntime.videoElements.get(sourceId);
    const target = record || current;
    if (!target) return;
    if (current === target) sourceLibraryRuntime.videoElements.delete(sourceId);
    if (target.video) {
        try { target.video.pause(); } catch (error) {}
        target.video.removeAttribute('src');
        try { target.video.load(); } catch (error) {}
        target.video.remove();
    }
    if (target.url) URL.revokeObjectURL(target.url);
}

function sourceLibraryReleaseVideoDecoder(sourceId) {
    const id = String(sourceId || '');
    if (!id || sourceLibraryRuntime.videoWork.has(id)) return false;
    const record = sourceLibraryRuntime.videoElements.get(id);
    if (!record) return false;
    sourceLibraryDisposeVideoRecord(id, record);
    return true;
}

function sourceLibraryReleaseIdleVideoDecoders(exceptIds = []) {
    const keep = new Set((Array.isArray(exceptIds) ? exceptIds : [exceptIds]).map(value => String(value || '')).filter(Boolean));
    let released = 0;
    for (const [sourceId, record] of Array.from(sourceLibraryRuntime.videoElements.entries())) {
        if (keep.has(String(sourceId)) || sourceLibraryRuntime.videoWork.has(sourceId)) continue;
        sourceLibraryDisposeVideoRecord(sourceId, record);
        released += 1;
    }
    return released;
}

async function sourceLibraryCreateVideoRecord(source) {
    if (!source || !(source.blob instanceof Blob)) throw new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.'));
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.tabIndex = -1;
    video.setAttribute('aria-hidden', 'true');
    video.className = 'bas-work-decoder';
    (document.body || document.documentElement).appendChild(video);
    const url = URL.createObjectURL(source.blob);
    const record = { video, url, blob: source.blob };
    sourceLibraryRuntime.videoElements.set(source.id, record);
    try {
        await new Promise((resolve, reject) => {
            let settled = false;
            let timer = 0;
            const cleanup = () => {
                clearTimeout(timer);
                video.removeEventListener('loadedmetadata', done);
                video.removeEventListener('loadeddata', done);
                video.removeEventListener('error', fail);
            };
            const done = () => {
                if (settled) return;
                if ((Number(video.readyState) || 0) < 1) return;
                settled = true;
                cleanup();
                resolve();
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.')));
            };
            video.addEventListener('loadedmetadata', done);
            video.addEventListener('loadeddata', done);
            video.addEventListener('error', fail);
            timer = setTimeout(fail, 6000);
            video.src = url;
            video.load();
            if ((Number(video.readyState) || 0) >= 1) done();
        });
    } catch (error) {
        sourceLibraryDisposeVideoRecord(source.id, record);
        throw error;
    }
    return record;
}

async function sourceLibraryEnsureVideoRecord(source, forceRecreate = false) {
    const existing = sourceLibraryRuntime.videoElements.get(source.id);
    if (existing && !forceRecreate && existing.blob === source.blob && existing.video && existing.video.getAttribute('src') && !existing.video.error) return existing;
    if (existing) sourceLibraryDisposeVideoRecord(source.id, existing);
    return await sourceLibraryCreateVideoRecord(source);
}

async function sourceLibraryEnsureVideoElement(source) {
    const record = await sourceLibraryEnsureVideoRecord(source);
    return record.video;
}

async function sourceLibrarySeekVideo(video, time) {
    try {
        if (!window.BASMediaSeek) throw new Error('Media seek helper unavailable');
        await BASMediaSeek.seek(video, time, { timeout: 1400, retries: 1, tolerance: 0.003, requireData: true });
        if (typeof BASMediaSeek.isFrameReady === 'function' && !BASMediaSeek.isFrameReady(video)) throw new Error('Media frame unavailable');
    } catch (error) {
        throw new Error(sourceLibraryText('sourceLibrarySeekError', 'Could not seek this source.'));
    }
}

async function sourceLibraryWithVideoWork(source, callback) {
    const previous = sourceLibraryRuntime.videoWork.get(source.id) || Promise.resolve();
    const task = previous.catch(() => {}).then(callback);
    sourceLibraryRuntime.videoWork.set(source.id, task);
    try {
        return await task;
    } finally {
        if (sourceLibraryRuntime.videoWork.get(source.id) === task) sourceLibraryRuntime.videoWork.delete(source.id);
    }
}

async function sourceLibraryVideoFrameBlob(source, sourceTime, width, height, mimeType, quality, framing, framingFocus) {
    return await sourceLibraryWithVideoWork(source, async () => {
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            let record = null;
            try {
                record = await sourceLibraryEnsureVideoRecord(source, attempt > 0);
                await sourceLibrarySeekVideo(record.video, sourceTime);
                if (!(record.video.videoWidth > 0) || !(record.video.videoHeight > 0) || (Number(record.video.readyState) || 0) < 2) throw new Error('Media frame unavailable');
                drawFramedDrawable(contexto, record.video, width, height, framing, framingFocus);
                return await canvasToBlobAsync(canvasInvisivel, mimeType, quality);
            } catch (error) {
                lastError = error;
                if (record) sourceLibraryDisposeVideoRecord(source.id, record);
            }
        }
        throw lastError || new Error(sourceLibraryText('sourceLibrarySeekError', 'Could not seek this source.'));
    });
}

function sourceLibraryFrameAtTime(frames, time) {
    if (!frames || !frames.length) return null;
    if (time <= frames[0].startTime) return frames[0];
    const last = frames[frames.length - 1];
    if (time >= last.startTime) return last;
    let low = 0;
    let high = frames.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const frame = frames[mid];
        const end = frame.startTime + frame.duration;
        if (time < frame.startTime) high = mid - 1;
        else if (time >= end) low = mid + 1;
        else return frame;
    }
    return frames[Math.max(0, Math.min(frames.length - 1, low))];
}

async function getSourceFrameOutputBlob(sourceId, sourceTime, width, height, format, framing = 'cover', framingFocus = null, jpegQuality = 0.9) {
    canvasInvisivel.width = Math.max(1, Math.round(Number(width) || 1));
    canvasInvisivel.height = Math.max(1, Math.round(Number(height) || 1));
    const source = getProjectSourceById(sourceId);
    if (!source) return await getProjectFrameOutputBlob(sourceTime, width, height, format, framing, framingFocus, jpegQuality);
    if (source.isPrimary && currentProject && currentProject.sourceMode === 'frames') return await getProjectFrameOutputBlob(sourceTime, width, height, format, framing, framingFocus, jpegQuality);
    if (source.role !== 'visual') throw new Error(sourceLibraryText('sourceLibraryVisualRequired', 'This Part needs a visual source.'));
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? normalizeJpegExportQuality(jpegQuality) : undefined;
    if (source.kind === 'video') return await sourceLibraryVideoFrameBlob(source, sourceTime, width, height, mimeType, quality, framing, framingFocus);
    const frames = await ensureSourceFrames(source);
    const frame = sourceLibraryFrameAtTime(frames, sourceTime);
    if (!frame) throw new Error(sourceLibraryText('sourceLibraryVisualRequired', 'This Part needs a visual source.'));
    const blob = frame.blob || await getProjectFrameBlob(frame);
    const drawable = await blobToDrawable(blob);
    drawFramedDrawable(contexto, drawable, width, height, framing, framingFocus);
    releaseDrawable(drawable);
    return await canvasToBlobAsync(canvasInvisivel, mimeType, quality);
}

function sourceLibrarySupportsVideoAudio(sourceId) {
    const source = getProjectSourceById(sourceId);
    return !!source && source.kind === 'video' && source.blob instanceof Blob;
}

function sourceLibraryGetVideoAudioBlob(sourceId) {
    const source = getProjectSourceById(sourceId);
    return sourceLibrarySupportsVideoAudio(sourceId) ? source.blob : null;
}

function sourceLibraryGetAudioById(id) {
    const source = getProjectSourceById(id);
    return source && source.role === 'audio' ? source : null;
}

function sourceLibraryAssignVisualToPart(part, sourceId, resetRange = true) {
    const source = getProjectSourceById(sourceId);
    if (!part || !source || source.role !== 'visual') return false;
    const oldId = getPartSourceId(part);
    part.sourceId = source.id;
    const duration = Math.max(0.001, getSourceDurationById(source.id));
    if (resetRange && oldId !== source.id) {
        part.start = 0;
        part.end = duration;
        part.followSourceEnd = true;
    } else if (typeof normalizeAdvancedPartRange === 'function') {
        normalizeAdvancedPartRange(part);
    }
    if (part.audio && part.audio.mode === 'video' && !sourceLibrarySupportsVideoAudio(source.id)) part.audio.mode = 'none';
    if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    renderSourceLibrary();
    return true;
}

function sourceLibraryAssignAudioToPart(part, sourceId) {
    const source = sourceLibraryGetAudioById(sourceId);
    if (!part || !source) return false;
    if (!part.audio) return false;
    part.audio.mode = 'file';
    part.audio.source = source.blob;
    part.audio.sourceName = source.name;
    part.audio.sourceKind = 'library';
    part.audio.sourceLibraryId = source.id;
    if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    return true;
}

function sourceLibraryGetSelectedAdvancedPart() {
    if (!currentProject || !Array.isArray(currentProject.advancedParts)) return null;
    return currentProject.advancedParts.find(part => part.id === currentProject.advancedExpandedId) || null;
}

function sourceLibraryCard(source) {
    const selectedPart = sourceLibraryGetSelectedAdvancedPart();
    const usedAsVisual = selectedPart && source.role === 'visual' && getPartSourceId(selectedPart) === source.id;
    const usedAsAudio = selectedPart && source.role === 'audio' && selectedPart.audio && selectedPart.audio.sourceLibraryId === source.id;
    const primary = source.isPrimary ? `<span class="source-library-badge primary">${sourceLibraryEscape(sourceLibraryText('sourceLibraryPrimary', 'PRIMARY'))}</span>` : '';
    const assigned = usedAsVisual || usedAsAudio ? `<span class="source-library-badge assigned">${sourceLibraryEscape(sourceLibraryText('sourceLibraryAssigned', 'IN PART'))}</span>` : '';
    const sequenceIndex = source.role === 'visual' && window.BASMasterSequence ? BASMasterSequence.indexOfSource(source.id) : -1;
    const sequenceBadge = sequenceIndex >= 0 ? `<span class="source-library-badge sequence">${sourceLibraryEscape(sourceLibraryText('sourceLibrarySequenceBadge', 'SEQ {index}').replace('{index}', String(sequenceIndex + 1)))}</span>` : '';
    const preview = `<button type="button" data-source-action="preview" data-source-id="${sourceLibraryEscape(source.id)}">${sourceLibraryEscape(sourceLibraryText('sourceLibraryPreview', 'Preview'))}</button>`;
    let use = '';
    if (selectedPart) {
        use = source.role === 'visual'
            ? `<button type="button" data-source-action="use-visual" data-source-id="${sourceLibraryEscape(source.id)}">${sourceLibraryEscape(sourceLibraryText('sourceLibraryUseVisual', 'Use in Part'))}</button>`
            : `<button type="button" data-source-action="use-audio" data-source-id="${sourceLibraryEscape(source.id)}">${sourceLibraryEscape(sourceLibraryText('sourceLibraryUseAudio', 'Use as audio'))}</button>`;
    }
    const remove = source.isPrimary ? '' : `<button type="button" class="danger" data-source-action="remove" data-source-id="${sourceLibraryEscape(source.id)}">${sourceLibraryEscape(sourceLibraryText('sourceLibraryRemove', 'Remove'))}</button>`;
    return `<article class="source-library-card ${source.role} ${source.isPrimary ? 'is-primary' : ''}">
        <div class="source-library-icon ${source.kind}"><span>${sourceLibraryEscape(source.kind === 'audio' ? 'A' : source.kind === 'image' ? 'I' : source.kind === 'gif' ? 'G' : source.kind === 'bootanimation' ? 'Z' : 'V')}</span></div>
        <div class="source-library-copy"><div class="source-library-name-row"><strong>${sourceLibraryEscape(source.name)}</strong><span class="source-library-badges">${primary}${sequenceBadge}${assigned}</span></div><small>${sourceLibraryEscape(sourceLibraryMeta(source))}</small></div>
        <div class="source-library-actions">${preview}${use}${remove}</div>
    </article>`;
}

function renderSourceLibrary() {
    const section = document.getElementById('source-library');
    const list = document.getElementById('source-library-list');
    const count = document.getElementById('source-library-count');
    if (!section || !list) return;
    const hasProject = !!currentProject && currentProject.sourceBlob instanceof Blob;
    section.hidden = !hasProject;
    if (!hasProject) {
        list.innerHTML = '';
        return;
    }
    const library = ensureProjectSourceLibrary();
    list.innerHTML = library.map(sourceLibraryCard).join('');
    if (count) count.textContent = library.length === 1
        ? sourceLibraryText('sourceLibraryCountOne', '1 source')
        : sourceLibraryText('sourceLibraryCount', '{count} sources').replace('{count}', String(library.length));
}

function syncSourceLibraryText() {
    const kicker = document.getElementById('source-library-kicker');
    const title = document.getElementById('source-library-title');
    const desc = document.getElementById('source-library-desc');
    const add = document.getElementById('source-library-add-label');
    const guide = document.getElementById('source-library-guide');
    if (kicker) kicker.textContent = sourceLibraryText('sourceLibraryKicker', 'SOURCE LIBRARY');
    if (title) title.textContent = sourceLibraryText('sourceLibraryTitle', 'Build with more than one source');
    if (desc) desc.textContent = sourceLibraryText('sourceLibraryDesc', 'Add videos, GIFs, images or audio. Visual sources join the simple timeline automatically.');
    if (guide) guide.textContent = sourceLibraryText('sourceLibraryGuide', 'Visual sources are appended to the Master Sequence in the order you add them. Audio stays available for Parts and audio tools.');
    if (add) add.textContent = sourceLibraryText('sourceLibraryAdd', 'Add sources');
    renderSourceLibrary();
    syncSourcePreviewText();
}

async function openSourceLibraryPreview(id) {
    const source = getProjectSourceById(id);
    const modal = document.getElementById('modal-source-library');
    if (!source || !modal) return;
    const overlay = document.getElementById('loading-overlay');
    const loading = document.getElementById('txt-loading-timeline');
    const needsPreparation = source.role === 'visual' && source.kind === 'gif' && !(source.previewBlob instanceof Blob);
    if (needsPreparation) {
        if (typeof setLoadingTipContext === 'function') setLoadingTipContext('source');
        if (loading) loading.textContent = sourceLibraryText('sourceLibraryAnalyzing', 'Analyzing source {current}/{total}...').replace('{current}', '1').replace('{total}', '1');
        if (overlay) overlay.style.display = 'flex';
    }
    try {
        sourceLibraryRuntime.previewId = id;
        const video = document.getElementById('source-library-preview-video');
        const image = document.getElementById('source-library-preview-image');
        const audio = document.getElementById('source-library-preview-audio');
        const title = document.getElementById('source-library-preview-name');
        const meta = document.getElementById('source-library-preview-meta');
        if (title) title.textContent = source.name;
        if (meta) meta.textContent = sourceLibraryMeta(source);
        if (video) {
            video.pause();
            video.hidden = true;
            video.removeAttribute('src');
            video.load();
        }
        if (image) {
            image.hidden = true;
            image.removeAttribute('src');
        }
        if (audio) {
            audio.pause();
            audio.hidden = true;
            audio.removeAttribute('src');
            audio.load();
        }
        if (source.role === 'audio') {
            const url = sourceLibraryGetPreviewUrl(source, source.blob);
            audio.src = url;
            audio.hidden = false;
        } else if (source.kind === 'image') {
            const url = sourceLibraryGetPreviewUrl(source, source.blob);
            image.src = url;
            image.hidden = false;
        } else {
            const ready = await sourceLibrarySetVideoElementSource(video, source.id);
            if (!ready) throw new Error(sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.'));
            video.hidden = false;
        }
        modal.style.display = 'flex';
        syncSourcePreviewActions();
    } catch (error) {
        sourceLibraryRuntime.previewId = '';
        if (typeof showToast === 'function') showToast(error.message || sourceLibraryText('sourceLibraryUnsupported', 'This source could not be read.'), 'error');
    } finally {
        if (needsPreparation && overlay) overlay.style.display = 'none';
    }
}

function closeSourceLibraryPreview() {
    const modal = document.getElementById('modal-source-library');
    const video = document.getElementById('source-library-preview-video');
    const audio = document.getElementById('source-library-preview-audio');
    if (video) video.pause();
    if (audio) audio.pause();
    if (modal) modal.style.display = 'none';
    sourceLibraryRuntime.previewId = '';
}

function sourceLibraryPreviewTime() {
    const source = getProjectSourceById(sourceLibraryRuntime.previewId);
    if (!source || source.role !== 'visual') return 0;
    if (source.kind === 'image') return 0;
    const video = document.getElementById('source-library-preview-video');
    return previewTimeToSourceTime(source.id, video ? video.currentTime : 0, video);
}

function syncSourcePreviewActions() {
    const source = getProjectSourceById(sourceLibraryRuntime.previewId);
    const part = sourceLibraryGetSelectedAdvancedPart();
    const use = document.getElementById('source-library-preview-use');
    const start = document.getElementById('source-library-preview-start');
    const end = document.getElementById('source-library-preview-end');
    if (!source || !use || !start || !end) return;
    use.hidden = !part;
    start.hidden = !part || source.role !== 'visual';
    end.hidden = !part || source.role !== 'visual';
    use.textContent = source.role === 'audio' ? sourceLibraryText('sourceLibraryUseAudio', 'Use as audio') : sourceLibraryText('sourceLibraryUseVisual', 'Use in Part');
    start.textContent = sourceLibraryText('sourceLibrarySetStart', 'Set Part start here');
    end.textContent = sourceLibraryText('sourceLibrarySetEnd', 'Set Part end here');
}

function syncSourcePreviewText() {
    const kicker = document.getElementById('source-library-preview-kicker');
    const close = document.getElementById('source-library-preview-close');
    if (kicker) kicker.textContent = sourceLibraryText('sourceLibraryPreviewKicker', 'SOURCE PREVIEW');
    if (close) close.textContent = sourceLibraryText('sourceLibraryClose', 'Close');
    syncSourcePreviewActions();
}

function sourceLibrarySetPreviewBoundary(boundary) {
    const source = getProjectSourceById(sourceLibraryRuntime.previewId);
    const part = sourceLibraryGetSelectedAdvancedPart();
    if (!source || !part || source.role !== 'visual') return;
    if (getPartSourceId(part) !== source.id) sourceLibraryAssignVisualToPart(part, source.id, true);
    const duration = Math.max(0.001, getSourceDurationById(source.id));
    const time = source.kind === 'image' ? (boundary === 'end' ? duration : 0) : sourceLibraryPreviewTime();
    const fps = Math.max(1, Number(source.fps) || Number(document.getElementById('input-fps')?.value) || 30);
    const minSpan = Math.min(0.05, 1 / fps);
    part.followSourceEnd = false;
    if (boundary === 'start') {
        part.start = Math.max(0, Math.min(time, Math.max(0, part.end - minSpan)));
    } else {
        part.end = Math.min(duration, Math.max(time, Math.min(duration, part.start + minSpan)));
    }
    if (typeof normalizeAdvancedPartRange === 'function') normalizeAdvancedPartRange(part);
    if (typeof markAdvancedPartsDirty === 'function') markAdvancedPartsDirty();
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    syncSourcePreviewActions();
}

function initializeSourceLibraryForProject() {
    sourceLibraryResetRuntimeForProject(currentProject);
    if (!currentProject || !(currentProject.sourceBlob instanceof Blob)) {
        renderSourceLibrary();
        return;
    }
    ensureProjectSourceLibrary();
    syncPrimarySourceLibraryMetadata();
    renderSourceLibrary();
}

function syncPrimarySourceLibraryMetadata() {
    if (!currentProject) return;
    const primary = ensureProjectSourceLibrary().find(source => source.isPrimary);
    if (!primary) return;
    const primaryBlob = sourceLibraryPrimaryBlob(currentProject);
    primary.blob = primaryBlob;
    primary.name = currentProject.runtimePrimaryName || (primaryBlob && primaryBlob.name) || currentProject.sourceName || primary.name;
    primary.kind = sourceLibraryKindForPrimary(currentProject);
    primary.mimeType = primaryBlob ? primaryBlob.type || primary.mimeType || '' : primary.mimeType || '';
    primary.size = primaryBlob ? primaryBlob.size || 0 : 0;
    primary.lastModified = primaryBlob ? Number(primaryBlob.lastModified) || primary.lastModified || 0 : primary.lastModified || 0;
    primary.width = Math.max(0, Number(currentProject.runtimePrimaryWidth) || Number(currentProject.width) || 0);
    primary.height = Math.max(0, Number(currentProject.runtimePrimaryHeight) || Number(currentProject.height) || 0);
    primary.duration = Math.max(0, Number(currentProject.runtimePrimaryDuration) || Number(currentProject.sourceDuration) || 0);
    primary.fps = Math.max(0, Number(currentProject.runtimePrimaryFps) || Number(currentProject.fps) || 0);
    primary.runtimeFrames = currentProject.sourceMode === 'frames' ? currentProject.frames : null;
    primary.previewBlob = currentProject.previewBlob || (primary.kind === 'video' ? primaryBlob : primary.previewBlob || null);
    if (window.BASMasterSequence) BASMasterSequence.ensure();
    renderSourceLibrary();
    if (window.BASMasterSequence) BASMasterSequence.render();
}

function bindSourceLibrary() {
    if (sourceLibraryRuntime.initialized) return;
    sourceLibraryRuntime.initialized = true;
    const input = document.getElementById('source-library-input');
    input?.addEventListener('change', async event => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        await addFilesToSourceLibrary(files);
    });
    document.getElementById('source-library-list')?.addEventListener('click', async event => {
        const button = event.target.closest('[data-source-action]');
        if (!button) return;
        const source = getProjectSourceById(button.dataset.sourceId);
        if (!source) return;
        const part = sourceLibraryGetSelectedAdvancedPart();
        const action = button.dataset.sourceAction;
        if (action === 'preview') await openSourceLibraryPreview(source.id);
        else if (action === 'use-visual' && part) sourceLibraryAssignVisualToPart(part, source.id, true);
        else if (action === 'use-audio' && part) sourceLibraryAssignAudioToPart(part, source.id);
        else if (action === 'remove') await removeSourceFromLibrary(source.id);
    });
    document.getElementById('source-library-preview-close')?.addEventListener('click', closeSourceLibraryPreview);
    document.getElementById('source-library-preview-use')?.addEventListener('click', () => {
        const source = getProjectSourceById(sourceLibraryRuntime.previewId);
        const part = sourceLibraryGetSelectedAdvancedPart();
        if (!source || !part) return;
        if (source.role === 'audio') sourceLibraryAssignAudioToPart(part, source.id);
        else sourceLibraryAssignVisualToPart(part, source.id, false);
        syncSourcePreviewActions();
    });
    document.getElementById('source-library-preview-start')?.addEventListener('click', () => sourceLibrarySetPreviewBoundary('start'));
    document.getElementById('source-library-preview-end')?.addEventListener('click', () => sourceLibrarySetPreviewBoundary('end'));
    document.getElementById('modal-source-library')?.addEventListener('click', event => {
        if (event.target.id === 'modal-source-library') closeSourceLibraryPreview();
    });
    initializeSourceLibraryForProject();
}

window.BASSourceLibrary = Object.freeze({
    initializeCurrentProject: initializeSourceLibraryForProject,
    syncPrimary: syncPrimarySourceLibraryMetadata,
    render: renderSourceLibrary,
    syncText: syncSourceLibraryText,
    getAll: getProjectSourceLibrary,
    getVisual: getProjectVisualSources,
    getAudio: getProjectAudioSources,
    getById: getProjectSourceById,
    getPrimaryId: getPrimarySourceId,
    getPartSourceId,
    getPartSource,
    getDuration: getSourceDurationById,
    serialize: sourceLibrarySerialize,
    restoreState: sourceLibraryRestoreState,
    getAssets: sourceLibraryAssetInventory,
    addFiles: addFilesToSourceLibrary,
    openImage: openImageSourceInEditor,
    remove: removeSourceFromLibrary,
    preview: openSourceLibraryPreview,
    assignVisual: sourceLibraryAssignVisualToPart,
    assignAudio: sourceLibraryAssignAudioToPart,
    frameBlob: getSourceFrameOutputBlob,
    supportsVideoAudio: sourceLibrarySupportsVideoAudio,
    getVideoAudioBlob: sourceLibraryGetVideoAudioBlob,
    setVideoElementSource: sourceLibrarySetVideoElementSource,
    sourceTimeToPreview: sourceTimeToPreviewTime,
    previewTimeToSource: previewTimeToSourceTime,
    releaseVideoDecoder: sourceLibraryReleaseVideoDecoder,
    releaseIdleVideoDecoders: sourceLibraryReleaseIdleVideoDecoders
});
window.openImageSourceInEditor = openImageSourceInEditor;
window.initializeSourceLibraryForProject = initializeSourceLibraryForProject;
window.syncPrimarySourceLibraryMetadata = syncPrimarySourceLibraryMetadata;
window.renderSourceLibrary = renderSourceLibrary;
window.syncSourceLibraryText = syncSourceLibraryText;
window.addEventListener('DOMContentLoaded', bindSourceLibrary);
