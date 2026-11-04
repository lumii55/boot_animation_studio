/* P15.A regression checks. Execute: node --test tests/community-preview.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/community-preview.js'), 'utf8');

function harness(initialFlag) {
    let developer = false;
    const store = new Map(initialFlag ? [['bas.community.preview.v1', initialFlag]] : []);
    const elements = new Map();
    const winCallbacks = new Map();
    const documentCallbacks = new Map();
    function element(id) {
        if (!elements.has(id)) {
            const handlers = new Map();
            const el = {
                hidden: id === 'bas-community-preview' || id === 'bas-community-launcher',
                checked: false, disabled: false, isConnected: true, textContent: '',
                attributes: {},
                addEventListener: (name, fn) => handlers.set(name, fn),
                emit: (name, event = {}) => handlers.get(name)?.(event),
                setAttribute: (k,v) => { el.attributes[k] = v; },
                getAttribute: k => el.attributes[k],
                focus: () => { doc.activeElement = el; }
            };
            elements.set(id, el);
        }
        return elements.get(id);
    }
    const doc = {
        readyState: 'complete', activeElement: null, documentElement: {lang: 'en'},
        getElementById: element,
        querySelectorAll: () => [],
        addEventListener: (name, fn) => documentCallbacks.set(name, fn),
        body: { classList: {add(){}, remove(){}} }
    };
    const win = {
        BASDeveloperLab: {state: () => ({enabled: developer})},
        addEventListener: (name, fn) => winCallbacks.set(name, fn)
    };
    const localStorage = { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v) };
    vm.runInNewContext(src, {window: win, document: doc, localStorage, console}, {filename: 'community-preview.js'});
    return {
        element, win, store,
        developer(value) { developer = value; winCallbacks.get('bas:developer-mode-changed')?.(); }
    };
}

test('off by default, including when the Developer Lab is enabled', () => {
    const h = harness();
    h.developer(true);
    assert.equal(h.element('bas-community-launcher').hidden, true);
    assert.equal(h.element('bas-community-preview-open').disabled, true);
    assert.equal(h.win.BASCommunityPreview.open(), false);
});

test('enable locally and hide immediately when developer mode is disabled', () => {
    const h = harness();
    h.developer(true);
    h.element('bas-community-feature-toggle').emit('change', {target:{checked:true}});
    assert.equal(h.store.get('bas.community.preview.v1'), 'enabled');
    assert.equal(h.element('bas-community-launcher').hidden, false);
    assert.equal(h.win.BASCommunityPreview.open(), true);
    assert.equal(h.element('bas-community-preview').hidden, false);
    h.developer(false);
    assert.equal(h.element('bas-community-preview').hidden, true);
    assert.equal(h.element('bas-community-launcher').hidden, true);
    assert.equal(h.win.BASCommunityPreview.open(), false);
});

test('saved toggle never bypasses Developer Lab', () => {
    const h = harness('enabled');
    assert.equal(h.element('bas-community-launcher').hidden, true);
    h.developer(true);
    assert.equal(h.element('bas-community-launcher').hidden, false);
    h.element('bas-community-feature-toggle').emit('change', {target:{checked:false}});
    assert.equal(h.store.get('bas.community.preview.v1'), 'disabled');
    assert.equal(h.element('bas-community-launcher').hidden, true);
});

test('experimental shell stays hidden in default document and has no upload/network code', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id="bas-community-launcher" hidden/);
    assert.match(html, /id="bas-community-preview"[^>]*hidden/);
    assert.match(html, /id="bas-community-feature-toggle"/);
    assert.equal(src.includes('fetch('), false);
    assert.equal(src.includes('XMLHttpRequest('), false);
    assert.equal(src.includes('WebSocket('), false);
});
