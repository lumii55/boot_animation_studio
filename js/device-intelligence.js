const BAS_DEVICE_INTELLIGENCE_VERSION = 1;

const deviceIntelligenceRuntime = {
    data: null,
    loading: false,
    error: '',
    requestId: 0,
    bound: false
};

function deviceIntelligenceText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function deviceIntelligenceTemplate(key, fallback, values = {}) {
    let text = deviceIntelligenceText(key, fallback);
    Object.entries(values).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value));
    });
    return text;
}

function deviceIntelligenceSupported() {
    return !!isConnectedMode && typeof hasModuleFeature === 'function' && hasModuleFeature('device_intelligence');
}

function deviceIntelligenceArchiveLabel(archive) {
    const format = String(archive && archive.format || 'unknown');
    const labels = {
        aosp_frames: ['deviceIntelFormatAosp', 'AOSP frame ZIP'],
        oem_video_sequence: ['deviceIntelFormatOemVideo', 'OEM video sequence'],
        aosp_desc: ['deviceIntelFormatAospDesc', 'AOSP-style descriptor'],
        unknown_zip: ['deviceIntelFormatUnknownZip', 'Unknown ZIP format'],
        unknown: ['deviceIntelUnknown', 'Unknown']
    };
    const entry = labels[format] || labels.unknown;
    return deviceIntelligenceText(entry[0], entry[1]);
}

function deviceIntelligenceArchiveDetail(archive) {
    if (!archive || archive.status !== 'ok') return deviceIntelligenceText('deviceIntelArchiveUnavailable', 'Archive details unavailable.');
    const details = [];
    if (Number(archive.width) > 0 && Number(archive.height) > 0) details.push(`${archive.width} × ${archive.height}`);
    if (Number(archive.fps) > 0) details.push(`${archive.fps} FPS`);
    if (Number(archive.frame_count) > 0) details.push(deviceIntelligenceTemplate('deviceIntelFrames', '{count} frames', { count: archive.frame_count }));
    if (Number(archive.video_count) > 0) details.push(deviceIntelligenceTemplate('deviceIntelVideos', '{count} videos', { count: archive.video_count }));
    if (archive.has_audio_wav) details.push(deviceIntelligenceText('deviceIntelArchiveAudio', 'audio.wav present'));
    return details.join(' · ') || deviceIntelligenceText('deviceIntelArchiveReadable', 'Readable boot animation archive.');
}

function deviceIntelligenceConfidenceLabel(confidence) {
    const map = {
        confirmed: ['deviceIntelConfirmed', 'Confirmed'],
        observed: ['deviceIntelObserved', 'Observed'],
        fallback: ['deviceIntelFallback', 'Fallback'],
        unknown: ['deviceIntelUnknown', 'Unknown']
    };
    const entry = map[confidence] || map.unknown;
    return deviceIntelligenceText(entry[0], entry[1]);
}

function deviceIntelligenceTargetDetail(boot) {
    const confidence = String(boot && boot.primary_path_confidence || 'unknown');
    if (confidence === 'confirmed') return deviceIntelligenceText('deviceIntelTargetConfirmedDesc', 'A stock backup confirms this path existed on the system before the module override.');
    if (confidence === 'observed') return deviceIntelligenceText('deviceIntelTargetObservedDesc', 'The path is visible in the live boot mount namespace, but no stock backup proves its original source.');
    if (confidence === 'fallback') return deviceIntelligenceText('deviceIntelTargetFallbackDesc', 'This is a safe fallback path from the scanner and has not been verified as a real system source.');
    return deviceIntelligenceText('deviceIntelTargetUnknownDesc', 'No usable bootanimation target was reported.');
}

function deviceIntelligenceAudioDetail(audio, renderer) {
    if (audio && audio.state === 'observed') {
        if (renderer && renderer.audio_wav_marker) {
            return deviceIntelligenceText('deviceIntelAudioObservedRendererDesc', 'The active bootanimation renderer contains the audio.wav support marker. Playback can still depend on ROM sound policy.');
        }
        if (Array.isArray(audio.evidence) && audio.evidence.includes('stock_archive_audio_wav')) {
            return deviceIntelligenceText('deviceIntelAudioObservedStockDesc', 'The stock boot animation contains audio.wav. Playback can still depend on ROM sound policy.');
        }
        return deviceIntelligenceText('deviceIntelAudioObservedDesc', 'Boot audio support was observed from device evidence.');
    }
    return deviceIntelligenceText('deviceIntelAudioUnknownDesc', 'No safe device evidence currently confirms audio.wav playback support.');
}

