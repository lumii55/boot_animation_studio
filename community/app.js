// Boot Animation Studio — Community (loaded on demand by js/community-entry.js).
//
// Rules for this file:
//   * user content is only ever inserted with textContent / attributes (never innerHTML);
//   * the feed keeps its DOM between navigations, so going back is instant and keeps the scroll;
//   * animated previews only play while visible; lists load page by page.
(function () {
    'use strict';

    const API = 'https://bas-community.bootanimstudio.workers.dev';
    const TOKEN_KEY = 'bas.community.session';
    const REMIX_KEY = 'bas.community.remix';
    const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    const MAX_ZIP = 50 * 1024 * 1024;

    // ---------------------------------------------------------------- strings

    function t(key, vars) {
        const all = window.BASCommunityStrings || {};
        const lang = typeof idiomaAtual === 'string' ? idiomaAtual : 'en';
        let text = (all[lang] && all[lang][key]) || (all.en && all.en[key]) || key;
        if (vars) for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
        return text;
    }

    const numberFormat = () => new Intl.NumberFormat(typeof idiomaAtual === 'string' ? idiomaAtual : 'en', { notation: 'compact', maximumFractionDigits: 1 });
    const formatCount = (value) => numberFormat().format(Number(value) || 0);
    function formatBytes(bytes) {
        const mb = bytes / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    function formatDate(ms) {
        try { return new Date(ms).toLocaleDateString(typeof idiomaAtual === 'string' ? idiomaAtual : 'en', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (error) { return ''; }
    }

    // ---------------------------------------------------------------- DOM

    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === null || value === undefined || value === false) continue;
            if (key === 'class') el.className = value;
            else if (key === 'text') el.textContent = value;
            else if (key === 'dataset') Object.assign(el.dataset, value);
            else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
            else el.setAttribute(key, value === true ? '' : String(value));
        }
        for (const child of children.flat(Infinity)) {
            if (child === null || child === undefined || child === false) continue;
            el.append(child instanceof Node ? child : String(child));
        }
        return el;
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

    // ---------------------------------------------------------------- state

    const state = {
        token: readToken(),
        me: null,
        meLoaded: false,
        config: null,
        root: null,
        main: null,
        titleEl: null,
        backBtn: null,
        userSlot: null,
        open: false,
        path: 'feed/trending',
        views: new Map(),     // kept-alive views (feeds): path -> {el, scroll}
        current: null,
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
        renderUserSlot();
    }

    const isMod = () => !!state.me && (state.me.role === 'moderator' || state.me.role === 'owner');

    // ---------------------------------------------------------------- API

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
        if (!state.token) {
            state.me = null;
            state.meLoaded = true;
            renderUserSlot();
            return null;
        }
        try {
            state.me = await api('GET', '/v1/me');
        } catch (error) {
            if (error.status !== 401) reportError(error);
            state.me = null;
        }
        state.meLoaded = true;
        renderUserSlot();
        return state.me;
    }

    async function loadConfig() {
        if (!state.config) state.config = await api('GET', '/v1/config');
        return state.config;
    }

    // ---------------------------------------------------------------- sign-in

    function signIn(returnPath) {
        const back = `#community/${returnPath || state.path}`.slice(0, 100).replace(/[^A-Za-z0-9/_#-]/g, '');
        location.href = `${API}/v1/auth/github/start?return=${encodeURIComponent(back)}`;
    }

    async function handleIncoming(hash) {
        const params = new URLSearchParams(hash.slice(1));
        history.replaceState(null, '', location.pathname + location.search);
        const failure = params.get('bas-auth-error');
        if (failure) {
            toast(t(`authError_${failure}`) !== `authError_${failure}` ? t(`authError_${failure}`) : t('authError_github'), 'error', 5200);
            return 'feed/trending';
        }
        const grant = params.get('bas-auth');
        const to = (params.get('to') || '#community').replace(/^#community\/?/, '') || 'feed/trending';
        try {
            const session = await api('POST', '/v1/auth/exchange', { json: { grant } });
            saveToken(session.token, session.expires_at);
            await loadMe();
            toast(t('signedIn', { name: state.me ? state.me.display_name : '' }), 'success');
        } catch (error) {
            reportError(error);
        }
        return to;
    }

    // ---------------------------------------------------------------- shell

    function buildShell() {
        state.backBtn = h('button', { class: 'community-icon-btn', type: 'button', 'aria-label': t('back'), onclick: () => history.back() }, '‹');
        state.titleEl = h('h2', { class: 'community-title', id: 'community-title' });
        state.userSlot = h('div', { class: 'community-user-slot' });
        const close = h('button', { class: 'community-icon-btn', type: 'button', 'aria-label': t('close'), onclick: () => close_() }, '×');
        state.nav = h('nav', { class: 'community-nav', 'aria-label': t('title') });
        state.main = h('main', { class: 'community-main', id: 'community-main', tabindex: '-1' });
        const shell = h('div', { class: 'community-shell', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'community-title' },
            h('header', { class: 'community-top' },
                state.backBtn,
                h('div', { class: 'community-title-wrap' }, h('span', { class: 'community-kicker', text: t('kicker') }), state.titleEl),
                state.userSlot,
                close,
            ),
            state.nav,
            state.main,
        );
        state.root = h('div', { class: 'community-overlay', hidden: true }, shell);
        document.body.append(state.root);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.open && !document.querySelector('.community-modal')) close_();
        });
        window.addEventListener('popstate', () => {
            if (!state.open) return;
            const hash = location.hash || '';
            if (hash.startsWith('#community')) route(hash.replace(/^#community\/?/, '') || 'feed/trending', { fromHistory: true });
            else hide();
        });
        window.addEventListener('bas:languagechange', () => {
            if (!state.open) return;
            state.views.clear();
            renderNav();
            renderUserSlot();
            route(state.path, { fromHistory: true, force: true });
        });
    }

    function renderNav() {
        const items = [
            ['feed/trending', t('navTrending')],
            ['feed/top', t('navTop')],
            ['feed/new', t('navNew')],
            ['feed/following', t('navFollowing')],
            ['upload', t('navUpload')],
        ];
        if (isMod()) items.push(['mod/mass', t('navPanel')]);
        const buttons = items.map(([path, label]) => h('button', {
            type: 'button',
            class: 'community-nav-btn',
            'aria-current': state.path.startsWith(path.split('/')[0] === 'mod' ? 'mod' : path) ? 'page' : null,
            dataset: { path },
            onclick: () => navigate(path),
        }, label));
        state.nav.replaceChildren(...buttons);
        const active = buttons.find((button) => button.getAttribute('aria-current') === 'page');
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function renderUserSlot() {
        if (!state.userSlot) return;
        if (!state.meLoaded) {
            state.userSlot.replaceChildren();
            return;
        }
        if (!state.me) {
            state.userSlot.replaceChildren(h('button', { class: 'community-btn community-btn-primary community-signin', type: 'button', onclick: () => signIn() }, t('signIn')));
            return;
        }
        state.userSlot.replaceChildren(h('button', { class: 'community-me', type: 'button', onclick: () => navigate(`u/${state.me.handle}`), 'aria-label': t('myProfile') },
            avatar(state.me.pending_avatar_url || state.me.avatar_url, 'sm'),
            h('span', { class: 'community-me-name', text: state.me.display_name }),
        ));
        renderNav();
    }

    function avatar(url, size = 'md') {
        const src = url && (url.startsWith(API) || safeHttps(url)) ? url : null;
        const empty = () => h('span', { class: `community-avatar community-avatar-${size} community-avatar-empty`, 'aria-hidden': 'true' });
        if (!src) return empty();
        const img = h('img', { class: `community-avatar community-avatar-${size}`, src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => img.replaceWith(empty()), { once: true });
        return img;
    }

    function setTitle(text) {
        state.titleEl.textContent = text;
    }

    function close_() {
        if (location.hash.startsWith('#community')) history.replaceState(null, '', location.pathname + location.search);
        hide();
    }

    function hide() {
        state.open = false;
        state.root.hidden = true;
        document.body.classList.remove('community-open');
        previews.pauseAll();
    }

    // ---------------------------------------------------------------- routing

    function navigate(path, { replace = false } = {}) {
        const hash = `#community/${path}`;
        if (replace) history.replaceState({ community: true }, '', hash);
        else if (location.hash !== hash) history.pushState({ community: true }, '', hash);
        route(path);
    }

    const ROUTES = [
        [/^feed\/(trending|top|new|following)$/, (m) => feedView(m[1])],
        [/^tag\/([a-z0-9-]{1,24})$/, (m) => feedView('trending', { tag: m[1] })],
        [/^a\/([A-Za-z0-9_-]{16})$/, (m) => animationView(m[1])],
        [/^u\/([a-z0-9-]{1,39})$/, (m) => profileView(m[1])],
        [/^u\/([a-z0-9-]{1,39})\/(followers|following)$/, (m) => followListView(m[1], m[2])],
        [/^me\/edit$/, () => editProfileView()],
        [/^me\/uploads$/, () => myUploadsView()],
        [/^upload$/, () => uploadView()],
        [/^mod(?:\/(.*))?$/, (m) => window.BASCommunityPanel ? window.BASCommunityPanel.view(m[1] || 'mass', kit) : notFoundView()],
    ];

    function route(path, { fromHistory = false, force = false } = {}) {
        if (state.current && state.current.keepAlive) {
            state.views.set(state.path, { el: state.current.el, scroll: state.main.scrollTop, view: state.current });
        }
        if (state.current && state.current.onLeave) state.current.onLeave();
        state.path = path;
        renderNav();
        state.backBtn.hidden = history.length <= 1 || /^feed\//.test(path);

        const kept = !force && state.views.get(path);
        if (kept) {
            state.current = kept.view;
            state.main.replaceChildren(kept.el);
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
        setTitle(view.title || t('title'));
        state.main.replaceChildren(view.el);
        if (!fromHistory || !kept) state.main.scrollTop = 0;
        if (view.onEnter) view.onEnter();
    }

    function notFoundView() {
        return { title: t('title'), el: h('div', { class: 'community-empty' }, t('notFound')) };
    }

    // ---------------------------------------------------------------- previews (play only while visible)

    // The observer is created lazily: its root is the Community scroll area, so "visible" means visible there.
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
            }, { root: state.main, rootMargin: '300px 0px' });
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

    function previewImage(url, width, height, cls = 'community-preview') {
        const box = h('div', { class: `${cls}-box`, style: width && height ? `aspect-ratio:${width}/${height}` : null });
        if (url) {
            const img = h('img', { class: cls, alt: '', decoding: 'async', dataset: { src: url } });
            img.addEventListener('load', () => box.classList.add('is-loaded'));
            box.append(img);
            previews.watch(img);
        } else {
            box.append(h('span', { class: 'community-preview-placeholder', text: t('noPreview') }));
        }
        return box;
    }

    function stars(average) {
        const value = Number(average) || 0;
        return h('span', { class: 'community-stars', 'aria-label': t('ratingAria', { value: value.toFixed(1) }) },
            h('span', { class: 'community-stars-fill', style: `width:${Math.max(0, Math.min(100, value * 20))}%` }));
    }

    // ---------------------------------------------------------------- cards and lists

    function card(item) {
        const el = h('button', { class: 'community-card', type: 'button', onclick: () => navigate(`a/${item.id}`) },
            previewImage(item.preview_url, item.width, item.height),
            h('div', { class: 'community-card-body' },
                h('strong', { class: 'community-card-title', text: item.title }),
                h('span', { class: 'community-card-owner' }, avatar(item.owner.avatar_url, 'xs'), h('span', { text: item.owner.display_name })),
                h('span', { class: 'community-card-meta' },
                    item.rating.count ? [stars(item.rating.average), h('span', { text: `${item.rating.average} (${formatCount(item.rating.count)})` })] : h('span', { class: 'community-muted', text: t('noRatings') }),
                    h('span', { class: 'community-dot', 'aria-hidden': 'true' }, '·'),
                    h('span', { text: t('downloadsCount', { count: formatCount(item.downloads) }) }),
                ),
            ),
        );
        return el;
    }

    function skeletonCards(count = 8) {
        return Array.from({ length: count }, () => h('div', { class: 'community-card community-skeleton', 'aria-hidden': 'true' },
            h('div', { class: 'community-preview-box' }), h('div', { class: 'community-card-body' }, h('i'), h('i'))));
    }

    // Paged list with a sentinel: loads the next page when it gets close to the screen.
    function pagedGrid({ fetchPage, renderItem, empty, gridClass = 'community-grid' }) {
        const grid = h('div', { class: gridClass, 'aria-busy': 'true' });
        const sentinel = h('div', { class: 'community-sentinel', 'aria-hidden': 'true' });
        const status = h('div', { class: 'community-list-status' });
        const wrap = h('div', { class: 'community-list' }, grid, status, sentinel);
        let cursor = null;
        let done = false;
        let loading = false;
        let controller = null;
        let first = true;

        async function more() {
            if (loading || done) return;
            loading = true;
            controller = new AbortController();
            if (first) grid.replaceChildren(...skeletonCards());
            status.replaceChildren();
            try {
                const page = await fetchPage(cursor, controller.signal);
                if (first) grid.replaceChildren();
                first = false;
                const fragment = document.createDocumentFragment();
                for (const item of page.items) fragment.append(renderItem(item));
                grid.append(fragment);
                cursor = page.next_cursor || null;
                done = !cursor;
                if (done && !grid.childElementCount) status.replaceChildren(h('div', { class: 'community-empty' }, empty()));
            } catch (error) {
                if (error.name === 'AbortError') return;
                if (first) grid.replaceChildren();
                status.replaceChildren(h('div', { class: 'community-empty' },
                    h('p', { text: error.message || t('errGeneric') }),
                    h('button', { class: 'community-btn', type: 'button', onclick: () => more() }, t('retry'))));
            } finally {
                loading = false;
                grid.setAttribute('aria-busy', 'false');
                if (!done) requestAnimationFrame(checkSentinel);
            }
        }

        const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) more();
        }, { root: state.main, rootMargin: '800px 0px' }) : null;

        function checkSentinel() {
            if (!observer && !done) more();
        }

        return {
            el: wrap,
            start() {
                if (observer) observer.observe(sentinel);
                more();
            },
            stop() {
                if (controller) controller.abort();
                if (observer) observer.disconnect();
            },
        };
    }

    // ---------------------------------------------------------------- feed

    function deviceResolution() {
        try {
            const profile = window.BASDeviceProfile;
            const res = (profile && (profile.getLiveResolution() || profile.getResolution())) || null;
            return res && res.width && res.height ? `${res.width}x${res.height}` : null;
        } catch (error) {
            return null;
        }
    }

    function feedView(feed, { tag = null } = {}) {
        const filters = { q: '', res: null };
        const res = deviceResolution();
        const search = h('input', { class: 'community-search', type: 'search', placeholder: t('searchPlaceholder'), 'aria-label': t('searchPlaceholder'), maxlength: '60' });
        const compat = res ? h('button', { class: 'community-chip', type: 'button', 'aria-pressed': 'false' }, t('compatible', { res: res.replace('x', '×') })) : null;
        const listSlot = h('div');
        const head = h('div', { class: 'community-feed-head' },
            tag ? h('span', { class: 'community-chip is-static', text: `#${tag}` }) : null,
            search,
            compat,
        );
        const fab = h('button', { class: 'community-fab', type: 'button', onclick: () => navigate('upload') }, h('span', { 'aria-hidden': 'true' }, '+'), t('navUpload'));
        const el = h('section', { class: 'community-feed' }, head, listSlot, fab);
        let list = null;

        function rebuild() {
            if (list) list.stop();
            if (feed === 'following' && !state.token) {
                listSlot.replaceChildren(signInPrompt(t('followingSignIn')));
                return;
            }
            list = pagedGrid({
                fetchPage: (cursor, signal) => {
                    const params = new URLSearchParams({ feed });
                    if (tag) params.set('tag', tag);
                    if (filters.q) params.set('q', filters.q);
                    if (filters.res) params.set('res', filters.res);
                    if (cursor) params.set('cursor', cursor);
                    return api('GET', `/v1/animations?${params}`, { signal });
                },
                renderItem: card,
                empty: () => (filters.q || filters.res || tag ? t('emptyFiltered') : feed === 'following' ? t('emptyFollowing') : t('emptyFeed')),
            });
            listSlot.replaceChildren(list.el);
            list.start();
        }

        let debounce = 0;
        search.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                const value = search.value.trim();
                if (value === filters.q) return;
                filters.q = value;
                rebuild();
            }, 300);
        });
        if (compat) {
            compat.addEventListener('click', () => {
                filters.res = filters.res ? null : res;
                compat.setAttribute('aria-pressed', String(!!filters.res));
                rebuild();
            });
        }
        rebuild();
        const titles = { trending: t('navTrending'), top: t('navTop'), new: t('navNew'), following: t('navFollowing') };
        return { el, title: tag ? `#${tag}` : titles[feed], keepAlive: true };
    }

    function signInPrompt(message) {
        return h('div', { class: 'community-empty' },
            h('p', { text: message }),
            h('button', { class: 'community-btn community-btn-primary', type: 'button', onclick: () => signIn() }, t('signInGithub')),
            h('p', { class: 'community-fineprint', text: t('signInPrivacy') }));
    }

    // ---------------------------------------------------------------- animation detail

    async function fetchVerified(detail, onProgress) {
        const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
        const response = await fetch(detail.download_url, { headers });
        if (!response.ok) throw new ApiError(response.status, 'download', t('errDownload'));
        const total = Number(response.headers.get('Content-Length')) || detail.size_bytes;
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            if (onProgress) onProgress(received / total);
        }
        const blob = new Blob(chunks, { type: 'application/zip' });
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
        if (hex !== detail.sha256) throw new ApiError(0, 'integrity', t('errIntegrity'));
        return blob;
    }

    function busyButton(button, labelWhileBusy) {
        const original = button.textContent;
        button.disabled = true;
        button.textContent = labelWhileBusy;
        return {
            progress(fraction) { button.textContent = `${labelWhileBusy} ${Math.round(fraction * 100)}%`; },
            done() { button.disabled = false; button.textContent = original; },
        };
    }

    function fileNameFor(detail) {
        const slug = detail.title.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'animation';
        return `${slug}-bootanimation.zip`;
    }

    async function downloadAnimation(detail, button) {
        const busy = busyButton(button, t('downloading'));
        try {
            const blob = await fetchVerified(detail, busy.progress);
            if (window.BASExport && window.BASExport.downloadBlob) window.BASExport.downloadBlob(blob, fileNameFor(detail));
        } catch (error) {
            reportError(error);
        } finally {
            busy.done();
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
        const busy = busyButton(button, t('installing'));
        try {
            const blob = await fetchVerified(detail, busy.progress);
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
            busy.done();
        }
    }

    async function openInStudio(detail, button) {
        if (typeof abrirZipNoEditor !== 'function') return;
        if (!(await confirmAction(t('openConfirm')))) return;
        const busy = busyButton(button, t('downloading'));
        try {
            const blob = await fetchVerified(detail, busy.progress);
            try { sessionStorage.setItem(REMIX_KEY, JSON.stringify({ id: detail.id, title: detail.title, owner: detail.owner.handle })); } catch (error) { /* ignore */ }
            close_();
            if (window.BASModuleWorkspace && window.BASModuleWorkspace.isOpen && window.BASModuleWorkspace.isOpen()) window.BASModuleWorkspace.leave();
            await abrirZipNoEditor(blob);
            toast(t('openedInStudio'), 'success', 4200);
        } catch (error) {
            reportError(error);
        } finally {
            busy.done();
        }
    }

    function starInput(detail, onChange) {
        const wrap = h('div', { class: 'community-star-input', role: 'radiogroup', 'aria-label': t('yourRating') });
        function paint(value) {
            wrap.querySelectorAll('button').forEach((button, index) => {
                button.classList.toggle('is-on', index < value);
                button.setAttribute('aria-checked', String(index + 1 === value));
            });
        }
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
            }, '★'));
        }
        paint(detail.my_rating || 0);
        return wrap;
    }

    function followButton(handle, following, onChange) {
        const button = h('button', { class: 'community-btn', type: 'button' });
        let current = !!following;
        const paint = () => {
            button.textContent = current ? t('following') : t('follow');
            button.classList.toggle('community-btn-primary', !current);
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
                state.views.delete('feed/following');
            } catch (error) {
                current = !current;
                paint();
                reportError(error);
            }
        });
        return button;
    }

    function animationView(id) {
        const el = h('section', { class: 'community-detail' }, h('div', { class: 'community-loading', text: t('loading') }));
        const view = { el, title: t('title') };
        api('GET', `/v1/animations/${id}`).then((detail) => {
            view.title = detail.title;
            if (state.current === view) setTitle(detail.title);
            renderDetail(el, detail);
        }).catch((error) => {
            el.replaceChildren(h('div', { class: 'community-empty' }, error.message));
        });
        return view;
    }

    function renderDetail(el, detail) {
        // `status` is only sent to the uploader and to moderators; everyone else only ever sees published items.
        const published = !detail.status || detail.status === 'published';
        const ratingLine = h('div', { class: 'community-rating-line' });
        const paintRating = () => {
            ratingLine.replaceChildren(
                detail.rating.count ? stars(detail.rating.average) : null,
                h('span', { text: !detail.rating.count ? t('noRatings')
                    : t(detail.rating.count === 1 ? 'ratingSummaryOne' : 'ratingSummary', { value: detail.rating.average, count: formatCount(detail.rating.count) }) }),
            );
        };
        paintRating();

        const install = h('button', { class: 'community-btn community-btn-primary', type: 'button' }, t('installOnPhone'));
        install.addEventListener('click', () => installOnPhone(detail, install));
        const remix = h('button', { class: 'community-btn', type: 'button' }, t('openInStudio'));
        remix.addEventListener('click', () => openInStudio(detail, remix));
        const download = h('button', { class: 'community-btn', type: 'button' }, t('download'));
        download.addEventListener('click', () => downloadAnimation(detail, download));

        const credits = detail.credits || {};
        const facts = [
            [t('factResolution'), `${detail.width} × ${detail.height}`],
            [t('factFps'), detail.fps],
            [t('factFrames'), formatCount(detail.frame_count)],
            [t('factParts'), detail.parts],
            [t('factAudio'), detail.has_audio ? t('yes') : t('no')],
            [t('factSize'), formatBytes(detail.size_bytes)],
            [t('factLicense'), t(`license_${detail.license.replace(/[^a-z0-9]/g, '_')}`)],
            [t('factPublished'), detail.published_at ? formatDate(detail.published_at) : '—'],
        ];
        const creditLines = [];
        const brand = credits.manufacturer || credits.detected_manufacturer;
        if (brand) creditLines.push(t('creditManufacturer', { name: brand }));
        if (credits.original_author) creditLines.push(t('creditOriginal', { name: credits.original_author }));

        const ownerRow = h('div', { class: 'community-owner-row' },
            h('button', { class: 'community-owner', type: 'button', onclick: () => navigate(`u/${detail.owner.handle}`) },
                avatar(detail.owner.avatar_url, 'md'),
                h('span', {}, h('strong', { text: detail.owner.display_name }), h('small', { text: `@${detail.owner.handle}` }))),
            state.me && state.me.handle === detail.owner.handle ? null : followButton(detail.owner.handle, detail.owner_followed_by_me),
        );

        el.replaceChildren(
            h('div', { class: 'community-detail-media' }, previewImage(detail.preview_url, detail.width, detail.height, 'community-detail-preview')),
            h('div', { class: 'community-detail-info' },
                detail.status && detail.status !== 'published' ? h('div', { class: `community-status is-${detail.status}` },
                    h('strong', { text: t(`status_${detail.status}`) }), detail.status_reason ? h('span', { text: detail.status_reason }) : null) : null,
                h('h3', { class: 'community-detail-title', text: detail.title }),
                ownerRow,
                ratingLine,
                h('div', { class: 'community-detail-stats' },
                    h('span', { text: t('downloadsCount', { count: formatCount(detail.downloads) }) }),
                    detail.remix_count ? h('span', { text: t('remixCount', { count: formatCount(detail.remix_count) }) }) : null),
                published && !detail.is_mine ? h('div', { class: 'community-rate' }, h('span', { text: t('yourRating') }), starInput(detail, paintRating)) : null,
                h('div', { class: 'community-actions' }, install, remix, download),
                detail.description ? h('p', { class: 'community-description', text: detail.description }) : null,
                detail.remix_source ? h('p', { class: 'community-remix-of' }, t('remixOf'), ' ',
                    h('a', { href: `#community/a/${detail.remix_source.id}`, onclick: (event) => { event.preventDefault(); navigate(`a/${detail.remix_source.id}`); } }, detail.remix_source.title),
                    ` · @${detail.remix_source.owner}`) : null,
                creditLines.length ? h('ul', { class: 'community-credits' }, creditLines.map((line) => h('li', { text: line }))) : null,
                detail.tags.length ? h('div', { class: 'community-tags' }, detail.tags.map((tag) => h('button', { class: 'community-chip', type: 'button', onclick: () => navigate(`tag/${tag}`) }, `#${tag}`))) : null,
                h('dl', { class: 'community-facts' }, facts.map(([label, value]) => h('div', {}, h('dt', { text: label }), h('dd', { text: String(value) })))),
                h('div', { class: 'community-detail-footer' },
                    detail.is_mine ? ownerTools(detail) : null,
                    !detail.is_mine && published
                        ? h('button', { class: 'community-link-btn', type: 'button', onclick: () => reportDialog('animation', detail.id) }, t('report'))
                        : null),
            ),
        );
    }

    function ownerTools(detail) {
        const remove = h('button', { class: 'community-link-btn is-danger', type: 'button' }, t('deleteAnimation'));
        remove.addEventListener('click', async () => {
            if (!(await confirmAction(t('deleteAnimationConfirm'), true))) return;
            try {
                await api('DELETE', `/v1/animations/${detail.id}`);
                state.views.clear();
                toast(t('deleted'), 'success');
                navigate('me/uploads', { replace: true });
            } catch (error) {
                reportError(error);
            }
        });
        return h('div', { class: 'community-owner-tools' }, remove);
    }

    // ---------------------------------------------------------------- modal + Turnstile

    function modal(title, body, { onClose } = {}) {
        const closeBtn = h('button', { class: 'community-icon-btn', type: 'button', 'aria-label': t('close') }, '×');
        const box = h('div', { class: 'community-modal-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('header', {}, h('h3', { text: title }), closeBtn), body);
        const backdrop = h('div', { class: 'community-modal' }, box);
        const close = () => {
            backdrop.remove();
            if (onClose) onClose();
        };
        closeBtn.addEventListener('click', close);
        backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
        backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
        state.root.append(backdrop);
        requestAnimationFrame(() => (box.querySelector('input, textarea, select, button:not(.community-icon-btn)') || closeBtn).focus());
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

    // Renders the anti-robot check; resolves tokens on demand (each token is single use).
    function robotCheck() {
        const slot = h('div', { class: 'community-turnstile' });
        let widget = null;
        let token = '';
        let waiters = [];
        const ready = loadConfig().then((config) => loadTurnstile().then((ts) => {
            widget = ts.render(slot, {
                sitekey: config.turnstile_site_key,
                theme: 'dark',
                language: typeof idiomaAtual === 'string' ? idiomaAtual : 'auto',
                callback: (value) => { token = value; waiters.splice(0).forEach((resolve) => resolve(value)); },
                'expired-callback': () => { token = ''; },
                'error-callback': () => { token = ''; },
            });
        })).catch((error) => {
            slot.replaceChildren(h('p', { class: 'community-error', text: error.message }));
        });
        return {
            el: slot,
            async token() {
                await ready;
                if (token) return token;
                return new Promise((resolve) => waiters.push(resolve));
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
        const list = h('div', { class: 'community-radio-list' }, categories.map((category) => h('label', { class: 'community-radio' },
            h('input', { type: 'radio', name: 'community-report-category', value: category }),
            h('span', {}, h('strong', { text: t(`reportCat_${category}`) }), h('small', { text: t(`reportCatHint_${category}`) })))));
        const note = h('textarea', { class: 'community-textarea', maxlength: '500', rows: '3', placeholder: t('reportNote') });
        const check = robotCheck();
        const send = h('button', { class: 'community-btn community-btn-primary', type: 'button' }, t('sendReport'));
        const dialog = modal(t('reportTitle'), h('div', { class: 'community-form' }, h('p', { class: 'community-muted', text: t('reportIntro') }), list, note, check.el, send), { onClose: () => check.remove() });
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

    // ---------------------------------------------------------------- profiles

    function profileView(handle) {
        const el = h('section', { class: 'community-profile' }, h('div', { class: 'community-loading', text: t('loading') }));
        const view = { el, title: `@${handle}`, onLeave: () => grid && grid.stop() };
        let grid = null;
        api('GET', `/v1/users/${handle}`).then((profile) => {
            const isMe = state.me && state.me.handle === profile.handle;
            const followers = h('button', { class: 'community-count-btn', type: 'button', onclick: () => navigate(`u/${handle}/followers`) });
            const paintFollowers = (count) => followers.replaceChildren(h('strong', { text: formatCount(count) }), ' ', t('followers'));
            paintFollowers(profile.followers);
            const banner = isMe && state.me.pending_banner_url ? state.me.pending_banner_url : profile.banner_url;
            const links = (profile.links || []).map(safeHttps).filter(Boolean);
            grid = pagedGrid({
                fetchPage: (cursor, signal) => api('GET', `/v1/users/${handle}/animations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
                renderItem: card,
                empty: () => (isMe ? t('emptyMine') : t('emptyProfile')),
            });
            el.replaceChildren(
                h('div', { class: 'community-banner', style: null }, banner ? h('img', { src: banner, alt: '', decoding: 'async' }) : null),
                h('div', { class: 'community-profile-head' },
                    avatar(isMe ? (state.me.pending_avatar_url || profile.avatar_url) : profile.avatar_url, 'xl'),
                    h('div', { class: 'community-profile-names' },
                        h('h3', { text: profile.display_name }),
                        h('span', { class: 'community-muted' }, `@${profile.handle}`,
                            profile.role ? h('span', { class: 'community-role', text: t(`role_${profile.role}`) }) : null)),
                    h('div', { class: 'community-profile-actions' },
                        isMe
                            ? [h('button', { class: 'community-btn', type: 'button', onclick: () => navigate('me/edit') }, t('editProfile')),
                                h('button', { class: 'community-btn', type: 'button', onclick: () => navigate('me/uploads') }, t('myUploads'))]
                            : [followButton(profile.handle, profile.followed_by_me, paintFollowers),
                                h('button', { class: 'community-link-btn', type: 'button', onclick: () => reportDialog('user', profile.handle) }, t('report'))]),
                ),
                profile.bio ? h('p', { class: 'community-bio', text: profile.bio }) : null,
                links.length ? h('ul', { class: 'community-links' }, links.map((url) => h('li', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, new URL(url).host + new URL(url).pathname.replace(/\/$/, ''))))) : null,
                h('div', { class: 'community-profile-stats' },
                    h('span', {}, h('strong', { text: formatCount(profile.animations) }), ' ', t('animationsLabel')),
                    h('span', {}, h('strong', { text: formatCount(profile.total_downloads) }), ' ', t('downloadsLabel')),
                    followers,
                    h('button', { class: 'community-count-btn', type: 'button', onclick: () => navigate(`u/${handle}/following`) },
                        h('strong', { text: formatCount(profile.following) }), ' ', t('followingLabel')),
                    h('span', { class: 'community-muted', text: t('joined', { date: formatDate(profile.joined_at) }) })),
                grid.el,
            );
            grid.start();
        }).catch((error) => el.replaceChildren(h('div', { class: 'community-empty' }, error.message)));
        return view;
    }

    function followListView(handle, which) {
        const list = pagedGrid({
            fetchPage: (cursor, signal) => api('GET', `/v1/users/${handle}/${which}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
            renderItem: (user) => h('button', { class: 'community-user-row', type: 'button', onclick: () => navigate(`u/${user.handle}`) },
                avatar(user.avatar_url, 'md'), h('span', {}, h('strong', { text: user.display_name }), h('small', { text: `@${user.handle}` }))),
            empty: () => t('emptyList'),
            gridClass: 'community-user-list',
        });
        list.start();
        return { el: list.el, title: `${which === 'followers' ? t('followers') : t('followingLabel')} · @${handle}`, onLeave: () => list.stop() };
    }

    function myUploadsView() {
        if (!state.token) return { el: signInPrompt(t('uploadSignIn')), title: t('myUploads') };
        const el = h('section', { class: 'community-uploads' }, h('div', { class: 'community-loading', text: t('loading') }));
        api('GET', '/v1/me/animations').then((data) => {
            if (!data.items.length) return el.replaceChildren(h('div', { class: 'community-empty' }, t('emptyMine')));
            el.replaceChildren(h('div', { class: 'community-grid' }, data.items.map((item) => {
                const node = card(item);
                node.querySelector('.community-card-body').prepend(h('span', { class: `community-status-pill is-${item.status}`, text: t(`status_${item.status}`) }));
                return node;
            })));
        }).catch((error) => el.replaceChildren(h('div', { class: 'community-empty' }, error.message)));
        return { el, title: t('myUploads') };
    }

    // Resizes and re-encodes a picked image in the browser (also drops EXIF metadata such as GPS).
    async function prepareImage(file, { width, height, cover }) {
        const bitmap = await createImageBitmap(file);
        let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
        if (cover) {
            const target = width / height;
            if (sw / sh > target) { sw = Math.round(sh * target); sx = Math.round((bitmap.width - sw) / 2); }
            else { sh = Math.round(sw / target); sy = Math.round((bitmap.height - sh) / 2); }
        }
        const scale = Math.min(1, width / sw, height / sh);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        bitmap.close && bitmap.close();
        for (const [type, quality] of [['image/webp', 0.86], ['image/jpeg', 0.86]]) {
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
            if (blob && blob.type === type) return blob;
        }
        throw new Error(t('errImage'));
    }

    function editProfileView() {
        if (!state.token) return { el: signInPrompt(t('uploadSignIn')), title: t('editProfile') };
        const el = h('section', { class: 'community-edit' }, h('div', { class: 'community-loading', text: t('loading') }));
        const view = { el, title: t('editProfile') };
        (state.me ? Promise.resolve(state.me) : loadMe()).then((me) => {
            if (!me) return el.replaceChildren(signInPrompt(t('uploadSignIn')));
            const name = h('input', { class: 'community-input', maxlength: '40', value: me.display_name });
            const bio = h('textarea', { class: 'community-textarea', maxlength: '300', rows: '4' });
            bio.value = me.bio || '';
            const counter = h('small', { class: 'community-muted' });
            const paintCounter = () => { counter.textContent = `${[...bio.value].length}/300`; };
            bio.addEventListener('input', paintCounter);
            paintCounter();
            const linkInputs = Array.from({ length: 4 }, (_, i) => h('input', { class: 'community-input', type: 'url', inputmode: 'url', placeholder: 'https://', value: (me.links || [])[i] || '' }));

            const imagePicker = (kind) => {
                const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
                const current = kind === 'avatar' ? (me.pending_avatar_url || me.avatar_url) : (me.pending_banner_url || me.banner_url);
                const previewEl = kind === 'avatar' ? avatar(current, 'xl') : h('div', { class: 'community-banner is-small' }, current ? h('img', { src: current, alt: '' }) : null);
                const pending = (kind === 'avatar' ? me.pending_avatar_url : me.pending_banner_url) ? h('small', { class: 'community-pending', text: t('pendingImage') }) : null;
                const choose = h('button', { class: 'community-btn', type: 'button', onclick: () => input.click() }, kind === 'avatar' ? t('changeAvatar') : t('changeBanner'));
                input.addEventListener('change', async () => {
                    const file = input.files && input.files[0];
                    input.value = '';
                    if (!file) return;
                    const busy = busyButton(choose, t('sending'));
                    try {
                        const blob = await prepareImage(file, kind === 'avatar' ? { width: 512, height: 512, cover: true } : { width: 1500, height: 500, cover: true });
                        await api('PUT', `/v1/me/${kind}`, { body: blob, headers: { 'Content-Type': blob.type } });
                        await loadMe();
                        toast(t('imageSent'), 'success', 4200);
                        route('me/edit', { force: true });
                    } catch (error) {
                        reportError(error);
                    } finally {
                        busy.done();
                    }
                });
                return h('div', { class: `community-image-field is-${kind}` }, previewEl, h('div', {}, choose, pending), input);
            };

            const save = h('button', { class: 'community-btn community-btn-primary', type: 'button' }, t('save'));
            save.addEventListener('click', async () => {
                const busy = busyButton(save, t('saving'));
                try {
                    state.me = await api('PATCH', '/v1/me', { json: {
                        display_name: name.value,
                        bio: bio.value,
                        links: linkInputs.map((input) => input.value.trim()).filter(Boolean),
                    } });
                    renderUserSlot();
                    state.views.clear();
                    toast(t('saved'), 'success');
                    navigate(`u/${me.handle}`, { replace: true });
                } catch (error) {
                    reportError(error);
                } finally {
                    busy.done();
                }
            });

            const confirmInput = h('input', { class: 'community-input', placeholder: me.handle, autocomplete: 'off' });
            const deleteBtn = h('button', { class: 'community-btn is-danger', type: 'button' }, t('deleteAccount'));
            deleteBtn.addEventListener('click', async () => {
                if (confirmInput.value.trim().toLowerCase() !== me.handle) return toast(t('deleteAccountType'), 'info', 4200);
                if (!(await confirmAction(t('deleteAccountConfirm'), true))) return;
                try {
                    await api('DELETE', '/v1/me', { json: { confirm: me.handle } });
                    clearSession();
                    state.views.clear();
                    toast(t('accountDeleted'), 'success', 4200);
                    navigate('feed/trending', { replace: true });
                } catch (error) {
                    reportError(error);
                }
            });
            const logout = h('button', { class: 'community-btn', type: 'button' }, t('signOut'));
            logout.addEventListener('click', async () => {
                try { await api('POST', '/v1/auth/logout'); } catch (error) { /* the local session ends anyway */ }
                clearSession();
                state.views.clear();
                navigate('feed/trending', { replace: true });
            });

            el.replaceChildren(
                h('div', { class: 'community-form' },
                    imagePicker('banner'),
                    imagePicker('avatar'),
                    h('label', { class: 'community-field' }, h('span', { text: t('displayName') }), name),
                    h('label', { class: 'community-field' }, h('span', {}, t('bio'), ' ', counter), bio),
                    h('div', { class: 'community-field' }, h('span', { text: t('links') }), linkInputs),
                    h('p', { class: 'community-fineprint', text: t('profileReviewNote') }),
                    save,
                ),
                h('div', { class: 'community-form community-danger-zone' },
                    h('h4', { text: t('account') }),
                    logout,
                    h('p', { class: 'community-muted', text: t('deleteAccountHint') }),
                    confirmInput,
                    deleteBtn,
                ),
            );
        });
        return view;
    }

    // ---------------------------------------------------------------- upload

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
        const frames = Object.keys(zip.files).filter((name) => /\/[^/]+\.(png|jpe?g)$/i.test(name)).sort();
        let thumb = null;
        if (frames.length) {
            const bytes = await zip.file(frames[0]).async('blob');
            thumb = URL.createObjectURL(bytes);
        }
        return { width, height, fps, frames: frames.length, thumb };
    }

    async function sha256Hex(bytes) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    function putWithProgress(url, file, onProgress) {
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
            xhr.send(file);
        });
    }

    function uploadView() {
        if (!state.token) return { el: signInPrompt(t('uploadSignIn')), title: t('navUpload') };
        let remixSource = null;
        try { remixSource = JSON.parse(sessionStorage.getItem(REMIX_KEY) || 'null'); } catch (error) { /* ignore */ }

        const fileInput = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
        const pick = h('button', { class: 'community-dropzone', type: 'button', onclick: () => fileInput.click() },
            h('strong', { text: t('pickZip') }), h('small', { text: t('pickZipHint') }));
        const summary = h('div', { class: 'community-zip-summary', hidden: true });
        const title = h('input', { class: 'community-input', maxlength: '60', required: true });
        const description = h('textarea', { class: 'community-textarea', maxlength: '1000', rows: '4' });
        const tags = h('input', { class: 'community-input', placeholder: t('tagsPlaceholder') });
        const license = h('select', { class: 'community-input' },
            ['cc-by-4.0', 'cc-by-sa-4.0', 'cc-by-nc-4.0', 'cc0-1.0', 'all-rights-reserved'].map((id) => h('option', { value: id, text: t(`license_${id.replace(/[^a-z0-9]/g, '_')}`) })));
        const manufacturer = h('input', { class: 'community-input', maxlength: '40', placeholder: t('manufacturerPlaceholder') });
        const author = h('input', { class: 'community-input', maxlength: '80', placeholder: t('originalAuthorPlaceholder') });
        const remixBox = remixSource ? h('input', { type: 'checkbox', checked: true }) : null;
        const rules = h('input', { type: 'checkbox' });
        const check = robotCheck();
        const submit = h('button', { class: 'community-btn community-btn-primary', type: 'button', disabled: true }, t('publish'));
        const progress = h('div', { class: 'community-progress', hidden: true }, h('span'));
        let chosen = null;

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            summary.hidden = false;
            summary.replaceChildren(h('span', { class: 'community-muted', text: t('checkingZip') }));
            try {
                const info = await inspectZip(file);
                chosen = { file, info, bytes: await file.arrayBuffer() };
                if (!title.value) title.value = file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').slice(0, 60);
                summary.replaceChildren(
                    info.thumb ? h('img', { src: info.thumb, alt: '', class: 'community-zip-thumb' }) : null,
                    h('div', {}, h('strong', { text: file.name }),
                        h('span', { text: `${info.width} × ${info.height} · ${info.fps} fps · ${formatCount(info.frames)} ${t('factFrames').toLowerCase()} · ${formatBytes(file.size)}` })));
                submit.disabled = false;
            } catch (error) {
                chosen = null;
                submit.disabled = true;
                summary.replaceChildren(h('p', { class: 'community-error', text: error.message }));
            }
        });

        submit.addEventListener('click', async () => {
            if (!chosen) return;
            if (!rules.checked) return toast(t('acceptRules'), 'info', 4200);
            submit.disabled = true;
            progress.hidden = false;
            const bar = progress.firstChild;
            bar.style.width = '0%';
            try {
                submit.textContent = t('preparing');
                const draft = await api('POST', '/v1/animations', { json: {
                    title: title.value,
                    description: description.value,
                    tags: tags.value.split(/[,#\s]+/).filter(Boolean).slice(0, 8),
                    license: license.value,
                    credits: { manufacturer: manufacturer.value, original_author: author.value },
                    remix_of: remixBox && remixBox.checked ? remixSource.id : undefined,
                    sha256: await sha256Hex(chosen.bytes),
                    size_bytes: chosen.bytes.byteLength,
                    turnstile_token: await check.token(),
                } });
                submit.textContent = t('sending');
                // Bytes already read (and hashed) are sent as-is, so the file cannot change between hash and upload.
                await putWithProgress(draft.upload_url, chosen.bytes, (fraction) => { bar.style.width = `${Math.round(fraction * 100)}%`; });
                try { sessionStorage.removeItem(REMIX_KEY); } catch (error) { /* ignore */ }
                state.views.clear();
                toast(t('uploaded'), 'success', 6000);
                navigate(`a/${draft.id}`, { replace: true });
            } catch (error) {
                check.reset();
                reportError(error);
                if (error.code === 'duplicate' && error.details && error.details.id) navigate(`a/${error.details.id}`);
            } finally {
                submit.disabled = !chosen;
                submit.textContent = t('publish');
                progress.hidden = true;
            }
        });

        const el = h('section', { class: 'community-upload' },
            h('div', { class: 'community-form' },
                h('p', { class: 'community-muted', text: t('uploadIntro') }),
                pick, fileInput, summary,
                h('label', { class: 'community-field' }, h('span', { text: t('fieldTitle') }), title),
                h('label', { class: 'community-field' }, h('span', { text: t('fieldDescription') }), description),
                h('label', { class: 'community-field' }, h('span', { text: t('fieldTags') }), tags),
                h('label', { class: 'community-field' }, h('span', { text: t('fieldLicense') }), license),
                h('div', { class: 'community-field' }, h('span', { text: t('fieldCredits') }), h('small', { class: 'community-muted', text: t('creditsHint') }), manufacturer, author),
                remixBox ? h('label', { class: 'community-check' }, remixBox, h('span', { text: t('isRemix', { title: remixSource.title, owner: remixSource.owner }) })) : null,
                h('label', { class: 'community-check' }, rules, h('span', { text: t('rulesAccept') })),
                h('ul', { class: 'community-rules' }, ['rule1', 'rule2', 'rule3', 'rule4'].map((key) => h('li', { text: t(key) }))),
                check.el,
                progress,
                submit,
                h('p', { class: 'community-fineprint', text: t('reviewNote') }),
            ));
        return { el, title: t('navUpload'), onLeave: () => check.remove() };
    }

    // ---------------------------------------------------------------- open / close

    async function open(options = {}) {
        if (!state.root) buildShell();
        state.open = true;
        state.root.hidden = false;
        document.body.classList.add('community-open');
        let path = options.path ? options.path.replace(/^community\/?/, '') : null;
        if (!state.meLoaded) await loadMe();
        if (options.incoming) path = await handleIncoming(options.incoming);
        path = path || state.path || 'feed/trending';
        navigate(path, { replace: true });
        requestAnimationFrame(() => state.main.focus({ preventScroll: true }));
    }

    // Shared with panel.js.
    const kit = Object.freeze({ h, t, api, navigate, toast, reportError, avatar, previewImage, formatCount, formatDate, formatBytes, confirmAction, fetchVerified, state, API, modal });

    window.BASCommunity = Object.freeze({ open, close: close_, isOpen: () => state.open, kit });
})();
