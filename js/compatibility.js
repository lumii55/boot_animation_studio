const buildCompatibilityRuntime = {
    initialized: false,
    timer: 0,
    lastReport: null
};

function compatibilityText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function compatibilityItem(level, code, message, action = '', detail = '') {
    return { level, code, message, action, detail };
}

function compatibilityRoleLabel(role) {
    if (role === 'intro') return compatibilityText('contextAudioIntro', 'Intro');
    if (role === 'loop') return compatibilityText('contextAudioLoop', 'Loop');
    return compatibilityText('contextAudioFinal', 'Outro');
}

function compatibilityDeviceResolution() {
    if (!isConnectedMode) return null;
    const value = String(document.getElementById('opt-auto')?.value || '');
    const match = value.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height } : null;
}

function compatibilityAudioFindings() {
    const items = [];
    ['intro', 'loop', 'final'].forEach(role => {
        const card = document.querySelector(`[data-audio-export-card="${role}"]`);
        if (!card || card.hidden) return;
        const state = card.dataset.state || 'idle';
        if (!['warning', 'danger'].includes(state)) return;
        const message = state === 'danger'
            ? compatibilityText('compatAudioDanger', '{role} audio has a critical compatibility warning.').replace('{role}', compatibilityRoleLabel(role))
            : compatibilityText('compatAudioWarning', '{role} audio needs review before export.').replace('{role}', compatibilityRoleLabel(role));
        items.push(compatibilityItem('warning', `audio-${role}`, message, `audio:${role}`));
    });
    return items;
}

