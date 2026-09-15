const BAS_PROJECT_SCHEMA_VERSION = 1;
const BAS_PROJECT_ENGINE_VERSION = '12.1';

const projectEngineRuntime = {
    projectRef: null,
    lastContentSignature: '',
    syncTimer: 0,
    initialized: false,
    suspendDepth: 0
};

function projectEngineNow() {
    return new Date().toISOString();
}

function createProjectEngineId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2, 10);
    return `bas-${Date.now().toString(36)}-${random}`;
}

function projectEngineText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual];
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function getProjectEngineSourceName(project = currentProject) {
    if (!project) return '';
    if (project.sourceName) return String(project.sourceName);
    if (project.sourceBlob && typeof project.sourceBlob.name === 'string') return project.sourceBlob.name;
    return '';
}

function deriveProjectEngineName(project = currentProject) {
    const sourceName = getProjectEngineSourceName(project).trim();
    if (sourceName) {
        const withoutZip = sourceName.replace(/\.bootanimation\.zip$/i, '').replace(/\.zip$/i, '');
        const withoutExtension = withoutZip.replace(/\.[^.]+$/, '');
        const cleaned = withoutExtension.trim();
        if (cleaned) return cleaned;
    }
    const outputName = document.getElementById('input-nome')?.value?.trim();
    return outputName || 'bootanimation';
}

function ensureProjectEngineMetadata(project = currentProject) {
    if (!project) return null;
    const now = projectEngineNow();
    if (!project.projectMeta || typeof project.projectMeta !== 'object') project.projectMeta = {};
    const meta = project.projectMeta;
    if (!meta.id) meta.id = createProjectEngineId();
    meta.schemaVersion = BAS_PROJECT_SCHEMA_VERSION;
    meta.engineVersion = BAS_PROJECT_ENGINE_VERSION;
    if (!meta.createdAt) meta.createdAt = now;
    if (!meta.updatedAt) meta.updatedAt = meta.createdAt;
    if (!Number.isInteger(meta.revision) || meta.revision < 0) meta.revision = 0;
    if (typeof meta.dirty !== 'boolean') meta.dirty = false;
    if (!meta.name) meta.name = deriveProjectEngineName(project);
    meta.sourceName = getProjectEngineSourceName(project);
    return meta;
}

function serializeProjectAudioSource(source) {
    if (!source || typeof source !== 'object') return { kind: 'none', name: '', size: 0, type: '', lastModified: 0 };
    return {
        kind: source.kind || 'none',
        name: source.name || '',
        size: Number(source.size) || 0,
        type: source.type || '',
        lastModified: Number(source.lastModified) || 0
    };
}

function serializeProjectAudioState() {
    if (typeof captureAudioEditorState !== 'function') return { enabled: false, intro: null, loop: null, final: null };
    const state = captureAudioEditorState();
    const result = { enabled: !!state.enabled };
    ['intro', 'loop', 'final'].forEach(role => {
        const part = state[role] || {};
        result[role] = {
            mode: part.mode || 'none',
            volume: Number(part.volume) || 0,
            fadeIn: Number(part.fadeIn) || 0,
            fadeOut: Number(part.fadeOut) || 0,
            offset: Number(part.offset) || 0,
            normalize: !!part.normalize,
            source: serializeProjectAudioSource(part.source)
        };
    });
    return result;
}

function serializeProjectAdvancedAudio(audio) {
    const source = audio && audio.source instanceof Blob ? audio.source : null;
    return {
        mode: audio && audio.mode ? audio.mode : 'none',
        volume: Math.max(0, Math.min(100, Number(audio && audio.volume) || 0)),
        fadeIn: Number(audio && audio.fadeIn) || 0,
        fadeOut: Number(audio && audio.fadeOut) || 0,
        offset: Number(audio && audio.offset) || 0,
        normalize: !!(audio && audio.normalize),
        sourceName: audio && audio.sourceName ? String(audio.sourceName) : '',
        sourceKind: audio && audio.sourceKind ? String(audio.sourceKind) : 'none',
        sourceSize: source ? source.size || 0 : 0,
        sourceType: source ? source.type || '' : ''
    };
}

