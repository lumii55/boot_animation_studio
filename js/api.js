

function isPrivateIPv4(ip) {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip || '');
    if (!match) return false;
    const parts = match.slice(1).map(Number);
    if (parts.some(part => part < 0 || part > 255)) return false;
    return parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168);
}

function subnetFromIPv4(ip) {
    if (!isPrivateIPv4(ip)) return '';
    return ip.split('.').slice(0, 3).join('.');
}

function localNetworkFetch(url, options = {}) {
    try {
        const parsed = new URL(url, window.location.href);
        const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        const loopback = hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
        if (loopback) return fetch(url, options);
    } catch (error) {
        return fetch(url, options);
    }
    return fetch(url, { targetAddressSpace: 'local', ...options });
}

function rememberPhoneIp(ip) {
    if (!isPrivateIPv4(ip)) return;
    try {
        localStorage.setItem('bootstudio_last_phone_ip', ip);
    } catch (error) {
    }
}

function rememberedPhoneIp() {
    try {
        const ip = localStorage.getItem('bootstudio_last_phone_ip') || '';
        return isPrivateIPv4(ip) ? ip : '';
    } catch (error) {
        return '';
    }
}

function currentPhoneIp() {
    try {
        const url = new URL(IP_LOCAL);
        return isPrivateIPv4(url.hostname) ? url.hostname : '';
    } catch (error) {
        return '';
    }
}

async function discoverLocalIPv4s(timeout = 1200) {
    if (typeof RTCPeerConnection !== 'function') return [];
    const found = new Set();
    let pc;
    try {
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('bootstudio-discovery');
        await new Promise(async resolve => {
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                resolve();
            };
            const timer = setTimeout(finish, timeout);
            pc.onicecandidate = event => {
                if (!event.candidate) {
                    clearTimeout(timer);
                    finish();
                    return;
                }
                const candidate = event.candidate;
                const values = [];
                if (candidate.address) values.push(candidate.address);
                if (candidate.candidate) {
                    const parts = candidate.candidate.trim().split(/\s+/);
                    if (parts.length >= 5) values.push(parts[4]);
                }
                for (const value of values) {
                    if (isPrivateIPv4(value)) found.add(value);
                }
            };
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
            } catch (error) {
                clearTimeout(timer);
                finish();
            }
        });
    } catch (error) {
    } finally {
        if (pc) pc.close();
    }
    return Array.from(found);
}

async function discoveryPlan() {
    const exactIps = [];
    const subnets = [];
    const addIp = ip => {
        if (!isPrivateIPv4(ip) || exactIps.includes(ip)) return;
        exactIps.push(ip);
        const subnet = subnetFromIPv4(ip);
        if (subnet && !subnets.includes(subnet)) subnets.push(subnet);
    };
    const addSubnet = subnet => {
        if (subnet && !subnets.includes(subnet)) subnets.push(subnet);
    };

    addIp(rememberedPhoneIp());
    addIp(currentPhoneIp());

    const localIps = await discoverLocalIPv4s();
    localIps.forEach(ip => addSubnet(subnetFromIPv4(ip)));

    const input = document.getElementById('input-ip');
    if (input) {
        const value = input.value.trim();
        addIp(value);
        const prefixMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.$/.exec(value);
        if (prefixMatch) {
            const parts = prefixMatch.slice(1).map(Number);
            if (parts.every(part => part >= 0 && part <= 255)) addSubnet(parts.join('.'));
        }
    }

    [
        '192.168.0', '192.168.1', '192.168.15', '192.168.2', '10.0.0', '192.168.3'
    ].forEach(addSubnet);

    return { exactIps, subnets };
}

function discoveryHostOrder(exactIps, subnet) {
    const preferred = [];
    const seen = new Set();
    for (const ip of exactIps) {
        if (subnetFromIPv4(ip) !== subnet) continue;
        const host = Number(ip.split('.')[3]);
        if (host >= 1 && host <= 254 && !seen.has(host)) {
            seen.add(host);
            preferred.push(host);
        }
    }
    for (let host = 100; host <= 199; host++) {
        if (!seen.has(host)) preferred.push(host);
    }
    for (let host = 2; host <= 99; host++) {
        if (!seen.has(host)) preferred.push(host);
    }
    for (let host = 200; host <= 254; host++) {
        if (!seen.has(host)) preferred.push(host);
    }
    if (!seen.has(1)) preferred.push(1);
    return preferred;
}

async function scanDiscoverySubnet(subnet, exactIps, checker, generationCheck, chunkSize = 24) {
    const hosts = discoveryHostOrder(exactIps, subnet);
    for (let start = 0; start < hosts.length; start += chunkSize) {
        if (generationCheck && !generationCheck()) return null;
        const batch = hosts.slice(start, start + chunkSize);
        const results = await Promise.all(batch.map(host => checker(`${subnet}.${host}`)));
        const found = results.find(Boolean);
        if (found) return found;
    }
    return null;
}

function randomPairingToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pairingShortCode(token) {
    return token.slice(0, 3).toUpperCase() + '-' + token.slice(-3).toUpperCase();
}

function buildPairingLink(token) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = 'bootstudio-pair=' + encodeURIComponent(token);
    return url.toString();
}

