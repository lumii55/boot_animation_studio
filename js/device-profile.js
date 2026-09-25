const BAS_DEVICE_PROFILE_VERSION = 5;
const BAS_DEVICE_PROFILE_STORAGE_VERSION = 1;
const BAS_DEVICE_PROFILE_STORAGE_KEY = 'bas.deviceTargets.v1';
const BAS_DEVICE_PROFILE_ACTIVE_KEY = 'bas.deviceTargets.active.v1';
const BAS_DEVICE_PROFILE_LIMIT = 12;

const deviceProfileRuntime = {
    initialized: false,
    expanded: false,
    saved: [],
    activeTarget: 'live'
};

function deviceProfileText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function deviceProfileIntelligence() {
    return window.BASDeviceIntelligence && typeof BASDeviceIntelligence.get === 'function'
        ? BASDeviceIntelligence.get()
        : null;
}

function deviceProfileParseResolution(value) {
    const match = String(value || '').match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height, label: `${width} × ${height}` } : null;
}

function deviceProfileModelLabel() {
    const system = deviceProfileIntelligence()?.system || {};
    const model = String(system.model || window.connectedPhoneModel || '').trim();
    const manufacturer = String(system.manufacturer || '').trim();
    if (manufacturer && model && !model.toLowerCase().includes(manufacturer.toLowerCase())) return `${manufacturer} ${model}`;
    return model || deviceProfileText('deviceProfileGenericPhone', 'Connected phone');
}

function deviceProfileLiveResolution() {
    if (!isConnectedMode) return null;
    const intelligenceResolution = deviceProfileParseResolution(deviceProfileIntelligence()?.system?.resolution);
    if (intelligenceResolution) return intelligenceResolution;
    if (typeof compatibilityGetDeviceResolution === 'function') return compatibilityGetDeviceResolution();
    return deviceProfileParseResolution(window.connectedPhoneResolution);
}


function deviceProfileClone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
}