function serializeProjectAdvancedParts() {
    const parts = typeof getAdvancedParts === 'function' ? getAdvancedParts() : currentProject && Array.isArray(currentProject.advancedParts) ? currentProject.advancedParts : [];
    return parts.map(part => ({
        id: String(part.id || ''),
        label: String(part.label || ''),
        folder: String(part.folder || ''),
        type: part.type === 'p' ? 'p' : 'c',
        repeat: Math.max(0, Math.floor(Number(part.repeat) || 0)),
        pause: Math.max(0, Math.floor(Number(part.pause) || 0)),
        start: Math.max(0, Number(part.start) || 0),
        end: Math.max(0, Number(part.end) || 0),
        extraTokens: Array.isArray(part.extraTokens) ? [...part.extraTokens] : [],
        audio: serializeProjectAdvancedAudio(part.audio)
    }));
}

function projectEngineNumber(id, fallback = 0) {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
}

function projectEngineValue(id, fallback = '') {
    const element = document.getElementById(id);
    return element ? element.value : fallback;
}

function projectEngineChecked(id) {
    return !!document.getElementById(id)?.checked;
}

function captureProjectEngineContentState() {
    const sourceMarkers = typeof getProjectSourceMarkers === 'function' ? getProjectSourceMarkers() : { ...marcadores };
    const focus = typeof getCurrentFramingFocus === 'function' ? getCurrentFramingFocus() : currentProject && currentProject.framingFocus ? { ...currentProject.framingFocus } : { x: 0.5, y: 0.5, zoom: 1 };
    const advancedActive = typeof isAdvancedPartsActive === 'function' ? isAdvancedPartsActive() : !!(currentProject && currentProject.advancedPartsEnabled);
    return {
        markers: sourceMarkers,
        output: {
            name: projectEngineValue('input-nome', 'bootanimation').trim() || 'bootanimation',
            format: projectEngineValue('input-formato', 'jpeg'),
            qualityPreset: projectEngineValue('input-qualidade', 'orig'),
            jpegQuality: typeof jpegExportQuality === 'number' ? jpegExportQuality : 0.9,
            fps: Math.max(1, Math.min(60, Math.round(projectEngineNumber('input-fps', 30)))),
            width: Math.max(0, Math.round(projectEngineNumber('input-largura', originalW || 0))),
            height: Math.max(0, Math.round(projectEngineNumber('input-altura', originalH || 0)))
        },
        framing: {
            mode: projectEngineValue('input-enquadramento', 'cover'),
            focus,
            reference: Math.max(0.05, Math.min(0.95, projectEngineNumber('framing-reference-slider', 0.5)))
        },
        audio: serializeProjectAudioState(),
        advanced: {
            enabled: advancedActive,
            dirty: !!(currentProject && currentProject.advancedPartsDirty),
            expandedId: currentProject && currentProject.advancedExpandedId ? String(currentProject.advancedExpandedId) : null,
            counter: Math.max(0, Number(currentProject && currentProject.advancedPartCounter) || 0),
            parts: serializeProjectAdvancedParts()
        },
        package: {
            generateModule: projectEngineChecked('input-gerar-modulo'),
            manufacturer: projectEngineValue('input-fabricante', 'standard')
        }
    };
}

function captureProjectEngineUiState() {
    const playhead = Number(playerVideo && playerVideo.currentTime);
    return {
        workspaceView: typeof workspaceUi !== 'undefined' && workspaceUi.currentView ? workspaceUi.currentView : 'edit',
        outputTool: typeof contextualUi !== 'undefined' && contextualUi.outputTool ? contextualUi.outputTool : 'basics',
        audioRole: typeof contextualUi !== 'undefined' && contextualUi.audioRole ? contextualUi.audioRole : 'intro',
        deliveryTarget: typeof getBuildDeliveryTarget === 'function' ? getBuildDeliveryTarget() : 'download',
        playhead: Number.isFinite(playhead) ? playhead : 0
    };
}

