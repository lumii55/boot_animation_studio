function atualizarProgressoGif(texto, atual, total) {
    const elemento = document.getElementById('txt-loading-timeline');
    if (!elemento) return;
    if (!total || total <= 0) {
        elemento.textContent = texto;
        return;
    }
    const porcentagem = Math.min(100, Math.max(0, Math.round((atual / total) * 100)));
    elemento.textContent = `${texto} ${atual}/${total} (${porcentagem}%)`;
}

function normalizarDuracaoGifSegundos(valor) {
    if (!Number.isFinite(valor) || valor <= 0) return 0.1;
    return Math.max(0.02, Math.min(60, valor));
}

function calcularFpsGif(frames, duracao) {
    if (!frames || frames.length === 0 || !duracao) return 10;
    return Math.max(1, Math.min(60, Math.round(frames.length / duracao)));
}

async function decoderGifNativoDisponivel() {
    if (!globalThis.ImageDecoder || typeof ImageDecoder.isTypeSupported !== 'function') return false;
    try {
        return await ImageDecoder.isTypeSupported('image/gif');
    } catch (error) {
        return false;
    }
}

async function decodificarGifNativo(file, t) {
    if (!await decoderGifNativoDisponivel()) return null;

    const buffer = await file.arrayBuffer();
    const decoder = new ImageDecoder({
        data: buffer,
        type: 'image/gif',
        preferAnimation: true
    });
    const frames = [];
    let canvas = null;
    let ctx = null;
    let largura = 0;
    let altura = 0;
    let tempo = 0;

    try {
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        const total = track && Number.isFinite(track.frameCount) ? track.frameCount : 0;
        if (!total) throw new Error(t.msgGifEmpty);

        for (let i = 0; i < total; i++) {
            const resultado = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
            const imagem = resultado.image;
            try {
                if (!canvas) {
                    largura = imagem.displayWidth || imagem.codedWidth || imagem.visibleRect && imagem.visibleRect.width || 0;
                    altura = imagem.displayHeight || imagem.codedHeight || imagem.visibleRect && imagem.visibleRect.height || 0;
                    if (!largura || !altura) throw new Error(t.msgGifEmpty);
                    canvas = document.createElement('canvas');
                    canvas.width = largura;
                    canvas.height = altura;
                    ctx = canvas.getContext('2d', { alpha: false });
                }

                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, largura, altura);
                ctx.drawImage(imagem, 0, 0, largura, altura);

                const blob = await canvasToBlobAsync(canvas, 'image/png');
                const duracao = normalizarDuracaoGifSegundos(Number(imagem.duration) / 1000000);
                frames.push({
                    blob,
                    byteSize: blob.size || 0,
                    mimeType: 'image/png',
                    format: 'png',
                    sourceName: `gif_${String(i).padStart(5, '0')}.png`,
                    partIndex: 0,
                    startTime: tempo,
                    duration: duracao
                });
                tempo += duracao;
            } finally {
                if (imagem && typeof imagem.close === 'function') imagem.close();
            }

            if (i % 2 === 0 || i === total - 1) atualizarProgressoGif(t.msgLoadingGif, i + 1, total);
            if (i % 4 === 0) await cooperativeYield();
        }

        return {
            frames,
            width: largura,
            height: altura,
            duration: tempo,
            fps: calcularFpsGif(frames, tempo),
            decoder: 'native'
        };
    } finally {
        if (decoder && typeof decoder.close === 'function') decoder.close();
        if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
        }
    }
}

