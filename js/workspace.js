const workspaceUi = {
    editor: null,
    nav: null,
    empty: null,
    sourceReady: null,
    stateLabel: null,
    currentView: 'edit'
};

function workspaceHasMedia() {
    const videoContainer = document.getElementById('video-container');
    return !!videoContainer && videoContainer.style.display === 'block';
}

function workspaceIsConnected() {
    const connectedState = document.getElementById('connected-state');
    return !!connectedState && connectedState.style.display === 'flex';
}

function workspaceText(key, fallback) {
    try {
        if (typeof traducoes !== 'undefined' && typeof idiomaAtual !== 'undefined' && traducoes[idiomaAtual] && traducoes[idiomaAtual][key]) {
            return traducoes[idiomaAtual][key];
        }
    } catch (e) {}
    return fallback;
}

function setWorkspaceView(view, options = {}) {
    if (!['edit', 'settings', 'export'].includes(view)) return;
    if (!workspaceUi.editor) return;
    workspaceUi.currentView = view;
    workspaceUi.editor.dataset.mobileView = view;
    document.querySelectorAll('.workflow-tab[data-workspace-view]').forEach(button => {
        const active = button.dataset.workspaceView === view;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (typeof window.projectEngineTouch === 'function') window.projectEngineTouch('workspace-view', { emit: true });
    if (options.scroll !== false && window.matchMedia('(max-width: 859px)').matches) {
        const sourceDock = document.getElementById('source-dock');
        const target = view === 'edit'
            ? document.querySelector('.workspace-stage')
            : view === 'settings'
                ? document.querySelector('.settings-stage')
                : document.querySelector('.export-stage');
        const top = target || sourceDock || workspaceUi.editor;
        requestAnimationFrame(() => {
            const headerOffset = 72;
            const y = Math.max(0, top.getBoundingClientRect().top + window.scrollY - headerOffset);
            window.scrollTo({ top: y, behavior: options.instant ? 'auto' : 'smooth' });
            if (view === 'edit' && typeof ajustarPaddings === 'function') ajustarPaddings();
        });
    }
}

function syncWorkspaceUi() {
    if (!workspaceUi.editor) return;
    const hasMedia = workspaceHasMedia();
    const connected = workspaceIsConnected();
    const stateButton = document.getElementById('editor-device-toggle');
    workspaceUi.editor.classList.toggle('has-media', hasMedia);
    workspaceUi.editor.classList.toggle('has-device', connected);
    document.body.classList.toggle('workspace-has-media', hasMedia);
    document.body.classList.toggle('workspace-has-device', connected);
    if (workspaceUi.empty) workspaceUi.empty.hidden = hasMedia;
    if (workspaceUi.nav) workspaceUi.nav.classList.toggle('is-visible', hasMedia);
    if (workspaceUi.sourceReady) {
        workspaceUi.sourceReady.textContent = hasMedia
            ? workspaceText('workspaceSourceReady', 'Source ready')
            : workspaceText('workspaceSourceEmpty', 'No source');
        workspaceUi.sourceReady.classList.toggle('is-ready', hasMedia);
    }
    if (stateButton) {
        stateButton.hidden = connected;
        stateButton.setAttribute('aria-hidden', connected ? 'true' : 'false');
    }
    if (workspaceUi.stateLabel) {
        workspaceUi.stateLabel.textContent = connected
            ? workspaceText('workspaceDevice', 'Device')
            : workspaceText('workspaceConnectAction', 'Connect phone');
    }
    if (stateButton && !connected) {
        const label = workspaceText('workspaceConnectAction', 'Connect phone');
        stateButton.title = label;
        stateButton.setAttribute('aria-label', label);
    }
    if (!hasMedia && workspaceUi.currentView !== 'edit') setWorkspaceView('edit', { scroll: false });
}

function bindWorkspaceNavigation() {
    workspaceUi.editor = document.getElementById('editor-section');
    workspaceUi.nav = document.getElementById('mobile-workflow-nav');
    workspaceUi.empty = document.getElementById('workspace-empty');
    workspaceUi.sourceReady = document.getElementById('p11-source-ready');
    workspaceUi.stateLabel = document.getElementById('p11-editor-state');
    if (!workspaceUi.editor) return;

    document.querySelectorAll('.workflow-tab[data-workspace-view]').forEach(button => {
        button.addEventListener('click', () => setWorkspaceView(button.dataset.workspaceView));
    });

    const bindings = [
        ['btn-workspace-next', 'settings'],
        ['btn-settings-back', 'edit'],
        ['btn-settings-next', 'export'],
        ['btn-export-back', 'settings']
    ];
    bindings.forEach(([id, view]) => {
        const button = document.getElementById(id);
        if (button) button.addEventListener('click', () => setWorkspaceView(view));
    });

    const observedIds = ['video-container', 'connected-state', 'editor-section', 'configuracoes', 'btn-gerar'];
    const observer = new MutationObserver(syncWorkspaceUi);
    observedIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    });

    setWorkspaceView(workspaceUi.editor.dataset.mobileView || 'edit', { scroll: false });
    syncWorkspaceUi();
    window.addEventListener('pageshow', syncWorkspaceUi);
    window.addEventListener('resize', syncWorkspaceUi, { passive: true });
}

window.addEventListener('DOMContentLoaded', bindWorkspaceNavigation);
window.syncWorkspaceUi = syncWorkspaceUi;
window.setWorkspaceView = setWorkspaceView;