function getProjectEngineSourceDescriptor(project = currentProject) {
    if (!project) return null;
    const blob = project.sourceBlob instanceof Blob ? project.sourceBlob : null;
    return {
        type: project.sourceType || 'video',
        mode: project.sourceMode || 'temporal',
        name: getProjectEngineSourceName(project),
        mimeType: blob ? blob.type || '' : '',
        size: blob ? blob.size || 0 : 0,
        lastModified: blob && Number.isFinite(Number(blob.lastModified)) ? Number(blob.lastModified) : 0,
        width: Math.max(0, Number(project.width) || 0),
        height: Math.max(0, Number(project.height) || 0),
        fps: Math.max(0, Number(project.fps) || 0),
        duration: Math.max(0, Number(project.sourceDuration) || 0),
        frameCount: Array.isArray(project.frames) ? project.frames.length : 0,
        partCount: Array.isArray(project.parts) ? project.parts.length : 0
    };
}

function captureProjectManifest() {
    if (!currentProject) return null;
    const meta = ensureProjectEngineMetadata(currentProject);
    const content = captureProjectEngineContentState();
    const ui = captureProjectEngineUiState();
    return {
        format: 'boot-animation-studio-project',
        schemaVersion: BAS_PROJECT_SCHEMA_VERSION,
        engineVersion: BAS_PROJECT_ENGINE_VERSION,
        project: { ...meta },
        source: getProjectEngineSourceDescriptor(currentProject),
        editor: content,
        ui
    };
}

function getProjectAssetInventory() {
    if (!currentProject) return [];
    const assets = [];
    const seen = new Set();
    const add = (key, kind, blob, name, transient = false) => {
        if (!(blob instanceof Blob) || seen.has(blob)) return;
        seen.add(blob);
        assets.push({ key, kind, name: name || '', blob, transient, size: blob.size || 0, type: blob.type || '' });
    };
    add('source', 'source', currentProject.sourceBlob, getProjectEngineSourceName(currentProject), false);
    if (currentProject.previewBlob && currentProject.previewBlob !== currentProject.sourceBlob) add('preview', 'preview', currentProject.previewBlob, 'preview.webm', true);
    if (typeof captureAudioEditorState === 'function') {
        const simple = captureAudioEditorState();
        ['intro', 'loop', 'final'].forEach(role => {
            const source = simple[role] && simple[role].source;
            if (source && source.kind === 'file' && source.ref instanceof Blob) add(`audio:${role}`, 'audio', source.ref, source.name || `${role}.audio`, false);
        });
    }
    const parts = typeof getAdvancedParts === 'function' ? getAdvancedParts() : [];
    parts.forEach(part => {
        if (part && part.audio && part.audio.sourceKind === 'file' && part.audio.source instanceof Blob) add(`advanced-audio:${part.id}`, 'audio', part.audio.source, part.audio.sourceName || `${part.id}.audio`, false);
    });
    return assets;
}

function getProjectEngineLocale() {
    if (idiomaAtual === 'pt') return 'pt-BR';
    if (idiomaAtual === 'es') return 'es-ES';
    if (idiomaAtual === 'fr') return 'fr-FR';
    return 'en-US';
}

function formatProjectEngineDuration(value) {
    const duration = Math.max(0, Number(value) || 0);
    const formatted = new Intl.NumberFormat(getProjectEngineLocale(), { maximumFractionDigits: duration < 10 ? 2 : 1 }).format(duration);
    return `${formatted} s`;
}

function getProjectEngineSourceLabel(project = currentProject) {
    if (!project) return projectEngineText('projectSourceWaiting', 'Waiting for source');
    if (project.sourceType === 'gif') return projectEngineText('projectSourceGif', 'GIF');
    if (project.sourceType === 'bootanimation') return projectEngineText('projectSourceZip', 'bootanimation.zip');
    return projectEngineText('projectSourceVideo', 'Video');
}