function analyzeBuildCompatibility() {
    const items = [];
    const hasProject = !!(currentProject && currentProject.sourceBlob instanceof Blob);
    if (!hasProject) {
        items.push(compatibilityItem('unknown', 'source-pending', compatibilityText('compatSourcePending', 'Add a source to begin compatibility checks.')));
        return { state: 'pending', items, errors: 0, warnings: 0, passes: 0, unknown: 1, blocking: false };
    }

    if (typeof isAdvancedPartsActive === 'function' && isAdvancedPartsActive()) {
        const validation = typeof validateAdvancedParts === 'function' ? validateAdvancedParts() : { valid: false, message: compatibilityText('compatAdvancedInvalid', 'Advanced Parts need review.') };
        if (!validation.valid) {
            const count = Array.isArray(validation.issues) ? validation.issues.length : 1;
            const message = count > 1
                ? compatibilityText('compatAdvancedInvalidMany', '{message} {count} issues found.').replace('{message}', validation.message || '').replace('{count}', String(count))
                : validation.message || compatibilityText('compatAdvancedInvalid', 'Advanced Parts need review.');
            items.push(compatibilityItem('error', 'advanced-invalid', message, 'parts'));
        } else {
            items.push(compatibilityItem('pass', 'advanced-valid', compatibilityText('compatAdvancedReady', 'Advanced Parts structure is valid.')));
        }
    } else {
        const values = ['m0', 'm1', 'm2', 'm3'].map(key => Number(marcadores[key]));
        const complete = ['m0', 'm1', 'm2', 'm3'].every(key => marcadores[key] !== null && marcadores[key] !== undefined && Number.isFinite(Number(marcadores[key])));
        if (!complete) {
            items.push(compatibilityItem('error', 'markers-missing', compatibilityText('compatMarkersMissing', 'Mark all four section boundaries before building.'), 'timeline'));
        } else if (!(values[0] <= values[1] && values[1] <= values[2] && values[2] <= values[3])) {
            items.push(compatibilityItem('error', 'markers-order', compatibilityText('compatMarkersOrder', 'Section markers are not in chronological order.'), 'timeline'));
        } else {
            items.push(compatibilityItem('pass', 'markers-valid', compatibilityText('compatStructureReady', 'Intro, Loop and Outro boundaries are valid.')));
            const emptyRoles = [];
            if (values[1] - values[0] <= 0.0005) emptyRoles.push(compatibilityRoleLabel('intro'));
            if (values[2] - values[1] <= 0.0005) emptyRoles.push(compatibilityRoleLabel('loop'));
            if (values[3] - values[2] <= 0.0005) emptyRoles.push(compatibilityRoleLabel('final'));
            if (emptyRoles.length) {
                items.push(compatibilityItem('warning', 'empty-sections', compatibilityText('compatEmptySections', 'Zero-duration sections: {sections}.').replace('{sections}', emptyRoles.join(', ')), 'timeline'));
            }
        }
    }

    if (window.BASComposition && typeof BASComposition.validate === 'function') {
        const validation = BASComposition.validate();
        if (!validation.valid) items.push(compatibilityItem('error', 'composition-invalid', validation.message || compatibilityText('compatCompositionInvalid', 'Composition needs review.'), 'composition'));
        else if (typeof BASComposition.hasLayers === 'function' && BASComposition.hasLayers()) items.push(compatibilityItem('pass', 'composition-valid', compatibilityText('compatCompositionReady', 'Composition layers are valid.')));
    }

    const width = Number(document.getElementById('input-largura')?.value);
    const height = Number(document.getElementById('input-altura')?.value);
    const fps = Number(document.getElementById('input-fps')?.value);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        items.push(compatibilityItem('error', 'dimensions-invalid', compatibilityText('compatDimensionsInvalid', 'Output width and height must be positive whole numbers.'), 'output'));
    } else {
        items.push(compatibilityItem('pass', 'dimensions-valid', compatibilityText('compatOutputReady', 'Output dimensions and frame format are supported.')));
        if (width % 2 || height % 2) items.push(compatibilityItem('warning', 'dimensions-odd', compatibilityText('compatDimensionsOdd', 'Even output dimensions are safer for Android decoders.'), 'output'));
    }
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) items.push(compatibilityItem('error', 'fps-invalid', compatibilityText('compatFpsInvalid', 'Frame rate must be a whole number from 1 to 60 FPS.'), 'output'));

    const device = compatibilityDeviceResolution();
    if (device && width > 0 && height > 0) {
        if (width === device.width && height === device.height) {
            items.push(compatibilityItem('pass', 'device-resolution-match', compatibilityText('compatDeviceMatch', 'Output resolution matches the connected phone.')));
        } else {
            items.push(compatibilityItem('warning', 'device-resolution-mismatch', compatibilityText('compatDeviceMismatch', 'Output is {output}; the connected phone reports {device}.').replace('{output}', `${width} × ${height}`).replace('{device}', `${device.width} × ${device.height}`), 'output'));
        }
    }

    let estimate = null;
    try {
        if (typeof estimateExportPerformance === 'function' && typeof getPerformanceOptions === 'function') estimate = estimateExportPerformance(getPerformanceOptions());
    } catch (error) {}
    if (estimate) {
        if (estimate.bootLevel === 'large') items.push(compatibilityItem('warning', 'boot-large', compatibilityText('compatBootLarge', 'Estimated bootanimation size is above 25 MB.'), 'performance'));
        else if (estimate.bootLevel === 'caution') items.push(compatibilityItem('warning', 'boot-caution', compatibilityText('compatBootCaution', 'Estimated bootanimation size is above 20 MB.'), 'performance'));
        if (estimate.level === 'heavy') items.push(compatibilityItem('warning', 'generation-heavy', compatibilityText('compatGenerationHeavy', 'This build may use substantial memory and take longer on a phone.'), 'performance'));
    }

    const deliveryTarget = typeof getBuildDeliveryTarget === 'function' ? getBuildDeliveryTarget() : 'download';
    if (deliveryTarget === 'phone') {
        if (typeof hasModuleFeature === 'function' && hasModuleFeature('direct_upload')) {
            items.push(compatibilityItem('pass', 'direct-upload-ready', compatibilityText('compatDirectReady', 'The connected module reports direct upload support.')));
            if (estimate && estimate.bootBytes > 25 * 1024 * 1024) {
                const level = estimate.exactBootSize ? 'error' : 'warning';
                const message = estimate.exactBootSize
                    ? compatibilityText('compatDirectTooLargeExact', 'The file exceeds the 25 MB direct-upload limit for this module API.')
                    : compatibilityText('compatDirectTooLargeEstimate', 'The estimated file may exceed the 25 MB direct-upload limit.');
                items.push(compatibilityItem(level, 'direct-upload-large', message, 'performance'));
            }
        } else {
            items.push(compatibilityItem('error', 'direct-upload-unavailable', compatibilityText('compatDirectUnavailable', 'The connected module does not report direct upload support.'), 'delivery'));
        }
    }

    items.push(...compatibilityAudioFindings());
    items.push(compatibilityItem('unknown', 'device-runtime-unknown', compatibilityText('compatDeviceUnknown', 'ROM playback limits and boot-audio support cannot be confirmed by the current API.')));

    const errors = items.filter(item => item.level === 'error').length;
    const warnings = items.filter(item => item.level === 'warning').length;
    const passes = items.filter(item => item.level === 'pass').length;
    const unknown = items.filter(item => item.level === 'unknown').length;
    const state = errors ? 'blocked' : warnings ? 'warning' : 'ready';
    return { state, items, errors, warnings, passes, unknown, blocking: errors > 0, estimate };
}

function compatibilityStatusLabel(state) {
    const labels = {
        pending: compatibilityText('compatStatusPending', 'Waiting'),
        ready: compatibilityText('compatStatusReady', 'Ready'),
        warning: compatibilityText('compatStatusWarning', 'Review'),
        blocked: compatibilityText('compatStatusBlocked', 'Blocked')
    };
    return labels[state] || labels.pending;
}

