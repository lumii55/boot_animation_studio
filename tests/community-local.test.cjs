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
