// App frame of the redesigned site: light/dark theme and the main navigation (bottom bar on phones, side rail on
// wide screens). The navigation only asks the existing owners to change screens (BASModuleWorkspace, startManualMode,
// BASCommunityEntry); which item is active is read back from the screens themselves, never stored separately.
(function () {
    'use strict';
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const THEME_KEY = 'bas.theme';
    const THEME_COLORS = { dark: '#0e0d17', light: '#f6f5fb' };
    const byId = (id) => document.getElementById(id);
    let studioSeen = false;

    // ------------------------------------------------------------------ texts

    function text(key, fallback) {
        const lang = typeof idiomaAtual === 'string' ? idiomaAtual : 'en';
        const table = (typeof traducoes === 'object' && traducoes && (traducoes[lang] || traducoes.en)) || {};
        return table[key] || fallback;
    }

    function syncTexts() {
        const labels = {
            'app-nav-home': text('btnHome', 'Home'),
            'app-nav-studio': text('navStudio', 'Studio'),
            'app-nav-phone': text('navPhone', 'Phone'),
            'app-nav-community': text('launchCommunity', 'Community'),
            'start-go-label': text('startGo', 'Start'),
            'start-footer-contact': text('footerContact', 'Contact:'),
            'start-footer-terms': text('footerCommunityTerms', 'Community terms of use'),
        };
        Object.entries(labels).forEach(([id, value]) => { const el = byId(id); if (el) el.textContent = value; });
        const nav = byId('app-nav');
        if (nav) nav.setAttribute('aria-label', text('navMain', 'Main navigation'));
        const toggle = byId('theme-toggle');
        if (toggle) {
            const label = text('themeToggle', 'Switch between light and dark theme');
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
        }
    }

    // ------------------------------------------------------------------ theme

    function storedTheme() {
        try {
            const value = localStorage.getItem(THEME_KEY);
            return value === 'light' || value === 'dark' ? value : null;
        } catch (error) {
            return null;
        }
    }

    function systemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    function currentTheme() {
        return document.documentElement.dataset.theme || systemTheme();
    }

    function applyTheme(theme) {
        if (theme) document.documentElement.dataset.theme = theme;
        else delete document.documentElement.dataset.theme;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEME_COLORS[currentTheme()]);
    }

    function toggleTheme() {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        // Back to "follow the system" when the choice matches it, so a later system change is followed again.
        const keep = next === systemTheme() ? null : next;
        try {
            if (keep) localStorage.setItem(THEME_KEY, keep);
            else localStorage.removeItem(THEME_KEY);
        } catch (error) {}
        applyTheme(keep);
    }

    // ------------------------------------------------------------------ screens

    function isShown(el) {
        return !!el && !el.hidden && el.style.display !== 'none';
    }

    function activeScreen() {
        if (document.body.classList.contains('cm-open')) return 'community';
        if (isShown(byId('module-workspace'))) return 'phone';
        if (isShown(byId('initial-state'))) return 'home';
        if (byId('editor-section')?.style.display === 'flex') return 'studio';
        return 'home';
    }

    function syncNav() {
        const active = activeScreen();
        if (active === 'studio') studioSeen = true;
        document.querySelectorAll('[data-app-nav]').forEach((item) => {
            if (item.dataset.appNav === active) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });
    }

    function closeCommunity() {
        if (window.BASCommunity?.isOpen?.()) window.BASCommunity.close();
    }

    function showStudio() {
        const workspace = window.BASModuleWorkspace;
        if (workspace?.isOpen?.()) {
            workspace.leave();
            return;
        }
        const connected = !!window.BASState?.connectedMode;
        if (!connected && !studioSeen) {
            if (typeof startManualMode === 'function') startManualMode();
            return;
        }
        byId('initial-state').style.display = 'none';
        byId('editor-section').style.display = 'flex';
        if (connected && byId('connected-state')) byId('connected-state').style.display = 'flex';
        window.BASWorkspace?.sync?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const ACTIONS = {
        home() {
            closeCommunity();
            window.BASModuleWorkspace?.returnToLaunch?.();
        },
        studio() {
            closeCommunity();
            showStudio();
        },
        phone() {
            closeCommunity();
            if (typeof requestModuleWorkspaceConnection === 'function') requestModuleWorkspaceConnection();
        },
        community() {
            window.BASCommunityEntry?.open?.();
        },
    };

    function bind() {
        applyTheme(storedTheme());
        byId('theme-toggle')?.addEventListener('click', toggleTheme);
        window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme(storedTheme()));

        document.querySelectorAll('[data-app-nav]').forEach((item) => {
            item.addEventListener('click', () => {
                const action = ACTIONS[item.dataset.appNav];
                if (action) action();
                syncNav();
            });
        });
        const watch = new MutationObserver(syncNav);
        ['initial-state', 'editor-section'].forEach((id) => { const el = byId(id); if (el) watch.observe(el, { attributes: true, attributeFilter: ['style'] }); });
        const workspace = byId('module-workspace');
        if (workspace) watch.observe(workspace, { attributes: true, attributeFilter: ['hidden'] });
        watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        window.addEventListener('bas:languagechange', syncTexts);
        syncTexts();
        syncNav();
    }

    // The theme is applied as early as this script runs, before the page is shown.
    applyTheme(storedTheme());
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();

    window.BASAppShell = Object.freeze({ toggleTheme, currentTheme, activeScreen, syncNav });
})();
