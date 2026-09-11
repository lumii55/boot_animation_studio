function getExportOptions() {
    let fps = parseInt(document.getElementById('input-fps').value) || 30;
    fps = Math.min(60, Math.max(1, fps));
    const width = parseInt(document.getElementById('input-largura').value) || originalW;
    const height = parseInt(document.getElementById('input-altura').value) || originalH;
    let name = document.getElementById('input-nome').value.trim();
    if (!name) name = 'bootanimation';
    return {
        fps,
        width,
        height,
        format: document.getElementById('input-formato').value,
        framing: normalizeFramingMode(document.getElementById('input-enquadramento').value),
        manufacturer: document.getElementById('input-fabricante').value,
        generateModule: document.getElementById('input-gerar-modulo').checked,
        audio: captureAudioEditorState(),
        name
    };
}

function canPreserveImportedAudioChanges(audioState) {
    const baseline = currentProject && currentProject.editorBaseline && currentProject.editorBaseline.audio;
    if (!baseline || audioEditorStatesEqual(audioState, baseline)) return true;
    if (currentProject.descHasSoundDirectives) return false;
    if (!audioState.enabled) return true;

    return ['intro', 'loop', 'final'].every(role => {
        if (audioRoleStatesEqual(audioState[role], baseline[role])) return true;
        if (audioState[role].mode === 'none') return true;
        return Number.isInteger(currentProject.audioRolePartIndexes[role]);
    });
}

function canPreserveImportedRoundTrip(options) {
    return isImportedBootanimationProject() &&
        projectMarkersMatchInitial() &&
        canPreserveImportedAudioChanges(options.audio);
}

function importedExportIsUntouched(options) {
    const baseline = currentProject && currentProject.editorBaseline;
    return !!baseline &&
        frameSettingsMatchProjectBaseline(options) &&
        audioEditorStatesEqual(options.audio, baseline.audio) &&
        projectMarkersMatchInitial();
}

function updateDescHeaderForExport(descText, width, height, fps) {
    if (!descText) return `${width} ${height} ${fps}\n`;
    const eol = descText.includes('\r\n') ? '\r\n' : '\n';
    const lines = descText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = lines[i].match(/^(\s*)\S+(\s+)\S+(\s+)\S+(.*)$/);
        if (match) {
            lines[i] = `${match[1]}${width}${match[2]}${height}${match[3]}${fps}${match[4]}`;
        } else {
            lines[i] = `${width} ${height} ${fps}`;
        }
        return lines.join(eol);
    }
    return `${width} ${height} ${fps}${eol}${descText}`;
}

function getPartAudioEntries(zip, partName) {
    const safeName = escapeRegExp(partName);
    return zip.file(new RegExp('^' + safeName + '/audio\\.wav$', 'i'));
}

function removePartAudioEntries(zip, partName) {
    getPartAudioEntries(zip, partName).forEach(entry => zip.remove(entry.name));
}

function setZipPartAudio(zip, part, blob) {
    removePartAudioEntries(zip, part.name);
    const path = part.audioEntryName || `${part.name}/audio.wav`;
    zip.file(path, blob);
}

function getAudioTimelineRange(role) {
    if (role === 'intro') return [marcadores.m0, marcadores.m1];
    if (role === 'loop') return [marcadores.m1, marcadores.m2];
    return [marcadores.m2, marcadores.m3];
}

function syncPreviewAudioFromCurrentState(audioState) {
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);
    if (!audioState.enabled) return;
    const previewKeys = { intro: 'm0', loop: 'm1', final: 'm2' };
    ['intro', 'loop', 'final'].forEach(role => {
        if (audioState[role].mode !== 'file') return;
        const blob = getSelectedAudioFile(role);
        if (blob) setPreviewAudio(previewKeys[role], blob);
    });
}

