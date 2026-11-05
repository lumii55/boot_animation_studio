/* Node built-in regression suite: node --test tests/community-preview.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'js/community-preview.js'), 'utf8');

function harness(saved, language = 'pt', media = null) {
    let developer = false;
    const data = new Map(saved ? [['bas.community.preview.v1',saved]] : []);
    const elements = new Map(), windows = new Map(), docs = new Map();
    const document = {
        readyState: 'complete', activeElement: null, documentElement: {lang:language},
        body: {classList: {add(){}, remove(){}}},
        getElementById: element,
        querySelectorAll: () => [],
        createElement: name => {
            if(name!=='canvas'||!media)throw Error('Unexpected DOM element: '+name);
            return {width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:cb=>cb({size:4096,type:'image/webp'})};
        },
        addEventListener: (name,listener) => docs.set(name,listener)
    };
    function element(id) {
        if (!elements.has(id)) {
            const callbacks = new Map();
            const node = {
                id, innerHTML:'', textContent:'', value:'', disabled:false, checked:false, isConnected:true,
                replaceChildren(){this.innerHTML='';},
                hidden: id==='bas-community-preview'||id==='bas-community-launcher',
                dataset:{}, attrs:{},
                classList:{add(){},remove(){},toggle(){},contains(){return false;}},
                addEventListener:(name,listener)=>callbacks.set(name,listener),
                emit:(name,event)=>callbacks.get(name)?.(event),
                setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k];},
                querySelectorAll:()=>[], querySelector:()=>null,
                style:{},clientWidth:320,clientHeight:320,
                getBoundingClientRect(){return {width:this.id==='bas-c-crop-stage'?320:320,height:this.id==='bas-c-crop-stage'?320:320};},
                contains(target){return target===this||target?.id==='bas-c-crop-image';},
                setPointerCapture(){},
                removeAttribute(k){delete this.attrs[k];},
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
    const context={window,document,localStorage};
    if(media){
        context.createImageBitmap=async()=>({width:1080,height:2400,close(){}});
        context.URL={createObjectURL:()=>{const url='blob:bas-test-'+(++media.serial);media.created.push(url);return url;},revokeObjectURL:url=>media.revoked.push(url)};
    }
    vm.runInNewContext(script,context,{filename:'community-preview.js'});
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
        element, window, context, data, click, docs, windows,
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


test('creator has banner, illustrated portrait, bio, join date and statistics',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.click('creator',{id:'lunar'});
    const profile=h.element('bas-c-view').innerHTML;
    assert.match(profile,/bas-c-profile-cover/);
    assert.match(profile,/bas-c-profile-avatar/);
    assert.match(profile,/data:image\/svg\+xml/);
    assert.match(profile,/Moonlit Studio/);
    assert.match(profile,/Coleciono luas/);
    assert.match(profile,/Na comunidade desde agosto de 2026/);
    assert.match(profile,/Seguir criador/);
    assert.match(profile,/profileFollowers|Seguidores/);
    assert.match(profile,/Animações do criador/);
    assert.match(h.element('bas-c-grid').innerHTML,/Lunar Dreams/);
    assert.doesNotMatch(h.element('bas-c-grid').innerHTML,/Neon Pulse/);
});

test('following and unfollowing a creator is local and temporary',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.click('creator',{id:'lunar'});
    const before=h.element('bas-c-view').innerHTML;
    assert.match(before,/>128<\/strong><span>Seguidores/);
    h.click('follow',{author:'Moonlit'});
    const followed=h.element('bas-c-view').innerHTML;
    assert.match(followed,/✓ Seguindo/);
    assert.match(followed,/>129<\/strong><span>Seguidores/);
    h.click('follow',{author:'Moonlit'});
    const unfollowed=h.element('bas-c-view').innerHTML;
    assert.match(unfollowed,/Seguir criador/);
    assert.match(unfollowed,/>128<\/strong><span>Seguidores/);
    assert.equal(h.data.has('bas.community.followers'),false);
});

test('creator profiles remain localized and direct navigation works',()=>{
    const h=harness(null,'en');
    h.enable();h.window.BASCommunityPreview.open();
    h.click('navigate',{route:'creators'});
    const directory=h.element('bas-c-view').innerHTML;
    assert.match(directory,/data:image\/svg\+xml/);
    h.click('creator',{id:'sakura'});
    const profile=h.element('bas-c-view').innerHTML;
    assert.match(profile,/Cherry blossoms/);
    assert.match(profile,/Follow creator/);
    assert.match(profile,/Part of the community since May 2026/);
    assert.match(profile,/Creator animations/);
});


test('profile editor is a clearly labeled local demo and preserves original gallery',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    assert.match(h.element('bas-c-grid').innerHTML,/Lunar Dreams/);
    h.click('signin');
    const view=h.element('bas-c-modal-host').innerHTML;
    assert.match(view,/Personalize seu perfil/);
    assert.match(view,/Prévia local, sem login real/);
    assert.match(view,/id="bas-c-account-form"/);
    assert.match(view,/name="display_name"/);
    assert.match(view,/id="bas-c-account-theme"/);
    assert.match(view,/PERFIL FICTÍCIO/);
    assert.equal(script.includes('fetch('),false);
});
test('draft profile saves only in memory and invalid HTML is never accepted',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();
    h.click('signin');
    const layer=h.element('bas-community-preview');
    layer.emit('input',{target:{id:'bas-c-account-handle',value:'mochi_test'}});
    layer.emit('input',{target:{id:'bas-c-account-name',value:'Mochi 🌸'}});
    layer.emit('input',{target:{id:'bas-c-account-bio',value:'Bio de exemplo.'}});
    layer.emit('change',{target:{id:'bas-c-account-theme',value:'sakura'}});
    assert.equal(h.window.BASCommunityPreview.state().profilePreview.handle,'creator_demo');
    let prevented=false;
    layer.emit('submit',{target:{id:'bas-c-account-form'},preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
    const data=h.window.BASCommunityPreview.state().profilePreview;
    assert.equal(data.handle,'mochi_test');
    assert.equal(data.display_name,'Mochi 🌸');
    assert.equal(data.theme,'sakura');
    assert.equal(h.data.has('bas.profile'),false);
    layer.emit('input',{target:{id:'bas-c-account-name',value:'<svg/onload=alert(1)>'}});
    layer.emit('submit',{target:{id:'bas-c-account-form'},preventDefault(){}});
    assert.equal(h.window.BASCommunityPreview.state().profilePreview.display_name,'Mochi 🌸');
    assert.match(h.element('bas-c-account-status').textContent,/Confira os campos/);
});


test('photo controls support both avatar and banner but never upload',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();h.click('signin');
    const modal=h.element('bas-c-modal-host').innerHTML;
    assert.match(modal,/id="bas-c-avatar-file"/);
    assert.match(modal,/id="bas-c-banner-file"/);
    assert.match(modal,/JPG, PNG ou WebP/);
    assert.match(modal,/Remover foto/);
    assert.match(modal,/Remover banner/);
    assert.equal(script.includes('fetch('),false);
    assert.equal(script.includes('FormData('),false);
});
test('crop editor offers zoom, dragging and apply for both local image types',async()=>{
    const media={serial:0,created:[],revoked:[]};
    const h=harness(null,'pt',media);
    h.enable();h.window.BASCommunityPreview.open();h.click('signin');
    const layer=h.element('bas-community-preview');
    const pngHeader=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
    const file={type:'image/png',size:150000,slice:()=>({arrayBuffer:async()=>pngHeader.buffer})};
    layer.emit('change',{target:{id:'bas-c-avatar-file',files:[file]}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.window.BASCommunityPreview.state().cropEditing,'avatar');
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.avatar,false);
    assert.match(h.element('bas-c-crop-host').innerHTML,/Ajustar imagem/);
    assert.match(h.element('bas-c-crop-host').innerHTML,/id="bas-c-crop-zoom"/);
    assert.match(h.element('bas-c-crop-host').innerHTML,/bas-c-crop-stage--avatar/);
    layer.emit('input',{target:{id:'bas-c-crop-zoom',value:'190'}});
    assert.equal(h.window.BASCommunityPreview.state().cropZoom,1.9);
    const stage=h.element('bas-c-crop-stage');
    const original=h.element('bas-c-crop-image').style.transform;
    layer.emit('pointerdown',{pointerId:1,clientX:120,clientY:140,target:stage,isPrimary:true,button:0,preventDefault(){}});
    layer.emit('pointermove',{pointerId:1,clientX:160,clientY:120});
    layer.emit('pointerup',{pointerId:1});
    assert.notEqual(h.element('bas-c-crop-image').style.transform,original);
    h.click('crop-apply');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.window.BASCommunityPreview.state().cropEditing,null);
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.avatar,true);
    assert.equal(h.element('bas-c-account-avatar').attrs.src,'blob:bas-test-2');
    assert.deepEqual(media.revoked,['blob:bas-test-1']);
    layer.emit('change',{target:{id:'bas-c-banner-file',files:[file]}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.window.BASCommunityPreview.state().cropEditing,'banner');
    assert.match(h.element('bas-c-crop-host').innerHTML,/bas-c-crop-stage--banner/);
    h.click('crop-apply');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.banner,true);
    assert.equal(h.element('bas-c-account-banner-image').attrs.src,'blob:bas-test-4');
    assert.equal(h.data.has('avatar'),false);
    assert.equal(h.data.has('banner'),false);
    h.click('remove-photo',{photo:'avatar'});
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.avatar,false);
    assert.ok(media.revoked.includes('blob:bas-test-2'));
    h.windows.get('pagehide')?.();
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.banner,false);
    assert.ok(media.revoked.includes('blob:bas-test-4'));
});
test('canceling a crop leaves the previously chosen photo intact',async()=>{
    const media={serial:0,created:[],revoked:[]};
    const h=harness(null,'pt',media);
    h.enable();h.window.BASCommunityPreview.open();h.click('signin');
    const layer=h.element('bas-community-preview');
    const pngHeader=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
    const file={type:'image/png',size:1000,slice:()=>({arrayBuffer:async()=>pngHeader.buffer})};
    layer.emit('change',{target:{id:'bas-c-avatar-file',files:[file]}});
    await new Promise(resolve=>setImmediate(resolve));
    h.click('crop-apply');
    await new Promise(resolve=>setImmediate(resolve));
    const existing=h.element('bas-c-account-avatar').attrs.src;
    layer.emit('change',{target:{id:'bas-c-avatar-file',files:[file]}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.window.BASCommunityPreview.state().cropEditing,'avatar');
    h.click('crop-cancel');
    assert.equal(h.window.BASCommunityPreview.state().cropEditing,null);
    assert.equal(h.element('bas-c-account-avatar').attrs.src,existing);
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.avatar,true);
    assert.ok(media.revoked.includes('blob:bas-test-3'));
});
test('photo validation rejects large files and forged file types before decoding',async()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();h.click('signin');
    const layer=h.element('bas-community-preview');
    layer.emit('change',{target:{id:'bas-c-avatar-file',files:[{type:'image/png',size:5*1024*1024}]}});
    assert.match(h.element('bas-c-account-status').textContent,/Imagem inválida/);
    layer.emit('change',{target:{id:'bas-c-banner-file',files:[{type:'image/svg+xml',size:1000}]}});
    assert.match(h.element('bas-c-account-status').textContent,/Imagem inválida/);
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.avatar,false);
    assert.equal(h.window.BASCommunityPreview.state().customPhotos.banner,false);
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


test('P15.6 publishing preview prepares all three paths without sending data',()=>{
    const h=harness();
    h.enable();h.window.BASCommunityPreview.open();h.click('upload');
    assert.equal(h.window.BASCommunityPreview.state().publishingPreview.source,'zip');
    assert.match(h.element('bas-c-modal-host').innerHTML,/id="bas-c-publish-title"/);
    assert.match(h.element('bas-c-modal-host').innerHTML,/id="bas-c-publish-rights"/);
    assert.match(h.element('bas-c-modal-host').innerHTML,/Nenhum arquivo será enviado/);
    h.click('publish-source',{source:'editor'});
    assert.equal(h.window.BASCommunityPreview.state().publishingPreview.source,'editor');
    assert.match(h.element('bas-c-modal-host').innerHTML,/arquivo exportado/);
    const layer=h.element('bas-community-preview');
    layer.emit('input',{target:{id:'bas-c-publish-title',value:'Minha Animação de Testes'}});
    layer.emit('change',{target:{id:'bas-c-publish-rights',checked:true}});
    h.click('publish-check');
    // The real integration may only prepare an editor submission after an
    // actual export; a title and rights checkbox are no longer sufficient.
    assert.equal(h.window.BASCommunityPreview.state().publishingPreview.ready,false);
    h.click('publish-source',{source:'companion'});
    assert.equal(h.window.BASCommunityPreview.state().publishingPreview.source,'companion');
    assert.match(h.element('bas-c-modal-host').innerHTML,/pareamento seguro/);
    h.click('publish-source',{source:'zip'});
    h.element('bas-community-preview').emit('change',{
        target:{id:'bas-c-zip-input',files:[{name:'test-boot.zip',size:800_000}]}
    });
    h.click('publish-check');
    assert.match(h.element('bas-c-publish-status').textContent,/Rascunho conferido/);
    assert.equal(script.includes('fetch('),false);
    assert.equal(script.includes('XMLHttpRequest'),false);
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
    assert.match(html,/js\/community-preview\.js\?v=p15-7-public-ux/);
    assert.match(html,/css\/96-community-preview\.css\?v=p15-7-public-ux/);
    assert.match(html,/id="bas-community-feature-toggle"/);
});

test('original BAS Community launcher opens native real-data view without Developer Lab or a second website',async()=>{
    const h=harness(null,'pt');
    const src=fs.readFileSync(path.join(root,'js/community-live.js'),'utf8');
    const user={handle:'real_bastester',display_name:'Perfil BAS real',bio:'Bio salva no D1'};
    h.window.BASCommunityOnline={
      available:()=>true,
      state:()=>({authenticated:true,user,moderator:false}),
      gallery:async()=>({items:[{id:'b'.repeat(32),title:'Natureza relaxante',
        handle:'real_bastester',summary:'Noite calma',tags:['natureza','one piece'],fps:30,width:1080,height:2400,license:'CC-BY-4.0'}]}),
      media:async()=>{throw Error('not connected')},
      drafts:async()=>({drafts:[]}),
      normalizeTags:txt=>txt.split(',').map(v=>v.trim())
    };
    h.context.setTimeout=setTimeout;
    h.context.clearTimeout=clearTimeout;
    h.context.Blob=Blob;
    h.context.FormData=FormData;
    h.context.URL=URL;
    vm.runInNewContext(src,h.context,{filename:'community-live.js'});
    h.window.BASCommunityPreview.sync();
    assert.equal(h.element('bas-community-launcher').hidden,false,'normal launcher is available');
    assert.equal(h.window.BASCommunityPreview.open(),true);
    await new Promise(setImmediate);
    const markup=h.element('bas-c-view').innerHTML;
    assert.match(markup,/Natureza relaxante/);
    assert.match(markup,/one piece/);
    assert.doesNotMatch(markup,/Cyber Circuit|Lunar Dreams|DEMO/);
    assert.match(h.element('bas-community-preview').innerHTML,/bas-c-sidebar/,'original Community layout preserved');
    // Harness DOM containment must model the browser: a click on a
    // Community button is inside the existing overlay.
    h.element('bas-community-preview').contains=()=>true;
    h.click('real-account');
    assert.match(h.element('bas-c-view').innerHTML,/Perfil BAS real/);
    assert.match(h.element('bas-c-view').innerHTML,/Bio salva no D1/);
});