function deviceProfileNormalizeIdentityPart(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function deviceProfileIdentityKey(system = {}) {
    const parts = [system.manufacturer, system.brand, system.device, system.product, system.model]
        .map(deviceProfileNormalizeIdentityPart)
        .filter(Boolean);
    return parts.join('|') || `device:${deviceProfileNormalizeIdentityPart(system.model) || 'unknown'}`;
}

function deviceProfileCreateId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deviceProfileSanitizeSaved(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const system = raw.system && typeof raw.system === 'object' ? raw.system : {};
    const boot = raw.boot && typeof raw.boot === 'object' ? raw.boot : {};
    const resolution = deviceProfileParseResolution(system.resolution);
    const name = String(raw.name || system.model || '').trim().slice(0, 80);
    if (!name || !resolution) return null;
    const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities.map(String).filter(Boolean).slice(0, 64) : [];
    return {
        id: String(raw.id || deviceProfileCreateId()),
        name,
        identityKey: String(raw.identityKey || deviceProfileIdentityKey(system)),
        savedAt: Number(raw.savedAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
        collectedAt: Number(raw.collectedAt) || 0,
        system: {
            manufacturer: String(system.manufacturer || ''), brand: String(system.brand || ''), model: String(system.model || ''),
            device: String(system.device || ''), product: String(system.product || ''), android: String(system.android || ''),
            sdk: Number(system.sdk) || 0, build_id: String(system.build_id || ''), build_display: String(system.build_display || ''),
            security_patch: String(system.security_patch || ''), slot: String(system.slot || ''), resolution: resolution.label,
            density_dpi: Number(system.density_dpi) || 0
        },
        boot: {
            primary_path: String(boot.primary_path || ''), primary_path_confidence: String(boot.primary_path_confidence || 'unknown'),
            stock_archive: { format: String(boot.stock_archive?.format || 'unknown'), status: String(boot.stock_archive?.status || 'unknown') },
            current_archive: { format: String(boot.current_archive?.format || 'unknown'), status: String(boot.current_archive?.status || 'unknown') },
            audio: { state: String(boot.audio?.state || 'unknown'), evidence: Array.isArray(boot.audio?.evidence) ? boot.audio.evidence.map(String).slice(0, 16) : [] },
            renderer: { present: !!boot.renderer?.present, path: String(boot.renderer?.path || '') },
            global_mount_access: !!boot.global_mount_access,
            path_schema: String(boot.path_schema || '')
        },
        capabilities
    };
}

function deviceProfileLoadSaved() {
    try {
        const parsed = JSON.parse(localStorage.getItem(BAS_DEVICE_PROFILE_STORAGE_KEY) || '{}');
        const source = Array.isArray(parsed) ? parsed : parsed.profiles;
        deviceProfileRuntime.saved = (Array.isArray(source) ? source : []).map(deviceProfileSanitizeSaved).filter(Boolean).slice(0, BAS_DEVICE_PROFILE_LIMIT);
        const active = String(localStorage.getItem(BAS_DEVICE_PROFILE_ACTIVE_KEY) || 'live');
        deviceProfileRuntime.activeTarget = active === 'live' || deviceProfileRuntime.saved.some(profile => profile.id === active) ? active : 'live';
    } catch (error) {
        deviceProfileRuntime.saved = [];
        deviceProfileRuntime.activeTarget = 'live';
    }
}

function deviceProfilePersistSaved() {
    try {
        localStorage.setItem(BAS_DEVICE_PROFILE_STORAGE_KEY, JSON.stringify({ version: BAS_DEVICE_PROFILE_STORAGE_VERSION, profiles: deviceProfileRuntime.saved }));
        localStorage.setItem(BAS_DEVICE_PROFILE_ACTIVE_KEY, deviceProfileRuntime.activeTarget);
    } catch (error) {
        if (typeof showToast === 'function') showToast(deviceProfileText('deviceTargetStorageError', 'Device profiles could not be saved in this browser.'), 'error', 3200);
    }
}

function deviceProfileLiveTarget() {
    if (!isConnectedMode) return null;
    const resolution = deviceProfileLiveResolution();
    if (!resolution) return null;
    return {
        kind: 'live', id: 'live', name: deviceProfileModelLabel(), resolution,
        intelligence: deviceProfileIntelligence(), connected: true, savedAt: 0
    };
}

function deviceProfileSavedTarget(id) {
    const profile = deviceProfileRuntime.saved.find(item => item.id === id);
    if (!profile) return null;
    return {
        kind: 'saved', id: profile.id, name: profile.name,
        resolution: deviceProfileParseResolution(profile.system.resolution),
        intelligence: { schema_version: 1, collected_at: profile.collectedAt, system: deviceProfileClone(profile.system), boot: deviceProfileClone(profile.boot) },
        connected: false, savedAt: profile.updatedAt, profile
    };
}

function deviceProfileTarget() {
    if (deviceProfileRuntime.activeTarget !== 'live') {
        const saved = deviceProfileSavedTarget(deviceProfileRuntime.activeTarget);
        if (saved) return saved;
    }
    return deviceProfileLiveTarget();
}

function deviceProfileResolution() {
    return deviceProfileTarget()?.resolution || null;
}

function deviceProfileTargetIntelligence() {
    return deviceProfileTarget()?.intelligence || null;
}

function deviceProfileSaveLiveTarget() {
    const intelligence = deviceProfileIntelligence();
    const live = deviceProfileLiveTarget();
    if (!live || !intelligence) {
        if (typeof showToast === 'function') showToast(deviceProfileText('deviceTargetSaveUnavailable', 'Refresh Device Intelligence before saving this device profile.'), 'info', 3000);
        return null;
    }
    const system = deviceProfileClone(intelligence.system || {}) || {};
    const boot = deviceProfileClone(intelligence.boot || {}) || {};
    const identityKey = deviceProfileIdentityKey(system);
    const capabilities = deviceProfileCapabilityDefinitions().filter(([feature]) => typeof hasModuleFeature === 'function' && hasModuleFeature(feature)).map(([feature]) => feature);
    const now = Date.now();
    const previousTarget = deviceProfileRuntime.activeTarget;
    const existingIndex = deviceProfileRuntime.saved.findIndex(item => item.identityKey === identityKey);
    const existing = existingIndex >= 0 ? deviceProfileRuntime.saved[existingIndex] : null;
    const saved = deviceProfileSanitizeSaved({
        id: existing?.id || deviceProfileCreateId(), name: deviceProfileModelLabel(), identityKey,
        savedAt: existing?.savedAt || now, updatedAt: now, collectedAt: Number(intelligence.collected_at) || now,
        system, boot, capabilities
    });
    if (!saved) return null;
    if (existingIndex >= 0) deviceProfileRuntime.saved.splice(existingIndex, 1, saved);
    else {
        if (deviceProfileRuntime.saved.length >= BAS_DEVICE_PROFILE_LIMIT) deviceProfileRuntime.saved.shift();
        deviceProfileRuntime.saved.push(saved);
    }
    if (previousTarget !== 'live' && existing && previousTarget === existing.id) deviceProfileRuntime.activeTarget = saved.id;
    else deviceProfileRuntime.activeTarget = previousTarget === 'live' ? 'live' : deviceProfileRuntime.activeTarget;
    deviceProfilePersistSaved();
    syncDeviceTargetUi();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck(0);
    if (typeof syncOutputPresetsUi === 'function') syncOutputPresetsUi();
    if (typeof showToast === 'function') showToast(deviceProfileText(existing ? 'deviceTargetUpdatedToast' : 'deviceTargetSavedToast', existing ? 'Device profile updated: {name}' : 'Device profile saved: {name}').replace('{name}', saved.name), 'success', 2600);
    return saved;
}

function deviceProfileDeleteActiveSaved() {
    if (deviceProfileRuntime.activeTarget === 'live') return;
    const target = deviceProfileSavedTarget(deviceProfileRuntime.activeTarget);
    if (!target) return;
    deviceProfileRuntime.saved = deviceProfileRuntime.saved.filter(item => item.id !== target.id);
    deviceProfileRuntime.activeTarget = 'live';
    deviceProfilePersistSaved();
    syncDeviceTargetUi();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck(0);
    if (typeof syncOutputPresetsUi === 'function') syncOutputPresetsUi();
    if (typeof showToast === 'function') showToast(deviceProfileText('deviceTargetDeletedToast', 'Saved device profile deleted.'), 'success', 2200);
}

function deviceProfileSelectTarget(id) {
    const value = String(id || 'live');
    deviceProfileRuntime.activeTarget = value === 'live' || deviceProfileRuntime.saved.some(item => item.id === value) ? value : 'live';
    deviceProfilePersistSaved();
    syncDeviceTargetUi();
    if (typeof scheduleCompatibilityCheck === 'function') scheduleCompatibilityCheck(0);
    if (typeof syncOutputPresetsUi === 'function') syncOutputPresetsUi();
    if (typeof schedulePerformanceEstimate === 'function') schedulePerformanceEstimate();
}

function syncDeviceTargetUi() {
    const select = document.getElementById('device-target-select');
    const save = document.getElementById('device-target-save');
    const remove = document.getElementById('device-target-delete');
    const label = document.getElementById('device-target-label');
    const hint = document.getElementById('device-target-hint');
    if (label) label.textContent = deviceProfileText('deviceTargetLabel', 'Build target');
    if (hint) hint.textContent = deviceProfileText('deviceTargetHint', 'Choose a live or saved device profile for compatibility checks and device-aware optimization.');
    if (save) save.textContent = deviceProfileText('deviceTargetSave', 'Save live device');
    if (remove) remove.textContent = deviceProfileText('deviceTargetDelete', 'Delete saved');
    if (!select) return;
    const previous = deviceProfileRuntime.activeTarget;
    select.replaceChildren();
    const liveOption = document.createElement('option');
    liveOption.value = 'live';
    const live = deviceProfileLiveTarget();
    liveOption.textContent = live
        ? deviceProfileText('deviceTargetLiveNamed', 'Live: {name} · {resolution}').replace('{name}', live.name).replace('{resolution}', live.resolution.label)
        : deviceProfileText('deviceTargetLiveUnavailable', 'Live device (not connected)');
    liveOption.disabled = !live;
    select.appendChild(liveOption);
    deviceProfileRuntime.saved.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = deviceProfileText('deviceTargetSavedNamed', 'Saved: {name} · {resolution}').replace('{name}', profile.name).replace('{resolution}', profile.system.resolution);
        select.appendChild(option);
    });
    if (!live && previous === 'live' && deviceProfileRuntime.saved.length) deviceProfileRuntime.activeTarget = deviceProfileRuntime.saved[deviceProfileRuntime.saved.length - 1].id;
    if (!live && !deviceProfileRuntime.saved.length) {
        const none = document.createElement('option');
        none.value = 'live';
        none.textContent = deviceProfileText('deviceTargetNone', 'No device target available');
        none.disabled = false;
        select.replaceChildren(none);
        deviceProfileRuntime.activeTarget = 'live';
    }
    select.value = deviceProfileRuntime.activeTarget;
    select.disabled = !live && !deviceProfileRuntime.saved.length;
    if (save) save.disabled = !live || !deviceProfileIntelligence();
    if (remove) remove.disabled = deviceProfileRuntime.activeTarget === 'live' || !deviceProfileSavedTarget(deviceProfileRuntime.activeTarget);
}

