const BAS_DEVICE_PROFILE_VERSION = 3;

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

function deviceProfileResolution() {
    if (!isConnectedMode) return null;
    if (typeof compatibilityGetDeviceResolution === 'function') return compatibilityGetDeviceResolution();
    const value = String(window.connectedPhoneResolution || '').trim();
    const match = value.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height, label: `${width} × ${height}` } : null;
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
    const model = String(window.connectedPhoneModel || '').trim() || deviceProfileText('deviceProfileGenericPhone', 'Connected phone');
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
    window.addEventListener('bas:projectchange', syncDeviceProfileUi);
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
    getResolution: deviceProfileResolution
});
window.syncDeviceProfileUi = syncDeviceProfileUi;
window.syncDeviceProfileText = syncDeviceProfileText;
window.addEventListener('DOMContentLoaded', bindDeviceProfile);