function deviceIntelligenceSystemSummary(system) {
    const main = [];
    if (system && system.android) main.push(`Android ${system.android}`);
    if (Number(system && system.sdk) > 0) main.push(`API ${system.sdk}`);
    const detail = [];
    if (system && (system.build_display || system.build_id)) detail.push(system.build_display || system.build_id);
    if (system && system.slot) detail.push(deviceIntelligenceTemplate('deviceIntelSlotValue', 'Slot {slot}', { slot: system.slot }));
    if (Number(system && system.density_dpi) > 0) detail.push(`${system.density_dpi} dpi`);
    return {
        value: main.join(' · ') || deviceIntelligenceText('deviceIntelUnknown', 'Unknown'),
        detail: detail.join(' · ') || deviceIntelligenceText('deviceIntelBuildUnknown', 'Build details unavailable.')
    };
}

function deviceIntelligenceSetCard(id, value, detail, state = '') {
    const card = document.getElementById(id);
    if (!card) return;
    const strong = card.querySelector('strong');
    const small = card.querySelector('small');
    if (strong) strong.textContent = value;
    if (small) small.textContent = detail;
    if (state) card.dataset.state = state;
    else delete card.dataset.state;
}

function deviceIntelligenceRenderTargets(boot) {
    const list = document.getElementById('device-intelligence-targets-list');
    if (!list) return;
    list.replaceChildren();
    const targets = Array.isArray(boot && boot.targets) ? boot.targets : [];
    if (!targets.length) {
        const empty = document.createElement('span');
        empty.className = 'device-intelligence-target-empty';
        empty.textContent = deviceIntelligenceText('deviceIntelTargetsEmpty', 'No target paths reported.');
        list.appendChild(empty);
        return;
    }
    targets.forEach((target, index) => {
        const row = document.createElement('div');
        row.className = 'device-intelligence-target-row';
        if (index === 0) row.dataset.primary = 'true';
        const path = document.createElement('code');
        path.textContent = target.path || '—';
        row.appendChild(path);
        const badges = document.createElement('div');
        badges.className = 'device-intelligence-target-badges';
        if (index === 0) {
            const primary = document.createElement('span');
            primary.textContent = deviceIntelligenceText('deviceIntelPrimary', 'Primary');
            primary.dataset.state = 'primary';
            badges.appendChild(primary);
        }
        if (target.verified_system_path) {
            const verified = document.createElement('span');
            verified.textContent = deviceIntelligenceText('deviceIntelSystemSource', 'System source');
            verified.dataset.state = 'confirmed';
            badges.appendChild(verified);
        }
        if (target.module_overlay) {
            const overlay = document.createElement('span');
            overlay.textContent = deviceIntelligenceText('deviceIntelModuleOverlay', 'Module overlay');
            overlay.dataset.state = 'observed';
            badges.appendChild(overlay);
        }
        if (target.global_present) {
            const live = document.createElement('span');
            live.textContent = deviceIntelligenceText('deviceIntelLivePath', 'Live');
            live.dataset.state = 'observed';
            badges.appendChild(live);
        }
        row.appendChild(badges);
        list.appendChild(row);
    });
}

