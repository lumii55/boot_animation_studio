const contextualUi = {
    outputTool: 'basics',
    editTool: 'composition',
    audioRole: 'intro',
    framingFrame: 0,
    framingReference: 0.5,
    framingPointerId: null,
    framingStartPoint: { x: 0, y: 0 },
    framingStartFocus: { x: 0.5, y: 0.5, zoom: 1 },
    framingMoved: false
};


const framingReferenceVideo = document.createElement('video');
framingReferenceVideo.muted = true;
framingReferenceVideo.playsInline = true;
framingReferenceVideo.preload = 'auto';
let framingReferenceSource = '';

function seekFramingReferenceVideo() {
    if (!framingReferenceVideo.duration || !Number.isFinite(framingReferenceVideo.duration)) return;
    const fraction = Math.max(0.05, Math.min(0.95, Number(contextualUi.framingReference) || 0.5));
    const duration = framingReferenceVideo.duration;
    const target = Math.max(0, Math.min(Math.max(0, duration - 0.03), duration * fraction));
    if (Math.abs(framingReferenceVideo.currentTime - target) < 0.025) return;
    try {
        if (typeof framingReferenceVideo.fastSeek === 'function') framingReferenceVideo.fastSeek(target);
        else framingReferenceVideo.currentTime = target;
    } catch (e) {}
}

function syncFramingReferenceSource() {
    const source = window.BASState.playerVideo?.currentSrc || window.BASState.playerVideo?.src || '';
    if (!source) return;
    if (source === framingReferenceSource) return;
    framingReferenceSource = source;
    framingReferenceVideo.src = source;
    framingReferenceVideo.load();
}

framingReferenceVideo.addEventListener('loadedmetadata', seekFramingReferenceVideo);
framingReferenceVideo.addEventListener('loadeddata', renderFramingToolFrame);
framingReferenceVideo.addEventListener('seeked', renderFramingToolFrame);

function contextualText(key, fallback) {
    return window.BASI18n?.text?.(key, fallback) ?? fallback;
}

