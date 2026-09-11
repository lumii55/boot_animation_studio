function getCurrentFramingSettings() {
    const width = Math.max(1, parseInt(document.getElementById('input-largura').value) || originalW || playerVideo.videoWidth || 1);
    const height = Math.max(1, parseInt(document.getElementById('input-altura').value) || originalH || playerVideo.videoHeight || 1);
    const mode = normalizeFramingMode(document.getElementById('input-enquadramento').value);
    return { width, height, mode };
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
    const objectFit = settings.mode === 'stretch' ? 'fill' : settings.mode;
    const wrapper = document.getElementById('framing-preview');
    const availableWidth = Math.max(1, videoContainer.clientWidth || 450);
    sizeFramingPreview(wrapper, availableWidth, Math.max(120, window.innerHeight * 0.35), settings.width, settings.height);
    playerVideo.style.objectFit = objectFit;

    const modalWrapper = document.getElementById('modal-framing-preview');
    sizeFramingPreview(modalWrapper, Math.max(1, Math.min(window.innerWidth * 0.8, 520)), Math.max(120, window.innerHeight * 0.55), settings.width, settings.height);
    videoPreview.style.objectFit = objectFit;
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

window.addEventListener('resize', () => atualizarPreviewEnquadramento());

videoPreview.addEventListener('timeupdate', () => {
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
    const t = traducoes[idiomaAtual];
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
            btnGerar.textContent = isConnectedMode ? t.btnInjectReady : t.btnGerarPronto;
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
