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
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');
        
        let totalDelay = 0;
        frames.forEach(frame => totalDelay += Math.max(20, frame.delay));
        let fps = Math.round(1000 / (totalDelay / frames.length));
        if (fps > 60) fps = 60;
        if (fps < 1) fps = 10;
        
        document.getElementById('txt-loading-timeline').textContent = t.msgLoadingVid;

        const stream = tempCanvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const pedacos = [];
        recorder.ondataavailable = event => {
            if (event.data.size > 0) pedacos.push(event.data);
        };
        
        const gravacaoPronta = new Promise(resolve => {
            recorder.onstop = () => resolve(new Blob(pedacos, { type: 'video/webm' }));
        });
        recorder.start(1000);

        const gifCanvas = document.createElement('canvas');
        gifCanvas.width = w;
        gifCanvas.height = h;
        const gifCtx = gifCanvas.getContext('2d', { willReadFrequently: true });
        const patchCanvas = document.createElement('canvas');
        const patchCtx = patchCanvas.getContext('2d');
        let prevImgData;
        
        const startTime = performance.now();
        let accumulatedDelay = 0;

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            
            if (i > 0 && frames[i - 1].disposalType === 2) {
                gifCtx.clearRect(frames[i - 1].dims.left, frames[i - 1].dims.top, frames[i - 1].dims.width, frames[i - 1].dims.height);
            } else if (i > 0 && frames[i - 1].disposalType === 3 && prevImgData) {
                gifCtx.putImageData(prevImgData, 0, 0);
            }
            
            if (frame.disposalType === 3) {
                prevImgData = gifCtx.getImageData(0, 0, w, h);
            }
            
            patchCanvas.width = frame.dims.width;
            patchCanvas.height = frame.dims.height;
            const pData = new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height);
            patchCtx.putImageData(pData, 0, 0);
            gifCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
            frame.patch = null;
            
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(gifCanvas, 0, 0);
            
            accumulatedDelay += Math.max(20, frame.delay);
            const expectedTime = startTime + accumulatedDelay;
            const sleepTime = expectedTime - performance.now();
            
            if (sleepTime > 0) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            } else {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        recorder.stop();
        const videoWebm = await gravacaoPronta;
        stream.getTracks().forEach(track => track.stop());
        prevImgData = null;
        frames.length = 0;
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        gifCanvas.width = 1;
        gifCanvas.height = 1;
        patchCanvas.width = 1;
        patchCanvas.height = 1;
        
        document.getElementById('dicas-iniciais').style.display = 'none';
        resetAudioState();
        setCurrentProject(createTemporalProject('gif', file, {
            previewBlob: videoWebm,
            width: w,
            height: h,
            fps,
            sourceDuration: totalDelay / 1000
        }));
        setPlayerBlob(videoWebm);
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
        alert(t.msgGifError + error.message);
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

async function prepareFrameProjectPreviewBlobs(project, onProgress) {
    const blobs = new Array(project.frames.length);
    for (let i = 0; i < project.frames.length; i++) {
        blobs[i] = await getProjectFrameBlob(project.frames[i]);
        if (onProgress && (i % 8 === 0 || i === project.frames.length - 1)) onProgress(i + 1, project.frames.length);
        if (i % 8 === 0) await cooperativeYield();
    }
    return blobs;
}

async function createFrameProjectPreview(project, preparedBlobs) {
    const maxPreviewWidth = 720;
    const maxPreviewHeight = 1280;
    const scale = Math.min(1, maxPreviewWidth / project.width, maxPreviewHeight / project.height);
    const previewWidth = Math.max(2, Math.floor((project.width * scale) / 2) * 2);
    const previewHeight = Math.max(2, Math.floor((project.height * scale) / 2) * 2);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = previewWidth;
    tempCanvas.height = previewHeight;
    const ctx = tempCanvas.getContext('2d', { alpha: false });
    const previewFps = Math.max(1, Math.min(60, project.fps || 30));
    const stream = tempCanvas.captureStream(previewFps);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    const blobs = preparedBlobs || await prepareFrameProjectPreviewBlobs(project);
    let stopped = false;
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
    });
    recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
        stopped = true;
        readyResolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = event => {
        stopped = true;
        readyReject(event.error || new Error('Preview recording failed'));
    };

    try {
        recorder.start();
        const startTime = performance.now();

        for (let i = 0; i < project.frames.length; i++) {
            const frame = project.frames[i];
            const drawable = await blobToDrawable(blobs[i]);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, previewWidth, previewHeight);
            ctx.drawImage(drawable, 0, 0, previewWidth, previewHeight);
            releaseDrawable(drawable);
            blobs[i] = null;

            const expectedTime = startTime + ((frame.startTime + frame.duration) * 1000);
            const sleepTime = expectedTime - performance.now();
            if (sleepTime > 0) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            } else {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        recorder.stop();
        return await Promise.race([
            ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Preview recording timed out')), 10000))
        ]);
    } finally {
        for (let i = 0; i < blobs.length; i++) blobs[i] = null;
        if (!stopped && recorder.state !== 'inactive') recorder.stop();
        stream.getTracks().forEach(track => track.stop());
        tempCanvas.width = 1;
        tempCanvas.height = 1;
    }
}

