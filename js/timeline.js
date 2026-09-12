function getCurrentFramingSettings() {
    const width = Math.max(1, parseInt(document.getElementById('input-largura').value) || originalW || playerVideo.videoWidth || 1);
    const height = Math.max(1, parseInt(document.getElementById('input-altura').value) || originalH || playerVideo.videoHeight || 1);
    const mode = normalizeFramingMode(document.getElementById('input-enquadramento').value);
    const focus = getCurrentFramingFocus();
    return { width, height, mode, focus };
}

function getCoverPreviewMetrics(wrapper, sourceWidth, sourceHeight, zoom = 1) {
    if (!wrapper || !sourceWidth || !sourceHeight) return { x: 0, y: 0, width: 0, height: 0, targetWidth: 0, targetHeight: 0 };
    const targetWidth = Math.max(1, wrapper.clientWidth);
    const targetHeight = Math.max(1, wrapper.clientHeight);
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * normalizeFramingZoomValue(zoom);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
        x: Math.max(0, width - targetWidth),
        y: Math.max(0, height - targetHeight),
        width,
        height,
        targetWidth,
        targetHeight
    };
}

function getCurrentCoverPreviewMetrics(zoom = null) {
    const wrapper = document.getElementById('framing-preview');
    const sourceWidth = playerVideo.videoWidth || originalW || 1;
    const sourceHeight = playerVideo.videoHeight || originalH || 1;
    const focus = getCurrentFramingFocus();
    return getCoverPreviewMetrics(wrapper, sourceWidth, sourceHeight, zoom === null ? focus.zoom : zoom);
}

function clearCoverPreviewLayout(video) {
    video.style.position = '';
    video.style.left = '';
    video.style.top = '';
    video.style.width = '';
    video.style.height = '';
    video.style.maxHeight = '';
    video.style.transform = '';
    video.style.transformOrigin = '';
    video.style.willChange = '';
    video.style.objectPosition = '';
}

function applyCoverPreviewLayout(video, wrapper, sourceWidth, sourceHeight, focus) {
    if (!video || !wrapper || wrapper.clientWidth <= 0 || wrapper.clientHeight <= 0) return;
    const metrics = getCoverPreviewMetrics(wrapper, sourceWidth, sourceHeight, focus.zoom);
    const offsetX = -metrics.x * focus.x;
    const offsetY = -metrics.y * focus.y;
    video.style.position = 'absolute';
    video.style.left = '0';
    video.style.top = '0';
    video.style.width = `${metrics.width}px`;
    video.style.height = `${metrics.height}px`;
    video.style.maxHeight = 'none';
    video.style.objectFit = 'fill';
    video.style.objectPosition = '50% 50%';
    video.style.transformOrigin = 'top left';
    video.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    video.style.willChange = 'transform';
}

function applyFramingFocusVisuals(settings = getCurrentFramingSettings()) {
    const focus = settings.focus || getCurrentFramingFocus();
    const sourceWidth = playerVideo.videoWidth || originalW || 1;
    const sourceHeight = playerVideo.videoHeight || originalH || 1;
    const wrapper = document.getElementById('framing-preview');
    const modalWrapper = document.getElementById('modal-framing-preview');
    const coverActive = settings.mode === 'cover' && sourceWidth > 0 && sourceHeight > 0;

    if (coverActive) {
        applyCoverPreviewLayout(playerVideo, wrapper, sourceWidth, sourceHeight, focus);
    } else {
        clearCoverPreviewLayout(playerVideo);
        const objectFit = settings.mode === 'stretch' ? 'fill' : settings.mode;
        playerVideo.style.objectFit = objectFit;
    }
    clearCoverPreviewLayout(videoPreview);
    renderModalPreviewFrame(settings);

    wrapper.classList.toggle('focus-draggable', coverActive);
    if (!coverActive) wrapper.classList.remove('focus-dragging');

    const metrics = getCurrentCoverPreviewMetrics();
    const moved = Math.abs(focus.zoom - 1) > 0.001 ||
        (metrics.x > 0.5 && Math.abs(focus.x - 0.5) > 0.001) ||
        (metrics.y > 0.5 && Math.abs(focus.y - 0.5) > 0.001);
    const resetButton = document.getElementById('btn-reset-focus');
    if (resetButton) resetButton.classList.toggle('visible', coverActive && moved);

    const hint = document.getElementById('txt-dicavideo');
    const t = traducoes[idiomaAtual];
    if (hint && t) hint.textContent = coverActive ? t.dicaVideoCover : t.dicaVideo;
}

