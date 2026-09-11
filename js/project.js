function createMarkerState() {
    return { m0: null, m1: null, m2: null, m3: null };
}

function createTemporalProject(sourceType, sourceBlob, options = {}) {
    return {
        sourceType,
        sourceMode: 'temporal',
        sourceBlob: sourceBlob || null,
        previewBlob: options.previewBlob || sourceBlob || null,
        width: options.width || 0,
        height: options.height || 0,
        fps: options.fps || null,
        sourceDuration: options.sourceDuration || 0,
        previewDuration: 0,
        frames: [],
        parts: [],
        descText: null,
        markers: createMarkerState(),
        initialMarkersSource: null,
        initialMarkersApplied: true
    };
}

function createFrameProject(options) {
    return {
        sourceType: options.sourceType || 'bootanimation',
        sourceMode: 'frames',
        sourceBlob: options.sourceBlob || null,
        previewBlob: options.previewBlob || null,
        width: options.width || 0,
        height: options.height || 0,
        fps: options.fps || 30,
        sourceDuration: options.sourceDuration || 0,
        previewDuration: 0,
        frames: options.frames || [],
        parts: options.parts || [],
        descText: options.descText || null,
        markers: createMarkerState(),
        initialMarkersSource: options.initialMarkersSource || null,
        initialMarkersApplied: false
    };
}

function setCurrentProject(project) {
    currentProject = project;
    marcadores = currentProject ? currentProject.markers : createMarkerState();
    originalW = currentProject ? currentProject.width || 0 : 0;
    originalH = currentProject ? currentProject.height || 0 : 0;
}

function resetProjectMarkers() {
    const nextMarkers = createMarkerState();
    if (currentProject) currentProject.markers = nextMarkers;
    marcadores = nextMarkers;
}

function setPlayerBlob(blob) {
    if (currentPlayerObjectUrl) {
        URL.revokeObjectURL(currentPlayerObjectUrl);
        currentPlayerObjectUrl = null;
    }
    if (!blob) {
        playerVideo.removeAttribute('src');
        playerVideo.load();
        return '';
    }
    currentPlayerObjectUrl = URL.createObjectURL(blob);
    playerVideo.src = currentPlayerObjectUrl;
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

    if (currentProject.sourceMode === 'frames' && currentProject.initialMarkersSource && !currentProject.initialMarkersApplied) {
        Object.keys(currentProject.initialMarkersSource).forEach(key => {
            const value = currentProject.initialMarkersSource[key];
            marcadores[key] = value === null ? null : projectTimeToTimelineTime(value);
        });
        currentProject.initialMarkersApplied = true;
    }
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
    return {
        m0: marcadores.m0 === null ? null : timelineTimeToProjectTime(marcadores.m0),
        m1: marcadores.m1 === null ? null : timelineTimeToProjectTime(marcadores.m1),
        m2: marcadores.m2 === null ? null : timelineTimeToProjectTime(marcadores.m2),
        m3: marcadores.m3 === null ? null : timelineTimeToProjectTime(marcadores.m3)
    };
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

function canvasToBlobAsync(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Unable to encode frame'));
        }, mimeType, quality);
    });
}

async function seekPlayer(time) {
    const duration = Number.isFinite(playerVideo.duration) ? playerVideo.duration : 0;
    const target = duration > 0 ? Math.max(0, Math.min(time, Math.max(0, duration - 0.0001))) : Math.max(0, time);
    if (Math.abs(playerVideo.currentTime - target) < 0.0005) return;
    await new Promise((resolve, reject) => {
        const done = () => {
            playerVideo.removeEventListener('seeked', done);
            playerVideo.removeEventListener('error', fail);
            resolve();
        };
        const fail = () => {
            playerVideo.removeEventListener('seeked', done);
            playerVideo.removeEventListener('error', fail);
            reject(new Error('Unable to seek media'));
        };
        playerVideo.addEventListener('seeked', done, { once: true });
        playerVideo.addEventListener('error', fail, { once: true });
        playerVideo.currentTime = target;
    });
}

async function getProjectFrameOutputBlob(sourceTime, width, height, format) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.90 : undefined;

    if (projectUsesFrames()) {
        const frame = getProjectFrameAtTime(sourceTime);
        if (!frame) throw new Error('Frame not found');

        if (width === currentProject.width && height === currentProject.height && frame.format === format) {
            return frame.blob;
        }

        const drawable = await blobToDrawable(frame.blob);
        contexto.fillStyle = '#000000';
        contexto.fillRect(0, 0, width, height);
        contexto.drawImage(drawable, 0, 0, width, height);
        releaseDrawable(drawable);
        return await canvasToBlobAsync(canvasInvisivel, mimeType, quality);
    }

    const timelineTime = projectTimeToTimelineTime(sourceTime);
    await seekPlayer(timelineTime);
    contexto.fillStyle = '#000000';
    contexto.fillRect(0, 0, width, height);
    contexto.drawImage(playerVideo, 0, 0, width, height);
    return await canvasToBlobAsync(canvasInvisivel, mimeType, quality);
}