async function abrirZipNoEditor(zipBlob) {
    const t = traducoes[idiomaAtual];
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.msgLoadingZip;

    try {
        const zip = await JSZip.loadAsync(zipBlob);
        const descFile = zip.file('desc.txt');
        if (!descFile) throw new Error(t.msgZipNoDesc);
        
        const descText = await descFile.async('string');
        const linhas = descText.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
        if (linhas.length === 0) throw new Error(t.msgZipNoDesc);
        
        const configTops = linhas[0].split(/\s+/);
        const zipW = parseInt(configTops[0]);
        const zipH = parseInt(configTops[1]);
        const zipFps = parseInt(configTops[2]) || 30;
        if (!zipW || !zipH) throw new Error(t.msgZipReadError);

        let temSomNoDesc = false;
        for (let i = 1; i < linhas.length; i++) {
            if (linhas[i].startsWith('s ')) {
                temSomNoDesc = true;
                break;
            }
        }

        document.getElementById('txt-loading-timeline').textContent = t.msgOrgFrames;
        
        const projectFrames = [];
        const projectParts = [];

        for (let i = 1; i < linhas.length; i++) {
            const tokens = linhas[i].split(/\s+/);
            if (tokens[0] !== 'c' && tokens[0] !== 'p') continue;

            const nomePasta = tokens[3];
            if (!nomePasta) continue;
            const nomeSeguro = escapeRegExp(nomePasta);
            const regex = new RegExp('^' + nomeSeguro + '/.*\\.(png|jpg|jpeg)$', 'i');
            const arquivosPasta = zip.file(regex);
            const arquivosAudio = zip.file(new RegExp('^' + nomeSeguro + '/audio\\.wav$', 'i'));
            arquivosPasta.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            const frameStart = projectFrames.length;
            for (const arquivo of arquivosPasta) {
                const type = inferFrameType(arquivo.name);
                const index = projectFrames.length;
                projectFrames.push({
                    blob: null,
                    sourceEntry: arquivo,
                    byteSize: null,
                    name: arquivo.name,
                    mimeType: type.mimeType,
                    format: type.format,
                    partIndex: projectParts.length,
                    partName: nomePasta,
                    startTime: index / zipFps,
                    duration: 1 / zipFps
                });
            }

            let audioBlob = null;
            let audioName = null;
            if (arquivosAudio.length > 0) {
                const rawAudioBlob = await arquivosAudio[0].async('blob');
                audioBlob = rawAudioBlob.type === 'audio/wav' ? rawAudioBlob : rawAudioBlob.slice(0, rawAudioBlob.size, 'audio/wav');
                audioName = arquivosAudio[0].name.split('/').pop() || 'audio.wav';
            }

            projectParts.push({
                name: nomePasta,
                type: tokens[0],
                repeat: Number.isFinite(parseInt(tokens[1])) ? parseInt(tokens[1]) : 1,
                pause: Number.isFinite(parseInt(tokens[2])) ? parseInt(tokens[2]) : 0,
                rawLine: linhas[i],
                tokens: [...tokens],
                frameStart,
                frameEnd: projectFrames.length - 1,
                frameCount: projectFrames.length - frameStart,
                audioBlob,
                audioName,
                audioEntryName: arquivosAudio.length > 0 ? arquivosAudio[0].name : null
            });
        }

        if (projectFrames.length === 0) throw new Error(t.msgZipNoParts);

        let totalFramesGerais = projectFrames.length;
        let m1Idx = 0;
        let m2Idx = totalFramesGerais - 1;

        if (projectParts.length === 2) {
            m1Idx = Math.max(0, projectParts[0].frameEnd);
            m2Idx = Math.max(m1Idx, projectParts[1].frameEnd);
        } else if (projectParts.length >= 3) {
            m1Idx = Math.max(0, projectParts[0].frameEnd);
            m2Idx = Math.max(m1Idx, projectParts[projectParts.length - 2].frameEnd);
        }

        const initialMarkersSource = {
            m0: 0,
            m1: Math.max(0, m1Idx / zipFps),
            m2: Math.max(0, m2Idx / zipFps),
            m3: Math.max(0, (totalFramesGerais - 1) / zipFps)
        };

        const audioRolePartIndexes = buildAudioRolePartIndexes(projectParts);
        const project = createFrameProject({
            sourceType: 'bootanimation',
            sourceBlob: zipBlob,
            width: zipW,
            height: zipH,
            fps: zipFps,
            sourceDuration: totalFramesGerais / zipFps,
            frames: projectFrames,
            parts: projectParts,
            descText,
            descHasSoundDirectives: temSomNoDesc,
            audioRolePartIndexes,
            initialMarkersSource
        });
        setCurrentProject(project);

        resetAudioState();
        const partesComAudio = projectParts.filter(parte => parte.audioBlob);
        ['intro', 'loop', 'final'].forEach(role => {
            const partIndex = audioRolePartIndexes[role];
            if (Number.isInteger(partIndex) && projectParts[partIndex] && projectParts[partIndex].audioBlob) {
                setImportedAudio(role, projectParts[partIndex].audioBlob, projectParts[partIndex].audioName);
            }
        });
        if (temSomNoDesc || partesComAudio.length > 0) {
            document.getElementById('input-usar-som').checked = true;
            verificarPainelAudio();
        }

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
        document.getElementById('input-qualidade').value = 'custom';
        const importedFormat = getImportedProjectFormat();
        if (importedFormat) document.getElementById('input-formato').value = importedFormat;
        setProjectEditorBaseline({
            width: zipW,
            height: zipH,
            fps: zipFps,
            format: document.getElementById('input-formato').value
        }, captureAudioEditorState());

        const previewBlobs = await prepareFrameProjectPreviewBlobs(project, (done, total) => {
            const percent = total > 0 ? Math.floor((done / total) * 100) : 100;
            document.getElementById('txt-loading-timeline').textContent = `${t.msgOrgFrames} ${done}/${total} (${percent}%)`;
        });
        document.getElementById('txt-loading-timeline').textContent = t.msgStitching;
        const videoWebm = await createFrameProjectPreview(project, previewBlobs);
        project.previewBlob = videoWebm;
        setPlayerBlob(videoWebm);

    } catch (error) {
        console.error(error);
        alert(t.msgZipReadError + error.message);
        document.getElementById('loading-overlay').style.display = 'none';
    }
}