function sizeFramingPreview(wrapper, maxWidth, maxHeight, width, height) {
    if (!wrapper || maxWidth <= 0 || maxHeight <= 0) return;
    const ratio = Math.max(0.01, width / height);
    let boxWidth = maxWidth;
    let boxHeight = boxWidth / ratio;
    if (boxHeight > maxHeight) {
        boxHeight = maxHeight;
        boxWidth = boxHeight * ratio;
    }
    wrapper.style.width = `${Math.max(1, Math.floor(boxWidth))}px`;
    wrapper.style.height = `${Math.max(1, Math.floor(boxHeight))}px`;
}

window.atualizarPreviewEnquadramento = function() {
    const settings = getCurrentFramingSettings();
    const wrapper = document.getElementById('framing-preview');
    const availableWidth = Math.max(1, videoContainer.clientWidth || 450);
    sizeFramingPreview(wrapper, availableWidth, Math.max(120, window.innerHeight * 0.35), settings.width, settings.height);

    const modalWrapper = document.getElementById('modal-framing-preview');
    sizeFramingPreview(modalWrapper, Math.max(1, Math.min(window.innerWidth * 0.8, 520)), Math.max(120, window.innerHeight * 0.55), settings.width, settings.height);
    applyFramingFocusVisuals(settings);
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

window.addEventListener('resize', () => atualizarPreviewEnquadramento());

let modalPreviewFrame = 0;

function getModalPreviewCanvas() {
    return document.getElementById('video-preview-canvas');
}

function syncModalPreviewCanvas(settings = getCurrentFramingSettings()) {
    const canvas = getModalPreviewCanvas();
    if (!canvas) return null;
    const width = Math.max(1, settings.width);
    const height = Math.max(1, settings.height);
    const maxDimension = 960;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    return canvas;
}

function renderModalPreviewFrame(settings = getCurrentFramingSettings()) {
    const modal = document.getElementById('modal-preview');
    if (!modal || modal.style.display === 'none') return;
    const canvas = syncModalPreviewCanvas(settings);
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (videoPreview.readyState >= 2 && videoPreview.videoWidth > 0 && videoPreview.videoHeight > 0) {
        drawFramedDrawable(ctx, videoPreview, canvas.width, canvas.height, settings.mode, settings.focus);
    }
}

function modalPreviewRenderLoop() {
    renderModalPreviewFrame();
    modalPreviewFrame = requestAnimationFrame(modalPreviewRenderLoop);
}

function startModalPreviewRenderer() {
    if (modalPreviewFrame) cancelAnimationFrame(modalPreviewFrame);
    modalPreviewFrame = requestAnimationFrame(modalPreviewRenderLoop);
}

function stopModalPreviewRenderer() {
    if (modalPreviewFrame) cancelAnimationFrame(modalPreviewFrame);
    modalPreviewFrame = 0;
}

videoPreview.addEventListener('loadeddata', () => renderModalPreviewFrame());
videoPreview.addEventListener('seeked', () => renderModalPreviewFrame());

const framingPointers = new Map();
let framingGestureMode = '';
let framingGestureMoved = false;
let framingPanStartPoint = { x: 0, y: 0 };
let framingPanStartFocus = { x: 0.5, y: 0.5, zoom: 1 };
let framingPinchStartDistance = 1;
let framingPinchStartZoom = 1;
let framingPinchAnchor = { x: 0.5, y: 0.5 };
let framingVisualFrame = 0;
let framingWheelEstimateTimer = 0;
let suppressFramingClickUntil = 0;

function queueFramingVisualUpdate() {
    if (framingVisualFrame) return;
    framingVisualFrame = requestAnimationFrame(() => {
        framingVisualFrame = 0;
        applyFramingFocusVisuals();
    });
}

function getFramingPointerPair() {
    return Array.from(framingPointers.values()).slice(0, 2);
}

function getPointerDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function getPointerMidpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function beginFramingPan(pointer) {
    framingGestureMode = 'pan';
    framingPanStartPoint = { x: pointer.x, y: pointer.y };
    framingPanStartFocus = getCurrentFramingFocus();
}

function beginFramingPinch() {
    const pair = getFramingPointerPair();
    if (pair.length < 2) return;
    const wrapper = document.getElementById('framing-preview');
    const rect = wrapper.getBoundingClientRect();
    const focus = getCurrentFramingFocus();
    const metrics = getCurrentCoverPreviewMetrics(focus.zoom);
    const midpoint = getPointerMidpoint(pair[0], pair[1]);
    const localX = midpoint.x - rect.left;
    const localY = midpoint.y - rect.top;
    const left = -metrics.x * focus.x;
    const top = -metrics.y * focus.y;
    framingPinchAnchor = {
        x: Math.max(0, Math.min(1, (localX - left) / Math.max(1, metrics.width))),
        y: Math.max(0, Math.min(1, (localY - top) / Math.max(1, metrics.height)))
    };
    framingPinchStartDistance = Math.max(1, getPointerDistance(pair[0], pair[1]));
    framingPinchStartZoom = focus.zoom;
    framingGestureMode = 'pinch';
    framingGestureMoved = true;
    playerVideo.pause();
    wrapper.classList.add('focus-dragging');
}

function updateFramingPan(pointer, event) {
    const deltaX = pointer.x - framingPanStartPoint.x;
    const deltaY = pointer.y - framingPanStartPoint.y;
    if (!framingGestureMoved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
        framingGestureMoved = true;
        playerVideo.pause();
        document.getElementById('framing-preview').classList.add('focus-dragging');
    }
    if (!framingGestureMoved) return;
    const metrics = getCurrentCoverPreviewMetrics(framingPanStartFocus.zoom);
    const nextX = metrics.x > 0.5 ? framingPanStartFocus.x - (deltaX / metrics.x) : framingPanStartFocus.x;
    const nextY = metrics.y > 0.5 ? framingPanStartFocus.y - (deltaY / metrics.y) : framingPanStartFocus.y;
    setCurrentFramingFocus(nextX, nextY, framingPanStartFocus.zoom);
    queueFramingVisualUpdate();
    event.preventDefault();
}

function updateFramingPinch(event) {
    const pair = getFramingPointerPair();
    if (pair.length < 2) return;
    const wrapper = document.getElementById('framing-preview');
    const rect = wrapper.getBoundingClientRect();
    const midpoint = getPointerMidpoint(pair[0], pair[1]);
    const distance = Math.max(1, getPointerDistance(pair[0], pair[1]));
    const nextZoom = normalizeFramingZoomValue(framingPinchStartZoom * (distance / framingPinchStartDistance));
    const metrics = getCurrentCoverPreviewMetrics(nextZoom);
    const localX = midpoint.x - rect.left;
    const localY = midpoint.y - rect.top;
    const left = localX - framingPinchAnchor.x * metrics.width;
    const top = localY - framingPinchAnchor.y * metrics.height;
    const nextX = metrics.x > 0.5 ? -left / metrics.x : 0.5;
    const nextY = metrics.y > 0.5 ? -top / metrics.y : 0.5;
    setCurrentFramingFocus(nextX, nextY, nextZoom);
    queueFramingVisualUpdate();
    event.preventDefault();
}

function finishFramingGesture(pointerId, cancelled = false) {
    framingPointers.delete(pointerId);
    if (playerVideo.hasPointerCapture(pointerId)) playerVideo.releasePointerCapture(pointerId);

    if (framingPointers.size >= 2) {
        beginFramingPinch();
        return;
    }

    if (framingPointers.size === 1) {
        const remaining = Array.from(framingPointers.values())[0];
        beginFramingPan(remaining);
        return;
    }

    document.getElementById('framing-preview').classList.remove('focus-dragging');
    suppressFramingClickUntil = !cancelled && framingGestureMoved ? Date.now() + 350 : 0;
    framingGestureMode = '';
    if (framingGestureMoved && typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
    framingGestureMoved = false;
}

playerVideo.addEventListener('pointerdown', event => {
    if (isGenerating || isBuildingTimeline) return;
    const settings = getCurrentFramingSettings();
    if (settings.mode !== 'cover' || !(playerVideo.videoWidth || originalW)) return;

    framingPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    playerVideo.setPointerCapture(event.pointerId);
    suppressFramingClickUntil = 0;

    if (framingPointers.size === 1) {
        framingGestureMoved = false;
        beginFramingPan({ x: event.clientX, y: event.clientY });
    } else if (framingPointers.size === 2) {
        beginFramingPinch();
    }
});

playerVideo.addEventListener('pointermove', event => {
    if (!framingPointers.has(event.pointerId)) return;
    framingPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (framingPointers.size >= 2) {
        if (framingGestureMode !== 'pinch') beginFramingPinch();
        updateFramingPinch(event);
    } else if (framingGestureMode === 'pan') {
        updateFramingPan({ x: event.clientX, y: event.clientY }, event);
    }
});

playerVideo.addEventListener('pointerup', event => finishFramingGesture(event.pointerId));
playerVideo.addEventListener('pointercancel', event => finishFramingGesture(event.pointerId, true));

playerVideo.addEventListener('wheel', event => {
    if (isGenerating || isBuildingTimeline) return;
    const settings = getCurrentFramingSettings();
    if (settings.mode !== 'cover' || !(playerVideo.videoWidth || originalW)) return;
    event.preventDefault();

    const wrapper = document.getElementById('framing-preview');
    const rect = wrapper.getBoundingClientRect();
    const focus = getCurrentFramingFocus();
    const currentMetrics = getCurrentCoverPreviewMetrics(focus.zoom);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const currentLeft = -currentMetrics.x * focus.x;
    const currentTop = -currentMetrics.y * focus.y;
    const anchorX = Math.max(0, Math.min(1, (localX - currentLeft) / Math.max(1, currentMetrics.width)));
    const anchorY = Math.max(0, Math.min(1, (localY - currentTop) / Math.max(1, currentMetrics.height)));
    const nextZoom = normalizeFramingZoomValue(focus.zoom * Math.exp(-event.deltaY * 0.0015));
    const nextMetrics = getCurrentCoverPreviewMetrics(nextZoom);
    const nextLeft = localX - anchorX * nextMetrics.width;
    const nextTop = localY - anchorY * nextMetrics.height;
    const nextX = nextMetrics.x > 0.5 ? -nextLeft / nextMetrics.x : 0.5;
    const nextY = nextMetrics.y > 0.5 ? -nextTop / nextMetrics.y : 0.5;
    setCurrentFramingFocus(nextX, nextY, nextZoom);
    queueFramingVisualUpdate();

    clearTimeout(framingWheelEstimateTimer);
    framingWheelEstimateTimer = setTimeout(() => {
        if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
    }, 180);
}, { passive: false });

const resetFramingFocusButton = document.getElementById('btn-reset-focus');
if (resetFramingFocusButton) {
    resetFramingFocusButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        resetCurrentFramingFocus();
        applyFramingFocusVisuals();
        if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
    });
}

