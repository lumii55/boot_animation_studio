async function converterGifParaVideo(file) {
    const t = traducoes[idiomaAtual];
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.msgLoadingGif;
    
    try {
        const { parseGIF, decompressFrames } = await import('https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm');
        
        const buffer = await file.arrayBuffer();
        const gif = parseGIF(buffer);
        const frames = decompressFrames(gif, true);
        
        if (!frames || frames.length === 0) throw new Error(t.msgGifEmpty);

        const w = frames[0].dims.width;
        const h = frames[0].dims.height;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
        
        let totalDelay = 0;
        frames.forEach(f => totalDelay += Math.max(20, f.delay));
        let avgDelay = totalDelay / frames.length;
        let fps = Math.round(1000 / avgDelay);
        if(fps > 60) fps = 60; 
        if(fps < 1) fps = 10;
        
        document.getElementById('txt-loading-timeline').textContent = t.msgLoadingVid;

        const stream = tempCanvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const pedacos = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) pedacos.push(e.data); };
        
        const gravacaoPronta = new Promise(res => recorder.onstop = () => res(new Blob(pedacos, {type: 'video/webm'})));
        recorder.start();

        const gifCanvas = document.createElement('canvas');
        gifCanvas.width = w; gifCanvas.height = h;
        const gifCtx = gifCanvas.getContext('2d');
        let prevImgData;
        
        const startTime = performance.now();
        let accumulatedDelay = 0;

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            
            if (i > 0 && frames[i-1].disposalType === 2) {
                gifCtx.clearRect(frames[i-1].dims.left, frames[i-1].dims.top, frames[i-1].dims.width, frames[i-1].dims.height);
            } else if (i > 0 && frames[i-1].disposalType === 3 && prevImgData) {
                gifCtx.putImageData(prevImgData, 0, 0);
            }
            
            if (frame.disposalType === 3) {
                prevImgData = gifCtx.getImageData(0, 0, w, h);
            }
            
            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = frame.dims.width; patchCanvas.height = frame.dims.height;
            const pData = new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height);
            patchCanvas.getContext('2d').putImageData(pData, 0, 0);
            
            gifCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
            
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(gifCanvas, 0, 0);
            
            accumulatedDelay += Math.max(20, frame.delay);
            const expectedTime = startTime + accumulatedDelay;
            const now = performance.now();
            const sleepTime = expectedTime - now;
            
            if (sleepTime > 0) {
                await new Promise(r => setTimeout(r, sleepTime));
            } else {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        recorder.stop();
        const videoWebm = await gravacaoPronta;
        
        document.getElementById('dicas-iniciais').style.display = 'none';
        resetAudioState();
        playerVideo.src = URL.createObjectURL(videoWebm); 
        document.getElementById('video-container').style.display = 'block';
        document.getElementById('timeline-wrapper').style.display = 'block';
        document.getElementById('grid-marcadores').style.display = 'grid';
        document.getElementById('configuracoes').style.display = 'grid';
        document.getElementById('botoes-exportacao').style.display = 'none';
        document.getElementById('btn-ver-preview').style.display = 'none';
        document.getElementById('txt-hint-tooltip').style.display = 'block';
        marcadores = { m0: null, m1: null, m2: null, m3: null };
        atualizarBotoesELinhas();
        
    } catch (error) {
        console.error(error);
        alert(t.msgGifError + error.message);
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

async function abrirZipNoEditor(zipBlob) {
    const t = traducoes[idiomaAtual];
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.msgLoadingZip;

    try {
        const zip = await JSZip.loadAsync(zipBlob);
        const descFile = zip.file("desc.txt");
        if (!descFile) throw new Error(t.msgZipNoDesc);
        
        const descText = await descFile.async("string");
        const linhas = descText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        
        const configTops = linhas[0].split(/\s+/);
        const zipW = parseInt(configTops[0]);
        const zipH = parseInt(configTops[1]);
        const zipFps = parseInt(configTops[2]) || 30;

        let temSomNoDesc = false;
        for (let i = 1; i < linhas.length; i++) {
            if (linhas[i].startsWith('s ')) {
                temSomNoDesc = true;
                break;
            }
        }

        document.getElementById('txt-loading-timeline').textContent = t.msgOrgFrames;
        
        let todasImagens = [];
        let contagemPorPasta = [];

        for (let i = 1; i < linhas.length; i++) {
            const partes = linhas[i].split(/\s+/);
            if (partes[0] === 'c' || partes[0] === 'p') {
                const nomePasta = partes[3];
                if (!nomePasta) continue;
                const nomeSeguro = escapeRegExp(nomePasta);
                const regex = new RegExp("^" + nomeSeguro + "/.*\\.(png|jpg|jpeg)$", "i");
                const arquivosPasta = zip.file(regex);
                const arquivosAudio = zip.file(new RegExp("^" + nomeSeguro + "/audio\\.wav$", "i"));
                
                arquivosPasta.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
                
                for (let arq of arquivosPasta) {
                    const imgBlob = await arq.async("blob");
                    todasImagens.push(imgBlob);
                }

                let audioBlob = null;
                let audioName = null;
                if (arquivosAudio.length > 0) {
                    audioBlob = await arquivosAudio[0].async("blob");
                    audioName = arquivosAudio[0].name.split('/').pop() || 'audio.wav';
                }
                
                contagemPorPasta.push({ nome: nomePasta, frames: arquivosPasta.length, audioBlob, audioName });
            }
        }

        if (todasImagens.length === 0) throw new Error(t.msgZipNoParts);

        resetAudioState();
        const partesComAudio = contagemPorPasta.filter(parte => parte.audioBlob);
        if (contagemPorPasta.length === 1) {
            if (contagemPorPasta[0].audioBlob) setImportedAudio('loop', contagemPorPasta[0].audioBlob, contagemPorPasta[0].audioName);
        } else if (contagemPorPasta.length === 2) {
            if (contagemPorPasta[0].audioBlob) setImportedAudio('intro', contagemPorPasta[0].audioBlob, contagemPorPasta[0].audioName);
            if (contagemPorPasta[1].audioBlob) setImportedAudio('loop', contagemPorPasta[1].audioBlob, contagemPorPasta[1].audioName);
        } else if (contagemPorPasta.length >= 3) {
            if (contagemPorPasta[0].audioBlob) setImportedAudio('intro', contagemPorPasta[0].audioBlob, contagemPorPasta[0].audioName);
            const parteLoop = contagemPorPasta.slice(1, -1).find(parte => parte.audioBlob);
            if (parteLoop) setImportedAudio('loop', parteLoop.audioBlob, parteLoop.audioName);
            const parteFinal = contagemPorPasta[contagemPorPasta.length - 1];
            if (parteFinal.audioBlob) setImportedAudio('final', parteFinal.audioBlob, parteFinal.audioName);
        }
        if (temSomNoDesc || partesComAudio.length > 0) {
            document.getElementById('input-usar-som').checked = true;
            verificarPainelAudio();
        }

        document.getElementById('txt-loading-timeline').textContent = t.msgStitching;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = zipW;
        tempCanvas.height = zipH;
        const ctx = tempCanvas.getContext('2d');

        const stream = tempCanvas.captureStream(zipFps);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const pedacosVideo = [];

        recorder.ondataavailable = e => { if (e.data.size > 0) pedacosVideo.push(e.data); };
        
        const gravacaoPronta = new Promise(resolve => {
            recorder.onstop = () => resolve(new Blob(pedacosVideo, { type: 'video/webm' }));
        });

        recorder.start();

        const frameTime = 1000 / zipFps;
        const startTime = performance.now();
        
        for (let i = 0; i < todasImagens.length; i++) {
            const img = new Image();
            img.src = URL.createObjectURL(todasImagens[i]);
            await new Promise(r => img.onload = r);
            
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, zipW, zipH);
            ctx.drawImage(img, 0, 0, zipW, zipH);
            URL.revokeObjectURL(img.src);

            const expectedTime = startTime + ((i + 1) * frameTime);
            const now = performance.now();
            const sleepTime = expectedTime - now;
            
            if (sleepTime > 0) {
                await new Promise(r => setTimeout(r, sleepTime));
            } else {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        recorder.stop();
        const videoWebm = await gravacaoPronta;

        document.getElementById('dicas-iniciais').style.display = 'none';
        document.getElementById('botoes-exportacao').style.display = 'flex';
        document.getElementById('video-container').style.display = 'block';
        document.getElementById('timeline-wrapper').style.display = 'block';
        document.getElementById('grid-marcadores').style.display = 'grid';
        document.getElementById('configuracoes').style.display = 'grid';
        document.getElementById('btn-gerar').style.display = 'block';
        document.getElementById('btn-ver-preview').style.display = 'none';
        document.getElementById('txt-hint-tooltip').style.display = 'block';
        
        document.getElementById('input-fps').value = zipFps;
        document.getElementById('input-largura').value = zipW;
        document.getElementById('input-altura').value = zipH;
        document.getElementById('input-qualidade').value = "custom";
        
        let totalFramesGerais = 0;
        let m1_idx = 0;
        let m2_idx = 0;

        if (contagemPorPasta.length === 1) {
            totalFramesGerais = contagemPorPasta[0].frames;
            m1_idx = 0;
            m2_idx = totalFramesGerais - 1;
        } else if (contagemPorPasta.length === 2) {
            m1_idx = contagemPorPasta[0].frames - 1;
            m2_idx = contagemPorPasta[0].frames + contagemPorPasta[1].frames - 1;
            totalFramesGerais = contagemPorPasta[0].frames + contagemPorPasta[1].frames;
        } else {
            let acc = 0;
            for (let idx = 0; idx < contagemPorPasta.length; idx++) {
                acc += contagemPorPasta[idx].frames;
                if (idx === 0) m1_idx = acc - 1;
                if (idx === contagemPorPasta.length - 2) m2_idx = acc - 1;
            }
            totalFramesGerais = acc;
        }

        marcadores.m0 = 0;
        marcadores.m1 = Math.max(0, m1_idx / zipFps);
        marcadores.m2 = Math.max(marcadores.m1, m2_idx / zipFps);
        marcadores.m3 = Math.max(marcadores.m2, (totalFramesGerais - 1) / zipFps);

        playerVideo.src = URL.createObjectURL(videoWebm);
        
        playerVideo.onloadedmetadata = async () => {
            originalW = zipW;
            originalH = zipH;
            atualizarTamanho();
            ajustarPaddings();
            await desenharFilmstrip(); 
            atualizarBotoesELinhas(); 
            document.getElementById('loading-overlay').style.display = 'none';
            playerVideo.onloadedmetadata = null;
        };

    } catch (error) {
        console.error(error);
        alert(t.msgZipReadError + error.message);
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

function baixarVideo() {
    if (!playerVideo.src) return;
    const linkDownload = document.createElement("a");
    linkDownload.href = playerVideo.src;
    linkDownload.download = "bootanimation_video.webm"; 
    linkDownload.click();
}

function baixarZipEditado() {
    btnGerar.click(); 
}

function verificarModulo() {
    const isModulo = document.getElementById('input-gerar-modulo').checked;
    const containerFabricante = document.getElementById('container-fabricante');
    if (isModulo) { containerFabricante.style.display = "flex"; } else { containerFabricante.style.display = "none"; }
}

function verificarPainelAudio() {
    const usaAudio = document.getElementById('input-usar-som').checked;
    document.getElementById('painel-audio').style.display = usaAudio ? "flex" : "none";
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearPreviewAudio(part) {
    const audio = previewAudios[part];
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (previewAudioUrls[part]) {
        URL.revokeObjectURL(previewAudioUrls[part]);
        previewAudioUrls[part] = null;
    }
}

function setPreviewAudio(part, blob) {
    clearPreviewAudio(part);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    previewAudioUrls[part] = url;
    previewAudios[part].src = url;
}

function resetAudioState() {
    const t = traducoes[idiomaAtual];
    document.getElementById('input-usar-som').checked = false;
    ['intro', 'loop', 'final'].forEach(part => {
        importedAudioFiles[part] = null;
        const select = document.getElementById(`sel-audio-${part}`);
        const inputFile = document.getElementById(`file-audio-${part}`);
        const optFile = document.getElementById(`opt-file-${part}`);
        const wrap = document.getElementById(`vol-wrap-${part}`);
        const volume = document.getElementById(`vol-${part}`);
        const volumeLabel = document.getElementById(`lbl-vol-${part}`);
        select.value = 'none';
        inputFile.value = '';
        optFile.textContent = t.optFile;
        optFile.removeAttribute('data-custom');
        wrap.style.display = 'none';
        volume.value = 100;
        volumeLabel.textContent = '100%';
    });
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);
    currentPreviewPart = -1;
    verificarPainelAudio();
}

function setImportedAudio(part, blob, name) {
    importedAudioFiles[part] = blob;
    const select = document.getElementById(`sel-audio-${part}`);
    const optFile = document.getElementById(`opt-file-${part}`);
    const wrap = document.getElementById(`vol-wrap-${part}`);
    const label = `🎵 ${name || 'audio.wav'}`;
    select.value = 'file';
    optFile.textContent = label;
    optFile.setAttribute('data-custom', label);
    wrap.style.display = 'flex';
}

function getSelectedAudioFile(part) {
    const inputFile = document.getElementById(`file-audio-${part}`);
    return inputFile.files[0] || importedAudioFiles[part] || null;
}

function handleAudioSelect(part) {
    const select = document.getElementById(`sel-audio-${part}`);
    const wrap = document.getElementById(`vol-wrap-${part}`);
    if (select.value === 'file') {
        document.getElementById(`file-audio-${part}`).click();
        wrap.style.display = "flex";
    } else if (select.value === 'video') {
        importedAudioFiles[part] = null;
        wrap.style.display = "flex";
    } else {
        importedAudioFiles[part] = null;
        wrap.style.display = "none";
        const t = traducoes[idiomaAtual];
        document.getElementById(`opt-file-${part}`).textContent = t.optFile;
        document.getElementById(`opt-file-${part}`).removeAttribute('data-custom');
    }
}

function fileAudioSelecionado(part) {
    const inputFile = document.getElementById(`file-audio-${part}`);
    const select = document.getElementById(`sel-audio-${part}`);
    const optFile = document.getElementById(`opt-file-${part}`);
    const wrap = document.getElementById(`vol-wrap-${part}`);
    if (inputFile.files.length > 0) {
        importedAudioFiles[part] = null;
        const nome = inputFile.files[0].name;
        optFile.textContent = `🎵 ${nome}`;
        optFile.setAttribute('data-custom', `🎵 ${nome}`);
        wrap.style.display = "flex";
    } else if (!importedAudioFiles[part]) {
        select.value = "none";
        const t = traducoes[idiomaAtual];
        optFile.textContent = t.optFile;
        optFile.removeAttribute('data-custom');
        wrap.style.display = "none";
    }
}

function fecharModal() {
    videoPreview.pause();
    ['m0', 'm1', 'm2'].forEach(k => previewAudios[k].pause()); 
    document.getElementById('modal-preview').style.display = 'none';
}

function chamarModalPreview() {
    if (isConnectedMode && hasModuleFeature('test_animation')) {
        document.getElementById('modal-escolha-preview').style.display = 'flex';
    } else {
        abrirPreviewWeb();
    }
}

function abrirPreviewWeb() {
    document.getElementById('modal-escolha-preview').style.display = 'none';
    videoPreview.src = playerVideo.src;
    videoPreview.currentTime = marcadores.m0;
    videoPreview.muted = true; 
    currentPreviewPart = -1;
    
    document.getElementById('modal-preview').style.display = 'flex';
    videoPreview.play();
}

async function testarNoCelular() {
    const t = traducoes[idiomaAtual];
    if (!ensureModuleFeature('test_animation')) return;
    document.getElementById('modal-escolha-preview').style.display = 'none';
    try {
        let res = await apiFetch('/test_anim', { method: 'POST' });
        if(res.ok) {
            alert(t.msgMagicSent);
        } else {
            alert(t.msgMagicError);
        }
    } catch(e) {
        alert(t.msgMagicConnError);
    }
}