function setOutputTool(tool, options = {}) {
    const allowed = ['basics', 'framing', 'performance'];
    if (tool === 'composition' || tool === 'audio') {
        const targetId = tool === 'composition' ? 'composition-editor-section' : 'output-panel-audio';
        contextualUi.outputTool = 'basics';
        window.BASWorkspace?.setView?.('edit', { scroll: false });
        setEditTool(tool, { scroll: true });
        tool = 'basics';
    }
    if (!allowed.includes(tool)) tool = 'basics';
    contextualUi.outputTool = tool;
    const config = document.getElementById('configuracoes');
    if (config) config.dataset.outputTool = tool;
    document.querySelectorAll('.output-tool-tab[data-output-tool]').forEach(button => {
        const active = button.dataset.outputTool === tool;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.output-tool-panel[data-output-panel]').forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.outputPanel === tool);
    });
    if (tool === 'framing') {
        syncFramingToolUi();
        requestAnimationFrame(renderFramingToolFrame);
    }
    window.BASProjectEngine?.touch?.('output-tool', { emit: true });
    if (options.scroll && window.matchMedia('(max-width: 859px)').matches) {
        document.querySelector('.output-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}


function setEditTool(tool, options = {}) {
    const allowed = ['composition', 'audio', 'parts'];
    if (!allowed.includes(tool)) tool = 'composition';
    contextualUi.editTool = tool;
    const editorSection = document.getElementById('editor-section');
    if (editorSection) editorSection.dataset.editTool = tool;
    document.querySelectorAll('.edit-tool-button[data-edit-tool]').forEach(button => {
        const active = button.dataset.editTool === tool;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.edit-inspector-pane[data-edit-tool-panel]').forEach(panel => {
        const active = panel.dataset.editToolPanel === tool;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
    });
    if (tool === 'composition') window.BASComposition?.open?.();
    if (tool === 'audio') syncContextualAudioMode();
    if (options.scroll && window.matchMedia('(max-width: 859px)').matches) {
        requestAnimationFrame(() => document.getElementById('edit-inspector-deck')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
}

function setAudioRole(role) {
    if (!['intro', 'loop', 'final'].includes(role)) return;
    contextualUi.audioRole = role;
    document.querySelectorAll('.audio-role-tab[data-audio-role]').forEach(button => {
        const active = button.dataset.audioRole === role;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.audio-role-card[data-audio-panel]').forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.audioPanel === role);
    });
    window.BASAudioStudio?.scheduleWaveformRefresh?.(role, 20);
    window.BASProjectEngine?.touch?.('audio-role', { emit: true });
}

function getFramingToolSettings() {
    const width = !!window.BASPerformance?.normalizeDimension
        ? window.BASPerformance.normalizeDimension(document.getElementById('input-largura')?.value, window.BASState.sourceWidth || window.BASState.playerVideo.videoWidth || 1)
        : Math.max(1, parseInt(document.getElementById('input-largura')?.value) || window.BASState.sourceWidth || window.BASState.playerVideo.videoWidth || 1);
    const height = !!window.BASPerformance?.normalizeDimension
        ? window.BASPerformance.normalizeDimension(document.getElementById('input-altura')?.value, window.BASState.sourceHeight || window.BASState.playerVideo.videoHeight || 1)
        : Math.max(1, parseInt(document.getElementById('input-altura')?.value) || window.BASState.sourceHeight || window.BASState.playerVideo.videoHeight || 1);
    const mode = window.BASFraming.normalizeMode(document.getElementById('input-enquadramento')?.value || 'cover');
    const focus = window.BASFraming.getFocus();
    return { width, height, mode, focus };
}

function syncFramingToolUi() {
    const settings = getFramingToolSettings();
    document.querySelectorAll('.framing-mode-tab[data-framing-mode]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.framingMode === settings.mode);
    });
    const zoom = document.getElementById('framing-zoom-slider');
    const zoomValue = document.getElementById('framing-zoom-value');
    const zoomControl = document.getElementById('framing-zoom-control');
    if (zoom) zoom.value = settings.focus.zoom.toFixed(2);
    if (zoomValue) zoomValue.textContent = `${Math.round(settings.focus.zoom * 100)}%`;
    if (zoomControl) zoomControl.classList.toggle('is-disabled', settings.mode !== 'cover');
    const dimensions = document.getElementById('framing-tool-dimensions');
    if (dimensions) dimensions.textContent = `${settings.width} × ${settings.height}`;
    const shell = document.getElementById('framing-tool-preview-shell');
    if (shell) {
        const ratio = Math.max(0.05, settings.width / Math.max(1, settings.height));
        const maxPreviewHeight = Math.min(560, Math.max(300, window.innerHeight * 0.58));
        const maxPreviewWidth = Math.min(540, maxPreviewHeight * ratio);
        shell.style.setProperty('--framing-aspect', `${settings.width} / ${settings.height}`);
        shell.style.setProperty('--framing-max-width', `${Math.max(120, maxPreviewWidth)}px`);
        shell.classList.toggle('is-draggable', settings.mode === 'cover');
    }
    const reference = document.getElementById('framing-reference-slider');
    const referenceValue = document.getElementById('framing-reference-value');
    if (reference) reference.value = String(contextualUi.framingReference);
    if (referenceValue) referenceValue.textContent = `${Math.round(contextualUi.framingReference * 100)}%`;
}

function renderFramingToolFrame() {
    const canvas = document.getElementById('framing-tool-canvas');
    const shell = document.getElementById('framing-tool-preview-shell');
    if (!canvas || !shell) return;
    const settings = getFramingToolSettings();
    syncFramingToolUi();
    const maxDimension = 720;
    const scale = Math.min(1, maxDimension / Math.max(settings.width, settings.height));
    const width = Math.max(1, Math.round(settings.width * scale));
    const height = Math.max(1, Math.round(settings.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    syncFramingReferenceSource();
    if (framingReferenceVideo.readyState >= 2 && framingReferenceVideo.videoWidth) {
        window.BASFraming.draw(ctx, framingReferenceVideo, width, height, settings.mode, settings.focus);
    }
}

function contextualFramingLoop() {
    contextualUi.framingFrame = 0;
    const editor = document.getElementById('editor-section');
    const visible = contextualUi.outputTool === 'framing' && (!editor || editor.dataset.mobileView === 'settings' || window.matchMedia('(min-width: 860px)').matches);
    if (!visible) return;
    renderFramingToolFrame();
    if (window.BASState.playerVideo && !window.BASState.playerVideo.paused && !window.BASState.playerVideo.ended) contextualUi.framingFrame = requestAnimationFrame(contextualFramingLoop);
}


function applyFramingToolMode(mode) {
    const select = document.getElementById('input-enquadramento');
    if (!select) return;
    select.value = window.BASFraming.normalizeMode(mode);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncFramingToolUi();
    renderFramingToolFrame();
}

function applyFramingToolZoom(value) {
    const focus = window.BASFraming.getFocus();
    const nextZoom = window.BASFraming.normalizeZoom(value);
    window.BASFraming.setFocus(focus.x, focus.y, nextZoom);
    window.BASTimelineFraming?.applyFocusVisuals?.();
    syncFramingToolUi();
    renderFramingToolFrame();
}

function finishFramingToolPan(event) {
    const canvas = document.getElementById('framing-tool-canvas');
    if (!canvas || contextualUi.framingPointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    contextualUi.framingPointerId = null;
    canvas.classList.remove('is-dragging');
    if (contextualUi.framingMoved && !!window.BASPerformance?.scheduleEstimate) window.BASPerformance?.scheduleEstimate?.();
    contextualUi.framingMoved = false;
}

function syncContextualAudioMode() {
    const note = document.getElementById('advanced-audio-context');
    const simpleToggle = document.getElementById('simple-audio-toggle-wrap');
    const simplePanel = document.getElementById('painel-audio');
    const advanced = window.BASParts?.isActive?.() ?? false;
    if (note) note.classList.toggle('is-visible', advanced);
    if (advanced) {
        if (simpleToggle) simpleToggle.style.display = 'none';
        if (simplePanel) simplePanel.style.display = 'none';
    } else {
        if (simpleToggle) simpleToggle.style.display = '';
        if (simplePanel) {
            const enabled = !!document.getElementById('input-usar-som')?.checked;
            simplePanel.style.display = enabled ? 'flex' : 'none';
        }
    }
}

function syncContextualToolsText() {
    const bindings = {
        'p11-tool-basics': ['contextToolBasics', 'Output'],
        'p11-tool-framing': ['contextToolFraming', 'Framing'],
        'p11-tool-audio': ['contextToolAudio', 'Audio'],
        'edit-tool-composition-label': ['contextToolComposition', 'Compose'],
        'edit-tool-audio-label': ['contextToolAudio', 'Audio'],
        'edit-tool-parts-label': ['editToolParts', 'Parts'],
        'p11-tool-performance': ['contextToolPerformance', 'Optimize'],
        'p11-basics-kicker': ['contextBasicsKicker', 'OUTPUT PROFILE'],
        'p11-basics-title': ['contextBasicsTitle', 'Shape the final file'],
        'p11-basics-desc': ['contextBasicsDesc', 'Choose the file name, frame format, resolution and frame rate.'],
        'p11-framing-kicker': ['contextFramingKicker', 'FRAMING'],
        'p11-framing-title': ['contextFramingTitle', 'Place the image inside the screen'],
        'p11-framing-desc': ['contextFramingDesc', 'Preview the final aspect ratio, choose a fit mode and drag the image when crop is active.'],
        'p11-framing-hint': ['contextFramingHint', 'Drag to reposition. Use the slider to zoom while Fill is selected.'],
        'p11-framing-fill': ['contextFramingFill', 'Fill'],
        'p11-framing-fill-desc': ['contextFramingFillDesc', 'Crop edges'],
        'p11-framing-fit': ['contextFramingFit', 'Fit'],
        'p11-framing-fit-desc': ['contextFramingFitDesc', 'Keep the whole frame'],
        'p11-framing-stretch': ['contextFramingStretch', 'Stretch'],
        'p11-framing-stretch-desc': ['contextFramingStretchDesc', 'Fill exactly'],
        'p11-framing-zoom': ['contextFramingZoom', 'Crop zoom'],
        'p11-framing-reset': ['contextFramingReset', 'Reset framing'],
        'p11-framing-reference': ['contextFramingReference', 'Preview frame'],
        'p11-audio-kicker': ['contextAudioKicker', 'AUDIO'],
        'p11-audio-title': ['contextAudioTitle', 'Audio Studio'],
        'p11-audio-desc': ['contextAudioDesc', 'Enable audio, choose a section, then set its source, volume and timing.'],
        'p11-audio-tab-intro': ['contextAudioIntro', 'Intro'],
        'p11-audio-tab-loop': ['contextAudioLoop', 'Loop'],
        'p11-audio-tab-final': ['contextAudioOutro', 'Outro'],
        'p11-advanced-audio-title': ['contextAdvancedAudioTitle', 'Audio follows each Part'],
        'p11-advanced-audio-desc': ['contextAdvancedAudioDesc', 'Advanced Parts mode stores audio inside each Part. Return to the sequence editor to adjust it.'],
        'p11-advanced-audio-action': ['contextAdvancedAudioAction', 'Edit Parts'],
        'p11-performance-kicker': ['contextPerformanceKicker', 'PERFORMANCE'],
        'p11-performance-title': ['contextPerformanceTitle', 'Balance quality and boot cost'],
        'p11-performance-desc': ['contextPerformanceDesc', 'See the estimated workload and let Smart Optimize test lighter combinations.']
    };
    Object.entries(bindings).forEach(([id, [key, fallback]]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = contextualText(key, fallback);
    });
    const nav = document.getElementById('output-tool-nav');
    if (nav) nav.setAttribute('aria-label', contextualText('contextToolsAria', 'Output tools'));
    const editNav = document.getElementById('edit-tool-dock');
    if (editNav) editNav.setAttribute('aria-label', contextualText('editToolsAria', 'Editor tools'));
    const canvas = document.getElementById('framing-tool-canvas');
    if (canvas) canvas.setAttribute('aria-label', contextualText('contextFramingPreviewAria', 'Framing preview'));
    window.BASComposition?.syncText?.();
}

function bindContextualTools() {
    document.querySelectorAll('.output-tool-tab[data-output-tool]').forEach(button => {
        button.addEventListener('click', () => setOutputTool(button.dataset.outputTool));
    });
    document.querySelectorAll('.edit-tool-button[data-edit-tool]').forEach(button => {
        button.addEventListener('click', () => setEditTool(button.dataset.editTool));
    });
    document.querySelectorAll('.audio-role-tab[data-audio-role]').forEach(button => {
        button.addEventListener('click', () => setAudioRole(button.dataset.audioRole));
    });
    document.querySelectorAll('.framing-mode-tab[data-framing-mode]').forEach(button => {
        button.addEventListener('click', () => applyFramingToolMode(button.dataset.framingMode));
    });
    const zoom = document.getElementById('framing-zoom-slider');
    if (zoom) {
        zoom.addEventListener('input', () => applyFramingToolZoom(zoom.value));
        zoom.addEventListener('change', () => {
            if (!!window.BASPerformance?.scheduleEstimate) window.BASPerformance?.scheduleEstimate?.();
        });
    }
    const reference = document.getElementById('framing-reference-slider');
    if (reference) {
        reference.addEventListener('input', () => {
            contextualUi.framingReference = Math.max(0.05, Math.min(0.95, Number(reference.value) || 0.5));
            syncFramingToolUi();
            seekFramingReferenceVideo();
        });
    }
    const reset = document.getElementById('framing-tool-reset');
    if (reset) {
        reset.addEventListener('click', () => {
            window.BASFraming.resetFocus();
            window.BASTimelineFraming?.applyFocusVisuals?.();
            syncFramingToolUi();
            renderFramingToolFrame();
            if (!!window.BASPerformance?.scheduleEstimate) window.BASPerformance?.scheduleEstimate?.();
        });
    }
    const canvas = document.getElementById('framing-tool-canvas');
    const shell = document.getElementById('framing-tool-preview-shell');
    if (canvas && shell) {
        canvas.addEventListener('pointerdown', event => {
            const settings = getFramingToolSettings();
            if (settings.mode !== 'cover' || !window.BASState.currentProject) return;
            contextualUi.framingPointerId = event.pointerId;
            contextualUi.framingStartPoint = { x: event.clientX, y: event.clientY };
            contextualUi.framingStartFocus = settings.focus;
            contextualUi.framingMoved = false;
            canvas.setPointerCapture(event.pointerId);
            canvas.classList.add('is-dragging');
        });
        canvas.addEventListener('pointermove', event => {
            if (contextualUi.framingPointerId !== event.pointerId) return;
            const dx = event.clientX - contextualUi.framingStartPoint.x;
            const dy = event.clientY - contextualUi.framingStartPoint.y;
            const sourceWidth = window.BASState.playerVideo.videoWidth || window.BASState.sourceWidth || 1;
            const sourceHeight = window.BASState.playerVideo.videoHeight || window.BASState.sourceHeight || 1;
            const metrics = window.BASTimelineFraming.getCoverMetrics(shell, sourceWidth, sourceHeight, contextualUi.framingStartFocus.zoom);
            const nextX = metrics.x > 0.5 ? contextualUi.framingStartFocus.x - dx / metrics.x : 0.5;
            const nextY = metrics.y > 0.5 ? contextualUi.framingStartFocus.y - dy / metrics.y : 0.5;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) contextualUi.framingMoved = true;
            window.BASFraming.setFocus(nextX, nextY, contextualUi.framingStartFocus.zoom);
            window.BASTimelineFraming?.applyFocusVisuals?.();
            renderFramingToolFrame();
            event.preventDefault();
        });
        canvas.addEventListener('pointerup', finishFramingToolPan);
        canvas.addEventListener('pointercancel', finishFramingToolPan);
    }
    const framingInputs = ['input-largura', 'input-altura', 'input-qualidade', 'input-enquadramento'];
    framingInputs.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.addEventListener('input', () => {
            syncFramingToolUi();
            renderFramingToolFrame();
        });
        element.addEventListener('change', () => {
            syncFramingToolUi();
            renderFramingToolFrame();
        });
    });
    ['loadedmetadata', 'loadeddata'].forEach(type => window.BASState.playerVideo?.addEventListener(type, () => {
        if (type === 'loadedmetadata') {
            contextualUi.framingReference = 0.5;
            framingReferenceSource = '';
            syncFramingReferenceSource();
        }
        if (contextualUi.outputTool === 'framing') renderFramingToolFrame();
    }));
    window.addEventListener('resize', () => {
        if (contextualUi.outputTool === 'framing') {
            syncFramingToolUi();
            renderFramingToolFrame();
        }
    }, { passive: true });
    const advancedEditor = document.getElementById('advanced-parts-editor');
    if (advancedEditor) {
        new MutationObserver(syncContextualAudioMode).observe(advancedEditor, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    const editParts = document.getElementById('btn-audio-open-parts');
    if (editParts) {
        editParts.addEventListener('click', () => {
            window.BASWorkspace?.setView?.('edit');
            setEditTool('parts', { scroll: true });
        });
    }
    const editor = document.getElementById('editor-section');
    if (editor) {
        new MutationObserver(() => {
            if (editor.dataset.mobileView === 'settings' && contextualUi.outputTool === 'framing') requestAnimationFrame(renderFramingToolFrame);
        }).observe(editor, { attributes: true, attributeFilter: ['data-mobile-view'] });
    }
    setOutputTool(contextualUi.outputTool);
    setEditTool(contextualUi.editTool);
    setAudioRole(contextualUi.audioRole);
    syncContextualToolsText();
    syncContextualAudioMode();
}

window.BASContextual = Object.freeze({
    setOutputTool,
    setEditTool,
    setAudioRole,
    syncFramingToolUi,
    renderFramingToolFrame,
    syncAudioMode: syncContextualAudioMode,
    syncText: syncContextualToolsText
});
window.addEventListener('DOMContentLoaded', bindContextualTools);
window.setOutputTool = setOutputTool;
window.setEditTool = setEditTool;
window.setAudioRole = setAudioRole;
window.syncFramingToolUi = syncFramingToolUi;
window.renderFramingToolFrame = renderFramingToolFrame;
window.syncContextualAudioMode = syncContextualAudioMode;
window.syncContextualToolsText = syncContextualToolsText;
