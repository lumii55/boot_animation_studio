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
    if (!window.Gifuct || typeof window.Gifuct.parseGIF !== 'function' || typeof window.Gifuct.decompressFrames !== 'function') {
        throw new Error('GIF decoder is unavailable');
    }
    return window.Gifuct;
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
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('source');
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


const BAS_BOOTANIMATION_IMPORT_MAX_ENTRIES = 10000;
const BAS_BOOTANIMATION_IMPORT_MAX_UNCOMPRESSED = 4 * 1024 * 1024 * 1024;
const BAS_BOOTANIMATION_IMPORT_MAX_RATIO = 400;

function bootAnimationSafeEntryName(name) {
    const raw = String(name || '');
    if (!raw || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return false;
    return !raw.split('/').some(segment => segment === '..');
}

function validateBootAnimationArchiveSafety(zip) {
    const entries = Object.values(zip.files || {});
    if (entries.length > BAS_BOOTANIMATION_IMPORT_MAX_ENTRIES) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipUnsafe || 'This archive is too large or unsafe to import.');
    let total = 0;
    for (const entry of entries) {
        const original = String(entry.unsafeOriginalName || entry.name || '');
        if (!bootAnimationSafeEntryName(original) || !bootAnimationSafeEntryName(entry.name)) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipUnsafe || 'This archive contains an unsafe path.');
        const size = Number(entry && entry._data && entry._data.uncompressedSize);
        const compressed = Number(entry && entry._data && entry._data.compressedSize);
        if (Number.isFinite(size) && size >= 0) {
            total += size;
            if (total > BAS_BOOTANIMATION_IMPORT_MAX_UNCOMPRESSED) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipUnsafe || 'This archive is too large or unsafe to import.');
            if (size > 1024 * 1024 && Number.isFinite(compressed) && compressed > 0 && size / compressed > BAS_BOOTANIMATION_IMPORT_MAX_RATIO) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipUnsafe || 'This archive is too large or unsafe to import.');
        }
    }
}

function findBootAnimationRootFile(zip, fileName) {
    const target = String(fileName || '').toLowerCase();
    return Object.values(zip.files || {}).find(entry => !entry.dir && String(entry.name || '').toLowerCase() === target) || null;
}

function detectBootAnimationArchiveFormat(zip) {
    if (findBootAnimationRootFile(zip, 'desc.txt')) return 'aosp-frames';
    const videoDesc = findBootAnimationRootFile(zip, 'videodesc.txt');
    const videos = Object.values(zip.files || {}).filter(entry => !entry.dir && !String(entry.name || '').includes('/') && /\.mp4$/i.test(entry.name || ''));
    if (videoDesc && videos.length) return 'video-sequence';
    return 'unknown-safe';
}

function bootAnimationNamedBlob(blob, name, type = '') {
    const mime = type || blob.type || 'application/octet-stream';
    if (typeof File !== 'undefined') {
        try { return new File([blob], name, { type: mime, lastModified: Date.now() }); } catch (_) {}
    }
    const result = blob.type === mime ? blob : blob.slice(0, blob.size, mime);
    try { Object.defineProperty(result, 'name', { value: name, configurable: true }); } catch (_) {}
    return result;
}

function bootAnimationVideoDurationCandidate(video) {
    const values = [];
    const duration = Number(video && video.duration);
    if (Number.isFinite(duration) && duration > 0) values.push(duration);
    ['seekable', 'buffered'].forEach(key => {
        const ranges = video && video[key];
        if (!ranges || !Number.isFinite(Number(ranges.length)) || ranges.length <= 0) return;
        try {
            const end = Number(ranges.end(ranges.length - 1));
            if (Number.isFinite(end) && end > 0) values.push(end);
        } catch (_) {}
    });
    return values.length ? Math.max(...values) : 0;
}