function syncDeviceIntelligenceText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = deviceIntelligenceText(key, fallback);
    };
    set('device-intelligence-kicker', 'deviceIntelKicker', 'DEVICE INTELLIGENCE');
    set('device-intelligence-title', 'deviceIntelTitle', 'Live compatibility probes');
    set('device-intelligence-desc', 'deviceIntelDesc', 'Read-only device facts collected by the module. BAS uses these results instead of guessing from the manufacturer.');
    set('device-intelligence-refresh-label', 'deviceIntelRefresh', 'Refresh probes');
    set('device-intelligence-system-label', 'deviceIntelSystemLabel', 'Android / build');
    set('device-intelligence-target-label', 'deviceIntelTargetLabel', 'Boot target');
    set('device-intelligence-stock-label', 'deviceIntelStockLabel', 'Stock format');
    set('device-intelligence-audio-label', 'deviceIntelAudioLabel', 'Boot audio');
    set('device-intelligence-renderer-label', 'deviceIntelRendererLabel', 'Boot renderer');
    set('device-intelligence-mount-label', 'deviceIntelMountLabel', 'Preview mount');
    set('device-intelligence-targets-label', 'deviceIntelTargetsLabel', 'Detected bootanimation targets');
}

function renderDeviceIntelligence() {
    syncDeviceIntelligenceText();
    const root = document.getElementById('device-intelligence');
    if (!root) return;
    const supported = deviceIntelligenceSupported();
    root.hidden = !supported;
    if (!supported) return;

    const status = document.getElementById('device-intelligence-status');
    const refresh = document.getElementById('device-intelligence-refresh');
    if (refresh) refresh.disabled = deviceIntelligenceRuntime.loading;

    if (deviceIntelligenceRuntime.loading && !deviceIntelligenceRuntime.data) {
        if (status) {
            status.hidden = false;
            status.dataset.state = 'loading';
            status.textContent = deviceIntelligenceText('deviceIntelLoading', 'Reading device probes…');
        }
        return;
    }
    if (deviceIntelligenceRuntime.error && !deviceIntelligenceRuntime.data) {
        if (status) {
            status.hidden = false;
            status.dataset.state = 'error';
            status.textContent = deviceIntelligenceText('deviceIntelError', 'Device probes could not be read. Existing module features are still available.');
        }
        return;
    }

    const data = deviceIntelligenceRuntime.data;
    if (!data) {
        if (status) {
            status.hidden = false;
            status.dataset.state = 'unknown';
            status.textContent = deviceIntelligenceText('deviceIntelNotChecked', 'Device probes have not been refreshed yet.');
        }
        return;
    }
    if (status) status.hidden = true;

    const system = data.system || {};
    const boot = data.boot || {};
    const systemSummary = deviceIntelligenceSystemSummary(system);
    deviceIntelligenceSetCard('device-intelligence-system', systemSummary.value, systemSummary.detail, 'confirmed');

    const targetConfidence = String(boot.primary_path_confidence || 'unknown');
    deviceIntelligenceSetCard(
        'device-intelligence-target',
        boot.primary_path || deviceIntelligenceText('deviceIntelUnknown', 'Unknown'),
        `${deviceIntelligenceConfidenceLabel(targetConfidence)} · ${deviceIntelligenceTargetDetail(boot)}`,
        targetConfidence
    );

    const stock = boot.stock_archive || {};
    deviceIntelligenceSetCard(
        'device-intelligence-stock',
        stock.status === 'ok' ? deviceIntelligenceArchiveLabel(stock) : deviceIntelligenceText('deviceIntelUnknown', 'Unknown'),
        deviceIntelligenceArchiveDetail(stock),
        stock.status === 'ok' ? 'observed' : 'unknown'
    );

    const audio = boot.audio || {};
    deviceIntelligenceSetCard(
        'device-intelligence-audio',
        audio.state === 'observed' ? deviceIntelligenceText('deviceIntelObserved', 'Observed') : deviceIntelligenceText('deviceIntelUnknown', 'Unknown'),
        deviceIntelligenceAudioDetail(audio, boot.renderer || {}),
        audio.state === 'observed' ? 'observed' : 'unknown'
    );

    const renderer = boot.renderer || {};
    deviceIntelligenceSetCard(
        'device-intelligence-renderer',
        renderer.present && renderer.path ? renderer.path : deviceIntelligenceText('deviceIntelUnknown', 'Unknown'),
        renderer.present
            ? deviceIntelligenceText('deviceIntelRendererPresentDesc', 'A bootanimation renderer binary was found on the device.')
            : deviceIntelligenceText('deviceIntelRendererUnknownDesc', 'No known bootanimation renderer path could be confirmed.'),
        renderer.present ? 'confirmed' : 'unknown'
    );

    deviceIntelligenceSetCard(
        'device-intelligence-mount',
        boot.global_mount_access ? deviceIntelligenceText('deviceIntelAvailable', 'Available') : deviceIntelligenceText('deviceIntelUnknown', 'Unknown'),
        boot.global_mount_access
            ? deviceIntelligenceText('deviceIntelMountAvailableDesc', 'The module can address PID 1\'s mount namespace for device preview operations.')
            : deviceIntelligenceText('deviceIntelMountUnknownDesc', 'Global mount-namespace access could not be confirmed.'),
        boot.global_mount_access ? 'confirmed' : 'unknown'
    );

    deviceIntelligenceRenderTargets(boot);
    const checked = document.getElementById('device-intelligence-checked');
    if (checked) {
        const time = Number(data.collected_at);
        checked.textContent = Number.isFinite(time) && time > 0
            ? deviceIntelligenceTemplate('deviceIntelCheckedAt', 'Last checked: {time}', { time: new Date(time).toLocaleString() })
            : deviceIntelligenceText('deviceIntelCheckedNow', 'Live probe result');
    }
}

