btnGerar.addEventListener('click', async () => {
    if (btnGerar.classList.contains('btn-desativado') || isGenerating) return;
    const t = traducoes[idiomaAtual];
    
    isGenerating = true;
    videoContainer.classList.add('bloqueado');
    timelineWrapper.classList.add('bloqueado');
    gridMarcadores.classList.add('bloqueado');
    configuracoes.classList.add('bloqueado');
    
    btnGerar.classList.add('btn-desativado');
    btnGerar.textContent = t.gerandoFrames;
    document.getElementById('container-progresso').style.display = 'flex'; 
    
    try {
        const innerZip = new JSZip();
        
        let fps = parseInt(document.getElementById('input-fps').value) || 30;
        fps = Math.min(60, Math.max(1, fps)); 

        const largura = parseInt(document.getElementById('input-largura').value) || originalW;
        const altura = parseInt(document.getElementById('input-altura').value) || originalH;
        const formato = document.getElementById('input-formato').value;
        const fabricante = document.getElementById('input-fabricante').value;
        const isModuloMagisk = document.getElementById('input-gerar-modulo').checked;
        const isSomAtivo = document.getElementById('input-usar-som').checked;
        
        let nomeEscolhido = document.getElementById('input-nome').value.trim();
        if (!nomeEscolhido) nomeEscolhido = "bootanimation";
        
        canvasInvisivel.width = largura; canvasInvisivel.height = altura;

        await paparazzoOtimizado(innerZip, largura, altura, fps, formato, t);

        const p0 = document.getElementById('sel-audio-intro').value;
        const p1 = document.getElementById('sel-audio-loop').value;
        const p2 = document.getElementById('sel-audio-final').value;

        let conteudoDesc = `${largura} ${altura} ${fps}\n`;
        conteudoDesc += "c 1 0 part0\n";
        conteudoDesc += "p 0 0 part1\n";
        conteudoDesc += "c 1 0 part2\n";

        innerZip.file("desc.txt", conteudoDesc);

        ['m0', 'm1', 'm2'].forEach(clearPreviewAudio);

        if (isSomAtivo) {
            document.getElementById('texto-progresso').textContent = t.processandoAudio;
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            let videoAudioBuffer = null;
            if (p0 === 'video' || p1 === 'video' || p2 === 'video') {
                videoAudioBuffer = await decodificarAudioFonte(playerVideo.src, audioCtx);
            }

            const v0 = parseInt(document.getElementById('vol-intro').value) / 100.0;
            const v1 = parseInt(document.getElementById('vol-loop').value) / 100.0;
            const v2 = parseInt(document.getElementById('vol-final').value) / 100.0;

            if (p0 !== 'none') {
                let buf0 = (p0 === 'video') ? videoAudioBuffer : await decodificarAudioFonte(getSelectedAudioFile('intro'), audioCtx);
                let blob0 = null;
                if (p0 === 'video') {
                    blob0 = await fatiarEGerarWav(buf0, marcadores.m0, marcadores.m1, audioCtx, v0);
                } else if (buf0) {
                    blob0 = await fatiarEGerarWav(buf0, 0, buf0.duration, audioCtx, v0);
                }
                if (blob0) {
                    innerZip.folder("part0").file("audio.wav", blob0);
                    setPreviewAudio('m0', blob0);
                }
            }

            if (p1 !== 'none') {
                let buf1 = (p1 === 'video') ? videoAudioBuffer : await decodificarAudioFonte(getSelectedAudioFile('loop'), audioCtx);
                let blob1 = null;
                if (p1 === 'video') {
                    blob1 = await fatiarEGerarWav(buf1, marcadores.m1, marcadores.m2, audioCtx, v1);
                } else if (buf1) {
                    blob1 = await fatiarEGerarWav(buf1, 0, buf1.duration, audioCtx, v1);
                }
                if (blob1) {
                    innerZip.folder("part1").file("audio.wav", blob1);
                    setPreviewAudio('m1', blob1);
                }
            }

            if (p2 !== 'none') {
                let buf2 = (p2 === 'video') ? videoAudioBuffer : await decodificarAudioFonte(getSelectedAudioFile('final'), audioCtx);
                let blob2 = null;
                if (p2 === 'video') {
                    blob2 = await fatiarEGerarWav(buf2, marcadores.m2, marcadores.m3, audioCtx, v2);
                } else if (buf2) {
                    blob2 = await fatiarEGerarWav(buf2, 0, buf2.duration, audioCtx, v2);
                }
                if (blob2) {
                    innerZip.folder("part2").file("audio.wav", blob2);
                    setPreviewAudio('m2', blob2);
                }
            }
        }
        
        document.getElementById('texto-progresso').textContent = t.compactandoZip;
        btnGerar.textContent = t.fechandoZiper;
        
        const rawBootAnimBlob = await innerZip.generateAsync({ type: "blob", compression: "STORE" });
        
        if (isConnectedMode) {
            if (!ensureModuleFeature('direct_upload')) throw new Error(t.msgFeatureUnavailable);
            document.getElementById('texto-progresso').textContent = t.msgInjecting;
            
            const previewWebmBlob = await createMiniPreviewWebm();

            const formData = new FormData();
            formData.append('bootanimation', rawBootAnimBlob, 'bootanimation.zip');
            formData.append('preview', previewWebmBlob, 'preview.webm');

            const uploadRes = await apiFetch("/upload", {
                method: "POST",
                body: formData
            });
            if (!uploadRes.ok) throw new Error("Upload failed");
            await loadHistory();
        } else {
            if (isModuloMagisk) {
                const magiskZip = new JSZip();
                
                magiskZip.file("module.prop", `id=custom_bootanim\nname=Custom Bootanimation Module\nversion=1.0\nversionCode=1\nauthor=BootAnimCreator\ndescription=Custom boot animation generated by the website.`);
                magiskZip.file("system.prop", "persist.sys.bootanim.play_sound=1\nro.bootanim.set_volume=1");
                
                const caminhosPorVariante = {
                    standard: ["product/media", "system/media", "apex/com.android.bootanimation/etc"],
                    miui: ["product/media", "system/media", "system_ext/media", "system/media/theme", "apex/com.android.bootanimation/etc"],
                    mtk: ["product/media", "system/media", "custom/media", "apex/com.android.bootanimation/etc"],
                    motorola: ["product/media", "system/media", "oem/media", "apex/com.android.bootanimation/etc"],
                    emui: ["product/media", "system/media", "system/etc/media", "apex/com.android.bootanimation/etc"]
                };

                const caminhosAUsar = caminhosPorVariante[fabricante] || caminhosPorVariante['standard'];
                for (let caminho of caminhosAUsar) {
                    let pastaAtual = magiskZip;
                    for (let p of caminho.split('/')) { pastaAtual = pastaAtual.folder(p); }
                    pastaAtual.file("bootanimation.zip", rawBootAnimBlob);
                }
                
                const rawFinalBlob = await magiskZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } });
                const linkDownload = document.createElement("a");
                linkDownload.href = URL.createObjectURL(rawFinalBlob);
                linkDownload.download = `${nomeEscolhido}.zip`; 
                linkDownload.click();
            } else {
                const linkDownload = document.createElement("a");
                linkDownload.href = URL.createObjectURL(rawBootAnimBlob);
                linkDownload.download = `${nomeEscolhido}.zip`; 
                linkDownload.click();
            }
        }
        
        document.getElementById('texto-progresso').textContent = "OK!";
        
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
        }, 2000);
        
    } catch (erro) {
        console.error(erro);
        btnGerar.textContent = t.erro;
        document.getElementById('texto-progresso').style.color = "#ff5555";
        
        setTimeout(() => {
            isGenerating = false;
            videoContainer.classList.remove('bloqueado');
            timelineWrapper.classList.remove('bloqueado');
            gridMarcadores.classList.remove('bloqueado');
            configuracoes.classList.remove('bloqueado');
            atualizarBotoesELinhas(); 
        }, 2500);
    }
});

async function paparazzoOtimizado(zip, largura, altura, fps, formato, t) {
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
        const blob = await getProjectFrameOutputBlob(sourceTime, largura, altura, formato);
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
    }
}