async function readBootAnimationVideoMetadata(blob) {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    let bestDuration = 0;
    const sampleDuration = () => {
        bestDuration = Math.max(bestDuration, bootAnimationVideoDurationCandidate(video));
        return bestDuration;
    };
    try {
        await new Promise((resolve, reject) => {
            let settled = false;
            let timer = 0;
            const cleanup = () => {
                clearTimeout(timer);
                video.removeEventListener('loadedmetadata', ready);
                video.removeEventListener('error', fail);
            };
            const ready = () => {
                if (settled) return;
                settled = true;
                sampleDuration();
                cleanup();
                resolve();
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error((traducoes[idiomaAtual] || traducoes.en).msgZipVideoUnreadable || 'A video inside this boot animation could not be read.'));
            };
            video.addEventListener('loadedmetadata', ready);
            video.addEventListener('error', fail);
            timer = setTimeout(fail, 8000);
            video.src = url;
            video.load();
        });
        await new Promise(resolve => {
            let finished = false;
            let settleTimer = 0;
            let hardTimer = 0;
            const events = ['durationchange', 'loadeddata', 'canplay', 'canplaythrough', 'progress'];
            const cleanup = () => {
                clearTimeout(settleTimer);
                clearTimeout(hardTimer);
                events.forEach(event => video.removeEventListener(event, update));
            };
            const done = () => {
                if (finished) return;
                finished = true;
                sampleDuration();
                cleanup();
                resolve();
            };
            const armSettle = () => {
                clearTimeout(settleTimer);
                settleTimer = setTimeout(done, 300);
            };
            const update = () => {
                const before = bestDuration;
                sampleDuration();
                if (bestDuration > before + 0.001 || video.readyState >= 2) armSettle();
            };
            events.forEach(event => video.addEventListener(event, update));
            hardTimer = setTimeout(done, 1800);
            if (video.readyState >= 2) armSettle();
        });
        if (!(bestDuration > 0) && Number(video.readyState) >= 1) {
            try {
                video.currentTime = 1e10;
                await new Promise(resolve => {
                    const done = () => {
                        video.removeEventListener('durationchange', done);
                        video.removeEventListener('seeked', done);
                        resolve();
                    };
                    video.addEventListener('durationchange', done, { once: true });
                    video.addEventListener('seeked', done, { once: true });
                    setTimeout(done, 500);
                });
                sampleDuration();
            } catch (_) {}
        }
        return {
            width: Math.max(0, Number(video.videoWidth) || 0),
            height: Math.max(0, Number(video.videoHeight) || 0),
            duration: Math.max(0, bestDuration)
        };
    } finally {
        try { video.pause(); } catch (_) {}
        video.removeAttribute('src');
        try { video.load(); } catch (_) {}
        URL.revokeObjectURL(url);
    }
}

function parseVideoBootAnimationDescriptor(text, videoCount) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (!lines.length || lines.length !== videoCount) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipVideoDescMismatch || 'videodesc.txt does not match the video sequence in this archive.');
    return lines.map((line, index) => {
        const tokens = line.split(/\s+/);
        if (tokens.length < 2 || !/^\d+$/.test(tokens[0]) || !/^\d+$/.test(tokens[1])) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipVideoDescInvalid || 'videodesc.txt contains an unsupported line.');
        const repeat = Number(tokens[0]);
        const pause = Number(tokens[1]);
        if (!Number.isSafeInteger(repeat) || !Number.isSafeInteger(pause) || repeat < 0 || pause < 0 || repeat > 999 || pause > 9999) throw new Error((traducoes[idiomaAtual] || traducoes.en).msgZipVideoDescInvalid || 'videodesc.txt contains an unsupported line.');
        return { index, repeat, pause, rawLine: line, tokens };
    });
}

function videoBootAnimationMarkers(parts) {
    const ends = [];
    let total = 0;
    parts.forEach(part => {
        total += Math.max(0, Number(part.duration) || 0);
        ends.push(total);
    });
    if (!ends.length) return { m0: 0, m1: 0, m2: 0, m3: 0 };
    if (ends.length === 1) return { m0: 0, m1: 0, m2: ends[0], m3: ends[0] };
    if (ends.length === 2) return { m0: 0, m1: ends[0], m2: ends[1], m3: ends[1] };
    return { m0: 0, m1: ends[0], m2: ends[ends.length - 2], m3: ends[ends.length - 1] };
}

