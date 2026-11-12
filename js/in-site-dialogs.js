// In-site menus and notices instead of the browser's own pop-ups (owner's request).
//
// - <select>: the native element stays the single owner of its value, options and events (existing code keeps
//   reading .value and listening to 'change'). It only stops receiving pointer events; a tap on it opens the site's
//   own list (a bottom sheet on phones, a menu under the field on wider screens), and choosing dispatches the same
//   'input' and 'change' events a native choice would.
// - <input type="color">: same idea, with a palette and a hex field.
// - window.alert(): shown as a site toast. (Confirmations use askConfirmation(); call sites were converted.)
(function () {
    'use strict';
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const ENHANCED = 'basPicker';
    const fields = new Set();
    let open = null;

    // ------------------------------------------------------------------ alert → toast

    if (typeof window.alert === 'function' && !window.alert.basInSite) {
        const inSiteAlert = (message) => {
            const text = String(message === undefined || message === null ? '' : message).trim();
            if (!text) return;
            if (typeof showToast === 'function' && document.getElementById('toast-container')) {
                showToast(text, 'info', Math.min(12000, 3400 + text.length * 45));
            }
        };
        inSiteAlert.basInSite = true;
        window.alert = inSiteAlert;
    }

    // ------------------------------------------------------------------ shared menu layer

    function labelOf(field) {
        const aria = field.getAttribute('aria-label');
        if (aria) return aria;
        const label = field.labels && field.labels[0];
        return label ? label.textContent.trim() : '';
    }

    function close(restoreFocus = true) {
        if (!open) return;
        const { layer, field } = open;
        open = null;
        layer.remove();
        document.removeEventListener('keydown', onMenuKey, true);
        if (restoreFocus && field && field.isConnected) field.focus({ preventScroll: true });
    }

    function onMenuKey(event) {
        if (!open) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === 'Tab') { close(); return; }
        if (!open.items) return;
        const items = open.items.filter((item) => !item.disabled);
        if (!items.length) return;
        const index = items.indexOf(document.activeElement);
        let next = null;
        if (event.key === 'ArrowDown') next = items[Math.min(items.length - 1, index + 1)] || items[0];
        else if (event.key === 'ArrowUp') next = items[Math.max(0, index - 1)] || items[items.length - 1];
        else if (event.key === 'Home') next = items[0];
        else if (event.key === 'End') next = items[items.length - 1];
        if (next) { event.preventDefault(); next.focus(); }
    }

    function place(panel, field) {
        const wide = window.matchMedia('(min-width: 720px)').matches;
        panel.classList.toggle('is-sheet', !wide);
        if (!wide) return;
        const rect = field.getBoundingClientRect();
        const width = Math.max(rect.width, 220);
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
        const below = window.innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        panel.style.minWidth = `${width}px`;
        panel.style.left = `${left}px`;
        if (below >= 240 || below >= above) {
            panel.style.top = `${rect.bottom + 6}px`;
            panel.style.maxHeight = `${Math.max(160, below)}px`;
        } else {
            panel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
            panel.style.maxHeight = `${Math.max(160, above)}px`;
        }
    }

    function openLayer(field, title, body, extraClass = '') {
        close(false);
        const layer = document.createElement('div');
        layer.className = 'bas-choice-layer';
        const panel = document.createElement('div');
        panel.className = `bas-choice-panel ${extraClass}`.trim();
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        if (title) {
            panel.setAttribute('aria-label', title);
            const head = document.createElement('div');
            head.className = 'bas-choice-title';
            head.textContent = title;
            panel.append(head);
        }
        panel.append(body);
        layer.append(panel);
        layer.addEventListener('pointerdown', (event) => { if (event.target === layer) { event.preventDefault(); close(); } });
        document.body.append(layer);
        place(panel, field);
        document.addEventListener('keydown', onMenuKey, true);
        open = { layer, field, panel, items: null };
        return open;
    }

    function commit(field, value) {
        if (field.value !== value) {
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // ------------------------------------------------------------------ select

    function openSelect(select) {
        const list = document.createElement('div');
        list.className = 'bas-choice-list';
        list.setAttribute('role', 'listbox');
        const items = [];
        const addOption = (option, into) => {
            if (option.hidden) return;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'bas-choice-item';
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(option.selected));
            item.disabled = option.disabled;
            item.textContent = option.textContent;
            item.addEventListener('click', () => { close(); commit(select, option.value); });
            items.push(item);
            into.append(item);
        };
        for (const child of select.children) {
            if (child.tagName === 'OPTGROUP') {
                const group = document.createElement('div');
                group.className = 'bas-choice-group';
                group.setAttribute('role', 'group');
                const head = document.createElement('div');
                head.className = 'bas-choice-group-title';
                head.textContent = child.label;
                group.setAttribute('aria-label', child.label);
                group.append(head);
                for (const option of child.children) if (option.tagName === 'OPTION') addOption(option, group);
                list.append(group);
            } else if (child.tagName === 'OPTION') {
                addOption(child, list);
            }
        }
        const state = openLayer(select, labelOf(select), list);
        state.items = items;
        const current = items.find((item) => item.getAttribute('aria-selected') === 'true' && !item.disabled) || items.find((item) => !item.disabled);
        if (current) {
            current.scrollIntoView({ block: 'nearest' });
            current.focus({ preventScroll: true });
        }
    }

    // ------------------------------------------------------------------ color

    const SWATCHES = ['#ffffff', '#c5ceda', '#8995a7', '#3b4454', '#000000', '#6fe3f4', '#28c9df', '#8ea3ff', '#6a5cff', '#c77dff',
        '#ff7ad9', '#ff7389', '#ff4d4d', '#ffbd70', '#ffd84d', '#c6f36b', '#67dea3', '#2fbf71', '#1e88e5', '#0b3d91'];
    const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
    const normalHex = (text) => {
        const match = HEX.exec(String(text || '').trim());
        if (!match) return null;
        const hex = match[1].length === 3 ? match[1].split('').map((ch) => ch + ch).join('') : match[1];
        return `#${hex.toLowerCase()}`;
    };

    function openColor(input) {
        const body = document.createElement('div');
        body.className = 'bas-color';
        const grid = document.createElement('div');
        grid.className = 'bas-color-grid';
        const items = [];
        for (const color of SWATCHES) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'bas-color-swatch';
            swatch.style.background = color;
            swatch.setAttribute('aria-label', color);
            swatch.setAttribute('aria-pressed', String(color === String(input.value).toLowerCase()));
            swatch.addEventListener('click', () => { close(); commit(input, color); });
            items.push(swatch);
            grid.append(swatch);
        }
        const row = document.createElement('div');
        row.className = 'bas-color-row';
        const preview = document.createElement('span');
        preview.className = 'bas-color-preview';
        preview.style.background = input.value;
        const hex = document.createElement('input');
        hex.className = 'bas-color-hex';
        hex.value = input.value;
        hex.maxLength = 7;
        hex.spellcheck = false;
        hex.setAttribute('aria-label', 'HEX');
        hex.autocomplete = 'off';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'bas-color-ok';
        ok.textContent = 'OK';
        const apply = () => {
            const color = normalHex(hex.value);
            if (!color) { hex.focus(); hex.select(); return; }
            close();
            commit(input, color);
        };
        hex.addEventListener('input', () => {
            const color = normalHex(hex.value);
            hex.toggleAttribute('aria-invalid', !color);
            if (color) preview.style.background = color;
        });
        hex.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } });
        ok.addEventListener('click', apply);
        row.append(preview, hex, ok);
        body.append(grid, row);
        const state = openLayer(input, labelOf(input), body, 'is-color');
        state.items = items;
        (items.find((item) => item.getAttribute('aria-pressed') === 'true') || hex).focus({ preventScroll: true });
    }

    // ------------------------------------------------------------------ wiring

    const isField = (el) => el && ((el.tagName === 'SELECT' && !el.multiple && !(el.size > 1)) || (el.tagName === 'INPUT' && el.type === 'color'));

    function enhance(field) {
        if (!isField(field) || field.dataset[ENHANCED]) return;
        field.dataset[ENHANCED] = 'on';
        field.classList.add('bas-in-site-field');
        fields.add(field);
        field.addEventListener('keydown', (event) => {
            const opens = event.key === 'Enter' || event.key === ' ' || event.key === 'F4' || (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp'));
            if (!opens || field.disabled) return;
            event.preventDefault();
            activate(field);
        });
        // A click delivered to the field itself (keyboard or assistive technology).
        field.addEventListener('click', (event) => { event.preventDefault(); activate(field); });
    }

    function activate(field) {
        if (field.disabled || !field.isConnected) return;
        if (field.tagName === 'SELECT') openSelect(field);
        else openColor(field);
    }

    function scan(root) {
        if (!root || !root.querySelectorAll) return;
        if (isField(root)) enhance(root);
        root.querySelectorAll('select, input[type="color"]').forEach(enhance);
    }

    // The field ignores the pointer (so the browser never opens its own pop-up); the tap lands on whatever is
    // under it, and this finds the field at that point — only if nothing else is drawn on top of it there.
    function fieldAt(x, y) {
        for (const field of fields) {
            if (!field.isConnected) { fields.delete(field); continue; }
            if (field.disabled || !field.getClientRects().length) continue; // hidden (offsetParent is null for fixed fields)
            const rect = field.getBoundingClientRect();
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
            field.style.pointerEvents = 'auto';
            const top = document.elementFromPoint(x, y);
            field.style.pointerEvents = '';
            if (top === field || (top && field.contains(top))) return field;
        }
        return null;
    }

    document.addEventListener('click', (event) => {
        if (open && open.layer.contains(event.target)) return;
        const field = fieldAt(event.clientX, event.clientY);
        if (!field) return;
        event.preventDefault();
        event.stopPropagation();
        field.focus({ preventScroll: true });
        activate(field);
    }, true);
    // A menu under a field (wide screens) follows it while the page scrolls, and closes once the field leaves the
    // screen; the phone sheet does not move.
    document.addEventListener('scroll', (event) => {
        if (!open || open.panel.classList.contains('is-sheet') || open.panel.contains(event.target)) return;
        const rect = open.field.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) { close(false); return; }
        for (const prop of ['top', 'bottom', 'left', 'maxHeight', 'minWidth']) open.panel.style[prop] = '';
        place(open.panel, open.field);
    }, true);
    // Rotating or resizing the window closes the menu; the phone keyboard (height only) does not.
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; close(false); }
    });

    function start() {
        scan(document.body);
        new MutationObserver((records) => {
            for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
        }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();

    // Confirmation in the site's own dialog (askConfirmation in ux.js); a promise of true/false.
    function confirmInSite(message, danger = false) {
        if (typeof askConfirmation === 'function' && document.getElementById('modal-confirm')) return Promise.resolve(askConfirmation(String(message), !!danger));
        return Promise.resolve(typeof window.confirm === 'function' ? window.confirm(message) : true);
    }

    window.BASInSiteDialogs = Object.freeze({ enhance, open: activate, close: () => close(), confirm: confirmInSite });
})();
