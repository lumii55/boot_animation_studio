/* P15.A — experimental gallery shell. No backend requests, uploads, or account actions. */
(function () {
    'use strict';
    const STORAGE_KEY = 'bas.community.preview.v1';
    const COPY = {
        en: {
            labTitle: 'BAS Community — P15',
            labDesc: 'Experimental gallery, accessible through Developer Lab only. No online services are active.',
            labToggle: 'Show the Community preview in this browser',
            labOpen: 'Open gallery preview',
            labSecurity: 'This local preference is not authorization. Publishing and moderation remain unavailable until the server-side controls are ready.',
            on: 'Enabled while Developer Lab is active.', off: 'Hidden by default.',
            pageTitle: 'Community', badge: 'EXPERIMENTAL PREVIEW',
            intro: 'A home for boot animations.',
            description: 'Discover, publish and share boot animations. This is an experimental interface; online features are not active yet.',
            editor: 'Publish from editor', editorDesc: 'After exporting an animation.',
            zip: 'Upload an existing ZIP', zipDesc: 'Validate an existing bootanimation.zip.',
            phone: 'Share from connected phone', phoneDesc: 'Preview the installed animation first.',
            empty: 'Nothing published here yet', emptyDesc: 'Gallery, accounts, uploads, comments and moderation arrive in later P15 steps.',
            footer: 'Local UI preview only · No uploads, accounts or payments.', close: 'Close preview'
        },
        pt: {
            labTitle: 'BAS Community — P15',
            labDesc: 'Galeria experimental acessível apenas pelo Developer Lab. Nenhum serviço online está ativo.',
            labToggle: 'Mostrar a prévia da comunidade neste navegador',
            labOpen: 'Abrir prévia da galeria',
            labSecurity: 'Esta preferência local não é autorização. Publicações e moderação continuam indisponíveis até os controles do servidor estarem prontos.',
            on: 'Ativada enquanto o Developer Lab estiver aberto nesta sessão.', off: 'Oculta por padrão.',
            pageTitle: 'Comunidade', badge: 'PRÉVIA EXPERIMENTAL',
            intro: 'Um lar para animações de boot.',
            description: 'Descubra, publique e compartilhe animações de boot. Esta é uma interface experimental; os serviços online ainda não estão ativos.',
            editor: 'Publicar pelo editor', editorDesc: 'Depois de exportar uma animação.',
            zip: 'Enviar um ZIP existente', zipDesc: 'Valide um bootanimation.zip existente.',
            phone: 'Publicar do celular conectado', phoneDesc: 'Confira antes a animação instalada.',
            empty: 'Ainda não há publicações', emptyDesc: 'Galeria, contas, uploads, comentários e moderação chegarão nas próximas etapas da P15.',
            footer: 'Somente prévia local · Sem uploads, contas ou pagamentos.', close: 'Fechar prévia'
        }
    };
    let savedInMemory = false;
    let previousFocus = null;
    let bound = false;
    const byId = id => document.getElementById(id);
    const developerActive = () => window.BASDeveloperLab?.state?.().enabled === true;
    function getFlag() {
        try { return localStorage.getItem(STORAGE_KEY) === 'enabled'; }
        catch (_) { return savedInMemory; }
    }
    function setFlag(value) {
        savedInMemory = Boolean(value);
        try { localStorage.setItem(STORAGE_KEY, value ? 'enabled' : 'disabled'); }
        catch (_) { /* Storage can be blocked; in-memory flag is safe for this session. */ }
    }
    const isVisible = () => developerActive() && getFlag();
    function tr(key) {
        const language = (typeof idiomaAtual === 'string' ? idiomaAtual : document.documentElement.lang) || 'en';
        return (COPY[language] || COPY.en)[key] || COPY.en[key] || key;
    }
    function close() {
        const overlay = byId('bas-community-preview');
        if (!overlay || overlay.hidden) return;
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('bas-community-open');
        if (previousFocus?.isConnected) previousFocus.focus();
        previousFocus = null;
    }
    function sync() {
        const visible = isVisible();
        const toggle = byId('bas-community-feature-toggle');
        if (toggle) { toggle.checked = getFlag(); toggle.disabled = !developerActive(); }
        const launcher = byId('bas-community-launcher');
        if (launcher) launcher.hidden = !visible;
        const openButton = byId('bas-community-preview-open');
        if (openButton) openButton.disabled = !visible;
        if (!visible) close();
        document.querySelectorAll('[data-community-copy]').forEach(element => {
            element.textContent = tr(element.getAttribute('data-community-copy'));
        });
        const status = byId('bas-community-status');
        if (status) status.textContent = tr(visible ? 'on' : 'off');
        const closeButton = byId('bas-community-close');
        if (closeButton) closeButton.setAttribute('aria-label', tr('close'));
    }
    function open() {
        if (!isVisible()) return false;
        const overlay = byId('bas-community-preview');
        if (!overlay) return false;
        previousFocus = document.activeElement;
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('bas-community-open');
        byId('bas-community-close')?.focus();
        return true;
    }
    function bind() {
        if (bound) return;
        bound = true;
        byId('bas-community-feature-toggle')?.addEventListener('change', event => {
            if (!developerActive()) { sync(); return; }
            setFlag(Boolean(event.target.checked));
            sync();
        });
        byId('bas-community-launcher')?.addEventListener('click', open);
        byId('bas-community-preview-open')?.addEventListener('click', open);
        byId('bas-community-close')?.addEventListener('click', close);
        byId('bas-community-preview')?.addEventListener('click', event => {
            if (event.target === byId('bas-community-preview')) close();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') close();
        });
        window.addEventListener('bas:developer-mode-changed', sync);
        window.addEventListener('bas:languagechange', sync);
        sync();
    }
    window.BASCommunityPreview = Object.freeze({
        version: 1, enabled: isVisible, open, close, sync,
        state: () => ({
            optedIn: getFlag(),
            available: isVisible(),
            open: Boolean(byId('bas-community-preview') && !byId('bas-community-preview').hidden)
        })
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();