async function abrirZipVideoNoEditor(zipBlob, zip) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('zip');
    const overlay = document.getElementById('loading-overlay');
    const loading = document.getElementById('txt-loading-timeline');
    if (overlay) overlay.style.display = 'flex';
    if (loading) loading.textContent = t.msgZipVideoAnalyzing || 'Analyzing video boot animation...';

    const descEntry = findBootAnimationRootFile(zip, 'videodesc.txt');
    const videoEntries = Object.values(zip.files || {}).filter(entry => !entry.dir && !String(entry.name || '').includes('/') && /\.mp4$/i.test(entry.name || ''));
    videoEntries.sort((a, b) => String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0);
    if (!descEntry || !videoEntries.length) throw new Error(t.msgZipUnsupportedFormat || 'This boot animation format is not supported yet.');

    const descriptorText = await descEntry.async('string');
    const descriptor = parseVideoBootAnimationDescriptor(descriptorText, videoEntries.length);
    const sources = [];
    for (let index = 0; index < videoEntries.length; index++) {
        if (loading) loading.textContent = (t.msgZipVideoReading || 'Reading video {current}/{total}...').replace('{current}', String(index + 1)).replace('{total}', String(videoEntries.length));
        const entry = videoEntries[index];
        const raw = await entry.async('blob');
        const name = String(entry.name || `video-${index + 1}.mp4`).split('/').pop() || `video-${index + 1}.mp4`;
        const blob = bootAnimationNamedBlob(raw, name, 'video/mp4');
        const meta = await readBootAnimationVideoMetadata(blob);
        if (!(meta.width > 0) || !(meta.height > 0) || !(meta.duration > 0)) throw new Error(t.msgZipVideoUnreadable || 'A video inside this boot animation could not be read.');
        sources.push({ entry, name, blob, meta, descriptor: descriptor[index] });
    }

    const first = sources[0];
    const project = createTemporalProject('bootanimation', zipBlob, {
        sourceName: zipBlob && zipBlob.name ? zipBlob.name : 'bootanimation.zip',
        previewBlob: first.blob,
        width: first.meta.width,
        height: first.meta.height,
        fps: 30,
        sourceDuration: first.meta.duration
    });
    project.sourceMode = 'video-sequence';
    project.runtimePrimaryBlob = first.blob;
    project.runtimePrimaryKind = 'video';
    project.runtimePrimaryName = first.name;
    project.runtimePrimaryWidth = first.meta.width;
    project.runtimePrimaryHeight = first.meta.height;
    project.runtimePrimaryDuration = first.meta.duration;
    project.runtimePrimaryFps = 0;
    project.sourceLibraryCounter = sources.length;
    project.primarySourceId = 'src-1';
    project.sourceLibrary = sources.map((source, index) => ({
        id: `src-${index + 1}`,
        kind: 'video',
        role: 'visual',
        name: source.name,
        blob: source.blob,
        mimeType: 'video/mp4',
        size: source.blob.size || 0,
        lastModified: Number(source.blob.lastModified) || 0,
        width: source.meta.width,
        height: source.meta.height,
        duration: source.meta.duration,
        fps: 0,
        isPrimary: index === 0,
        archiveDerived: true,
        archiveEntryName: source.entry.name,
        runtimeFrames: null,
        previewBlob: source.blob
    }));
    project.parts = sources.map((source, index) => ({
        name: source.name,
        folder: `part${index}`,
        type: 'p',
        repeat: source.descriptor.repeat,
        pause: source.descriptor.pause,
        rawLine: source.descriptor.rawLine,
        tokens: [...source.descriptor.tokens],
        sourceId: `src-${index + 1}`,
        duration: source.meta.duration,
        videoEntryName: source.entry.name,
        audioBlob: null,
        audioName: null,
        audioEntryName: null
    }));
    project.videoDescriptorText = descriptorText;
    project.videoDescriptorName = descEntry.name;
    project.videoAuxiliaryEntries = Object.values(zip.files || {}).filter(entry => !entry.dir && !videoEntries.includes(entry) && entry !== descEntry).map(entry => entry.name);
    project.markers = videoBootAnimationMarkers(project.parts);
    project.initialMarkersSource = { ...project.markers };
    project.initialMarkersApplied = true;
    setCurrentProject(project);
    if (typeof buildAdvancedPartsFromImportedProject === 'function') {
        project.advancedPartCounter = 0;
        project.advancedParts = buildAdvancedPartsFromImportedProject();
        project.advancedPartsBaseline = typeof cloneAdvancedParts === 'function' ? cloneAdvancedParts(project.advancedParts) : null;
        project.advancedPartsDirty = false;
        project.advancedPartsEnabled = project.advancedParts.length > 0;
        project.advancedExpandedId = project.advancedParts[0] ? project.advancedParts[0].id : null;
    }

    resetAudioState();
    dicasIniciais.style.display = 'none';
    document.getElementById('botoes-exportacao').style.display = 'grid';
    videoContainer.style.display = 'block';
    timelineWrapper.style.display = 'block';
    gridMarcadores.style.display = 'grid';
    configuracoes.style.display = 'grid';
    btnGerar.style.display = 'block';
    btnVerPreview.style.display = 'none';
    document.getElementById('txt-hint-tooltip').style.display = 'block';
    document.getElementById('input-fps').value = 30;
    document.getElementById('input-largura').value = first.meta.width;
    document.getElementById('input-altura').value = first.meta.height;
    document.getElementById('input-qualidade').value = 'custom';
    if (typeof syncJpegQualityControl === 'function') syncJpegQualityControl();
    setProjectEditorBaseline({
        width: first.meta.width,
        height: first.meta.height,
        fps: 30,
        format: document.getElementById('input-formato').value
    }, captureAudioEditorState());
    setPlayerBlob(first.blob);
    if (window.BASMasterSequence) {
        BASMasterSequence.ensure();
        if (typeof BASMasterSequence.refreshTimeline === 'function') BASMasterSequence.refreshTimeline({ seekToStart: true });
    }
    if (typeof renderSourceLibrary === 'function') renderSourceLibrary();
    if (typeof syncAdvancedPartsUi === 'function') syncAdvancedPartsUi();
    if (typeof renderAdvancedPartsEditor === 'function') renderAdvancedPartsEditor();
    if (typeof atualizarBotoesELinhas === 'function') atualizarBotoesELinhas();
    if (typeof showToast === 'function') showToast(t.msgZipVideoImported || 'Video-based boot animation imported. BAS will export edits as a standard AOSP bootanimation.', 'success', 5200);
}