function deviceProfileCurrentOutput() {
    if (typeof outputPresetCurrentOptions === 'function') return outputPresetCurrentOptions();
    if (typeof getPerformanceOptions === 'function') return getPerformanceOptions();
    return null;
}

function deviceProfileModuleVersion() {
    if (moduleInfo && moduleInfo.module_version) return String(moduleInfo.module_version);
    if (moduleCompatibilityMode === 'legacy_secure') return deviceProfileText('deviceProfileLegacyValue', 'Legacy');
    return deviceProfileText('deviceProfileUnknownValue', 'Unknown');
}

function deviceProfileApiVersion() {
    if (Number.isInteger(Number(moduleApiVersion)) && Number(moduleApiVersion) > 0) return String(moduleApiVersion);
    if (moduleCompatibilityMode === 'legacy_secure') return deviceProfileText('deviceProfileLegacyValue', 'Legacy');
    return deviceProfileText('deviceProfileUnknownValue', 'Unknown');
}

function deviceProfileCompanionVersion() {
    const code = Number(moduleInfo && moduleInfo.companion_version_code);
    if (Number.isInteger(code) && code > 0) return deviceProfileText('deviceProfileCompanionBuildValue', 'Build {code}').replace('{code}', code);
    return deviceProfileText('deviceProfileUnknownValue', 'Unknown');
}