videoPreview.addEventListener('timeupdate', () => {
    if (typeof handleAdvancedPreviewTimeUpdate === 'function' && handleAdvancedPreviewTimeUpdate()) return;
    let t = videoPreview.currentTime;
    
    if (t >= marcadores.m3) { 
        videoPreview.currentTime = marcadores.m0;
        t = marcadores.m0;
        currentPreviewPart = -1;
    }

    if (document.getElementById('input-usar-som').checked) {
        let part = 'm0';
        if (t >= marcadores.m1 && t < marcadores.m2) part = 'm1';
        else if (t >= marcadores.m2) part = 'm2';

        if (part !== currentPreviewPart) {
            ['m0', 'm1', 'm2'].forEach(k => previewAudios[k].pause());
            if (previewAudios[part] && previewAudios[part].src) {
                previewAudios[part].currentTime = 0;
                previewAudios[part].play().catch(e=>{});
            }
            currentPreviewPart = part;
        }
    }
});

playerVideo.addEventListener('click', () => {
    if (Date.now() <= suppressFramingClickUntil) {
        suppressFramingClickUntil = 0;
        return;
    }
    if (isGenerating || isBuildingTimeline) return; 
    if (playerVideo.paused) { playerVideo.play(); } 
    else { playerVideo.pause(); }
});

