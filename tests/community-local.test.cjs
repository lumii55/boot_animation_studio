'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(ROOT,'js/community-live.js'),'utf8');
const onlineSource=fs.readFileSync(path.join(ROOT,'js/community-online.js'),'utf8');
const previewSource=fs.readFileSync(path.join(ROOT,'js/community-preview.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
function fixture(userIsSignedIn=true){
 const els=new Map(),events=new Map();
 function get(id){
  if(!els.has(id))els.set(id,{
   id,innerHTML:'',value:'',hidden:false,checked:false,
   replaceChildren(){this.innerHTML=''},querySelector(){return null},
   querySelectorAll(){return []},contains(){return true},
   classList:{toggle(){},add(){},remove(){}},files:[]
  });
  return els.get(id);
 }
 const localUser={handle:'creator_test',display_name:'BAS <Creator>',bio:'Minha bio <script>'};
 const calls={login:0,gallery:0,profile:0};
 const app={available:()=>true,state:()=>({authenticated:userIsSignedIn,user:localUser,moderator:false}),
  gallery:async search=>{
   calls.gallery++;
   return {items:[{id:'a'.repeat(32),title:'Relaxante <img src=x onerror=alert(1)>',
    summary:'Animação tranquila',tags:['natureza','one piece'],
    fps:30,width:1080,height:2400,handle:'creator_test',license:'CC-BY-4.0'}]};
  },
  login:()=>{calls.login++;return Promise.resolve()},
  media:async()=>{throw Error('no media')},
  normalizeTags:value=>value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)
 };
 const window={BASCommunityOnline:app,
  BASI18n:{locale:'pt'},
  addEventListener:(name,cb)=>events.set(name,cb)};
 const scope={window,document:{getElementById:get},console,Blob,Promise,
  setTimeout,clearTimeout,FormData,URL,location:{},navigator:{}};
 vm.runInNewContext(script,scope);
 return {window,app,els,get,calls,events};
}
test('local BAS loads real Cloudflare cards inside existing Community, with escaped content',async()=>{
 const f=fixture();
 assert.equal(f.window.BASCommunityLive.active(),true);
 assert.equal(f.window.BASCommunityLive.mount(),true);
 await new Promise(resolve=>setImmediate(resolve));
 const markup=f.get('bas-c-view').innerHTML;
 assert.ok(markup.includes('Relaxante &lt;img'));
 assert.ok(!markup.includes('<img src=x'));
 assert.ok(markup.includes('one piece'));
 assert.ok(markup.includes('bas-c-card'));
 assert.ok(f.calls.gallery>0);
});
test('BAS account view uses real session profile rather than demo identity',async()=>{
 const f=fixture();
 const event={target:{closest:()=>({dataset:{cAction:'real-account'}})}};
 assert.equal(f.window.BASCommunityLive.handle(event),true);
 const html=f.get('bas-c-view').innerHTML;
 assert.ok(html.includes('BAS &lt;Creator&gt;'));
 assert.ok(html.includes('Minha bio &lt;script&gt;'));
 assert.ok(!html.includes('creator_demo'));
});
test('BAS publish form accepts a multiword tag only after explicit add button',async()=>{
 const f=fixture();
 f.window.BASCommunityLive.handle({target:{closest:()=>({dataset:{cAction:'upload'}})}});
 assert.ok(f.get('bas-c-view').innerHTML.includes('anime, natureza, relaxante'));
 assert.ok(!f.get('bas-c-view').innerHTML.includes('data-source="editor"'));
 const input=f.get('bas-live-tag-input');input.value='One piece, relaxante';
 f.window.BASCommunityLive.onInput({target:{id:'bas-live-tag-input',value:input.value}});
 assert.ok(!f.get('bas-c-view').innerHTML.includes('#one piece ×'));
 f.window.BASCommunityLive.handle({target:{closest:()=>({dataset:{cAction:'tag-add'}})}});
 const html=f.get('bas-c-view').innerHTML;
 assert.ok(html.includes('#one piece ×'));assert.ok(html.includes('#relaxante ×'));
});
test('original BAS alone owns user-facing Community HTML; backend exposes API only',()=>{
 assert.ok(html.includes('js/community-online.js'));
 assert.ok(html.includes('js/community-live.js'));
 assert.ok(html.includes('js/community-preview.js'));
 assert.doesNotMatch(previewSource,/PRIVATE_BETA_ORIGIN|privateBetaUrl|window\.open\(/);
 assert.doesNotMatch(onlineSource,/\/beta\/licenses|\/beta\/app\.js/);
 assert.ok(onlineSource.includes('/v1/auth/github/start'));
});
test('anonymous guest sees approved animations inside BAS without a login',async()=>{
 const f=fixture(false);
 f.window.BASCommunityLive.mount();
 await new Promise(resolve=>setImmediate(resolve));
 const html=f.get('bas-c-view').innerHTML;
 assert.ok(html.includes('Relaxante &lt;img'),html.slice(0,600));
 assert.ok(html.includes('one piece'));
 assert.ok(html.includes('Entrar com GitHub'));
 assert.ok(!html.includes('moderation-action'));
});
test('shipped BAS frontend contains no privileged administrator dashboard or admin token',()=>{
 const native=fs.readFileSync(path.join(ROOT,'js/community-live.js'),'utf8');
 assert.ok(!native.includes('moderation/decision/'));
 assert.ok(!native.includes('moderation/queue'));
 assert.ok(!native.includes('moderation/reports/'));
 const browser=fs.readFileSync(path.join(ROOT,'js/community-online.js'),'utf8');
 assert.ok(!browser.includes('moderation/decision/'));
 assert.ok(!browser.includes('moderation/queue'));
 assert.ok(!browser.includes('moderation/reports/'));
 assert.match(browser,/authenticated:false/,'guest endpoints do not require a token');
 assert.match(browser,/bas\.community\.return_after_oauth\.v1/);
});
test('guest sees apply-to-phone only when Companion grants direct upload/control',async()=>{
 const f=fixture(false);
 f.window.BASApi={
  hasFeature:feature=>feature==='direct_upload',
  hasPermission:permission=>permission==='control',
  ensureFeature:()=>true
 };
 f.window.BASCommunityLive.mount();
 await new Promise(resolve=>setImmediate(resolve));
 const selected={dataset:{cAction:'detail',id:'a'.repeat(32)}};
 f.window.BASCommunityLive.handle({target:{closest:()=>selected}});
 const ready=f.get('bas-c-view').innerHTML;
 assert.match(ready,/Aplicar no celular/);
 assert.match(ready,/Baixar ZIP/);
 f.window.BASApi.hasPermission=()=>false;
 f.window.BASCommunityLive.render();
 assert.doesNotMatch(f.get('bas-c-view').innerHTML,/Aplicar no celular/);
});

test('eight-language license guide explains each choice with permissions and examples',()=>{
 const src=fs.readFileSync(path.join(ROOT,'js/community-license-guide.js'),'utf8');
 const w={};
 vm.runInNewContext(src,{window:w});
 assert.deepEqual(Array.from(w.BASCommunityLicenses.supported),['pt','en','es','fr','de','it','ja','zh']);
 for(const lang of w.BASCommunityLicenses.supported){
  const guide=w.BASCommunityLicenses.forLanguage(lang);
  assert.ok(guide.intro.length>(['ja','zh'].includes(lang)?28:55),lang+' intro');
  assert.equal(guide.entries.length,4,lang+' choices');
  for(const section of guide.entries){
   assert.equal(section.length,3,lang+' shape');
   assert.ok(section[1].length>(lang==='zh'?50:lang==='ja'?65:145),lang+': '+section[0]);
   assert.ok(section[2].length>(['ja','zh'].includes(lang)?12:25),lang+' practical hint');
  }
  assert.ok(guide.note.length>(['ja','zh'].includes(lang)?65:105),lang+' legal note');
 }
});
test('live Community label translations include newest/popular and license help in six extra BAS languages',()=>{
 const src=fs.readFileSync(path.join(ROOT,'js/community-labels.js'),'utf8');
 const w={};
 vm.runInNewContext(src,{window:w});
 assert.deepEqual(Array.from(w.BASCommunityLabels.supported),['es','fr','de','it','ja','zh']);
 for(const lang of w.BASCommunityLabels.supported){
  for(const key of w.BASCommunityLabels.keys)
   assert.ok(w.BASCommunityLabels.text(lang,key),lang+' '+key);
  assert.notEqual(w.BASCommunityLabels.text(lang,'latest'),'Newest');
  assert.notEqual(w.BASCommunityLabels.text(lang,'popular'),'Popular');
 }
});
test('native Community upload has ONE ZIP control, ONE license question and no native confirm',()=>{
 const f=fixture();
 f.window.BASCommunityLive.handle({target:{closest:()=>({dataset:{cAction:'upload'}})}});
 const markup=f.get('bas-c-view').innerHTML;
 assert.equal((markup.match(/id="bas-live-zip"/g)||[]).length,1);
 assert.match(markup,/id="bas-live-zip"[^>]* hidden/,'native file input should be hidden');
 assert.equal((markup.match(/data-c-action="choose-zip"/g)||[]).length,1);
 assert.doesNotMatch(markup,/\? \?/);
 assert.doesNotMatch(script,/window\.(confirm|prompt|alert)\(/);
});
test('Creators tab opens, uses real publisher directory and links to their posts',async()=>{
 const f=fixture(false);
 f.app.creators=async()=>({creators:[{handle:'creator_test',display_name:'BAS <Creator>',animation_count:1}]});
 f.window.BASCommunityLive.mount();
 f.window.BASCommunityLive.handle({target:{closest:()=>({dataset:{cAction:'navigate',route:'creators'}})}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(f.get('bas-c-view').innerHTML,/BAS &lt;Creator&gt;/);
 f.window.BASCommunityLive.handle({target:{closest:()=>({dataset:{cAction:'creator',handle:'creator_test'}})}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(f.get('bas-c-view').innerHTML,/Relaxante &lt;img/);
});

test('report uses a BAS dialog instead of a browser prompt and clicks inside do not dismiss it',()=>{
 const f=fixture(true);
 const id='a'.repeat(32);
 f.window.BASCommunityLive.handle({target:{closest:()=>({dataset:{cAction:'report',id}})}});
 const modal=f.get('bas-c-modal-host');
 assert.match(modal.innerHTML,/bas-live-report-form/);
 assert.match(modal.innerHTML,/role="dialog"/);
 const backdrop={dataset:{cAction:'modal-close'},classList:{contains:v=>v==='bas-live-modal-backdrop'}};
 backdrop.closest=()=>backdrop;
 const inner={closest:()=>backdrop};
 f.window.BASCommunityLive.handle({target:inner});
 assert.match(modal.innerHTML,/bas-live-report-form/,'clicking inside report dialog must keep it open');
 f.window.BASCommunityLive.handle({target:backdrop});
 assert.equal(modal.innerHTML,'','click on actual background dismisses dialog');
});