function deviceProfileCapabilityDefinitions() {
    return [
        ['direct_upload', 'deviceProfileCapabilityDirect', 'Direct apply'],
        ['history', 'deviceProfileCapabilityHistory', 'History'],
        ['pull', 'deviceProfileCapabilityPull', 'Pull'],
        ['test_animation', 'deviceProfileCapabilityPreview', 'Phone preview'],
        ['device_intelligence', 'deviceProfileCapabilityIntelligence', 'Device probes']
    ];
}

function deviceProfileRenderCapabilities() {
    const root = document.getElementById('device-profile-capabilities');
    if (!root) return;
    root.replaceChildren();
    for (const [feature, key, fallback] of deviceProfileCapabilityDefinitions()) {
        const chip = document.createElement('span');
        const available = isConnectedMode && typeof hasModuleFeature === 'function' && hasModuleFeature(feature);
        chip.className = 'device-profile-capability';
        chip.dataset.state = available ? 'available' : 'unavailable';
        chip.textContent = deviceProfileText(key, fallback);
        chip.title = available
            ? deviceProfileText('deviceProfileAvailable', 'Available')
            : deviceProfileText('deviceProfileUnavailable', 'Unavailable');
        root.appendChild(chip);
    }
}

function deviceProfileSetExpanded(expanded) {
    deviceProfileRuntime.expanded = !!expanded;
    const root = document.getElementById('device-profile');
    const body = document.getElementById('device-profile-body');
    const toggle = document.getElementById('device-profile-toggle');
    if (root) root.classList.toggle('is-collapsed', !deviceProfileRuntime.expanded);
    if (body) body.hidden = !deviceProfileRuntime.expanded;
    if (toggle) toggle.setAttribute('aria-expanded', deviceProfileRuntime.expanded ? 'true' : 'false');
    syncDeviceProfileDisclosureText();
}

function syncDeviceProfileDisclosureText() {
    const toggle = document.getElementById('device-profile-toggle');
    const label = document.getElementById('device-profile-toggle-label');
    const expanded = deviceProfileRuntime.expanded;
    const text = expanded
        ? deviceProfileText('deviceProfileToggleHide', 'Hide details')
        : deviceProfileText('deviceProfileToggleShow', 'Show details');
    const aria = expanded
        ? deviceProfileText('deviceProfileToggleAriaHide', 'Hide connected device profile')
        : deviceProfileText('deviceProfileToggleAriaShow', 'Show connected device profile');
    if (label) label.textContent = text;
    if (toggle) toggle.setAttribute('aria-label', aria);
}