playerVideo.addEventListener('pause', () => {
    playerVideo.classList.add('pausado');
    cancelAnimationFrame(animationFrameId);
});

playerVideo.addEventListener('play', () => {
    playerVideo.classList.remove('pausado');
    animationFrameId = requestAnimationFrame(animarTimelineSmooth);
});

function animarTimelineSmooth() {
    if (!playerVideo.paused && !isGenerating && !isBuildingTimeline && playerVideo.duration) {
        const percent = playerVideo.currentTime / playerVideo.duration;
        isProgrammaticScroll = true;
        scrollTimeline.scrollLeft = percent * filmstrip.offsetWidth;
        setTimeout(() => { isProgrammaticScroll = false; }, 20);
        animationFrameId = requestAnimationFrame(animarTimelineSmooth);
    }
}

function ajustarPaddings() {
    const pad = (timelineWrapper.clientWidth / 2) + "px";
    document.getElementById('pad-left').style.width = pad;
    document.getElementById('pad-left').style.minWidth = pad;
    document.getElementById('pad-right').style.width = pad;
    document.getElementById('pad-right').style.minWidth = pad;
}
window.addEventListener('resize', ajustarPaddings);

function showTooltip(e, idBtn) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        const t = traducoes[idiomaAtual];
        tooltipFlutuante.textContent = t['tipM' + idBtn];
        
        let rect = e.target.closest('button').getBoundingClientRect();
        
        let leftPos = rect.left + (rect.width / 2) - (tooltipFlutuante.offsetWidth / 2);
        if (leftPos < 10) leftPos = 10;
        if (leftPos + tooltipFlutuante.offsetWidth > window.innerWidth - 10) leftPos = window.innerWidth - tooltipFlutuante.offsetWidth - 10;
        
        tooltipFlutuante.style.left = leftPos + 'px';
        tooltipFlutuante.style.top = (rect.top + window.scrollY - tooltipFlutuante.offsetHeight - 10) + 'px';
        
        tooltipFlutuante.classList.add('visivel');
    }, 600);
}

