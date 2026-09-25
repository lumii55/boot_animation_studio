const BAS_DEVICE_PROFILE_VERSION = 4;

const deviceProfileRuntime = {
    initialized: false,
    expanded: false
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

function deviceProfileResolution() {
    if (!isConnectedMode) return null;
    const intelligenceResolution = deviceProfileParseResolution(deviceProfileIntelligence()?.system?.resolution);
    if (intelligenceResolution) return intelligenceResolution;
    if (typeof compatibilityGetDeviceResolution === 'function') return compatibilityGetDeviceResolution();
    return deviceProfileParseResolution(window.connectedPhoneResolution);
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
    set('device-profile-save', 'deviceProfileSaveProfile', 'Save as profile');
    set('device-profile-build-guidance-label', 'adaptiveBuildProfileLabel', 'ADAPTIVE BUILD');
    set('device-profile-build-guidance-title', 'adaptiveBuildProfileTitle', 'Device-aware output guidance');
    set('device-profile-analyze', 'adaptiveBuildAnalyze', 'Open Smart Optimize');
    syncDeviceProfileDisclosureText();
}

function syncDeviceProfileUi() {
    syncDeviceProfileText();
    const root = document.getElementById('device-profile');
    const online = document.getElementById('device-profile-online');
    if (!root || !online) return;

    const connected = !!isConnectedMode;
    root.dataset.state = connected ? 'connected' : 'offline';

    const resolution = deviceProfileResolution();
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
    syncAdaptiveBuildUi();
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

function deviceProfileAdaptiveData() {
    const resolution = deviceProfileResolution();
    const intelligence = deviceProfileIntelligence();
    const boot = intelligence?.boot || {};
    const audio = boot.audio || {};
    const current = deviceProfileCurrentOutput();
    const recommendedBytes = window.BASSmartOptimizer && Number(BASSmartOptimizer.recommendedBytes) > 0
        ? Number(BASSmartOptimizer.recommendedBytes)
        : 20 * 1024 * 1024;
    return {
        connected: !!isConnectedMode,
        model: deviceProfileModelLabel(),
        resolution,
        current,
        recommendedBytes,
        targetPath: String(boot.primary_path || ''),
        targetConfidence: String(boot.primary_path_confidence || 'unknown'),
        stockFormat: String(boot.stock_archive?.format || 'unknown'),
        audioState: String(audio.state || 'unknown')
    };
}

function deviceProfileFormatBytes(bytes) {
    if (typeof formatByteEstimate === 'function') return formatByteEstimate(bytes);
    return `${Math.round(Number(bytes || 0) / (1024 * 1024))} MB`;
}

function deviceProfileAudioLabel(state) {
    return state === 'observed'
        ? deviceProfileText('adaptiveBuildAudioObserved', 'Observed')
        : deviceProfileText('adaptiveBuildAudioUnknown', 'Unknown');
}

function syncAdaptiveBuildUi() {
    const data = deviceProfileAdaptiveData();
    const card = document.getElementById('adaptive-build-card');
    if (card) card.hidden = !data.connected;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setText('adaptive-build-kicker', deviceProfileText('adaptiveBuildKicker', 'CONNECTED DEVICE'));
    setText('adaptive-build-title', deviceProfileText('adaptiveBuildTitle', 'Adaptive build guidance'));
    setText('adaptive-build-desc', deviceProfileText('adaptiveBuildDesc', 'Use live device facts to shape output without changing the project automatically.'));
    setText('adaptive-build-live', deviceProfileText('deviceProfileLiveBadge', 'LIVE'));
    setText('adaptive-build-device-label', deviceProfileText('adaptiveBuildDeviceLabel', 'Device'));
    setText('adaptive-build-resolution-label', deviceProfileText('adaptiveBuildResolutionLabel', 'Native output'));
    setText('adaptive-build-target-label', deviceProfileText('adaptiveBuildTargetLabel', 'BAS size goal'));
    setText('adaptive-build-audio-label', deviceProfileText('adaptiveBuildAudioLabel', 'Boot audio'));
    setText('adaptive-build-device', data.model);
    setText('adaptive-build-resolution', data.resolution ? data.resolution.label : deviceProfileText('deviceProfileUnknownValue', 'Unknown'));
    setText('adaptive-build-target', `≤ ${deviceProfileFormatBytes(data.recommendedBytes)}`);
    setText('adaptive-build-audio', deviceProfileAudioLabel(data.audioState));
    setText('adaptive-build-match', deviceProfileText('adaptiveBuildUseResolution', 'Use device resolution'));
    setText('adaptive-build-optimize', deviceProfileText('adaptiveBuildAnalyze', 'Analyze for device'));

    const matches = !!(data.current && data.resolution && Number(data.current.width) === data.resolution.width && Number(data.current.height) === data.resolution.height);
    const note = !currentProject
        ? deviceProfileText('adaptiveBuildNoProject', 'Load a project to generate device-aware output guidance.')
        : !data.resolution
            ? deviceProfileText('adaptiveBuildResolutionUnknown', 'The connected device did not report a usable native resolution.')
            : matches
                ? deviceProfileText('adaptiveBuildMatches', 'Current output already matches the connected display. Smart Optimize can still reduce size when needed.')
                : deviceProfileText('adaptiveBuildMismatch', 'Current output is {current}; the connected display is {device}.')
                    .replace('{current}', data.current ? `${data.current.width} × ${data.current.height}` : '—')
                    .replace('{device}', data.resolution.label);
    setText('adaptive-build-note', note);

    const profileDesc = document.getElementById('device-profile-build-guidance-desc');
    if (profileDesc) {
        profileDesc.textContent = !currentProject
            ? deviceProfileText('adaptiveBuildNoProject', 'Load a project to generate device-aware output guidance.')
            : data.resolution
                ? deviceProfileText('adaptiveBuildProfileSummary', 'Recommended output: {resolution} · size goal ≤ {size}')
                    .replace('{resolution}', data.resolution.label)
                    .replace('{size}', deviceProfileFormatBytes(data.recommendedBytes))
                : deviceProfileText('adaptiveBuildResolutionUnknown', 'The connected device did not report a usable native resolution.');
    }

    const match = document.getElementById('adaptive-build-match');
    if (match) match.disabled = !currentProject || !data.resolution || matches;
    const optimize = document.getElementById('adaptive-build-optimize');
    if (optimize) optimize.disabled = !currentProject;
    const profileAnalyze = document.getElementById('device-profile-analyze');
    if (profileAnalyze) profileAnalyze.disabled = !currentProject;
}

function deviceProfileOpenSmartOptimize() {
    if (!currentProject) return;
    if (typeof setWorkspaceView === 'function') setWorkspaceView('settings', { scroll: false });
    if (typeof setOutputTool === 'function') setOutputTool('performance', { scroll: false });
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('output-panel-performance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.BASSmartOptimizer && typeof BASSmartOptimizer.run === 'function') BASSmartOptimizer.run({ deviceAware: true });
    }));
}