function deviceProfileUpdateMatchStatus(resolution) {
    const status = document.getElementById('device-profile-output-status');
    const button = document.getElementById('device-profile-match-output');
    const saveButton = document.getElementById('device-profile-save');
    const current = deviceProfileCurrentOutput();
    const comparable = !!(current && resolution);
    const matches = comparable && Number(current.width) === resolution.width && Number(current.height) === resolution.height;

    if (button) {
        button.disabled = !currentProject || !resolution || matches;
        button.title = !currentProject
            ? deviceProfileText('deviceProfileOutputNoProject', 'Load a project to compare its output with this screen.')
            : !resolution
                ? deviceProfileText('deviceProfileOutputUnknown', 'The connected device did not report a usable screen resolution.')
                : matches
                    ? deviceProfileText('deviceProfileOutputMatch', 'Output already matches the connected screen.')
                    : deviceProfileText('deviceProfileMatchOutput', 'Match output');
    }
    if (saveButton) {
        saveButton.disabled = !currentProject || !resolution;
        saveButton.title = !currentProject
            ? deviceProfileText('deviceProfileOutputNoProject', 'Load a project to compare its output with this screen.')
            : !resolution
                ? deviceProfileText('deviceProfileOutputUnknown', 'The connected device did not report a usable screen resolution.')
                : deviceProfileText('deviceProfileSaveProfile', 'Save as profile');
    }

    if (!status) return;
    if (!isConnectedMode) {
        status.textContent = deviceProfileText('deviceProfileOutputOffline', 'Connect a phone to compare output resolution.');
        status.dataset.state = 'offline';
    } else if (!resolution) {
        status.textContent = deviceProfileText('deviceProfileOutputUnknown', 'The connected device did not report a usable screen resolution.');
        status.dataset.state = 'unknown';
    } else if (!current) {
        status.textContent = deviceProfileText('deviceProfileOutputNoProject', 'Load a project to compare its output with this screen.');
        status.dataset.state = 'unknown';
    } else if (matches) {
        status.textContent = deviceProfileText('deviceProfileOutputMatch', 'Output already matches the connected screen.');
        status.dataset.state = 'match';
    } else {
        status.textContent = deviceProfileText('deviceProfileOutputMismatch', 'Current output: {resolution}')
            .replace('{resolution}', `${current.width} × ${current.height}`);
        status.dataset.state = 'mismatch';
    }
}

function syncDeviceProfileText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = deviceProfileText(key, fallback);
    };
    set('device-profile-kicker', 'deviceProfileKicker', 'CONNECTED DEVICE PROFILE');
    set('device-profile-desc-online', 'deviceProfileOnlineDesc', 'Live connection details. Nothing here is saved to the project automatically.');
    set('device-profile-live-badge', 'deviceProfileLiveBadge', 'LIVE');
    set('device-profile-resolution-label', 'deviceProfileResolutionLabel', 'Resolution');
    set('device-profile-api-label', 'deviceProfileApiLabel', 'API');
    set('device-profile-module-label', 'deviceProfileModuleLabel', 'Module');
    set('device-profile-companion-label', 'deviceProfileCompanionLabel', 'Companion');
    set('device-profile-animation-label', 'deviceProfileAnimationLabel', 'Custom animation');
    set('device-profile-capabilities-label', 'deviceProfileCapabilitiesLabel', 'AVAILABLE FEATURES');
    set('device-profile-match-output', 'deviceProfileMatchOutput', 'Match output');
    set('device-profile-save', 'deviceTargetSaveProfile', 'Save device profile');
    syncDeviceProfileDisclosureText();
}