async function abrirZipNoEditor(zipBlob) {
    const t = traducoes[idiomaAtual] || traducoes.en;
    try {
        const zip = await JSZip.loadAsync(zipBlob);
        validateBootAnimationArchiveSafety(zip);
        const format = detectBootAnimationArchiveFormat(zip);
        if (format === 'aosp-frames') return await abrirZipAospNoEditor(zipBlob);
        if (format === 'video-sequence') return await abrirZipVideoNoEditor(zipBlob, zip);
        throw new Error(t.msgZipUnsupportedFormat || 'This boot animation format is not supported yet.');
    } catch (error) {
        console.error(error);
        alert((t.msgZipReadError || 'Could not read ZIP: ') + error.message);
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
        return null;
    }
}

async function abrirZipAospNoEditor(zipBlob) {
    const t = traducoes[idiomaAtual];
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('zip');
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
        document.getElementById('botoes-exportacao').style.display = 'grid';
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
        if (typeof syncJpegQualityControl === 'function') syncJpegQualityControl();
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
            kind: importedAudioKinds[part] === 'file' ? 'file' : 'imported',
            name: importedAudioNames[part] || '',
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

function audioGainDbFromLegacyVolume(value) {
    const volume = Math.max(0, Number(value) || 0) / 100;
    if (volume <= 0) return -60;
    return clampAudioControlValue(20 * Math.log10(volume), -60, 12, 0);
}

function normalizeAudioGainDb(value, legacyVolume = 100) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return clampAudioControlValue(numeric, -60, 12, 0);
    return audioGainDbFromLegacyVolume(legacyVolume);
}

function normalizeAudioFadeCurve(value) {
    return ['linear', 'smooth', 'exponential'].includes(value) ? value : 'linear';
}

function normalizeAudioTargetDb(value) {
    return clampAudioControlValue(value, -12, -0.1, -1);
}

