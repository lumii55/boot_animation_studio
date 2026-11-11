// Boot Animation Studio — Community (loaded on demand by js/community-entry.js).
//
// Mobile first: the phone layout is the design; wider screens only get more columns.
// Rules for this file:
//   * user content only goes in through textContent / attributes (never innerHTML);
//   * children are always added through h() / fill(), which drop null/undefined/false
//     (the native append/replaceChildren would print them as the words "null"/"undefined");
//   * sections keep their DOM, so switching tabs and going back is instant and keeps the scroll;
//   * previews only play while visible; lists load page by page.
(function () {
    'use strict';

    const API = 'https://bas-community.bootanimstudio.workers.dev';
    const TOKEN_KEY = 'bas.community.session';
    const REMIX_KEY = 'bas.community.remix';
    const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    const MAX_ZIP = 50 * 1024 * 1024;
    const LICENSES = ['cc-by-4.0', 'cc-by-sa-4.0', 'cc-by-nc-4.0', 'cc0-1.0', 'all-rights-reserved'];

    // ------------------------------------------------------------------ text

    const lang = () => (typeof idiomaAtual === 'string' ? idiomaAtual : 'en');

    function t(key, vars) {
        const all = window.BASCommunityStrings || {};
        let text = (all[lang()] && all[lang()][key]) || (all.en && all.en[key]) || key;
        if (vars) {
            for (const [name, value] of Object.entries(vars)) {
                text = text.split(`{${name}}`).join(value === null || value === undefined ? '' : String(value));
            }
        }
        return text;
    }

    const formatCount = (value) => new Intl.NumberFormat(lang(), { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
    function formatBytes(bytes) {
        const mb = (Number(bytes) || 0) / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round((Number(bytes) || 0) / 1024))} KB`;
    }
    function formatDate(ms) {
        if (!ms) return '';
        try { return new Date(ms).toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch (error) { return ''; }
    }
    const licenseLabel = (id) => t(`license_${String(id || '').replace(/[^a-z0-9]/g, '_')}`);

    // ------------------------------------------------------------------ DOM

    const isEmpty = (value) => value === null || value === undefined || value === false || value === '';

    function fill(el, ...children) {
        el.replaceChildren(...children.flat(Infinity).filter((child) => !isEmpty(child)).map((child) => (child instanceof Node ? child : String(child))));
        return el;
    }

    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === null || value === undefined || value === false) continue;
            if (key === 'class') el.className = value;
            else if (key === 'text') el.textContent = String(value);
            else if (key === 'dataset') {
                for (const [name, data] of Object.entries(value)) if (!isEmpty(data)) el.dataset[name] = String(data);
            } else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
            else el.setAttribute(key, value === true ? '' : String(value));
        }
        return children.length ? fill(el, ...children) : el;
    }

    // Constant SVG markup only (never user data).
    const ICONS = {
        explore: '<path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z"/>',
        following: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2c2.3.2 3.9 1.8 4.4 4.8"/>',
        upload: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
        panel: '<path d="M12 3 5 6v5.5c0 4.2 3 7.8 7 9.5 4-1.7 7-5.3 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
        back: '<path d="M15 5 8 12l7 7"/>',
        close: '<path d="M6 6l12 12M18 6 6 18"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
        phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
        remix: '<path d="M4 7h11l-3-3M20 17H9l3 3"/><path d="M4 7v3M20 17v-3"/>',
        download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>',
        flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
        star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
        heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    };
    function icon(name, cls = 'cm-icon') {
        const span = document.createElement('span');
        span.className = cls;
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
        return span;
    }

    function safeHttps(url) {
        try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : null; } catch (error) { return null; }
    }

    function toast(message, type = 'info', ms = 3200) {
        if (typeof showToast === 'function') showToast(message, type, ms);
    }

    async function confirmAction(message, danger = false) {
        if (typeof askConfirmation === 'function') return askConfirmation(message, danger);
        return window.confirm(message);
    }

    // ------------------------------------------------------------------ state

    const state = {
        token: readToken(),
        me: null,
        meLoaded: false,
        config: null,
        open: false,
        path: 'explore',
        sort: 'trending',
        views: new Map(),      // kept-alive views: path -> {view, scroll}
        current: null,
        root: null,
        main: null,
    };

    function readToken() {
        try {
            const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
            return saved && saved.token && saved.expires_at > Date.now() ? saved.token : null;
        } catch (error) {
            return null;
        }
    }
    function saveToken(token, expiresAt) {
        state.token = token;
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expires_at: expiresAt })); } catch (error) { /* session only */ }
    }
    function clearSession() {
        state.token = null;
        state.me = null;
        state.meLoaded = true;
        try { localStorage.removeItem(TOKEN_KEY); } catch (error) { /* ignore */ }
        renderChrome();
    }
    const isMod = () => !!state.me && (state.me.role === 'moderator' || state.me.role === 'owner');

    // ------------------------------------------------------------------ API

    class ApiError extends Error {
        constructor(status, code, message, details) {
            super(message);
            this.status = status;
            this.code = code;
            this.details = details || {};
        }
    }

    function errorText(code, fallback, details) {
        const key = `err_${code}`;
        const text = t(key, details && details.retry_after ? { seconds: details.retry_after } : undefined);
        return text !== key ? text : (fallback || t('errGeneric'));
    }

    async function api(method, path, { json, body, headers = {}, signal } = {}) {
        const init = { method, headers: { ...headers }, signal };
        if (state.token) init.headers.Authorization = `Bearer ${state.token}`;
        if (json !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(json);
        } else if (body !== undefined) {
            init.body = body;
        }
        let response;
        try {
            response = await fetch(API + path, init);
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            throw new ApiError(0, 'network', t('errNetwork'));
        }
        const type = response.headers.get('Content-Type') || '';
        const data = type.includes('json') ? await response.json().catch(() => null) : null;
        if (!response.ok) {
            const err = (data && data.error) || {};
            if (response.status === 401 && state.token && err.code === 'sign_in_required') clearSession();
            throw new ApiError(response.status, err.code || `http_${response.status}`, errorText(err.code, err.message, err.details), err.details);
        }
        return data;
    }

    function reportError(error) {
        if (error && error.name === 'AbortError') return;
        console.warn('[BAS Community]', error);
        toast(error && error.message ? error.message : t('errGeneric'), 'error', 4200);
    }

    async function loadMe() {
        if (state.token) {
            try {
                state.me = await api('GET', '/v1/me');
            } catch (error) {
                if (error.status !== 401) reportError(error);
                state.me = null;
            }
        } else {
            state.me = null;
        }
        state.meLoaded = true;
        renderChrome();
        return state.me;
    }

    async function loadConfig() {
        if (!state.config) state.config = await api('GET', '/v1/config');
        return state.config;
    }

    // ------------------------------------------------------------------ sign-in

    function signIn(returnPath) {
        const back = `#community/${returnPath || state.path}`.slice(0, 100).replace(/[^A-Za-z0-9/_#-]/g, '');
        location.href = `${API}/v1/auth/github/start?return=${encodeURIComponent(back)}`;
    }

    async function handleIncoming(hash) {
        const params = new URLSearchParams(hash.slice(1));
        history.replaceState(null, '', location.pathname + location.search);
        const failure = params.get('bas-auth-error');
        if (failure) {
            const key = `authError_${failure}`;
            toast(t(key) !== key ? t(key) : t('authError_github'), 'error', 5200);
            return 'explore';
        }
        const to = (params.get('to') || '').replace(/^#community\/?/, '') || 'explore';
        try {
            const session = await api('POST', '/v1/auth/exchange', { json: { grant: params.get('bas-auth') } });
            saveToken(session.token, session.expires_at);
            await loadMe();
            if (state.me) toast(t('signedIn', { name: state.me.display_name }), 'success');
        } catch (error) {
            reportError(error);
        }
        return to;
    }

    // ------------------------------------------------------------------ chrome (top bar + bottom nav)

    const SECTIONS = [
        { id: 'explore', icon: 'explore', label: 'navExplore', match: /^(explore|tag\/)/ },
        { id: 'following', icon: 'following', label: 'navFollowing', match: /^following/ },
        { id: 'upload', icon: 'upload', label: 'navUpload', match: /^upload/ },
        { id: 'mod', icon: 'panel', label: 'navPanel', match: /^mod/, modOnly: true },
    ];
    const isRootPath = (path) => /^(explore|following|upload|mod(\/(mass|reports|review|audit|team))?)$/.test(path);

    function buildShell() {
        state.backBtn = h('button', { class: 'cm-iconbtn', type: 'button', 'aria-label': t('back'), onclick: () => history.back() }, icon('back'));
        state.brand = h('span', { class: 'cm-brand', 'aria-hidden': 'true' });
        state.titleEl = h('h2', { class: 'cm-title', id: 'cm-title' });
        state.account = h('div', { class: 'cm-account' });
        const closeBtn = h('button', { class: 'cm-iconbtn', type: 'button', 'aria-label': t('close'), onclick: () => closeCommunity() }, icon('close'));
        state.main = h('main', { class: 'cm-main', id: 'cm-main', tabindex: '-1' });
        state.nav = h('nav', { class: 'cm-tabbar', 'aria-label': t('title') });
        const shell = h('div', { class: 'cm-shell', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cm-title' },
            h('header', { class: 'cm-top' }, state.backBtn, state.brand, state.titleEl, state.account, closeBtn),
            state.main,
            state.nav);
        state.root = h('div', { class: 'cm-overlay', hidden: true }, shell);
        document.body.append(state.root);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.open && !state.root.querySelector('.cm-modal')) closeCommunity();
        });
        window.addEventListener('popstate', () => {
            if (!state.open) return;
            const hash = location.hash || '';
            if (hash.startsWith('#community')) route(hash.replace(/^#community\/?/, '') || 'explore');
            else hide();
        });
        window.addEventListener('bas:languagechange', () => {
            if (!state.open) return;
            state.views.clear();
            renderChrome();
            route(state.path, { force: true });
        });
    }

    function avatar(url, size = 'md') {
        const src = url && (url.startsWith(API) || safeHttps(url)) ? url : null;
        const empty = () => h('span', { class: `cm-avatar cm-avatar-${size} is-empty`, 'aria-hidden': 'true' });
        if (!src) return empty();
        const img = h('img', { class: `cm-avatar cm-avatar-${size}`, src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => img.replaceWith(empty()), { once: true });
        return img;
    }

    function renderChrome() {
        if (!state.root) return;
        if (!state.meLoaded) fill(state.account);
        else if (state.me) {
            fill(state.account, h('button', { class: 'cm-me', type: 'button', 'aria-label': t('myProfile'), onclick: () => navigate(`u/${state.me.handle}`) },
                avatar(state.me.pending_avatar_url || state.me.avatar_url, 'sm')));
        } else {
            fill(state.account, h('button', { class: 'cm-pill', type: 'button', onclick: () => signIn() }, t('signIn')));
        }
        fill(state.nav, SECTIONS.filter((section) => !section.modOnly || isMod()).map((section) => h('button', {
            class: `cm-tab${section.id === 'upload' ? ' is-upload' : ''}`,
            type: 'button',
            'aria-current': section.match.test(state.path) ? 'page' : null,
            dataset: { section: section.id },
            onclick: () => navigate(section.id === 'mod' ? 'mod/mass' : section.id),
        }, icon(section.icon, 'cm-tab-icon'), h('span', { class: 'cm-tab-label', text: t(section.label) }))));
        const root = isRootPath(state.path);
        state.backBtn.hidden = root;
        state.brand.hidden = !root;
    }

    function setTitle(text) {
        state.titleEl.textContent = text || t('title');
    }

    function closeCommunity() {
        if (location.hash.startsWith('#community')) history.replaceState(null, '', location.pathname + location.search);
        hide();
    }

    function hide() {
        state.open = false;
        state.root.hidden = true;
        document.body.classList.remove('cm-open');
        previews.pauseAll();
    }

    // ------------------------------------------------------------------ routing

    function navigate(path, { replace = false } = {}) {
        const hash = `#community/${path}`;
        if (replace) history.replaceState({ community: true }, '', hash);
        else if (location.hash !== hash) history.pushState({ community: true }, '', hash);
        route(path);
    }

    const ROUTES = [
        [/^explore$/, () => exploreView()],
        [/^tag\/([a-z0-9-]{1,24})$/, (m) => exploreView({ tag: m[1] })],
        [/^following$/, () => followingView()],
        [/^upload$/, () => uploadView()],
        [/^a\/([A-Za-z0-9_-]{16})$/, (m) => animationView(m[1])],
        [/^u\/([a-z0-9-]{1,39})$/, (m) => profileView(m[1])],
        [/^u\/([a-z0-9-]{1,39})\/(followers|following)$/, (m) => followListView(m[1], m[2])],
        [/^me\/edit$/, () => editProfileView()],
        [/^mod(?:\/(.*))?$/, (m) => (window.BASCommunityPanel ? window.BASCommunityPanel.view(m[1] || 'mass', kit) : notFoundView())],
    ];

    function route(path, { force = false } = {}) {
        if (state.current) {
            if (state.current.keepAlive) state.views.set(state.path, { view: state.current, scroll: state.main.scrollTop });
            if (state.current.onLeave) state.current.onLeave();
        }
        state.path = path;
        renderChrome();
        const kept = !force && state.views.get(path);
        if (kept) {
            state.current = kept.view;
            fill(state.main, kept.view.el);
            state.main.scrollTop = kept.scroll;
            setTitle(kept.view.title);
            if (kept.view.onEnter) kept.view.onEnter();
            return;
        }
        let view = null;
        for (const [pattern, make] of ROUTES) {
            const match = pattern.exec(path);
            if (match) {
                view = make(match);
                break;
            }
        }
        view = view || notFoundView();
        state.current = view;
        setTitle(view.title);
        fill(state.main, view.el);
        state.main.scrollTop = 0;
        if (view.onEnter) view.onEnter();
    }

    function notFoundView() {
        return { title: t('title'), el: emptyState(t('notFound')) };
    }

    function emptyState(message, ...extra) {
        return h('div', { class: 'cm-empty' }, h('p', { text: message }), extra);
    }

    function loading() {
        return h('div', { class: 'cm-loading', role: 'status' }, h('span', { class: 'cm-spinner', 'aria-hidden': 'true' }), h('span', { text: t('loading') }));
    }

    // ------------------------------------------------------------------ previews (play only while visible)

    const previews = (() => {
        let observer = null;
        function ensure() {
            if (observer || !('IntersectionObserver' in window)) return observer;
            observer = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    const img = entry.target;
                    if (entry.isIntersecting) {
                        if (img.dataset.src && img.getAttribute('src') !== img.dataset.src) img.src = img.dataset.src;
                    } else if (img.getAttribute('src')) {
                        img.removeAttribute('src');
                    }
                }
            }, { root: state.main, rootMargin: '400px 0px' });
            return observer;
        }
        return {
            watch(img) {
                if (ensure()) observer.observe(img);
                else img.src = img.dataset.src;
            },
            pauseAll() {
                if (state.root) state.root.querySelectorAll('img[data-src]').forEach((img) => img.removeAttribute('src'));
            },
        };
    })();

    // Media box with the real aspect ratio, so nothing jumps while loading.
    function media(url, width, height, cls = 'cm-media') {
        const ratio = width > 0 && height > 0 ? Math.min(2.4, Math.max(0.5, height / width)) : 16 / 9;
        const box = h('div', { class: cls, style: `aspect-ratio:${1}/${ratio.toFixed(4)}` });
        if (url) {
            const img = h('img', { alt: '', decoding: 'async', dataset: { src: url } });
            img.addEventListener('load', () => box.classList.add('is-loaded'));
            box.append(img);
            previews.watch(img);
        } else {
            box.append(h('span', { class: 'cm-media-none', text: t('noPreview') }));
        }
        return box;
    }

    // ------------------------------------------------------------------ masonry (Pinterest-style)

    // Two columns on any phone; wider screens add a column per ~200 px.
    const columnsFor = (width) => Math.max(2, Math.min(6, Math.floor((width + 8) / 200)));

    function masonry() {
        const el = h('div', { class: 'cm-masonry' });
        let cols = [];
        let heights = [];
        const items = [];
        const build = (count) => {
            cols = Array.from({ length: count }, () => h('div', { class: 'cm-col' }));
            heights = new Array(count).fill(0);
            fill(el, cols);
        };
        const place = (item) => {
            const index = heights.indexOf(Math.min(...heights));
            cols[index].append(item.el);
            heights[index] += item.weight;
        };
        const width = () => el.clientWidth || (state.main && state.main.clientWidth) || window.innerWidth;
        let frame = 0;
        if ('ResizeObserver' in window) {
            new ResizeObserver(() => {
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(() => {
                    const count = columnsFor(width());
                    if (count === cols.length || !el.isConnected) return;
                    build(count);
                    items.forEach(place);
                });
            }).observe(el);
        }
        return {
            el,
            add(list) {
                if (!cols.length) build(columnsFor(width()));
                for (const item of list) {
                    items.push(item);
                    place(item);
                }
            },
            clear() {
                items.length = 0;
                build(columnsFor(width()));
            },
            get size() { return items.length; },
        };
    }

    // Boot animations are very tall (often 9:20); pins are capped so a phone shows more than two at a time.
    const PIN_MAX_RATIO = 1.6;

    function pin(item) {
        const ratio = Math.min(PIN_MAX_RATIO, item.width > 0 && item.height > 0 ? item.height / item.width : 16 / 9);
        const el = h('button', { class: 'cm-pin', type: 'button', onclick: () => navigate(`a/${item.id}`) },
            media(item.preview_url, 1, ratio),
            h('span', { class: 'cm-pin-title', text: item.title }),
            h('span', { class: 'cm-pin-sub' },
                avatar(item.owner.avatar_url, 'xs'),
                h('span', { class: 'cm-pin-owner', text: item.owner.display_name }),
                item.rating && item.rating.count ? h('span', { class: 'cm-pin-stat' }, icon('star', 'cm-icon-xs is-star'), String(item.rating.average)) : null,
                item.downloads ? h('span', { class: 'cm-pin-stat' }, icon('download', 'cm-icon-xs'), formatCount(item.downloads)) : null));
        return { el, weight: Math.max(0.5, ratio) + 0.32 };
    }

    function skeletonPins(count = 8) {
        const ratios = [1.6, 1.3, 1.6, 1.45, 1.6, 1.2, 1.5, 1.6];
        return Array.from({ length: count }, (_, i) => ({
            el: h('div', { class: 'cm-pin is-skeleton', 'aria-hidden': 'true' },
                h('div', { class: 'cm-media', style: `aspect-ratio:1/${ratios[i % ratios.length]}` }), h('i'), h('i')),
            weight: ratios[i % ratios.length] + 0.32,
        }));
    }

    // Pages through an API list into a masonry (or a plain list) as the user scrolls.
    function feed({ fetchPage, render = pin, empty, layout = 'masonry' }) {
        const grid = layout === 'masonry' ? masonry() : null;
        const list = layout === 'list' ? h('div', { class: 'cm-list' }) : null;
        const status = h('div', { class: 'cm-feed-status' });
        const sentinel = h('div', { class: 'cm-sentinel', 'aria-hidden': 'true' });
        const el = h('div', { class: 'cm-feed' }, grid ? grid.el : list, status, sentinel);
        let cursor = null;
        let done = false;
        let busy = false;
        let first = true;
        let controller = null;
        let generation = 0;

        async function more() {
            if (busy || done) return;
            busy = true;
            const mine = generation;
            controller = new AbortController();
            if (first && grid) grid.add(skeletonPins());
            if (first && list) fill(list, loading());
            fill(status);
            try {
                const page = await fetchPage(cursor, controller.signal);
                if (mine !== generation) return;
                if (first) {
                    if (grid) grid.clear();
                    if (list) fill(list);
                }
                first = false;
                if (grid) grid.add(page.items.map(render));
                else page.items.forEach((item) => list.append(render(item)));
                cursor = page.next_cursor || null;
                done = !cursor;
                const count = grid ? grid.size : list.childElementCount;
                if (done && !count) fill(status, emptyState(empty()));
            } catch (error) {
                if (error.name === 'AbortError' || mine !== generation) return;
                if (first) {
                    if (grid) grid.clear();
                    if (list) fill(list);
                }
                fill(status, emptyState(error.message || t('errGeneric'), h('button', { class: 'cm-btn', type: 'button', onclick: () => more() }, t('retry'))));
            } finally {
                if (mine === generation) busy = false;
            }
        }

        let observer = null;
        return {
            el,
            start() {
                if ('IntersectionObserver' in window) {
                    observer = new IntersectionObserver((entries) => {
                        if (entries.some((entry) => entry.isIntersecting)) more();
                    }, { root: state.main, rootMargin: '900px 0px' });
                    observer.observe(sentinel);
                }
                more();
            },
            reset() {
                generation += 1;
                if (controller) controller.abort();
                cursor = null;
                done = false;
                busy = false;
                first = true;
                if (grid) grid.clear();
                if (list) fill(list);
                more();
            },
            stop() {
                generation += 1;
                if (controller) controller.abort();
                if (observer) observer.disconnect();
            },
        };
    }

    // ------------------------------------------------------------------ explore / following

    function deviceResolution() {
        try {
            const profile = window.BASDeviceProfile;
            const res = (profile && (profile.getLiveResolution() || profile.getResolution())) || null;
            return res && res.width && res.height ? `${res.width}x${res.height}` : null;
        } catch (error) {
            return null;
        }
    }

    function exploreView({ tag = null } = {}) {
        const filters = { q: '', res: null };
        const res = deviceResolution();
        const search = h('input', { class: 'cm-search-input', type: 'search', enterkeyhint: 'search', placeholder: t('searchPlaceholder'), 'aria-label': t('searchPlaceholder'), maxlength: '60' });
        const sorts = ['trending', 'top', 'new'];
        const chips = h('div', { class: 'cm-chips', role: 'tablist' });
        const compat = res ? h('button', { class: 'cm-chip', type: 'button', 'aria-pressed': 'false' }, t('compatible', { res: res.replace('x', '×') })) : null;
        const paintChips = () => fill(chips,
            sorts.map((sort) => h('button', {
                class: 'cm-chip', type: 'button', role: 'tab', 'aria-selected': String(state.sort === sort),
                onclick: () => {
                    if (state.sort === sort) return;
                    state.sort = sort;
                    paintChips();
                    list.reset();
                },
            }, t(`sort_${sort}`))),
            compat);
        const list = feed({
            fetchPage: (cursor, signal) => {
                const params = new URLSearchParams({ feed: state.sort });
                if (tag) params.set('tag', tag);
                if (filters.q) params.set('q', filters.q);
                if (filters.res) params.set('res', filters.res);
                if (cursor) params.set('cursor', cursor);
                return api('GET', `/v1/animations?${params}`, { signal });
            },
            empty: () => (filters.q || filters.res || tag ? t('emptyFiltered') : t('emptyFeed')),
        });
        let debounce = 0;
        search.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                const value = search.value.trim();
                if (value === filters.q) return;
                filters.q = value;
                list.reset();
            }, 320);
        });
        if (compat) {
            compat.addEventListener('click', () => {
                filters.res = filters.res ? null : res;
                compat.setAttribute('aria-pressed', String(!!filters.res));
                list.reset();
            });
        }
        paintChips();
        const el = h('section', { class: 'cm-explore' },
            h('div', { class: 'cm-explore-head' },
                tag ? h('div', { class: 'cm-tagline' }, h('span', { class: 'cm-tag is-active', text: `#${tag}` })) : null,
                h('label', { class: 'cm-search' }, icon('search'), search),
                chips),
            list.el);
        list.start();
        return { el, title: tag ? `#${tag}` : t('navExplore'), keepAlive: true };
    }

    function followingView() {
        if (!state.token) return { el: signInPrompt(t('followingSignIn')), title: t('navFollowing') };
        const list = feed({
            fetchPage: (cursor, signal) => api('GET', `/v1/animations?feed=following${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
            empty: () => t('emptyFollowing'),
        });
        list.start();
        return { el: h('section', { class: 'cm-following' }, list.el), title: t('navFollowing'), keepAlive: true };
    }

    function signInPrompt(message) {
        return h('div', { class: 'cm-empty' },
            h('p', { text: message }),
            h('button', { class: 'cm-btn is-primary', type: 'button', onclick: () => signIn() }, t('signInGithub')),
            h('p', { class: 'cm-fine', text: t('signInPrivacy') }));
    }

    // ------------------------------------------------------------------ animation page

    async function fetchVerified(detail, onProgress) {
        const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
        const response = await fetch(detail.download_url, { headers });
        if (!response.ok) throw new ApiError(response.status, 'download', t('errDownload'));
        const total = Number(response.headers.get('Content-Length')) || detail.size_bytes || 1;
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            if (onProgress) onProgress(Math.min(1, received / total));
        }
        const blob = new Blob(chunks, { type: 'application/zip' });
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
        if (hex !== detail.sha256) throw new ApiError(0, 'integrity', t('errIntegrity'));
        return blob;
    }

    function busy(button, label) {
        const original = Array.from(button.childNodes);
        button.disabled = true;
        const text = h('span', { text: label });
        fill(button, h('span', { class: 'cm-spinner is-small', 'aria-hidden': 'true' }), text);
        return {
            progress(fraction) { text.textContent = `${label} ${Math.round(fraction * 100)}%`; },
            done() { button.disabled = false; fill(button, original); },
        };
    }

    function fileNameFor(detail) {
        const slug = detail.title.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'animation';
        return `${slug}-bootanimation.zip`;
    }

    async function downloadAnimation(detail, button) {
        const state_ = busy(button, t('downloading'));
        try {
            const blob = await fetchVerified(detail, state_.progress);
            if (window.BASExport && window.BASExport.downloadBlob) window.BASExport.downloadBlob(blob, fileNameFor(detail));
        } catch (error) {
            reportError(error);
        } finally {
            state_.done();
        }
    }

    function phoneReady() {
        const connected = typeof isConnectedMode !== 'undefined' && isConnectedMode;
        if (!connected) {
            toast(t('needPhone'), 'info', 4600);
            return false;
        }
        if (typeof hasModulePermission === 'function' && !hasModulePermission('control')) {
            toast(t('needControl'), 'error', 4600);
            return false;
        }
        return typeof ensureModuleFeature !== 'function' || ensureModuleFeature('direct_upload');
    }

    async function installOnPhone(detail, button) {
        if (!phoneReady()) return;
        if (!(await confirmAction(t('installConfirm', { title: detail.title })))) return;
        const progress = busy(button, t('installing'));
        try {
            const blob = await fetchVerified(detail, progress.progress);
            const form = new FormData();
            form.append('bootanimation', blob, 'bootanimation.zip');
            const response = await apiFetch('/upload', { method: 'POST', body: form });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || t('errInstall'));
            window.hasCustomAnimApplied = true;
            if (typeof loadHistory === 'function') loadHistory().catch(() => {});
            if (typeof syncDeviceProfileUi === 'function') syncDeviceProfileUi();
            toast(t('installed'), 'success', 4200);
        } catch (error) {
            reportError(error);
        } finally {
            progress.done();
        }
    }

    async function openInStudio(detail, button) {
        if (typeof abrirZipNoEditor !== 'function') return;
        if (!(await confirmAction(t('openConfirm')))) return;
        const progress = busy(button, t('downloading'));
        try {
            const blob = await fetchVerified(detail, progress.progress);
            try { sessionStorage.setItem(REMIX_KEY, JSON.stringify({ id: detail.id, title: detail.title, owner: detail.owner.handle })); } catch (error) { /* ignore */ }
            closeCommunity();
            if (window.BASModuleWorkspace && window.BASModuleWorkspace.isOpen && window.BASModuleWorkspace.isOpen()) window.BASModuleWorkspace.leave();
            await abrirZipNoEditor(blob);
            toast(t('openedInStudio'), 'success', 4200);
        } catch (error) {
            reportError(error);
        } finally {
            progress.done();
        }
    }

    function starInput(detail, onChange) {
        const wrap = h('div', { class: 'cm-stars-input', role: 'radiogroup', 'aria-label': t('yourRating') });
        const paint = (value) => wrap.querySelectorAll('button').forEach((button, index) => {
            button.classList.toggle('is-on', index < value);
            button.setAttribute('aria-checked', String(index + 1 === value));
        });
        for (let i = 1; i <= 5; i++) {
            wrap.append(h('button', {
                type: 'button', role: 'radio', 'aria-label': t('starsN', { n: i }),
                onclick: async () => {
                    if (!state.me) return signIn(`a/${detail.id}`);
                    const previous = detail.my_rating || 0;
                    const next = previous === i ? 0 : i;
                    paint(next); // optimistic
                    try {
                        const result = next
                            ? await api('PUT', `/v1/animations/${detail.id}/rating`, { json: { stars: next } })
                            : await api('DELETE', `/v1/animations/${detail.id}/rating`);
                        detail.my_rating = result.my_rating;
                        detail.rating = result.rating;
                        onChange();
                    } catch (error) {
                        paint(previous);
                        reportError(error);
                    }
                },
            }, icon('star', 'cm-icon')));
        }
        paint(detail.my_rating || 0);
        return wrap;
    }

    function followButton(handle, following, onChange) {
        const button = h('button', { class: 'cm-pill', type: 'button' });
        let current = !!following;
        const paint = () => {
            button.textContent = current ? t('following') : t('follow');
            button.classList.toggle('is-primary', !current);
        };
        paint();
        button.addEventListener('click', async () => {
            if (!state.me) return signIn(`u/${handle}`);
            current = !current;
            paint(); // optimistic
            try {
                const result = await api(current ? 'PUT' : 'DELETE', `/v1/users/${handle}/follow`);
                current = result.following;
                paint();
                if (onChange) onChange(result.followers);
                state.views.delete('following');
            } catch (error) {
                current = !current;
                paint();
                reportError(error);
            }
        });
        return button;
    }

    function ratingText(rating) {
        if (!rating || !rating.count) return t('noRatings');
        return t(rating.count === 1 ? 'ratingSummaryOne' : 'ratingSummary', { value: rating.average, count: formatCount(rating.count) });
    }

    function animationView(id) {
        const el = h('section', { class: 'cm-detail' }, loading());
        const view = { el, title: '' };
        let more = null;
        view.onLeave = () => { if (more) more.stop(); };
        api('GET', `/v1/animations/${id}`).then((detail) => {
            view.title = detail.title;
            if (state.current === view) setTitle(detail.title);
            more = renderDetail(el, detail);
        }).catch((error) => fill(el, emptyState(error.message)));
        return view;
    }

    function renderDetail(el, detail) {
        // `status` only reaches the uploader and moderators; everyone else only ever sees published items.
        const published = !detail.status || detail.status === 'published';
        const ratingLine = h('span', { class: 'cm-rating' });
        const paintRating = () => fill(ratingLine,
            detail.rating.count ? icon('star', 'cm-icon-xs is-star') : null,
            h('span', { text: ratingText(detail.rating) }));
        paintRating();

        const install = h('button', { class: 'cm-btn is-primary is-wide', type: 'button' }, icon('phone'), h('span', { text: t('installOnPhone') }));
        install.addEventListener('click', () => installOnPhone(detail, install));
        const remix = h('button', { class: 'cm-action', type: 'button' }, icon('remix'), h('span', { text: t('actionRemix') }));
        remix.addEventListener('click', () => openInStudio(detail, remix));
        const download = h('button', { class: 'cm-action', type: 'button' }, icon('download'), h('span', { text: t('download') }));
        download.addEventListener('click', () => downloadAnimation(detail, download));
        const report = published && !detail.is_mine
            ? h('button', { class: 'cm-action', type: 'button', onclick: () => reportDialog('animation', detail.id) }, icon('flag'), h('span', { text: t('report') }))
            : null;

        const credits = detail.credits || {};
        // Credits: who made the animation, who made the art, and what the automatic checks recognised.
        const animationBy = credits.animation_by === 'self' ? `${detail.owner.display_name} (@${detail.owner.handle})` : credits.animation_by;
        const creditLines = [
            animationBy ? t('creditAnimationLine', { name: animationBy }) : null,
            credits.art_by ? t('creditArtLine', { name: credits.art_by }) : null,
            credits.original_author ? t('creditOriginal', { name: credits.original_author }) : null,
            credits.manufacturer ? t('creditManufacturer', { name: credits.manufacturer }) : null,
            credits.detected_manufacturer && credits.detected_manufacturer !== credits.manufacturer
                ? t('creditDetected', { name: credits.detected_manufacturer }) : null,
        ].filter(Boolean);
        const facts = [
            [t('factResolution'), detail.width && detail.height ? `${detail.width} × ${detail.height}` : null],
            [t('factFps'), detail.fps || null],
            [t('factFrames'), detail.frame_count ? formatCount(detail.frame_count) : null],
            [t('factParts'), detail.parts || null],
            [t('factAudio'), detail.has_audio ? t('yes') : t('no')],
            [t('factSize'), formatBytes(detail.size_bytes)],
            [t('factLicense'), licenseLabel(detail.license)],
            [t('factPublished'), formatDate(detail.published_at) || null],
        ].filter(([, value]) => !isEmpty(value));

        const moreSection = h('section', { class: 'cm-more' });
        let moreFeed = null;
        if (published) {
            moreFeed = feed({
                fetchPage: async (cursor, signal) => {
                    const page = await api('GET', `/v1/users/${detail.owner.handle}/animations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
                    return { ...page, items: page.items.filter((item) => item.id !== detail.id) };
                },
                empty: () => t('emptyProfile'),
            });
            fill(moreSection, h('h3', { class: 'cm-section-title', text: t('moreFrom', { name: detail.owner.display_name }) }), moreFeed.el);
        }

        fill(el,
            detail.status && !published ? h('div', { class: `cm-banner-status is-${detail.status}` },
                h('strong', { text: t(`status_${detail.status}`) }),
                detail.status_reason ? h('span', { text: detail.status_reason }) : null) : null,
            h('div', { class: 'cm-detail-media' }, media(detail.preview_url, detail.width, detail.height, 'cm-media is-large')),
            h('div', { class: 'cm-detail-body' },
                h('h3', { class: 'cm-detail-title', text: detail.title }),
                h('div', { class: 'cm-author' },
                    h('button', { class: 'cm-author-link', type: 'button', onclick: () => navigate(`u/${detail.owner.handle}`) },
                        avatar(detail.owner.avatar_url, 'md'),
                        h('span', { class: 'cm-author-names' }, h('strong', { text: detail.owner.display_name }), h('small', { text: `@${detail.owner.handle}` }))),
                    state.me && state.me.handle === detail.owner.handle ? null : followButton(detail.owner.handle, detail.owner_followed_by_me)),
                h('div', { class: 'cm-statline' },
                    ratingLine,
                    h('span', { class: 'cm-dot', text: '·' }),
                    h('span', { text: t('downloadsCount', { count: formatCount(detail.downloads) }) }),
                    detail.remix_count ? [h('span', { class: 'cm-dot', text: '·' }), h('span', { text: t('remixCount', { count: formatCount(detail.remix_count) }) })] : null),
                install,
                h('div', { class: 'cm-actions' }, remix, download, report),
                published && !detail.is_mine ? h('div', { class: 'cm-rate' }, h('span', { text: t('yourRating') }), starInput(detail, paintRating)) : null,
                detail.description ? h('p', { class: 'cm-text', text: detail.description }) : null,
                detail.remix_source ? h('p', { class: 'cm-remix-of' }, t('remixOf'), ' ',
                    h('a', { href: `#community/a/${detail.remix_source.id}`, onclick: (event) => { event.preventDefault(); navigate(`a/${detail.remix_source.id}`); } }, detail.remix_source.title),
                    ` · @${detail.remix_source.owner}`) : null,
                creditLines.length ? h('div', { class: 'cm-credits' }, h('strong', { text: t('creditsTitle') }), creditLines.map((line) => h('span', { text: line }))) : null,
                detail.tags && detail.tags.length ? h('div', { class: 'cm-tags' }, detail.tags.map((tag) => h('button', { class: 'cm-tag', type: 'button', onclick: () => navigate(`tag/${tag}`) }, `#${tag}`))) : null,
                h('details', { class: 'cm-facts' },
                    h('summary', { text: t('details') }),
                    h('dl', {}, facts.map(([label, value]) => h('div', {}, h('dt', { text: label }), h('dd', { text: String(value) }))))),
                detail.is_mine ? ownerTools(detail) : null),
            published ? moreSection : null);
        if (moreFeed) moreFeed.start();
        return moreFeed;
    }

    function ownerTools(detail) {
        const remove = h('button', { class: 'cm-link is-danger', type: 'button' }, t('deleteAnimation'));
        remove.addEventListener('click', async () => {
            if (!(await confirmAction(t('deleteAnimationConfirm'), true))) return;
            try {
                await api('DELETE', `/v1/animations/${detail.id}`);
                state.views.clear();
                toast(t('deleted'), 'success');
                navigate(`u/${detail.owner.handle}`, { replace: true });
            } catch (error) {
                reportError(error);
            }
        });
        return h('div', { class: 'cm-owner-tools' }, remove);
    }

    // ------------------------------------------------------------------ modal + Turnstile

    function modal(title, body, { onClose } = {}) {
        const closeBtn = h('button', { class: 'cm-iconbtn', type: 'button', 'aria-label': t('close') }, icon('close'));
        const box = h('div', { class: 'cm-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('header', { class: 'cm-sheet-head' }, h('h3', { text: title }), closeBtn), body);
        const backdrop = h('div', { class: 'cm-modal' }, box);
        const close = () => {
            backdrop.remove();
            if (onClose) onClose();
        };
        closeBtn.addEventListener('click', close);
        backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
        backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
        state.root.append(backdrop);
        requestAnimationFrame(() => (box.querySelector('input, textarea, select') || closeBtn).focus());
        return { close, box };
    }

    let turnstileLoading = null;
    function loadTurnstile() {
        if (window.turnstile) return Promise.resolve(window.turnstile);
        if (!turnstileLoading) {
            turnstileLoading = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = TURNSTILE_SRC;
                script.async = true;
                script.onload = () => resolve(window.turnstile);
                script.onerror = () => {
                    turnstileLoading = null;
                    reject(new Error(t('errTurnstileLoad')));
                };
                document.head.append(script);
            });
        }
        return turnstileLoading;
    }

    // The anti-robot check; tokens are single use and fetched on demand.
    function robotCheck() {
        const slot = h('div', { class: 'cm-turnstile' });
        let widget = null;
        let token = '';
        const waiters = [];
        const ready = loadConfig().then((config) => loadTurnstile().then((ts) => {
            widget = ts.render(slot, {
                sitekey: config.turnstile_site_key,
                theme: 'dark',
                size: 'flexible',
                language: lang(),
                callback: (value) => { token = value; waiters.splice(0).forEach((resolve) => resolve(value)); },
                'expired-callback': () => { token = ''; },
                'error-callback': () => { token = ''; },
            });
        })).catch((error) => fill(slot, h('p', { class: 'cm-error', text: error.message })));
        return {
            el: slot,
            async token() {
                await ready;
                return token || new Promise((resolve) => waiters.push(resolve));
            },
            reset() {
                token = '';
                if (window.turnstile && widget !== null) window.turnstile.reset(widget);
            },
            remove() {
                if (window.turnstile && widget !== null) window.turnstile.remove(widget);
            },
        };
    }

    function reportDialog(targetType, targetId) {
        if (!state.me) return signIn(state.path);
        const categories = ['criminal', 'nudity', 'gore', 'violence', 'hate', 'uncredited', 'spam', 'other'];
        const list = h('div', { class: 'cm-options' }, categories.map((category) => h('label', { class: 'cm-option' },
            h('input', { type: 'radio', name: 'cm-report-category', value: category }),
            h('span', {}, h('strong', { text: t(`reportCat_${category}`) }), h('small', { text: t(`reportCatHint_${category}`) })))));
        const note = h('textarea', { class: 'cm-input', maxlength: '500', rows: '2', placeholder: t('reportNote') });
        const check = robotCheck();
        const send = h('button', { class: 'cm-btn is-primary is-wide', type: 'button' }, t('sendReport'));
        const dialog = modal(t('reportTitle'), h('div', { class: 'cm-form is-plain' }, h('p', { class: 'cm-muted', text: t('reportIntro') }), list, note, check.el, send), { onClose: () => check.remove() });
        send.addEventListener('click', async () => {
            const chosen = list.querySelector('input:checked');
            if (!chosen) return toast(t('reportChoose'), 'info');
            send.disabled = true;
            try {
                await api('POST', '/v1/reports', { json: { target_type: targetType, target_id: targetId, category: chosen.value, note: note.value, turnstile_token: await check.token() } });
                dialog.close();
                toast(t('reportSent'), 'success', 4200);
            } catch (error) {
                check.reset();
                reportError(error);
            } finally {
                send.disabled = false;
            }
        });
    }

    // ------------------------------------------------------------------ profiles

    function profileView(handle) {
        const el = h('section', { class: 'cm-profile' }, loading());
        const view = { el, title: `@${handle}` };
        let list = null;
        view.onLeave = () => { if (list) list.stop(); };
        api('GET', `/v1/users/${handle}`).then((profile) => {
            const isMe = !!state.me && state.me.handle === profile.handle;
            view.title = profile.display_name;
            if (state.current === view) setTitle(profile.display_name);
            const followersBtn = h('button', { class: 'cm-count', type: 'button', onclick: () => navigate(`u/${handle}/followers`) });
            const paintFollowers = (count) => fill(followersBtn, h('strong', { text: formatCount(count) }), h('span', { text: t('followers') }));
            paintFollowers(profile.followers);
            const banner = isMe && state.me.pending_banner_url ? state.me.pending_banner_url : profile.banner_url;
            const links = (profile.links || []).map(safeHttps).filter(Boolean);

            const listSlot = h('div');
            const showList = (mode) => {
                if (list) list.stop();
                list = mode === 'mine'
                    ? feed({ fetchPage: async () => ({ items: (await api('GET', '/v1/me/animations')).items, next_cursor: null }), render: myPin, empty: () => t('emptyMine') })
                    : feed({
                        fetchPage: (cursor, signal) => api('GET', `/v1/users/${handle}/animations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
                        empty: () => (isMe ? t('emptyMine') : t('emptyProfile')),
                    });
                fill(listSlot, list.el);
                list.start();
            };
            const segments = isMe ? h('div', { class: 'cm-chips is-segmented', role: 'tablist' }) : null;
            const paintSegments = (mode) => segments && fill(segments, ['published', 'mine'].map((id) => h('button', {
                class: 'cm-chip', type: 'button', role: 'tab', 'aria-selected': String(id === mode),
                onclick: () => { paintSegments(id); showList(id); },
            }, t(id === 'published' ? 'profilePublished' : 'myUploads'))));
            paintSegments('published');

            fill(el,
                h('div', { class: 'cm-cover' }, banner ? h('img', { src: banner, alt: '', decoding: 'async' }) : null),
                h('div', { class: 'cm-profile-head' },
                    avatar(isMe ? (state.me.pending_avatar_url || profile.avatar_url) : profile.avatar_url, 'xl'),
                    h('div', { class: 'cm-profile-actions' },
                        isMe
                            ? h('button', { class: 'cm-pill', type: 'button', onclick: () => navigate('me/edit') }, t('editProfile'))
                            : followButton(profile.handle, profile.followed_by_me, paintFollowers),
                        isMe ? null : h('button', { class: 'cm-iconbtn is-small', type: 'button', 'aria-label': t('report'), onclick: () => reportDialog('user', profile.handle) }, icon('flag')))),
                h('div', { class: 'cm-profile-names' },
                    h('h3', { text: profile.display_name }),
                    h('span', { class: 'cm-muted' }, `@${profile.handle}`, profile.role ? h('span', { class: 'cm-badge', text: t(`role_${profile.role}`) }) : null)),
                profile.bio ? h('p', { class: 'cm-text', text: profile.bio }) : null,
                links.length ? h('div', { class: 'cm-links' }, links.map((url) => {
                    const parsed = new URL(url);
                    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, (parsed.host + parsed.pathname).replace(/\/$/, ''));
                })) : null,
                h('div', { class: 'cm-counts' },
                    h('span', { class: 'cm-count' }, h('strong', { text: formatCount(profile.animations) }), h('span', { text: t('animationsLabel') })),
                    h('span', { class: 'cm-count' }, h('strong', { text: formatCount(profile.total_downloads) }), h('span', { text: t('downloadsLabel') })),
                    followersBtn,
                    h('button', { class: 'cm-count', type: 'button', onclick: () => navigate(`u/${handle}/following`) },
                        h('strong', { text: formatCount(profile.following) }), h('span', { text: t('followingLabel') }))),
                segments,
                listSlot);
            showList('published');
        }).catch((error) => fill(el, emptyState(error.message)));
        return view;
    }

    // "My uploads" pins also show the review status.
    function myPin(item) {
        const made = pin(item);
        if (item.status && item.status !== 'published') {
            made.el.querySelector('.cm-media').append(h('span', { class: `cm-status-pill is-${item.status}`, text: t(`status_${item.status}`) }));
        }
        return made;
    }

    function followListView(handle, which) {
        const list = feed({
            layout: 'list',
            fetchPage: (cursor, signal) => api('GET', `/v1/users/${handle}/${which}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
            render: (user) => h('button', { class: 'cm-row', type: 'button', onclick: () => navigate(`u/${user.handle}`) },
                avatar(user.avatar_url, 'md'),
                h('span', { class: 'cm-author-names' }, h('strong', { text: user.display_name }), h('small', { text: `@${user.handle}` }))),
            empty: () => t('emptyList'),
        });
        list.start();
        return { el: list.el, title: which === 'followers' ? t('followersTitle') : t('followingTitle'), onLeave: () => list.stop() };
    }

    // Resize + re-encode in the browser (also drops EXIF data such as GPS).
    async function prepareImage(file, { width, height }) {
        const bitmap = await createImageBitmap(file);
        let sx = 0;
        let sy = 0;
        let sw = bitmap.width;
        let sh = bitmap.height;
        const target = width / height;
        if (sw / sh > target) { sw = Math.round(sh * target); sx = Math.round((bitmap.width - sw) / 2); }
        else { sh = Math.round(sw / target); sy = Math.round((bitmap.height - sh) / 2); }
        const scale = Math.min(1, width / sw, height / sh);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        if (bitmap.close) bitmap.close();
        for (const [type, quality] of [['image/webp', 0.86], ['image/jpeg', 0.86]]) {
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
            if (blob && blob.type === type) return blob;
        }
        throw new Error(t('errImage'));
    }

    function field(label, control, hint) {
        return h('label', { class: 'cm-field' }, h('span', { class: 'cm-label', text: label }), control, hint ? h('small', { class: 'cm-muted', text: hint }) : null);
    }

    function editProfileView() {
        if (!state.token) return { el: signInPrompt(t('uploadSignIn')), title: t('editProfile') };
        const el = h('section', { class: 'cm-edit' }, loading());
        (state.me ? Promise.resolve(state.me) : loadMe()).then((me) => {
            if (!me) return fill(el, signInPrompt(t('uploadSignIn')));
            const name = h('input', { class: 'cm-input', maxlength: '40', value: me.display_name || '' });
            const bio = h('textarea', { class: 'cm-input', maxlength: '300', rows: '3' });
            bio.value = me.bio || '';
            const counter = h('small', { class: 'cm-muted' });
            const paintCounter = () => { counter.textContent = `${[...bio.value].length}/300`; };
            bio.addEventListener('input', paintCounter);
            paintCounter();
            const linkInputs = Array.from({ length: 4 }, (_, i) => h('input', { class: 'cm-input', type: 'url', inputmode: 'url', placeholder: 'https://', value: (me.links || [])[i] || '' }));

            const picker = (kind) => {
                const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
                const current = kind === 'avatar' ? (me.pending_avatar_url || me.avatar_url) : (me.pending_banner_url || me.banner_url);
                const pending = kind === 'avatar' ? me.pending_avatar_url : me.pending_banner_url;
                const trigger = h('button', { class: `cm-picker is-${kind}`, type: 'button', 'aria-label': kind === 'avatar' ? t('changeAvatar') : t('changeBanner'), onclick: () => input.click() },
                    kind === 'avatar' ? avatar(current, 'xl') : (current ? h('img', { src: current, alt: '' }) : null),
                    h('span', { class: 'cm-picker-label', text: kind === 'avatar' ? t('changeAvatar') : t('changeBanner') }));
                input.addEventListener('change', async () => {
                    const file = input.files && input.files[0];
                    input.value = '';
                    if (!file) return;
                    trigger.disabled = true;
                    trigger.classList.add('is-busy');
                    try {
                        const blob = await prepareImage(file, kind === 'avatar' ? { width: 512, height: 512 } : { width: 1500, height: 500 });
                        await api('PUT', `/v1/me/${kind}`, { body: blob, headers: { 'Content-Type': blob.type } });
                        await loadMe();
                        toast(t('imageSent'), 'success', 4200);
                        route('me/edit', { force: true });
                    } catch (error) {
                        reportError(error);
                        trigger.disabled = false;
                        trigger.classList.remove('is-busy');
                    }
                });
                return h('div', { class: 'cm-picker-wrap' }, trigger, input, pending ? h('small', { class: 'cm-pending', text: t('pendingImage') }) : null);
            };

            const save = h('button', { class: 'cm-btn is-primary is-wide', type: 'button' }, t('save'));
            save.addEventListener('click', async () => {
                const progress = busy(save, t('saving'));
                try {
                    state.me = await api('PATCH', '/v1/me', { json: {
                        display_name: name.value,
                        bio: bio.value,
                        links: linkInputs.map((input) => input.value.trim()).filter(Boolean),
                    } });
                    renderChrome();
                    state.views.clear();
                    toast(t('saved'), 'success');
                    navigate(`u/${me.handle}`, { replace: true });
                } catch (error) {
                    reportError(error);
                } finally {
                    progress.done();
                }
            });

            const confirmInput = h('input', { class: 'cm-input', placeholder: me.handle, autocomplete: 'off', autocapitalize: 'off' });
            const remove = h('button', { class: 'cm-btn is-danger is-wide', type: 'button' }, t('deleteAccount'));
            remove.addEventListener('click', async () => {
                if (confirmInput.value.trim().toLowerCase() !== me.handle) return toast(t('deleteAccountType'), 'info', 4200);
                if (!(await confirmAction(t('deleteAccountConfirm'), true))) return;
                try {
                    await api('DELETE', '/v1/me', { json: { confirm: me.handle } });
                    clearSession();
                    state.views.clear();
                    toast(t('accountDeleted'), 'success', 4200);
                    navigate('explore', { replace: true });
                } catch (error) {
                    reportError(error);
                }
            });
            const logout = h('button', { class: 'cm-btn is-wide', type: 'button' }, t('signOut'));
            logout.addEventListener('click', async () => {
                try { await api('POST', '/v1/auth/logout'); } catch (error) { /* the local session ends anyway */ }
                clearSession();
                state.views.clear();
                navigate('explore', { replace: true });
            });

            fill(el,
                h('div', { class: 'cm-edit-media' }, picker('banner'), picker('avatar')),
                h('div', { class: 'cm-form' },
                    field(t('displayName'), name),
                    h('label', { class: 'cm-field' }, h('span', { class: 'cm-label' }, t('bio'), ' ', counter), bio),
                    h('div', { class: 'cm-field' }, h('span', { class: 'cm-label', text: t('links') }), linkInputs),
                    h('p', { class: 'cm-fine', text: t('profileReviewNote') }),
                    save),
                h('div', { class: 'cm-form is-danger-zone' },
                    h('h4', { class: 'cm-section-title', text: t('account') }),
                    logout,
                    h('p', { class: 'cm-fine', text: t('deleteAccountHint') }),
                    confirmInput,
                    remove));
        });
        return { el, title: t('editProfile') };
    }

    // ------------------------------------------------------------------ upload

    async function inspectZip(file) {
        if (file.size > MAX_ZIP) throw new Error(t('errTooLarge'));
        if (typeof JSZip === 'undefined') throw new Error(t('errGeneric'));
        const zip = await JSZip.loadAsync(file);
        if (typeof validateBootAnimationArchiveSafety === 'function') validateBootAnimationArchiveSafety(zip);
        if (typeof detectBootAnimationArchiveFormat === 'function' && detectBootAnimationArchiveFormat(zip) !== 'aosp-frames') {
            throw new Error(t('errFormat'));
        }
        const desc = zip.file('desc.txt');
        if (!desc) throw new Error(t('errFormat'));
        const [width, height, fps] = (await desc.async('string')).split(/\r?\n/)[0].trim().split(/\s+/).map(Number);
        if (!(width > 0 && height > 0 && fps > 0)) throw new Error(t('errFormat'));
        const frames = Object.keys(zip.files).filter((name) => /\/[^/]+\.(png|jpe?g)$/i.test(name)).sort();
        const thumb = frames.length ? URL.createObjectURL(await zip.file(frames[0]).async('blob')) : null;
        return { width, height, fps, frames: frames.length, thumb };
    }

    async function sha256Hex(bytes) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    function putWithProgress(url, bytes, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url);
            xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
            xhr.setRequestHeader('Content-Type', 'application/zip');
            xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
            xhr.onload = () => {
                let body = null;
                try { body = JSON.parse(xhr.responseText); } catch (error) { /* ignore */ }
                if (xhr.status >= 200 && xhr.status < 300) resolve(body);
                else {
                    const err = (body && body.error) || {};
                    reject(new ApiError(xhr.status, err.code, errorText(err.code, err.message, err.details), err.details));
                }
            };
            xhr.onerror = () => reject(new ApiError(0, 'network', t('errNetwork')));
            xhr.send(bytes);
        });
    }

    // Tag field: typed words become removable chips (Enter, comma or space).
    function tagInput(max = 8) {
        const tags = [];
        const input = h('input', { class: 'cm-tag-entry', placeholder: t('tagsPlaceholder'), autocapitalize: 'off', enterkeyhint: 'done', maxlength: '24' });
        const box = h('div', { class: 'cm-tagbox', onclick: () => input.focus() });
        const normalize = (raw) => raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
        const paint = () => fill(box, tags.map((tag, index) => h('span', { class: 'cm-tag is-removable' }, `#${tag}`,
            h('button', { type: 'button', 'aria-label': t('removeTag', { tag }), onclick: (event) => { event.stopPropagation(); tags.splice(index, 1); paint(); input.focus(); } }, icon('close', 'cm-icon-xs')))),
        tags.length < max ? input : null);
        const commit = () => {
            const tag = normalize(input.value);
            input.value = '';
            if (tag && !tags.includes(tag) && tags.length < max) tags.push(tag);
            paint();
            input.focus();
        };
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === ' ') { event.preventDefault(); commit(); }
            else if (event.key === 'Backspace' && !input.value && tags.length) { tags.pop(); paint(); input.focus(); }
        });
        input.addEventListener('input', () => { if (/[,\s]/.test(input.value)) commit(); });
        input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
        paint();
        return { el: box, values: () => (input.value.trim() ? [...tags, normalize(input.value)].filter(Boolean) : tags.slice()).slice(0, max) };
    }

    // A small segmented control; returns {el, value()}.
    function segmented(options, initial, onChange) {
        let value = initial;
        const el = h('div', { class: 'cm-segmented', role: 'radiogroup' });
        const paint = () => fill(el, options.map(([id, label]) => h('button', {
            type: 'button', role: 'radio', 'aria-checked': String(id === value),
            onclick: () => { if (value === id) return; value = id; paint(); if (onChange) onChange(id); },
        }, label)));
        paint();
        return { el, value: () => value };
    }

    function uploadView() {
        if (!state.token) return { el: signInPrompt(t('uploadSignIn')), title: t('navUpload') };
        let remixSource = null;
        try { remixSource = JSON.parse(sessionStorage.getItem(REMIX_KEY) || 'null'); } catch (error) { /* ignore */ }
        let chosen = null;

        // 1. The file: one big card that becomes the preview.
        const fileInput = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
        const fileCard = h('button', { class: 'cm-create-file', type: 'button', onclick: () => fileInput.click() });
        const paintEmpty = (error) => fill(fileCard,
            h('span', { class: 'cm-create-file-icon' }, icon('upload', 'cm-icon-lg')),
            h('strong', { text: t('pickZip') }),
            h('small', { text: t('pickZipHint') }),
            error ? h('span', { class: 'cm-error', text: error }) : null);
        paintEmpty();
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            fileCard.classList.add('is-busy');
            fill(fileCard, h('span', { class: 'cm-spinner' }), h('small', { text: t('checkingZip') }));
            try {
                const info = await inspectZip(file);
                chosen = { file, info, bytes: await file.arrayBuffer() };
                fileCard.classList.add('has-file');
                fill(fileCard,
                    info.thumb ? h('img', { class: 'cm-create-thumb', src: info.thumb, alt: '' }) : null,
                    h('span', { class: 'cm-create-filebar' },
                        h('span', { class: 'cm-create-fileinfo' },
                            h('strong', { text: file.name }),
                            h('small', { text: `${info.width} × ${info.height} · ${info.fps} fps · ${formatCount(info.frames)} ${t('framesWord')} · ${formatBytes(file.size)}` })),
                        h('span', { class: 'cm-pill', text: t('change') })));
                if (!title.value) title.value = file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 60);
            } catch (error) {
                chosen = null;
                fileCard.classList.remove('has-file');
                paintEmpty(error.message);
            } finally {
                fileCard.classList.remove('is-busy');
                paintSubmit();
            }
        });

        // 2. Title, description, tags.
        const title = h('input', { class: 'cm-create-title', maxlength: '60', placeholder: t('titlePlaceholder'), 'aria-label': t('fieldTitle') });
        const description = h('textarea', { class: 'cm-create-desc', maxlength: '1000', rows: '2', placeholder: t('descriptionPlaceholder'), 'aria-label': t('fieldDescription') });
        const grow = () => { description.style.height = 'auto'; description.style.height = `${Math.min(220, description.scrollHeight)}px`; };
        description.addEventListener('input', grow);
        const tags = tagInput();

        // 3. Credits: who made the boot animation, and who made the art in it.
        const otherName = h('input', { class: 'cm-input', maxlength: '80', placeholder: t('creditOtherPlaceholder'), hidden: true });
        const who = segmented([['self', t('creditSelf')], ['other', t('creditOther')]], 'self', (value) => {
            otherName.hidden = value !== 'other';
            if (value === 'other') otherName.focus();
        });
        const art = h('input', { class: 'cm-input', maxlength: '160', placeholder: t('creditArtPlaceholder') });
        const remixToggle = remixSource ? h('input', { type: 'checkbox', checked: true }) : null;

        // 4. License: chips with the meaning of the chosen one underneath.
        const licenseHint = h('small', { class: 'cm-muted' });
        const license = segmented(LICENSES.map((id) => [id, t(`licenseShort_${id.replace(/[^a-z0-9]/g, '_')}`)]), 'cc-by-4.0', (id) => {
            licenseHint.textContent = licenseLabel(id);
        });
        license.el.classList.add('is-scroll');
        licenseHint.textContent = licenseLabel('cc-by-4.0');

        // 5. Rules, anti-robot check, publish.
        const rules = h('input', { type: 'checkbox' });
        const check = robotCheck();
        const submit = h('button', { class: 'cm-btn is-primary is-wide', type: 'button' }, t('publish'));
        const bar = h('span');
        const progress = h('div', { class: 'cm-progress', hidden: true }, bar);
        const paintSubmit = () => { submit.disabled = !chosen; };
        paintSubmit();

        submit.addEventListener('click', async () => {
            if (!chosen) return;
            if (!title.value.trim()) { title.focus(); return toast(t('needTitle'), 'info'); }
            if (who.value() === 'other' && !otherName.value.trim()) { otherName.focus(); return toast(t('needCreditOther'), 'info', 4200); }
            if (!rules.checked) return toast(t('acceptRules'), 'info', 4200);
            submit.disabled = true;
            progress.hidden = false;
            bar.style.width = '0%';
            const label = busy(submit, t('preparing'));
            try {
                const draft = await api('POST', '/v1/animations', { json: {
                    title: title.value,
                    description: description.value,
                    tags: tags.values(),
                    license: license.value(),
                    credits: { animation_by: who.value() === 'self' ? 'self' : otherName.value, art_by: art.value },
                    remix_of: remixToggle && remixToggle.checked ? remixSource.id : undefined,
                    sha256: await sha256Hex(chosen.bytes),
                    size_bytes: chosen.bytes.byteLength,
                    turnstile_token: await check.token(),
                } });
                // The bytes already read and hashed are sent as they are.
                await putWithProgress(draft.upload_url, chosen.bytes, (fraction) => {
                    bar.style.width = `${Math.round(fraction * 100)}%`;
                    label.progress(fraction);
                });
                try { sessionStorage.removeItem(REMIX_KEY); } catch (error) { /* ignore */ }
                state.views.clear();
                toast(t('uploaded'), 'success', 6000);
                navigate(`a/${draft.id}`, { replace: true });
            } catch (error) {
                check.reset();
                reportError(error);
                if (error.code === 'duplicate' && error.details && error.details.id) navigate(`a/${error.details.id}`);
            } finally {
                label.done();
                paintSubmit();
                progress.hidden = true;
            }
        });

        const group = (titleText, hint, ...body) => h('section', { class: 'cm-group' },
            h('h3', { class: 'cm-group-title', text: titleText }), hint ? h('p', { class: 'cm-group-hint', text: hint }) : null, body);

        const el = h('section', { class: 'cm-create' },
            h('div', { class: 'cm-create-top' }, fileCard, fileInput,
                h('div', { class: 'cm-create-text' }, title, description)),
            group(t('fieldTags'), t('tagsHint'), tags.el),
            group(t('creditsTitle'), null,
                h('div', { class: 'cm-credit-card' },
                    h('strong', { text: t('creditWhoTitle') }),
                    h('small', { class: 'cm-muted', text: t('creditWhoHint') }),
                    who.el, otherName),
                h('div', { class: 'cm-credit-card' },
                    h('strong', { text: t('creditArtTitle') }),
                    h('small', { class: 'cm-muted', text: t('creditArtHint') }),
                    art),
                remixToggle ? h('label', { class: 'cm-credit-card is-check' }, remixToggle,
                    h('span', { text: t('isRemix', { title: remixSource.title, owner: remixSource.owner }) })) : null),
            group(t('fieldLicense'), null, license.el, licenseHint),
            group(t('rulesTitle'), null,
                h('ul', { class: 'cm-rule-list' }, ['rule1', 'rule2', 'rule3', 'rule4'].map((key) => h('li', {}, icon('panel', 'cm-icon-xs'), h('span', { text: t(key) })))),
                h('label', { class: 'cm-check' }, rules, h('span', { text: t('rulesAccept') }))),
            check.el,
            h('p', { class: 'cm-fine', text: t('reviewNote') }),
            h('div', { class: 'cm-create-footer' }, progress, submit));
        return { el, title: t('navUpload'), onLeave: () => check.remove() };
    }

    // ------------------------------------------------------------------ open / close

    async function open(options = {}) {
        if (!state.root) buildShell();
        state.open = true;
        state.root.hidden = false;
        document.body.classList.add('cm-open');
        let path = options.path ? options.path.replace(/^community\/?/, '') : null;
        if (!state.meLoaded) await loadMe();
        if (options.incoming) path = await handleIncoming(options.incoming);
        navigate(path || state.path || 'explore', { replace: true });
        requestAnimationFrame(() => state.main.focus({ preventScroll: true }));
    }

    // Shared with panel.js.
    const kit = Object.freeze({
        h, fill, t, icon, api, navigate, toast, reportError, avatar, media, loading, emptyState,
        formatCount, formatDate, formatBytes, confirmAction, fetchVerified, state, API, modal,
    });

    window.BASCommunity = Object.freeze({ open, close: closeCommunity, isOpen: () => state.open, kit });
})();
