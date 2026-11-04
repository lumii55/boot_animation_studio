/* Node built-in regression suite: node --test tests/community-preview.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'js/community-preview.js'), 'utf8');

function harness(saved) {
    let developer = false;
    const data = new Map(saved ? [['bas.community.preview.v1',saved]] : []);
    const elements = new Map(), windows = new Map(), docs = new Map();
    const document = {
        readyState: 'complete', activeElement: null, documentElement: {lang:'pt'},
        body: {classList: {add(){}, remove(){}}},
        getElementById: element,
        querySelectorAll: () => [],
        addEventListener: (name,listener) => docs.set(name,listener)
    };
    function element(id) {
        if (!elements.has(id)) {
            const callbacks = new Map();
            const node = {
                id, innerHTML:'', textContent:'', value:'', disabled:false, checked:false, isConnected:true,
                hidden: id==='bas-community-preview'||id==='bas-community-launcher',
                dataset:{}, attrs:{},
                classList:{add(){},remove(){},toggle(){},contains(){return false;}},
                addEventListener:(name,listener)=>callbacks.set(name,listener),
                emit:(name,event)=>callbacks.get(name)?.(event),
                setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k];},
                querySelectorAll:()=>[], querySelector:()=>null,
                focus(){document.activeElement=this;}, scrollIntoView(){}
            };
            elements.set(id,node);
        }
        return elements.get(id);
    }
    const window = {
        BASDeveloperLab:{state:()=>({enabled:developer})},
        addEventListener:(name,listener)=>windows.set(name,listener)
    };
    const localStorage={
        getItem:k=>data.get(k)??null,
        setItem:(k,v)=>data.set(k,v)
    };
    vm.runInNewContext(script,{window,document,localStorage},{filename:'community-preview.js'});
    function click(action,props={}) {
        const layer=element('bas-community-preview');
        const target={
            dataset:{cAction:action,...props},
            classList:{contains:()=>false},
            closest(selector){return selector==='#bas-community-preview'?layer:this;}
        };
        layer.emit('click',{target});
    }
    return {
        element, window, data, click,
        setDeveloper(value){developer=value;windows.get('bas:developer-mode-changed')?.();},
        enable(){this.setDeveloper(true);element('bas-community-feature-toggle').emit('change',{target:{checked:true}});}
    };
}

test('not exposed to ordinary users, including when an opt-in is stored',()=>{
    const h=harness('enabled');
    assert.equal(h.element('bas-community-launcher').hidden,true);
    assert.equal(h.window.BASCommunityPreview.open(),false);
    h.setDeveloper(true);
    assert.equal(h.element('bas-community-launcher').hidden,false);
    h.setDeveloper(false);
    assert.equal(h.element('bas-community-launcher').hidden,true);
});

test('disabled by default; opt-in displays the full gallery',()=>{
    const h=harness();
    h.setDeveloper(true);
    assert.equal(h.element('bas-community-launcher').hidden,true);
    h.enable();
    assert.equal(h.window.BASCommunityPreview.open(),true);
    assert.match(h.element('bas-community-preview').innerHTML,/bas-c-sidebar/);
    assert.match(h.element('bas-c-view').innerHTML,/bas-c-hero/);
    assert.match(h.element('bas-c-grid').innerHTML,/Lunar Dreams/);
    assert.match(h.element('bas-c-grid').innerHTML,/Cyber Circuit/);
    assert.match(h.element('bas-c-grid').innerHTML,/DEMO/);
});

test('search updates catalog in place without backend access',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.element('bas-community-preview').emit('input',{target:{id:'bas-c-search',value:'Sakura'}});
    assert.match(h.element('bas-c-grid').innerHTML,/Sakura Breeze/);
    assert.doesNotMatch(h.element('bas-c-grid').innerHTML,/Neon Pulse/);
    h.element('bas-community-preview').emit('input',{target:{id:'bas-c-search',value:'not-found'}});
    assert.match(h.element('bas-c-grid').innerHTML,/Nenhuma animação encontrada/);
});

test('detail, session favorite and creator route render',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.click('detail',{id:'lunar'});
    assert.match(h.element('bas-c-modal-host').innerHTML,/Lunar Dreams/);
    assert.match(h.element('bas-c-modal-host').innerHTML,/Comentários/);
    assert.match(h.element('bas-c-modal-host').innerHTML,/disabled title=/);
    h.click('favorite',{id:'lunar'});
    assert.match(h.element('bas-c-modal-host').innerHTML,/Remover favorito/);
    h.click('navigate',{route:'saved'});
    assert.match(h.element('bas-c-grid').innerHTML,/Lunar Dreams/);
    h.click('creator',{id:'lunar'});
    assert.match(h.element('bas-c-view').innerHTML,/@Moonlit/);
    assert.match(h.element('bas-c-view').innerHTML,/bas-c-page-title/);
});

test('publishing paths are presented but no upload occurs',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.click('upload');
    const modal=h.element('bas-c-modal-host').innerHTML;
    assert.match(modal,/Pelo editor/);
    assert.match(modal,/Enviar arquivo ZIP/);
    assert.match(modal,/Do celular conectado/);
    assert.match(modal,/Nenhum arquivo será enviado/);
    h.element('bas-community-preview').emit('change',{
        target:{id:'bas-c-zip-input',files:[{name:'example.zip',size:600_000}]}
    });
    assert.match(h.element('bas-c-zip-result').textContent,/example\.zip/);
    assert.match(h.element('bas-c-zip-result').textContent,/Nenhum dado foi enviado/);
    assert.equal(script.includes('fetch('),false);
    assert.equal(script.includes('XMLHttpRequest'),false);
    assert.equal(script.includes('FormData('),false);
});

test('disabling developer mode closes preview immediately',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.setDeveloper(false);
    assert.equal(h.element('bas-community-preview').hidden,true);
    assert.equal(h.element('bas-community-launcher').hidden,true);
});

test('existing BAS keeps preview assets gated and local',()=>{
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    assert.match(html,/id="bas-community-launcher" hidden/);
    assert.match(html,/id="bas-community-preview"[^>]*hidden/);
    assert.match(html,/js\/community-preview\.js\?v=p15-b1/);
    assert.match(html,/css\/96-community-preview\.css\?v=p15-b1/);
    assert.match(html,/id="bas-community-feature-toggle"/);
});
