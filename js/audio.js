function audioBufferToWav(buffer) {
    let numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferData = new ArrayBuffer(length),
        view = new DataView(bufferData),
        channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(offset, data, true); offset += 2; }
    function setUint32(data) { view.setUint32(offset, data, true); offset += 4; }

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); 
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan); 
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4); 

    for(i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while(pos < buffer.length) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
        pos++;
    }
    return new Blob([bufferData], { type: "audio/wav" });
}

async function decodificarAudioFonte(fonte, audioCtx) {
    try {
        let arrBuf;
        if (fonte instanceof Blob) {
            arrBuf = await fonte.arrayBuffer();
        } else if (typeof fonte === 'string' && fonte.length > 0) {
            const res = await fetch(fonte);
            arrBuf = await res.arrayBuffer();
        } else {
            return null;
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        return await new Promise((resolve) => {
            const res = audioCtx.decodeAudioData(arrBuf, resolve, () => resolve(null));
            if (res && res.then) res.then(resolve).catch(() => resolve(null));
        });
    } catch (e) {
        console.error("Failed to decode audio source:", e);
        return null;
    }
}

async function fatiarEGerarWav(audioBuf, startSec, endSec, audioCtx, volume = 1.0) {
    if (!audioBuf) return null;
    try {
        const sampleRate = audioBuf.sampleRate;
        const duracao = endSec - startSec;
        if (duracao <= 0) return null;

        const totalFrames = Math.max(1, Math.floor(duracao * sampleRate));
        const channels = Math.max(1, audioBuf.numberOfChannels);

        const offlineCtx = new OfflineAudioContext(channels, totalFrames, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuf;

        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        source.start(0, Math.max(0, startSec), duracao);
        const rendered = await offlineCtx.startRendering();
        return audioBufferToWav(rendered);
    } catch (e) {
        console.error("Failed to process audio segment:", e);
        return null;
    }
}
