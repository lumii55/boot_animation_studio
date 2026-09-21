const moduleWorkspaceUi = {
    root: null,
    host: null,
    panel: null,
    anchor: null,
    currentTab: 'overview',
    entryContext: 'editor',
    open: false,
    historyObserver: null,
    profileWasExpanded: false
};

function moduleWorkspaceText(key, fallback) {
    try {
        if (typeof traducoes !== 'undefined' && typeof idiomaAtual !== 'undefined' && traducoes[idiomaAtual] && traducoes[idiomaAtual][key]) {
            return traducoes[idiomaAtual][key];
        }
    } catch (error) {}
    return fallback;
}

function moduleWorkspaceSections() {
    return {
        overview: [
            document.getElementById('p11-device-actions-label'),
            document.getElementById('device-actions'),
            document.querySelector('#connected-state .device-secondary-actions')
        ].filter(Boolean),
        history: [document.getElementById('history-wrapper')].filter(Boolean),
        device: [document.getElementById('device-profile')].filter(Boolean)
    };
}

function moduleWorkspaceRestoreSections() {
    const sections = moduleWorkspaceSections();
    Object.values(sections).flat().forEach(element => {
        element.hidden = false;
    });
}

function syncModuleWorkspaceTabAvailability() {
    const historyTab = document.getElementById('module-workspace-tab-history');
    const historyAvailable = typeof hasModuleFeature === 'function' && hasModuleFeature('history');
    if (historyTab) historyTab.hidden = !historyAvailable;
    if (!historyAvailable && moduleWorkspaceUi.currentTab === 'history') {
        setModuleWorkspaceTab('overview', { focus: false });
    }
}

function setModuleWorkspaceTab(tab, options = {}) {
    if (!['overview', 'history', 'device'].includes(tab)) return;
    if (tab === 'history' && typeof hasModuleFeature === 'function' && !hasModuleFeature('history')) tab = 'overview';
    moduleWorkspaceUi.currentTab = tab;
    if (tab === 'device' && window.BASDeviceProfile?.setExpanded) window.BASDeviceProfile.setExpanded(true);
    if (tab === 'history' && typeof loadHistory === 'function' && typeof hasModuleFeature === 'function' && hasModuleFeature('history')) loadHistory();
    const sections = moduleWorkspaceSections();
    Object.entries(sections).forEach(([name, elements]) => {
        elements.forEach(element => {
            element.hidden = name !== tab;
        });
    });
    document.querySelectorAll('[data-module-workspace-tab]').forEach(button => {
        const active = button.dataset.moduleWorkspaceTab === tab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
    });
    if (options.focus) document.querySelector(`[data-module-workspace-tab="${tab}"]`)?.focus();
}

function syncModuleWorkspaceText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = moduleWorkspaceText(key, fallback);
    };
    set('module-workspace-kicker', 'moduleWorkspaceKicker', 'MODULE WORKSPACE');
    set('module-workspace-title', 'moduleWorkspaceTitle', 'Module workspace');
    set('module-workspace-desc', 'moduleWorkspaceDesc', 'Manage the connected companion bridge in one focused workspace.');
    set('module-workspace-online', 'moduleWorkspaceOnline', 'MODULE ONLINE');
    set('module-workspace-tab-overview', 'moduleWorkspaceOverview', 'Overview');
    set('module-workspace-tab-history-label', 'moduleWorkspaceHistory', 'History');
    set('module-workspace-tab-device', 'moduleWorkspaceDevice', 'Device');
    set('module-workspace-open-label', 'moduleWorkspaceOpen', 'Open Module Workspace');
    set('module-workspace-open-studio-label', moduleWorkspaceUi.entryContext === 'launch' ? 'moduleWorkspaceOpenStudio' : 'moduleWorkspaceBackStudio', moduleWorkspaceUi.entryContext === 'launch' ? 'Open Studio' : 'Back to Studio');
    const tabs = document.querySelector('.module-workspace-tabs');
    if (tabs) tabs.setAttribute('aria-label', moduleWorkspaceText('moduleWorkspaceTabsAria', 'Module workspace navigation'));
    const openButton = document.getElementById('module-workspace-open');
    if (openButton) openButton.setAttribute('aria-label', moduleWorkspaceText('moduleWorkspaceOpenAria', 'Open the connected module workspace'));
}