async function carregarGifuct() {
    let timer = null;
    const carregamento = import('https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm');
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('GIF decoder loading timed out')), 12000);
    });
    try {
        return await Promise.race([carregamento, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function decodificarGifFallback(file, t) {
    const { parseGIF, decompressFrames } = await carregarGifuct();
    const buffer = await file.arrayBuffer();
    const gif = parseGIF(buffer);
    const framesOriginais = decompressFrames(gif, true);
    if (!framesOriginais || framesOriginais.length === 0) throw new Error(t.msgGifEmpty);

    const largura = gif && gif.lsd && gif.lsd.width ? gif.lsd.width : Math.max(...framesOriginais.map(frame => frame.dims.left + frame.dims.width));
    const altura = gif && gif.lsd && gif.lsd.height ? gif.lsd.height : Math.max(...framesOriginais.map(frame => frame.dims.top + frame.dims.height));
    if (!largura || !altura) throw new Error(t.msgGifEmpty);

    const gifCanvas = document.createElement('canvas');
    gifCanvas.width = largura;
    gifCanvas.height = altura;
    const gifCtx = gifCanvas.getContext('2d', { willReadFrequently: true });
    const patchCanvas = document.createElement('canvas');
    const patchCtx = patchCanvas.getContext('2d');
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = largura;
    outputCanvas.height = altura;
    const outputCtx = outputCanvas.getContext('2d', { alpha: false });
    const frames = [];
    let restauracao = null;
    let tempo = 0;

    try {
        for (let i = 0; i < framesOriginais.length; i++) {
            const frame = framesOriginais[i];
            const anterior = i > 0 ? framesOriginais[i - 1] : null;

            if (anterior && anterior.disposalType === 2) {
                gifCtx.clearRect(anterior.dims.left, anterior.dims.top, anterior.dims.width, anterior.dims.height);
            } else if (anterior && anterior.disposalType === 3 && restauracao) {
                gifCtx.putImageData(restauracao, 0, 0);
                restauracao = null;
            }

            if (frame.disposalType === 3) restauracao = gifCtx.getImageData(0, 0, largura, altura);

            if (patchCanvas.width !== frame.dims.width) patchCanvas.width = frame.dims.width;
            if (patchCanvas.height !== frame.dims.height) patchCanvas.height = frame.dims.height;
            const patch = new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height);
            patchCtx.putImageData(patch, 0, 0);
            gifCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

            outputCtx.fillStyle = '#000000';
            outputCtx.fillRect(0, 0, largura, altura);
            outputCtx.drawImage(gifCanvas, 0, 0);

            const blob = await canvasToBlobAsync(outputCanvas, 'image/png');
            const duracao = normalizarDuracaoGifSegundos(Math.max(20, Number(frame.delay) || 100) / 1000);
            frames.push({
                blob,
                byteSize: blob.size || 0,
                mimeType: 'image/png',
                format: 'png',
                sourceName: `gif_${String(i).padStart(5, '0')}.png`,
                partIndex: 0,
                startTime: tempo,
                duration: duracao
            });
            tempo += duracao;
            frame.patch = null;

            if (i % 2 === 0 || i === framesOriginais.length - 1) atualizarProgressoGif(t.msgLoadingGif, i + 1, framesOriginais.length);
            if (i % 4 === 0) await cooperativeYield();
        }

        return {
            frames,
            width: largura,
            height: altura,
            duration: tempo,
            fps: calcularFpsGif(frames, tempo),
            decoder: 'gifuct'
        };
    } finally {
        restauracao = null;
        framesOriginais.length = 0;
        gifCanvas.width = 1;
        gifCanvas.height = 1;
        patchCanvas.width = 1;
        patchCanvas.height = 1;
        outputCanvas.width = 1;
        outputCanvas.height = 1;
    }
}

async function decodificarGifEmFrames(file, t) {
    try {
        const nativo = await decodificarGifNativo(file, t);
        if (nativo) return nativo;
    } catch (error) {
        console.warn('Native GIF decoding failed, using fallback decoder.', error);
    }
    return await decodificarGifFallback(file, t);
}

async function converterGifParaVideo(file) {
    const t = traducoes[idiomaAtual];
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.msgLoadingGif;

    try {
        const gifData = await decodificarGifEmFrames(file, t);
        if (!gifData.frames.length) throw new Error(t.msgGifEmpty);

        const project = createFrameProject({
            sourceType: 'gif',
            sourceBlob: file,
            width: gifData.width,
            height: gifData.height,
            fps: gifData.fps,
            sourceDuration: gifData.duration,
            frames: gifData.frames,
            parts: [{
                index: 0,
                type: 'p',
                repeat: 1,
                pause: 0,
                name: 'gif',
                rawLine: 'p 1 0 gif',
                startFrame: 0,
                endFrame: gifData.frames.length - 1,
                audioBlob: null
            }]
        });
        project.initialMarkersApplied = true;

        document.getElementById('txt-loading-timeline').textContent = t.msgLoadingVid;
        const prepared = gifData.frames.map(frame => frame.blob);
        const videoWebm = await createFrameProjectPreview(project, prepared, {
            maxBuildSeconds: 4,
            onProgress: (atual, total) => atualizarProgressoGif(t.msgLoadingVid, atual, total)
        });
        project.previewBlob = videoWebm;

        document.getElementById('dicas-iniciais').style.display = 'none';
        resetAudioState();
        setCurrentProject(project);
        document.getElementById('input-fps').value = gifData.fps;
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

function calcularEscalaTempoPreview(project, maxBuildSeconds) {
    const duracao = Math.max(0, Number(project.sourceDuration) || 0);
    if (!maxBuildSeconds || !duracao || duracao <= maxBuildSeconds) return 1;
    const minimoPorFrames = project.frames.length > 0 ? project.frames.length / 60 : 0;
    const alvo = Math.max(maxBuildSeconds, minimoPorFrames);
    return Math.max(0.0625, Math.min(1, alvo / duracao));
}

async function createFrameProjectPreview(project, preparedBlobs, options = {}) {
    const maxPreviewWidth = 720;
    const maxPreviewHeight = 1280;
    const scale = Math.min(1, maxPreviewWidth / project.width, maxPreviewHeight / project.height);
    const previewWidth = Math.max(2, Math.floor((project.width * scale) / 2) * 2);
    const previewHeight = Math.max(2, Math.floor((project.height * scale) / 2) * 2);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = previewWidth;
    tempCanvas.height = previewHeight;
    const ctx = tempCanvas.getContext('2d', { alpha: false });
    const timingScale = calcularEscalaTempoPreview(project, options.maxBuildSeconds);
    const previewFps = Math.max(1, Math.min(60, Math.ceil((project.fps || 30) / timingScale)));
    const stream = tempCanvas.captureStream(previewFps);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    const blobs = preparedBlobs || await prepareFrameProjectPreviewBlobs(project, options.onProgress);
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

            if (options.onProgress && (i % 2 === 0 || i === project.frames.length - 1)) options.onProgress(i + 1, project.frames.length);

            const expectedTime = startTime + ((frame.startTime + frame.duration) * 1000 * timingScale);
            const sleepTime = expectedTime - performance.now();
            if (sleepTime > 0) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            } else {
                await cooperativeYield();
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

function clampAudioControlValue(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}

function getAudioAdvancedState(part) {
    return {
        fadeIn: clampAudioControlValue(document.getElementById(`fade-in-${part}`).value, 0, 5, 0),
        fadeOut: clampAudioControlValue(document.getElementById(`fade-out-${part}`).value, 0, 5, 0),
        offset: clampAudioControlValue(document.getElementById(`audio-offset-${part}`).value, -5, 5, 0),
        normalize: document.getElementById(`audio-normalize-${part}`).checked
    };
}

function captureAudioEditorState() {
    const state = { enabled: document.getElementById('input-usar-som').checked };
    ['intro', 'loop', 'final'].forEach(part => {
        state[part] = {
            mode: document.getElementById(`sel-audio-${part}`).value,
            volume: parseInt(document.getElementById(`vol-${part}`).value) || 0,
            source: captureAudioSourceState(part),
            ...getAudioAdvancedState(part)
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
    return a.mode === b.mode &&
        a.volume === b.volume &&
        clampAudioControlValue(a.fadeIn, 0, 5, 0) === clampAudioControlValue(b.fadeIn, 0, 5, 0) &&
        clampAudioControlValue(a.fadeOut, 0, 5, 0) === clampAudioControlValue(b.fadeOut, 0, 5, 0) &&
        clampAudioControlValue(a.offset, -5, 5, 0) === clampAudioControlValue(b.offset, -5, 5, 0) &&
        !!a.normalize === !!b.normalize &&
        audioSourceStatesEqual(a.source, b.source);
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
    atualizarBotoesELinhas();
    if (typeof updateOutputIntent === 'function') updateOutputIntent();
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

function formatAudioSeconds(value, signed = false) {
    const numeric = Math.abs(Number(value)) < 0.0001 ? 0 : Number(value);
    if (signed && numeric > 0) return `+${numeric.toFixed(1)}s`;
    return `${numeric.toFixed(1)}s`;
}

function syncAudioAdvancedLabels(part) {
    const state = getAudioAdvancedState(part);
    document.getElementById(`val-fade-in-${part}`).textContent = formatAudioSeconds(state.fadeIn);
    document.getElementById(`val-fade-out-${part}`).textContent = formatAudioSeconds(state.fadeOut);
    document.getElementById(`val-offset-${part}`).textContent = formatAudioSeconds(state.offset, true);
}

function syncAudioAdvancedVisibility(part) {
    const select = document.getElementById(`sel-audio-${part}`);
    const details = document.getElementById(`audio-advanced-${part}`);
    if (!select || !details) return;
    const visible = select.value !== 'none';
    details.classList.toggle('visible', visible);
    if (!visible) details.open = false;
}

function handleAudioAdvancedInput(part) {
    syncAudioAdvancedLabels(part);
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

function resetAudioAdvancedState(part) {
    document.getElementById(`fade-in-${part}`).value = 0;
    document.getElementById(`fade-out-${part}`).value = 0;
    document.getElementById(`audio-offset-${part}`).value = 0;
    document.getElementById(`audio-normalize-${part}`).checked = false;
    const details = document.getElementById(`audio-advanced-${part}`);
    details.open = false;
    details.classList.remove('visible');
    syncAudioAdvancedLabels(part);
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
        resetAudioAdvancedState(part);
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
    syncAudioAdvancedVisibility(part);
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
    syncAudioAdvancedVisibility(part);
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
    syncAudioAdvancedVisibility(part);
}

function fecharModal() {
    if (typeof cancelPreviewAudioBuild === 'function') cancelPreviewAudioBuild();
    if (typeof stopAdvancedPartsPreview === 'function') stopAdvancedPartsPreview();
    stopModalPreviewRenderer();
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

async function abrirPreviewWeb() {
    document.getElementById('modal-escolha-preview').style.display = 'none';
    document.getElementById('modal-preview').style.display = 'flex';
    videoPreview.src = playerVideo.src;
    atualizarPreviewEnquadramento();
    const advancedActive = typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive();
    const firstAdvancedPart = advancedActive && typeof getAdvancedParts === 'function' ? getAdvancedParts()[0] : null;
    videoPreview.currentTime = firstAdvancedPart ? projectTimeToTimelineTime(firstAdvancedPart.start) : (marcadores.m0 || 0);
    videoPreview.muted = true;
    currentPreviewPart = -1;
    requestAnimationFrame(() => {
        applyFramingFocusVisuals();
        startModalPreviewRenderer();
    });
    if (advancedActive && typeof startAdvancedPartsPreview === 'function') {
        await startAdvancedPartsPreview().catch(() => {});
        return;
    }
    if (typeof preparePreviewAudioFromCurrentState === 'function') {
        await preparePreviewAudioFromCurrentState().catch(() => {});
    }
    if (document.getElementById('modal-preview').style.display !== 'none') {
        videoPreview.play().catch(() => {});
    }
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