async function applyImportedAudioEdits(zip, audioState) {
    const baseline = currentProject.editorBaseline.audio;
    const previewKeys = { intro: 'm0', loop: 'm1', final: 'm2' };
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);

    if (!audioState.enabled) {
        const seen = new Set();
        currentProject.parts.forEach(part => {
            if (seen.has(part.name)) return;
            seen.add(part.name);
            removePartAudioEntries(zip, part.name);
        });
        return;
    }

    let audioCtx = null;
    let videoAudioBuffer = null;
    const getAudioContext = () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    };

    try {
        for (const role of ['intro', 'loop', 'final']) {
            const state = audioState[role];
            const previewKey = previewKeys[role];
            const partIndex = currentProject.audioRolePartIndexes[role];
            const part = Number.isInteger(partIndex) ? currentProject.parts[partIndex] : null;

            if (audioRoleStatesEqual(state, baseline[role])) {
                if (state.mode === 'file') {
                    const existing = getSelectedAudioFile(role);
                    if (existing) setPreviewAudio(previewKey, existing);
                }
                continue;
            }

            if (!part) {
                clearPreviewAudio(previewKey);
                continue;
            }

            if (state.mode === 'none') {
                removePartAudioEntries(zip, part.name);
                clearPreviewAudio(previewKey);
                continue;
            }

            const ctx = getAudioContext();
            const volume = state.volume / 100;
            let outputBlob = null;

            if (state.mode === 'video') {
                if (!videoAudioBuffer) videoAudioBuffer = await decodificarAudioFonte(playerVideo.src, ctx);
                const [start, end] = getAudioTimelineRange(role);
                if (videoAudioBuffer) outputBlob = await fatiarEGerarWav(videoAudioBuffer, start, end, ctx, volume);
            } else if (state.mode === 'file') {
                const source = getSelectedAudioFile(role);
                const decoded = await decodificarAudioFonte(source, ctx);
                if (decoded) outputBlob = await fatiarEGerarWav(decoded, 0, decoded.duration, ctx, volume);
            }

            if (outputBlob) {
                setZipPartAudio(zip, part, outputBlob);
                setPreviewAudio(previewKey, outputBlob);
            } else {
                removePartAudioEntries(zip, part.name);
                clearPreviewAudio(previewKey);
            }
        }
    } finally {
        videoAudioBuffer = null;
        if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

function getUniqueProjectParts() {
    const seen = new Set();
    const result = [];
    currentProject.parts.forEach((part, index) => {
        if (seen.has(part.name)) return;
        seen.add(part.name);
        result.push({ part, index });
    });
    return result;
}

function replaceFrameExtension(path, format) {
    const extension = format === 'jpeg' ? '.jpg' : '.png';
    return path.replace(/\.(png|jpe?g)$/i, '') + extension;
}

async function regenerateImportedPartFrames(zip, options, t) {
    const sourceFps = Math.max(1, currentProject.fps || 30);
    const baseline = currentProject.editorBaseline.frame;
    const forceFormat = options.format !== baseline.format;
    const uniqueParts = getUniqueProjectParts();
    const plans = [];
    let totalFrames = 0;

    for (const item of uniqueParts) {
        const partFrames = getProjectPartFrames(item.index);
        const outputCount = partFrames.length > 0
            ? Math.max(1, Math.round(partFrames.length * options.fps / sourceFps))
            : 0;
        plans.push({ ...item, partFrames, outputCount });
        totalFrames += outputCount;

        const safeName = escapeRegExp(item.part.name);
        zip.file(new RegExp('^' + safeName + '/.*\\.(png|jpg|jpeg)$', 'i')).forEach(entry => zip.remove(entry.name));
    }

    let completed = 0;
    let lastSourceFrame = null;
    let lastOutputFormat = null;
    let lastOutputBlob = null;
    playerVideo.pause();

    for (const plan of plans) {
        if (plan.outputCount === 0) continue;
        const sourceStart = plan.part.frameStart / sourceFps;
        const sourceDuration = plan.part.frameCount / sourceFps;
        const sourceEnd = sourceStart + sourceDuration;
        const sameCount = plan.outputCount === plan.partFrames.length;

        for (let i = 0; i < plan.outputCount; i++) {
            const rawTime = sourceStart + (i / options.fps);
            const sourceTime = Math.min(Math.max(sourceStart, rawTime), Math.max(sourceStart, sourceEnd - (1 / sourceFps)));
            const sourceFrame = getProjectFrameAtTime(sourceTime);
            const outputFormat = forceFormat ? options.format : (sourceFrame && sourceFrame.format ? sourceFrame.format : options.format);
            let blob;

            if (sourceFrame && sourceFrame === lastSourceFrame && outputFormat === lastOutputFormat) {
                blob = lastOutputBlob;
            } else {
                blob = await getProjectFrameOutputBlob(sourceTime, options.width, options.height, outputFormat, options.framing);
                lastSourceFrame = sourceFrame;
                lastOutputFormat = outputFormat;
                lastOutputBlob = blob;
            }

            let path;
            if (sameCount && plan.partFrames[i]) {
                path = replaceFrameExtension(plan.partFrames[i].name, outputFormat);
            } else {
                const extension = outputFormat === 'jpeg' ? '.jpg' : '.png';
                path = `${plan.part.name}/${String(i).padStart(5, '0')}${extension}`;
            }
            zip.file(path, blob);

            completed++;
            if (completed % 4 === 0 || completed === totalFrames) {
                const percent = totalFrames > 0 ? Math.min(100, Math.floor((completed / totalFrames) * 100)) : 100;
                document.getElementById('barra-preenchimento').style.width = percent + '%';
                document.getElementById('texto-progresso').textContent = `${t.extraindo} ${completed}/${totalFrames} (${percent}%)`;
            }
            if (completed % 8 === 0) await cooperativeYield();
        }
    }

    lastSourceFrame = null;
    lastOutputBlob = null;
}

async function buildImportedRoundTrip(options, t) {
    if (importedExportIsUntouched(options)) {
        syncPreviewAudioFromCurrentState(options.audio);
        return currentProject.sourceBlob;
    }

    const zip = await JSZip.loadAsync(currentProject.sourceBlob);
    const frameSettingsChanged = !frameSettingsMatchProjectBaseline(options);
    const audioChanged = !audioEditorStatesEqual(options.audio, currentProject.editorBaseline.audio);

    if (frameSettingsChanged) {
        await regenerateImportedPartFrames(zip, options, t);
    }

    if (options.width !== currentProject.editorBaseline.frame.width ||
        options.height !== currentProject.editorBaseline.frame.height ||
        options.fps !== currentProject.editorBaseline.frame.fps) {
        zip.file('desc.txt', updateDescHeaderForExport(currentProject.descText, options.width, options.height, options.fps));
    }

    if (audioChanged) {
        document.getElementById('texto-progresso').textContent = t.processandoAudio;
        await applyImportedAudioEdits(zip, options.audio);
    } else {
        syncPreviewAudioFromCurrentState(options.audio);
    }

    document.getElementById('texto-progresso').textContent = t.compactandoZip;
    btnGerar.textContent = t.fechandoZiper;
    return await zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

async function applySimpleAudio(zip, audioState, t) {
    ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);
    if (!audioState.enabled) return;

    document.getElementById('texto-progresso').textContent = t.processandoAudio;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let videoAudioBuffer = null;

    try {
        const modes = ['intro', 'loop', 'final'].map(role => audioState[role].mode);
        if (modes.includes('video')) videoAudioBuffer = await decodificarAudioFonte(playerVideo.src, audioCtx);

        const definitions = [
            { role: 'intro', folder: 'part0', preview: 'm0', start: marcadores.m0, end: marcadores.m1 },
            { role: 'loop', folder: 'part1', preview: 'm1', start: marcadores.m1, end: marcadores.m2 },
            { role: 'final', folder: 'part2', preview: 'm2', start: marcadores.m2, end: marcadores.m3 }
        ];

        for (const definition of definitions) {
            const state = audioState[definition.role];
            if (state.mode === 'none') continue;
            const volume = state.volume / 100;
            let blob = null;

            if (state.mode === 'video') {
                if (videoAudioBuffer) blob = await fatiarEGerarWav(videoAudioBuffer, definition.start, definition.end, audioCtx, volume);
            } else {
                const source = getSelectedAudioFile(definition.role);
                const decoded = await decodificarAudioFonte(source, audioCtx);
                if (decoded) blob = await fatiarEGerarWav(decoded, 0, decoded.duration, audioCtx, volume);
            }

            if (blob) {
                zip.folder(definition.folder).file('audio.wav', blob);
                setPreviewAudio(definition.preview, blob);
            }
        }
    } finally {
        videoAudioBuffer = null;
        if (audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
    }
}

async function buildSimpleBootanimation(options, t) {
    const zip = new JSZip();
    await paparazzoOtimizado(zip, options.width, options.height, options.fps, options.format, options.framing, t);
    zip.file('desc.txt', `${options.width} ${options.height} ${options.fps}\nc 1 0 part0\np 0 0 part1\nc 1 0 part2\n`);
    await applySimpleAudio(zip, options.audio, t);
    document.getElementById('texto-progresso').textContent = t.compactandoZip;
    btnGerar.textContent = t.fechandoZiper;
    return await zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

function downloadGeneratedBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function deliverBootanimation(rawBootAnimBlob, options, t) {
    if (isConnectedMode) {
        if (!ensureModuleFeature('direct_upload')) throw new Error(t.msgFeatureUnavailable);
        document.getElementById('texto-progresso').textContent = t.msgInjecting;
        const previewWebmBlob = await createMiniPreviewWebm(options);
        const formData = new FormData();
        formData.append('bootanimation', rawBootAnimBlob, 'bootanimation.zip');
        formData.append('preview', previewWebmBlob, 'preview.webm');
        const uploadRes = await apiFetch('/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        await loadHistory();
        return;
    }

    if (options.generateModule) {
        const magiskZip = new JSZip();
        magiskZip.file('module.prop', `id=custom_bootanim\nname=Custom Bootanimation Module\nversion=1.0\nversionCode=1\nauthor=BootAnimCreator\ndescription=Custom boot animation generated by the website.`);
        magiskZip.file('system.prop', 'persist.sys.bootanim.play_sound=1\nro.bootanim.set_volume=1');
        const pathsByVariant = {
            standard: ['product/media', 'system/media', 'apex/com.android.bootanimation/etc'],
            miui: ['product/media', 'system/media', 'system_ext/media', 'system/media/theme', 'apex/com.android.bootanimation/etc'],
            mtk: ['product/media', 'system/media', 'custom/media', 'apex/com.android.bootanimation/etc'],
            motorola: ['product/media', 'system/media', 'oem/media', 'apex/com.android.bootanimation/etc'],
            emui: ['product/media', 'system/media', 'system/etc/media', 'apex/com.android.bootanimation/etc']
        };
        const paths = pathsByVariant[options.manufacturer] || pathsByVariant.standard;
        for (const path of paths) {
            let folder = magiskZip;
            for (const part of path.split('/')) folder = folder.folder(part);
            folder.file('bootanimation.zip', rawBootAnimBlob);
        }
        const finalBlob = await magiskZip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
        downloadGeneratedBlob(finalBlob, `${options.name}.zip`);
        return;
    }

    downloadGeneratedBlob(rawBootAnimBlob, `${options.name}.zip`);
}

btnGerar.addEventListener('click', async () => {
    if (btnGerar.classList.contains('btn-desativado') || isGenerating) return;
    const t = traducoes[idiomaAtual];
    const options = getExportOptions();
    const estimate = typeof estimateExportPerformance === 'function' ? estimateExportPerformance(options) : null;
    if (typeof confirmHeavyExport === 'function' && !confirmHeavyExport(estimate)) return;

    isGenerating = true;
    videoContainer.classList.add('bloqueado');
    timelineWrapper.classList.add('bloqueado');
    gridMarcadores.classList.add('bloqueado');
    configuracoes.classList.add('bloqueado');
    btnGerar.classList.add('btn-desativado');
    btnGerar.textContent = t.gerandoFrames;
    document.getElementById('container-progresso').style.display = 'flex';
    document.getElementById('texto-progresso').style.color = '#03dac6';
    document.getElementById('barra-preenchimento').style.width = '0%';

    try {
        canvasInvisivel.width = options.width;
        canvasInvisivel.height = options.height;

        const rawBootAnimBlob = canPreserveImportedRoundTrip(options)
            ? await buildImportedRoundTrip(options, t)
            : await buildSimpleBootanimation(options, t);

        releaseExportCanvas();
        await deliverBootanimation(rawBootAnimBlob, options, t);
        document.getElementById('texto-progresso').textContent = 'OK!';
        btnGerar.style.display = 'none';
        btnVerPreview.style.display = 'block';

        setTimeout(() => {
            btnGerar.classList.remove('btn-desativado');
            btnGerar.textContent = isConnectedMode ? t.btnInjectReady : t.btnGerarPronto;
            isGenerating = false;
            videoContainer.classList.remove('bloqueado');
            timelineWrapper.classList.remove('bloqueado');
            gridMarcadores.classList.remove('bloqueado');
            configuracoes.classList.remove('bloqueado');
            if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
        }, 2000);
    } catch (erro) {
        console.error(erro);
        btnGerar.textContent = t.erro;
        document.getElementById('texto-progresso').style.color = '#ff5555';

        setTimeout(() => {
            isGenerating = false;
            videoContainer.classList.remove('bloqueado');
            timelineWrapper.classList.remove('bloqueado');
            gridMarcadores.classList.remove('bloqueado');
            configuracoes.classList.remove('bloqueado');
            atualizarBotoesELinhas();
        }, 2500);
    } finally {
        releaseExportCanvas();
    }
});

async function paparazzoOtimizado(zip, largura, altura, fps, formato, framing, t) {
    const pasta0 = zip.folder('part0');
    const pasta1 = zip.folder('part1');
    const pasta2 = zip.folder('part2');
    let c0 = 0;
    let c1 = 0;
    let c2 = 0;
    let fotosTiradas = 0;
    const intervalo = 1 / fps;
    const meioFrame = intervalo / 2;
    const sourceMarkers = getProjectSourceMarkers();
    const totalFotos = Math.floor((sourceMarkers.m3 - sourceMarkers.m0) / intervalo) + 1;
    const extensao = formato === 'jpeg' ? '.jpg' : '.png';

    playerVideo.pause();

    for (let i = 0; i < totalFotos; i++) {
        const sourceTime = sourceMarkers.m0 + (i * intervalo);
        const blob = await getProjectFrameOutputBlob(sourceTime, largura, altura, formato, framing);
        let pastaAlvo;
        let numFoto;

        if (sourceTime < sourceMarkers.m1 + meioFrame) {
            pastaAlvo = pasta0;
            numFoto = c0++;
        } else if (sourceTime < sourceMarkers.m2 + meioFrame) {
            pastaAlvo = pasta1;
            numFoto = c1++;
        } else {
            pastaAlvo = pasta2;
            numFoto = c2++;
        }

        const nome = String(numFoto).padStart(5, '0') + extensao;
        pastaAlvo.file(nome, blob);
        fotosTiradas++;

        if (fotosTiradas % 4 === 0 || fotosTiradas === totalFotos) {
            const porcentagem = Math.min(100, Math.floor((fotosTiradas / totalFotos) * 100));
            document.getElementById('barra-preenchimento').style.width = porcentagem + '%';
            document.getElementById('texto-progresso').textContent = `${t.extraindo} ${fotosTiradas}/${totalFotos} (${porcentagem}%)`;
        }
        if (fotosTiradas % 8 === 0) await cooperativeYield();
    }
}