function syncModuleWorkspaceUi() {
    if (!moduleWorkspaceUi.root) return;
    const model = String(window.connectedPhoneModel || '').trim() || moduleWorkspaceText('moduleWorkspaceGenericDevice', 'Connected phone');
    const modelElement = document.getElementById('module-workspace-device-name');
    const resolutionElement = document.getElementById('module-workspace-device-resolution');
    const historyCount = document.getElementById('module-workspace-history-count');
    const compactHistoryCount = document.getElementById('p11-history-count');
    if (modelElement) modelElement.textContent = model;
    if (resolutionElement) {
        const resolution = String(window.connectedPhoneResolution || '').trim();
        resolutionElement.textContent = resolution && resolution !== 'Unknown' ? resolution : moduleWorkspaceText('moduleWorkspaceResolutionUnknown', 'Resolution unavailable');
    }
    if (historyCount) historyCount.textContent = compactHistoryCount?.textContent || '0 / 5';
    syncModuleWorkspaceTabAvailability();
    syncModuleWorkspaceText();
}

function moduleWorkspaceMovePanelIntoWorkspace() {
    if (!moduleWorkspaceUi.panel || !moduleWorkspaceUi.host) return;
    if (moduleWorkspaceUi.panel.parentNode !== moduleWorkspaceUi.host) moduleWorkspaceUi.host.appendChild(moduleWorkspaceUi.panel);
    moduleWorkspaceUi.panel.classList.add('module-workspace-panel');
}

function moduleWorkspaceRestorePanel() {
    if (!moduleWorkspaceUi.panel || !moduleWorkspaceUi.anchor?.parentNode) return;
    moduleWorkspaceUi.anchor.parentNode.insertBefore(moduleWorkspaceUi.panel, moduleWorkspaceUi.anchor.nextSibling);
    moduleWorkspaceUi.panel.classList.remove('module-workspace-panel');
    moduleWorkspaceRestoreSections();
}

function openModuleWorkspace(options = {}) {
    if (!isConnectedMode) {
        requestModuleWorkspaceConnection();
        return;
    }
    if (!moduleWorkspaceUi.root) bindModuleWorkspace();
    if (!moduleWorkspaceUi.root) return;
    moduleWorkspaceUi.entryContext = options.origin === 'launch'
        ? 'launch'
        : options.origin === 'editor'
            ? 'editor'
            : (document.getElementById('initial-state')?.style.display !== 'none' ? 'launch' : 'editor');
    moduleWorkspaceUi.profileWasExpanded = document.getElementById('device-profile-body')?.hidden === false;
    moduleWorkspaceUi.open = true;
    document.getElementById('initial-state').style.display = 'none';
    document.getElementById('editor-section').style.display = 'none';
    moduleWorkspaceUi.root.hidden = false;
    moduleWorkspaceMovePanelIntoWorkspace();
    setModuleWorkspaceTab(options.tab || moduleWorkspaceUi.currentTab || 'overview', { focus: false });
    syncModuleWorkspaceUi();
    document.body.classList.add('module-workspace-open');
    requestAnimationFrame(() => moduleWorkspaceUi.root.scrollIntoView({ block: 'start', behavior: options.instant ? 'auto' : 'smooth' }));
}