function buildAudioRolePartIndexes(parts) {
    const result = { intro: null, loop: null, final: null };
    if (parts.length === 1) {
        result.loop = 0;
    } else if (parts.length === 2) {
        result.intro = 0;
        result.loop = 1;
    } else if (parts.length >= 3) {
        result.intro = 0;
        const middleWithAudio = parts.slice(1, -1).findIndex(part => !!part.audioBlob);
        result.loop = middleWithAudio >= 0 ? middleWithAudio + 1 : 1;
        result.final = parts.length - 1;
    }
    return result;
}

function captureAudioSourceState(part) {
    const inputFile = document.getElementById(`file-audio-${part}`);
    const selectedFile = inputFile.files[0] || null;
    if (selectedFile) {
        return {
            kind: 'file',
            name: selectedFile.name || '',
            size: selectedFile.size || 0,
            type: selectedFile.type || '',
            lastModified: selectedFile.lastModified || 0,
            ref: selectedFile
        };
    }
    const imported = importedAudioFiles[part];
    if (imported) {
        return {
            kind: 'imported',
            name: '',
            size: imported.size || 0,
            type: imported.type || '',
            lastModified: 0,
            ref: imported
        };
    }
    return { kind: 'none', name: '', size: 0, type: '', lastModified: 0, ref: null };
}

function captureAudioEditorState() {
    const state = { enabled: document.getElementById('input-usar-som').checked };
    ['intro', 'loop', 'final'].forEach(part => {
        state[part] = {
            mode: document.getElementById(`sel-audio-${part}`).value,
            volume: parseInt(document.getElementById(`vol-${part}`).value) || 0,
            source: captureAudioSourceState(part)
        };
    });
    return state;
}

function audioSourceStatesEqual(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'none') return true;
    if (a.kind === 'imported') return a.ref === b.ref && a.size === b.size && a.type === b.type;
    return a.ref === b.ref || (
        a.name === b.name &&
        a.size === b.size &&
        a.type === b.type &&
        a.lastModified === b.lastModified
    );
}

function audioRoleStatesEqual(a, b) {
    if (!a || !b) return false;
    return a.mode === b.mode && a.volume === b.volume && audioSourceStatesEqual(a.source, b.source);
}

function audioEditorStatesEqual(a, b) {
    if (!a || !b || a.enabled !== b.enabled) return false;
    return ['intro', 'loop', 'final'].every(part => audioRoleStatesEqual(a[part], b[part]));
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