function formatAudioGainDb(value) {
    const numeric = normalizeAudioGainDb(value, 100);
    if (numeric <= -59.95) return '−∞ dB';
    return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)} dB`;
}

function getAudioRoleDuration(part) {
    const total = Math.max(0, Number.isFinite(Number(marcadores.m3)) ? Number(marcadores.m3) : timelineTimeToProjectTime(playerVideo.duration || 0));
    const ranges = {
        intro: [Number(marcadores.m0) || 0, Number(marcadores.m1) || 0],
        loop: [Number(marcadores.m1) || 0, Number(marcadores.m2) || 0],
        final: [Number(marcadores.m2) || 0, total]
    };
    const range = ranges[part] || [0, 0];
    return Math.max(0, range[1] - range[0]);
}

function getAudioAdvancedState(part) {
    const legacy = document.getElementById(`audio-offset-${part}`);
    const legacyOffset = legacy ? clampAudioControlValue(legacy.value, -86400, 86400, 0) : 0;
    const delayInput = document.getElementById(`audio-delay-${part}`);
    const sourceInInput = document.getElementById(`audio-source-in-${part}`);
    return {
        fadeIn: clampAudioControlValue(document.getElementById(`fade-in-${part}`).value, 0, 5, 0),
        fadeOut: clampAudioControlValue(document.getElementById(`fade-out-${part}`).value, 0, 5, 0),
        fadeCurve: normalizeAudioFadeCurve(document.getElementById(`audio-fade-curve-${part}`)?.value),
        gainDb: normalizeAudioGainDb(document.getElementById(`vol-${part}`)?.value, 100),
        delay: clampAudioControlValue(delayInput ? delayInput.value : Math.max(0, legacyOffset), 0, 86400, 0),
        sourceIn: clampAudioControlValue(sourceInInput ? sourceInInput.value : Math.max(0, -legacyOffset), 0, 86400, 0),
        endTrim: clampAudioControlValue(document.getElementById(`audio-end-trim-${part}`)?.value, 0, 86400, 0),
        normalize: document.getElementById(`audio-normalize-${part}`).checked,
        normalizeTargetDb: normalizeAudioTargetDb(document.getElementById(`audio-normalize-target-${part}`)?.value)
    };
}

function captureAudioEditorState() {
    const state = { enabled: document.getElementById('input-usar-som').checked };
    ['intro', 'loop', 'final'].forEach(part => {
        state[part] = {
            mode: document.getElementById(`sel-audio-${part}`).value,
            volume: 100,
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
        normalizeAudioGainDb(a.gainDb, a.volume) === normalizeAudioGainDb(b.gainDb, b.volume) &&
        clampAudioControlValue(a.fadeIn, 0, 5, 0) === clampAudioControlValue(b.fadeIn, 0, 5, 0) &&
        clampAudioControlValue(a.fadeOut, 0, 5, 0) === clampAudioControlValue(b.fadeOut, 0, 5, 0) &&
        normalizeAudioFadeCurve(a.fadeCurve) === normalizeAudioFadeCurve(b.fadeCurve) &&
        clampAudioControlValue(a.delay !== undefined ? a.delay : Math.max(0, Number(a.offset) || 0), 0, 86400, 0) === clampAudioControlValue(b.delay !== undefined ? b.delay : Math.max(0, Number(b.offset) || 0), 0, 86400, 0) &&
        clampAudioControlValue(a.sourceIn !== undefined ? a.sourceIn : Math.max(0, -(Number(a.offset) || 0)), 0, 86400, 0) === clampAudioControlValue(b.sourceIn !== undefined ? b.sourceIn : Math.max(0, -(Number(b.offset) || 0)), 0, 86400, 0) &&
        clampAudioControlValue(a.endTrim, 0, 86400, 0) === clampAudioControlValue(b.endTrim, 0, 86400, 0) &&
        !!a.normalize === !!b.normalize &&
        normalizeAudioTargetDb(a.normalizeTargetDb) === normalizeAudioTargetDb(b.normalizeTargetDb) &&
        audioSourceStatesEqual(a.source, b.source);
}

function audioEditorStatesEqual(a, b) {
    if (!a || !b || a.enabled !== b.enabled) return false;
    return ['intro', 'loop', 'final'].every(part => audioRoleStatesEqual(a[part], b[part]));
}

function baixarVideo() {
    if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) {
        if (typeof showToast === 'function') showToast((traducoes[idiomaAtual] || traducoes.en).masterSequenceDownloadVideoUnavailable, 'warning', 4200);
        return;
    }
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
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
}

function verificarPainelAudio(options = {}) {
    const usaAudio = document.getElementById('input-usar-som').checked;
    document.getElementById('painel-audio').style.display = usaAudio ? "flex" : "none";
    if (options.renderTimeline !== false && typeof renderTimeline3 === 'function') renderTimeline3();
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
    const duration = getAudioRoleDuration(part);
    const delayInput = document.getElementById(`audio-delay-${part}`);
    const sourceInInput = document.getElementById(`audio-source-in-${part}`);
    const endTrimInput = document.getElementById(`audio-end-trim-${part}`);
    let delayValue = clampAudioControlValue(delayInput?.value, 0, duration, 0);
    let endTrimValue = clampAudioControlValue(endTrimInput?.value, 0, duration, 0);
    const activeId = document.activeElement?.id || '';
    if (delayValue + endTrimValue > duration) {
        if (activeId === `audio-end-trim-${part}`) delayValue = Math.max(0, duration - endTrimValue);
        else endTrimValue = Math.max(0, duration - delayValue);
    }
    if (delayInput) {
        delayInput.value = String(delayValue);
        delayInput.max = String(Math.max(0, duration - endTrimValue));
    }
    if (endTrimInput) {
        endTrimInput.value = String(endTrimValue);
        endTrimInput.max = String(Math.max(0, duration - delayValue));
    }
    if (sourceInInput) sourceInInput.max = String(Math.max(30, duration, clampAudioControlValue(sourceInInput.value, 0, 86400, 0)));
    const fadeInInput = document.getElementById(`fade-in-${part}`);
    const fadeOutInput = document.getElementById(`fade-out-${part}`);
    const audibleDuration = Math.max(0, duration - delayValue - endTrimValue);
    let fadeInValue = clampAudioControlValue(fadeInInput?.value, 0, audibleDuration, 0);
    let fadeOutValue = clampAudioControlValue(fadeOutInput?.value, 0, audibleDuration, 0);
    const activeFadeId = document.activeElement?.id || '';
    if (fadeInValue + fadeOutValue > audibleDuration) {
        if (activeFadeId === `fade-out-${part}`) fadeInValue = Math.max(0, audibleDuration - fadeOutValue);
        else fadeOutValue = Math.max(0, audibleDuration - fadeInValue);
    }
    if (fadeInInput) {
        fadeInInput.value = String(fadeInValue);
        fadeInInput.max = String(Math.max(0, audibleDuration - fadeOutValue));
    }
    if (fadeOutInput) {
        fadeOutInput.value = String(fadeOutValue);
        fadeOutInput.max = String(Math.max(0, audibleDuration - fadeInValue));
    }
    const state = getAudioAdvancedState(part);
    const fadeIn = document.getElementById(`val-fade-in-${part}`);
    const fadeOut = document.getElementById(`val-fade-out-${part}`);
    const gain = document.getElementById(`lbl-vol-${part}`);
    const normalizeTarget = document.getElementById(`val-normalize-target-${part}`);
    const delay = document.getElementById(`val-delay-${part}`);
    const sourceIn = document.getElementById(`val-source-in-${part}`);
    const endTrim = document.getElementById(`val-end-trim-${part}`);
    if (fadeIn) fadeIn.textContent = formatAudioSeconds(state.fadeIn);
    if (fadeOut) fadeOut.textContent = formatAudioSeconds(state.fadeOut);
    if (gain) gain.textContent = formatAudioGainDb(state.gainDb);
    if (normalizeTarget) normalizeTarget.textContent = `${state.normalizeTargetDb.toFixed(1)} dBFS`;
    const normalizeTargetSelect = document.getElementById(`audio-normalize-target-${part}`);
    if (normalizeTargetSelect) normalizeTargetSelect.disabled = !state.normalize;
    if (delay) delay.textContent = formatAudioSeconds(state.delay);
    if (sourceIn) sourceIn.textContent = formatAudioSeconds(state.sourceIn);
    if (endTrim) endTrim.textContent = formatAudioSeconds(state.endTrim);
    const summary = document.getElementById(`audio-studio-summary-${part}`);
    if (summary) {
        const t = traducoes[idiomaAtual] || traducoes.en;
        const audibleStart = Math.min(duration, state.delay);
        const audibleEnd = Math.max(audibleStart, duration - state.endTrim);
        summary.textContent = (t.audioStudioTimingSummary || 'Part {part} · plays {start}–{end} · source +{source}').replace('{part}', formatAudioSeconds(duration)).replace('{start}', formatAudioSeconds(audibleStart)).replace('{end}', formatAudioSeconds(audibleEnd)).replace('{source}', formatAudioSeconds(state.sourceIn));
    }
}

function syncAudioAdvancedVisibility(part) {
    const select = document.getElementById(`sel-audio-${part}`);
    const details = document.getElementById(`audio-advanced-${part}`);
    const timing = document.getElementById(`audio-studio-timing-${part}`);
    if (!select || !details) return;
    const visible = select.value !== 'none';
    details.classList.toggle('visible', visible);
    timing?.classList.toggle('visible', visible);
    if (!visible) {
        details.open = false;
        if (typeof stopAudioStudioPreview === 'function') stopAudioStudioPreview();
    }
}

function handleAudioAdvancedInput(part) {
    syncAudioAdvancedLabels(part);
    if (typeof renderAudioFadeHandles === 'function') renderAudioFadeHandles(part);
    if (typeof invalidateAudioPreviewState === 'function') invalidateAudioPreviewState({ transport: true, waveforms: true });
    else if (typeof stopAudioStudioPreview === 'function') stopAudioStudioPreview();
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('audio', { changeKey: `audio:${part}:advanced` });
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

function handleAudioVolumeInput(part) {
    const label = document.getElementById(`lbl-vol-${part}`);
    if (label) label.textContent = formatAudioGainDb(document.getElementById(`vol-${part}`)?.value);
    if (typeof invalidateAudioPreviewState === 'function') invalidateAudioPreviewState({ transport: true, waveforms: true });
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('audio', { changeKey: `audio:${part}:volume` });
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

function resetAudioAdvancedState(part) {
    document.getElementById(`fade-in-${part}`).value = 0;
    document.getElementById(`fade-out-${part}`).value = 0;
    const fadeCurve = document.getElementById(`audio-fade-curve-${part}`);
    if (fadeCurve) fadeCurve.value = 'linear';
    const normalizeTarget = document.getElementById(`audio-normalize-target-${part}`);
    if (normalizeTarget) normalizeTarget.value = -1;
    const delay = document.getElementById(`audio-delay-${part}`);
    if (delay) delay.value = 0;
    const sourceIn = document.getElementById(`audio-source-in-${part}`);
    if (sourceIn) sourceIn.value = 0;
    const legacy = document.getElementById(`audio-offset-${part}`);
    if (legacy) legacy.value = 0;
    const endTrim = document.getElementById(`audio-end-trim-${part}`);
    if (endTrim) endTrim.value = 0;
    document.getElementById(`audio-normalize-${part}`).checked = false;
    const details = document.getElementById(`audio-advanced-${part}`);
    details.open = false;
    details.classList.remove('visible');
    syncAudioAdvancedLabels(part);
}

function resetAudioState() {
    const t = traducoes[idiomaAtual];
    if (typeof stopAudioStudioPreview === 'function') stopAudioStudioPreview();
    document.getElementById('input-usar-som').checked = false;
    ['intro', 'loop', 'final'].forEach(part => {
        importedAudioFiles[part] = null;
        importedAudioKinds[part] = 'none';
        importedAudioNames[part] = '';
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
        volume.value = 0;
        volumeLabel.textContent = '0.0 dB';
        resetAudioAdvancedState(part);
    });
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);
    currentPreviewPart = -1;
    verificarPainelAudio({ renderTimeline: false });
    if (typeof invalidateAudioPreviewState === 'function') invalidateAudioPreviewState({ transport: true, waveforms: true });
}

function setImportedAudio(part, blob, name, kind = 'imported') {
    importedAudioFiles[part] = blob;
    importedAudioKinds[part] = kind === 'file' ? 'file' : 'imported';
    importedAudioNames[part] = name || 'audio.wav';
    const select = document.getElementById(`sel-audio-${part}`);
    const optFile = document.getElementById(`opt-file-${part}`);
    const wrap = document.getElementById(`vol-wrap-${part}`);
    const label = `${name || 'audio.wav'}`;
    select.value = 'file';
    optFile.textContent = label;
    optFile.setAttribute('data-custom', label);
    wrap.style.display = 'grid';
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
        wrap.style.display = "grid";
    } else if (select.value === 'video') {
        importedAudioFiles[part] = null;
        importedAudioKinds[part] = 'none';
        importedAudioNames[part] = '';
        wrap.style.display = "grid";
    } else {
        importedAudioFiles[part] = null;
        importedAudioKinds[part] = 'none';
        importedAudioNames[part] = '';
        wrap.style.display = "none";
        const t = traducoes[idiomaAtual];
        document.getElementById(`opt-file-${part}`).textContent = t.optFile;
        document.getElementById(`opt-file-${part}`).removeAttribute('data-custom');
    }
    syncAudioAdvancedVisibility(part);
    syncAudioAdvancedLabels(part);
    if (typeof invalidateAudioPreviewState === 'function') invalidateAudioPreviewState({ transport: true, waveforms: true });
    else if (typeof stopAudioStudioPreview === 'function') stopAudioStudioPreview();
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('audio', { changeKey: `audio:${part}:source` });
}

function fileAudioSelecionado(part) {
    const inputFile = document.getElementById(`file-audio-${part}`);
    const select = document.getElementById(`sel-audio-${part}`);
    const optFile = document.getElementById(`opt-file-${part}`);
    const wrap = document.getElementById(`vol-wrap-${part}`);
    if (inputFile.files.length > 0) {
        importedAudioFiles[part] = null;
        importedAudioKinds[part] = 'none';
        importedAudioNames[part] = '';
        const nome = inputFile.files[0].name;
        optFile.textContent = `${nome}`;
        optFile.setAttribute('data-custom', `${nome}`);
        wrap.style.display = "grid";
    } else if (!importedAudioFiles[part]) {
        select.value = "none";
        const t = traducoes[idiomaAtual];
        optFile.textContent = t.optFile;
        optFile.removeAttribute('data-custom');
        wrap.style.display = "none";
    }
    syncAudioAdvancedVisibility(part);
    syncAudioAdvancedLabels(part);
    if (typeof invalidateAudioPreviewState === 'function') invalidateAudioPreviewState({ transport: true, waveforms: true });
    else if (typeof stopAudioStudioPreview === 'function') stopAudioStudioPreview();
    if (typeof renderTimeline3 === 'function') renderTimeline3();
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('audio', { changeKey: `audio:${part}:file` });
}

function fecharModal() {
    if (typeof cancelPreviewAudioBuild === 'function') cancelPreviewAudioBuild();
    if (typeof stopAdvancedPartsPreview === 'function') stopAdvancedPartsPreview();
    if (window.BASMasterSequence) BASMasterSequence.stopModalPreview();
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
    const advancedActive = typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive();
    const masterSimple = !advancedActive && window.BASMasterSequence && BASMasterSequence.isTimelineActive();
    videoPreview.muted = true;
    currentPreviewPart = -1;
    if (advancedActive && typeof startAdvancedPartsPreview === 'function') {
        videoPreview.src = playerVideo.src;
        atualizarPreviewEnquadramento();
        requestAnimationFrame(() => {
            applyFramingFocusVisuals();
            startModalPreviewRenderer();
        });
        await startAdvancedPartsPreview().catch(() => {});
        return;
    }
    if (masterSimple) {
        await BASMasterSequence.startModalPreview(videoPreview, marcadores.m0 || 0, Number.isFinite(marcadores.m3) ? marcadores.m3 : BASMasterSequence.getDuration()).catch(() => false);
        atualizarPreviewEnquadramento();
        requestAnimationFrame(() => {
            applyFramingFocusVisuals();
            startModalPreviewRenderer();
        });
        if (typeof preparePreviewAudioFromCurrentState === 'function') await preparePreviewAudioFromCurrentState().catch(() => {});
        if (document.getElementById('modal-preview').style.display !== 'none') videoPreview.play().catch(() => {});
        return;
    }
    videoPreview.src = playerVideo.src;
    atualizarPreviewEnquadramento();
    videoPreview.currentTime = marcadores.m0 || 0;
    requestAnimationFrame(() => {
        applyFramingFocusVisuals();
        startModalPreviewRenderer();
    });
    if (typeof preparePreviewAudioFromCurrentState === 'function') await preparePreviewAudioFromCurrentState().catch(() => {});
    if (document.getElementById('modal-preview').style.display !== 'none') videoPreview.play().catch(() => {});
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