function hideTooltip() {
    clearTimeout(tooltipTimeout);
    tooltipFlutuante.classList.remove('visivel');
}

let lastTouchTime = 0;
document.querySelectorAll('.btn-marc').forEach(btn => {
    const idBtn = btn.classList[1].split('-')[1].replace('m', ''); 
    
    btn.addEventListener('touchstart', (e) => {
        lastTouchTime = Date.now();
        showTooltip(e, idBtn);
    }, {passive: true});
    
    btn.addEventListener('touchend', hideTooltip);
    btn.addEventListener('touchcancel', hideTooltip);
    
    btn.addEventListener('mouseenter', (e) => {
        if (Date.now() - lastTouchTime > 500) {
            showTooltip(e, idBtn);
        }
    });
    
    btn.addEventListener('mouseleave', hideTooltip);
    
    btn.addEventListener('click', hideTooltip);
});

inputVideo.addEventListener('change', function(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    evento.target.value = '';

    resetAudioState();

    const isGif = arquivo.type === 'image/gif' || /\.gif$/i.test(arquivo.name || '');
    if (isGif) {
        converterGifParaVideo(arquivo);
        return;
    }

    setCurrentProject(createTemporalProject('video', arquivo));
    dicasIniciais.style.display = 'none';
    setPlayerBlob(arquivo);
    videoContainer.style.display = 'block';
    timelineWrapper.style.display = 'block';
    gridMarcadores.style.display = 'grid';
    configuracoes.style.display = 'grid';
    btnVerPreview.style.display = 'none';
    document.getElementById('botoes-exportacao').style.display = 'none';
    document.getElementById('txt-hint-tooltip').style.display = 'block';
    atualizarBotoesELinhas();
});

