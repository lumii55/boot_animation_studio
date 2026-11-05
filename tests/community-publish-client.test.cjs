'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../js/community-online.js'),'utf8');
const draftId='1'.repeat(32);
async function loggedClient(){
 const calls=[],storage=new Map();
 const verifier='A'.repeat(43),grant='B'.repeat(43);
 storage.set('bas.community.pkce.v1',verifier);
 const sessionStorage={
  setItem(k,v){storage.set(k,v)},getItem:k=>storage.get(k)||null,
  removeItem:k=>storage.delete(k)
 };
 const location={origin:'http://127.0.0.1:8088',pathname:'/',
  search:'',hash:'#bas-community-auth='+grant};
 const window={location,addEventListener(){}};
 const mock=async(uri,opts)=>{
  const endpoint=new URL(uri).pathname;
  const body=typeof opts?.body==='string'?JSON.parse(opts.body):null;
  calls.push({endpoint,body,opts});
  let data;
  if(endpoint.endsWith('/auth/local/exchange'))data={access_token:'C'.repeat(43),token_type:'Bearer'};
  else if(endpoint.endsWith('/auth/me'))data={user:{handle:'test',display_name:'Test User'},csrf:'D'.repeat(64)};
  else if(endpoint==='/v1/publishing/drafts')data={draft_id:draftId};
  else if(endpoint.endsWith('/zip'))data={status:'pending_review'};
  else throw Error('Unexpected API path '+endpoint);
  return {ok:true,status:200,type:'basic',json:async()=>data};
 };
 vm.runInNewContext(source,{window,location,sessionStorage,
  history:{state:null,replaceState(){}},navigator:{},
  indexedDB:undefined,crypto:webcrypto,fetch:mock,
  btoa,Blob,URL,URLSearchParams,Headers,TextEncoder,
  console}, {filename:'community-online.js'});
 assert.equal(await window.BASCommunityOnline.init(),true);
 return {api:window.BASCommunityOnline,calls};
}
test('normal ZIP metadata omits Companion-only field and uses a portable filename',async()=>{
 const {api,calls}=await loggedClient();
 const result=await api.publish(new Blob([new Uint8Array([80,75,3,4])]),{
  source:'zip',filename:'Meu arquivo especial (2026).zip',
  title:'Minha animação especial',summary:'natureza',tags:'One piece, Teste',
  license:'CC0-1.0',author_credit:'Test User'
 });
 assert.equal(result.status,'pending_review');
 const data=calls.find(c=>c.endpoint==='/v1/publishing/drafts').body;
 assert.equal(data.source,'zip');
 assert.ok(!Object.hasOwn(data,'companion_permission_confirmed'),
  'ZIP from file picker must not send Companion provenance');
 assert.deepEqual(Array.from(data.tags),['one piece','teste']);
 assert.equal(data.filename,'bootanimation.zip');
 assert.equal(data.allows_remix,true);
 assert.equal(data.rights_confirmed,true);
 assert.ok(calls.some(c=>c.endpoint.endsWith('/zip')));
});
test('editor ZIP omits device provenance and Companion ZIP includes it',async()=>{
 const {api,calls}=await loggedClient();
 for(const sourceName of ['editor','companion']){
  await api.publish(new Blob([new Uint8Array([80,75,3,4])]),{
   source:sourceName,filename:'bootanimation.zip',title:'Test animation',
   summary:'',tags:'nature',license:'CC-BY-4.0'
  });
 }
 const drafts=calls.filter(c=>c.endpoint==='/v1/publishing/drafts').map(c=>c.body);
 assert.equal(drafts.length,2);
 assert.ok(!Object.hasOwn(drafts[0],'companion_permission_confirmed'));
 assert.equal(drafts[1].companion_permission_confirmed,true);
});