function getProjectEngineSummary(project = currentProject) {
    if (!project || !project.sourceBlob) return projectEngineText('projectSourceWaiting', 'Waiting for source');
    const parts = [getProjectEngineSourceLabel(project)];
    const width = Math.max(0, Number(project.width) || 0);
    const height = Math.max(0, Number(project.height) || 0);
    if (width && height) parts.push(`${width} × ${height}`);
    if (project.sourceMode === 'frames' && Array.isArray(project.frames) && project.frames.length) {
        parts.push(projectEngineText('projectSourceFrames', '{count} frames').replace('{count}', String(project.frames.length)));
    } else if (project.sourceDuration) {
        parts.push(formatProjectEngineDuration(project.sourceDuration));
    }
    return parts.join(' · ');
}

function syncProjectEngineUi() {
    const title = document.getElementById('p12-project-name');
    const summary = document.getElementById('p12-project-summary');
    const context = document.querySelector('.editor-context');
    if (!title || !summary) return;
    if (!currentProject || !currentProject.sourceBlob) {
        title.textContent = projectEngineText('workspaceEditorTitle', 'Boot animation project');
        summary.textContent = projectEngineText('projectSourceWaiting', 'Waiting for source');
        context?.classList.remove('has-project');
        return;
    }
    const meta = ensureProjectEngineMetadata(currentProject);
    title.textContent = meta.name || deriveProjectEngineName(currentProject);
    summary.textContent = getProjectEngineSummary(currentProject);
    context?.classList.add('has-project');
}

function emitProjectEngineChange(reason, contentChanged) {
    if (!currentProject || !currentProject.projectMeta) return;
    window.dispatchEvent(new CustomEvent('bas:projectchange', {
        detail: {
            projectId: currentProject.projectMeta.id,
            revision: currentProject.projectMeta.revision,
            dirty: currentProject.projectMeta.dirty,
            reason,
            contentChanged: !!contentChanged
        }
    }));
}

function syncProjectEngineState(reason = 'sync', options = {}) {
    if (!currentProject) {
        projectEngineRuntime.projectRef = null;
        projectEngineRuntime.lastContentSignature = '';
        syncProjectEngineUi();
        return null;
    }
    const meta = ensureProjectEngineMetadata(currentProject);
    const content = captureProjectEngineContentState();
    const ui = captureProjectEngineUiState();
    const signature = JSON.stringify(content);
    const changedProject = projectEngineRuntime.projectRef !== currentProject;
    const baseline = !!options.baseline || changedProject || !projectEngineRuntime.lastContentSignature;
    let contentChanged = false;
    if (baseline) {
        projectEngineRuntime.projectRef = currentProject;
        projectEngineRuntime.lastContentSignature = signature;
    } else if (signature !== projectEngineRuntime.lastContentSignature) {
        projectEngineRuntime.lastContentSignature = signature;
        meta.revision += 1;
        meta.updatedAt = projectEngineNow();
        meta.dirty = true;
        contentChanged = true;
    }
    currentProject.projectState = content;
    currentProject.projectUiState = ui;
    meta.sourceName = getProjectEngineSourceName(currentProject);
    if (!meta.name) meta.name = deriveProjectEngineName(currentProject);
    syncProjectEngineUi();
    if (contentChanged || options.emit) emitProjectEngineChange(reason, contentChanged);
    return captureProjectManifest();
}

function projectEngineTouch(reason = 'editor', options = {}) {
    if (projectEngineRuntime.suspendDepth > 0) return;
    clearTimeout(projectEngineRuntime.syncTimer);
    projectEngineRuntime.syncTimer = setTimeout(() => {
        projectEngineRuntime.syncTimer = 0;
        syncProjectEngineState(reason, options);
    }, options.immediate ? 0 : 70);
}