function setPairingStatus(text, type = 'normal') {
    const el = document.getElementById('pairing-status');
    if (!el) return;
    el.textContent = text;
    el.dataset.type = type;
    el.style.color = type === 'success' ? '#5ed7a1' : type === 'error' ? '#ff6b81' : '#bbb';
}

function renderPairingQr(token) {
    const target = document.getElementById('pairing-qr');
    if (!target) return false;
    target.innerHTML = '';
    if (typeof QRCode !== 'function') return false;
    new QRCode(target, {
        text: buildPairingLink(token),
        width: 164,
        height: 164,
        colorDark: '#111111',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    return true;
}

async function checkPairingIP(ip, token, timeout = 1400) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await localNetworkFetch(`http://${ip}:4040/pair_status?token=${encodeURIComponent(token)}`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        return data.status === 'ready' ? ip : null;
    } catch (error) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function checkQrCapableIP(ip, timeout = 2200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await localNetworkFetch(`http://${ip}:4040/info`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        const features = Array.isArray(data.features) ? data.features : [];
        return Number(data.api_version) === 1 && features.includes('qr_pairing') ? ip : null;
    } catch (error) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function discoverQrCapablePhone(generation) {
    const plan = await discoveryPlan();
    const stillActive = () => pairingScanGeneration === generation;

    for (const ip of plan.exactIps) {
        if (!stillActive()) return null;
        const found = await checkQrCapableIP(ip);
        if (found) return found;
    }

    for (const subnet of plan.subnets) {
        if (!stillActive()) return null;
        const found = await scanDiscoverySubnet(
            subnet,
            plan.exactIps,
            checkQrCapableIP,
            stillActive,
            24
        );
        if (found) return found;
    }
    return null;
}

async function waitForQrApproval(ip, token, generation) {
    const t = traducoes[idiomaAtual];
    const deadline = Date.now() + 120000;
    while (pairingScanGeneration === generation && pairingToken === token && Date.now() < deadline) {
        const found = await checkPairingIP(ip, token, 2600);
        if (found) {
            await finishQrPairing(found, token, generation);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 700));
    }
    if (pairingScanGeneration === generation && pairingToken === token) {
        setPairingStatus(t.pairTimeout, 'error');
    }
}

async function finishQrPairing(ip, token, generation) {
    if (pairingScanGeneration !== generation || pairingToken !== token) return;
    const t = traducoes[idiomaAtual];
    setPairingStatus(t.pairFound, 'success');
    try {
        const base = `http://${ip}:4040`;
        const response = await localNetworkFetch(base + '/pair_exchange?token=' + encodeURIComponent(token), { method: 'POST', signal: AbortSignal.timeout(12000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'ok' || !data.token) throw new Error(data.message || 'pairing_failed');
        pairingScanGeneration++;
        pairingToken = '';
        sessionToken = data.token;
        IP_LOCAL = base;
        resetModuleCompatibility();
        await detectModuleCompatibility();
        if (moduleCompatibilityMode === 'legacy_pending') activateLegacySecureCompatibility();
        fecharModalRede();
        completeConnectedState(data);
        showToast(t.pairSuccess, 'success');
    } catch (error) {
        setPairingStatus(t.pairFailed, 'error');
    }
}

async function startQrPairing() {
    const t = traducoes[idiomaAtual];
    pairingScanGeneration++;
    const generation = pairingScanGeneration;
    pairingToken = '';
    const qr = document.getElementById('pairing-qr');
    const code = document.getElementById('pairing-code');
    if (qr) qr.innerHTML = '';
    if (code) code.textContent = '------';
    setPairingStatus(t.scanningMsg);

    const targetIp = await discoverQrCapablePhone(generation);
    if (pairingScanGeneration !== generation) return;
    if (!targetIp) {
        setPairingStatus(t.scanNotFound, 'error');
        return;
    }

    rememberPhoneIp(targetIp);
    const input = document.getElementById('input-ip');
    if (input) input.value = targetIp;
    pairingToken = randomPairingToken();
    if (code) code.textContent = pairingShortCode(pairingToken);
    if (!renderPairingQr(pairingToken)) {
        pairingToken = '';
        setPairingStatus(t.pairQrUnavailable, 'error');
        return;
    }
    setPairingStatus(t.pairWaiting);
    waitForQrApproval(targetIp, pairingToken, generation);
}

function handlePairingHandoff() {
    const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(rawHash);
    const token = params.get('bootstudio-pair');
    if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return;
    pairingHandoffUrl = 'bootstudio://pair?token=' + encodeURIComponent(token);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    const modal = document.getElementById('modal-pair-handoff');
    const openBtn = document.getElementById('btn-pair-open');
    const backBtn = document.getElementById('btn-pair-back');
    if (!modal || !openBtn || !backBtn) return;
    openBtn.onclick = () => { window.location.href = pairingHandoffUrl; };
    backBtn.onclick = () => { modal.style.display = 'none'; };
    modal.style.display = 'flex';
    setTimeout(() => {
        if (document.visibilityState === 'visible') window.location.href = pairingHandoffUrl;
    }, 120);
}

function completeConnectedState(data) {
    const t = traducoes[idiomaAtual];
    isConnectedMode = true;
    document.getElementById('initial-state').style.display = 'none';
    document.getElementById('connected-state').style.display = 'flex';
    document.getElementById('editor-section').style.display = 'flex';
    document.getElementById('wrap-gerar-modulo').style.display = 'flex';
    document.getElementById('wrap-nome').style.display = 'flex';
    window.connectedPhoneModel = data.model || '';
    window.connectedPhoneResolution = data.resolution || '';
    document.getElementById('status-connected').textContent = window.connectedPhoneModel || t.statusConnected;
    if (hasModuleFeature('device_resolution') && data.resolution && data.resolution !== 'Unknown') {
        const optAuto = document.getElementById('opt-auto');
        optAuto.style.display = 'block';
        optAuto.value = data.resolution;
        optAuto.textContent = `${t.deviceResolutionLabel} (${data.resolution})`;
        document.getElementById('input-qualidade').value = data.resolution;
    }
    rememberPhoneIp(currentPhoneIp());
    applyConnectedCapabilities(data);
    document.getElementById('acoes-principais').style.gridTemplateColumns = '1fr 1fr';
    if (typeof verificarModulo === 'function') verificarModulo();
    if (typeof setBuildDeliveryTarget === 'function') setBuildDeliveryTarget(document.getElementById('input-gerar-modulo')?.checked ? 'download' : 'phone', { skipButtons: true });
    atualizarBotoesELinhas();
    if (hasModuleFeature('history')) loadHistory();
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
    syncConnectedDeviceSurfaces();
    if (typeof syncModuleWorkspaceUi === 'function') syncModuleWorkspaceUi();
    if (window.BASModuleTest?.refreshStatus) window.BASModuleTest.refreshStatus();
    if (typeof consumeModuleWorkspaceConnectionRequest === 'function' && consumeModuleWorkspaceConnectionRequest()) {
        if (typeof openModuleWorkspace === 'function') openModuleWorkspace({ origin: 'launch', instant: true });
    }
}

function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (sessionToken) headers.set('X-Boot-Creator-Token', sessionToken);
    return localNetworkFetch(IP_LOCAL + path, { ...options, headers });
}

function resetModuleCompatibility() {
    moduleInfo = null;
    moduleApiVersion = null;
    moduleFeatures = new Set();
    moduleCompatibilityMode = 'unknown';
}

function hasModuleFeature(feature) {
    return moduleFeatures.has(feature);
}

function ensureModuleFeature(feature) {
    if (hasModuleFeature(feature)) return true;
    alert(traducoes[idiomaAtual].msgFeatureUnavailable);
    return false;
}

async function detectModuleCompatibility() {
    resetModuleCompatibility();
    try {
        const response = await localNetworkFetch(IP_LOCAL + '/info', { signal: AbortSignal.timeout(2200) });
        if (!response.ok) {
            moduleCompatibilityMode = 'legacy_pending';
            return true;
        }

        const data = await response.json();
        const apiVersion = Number(data.api_version);
        if (!Number.isInteger(apiVersion)) {
            moduleCompatibilityMode = 'legacy_pending';
            return true;
        }

        moduleInfo = data;
        moduleApiVersion = apiVersion;
        moduleFeatures = new Set(Array.isArray(data.features) ? data.features.filter(feature => typeof feature === 'string') : []);

        if (apiVersion < SITE_API_MIN) {
            moduleCompatibilityMode = 'incompatible_old';
            alert(traducoes[idiomaAtual].msgModuleTooOld);
            return false;
        }

        if (apiVersion > SITE_API_MAX) {
            moduleCompatibilityMode = 'incompatible_new';
            alert(traducoes[idiomaAtual].msgModuleTooNew);
            return false;
        }

        if (!moduleFeatures.has('session_auth')) {
            moduleCompatibilityMode = 'incompatible_old';
            alert(traducoes[idiomaAtual].msgModuleTooOld);
            return false;
        }

        moduleCompatibilityMode = 'versioned';
        return true;
    } catch (error) {
        moduleCompatibilityMode = 'legacy_pending';
        return true;
    }
}

function activateLegacySecureCompatibility() {
    moduleInfo = null;
    moduleApiVersion = 0;
    moduleFeatures = new Set(LEGACY_SECURE_FEATURES);
    moduleCompatibilityMode = 'legacy_secure';
}

function applyConnectedCapabilities(data) {
    const canRemove = hasModuleFeature('remove') && data.has_custom;
    document.getElementById('btn-remove').style.display = canRemove ? 'flex' : 'none';
    window.hasCustomAnimApplied = Boolean(data.has_custom);
    document.getElementById('btn-pull').style.display = hasModuleFeature('pull') ? 'flex' : 'none';
    document.getElementById('lbl-upload-direto').style.display = hasModuleFeature('direct_upload') ? 'flex' : 'none';
    document.getElementById('btn-reset').style.display = hasModuleFeature('rescan_paths') ? 'flex' : 'none';
    const historyWrapper = document.getElementById('history-wrapper');
    if (historyWrapper) historyWrapper.style.display = hasModuleFeature('history') ? '' : 'none';
    if (window.BASModuleTest?.sync) window.BASModuleTest.sync();
}

function syncConnectedDeviceSurfaces() {
    if (typeof syncOutputPresetsUi === 'function') syncOutputPresetsUi();
    if (typeof syncCustomProfilesUi === 'function') syncCustomProfilesUi();
    if (typeof syncDeviceProfileUi === 'function') syncDeviceProfileUi();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck();
}

function forcarDesconexao() {
    if (isConnectedMode && sessionToken) {
        apiFetch('/disconnect', { method: 'POST', keepalive: true }).catch(()=>{});
    }
}
window.addEventListener('beforeunload', forcarDesconexao);
window.addEventListener('pagehide', forcarDesconexao);
window.addEventListener('unload', forcarDesconexao);

async function connectToPhone() {
    const btn = document.getElementById('btn-connect');
    const t = traducoes[idiomaAtual];
    btn.textContent = t.msgSearching;

    try {
        let response = await apiFetch('/ping', { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
            await tentaConexao();
        } else {
            throw new Error("Failed");
        }
    } catch (error) {
        btn.textContent = t.btnConnect; 
        document.getElementById('modal-network').style.display = 'flex';
        startQrPairing();
    }
}

async function tentaConexao() {
    const btn = document.getElementById('btn-connect');
    const t = traducoes[idiomaAtual];
    btn.textContent = t.msgSearching;

    try {
        if (!await detectModuleCompatibility()) {
            btn.textContent = t.btnConnect;
            return;
        }

        let response = await apiFetch('/ping');
        let data = await response.json();

        if (data.status === 'auth_required') {
            sessionToken = '';
            btn.textContent = t.msgWaitingAuth;
            let authRes = await apiFetch('/request_auth', { method: 'POST' });
            data = await authRes.json();
            
            if (data.status === 'denied') {
                alert(t.msgAuthDenied);
                btn.textContent = t.btnConnect;
                return;
            } else if (data.status === 'timeout') {
                alert(t.msgAuthTimeout);
                btn.textContent = t.btnConnect;
                return;
            } else if (data.status === 'busy') {
                alert(t.msgWaitingAuth);
                btn.textContent = t.btnConnect;
                return;
            }

            if (data.status === 'ok' && data.token) {
                sessionToken = data.token;
                if (moduleCompatibilityMode === 'legacy_pending') activateLegacySecureCompatibility();
            }
        }

        if (data.status === 'ok' && !sessionToken && moduleCompatibilityMode === 'legacy_pending') {
            try { await fetch(IP_LOCAL + '/disconnect'); } catch (error) {}
            moduleCompatibilityMode = 'incompatible_old';
            alert(t.msgModuleTooOld);
            btn.textContent = t.btnConnect;
            return;
        }

        if (data.status === 'ok' && sessionToken) {
            completeConnectedState(data);
        } else {
            sessionToken = '';
            alert(t.msgNotFound);
            btn.textContent = t.btnConnect;
        }
    } catch (error) {
        sessionToken = '';
        alert(t.msgNotFound);
        btn.textContent = t.btnConnect;
    }
}

async function conectarPorIp() {
    pairingScanGeneration++;
    pairingToken = '';
    const ip = document.getElementById('input-ip').value.trim();
    if(!ip) return;
    sessionToken = '';
    IP_LOCAL = `http://${ip}:4040`;
    fecharModalRede();
    tentaConexao();
}

function fecharModalRede(cancelConnectionIntent = false) {
    pairingScanGeneration++;
    pairingToken = '';
    document.getElementById('modal-network').style.display = 'none';
    if (cancelConnectionIntent && typeof cancelModuleWorkspaceConnectionRequest === 'function') cancelModuleWorkspaceConnectionRequest();
}

async function checkIP(ip) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200); 
    try {
        const res = await localNetworkFetch(`http://${ip}:4040/ping`, { signal: controller.signal });
        if (res.ok) {
            const data = await res.json();
            if (data.status) return ip;
        }
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
    return null;
}

async function iniciarVarredura() {
    pairingScanGeneration++;
    pairingToken = '';
    const btn = document.getElementById('btn-scan-net');
    const desc = document.getElementById('lbl-modal-net-desc');
    const originalText = btn.textContent;
    const t = traducoes[idiomaAtual];

    btn.textContent = t.scanningMsg;
    btn.style.pointerEvents = 'none';
    desc.textContent = t.scanningMsg;

    const plan = await discoveryPlan();
    let foundIp = null;

    for (const ip of plan.exactIps) {
        foundIp = await checkIP(ip);
        if (foundIp) break;
    }

    for (const subnet of plan.subnets) {
        if (foundIp) break;
        foundIp = await scanDiscoverySubnet(subnet, plan.exactIps, checkIP, null, 24);
    }

    if (foundIp) {
        desc.textContent = t.scanFound;
        document.getElementById('input-ip').value = foundIp;
        rememberPhoneIp(foundIp);
        sessionToken = '';
        IP_LOCAL = `http://${foundIp}:4040`;
        setTimeout(() => {
            fecharModalRede();
            tentaConexao();
        }, 1500);
    } else {
        desc.textContent = t.scanNotFound;
        btn.textContent = originalText;
        btn.style.pointerEvents = 'all';
    }
}

function startManualMode() {
    if (typeof cancelModuleWorkspaceConnectionRequest === 'function') cancelModuleWorkspaceConnectionRequest();
    if (typeof isModuleWorkspaceOpen === 'function' && isModuleWorkspaceOpen() && typeof leaveModuleWorkspaceToStudio === 'function') leaveModuleWorkspaceToStudio();
    sessionToken = '';
    resetModuleCompatibility();
    isConnectedMode = false;
    window.connectedPhoneModel = '';
    window.connectedPhoneResolution = '';
    document.getElementById('initial-state').style.display = 'none';
    document.getElementById('editor-section').style.display = 'flex';
    document.getElementById('wrap-gerar-modulo').style.display = 'flex';
    document.getElementById('wrap-nome').style.display = 'flex';
    
    document.getElementById('acoes-principais').style.gridTemplateColumns = "1fr 1fr";
    document.getElementById('btn-remove').style.display = "none";
    document.getElementById('btn-pull').style.display = "none";
    document.getElementById('lbl-upload-direto').style.display = "none";
    document.getElementById('btn-reset').style.display = "none";
    
    if (typeof setBuildDeliveryTarget === 'function') setBuildDeliveryTarget('download', { skipButtons: true });
    atualizarBotoesELinhas();
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
    syncConnectedDeviceSurfaces();
}

async function disconnectPhone() {
    try { await apiFetch('/disconnect', { method: 'POST' }); } catch(e) {}
    sessionToken = '';
    resetModuleCompatibility();
    isConnectedMode = false;
    window.connectedPhoneModel = '';
    window.connectedPhoneResolution = '';
    document.getElementById('initial-state').style.display = 'none';
    document.getElementById('connected-state').style.display = 'none';
    document.getElementById('editor-section').style.display = 'flex';
    document.getElementById('wrap-gerar-modulo').style.display = 'flex';
    document.getElementById('wrap-nome').style.display = 'flex';
    document.getElementById('btn-remove').style.display = 'none';
    document.getElementById('btn-pull').style.display = 'none';
    document.getElementById('lbl-upload-direto').style.display = 'none';
    document.getElementById('btn-reset').style.display = 'none';
    document.getElementById('btn-connect').textContent = traducoes[idiomaAtual].btnConnect;
    if (typeof setBuildDeliveryTarget === 'function') setBuildDeliveryTarget('download', { skipButtons: true });
    atualizarBotoesELinhas();
    const returnedToLaunch = typeof handleModuleWorkspaceDisconnect === 'function' ? handleModuleWorkspaceDisconnect() : false;
    if (!returnedToLaunch) {
        document.getElementById('initial-state').style.display = 'none';
        document.getElementById('editor-section').style.display = 'flex';
    }
    if (typeof syncWorkspaceUi === 'function') syncWorkspaceUi();
    if (typeof syncReleaseUi === 'function') syncReleaseUi();
    syncConnectedDeviceSurfaces();
    if (typeof syncModuleWorkspaceUi === 'function') syncModuleWorkspaceUi();
    if (window.BASModuleTest?.refreshStatus) window.BASModuleTest.refreshStatus();
}

async function removeAnimation() {
    const t = traducoes[idiomaAtual];
    if (!ensureModuleFeature('remove')) return;
    if(await askConfirmation(t.msgConfirmRemove, true)) {
        try {
            let res = await apiFetch('/remove', { method: 'POST' });
            
            if (res.ok) {
                let data = await res.json();
                if (data.status === "success") {
                    showToast(t.msgRemoveSuccess, 'success');
                    document.getElementById('btn-remove').style.display = "none";
                    window.hasCustomAnimApplied = false;
                    syncConnectedDeviceSurfaces();
                } else {
                    alert(t.msgRemoveError + data.message);
                }
            } else {
                alert(t.erro + " (HTTP " + res.status + ")");
            }
        } catch (error) {
            alert(t.msgMagicConnError);
        }
    }
}

async function resetarModulo() {
    const t = traducoes[idiomaAtual];
    if (!ensureModuleFeature('rescan_paths')) return;
    if(await askConfirmation(t.msgResetConfirm, true)) {
        try {
            let res = await apiFetch('/rescan', { method: 'POST' });
            if (res.ok) {
                let data = await res.json();
                showToast(t.msgRescanSuccess, 'success');
                if (Object.prototype.hasOwnProperty.call(data, 'has_custom')) {
                    window.hasCustomAnimApplied = Boolean(data.has_custom);
                }
                document.getElementById('btn-remove').style.display = hasModuleFeature('remove') && window.hasCustomAnimApplied ? 'flex' : 'none';
                syncConnectedDeviceSurfaces();
            } else {
                alert(t.msgResetError);
            }
        } catch (error) {
            alert(t.msgResetError);
        }
    }
}

function historyIdToDate(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return new Date();
    return new Date(String(id).length >= 13 ? numericId : numericId * 1000);
}

function historyFormatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value < 100 * 1024 * 1024 ? 1 : 0)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function historyItemFromLegacyId(id) {
    return {
        id: String(id),
        created_at: historyIdToDate(id).getTime(),
        size_bytes: 0,
        width: 0,
        height: 0,
        fps: 0,
        frame_count: 0,
        parts: 0,
        frame_format: '',
        has_audio: false,
        has_preview: false,
        preview_type: ''
    };
}

async function fetchHistoryItems() {
    if (hasModuleFeature('history_details')) {
        const response = await apiFetch('/history/items');
        if (!response.ok) throw new Error('history_details_failed');
        const items = await response.json();
        return Array.isArray(items) ? items : [];
    }
    const response = await apiFetch('/history/list');
    if (!response.ok) throw new Error('history_list_failed');
    const ids = await response.json();
    return Array.isArray(ids) ? ids.map(historyItemFromLegacyId) : [];
}

async function historyPreviewElement(id) {
    const t = traducoes[idiomaAtual];
    const placeholder = document.createElement('div');
    placeholder.className = 'hist-card-preview-placeholder';
    placeholder.textContent = t.historyPreviewLoading || 'Preparing preview…';
    try {
        const response = await apiFetch('/history/preview?id=' + encodeURIComponent(id));
        if (!response.ok) throw new Error('preview_unavailable');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const contentType = String(response.headers.get('Content-Type') || blob.type || '').toLowerCase();
        let gifSignature = '';
        try {
            const header = new Uint8Array(await blob.slice(0, 6).arrayBuffer());
            gifSignature = String.fromCharCode(...header);
        } catch (error) {
        }
        const isGif = contentType.includes('gif') || gifSignature === 'GIF87a' || gifSignature === 'GIF89a';
        let media;
        if (isGif || contentType.startsWith('image/')) {
            media = document.createElement('img');
            media.alt = t.historyPreviewAlt || 'Boot animation preview';
        } else {
            media = document.createElement('video');
            media.autoplay = true;
            media.loop = true;
            media.muted = true;
            media.playsInline = true;
            media.setAttribute('aria-label', t.historyPreviewAlt || 'Boot animation preview');
        }
        media.className = 'hist-card-media';
        media.src = url;
        media.dataset.objectUrl = url;
        return media;
    } catch (error) {
        placeholder.textContent = t.historyPreviewUnavailable || 'Preview unavailable';
        return placeholder;
    }
}

function historyDetailsText(item) {
    const details = [];
    if (Number(item.width) > 0 && Number(item.height) > 0) details.push(`${item.width}×${item.height}`);
    if (Number(item.fps) > 0) details.push(`${item.fps} FPS`);
    if (item.frame_format) details.push(String(item.frame_format));
    if (Number(item.size_bytes) > 0) details.push(historyFormatBytes(item.size_bytes));
    return details.join(' · ');
}

async function loadHistory() {
    if (!hasModuleFeature('history')) {
        document.getElementById('history-wrapper').style.display = 'none';
        return;
    }
    try {
        const items = await fetchHistoryItems();
        const scroll = document.getElementById('history-scroll');
        scroll.querySelectorAll('[data-object-url]').forEach(media => URL.revokeObjectURL(media.dataset.objectUrl));
        scroll.innerHTML = '';

        const historyLimit = Math.max(1, Number(moduleInfo && moduleInfo.history_limit) || 5);
        const historyCount = document.getElementById('p11-history-count');
        if (historyCount) historyCount.textContent = `${items.length} / ${historyLimit}`;
        document.getElementById('history-wrapper').style.display = 'flex';

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'history-empty';
            empty.textContent = traducoes[idiomaAtual].historyEmpty || 'No saved animations yet.';
            scroll.appendChild(empty);
            return;
        }

        const t = traducoes[idiomaAtual];
        for (const rawItem of items) {
            const item = { ...historyItemFromLegacyId(rawItem.id), ...rawItem, id: String(rawItem.id) };
            const card = document.createElement('article');
            card.className = 'hist-card';
            card.dataset.historyId = item.id;

            const mediaWrap = document.createElement('div');
            mediaWrap.className = 'hist-card-media-wrap';
            mediaWrap.appendChild(await historyPreviewElement(item.id));

            const body = document.createElement('div');
            body.className = 'hist-card-body';

            const date = document.createElement('time');
            date.className = 'hist-card-date';
            const dateValue = Number(item.created_at) > 0 ? new Date(Number(item.created_at)) : historyIdToDate(item.id);
            date.dateTime = dateValue.toISOString();
            date.textContent = dateValue.toLocaleString();

            const details = document.createElement('div');
            details.className = 'hist-card-details';
            details.textContent = historyDetailsText(item) || (t.historyLegacyDetails || 'Legacy history item');

            const facts = document.createElement('div');
            facts.className = 'hist-card-facts';
            if (Number(item.frame_count) > 0) {
                const frameFact = document.createElement('span');
                frameFact.textContent = (t.historyFrames || '{count} frames').replace('{count}', item.frame_count);
                facts.appendChild(frameFact);
            }
            if (Number(item.parts) > 0) {
                const partFact = document.createElement('span');
                partFact.textContent = (t.historyParts || '{count} parts').replace('{count}', item.parts);
                facts.appendChild(partFact);
            }
            if (item.has_audio) {
                const audioFact = document.createElement('span');
                audioFact.textContent = t.historyAudio || 'Audio';
                facts.appendChild(audioFact);
            }

            const actions = document.createElement('div');
            actions.className = 'hist-card-actions';

            const btnApply = document.createElement('button');
            btnApply.className = 'btn-apply';
            btnApply.type = 'button';
            btnApply.textContent = t.btnApplyHist;
            btnApply.onclick = () => applyHistory(item.id);

            actions.appendChild(btnApply);

            if (hasModuleFeature('history_download')) {
                const btnOpen = document.createElement('button');
                btnOpen.className = 'btn-history-secondary';
                btnOpen.type = 'button';
                btnOpen.textContent = t.historyOpenInStudio || 'Open in Studio';
                btnOpen.onclick = () => openHistoryInStudio(item.id);
                actions.appendChild(btnOpen);

                const btnDownload = document.createElement('button');
                btnDownload.className = 'btn-history-secondary';
                btnDownload.type = 'button';
                btnDownload.textContent = t.historyDownload || 'Download';
                btnDownload.onclick = () => downloadHistoryItem(item.id);
                actions.appendChild(btnDownload);
            }

            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-history-delete';
            btnDelete.type = 'button';
            btnDelete.setAttribute('aria-label', t.historyDelete || 'Delete from History');
            btnDelete.textContent = '×';
            btnDelete.onclick = () => deleteHistory(item.id);
            mediaWrap.appendChild(btnDelete);

            body.append(date, details);
            if (facts.childNodes.length) body.appendChild(facts);
            body.appendChild(actions);
            card.append(mediaWrap, body);
            scroll.appendChild(card);
        }
    } catch (error) {
        console.warn('Could not load module history', error);
    }
}

async function fetchHistoryBlob(id) {
    if (!ensureModuleFeature('history_download')) return null;
    const response = await apiFetch('/history/download?id=' + encodeURIComponent(id));
    if (!response.ok) throw new Error('history_download_failed');
    return await response.blob();
}

async function openHistoryInStudio(id) {
    const t = traducoes[idiomaAtual];
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('device');
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.historyOpening || 'Opening history item…';
    try {
        const blob = await fetchHistoryBlob(id);
        if (!blob) return;
        await abrirZipNoEditor(blob);
        if (typeof isModuleWorkspaceOpen === 'function' && isModuleWorkspaceOpen() && typeof leaveModuleWorkspaceToStudio === 'function') leaveModuleWorkspaceToStudio();
        showToast(t.historyOpened || 'History animation opened in Studio.', 'success');
    } catch (error) {
        showToast(t.historyOpenError || 'Could not open this History animation.', 'error');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

async function downloadHistoryItem(id) {
    const t = traducoes[idiomaAtual];
    try {
        const blob = await fetchHistoryBlob(id);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bootanimation-${id}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
        showToast(t.historyDownloadError || 'Could not download this History animation.', 'error');
    }
}

async function deleteHistory(id) {
    const t = traducoes[idiomaAtual];
    if (!ensureModuleFeature('history')) return;
    if (!await askConfirmation(t.msgConfirmDeleteHistory, true)) return;
    try {
        const res = await apiFetch('/history/delete?id=' + encodeURIComponent(id), { method: 'POST' });
        if (!res.ok) throw new Error();
        await loadHistory();
        showToast(t.msgHistoryDeleted, 'success');
    } catch(e) { showToast(t.msgDelHistoryError, 'error'); }
}

async function applyHistory(id) {
    const t = traducoes[idiomaAtual];
    if (!ensureModuleFeature('history')) return;
    if (!await askConfirmation(t.msgConfirmApplyHistory, false)) return;
    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('device');
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.msgInjectingPast;
    try {
        let res = await apiFetch('/history/apply?id=' + encodeURIComponent(id), { method: 'POST' });
        if(res.ok) {
            showToast(t.msgApplyHistorySuccess, 'success');
            document.getElementById('btn-remove').style.display = 'flex';
            window.hasCustomAnimApplied = true;
            syncConnectedDeviceSurfaces();
        } else {
            throw new Error();
        }
    } catch(e) { showToast(t.msgApplyHistoryError, 'error'); }
    document.getElementById('loading-overlay').style.display = 'none';
}

async function createMiniPreviewWebm(options = null) {
    const c = document.createElement('canvas');
    const targetWidth = options && options.width ? options.width : originalW;
    const targetHeight = options && options.height ? options.height : originalH;
    c.width = 150;
    c.height = Math.max(2, Math.floor(150 * (targetHeight / targetWidth)));
    const ctx = c.getContext('2d');
    const stream = c.captureStream(10);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    let recorderStopped = false;
    const stopped = new Promise((resolve, reject) => {
        rec.ondataavailable = event => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        rec.onerror = event => reject(event.error || new Error('Preview recording failed'));
        rec.onstop = () => {
            recorderStopped = true;
            resolve();
        };
    });
    rec.start();
    try {
        const advancedPart = typeof getAdvancedPreviewSamplePart === 'function' ? getAdvancedPreviewSamplePart() : null;
        const framing = options && options.framing ? options.framing : 'cover';
        const framingFocus = options && options.framingFocus ? options.framingFocus : getCurrentFramingFocus();
        if (advancedPart && window.BASSourceLibrary) {
            const sourceId = BASSourceLibrary.getPartSourceId(advancedPart);
            let sourceTime = Number.isFinite(advancedPart.start) ? advancedPart.start : 0;
            const sourceEnd = Number.isFinite(advancedPart.end) ? advancedPart.end : sourceTime;
            const step = Math.max(0.0001, (sourceEnd - sourceTime) / 30);
            for (let i = 0; i < 30; i++) {
                const frameBlob = await BASSourceLibrary.frameBlob(sourceId, sourceTime, c.width, c.height, 'jpeg', framing, framingFocus, 0.76);
                const drawable = await blobToDrawable(frameBlob);
                ctx.drawImage(drawable, 0, 0, c.width, c.height);
                releaseDrawable(drawable);
                sourceTime += step;
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        } else if (window.BASMasterSequence && BASMasterSequence.isTimelineActive()) {
            const sampleStart = Number.isFinite(marcadores.m1) ? marcadores.m1 : 0;
            const sampleEnd = Number.isFinite(marcadores.m2) && marcadores.m2 > sampleStart ? marcadores.m2 : BASMasterSequence.getDuration();
            let time = sampleStart;
            const step = Math.max(0.0001, (sampleEnd - sampleStart) / 30);
            for (let i = 0; i < 30; i++) {
                const frameBlob = await BASMasterSequence.frameBlob(time, c.width, c.height, 'jpeg', framing, framingFocus, 0.76);
                const drawable = await blobToDrawable(frameBlob);
                ctx.drawImage(drawable, 0, 0, c.width, c.height);
                releaseDrawable(drawable);
                time = Math.min(sampleEnd, time + step);
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        } else {
            const sampleStart = marcadores.m1;
            const sampleEnd = marcadores.m2;
            let time = Number.isFinite(sampleStart) ? sampleStart : 0;
            const step = Math.max(0.0001, ((Number.isFinite(sampleEnd) ? sampleEnd : time) - time) / 30);
            for (let i = 0; i < 30; i++) {
                const frameBlob = await getProjectFrameOutputBlob(time, c.width, c.height, 'jpeg', framing, framingFocus, 0.76);
                const drawable = await blobToDrawable(frameBlob);
                ctx.drawImage(drawable, 0, 0, c.width, c.height);
                releaseDrawable(drawable);
                time += step;
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }
        rec.stop();
        await Promise.race([
            stopped,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Preview recorder stop timed out')), 5000))
        ]);
        return new Blob(chunks, { type: 'video/webm' });
    } finally {
        if (!recorderStopped && rec.state !== 'inactive') {
            try { rec.stop(); } catch (error) {}
        }
        stream.getTracks().forEach(track => track.stop());
        c.width = 1;
        c.height = 1;
    }
}

function abrirModalPull() {
    if (window.hasCustomAnimApplied) {
        document.getElementById('modal-pull').style.display = 'flex';
    } else {
        puxarAnimacao('system');
    }
}

function fecharModalPull() {
    document.getElementById('modal-pull').style.display = 'none';
}

async function puxarAnimacao(source) {
    if (!ensureModuleFeature('pull')) return;
    fecharModalPull();
    const t = traducoes[idiomaAtual];
    document.getElementById('texto-progresso').textContent = traducoes[idiomaAtual].msgPullingPhone;
    document.getElementById('container-progresso').style.display = 'flex';
    
    try {
        let res = await apiFetch('/pull?source=' + encodeURIComponent(source) + '&t=' + Date.now());
        if (!res.ok) throw new Error("Failed to pull");
        
        let blob = await res.blob();
        await abrirZipNoEditor(blob);
        if (typeof isModuleWorkspaceOpen === 'function' && isModuleWorkspaceOpen() && typeof leaveModuleWorkspaceToStudio === 'function') leaveModuleWorkspaceToStudio();
        
        document.getElementById('container-progresso').style.display = 'none';
        
    } catch(e) {
        alert(t.erro + " - " + e.message);
        document.getElementById('container-progresso').style.display = 'none';
    }
}

document.getElementById('upload-zip').addEventListener('change', function(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    abrirZipNoEditor(arquivo);
});

document.getElementById('upload-zip-direto').addEventListener('change', async function(evento) {
    const arquivo = evento.target.files[0];
    const t = traducoes[idiomaAtual];
    if (!arquivo) return;
    if (!ensureModuleFeature('direct_upload')) {
        evento.target.value = '';
        return;
    }

    const legacyDirectUploadLimit = 25 * 1024 * 1024;
    const warningBytes = Math.max(1, Number(moduleInfo && moduleInfo.direct_upload_warning_bytes) || legacyDirectUploadLimit);
    const advertisedMaxBytes = Number(moduleInfo && moduleInfo.max_direct_upload_bytes);
    const maxBytes = hasModuleFeature('large_upload') && Number.isFinite(advertisedMaxBytes) && advertisedMaxBytes > 0
        ? advertisedMaxBytes
        : legacyDirectUploadLimit;
    if (maxBytes > 0 && arquivo.size > maxBytes) {
        alert((t.msgDirectUploadHardLimit || 'This ZIP exceeds the module transport safety limit ({limit}).').replace('{limit}', historyFormatBytes(maxBytes)));
        evento.target.value = '';
        return;
    }
    if (arquivo.size > warningBytes) {
        const warning = (t.msgLargeDirectUploadConfirm || 'This boot animation is large ({size}). Large animations may stutter during boot or fail on some devices. Continue anyway?').replace('{size}', historyFormatBytes(arquivo.size));
        if (!await askConfirmation(warning, false)) {
            evento.target.value = '';
            return;
        }
    }

    if (typeof setLoadingTipContext === 'function') setLoadingTipContext('device');
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('txt-loading-timeline').textContent = t.msgCheckingZip;

    try {
        document.getElementById('txt-loading-timeline').textContent = t.msgInjectingPhone;

        const formData = new FormData();
        formData.append('bootanimation', arquivo, 'bootanimation.zip');

        const res = await apiFetch('/upload', { method: 'POST', body: formData });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.message || t.msgZipInjectRefused);

        showToast(t.msgZipInjectSuccess, 'success');
        document.getElementById('btn-remove').style.display = 'flex';
        window.hasCustomAnimApplied = true;
        syncConnectedDeviceSurfaces();
        await loadHistory();
    } catch (e) {
        alert(t.erro + " - " + e.message);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
        evento.target.value = ''; 
    }
});

window.addEventListener('DOMContentLoaded', handlePairingHandoff);