async function refreshDeviceIntelligence(options = {}) {
    if (!deviceIntelligenceSupported()) {
        resetDeviceIntelligence();
        return null;
    }
    const requestId = ++deviceIntelligenceRuntime.requestId;
    deviceIntelligenceRuntime.loading = true;
    deviceIntelligenceRuntime.error = '';
    renderDeviceIntelligence();
    try {
        const response = await apiFetch('/device/probes', { signal: AbortSignal.timeout(8000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'ok' || Number(data.schema_version) < 1) throw new Error(data.message || 'device_probe_failed');
        if (requestId !== deviceIntelligenceRuntime.requestId) return null;
        deviceIntelligenceRuntime.data = data;
        deviceIntelligenceRuntime.error = '';
        window.dispatchEvent(new CustomEvent('bas:deviceintelligence', { detail: data }));
        return data;
    } catch (error) {
        if (requestId !== deviceIntelligenceRuntime.requestId) return null;
        deviceIntelligenceRuntime.error = String(error && error.message || 'device_probe_failed');
        if (!options.silent && typeof showToast === 'function') showToast(deviceIntelligenceText('deviceIntelErrorToast', 'Could not refresh device probes.'), 'error', 2600);
        return null;
    } finally {
        if (requestId === deviceIntelligenceRuntime.requestId) {
            deviceIntelligenceRuntime.loading = false;
            renderDeviceIntelligence();
            if (typeof syncDeviceProfileUi === 'function') syncDeviceProfileUi();
            if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck(0);
            if (typeof syncModuleWorkspaceUi === 'function') syncModuleWorkspaceUi();
        }
    }
}

function resetDeviceIntelligence() {
    deviceIntelligenceRuntime.requestId += 1;
    deviceIntelligenceRuntime.data = null;
    deviceIntelligenceRuntime.loading = false;
    deviceIntelligenceRuntime.error = '';
    renderDeviceIntelligence();
}

function bindDeviceIntelligence() {
    if (deviceIntelligenceRuntime.bound) return;
    deviceIntelligenceRuntime.bound = true;
    document.getElementById('device-intelligence-refresh')?.addEventListener('click', () => refreshDeviceIntelligence());
    renderDeviceIntelligence();
}

window.BASDeviceIntelligence = Object.freeze({
    version: BAS_DEVICE_INTELLIGENCE_VERSION,
    supported: deviceIntelligenceSupported,
    refresh: refreshDeviceIntelligence,
    reset: resetDeviceIntelligence,
    sync: renderDeviceIntelligence,
    get: () => deviceIntelligenceRuntime.data,
    getAudio: () => deviceIntelligenceRuntime.data?.boot?.audio || null,
    getBoot: () => deviceIntelligenceRuntime.data?.boot || null,
    getSystem: () => deviceIntelligenceRuntime.data?.system || null
});
window.syncDeviceIntelligenceText = syncDeviceIntelligenceText;
window.addEventListener('DOMContentLoaded', bindDeviceIntelligence);