playerVideo.addEventListener('loadedmetadata', async function() {
    syncCurrentProjectWithPlayer();
    atualizarTamanho();
    atualizarPreviewEnquadramento();
    ajustarPaddings();
    
    document.getElementById('loading-overlay').style.display = 'flex';
    playerVideo.style.opacity = '0';
    
    await desenharFilmstrip();
    if (typeof syncAdvancedPartsUi === 'function') syncAdvancedPartsUi();
    atualizarBotoesELinhas();
    
    playerVideo.style.opacity = '1';
    document.getElementById('loading-overlay').style.display = 'none';
});

let isMouseDown = false;
let startX;
let scrollLeftPos;

scrollTimeline.addEventListener('touchstart', () => { 
    if (isGenerating || isBuildingTimeline) return; 
    playerVideo.pause(); 
}, {passive: true});

scrollTimeline.addEventListener('mousedown', (e) => {
    if (isGenerating || isBuildingTimeline) return; 
    isMouseDown = true;
    playerVideo.pause();
    startX = e.pageX - scrollTimeline.offsetLeft;
    scrollLeftPos = scrollTimeline.scrollLeft;
    scrollTimeline.style.cursor = 'grabbing';
});

scrollTimeline.addEventListener('mouseleave', () => {
    isMouseDown = false;
    scrollTimeline.style.cursor = 'grab';
});

window.addEventListener('mouseup', () => {
    isMouseDown = false;
    scrollTimeline.style.cursor = 'grab';
});

scrollTimeline.addEventListener('mousemove', (e) => {
    if (!isMouseDown || isGenerating || isBuildingTimeline) return; 
    e.preventDefault();
    const x = e.pageX - scrollTimeline.offsetLeft;
    const walk = (x - startX) * 1.5; 
    scrollTimeline.scrollLeft = scrollLeftPos - walk;
});

let isSeeking = false;
let targetTime = 0;

scrollTimeline.addEventListener('scroll', () => {
    if (isProgrammaticScroll || isBuildingTimeline || !playerVideo.paused || !playerVideo.duration || isGenerating) return;
    
    let percent = scrollTimeline.scrollLeft / filmstrip.offsetWidth;
    percent = Math.max(0, Math.min(1, percent));
    targetTime = percent * playerVideo.duration;

    if (!isSeeking && Math.abs(playerVideo.currentTime - targetTime) > 0.01) {
        isSeeking = true;
        playerVideo.currentTime = targetTime;
    }
});

playerVideo.addEventListener('seeked', () => {
    isSeeking = false;
    if (playerVideo.paused && !isGenerating && !isBuildingTimeline && Math.abs(playerVideo.currentTime - targetTime) > 0.01) {
        isSeeking = true;
        playerVideo.currentTime = targetTime;
    }
});