function renderBuildCompatibility() {
    const root = document.getElementById('build-compatibility');
    const list = document.getElementById('build-compatibility-list');
    if (!root || !list) return null;
    const report = analyzeBuildCompatibility();
    buildCompatibilityRuntime.lastReport = report;
    root.dataset.state = report.state;
    const status = document.getElementById('build-compatibility-status');
    const errors = document.getElementById('build-compatibility-errors');
    const warnings = document.getElementById('build-compatibility-warnings');
    const passes = document.getElementById('build-compatibility-passes');
    if (status) status.textContent = compatibilityStatusLabel(report.state);
    if (errors) errors.textContent = String(report.errors);
    if (warnings) warnings.textContent = String(report.warnings);
    if (passes) passes.textContent = String(report.passes);
    list.replaceChildren(...report.items.map(item => {
        const row = document.createElement('div');
        row.className = 'compatibility-item';
        row.dataset.level = item.level;
        row.dataset.code = item.code;
        const mark = document.createElement('span');
        mark.className = 'compatibility-item-mark';
        mark.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('div');
        copy.className = 'compatibility-item-copy';
        const message = document.createElement('strong');
        message.textContent = item.message;
        copy.appendChild(message);
        row.append(mark, copy);
        if (item.action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.compatibilityAction = item.action;
            button.textContent = compatibilityText('compatReviewAction', 'Review');
            row.appendChild(button);
        }
        return row;
    }));
    return report;
}

function scheduleBuildCompatibility(delay = 90) {
    clearTimeout(buildCompatibilityRuntime.timer);
    buildCompatibilityRuntime.timer = setTimeout(() => {
        buildCompatibilityRuntime.timer = 0;
        renderBuildCompatibility();
    }, delay);
}

function openCompatibilityTarget(action) {
    if (!action) return;
    if (action === 'timeline') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit');
        setTimeout(() => document.getElementById('timeline-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        return;
    }
    if (action === 'parts') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit');
        if (typeof setEditTool === 'function') setEditTool('parts', { scroll: true });
        setTimeout(() => {
            if (typeof focusAdvancedValidationIssue === 'function') focusAdvancedValidationIssue();
        }, 100);
        return;
    }
    if (action === 'composition') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit');
        if (typeof setEditTool === 'function') setEditTool('composition', { scroll: true });
        return;
    }
    if (action.startsWith('audio:')) {
        const role = action.split(':')[1];
        if (typeof setWorkspaceView === 'function') setWorkspaceView('edit');
        if (typeof setEditTool === 'function') setEditTool('audio', { scroll: true });
        if (typeof setAudioRole === 'function') setAudioRole(role);
        return;
    }
    if (action === 'output' || action === 'performance') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('settings');
        if (typeof setOutputTool === 'function') setOutputTool(action === 'performance' ? 'performance' : 'basics', { scroll: true });
        return;
    }
    if (action === 'delivery') {
        if (typeof setWorkspaceView === 'function') setWorkspaceView('export');
        setTimeout(() => document.getElementById('delivery-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
}

function syncBuildCompatibilityText() {
    const kicker = document.getElementById('build-compatibility-kicker');
    const title = document.getElementById('build-compatibility-title');
    const desc = document.getElementById('build-compatibility-desc');
    const errorLabel = document.getElementById('build-compatibility-errors-label');
    const warningLabel = document.getElementById('build-compatibility-warnings-label');
    const passLabel = document.getElementById('build-compatibility-passes-label');
    if (kicker) kicker.textContent = compatibilityText('compatKicker', 'COMPATIBILITY CENTER');
    if (title) title.textContent = compatibilityText('compatTitle', 'Project readiness');
    if (desc) desc.textContent = compatibilityText('compatDesc', 'Automatic checks for structure, output, audio and delivery.');
    if (errorLabel) errorLabel.textContent = compatibilityText('compatErrorsLabel', 'Errors');
    if (warningLabel) warningLabel.textContent = compatibilityText('compatWarningsLabel', 'Warnings');
    if (passLabel) passLabel.textContent = compatibilityText('compatPassesLabel', 'Passed');
    renderBuildCompatibility();
}

function bindBuildCompatibility() {
    if (buildCompatibilityRuntime.initialized) return;
    buildCompatibilityRuntime.initialized = true;
    document.getElementById('build-compatibility-list')?.addEventListener('click', event => {
        const button = event.target.closest('[data-compatibility-action]');
        if (button) openCompatibilityTarget(button.dataset.compatibilityAction);
    });
    document.addEventListener('input', () => scheduleBuildCompatibility());
    document.addEventListener('change', () => scheduleBuildCompatibility());
    window.addEventListener('bas:projectchange', () => scheduleBuildCompatibility());
    const audioHost = document.getElementById('output-panel-audio');
    if (audioHost) new MutationObserver(() => scheduleBuildCompatibility(30)).observe(audioHost, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'hidden'] });
    const connectionState = document.getElementById('connected-state');
    const deliveryPanel = document.getElementById('delivery-panel');
    const connectionObserver = new MutationObserver(() => scheduleBuildCompatibility(30));
    if (connectionState) connectionObserver.observe(connectionState, { attributes: true, attributeFilter: ['style', 'class'] });
    if (deliveryPanel) connectionObserver.observe(deliveryPanel, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed'] });
    syncBuildCompatibilityText();
}

window.BASCompatibility = Object.freeze({
    analyze: analyzeBuildCompatibility,
    render: renderBuildCompatibility,
    schedule: scheduleBuildCompatibility,
    open: openCompatibilityTarget,
    getLastReport: () => buildCompatibilityRuntime.lastReport
});
window.syncBuildCompatibilityText = syncBuildCompatibilityText;
window.addEventListener('DOMContentLoaded', bindBuildCompatibility);
