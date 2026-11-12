// Community entry point (always loaded, tiny). The Community itself lives in community/ and is only
// downloaded when it is opened. While it is in preview it stays hidden unless the Developer Lab switch is on.
(function() {
    const FLAG_KEY = 'bas.community.preview';
    const ASSET_VERSION = 'web-v22';
    const FILES = ['community/strings.js', 'community/legal.js', 'community/app.js', 'community/panel.js'];
    const LABELS = { en: 'Community', pt: 'Comunidade', es: 'Comunidad', fr: 'Communauté', de: 'Community', it: 'Community', ja: 'コミュニティ', zh: '社区' };
    const SHARE_LABELS = {
        en: 'Share in the Community', pt: 'Publicar na Comunidade', es: 'Publicar en la Comunidad', fr: 'Partager dans la Communauté',
        de: 'In der Community teilen', it: 'Condividi nella Community', ja: 'コミュニティで共有', zh: '分享到社区',
    };
    const STALE_LABELS = {
        en: 'The project changed: build again first.', pt: 'O projeto mudou: gere de novo primeiro.', es: 'El proyecto cambió: vuelve a generarlo primero.',
        fr: 'Le projet a changé : générez-le à nouveau d’abord.', de: 'Das Projekt hat sich geändert: zuerst neu erstellen.',
        it: 'Il progetto è cambiato: generalo di nuovo prima.', ja: 'プロジェクトが変更されました。先にもう一度生成してください。', zh: '项目已更改：请先重新生成。',
    };
    let loading = null;
    let lastBuild = null; // the last bootanimation.zip built in the Studio (kept in memory only)

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

    const label = (table) => table[typeof idiomaAtual === 'string' ? idiomaAtual : 'en'] || table.en;

    // "Share in the Community" on the Studio's finish screen, after a build.
    function syncShareButton(on) {
        const actions = document.querySelector('#finish-center .finish-actions');
        if (!actions) return;
        let button = document.getElementById('finish-share-community');
        if (!button) {
            button = document.createElement('button');
            button.id = 'finish-share-community';
            button.type = 'button';
            const glyph = document.createElement('span');
            glyph.className = 'finish-action-glyph finish-action-share';
            glyph.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.id = 'finish-share-community-label';
            button.append(glyph, text);
            button.addEventListener('click', shareLastBuild);
            actions.prepend(button);
        }
        button.hidden = !on || !lastBuild;
        document.getElementById('finish-share-community-label').textContent = label(SHARE_LABELS);
    }

    function rememberBuild(blob, name) {
        if (!(blob instanceof Blob)) return;
        lastBuild = { blob, name: String(name || 'bootanimation') };
        syncShareButton(flagOn());
    }

    function shareLastBuild() {
        if (!lastBuild) return;
        if (document.getElementById('finish-center')?.dataset.state === 'stale') {
            if (typeof showToast === 'function') showToast(label(STALE_LABELS), 'info', 4200);
            return;
        }
        open({ path: 'upload', upload: lastBuild });
    }

    function sync() {
        const on = flagOn();
        syncShareButton(on);
        // The Community choice on the start screen, under "Connect to Phone".
        const choice = document.getElementById('community-launch-choice');
        if (choice) choice.hidden = !on;
        const table = (typeof traducoes === 'object' && traducoes[typeof idiomaAtual === 'string' ? idiomaAtual : 'en']) || {};
        const launcher = document.getElementById('community-launcher');
        if (launcher) launcher.textContent = table.launchCommunity || label(LABELS);
        const desc = document.getElementById('community-launch-desc');
        if (desc && table.launchCommunityDesc) desc.textContent = table.launchCommunityDesc;
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

    window.BASCommunityEntry = Object.freeze({ open, load, enabled: flagOn, setEnabled: setFlag, rememberBuild });
    window.addEventListener('DOMContentLoaded', bind);
})();