async function desenharFilmstrip() {
    isBuildingTimeline = true;
    filmstrip.innerHTML = '';
    const dur = playerVideo.duration;
    
    let framesPorSegundo = dur < 5 ? 5 : dur < 10 ? 3 : dur < 20 ? 2 : 1; 
    let numFrames = Math.ceil(dur * framesPorSegundo);
    numFrames = Math.max(10, Math.min(numFrames, 50)); 
    
    const larguraFrame = 70; 
    filmstrip.style.width = (numFrames * larguraFrame) + 'px';
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 100;
    tempCanvas.height = Math.floor((originalH / originalW) * 100);
    const tempCtx = tempCanvas.getContext('2d', { alpha: false });
    
    for (let i = 0; i < numFrames; i++) {
        const tempoAlvo = Math.min(dur - 0.05, Math.max(0.01, ((i + 0.5) / numFrames) * dur));
        
        await new Promise(r => {
            const cb = () => { 
                playerVideo.removeEventListener('seeked', cb); 
                requestAnimationFrame(() => r());
            };
            playerVideo.addEventListener('seeked', cb);
            playerVideo.currentTime = tempoAlvo;
        });

        tempCtx.drawImage(playerVideo, 0, 0, tempCanvas.width, tempCanvas.height);
        
        const img = document.createElement('img');
        img.src = tempCanvas.toDataURL('image/jpeg', 0.5);
        img.style.width = (100 / numFrames) + '%';
        filmstrip.appendChild(img);
    }

    playerVideo.currentTime = 0;
    isProgrammaticScroll = true;
    scrollTimeline.scrollLeft = 0;
    
    setTimeout(() => { 
        isProgrammaticScroll = false; 
        isBuildingTimeline = false; 
    }, 100);
}

window.marcarTrecho = function(id) {
    if (isGenerating || isBuildingTimeline) return; 
    marcadores[id] = playerVideo.currentTime; 
    atualizarBotoesELinhas();
}

function atualizarBotoesELinhas() {
    document.querySelectorAll('.linha-marcador').forEach(el => el.remove());
    document.querySelectorAll('.linha-parte-avancada').forEach(el => el.remove());
    const t = traducoes[idiomaAtual];

    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        const temVideo = document.getElementById('video-container').style.display === 'block';
        btnVerPreview.style.display = 'none';
        if (typeof renderAdvancedPartLines === 'function') renderAdvancedPartLines();
        const validation = typeof validateAdvancedParts === 'function' ? validateAdvancedParts() : { valid: false, message: t.advInvalidParts || t.btnFaltam };
        if (temVideo) btnGerar.style.display = 'block';
        else btnGerar.style.display = 'none';
        if (validation.valid) {
            btnGerar.classList.remove('btn-desativado');
            btnGerar.textContent = typeof getGenerateReadyLabel === 'function' ? getGenerateReadyLabel(t) : (isConnectedMode ? t.btnInjectReady : t.btnGerarPronto);
        } else {
            btnGerar.classList.add('btn-desativado');
            btnGerar.textContent = validation.message || t.advInvalidParts || t.btnFaltam;
        }
        if (typeof updateOutputIntent === 'function') updateOutputIntent();
        if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
        return;
    }
    let tudoMarcado = true;
    let temposOrdem = [];

    const temVideo = (document.getElementById('video-container').style.display === 'block');

    btnVerPreview.style.display = 'none';

    ['m0', 'm1', 'm2', 'm3'].forEach(id => {
        const tempo = marcadores[id];
        const spanStatus = document.getElementById(`st-${id}`);
        
        if (tempo !== null) {
            const tempoExibido = timelineTimeToProjectTime(tempo);
            spanStatus.textContent = tempoExibido.toFixed(2) + 's';
            temposOrdem.push(tempo);
            
            const linha = document.createElement('div');
            linha.className = `linha-marcador linha-${id}`;
            linha.style.left = ((tempo / playerVideo.duration) * 100) + '%';
            
            linha.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isGenerating || isBuildingTimeline) return;
                playerVideo.currentTime = tempo;
                isProgrammaticScroll = true;
                scrollTimeline.scrollLeft = (tempo / playerVideo.duration) * filmstrip.offsetWidth;
                setTimeout(() => { isProgrammaticScroll = false; }, 20);
                playerVideo.pause();
            });
            linha.style.cursor = 'pointer';
            filmstrip.appendChild(linha);
        } else {
            spanStatus.textContent = t.naoMarcado;
            tudoMarcado = false;
        }
    });

    if (tudoMarcado) {
        if (temposOrdem[0] <= temposOrdem[1] && temposOrdem[1] <= temposOrdem[2] && temposOrdem[2] <= temposOrdem[3]) {
            btnGerar.classList.remove('btn-desativado');
            btnGerar.textContent = typeof getGenerateReadyLabel === 'function' ? getGenerateReadyLabel(t) : (isConnectedMode ? t.btnInjectReady : t.btnGerarPronto);
            if(temVideo) btnGerar.style.display = 'block'; 
        } else {
            if(temVideo) btnGerar.style.display = 'block';
            btnGerar.classList.add('btn-desativado');
            btnGerar.textContent = t.btnOrdem;
        }
    } else {
        if(temVideo) btnGerar.style.display = 'block';
        btnGerar.classList.add('btn-desativado');
        btnGerar.textContent = t.btnFaltam;
    }
    
    if (!temVideo) {
        btnGerar.style.display = 'none';
    }
    if (typeof updateOutputIntent === 'function') updateOutputIntent();
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

