// Community entry point (always loaded, tiny). The Community itself lives in community/ and is only
// downloaded when it is opened. While it is in preview it stays hidden unless the Developer Lab switch is on.
(function() {
    const FLAG_KEY = 'bas.community.preview';
    const ASSET_VERSION = 'web-v16';
    const FILES = ['community/strings.js', 'community/app.js', 'community/panel.js'];
    const LABELS = { en: 'Community', pt: 'Comunidade', es: 'Comunidad', fr: 'Communauté', de: 'Community', it: 'Community', ja: 'コミュニティ', zh: '社区' };
    let loading = null;

    function flagOn() {
        try { return localStorage.getItem(FLAG_KEY) === '1'; } catch (error) { return false; }
    }

    function setFlag(on) {
        try {
            if (on) localStorage.setItem(FLAG_KEY, '1');
            else localStorage.removeItem(FLAG_KEY);
        } catch (error) {
            // Private mode: the switch only lasts for this page.
        }
        sync();
    }

    function sync() {
        const on = flagOn();
        const launcher = document.getElementById('community-launcher');
        if (launcher) {
            launcher.hidden = !on;
            const lang = typeof idiomaAtual === 'string' ? idiomaAtual : 'en';
            launcher.textContent = LABELS[lang] || LABELS.en;
        }
        const toggle = document.getElementById('developer-lab-community-toggle');
        if (toggle) toggle.checked = on;
        return on;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${src}?v=${ASSET_VERSION}`;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Could not load ${src}`));
            document.head.appendChild(script);
        });
    }

    function load() {
        if (window.BASCommunity) return Promise.resolve(window.BASCommunity);
        if (!loading) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = `community/community.css?v=${ASSET_VERSION}`;
            document.head.appendChild(css);
            loading = Promise.all(FILES.map(loadScript)).then(() => window.BASCommunity).catch(error => {
                loading = null;
                throw error;
            });
        }
        return loading;
    }

    async function open(route) {
        try {
            const community = await load();
            community.open(route);
        } catch (error) {
            if (typeof showToast === 'function') showToast(String(error.message || error), 'error', 4200);
        }
    }

    // Returning from GitHub sign-in, or a moderation link from the Discord bot.
    function handleIncomingHash() {
        const hash = location.hash || '';
        const isAuth = hash.startsWith('#bas-auth=') || hash.startsWith('#bas-auth-error=');
        const isRoute = hash === '#community' || hash.startsWith('#community/');
        if (!isAuth && !isRoute) return;
        if (isRoute && window.BASCommunity && window.BASCommunity.isOpen()) return; // the open Community routes itself
        if (!flagOn()) {
            if (isAuth) history.replaceState(null, '', location.pathname + location.search);
            return;
        }
        open(isAuth ? { incoming: hash } : { path: hash.slice(1) });
    }

    function bind() {
        document.getElementById('community-launcher')?.addEventListener('click', () => open());
        document.getElementById('developer-lab-community-toggle')?.addEventListener('change', event => {
            setFlag(Boolean(event.target.checked));
            if (typeof showToast === 'function') {
                showToast(event.target.checked ? 'Community preview enabled on this browser.' : 'Community preview hidden.', 'info', 2400);
            }
        });
        window.addEventListener('bas:languagechange', sync);
        window.addEventListener('hashchange', handleIncomingHash);
        sync();
        handleIncomingHash();
    }

    window.BASCommunityEntry = Object.freeze({ open, load, enabled: flagOn, setEnabled: setFlag });
    window.addEventListener('DOMContentLoaded', bind);
})();