function syncDeviceProfileUi() {
    syncDeviceProfileText();
    const root = document.getElementById('device-profile');
    const online = document.getElementById('device-profile-online');
    if (!root || !online) return;

    const connected = !!isConnectedMode;
    root.dataset.state = connected ? 'connected' : 'offline';

    const resolution = deviceProfileLiveResolution();
    const model = deviceProfileModelLabel();
    const title = document.getElementById('device-profile-model');
    const compact = document.getElementById('device-profile-compact-summary');
    const resolutionValue = document.getElementById('device-profile-resolution');
    const apiValue = document.getElementById('device-profile-api');
    const moduleValue = document.getElementById('device-profile-module');
    const companionValue = document.getElementById('device-profile-companion');
    const animationValue = document.getElementById('device-profile-animation');

    if (title) title.textContent = model;
    if (compact) compact.textContent = connected
        ? (resolution ? `${model} · ${resolution.label}` : model)
        : deviceProfileText('deviceProfileOfflineTitle', 'No device connected');
    if (resolutionValue) resolutionValue.textContent = resolution ? resolution.label : deviceProfileText('deviceProfileUnknownValue', 'Unknown');
    if (apiValue) apiValue.textContent = deviceProfileApiVersion();
    if (moduleValue) moduleValue.textContent = deviceProfileModuleVersion();
    if (companionValue) companionValue.textContent = deviceProfileCompanionVersion();
    if (animationValue) {
        animationValue.textContent = window.hasCustomAnimApplied
            ? deviceProfileText('deviceProfileAnimationActive', 'Applied')
            : deviceProfileText('deviceProfileAnimationNone', 'Not detected');
        animationValue.dataset.state = window.hasCustomAnimApplied ? 'active' : 'none';
    }

    deviceProfileUpdateMatchStatus(resolution);
    deviceProfileRenderCapabilities();
    syncDeviceTargetUi();
}

function deviceProfileMatchOutput() {
    const resolution = deviceProfileResolution();
    const current = deviceProfileCurrentOutput();
    if (!resolution || !current || !currentProject || typeof outputPresetApplyResolvedOptions !== 'function') return;
    if (Number(current.width) === resolution.width && Number(current.height) === resolution.height) return;
    outputPresetApplyResolvedOptions({ width: resolution.width, height: resolution.height }, {
        reason: 'device-profile',
        changeKey: 'device-profile:match-output'
    });
    syncDeviceProfileUi();
    if (typeof showToast === 'function') showToast(deviceProfileText('deviceProfileMatchedToast', 'Output matched to {resolution}.').replace('{resolution}', resolution.label), 'success', 2500);
}


function deviceProfileSaveAsProfile() {
    deviceProfileSaveLiveTarget();
}

function bindDeviceProfile() {
    if (deviceProfileRuntime.initialized) return;
    deviceProfileRuntime.initialized = true;
    deviceProfileLoadSaved();
    document.getElementById('device-profile-toggle')?.addEventListener('click', () => deviceProfileSetExpanded(!deviceProfileRuntime.expanded));
    document.getElementById('device-profile-match-output')?.addEventListener('click', deviceProfileMatchOutput);
    document.getElementById('device-profile-save')?.addEventListener('click', deviceProfileSaveAsProfile);
    document.getElementById('device-target-select')?.addEventListener('change', event => deviceProfileSelectTarget(event.target.value));
    document.getElementById('device-target-save')?.addEventListener('click', deviceProfileSaveLiveTarget);
    document.getElementById('device-target-delete')?.addEventListener('click', deviceProfileDeleteActiveSaved);
    window.addEventListener('bas:projectchange', syncDeviceProfileUi);
    window.addEventListener('bas:deviceintelligence', syncDeviceProfileUi);
    const config = document.getElementById('configuracoes');
    if (config) {
        config.addEventListener('input', syncDeviceProfileUi);
        config.addEventListener('change', syncDeviceProfileUi);
    }
    deviceProfileSetExpanded(false);
    syncDeviceProfileUi();
}

window.BASDeviceProfile = Object.freeze({
    version: BAS_DEVICE_PROFILE_VERSION,
    sync: syncDeviceProfileUi,
    setExpanded: deviceProfileSetExpanded,
    matchOutput: deviceProfileMatchOutput,
    saveAsProfile: deviceProfileSaveAsProfile,
    getResolution: deviceProfileResolution,
    getLiveResolution: deviceProfileLiveResolution,
    getTarget: deviceProfileTarget,
    getTargetIntelligence: deviceProfileTargetIntelligence,
    getSavedProfiles: () => deviceProfileRuntime.saved.map(deviceProfileClone),
    saveLiveProfile: deviceProfileSaveLiveTarget,
    selectTarget: deviceProfileSelectTarget
});
window.syncDeviceProfileUi = syncDeviceProfileUi;
window.syncDeviceProfileText = syncDeviceProfileText;
window.addEventListener('DOMContentLoaded', bindDeviceProfile);