function atualizarTamanho() {
    if (!originalW || !originalH) return;
    let val = document.getElementById('input-qualidade').value;
    if (val === "custom") return;

    let w = originalW; let h = originalH;
    if (val === "320" && originalW > 320) { w = 320; h = Math.floor(originalH * (320/originalW)); } 
    else if (val === "480" && originalW > 480) { w = 480; h = Math.floor(originalH * (480/originalW)); } 
    else if (val === "720" && originalW > 720) { w = 720; h = Math.floor(originalH * (720/originalW)); }
    else if (val.includes("x")) { const p = val.split("x"); w = parseInt(p[0]); h = parseInt(p[1]); }

    w = Math.floor(w / 2) * 2; h = Math.floor(h / 2) * 2;
    document.getElementById('input-largura').value = w; document.getElementById('input-altura').value = h;
    atualizarPreviewEnquadramento();
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

window.aoMudarTamanhoManual = function() {
    if (originalW === 0 || originalH === 0) return;
    let w = parseInt(document.getElementById('input-largura').value) || 0;
    let h = parseInt(document.getElementById('input-altura').value) || 0;
    let wOrig = Math.floor(originalW / 2) * 2;
    let hOrig = Math.floor(originalH / 2) * 2;
    let seletor = document.getElementById('input-qualidade');
    let checarProporcao = (alvoW) => {
        if (originalW <= alvoW) return { w: wOrig, h: hOrig };
        return { w: alvoW, h: Math.floor(Math.floor(originalH * (alvoW / originalW)) / 2) * 2 };
    };
    let p320 = checarProporcao(320); let p480 = checarProporcao(480); let p720 = checarProporcao(720);

    let pAuto = {w:0, h:0};
    const optAuto = document.getElementById('opt-auto');
    if (optAuto && optAuto.value && optAuto.value.includes("x")) {
        const pa = optAuto.value.split("x"); pAuto = {w: parseInt(pa[0]), h: parseInt(pa[1])};
    }

    if (w === p320.w && h === p320.h && p320.w !== 0) seletor.value = "320";
    else if (w === p480.w && h === p480.h && p480.w !== 0) seletor.value = "480";
    else if (w === p720.w && h === p720.h && p720.w !== 0) seletor.value = "720";
    else if (w === pAuto.w && h === pAuto.h && pAuto.w !== 0) seletor.value = optAuto.value;
    else if (w === wOrig && h === hOrig && wOrig !== 0) seletor.value = "1";
    else seletor.value = "custom";
    atualizarPreviewEnquadramento();
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}