function leaveModuleWorkspaceToStudio() {
    if (!moduleWorkspaceUi.root) return;
    moduleWorkspaceUi.open = false;
    moduleWorkspaceRestorePanel();
    if (window.BASDeviceProfile?.setExpanded) window.BASDeviceProfile.setExpanded(moduleWorkspaceUi.profileWasExpanded);
    moduleWorkspaceUi.root.hidden = true;
    document.body.classList.remove('module-workspace-open');
    document.getElementById('initial-state').style.display = 'none';
    document.getElementById('editor-section').style.display = 'flex';
    if (isConnectedMode) document.getElementById('connected-state').style.display = 'flex';
    moduleWorkspaceUi.entryContext = 'editor';
    syncModuleWorkspaceText();
    if (typeof syncWorkspaceUi === 'function') syncWorkspaceUi();
    requestAnimationFrame(() => document.getElementById('editor-section')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}

function requestModuleWorkspaceConnection() {
    if (isConnectedMode) {
        const launchVisible = document.getElementById('initial-state')?.style.display !== 'none';
        openModuleWorkspace({ origin: launchVisible ? 'launch' : 'editor' });
        return;
    }
    window.BASModuleWorkspaceConnectionRequested = true;
    if (typeof connectToPhone === 'function') connectToPhone();
}

function cancelModuleWorkspaceConnectionRequest() {
    window.BASModuleWorkspaceConnectionRequested = false;
}

function consumeModuleWorkspaceConnectionRequest() {
    const requested = window.BASModuleWorkspaceConnectionRequested === true;
    window.BASModuleWorkspaceConnectionRequested = false;
    return requested;
}

function handleModuleWorkspaceDisconnect() {
    const wasOpen = moduleWorkspaceUi.open;
    const returnToLaunch = wasOpen && moduleWorkspaceUi.entryContext === 'launch';
    if (moduleWorkspaceUi.root) {
        moduleWorkspaceUi.open = false;
        moduleWorkspaceRestorePanel();
        if (window.BASDeviceProfile?.setExpanded) window.BASDeviceProfile.setExpanded(moduleWorkspaceUi.profileWasExpanded);
        moduleWorkspaceUi.root.hidden = true;
    }
    document.body.classList.remove('module-workspace-open');
    if (returnToLaunch) {
        document.getElementById('initial-state').style.display = '';
        document.getElementById('editor-section').style.display = 'none';
    }
    return returnToLaunch;
}

function isModuleWorkspaceOpen() {
    return moduleWorkspaceUi.open;
}

function bindModuleWorkspace() {
    moduleWorkspaceUi.root = document.getElementById('module-workspace');
    moduleWorkspaceUi.host = document.getElementById('module-workspace-panel-host');
    moduleWorkspaceUi.panel = document.getElementById('connected-state');
    moduleWorkspaceUi.anchor = document.getElementById('connected-state-anchor');
    if (!moduleWorkspaceUi.root || !moduleWorkspaceUi.host || !moduleWorkspaceUi.panel || !moduleWorkspaceUi.anchor) return;
    document.querySelectorAll('[data-module-workspace-tab]').forEach(button => {
        button.addEventListener('click', () => setModuleWorkspaceTab(button.dataset.moduleWorkspaceTab, { focus: true }));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            const visibleTabs = Array.from(document.querySelectorAll('[data-module-workspace-tab]:not([hidden])'));
            const index = visibleTabs.indexOf(button);
            if (index < 0 || visibleTabs.length < 2) return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            visibleTabs[(index + direction + visibleTabs.length) % visibleTabs.length].click();
        });
    });
    document.getElementById('module-workspace-open-studio')?.addEventListener('click', leaveModuleWorkspaceToStudio);
    document.getElementById('module-workspace-open')?.addEventListener('click', () => openModuleWorkspace({ origin: 'editor' }));
    const count = document.getElementById('p11-history-count');
    if (count) {
        moduleWorkspaceUi.historyObserver = new MutationObserver(syncModuleWorkspaceUi);
        moduleWorkspaceUi.historyObserver.observe(count, { childList: true, characterData: true, subtree: true });
    }
    syncModuleWorkspaceText();
    syncModuleWorkspaceUi();
}

window.openModuleWorkspace = openModuleWorkspace;
window.leaveModuleWorkspaceToStudio = leaveModuleWorkspaceToStudio;
window.requestModuleWorkspaceConnection = requestModuleWorkspaceConnection;
window.cancelModuleWorkspaceConnectionRequest = cancelModuleWorkspaceConnectionRequest;
window.consumeModuleWorkspaceConnectionRequest = consumeModuleWorkspaceConnectionRequest;
window.handleModuleWorkspaceDisconnect = handleModuleWorkspaceDisconnect;
window.isModuleWorkspaceOpen = isModuleWorkspaceOpen;
window.syncModuleWorkspaceUi = syncModuleWorkspaceUi;
window.syncModuleWorkspaceText = syncModuleWorkspaceText;
window.setModuleWorkspaceTab = setModuleWorkspaceTab;
window.addEventListener('DOMContentLoaded', bindModuleWorkspace);