function withProjectEngineSuspended(callback) {
    projectEngineRuntime.suspendDepth += 1;
    try {
        const result = callback();
        if (result && typeof result.then === 'function') {
            return result.finally(() => {
                projectEngineRuntime.suspendDepth = Math.max(0, projectEngineRuntime.suspendDepth - 1);
            });
        }
        projectEngineRuntime.suspendDepth = Math.max(0, projectEngineRuntime.suspendDepth - 1);
        return result;
    } catch (error) {
        projectEngineRuntime.suspendDepth = Math.max(0, projectEngineRuntime.suspendDepth - 1);
        throw error;
    }
}

function initializeProjectEngineForCurrentProject(reason = 'source') {
    projectEngineRuntime.projectRef = null;
    projectEngineRuntime.lastContentSignature = '';
    if (currentProject) ensureProjectEngineMetadata(currentProject);
    projectEngineTouch(reason, { baseline: true, emit: true, immediate: true });
}

function markProjectEngineClean() {
    if (!currentProject) return;
    const meta = ensureProjectEngineMetadata(currentProject);
    meta.dirty = false;
    meta.updatedAt = projectEngineNow();
    emitProjectEngineChange('clean', false);
}

function validateProjectManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') return false;
    if (manifest.format !== 'boot-animation-studio-project') return false;
    if (Number(manifest.schemaVersion) !== BAS_PROJECT_SCHEMA_VERSION) return false;
    if (!manifest.project || !manifest.source || !manifest.editor) return false;
    return true;
}

function projectEngineTargetIsContent(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('#editor-section') && target.matches('input, select, textarea')) return true;
    if (target.closest('[data-advanced-field], [data-advanced-audio-file]')) return true;
    return false;
}

function projectEngineActionChangesContent(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('.btn-marc')) return true;
    if (target.closest('[data-advanced-action]')) return true;
    return !!target.closest('#btn-open-advanced-parts, #btn-advanced-add, #btn-advanced-split, #btn-advanced-back, #advanced-time-start, #advanced-time-end, #framing-tool-reset, #btn-reset-focus, #btn-optimizer-apply');
}

function bindProjectEngine() {
    if (projectEngineRuntime.initialized) return;
    projectEngineRuntime.initialized = true;
    document.addEventListener('input', event => {
        if (projectEngineTargetIsContent(event.target)) projectEngineTouch('input');
    });
    document.addEventListener('change', event => {
        if (projectEngineTargetIsContent(event.target)) projectEngineTouch('change');
    });
    document.addEventListener('click', event => {
        if (projectEngineActionChangesContent(event.target)) projectEngineTouch('action');
        else if (event.target.closest('.workflow-tab, .output-tool-tab, .audio-role-tab, .delivery-option')) projectEngineTouch('ui', { emit: true });
    });
    document.addEventListener('pointerup', event => {
        if (event.target.closest('#framing-preview, #framing-tool-preview-shell')) projectEngineTouch('framing');
    });
    playerVideo?.addEventListener('pause', () => projectEngineTouch('ui', { emit: true }));
    syncProjectEngineUi();
    if (currentProject) initializeProjectEngineForCurrentProject('startup');
}

window.BASProjectEngine = Object.freeze({
    engineVersion: BAS_PROJECT_ENGINE_VERSION,
    schemaVersion: BAS_PROJECT_SCHEMA_VERSION,
    captureManifest: captureProjectManifest,
    getAssets: getProjectAssetInventory,
    validateManifest: validateProjectManifest,
    sync: syncProjectEngineState,
    touch: projectEngineTouch,
    markClean: markProjectEngineClean,
    suspend: withProjectEngineSuspended
});
window.initializeProjectEngineForCurrentProject = initializeProjectEngineForCurrentProject;
window.projectEngineTouch = projectEngineTouch;
window.syncProjectEngineUi = syncProjectEngineUi;
window.addEventListener('DOMContentLoaded', bindProjectEngine);