function deviceProfileNavigateToProfileEditor() {
    if (typeof setWorkspaceView === 'function') setWorkspaceView('settings', { scroll: false });
    if (typeof setOutputTool === 'function') setOutputTool('basics', { scroll: false });
    if (window.BASOutputPresets && typeof BASOutputPresets.setExpanded === 'function') BASOutputPresets.setExpanded(true);
}

function deviceProfileSaveAsProfile() {
    const resolution = deviceProfileResolution();
    const current = deviceProfileCurrentOutput();
    if (!resolution || !current || !currentProject || !window.BASCustomProfiles || typeof BASCustomProfiles.openEditor !== 'function') return;
    deviceProfileNavigateToProfileEditor();
    const model = String(window.connectedPhoneModel || '').trim();
    BASCustomProfiles.openEditor({
        suggestedName: model || deviceProfileText('deviceProfileGenericPhone', 'Connected phone'),
        resolutionPolicy: 'exact',
        outputOverrides: { width: resolution.width, height: resolution.height }
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('custom-profile-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
}

function bindDeviceProfile() {
    if (deviceProfileRuntime.initialized) return;
    deviceProfileRuntime.initialized = true;
    document.getElementById('device-profile-toggle')?.addEventListener('click', () => deviceProfileSetExpanded(!deviceProfileRuntime.expanded));
    document.getElementById('device-profile-match-output')?.addEventListener('click', deviceProfileMatchOutput);
    document.getElementById('device-profile-save')?.addEventListener('click', deviceProfileSaveAsProfile);
    document.getElementById('device-profile-analyze')?.addEventListener('click', deviceProfileOpenSmartOptimize);
    document.getElementById('adaptive-build-match')?.addEventListener('click', deviceProfileMatchOutput);
    document.getElementById('adaptive-build-optimize')?.addEventListener('click', deviceProfileOpenSmartOptimize);
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
    getAdaptive: deviceProfileAdaptiveData,
    openSmartOptimize: deviceProfileOpenSmartOptimize
});
window.syncDeviceProfileUi = syncDeviceProfileUi;
window.syncDeviceProfileText = syncDeviceProfileText;
window.addEventListener('DOMContentLoaded', bindDeviceProfile);
