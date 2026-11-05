/* BAS P15.7 — data-only Cloudflare API client for the ORIGINAL local BAS.
 * Never navigates to a separate Community website. GitHub OAuth callback
 * sends a short-lived one-time handoff back to this local BAS, then
 * browsers authenticate API requests with an origin-bound opaque session.
 *
 * No GitHub access token or OAuth client secret ever reaches the browser.
 * Never put the BAS session into a URL, log, iframe or postMessage.
 */
(()=>{
'use strict';
const API='https://bas-community-staging.caiolive1000.workers.dev';
const MODE='bas-local';
const AUTH_KEY='bas.community.pkce.v1';
const RETURN_KEY='bas.community.return_after_oauth.v1';
const DB_NAME='bas.community.session.v1';
const trusted=(location.origin==='http://127.0.0.1:8088'&&location.pathname==='/')||
 (location.origin==='https://lumii55.github.io'&&
  ['/boot_animation_studio/','/boot_animation_studio/index.html'].includes(location.pathname));
let token=null,csrf=null,user=null,initPromise=null,moderator=false,lastError='',pictures={avatar:null,banner:null};
function randomToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function b64(bytes){
 return btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function digest(value){return b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
function returnTo(){
 if(location.origin==='http://127.0.0.1:8088')return 'http://127.0.0.1:8088/';
 return 'https://lumii55.github.io/boot_animation_studio/';
}
function browserStorage(){
 if(typeof indexedDB==='undefined')return Promise.resolve(null);
 return new Promise(resolve=>{
  try{
   const req=indexedDB.open(DB_NAME,1);
   req.onupgradeneeded=()=>req.result.createObjectStore('auth');
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>resolve(null);
   req.onblocked=()=>resolve(null);
  }catch(_){resolve(null);}
 });
}
async function save(value){
 const db=await browserStorage();
 if(db){
  await new Promise(resolve=>{
   try{
    const tx=db.transaction('auth','readwrite');
    tx.objectStore('auth').put(value,'access');
    tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
   }catch(_){resolve();}
  });
  db.close();
 }else{
  try{if(value)sessionStorage.setItem(DB_NAME,value);
    else sessionStorage.removeItem(DB_NAME);}catch(_){}
 }
}
async function load(){
 const db=await browserStorage();
 if(!db){try{return sessionStorage.getItem(DB_NAME);}catch(_){return null;}}
 const value=await new Promise(resolve=>{
  try{const req=db.transaction('auth','readonly').objectStore('auth').get('access');
   req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);
  }catch(_){resolve(null);}
 });
 db.close();return value;
}
function event(name,detail={}){
 try{window.dispatchEvent(new CustomEvent(name,{detail}));}catch(_){}
}
async function request(path,{method='GET',data=null,headers={},authenticated=true,raw=false}={}){
 if(!trusted)throw Error('A versão local deste BAS não está na origem autorizada.');
 if(!/^\/v1\/[a-z0-9/_-]+(?:\?[a-zA-Z0-9%&=+._-]*)?$/.test(path))
   throw Error('Rota da API inválida.');
 const outgoing=new Headers(headers);
 if(authenticated){
  if(!token)throw Error('Faça login com GitHub dentro do BAS.');
  outgoing.set('Authorization','Bearer '+token);
  if(method!=='GET'&&method!=='HEAD'&&csrf)outgoing.set('X-CSRF-Token',csrf);
 }
 let body;
 if(data!==null){
  if(data instanceof Blob){body=data;if(!outgoing.has('Content-Type'))outgoing.set('Content-Type',data.type||'application/octet-stream');}
  else{body=JSON.stringify(data);outgoing.set('Content-Type','application/json');}
 }
 const res=await fetch(API+path,{method,headers:outgoing,body,credentials:'omit',
  mode:'cors',cache:'no-store',redirect:'manual'});
 if(res.type==='opaqueredirect'||res.status>=300&&res.status<400)throw Error('Redirecionamento inesperado da API.');
 if(!res.ok){
  let reason='HTTP '+res.status;
  try{const json=await res.json();reason=json.error||reason;}catch(_){}
  if(res.status===401){token=null;csrf=null;user=null;moderator=false;await save(null);event('bas:community-auth');}
  throw Error(reason);
 }
 return raw?res:res.json();
}
async function refresh(){
 const info=await request('/v1/auth/me');
 if(!info.user||!info.csrf)throw Error('Sessão inválida.');
 user=info.user;csrf=info.csrf;
 event('bas:community-auth',{user});
 moderator=false; // Admin panel is a separate, non-BAS application.
 return user;
}
function restoreOriginalCommunity(){
 if(!user||sessionStorage.getItem(RETURN_KEY)!=='profile')return false;
 const open=window.BASCommunityPreview?.open;
 const live=window.BASCommunityLive;
 if(typeof open!=='function'||!live?.active())return false;
 if(!open())return false;
 live.showProfile?.();
 sessionStorage.removeItem(RETURN_KEY);
 return true;
}
window.addEventListener('load',()=>{void init().then(()=>restoreOriginalCommunity());});
window.addEventListener('pageshow',()=>{if(user)restoreOriginalCommunity();});
async function beginLogin(){
 if(!trusted||!crypto?.subtle)throw Error('BAS precisa de um navegador local seguro.');
 const verifier=randomToken(),challenge=await digest(verifier);
 sessionStorage.setItem(AUTH_KEY,verifier);
 sessionStorage.setItem(RETURN_KEY,'profile');
 const url=new URL(API+'/v1/auth/github/start');
 url.searchParams.set('mode',MODE);
 url.searchParams.set('return_to',returnTo());
 url.searchParams.set('challenge',challenge);
 window.location.assign(url.href);
}
async function exchangeGrant(grant){
 const verifier=sessionStorage.getItem(AUTH_KEY);
 sessionStorage.removeItem(AUTH_KEY);
 if(!/^[A-Za-z0-9_-]{43}$/.test(grant)||!/^[A-Za-z0-9_-]{43}$/.test(verifier||'')){
  throw Error('Login local expirado. Tente novamente.');
 }
 const result=await request('/v1/auth/local/exchange',{
  method:'POST',data:{grant,verifier},authenticated:false
 });
 if(!/^[A-Za-z0-9_-]{43}$/.test(result.access_token||''))throw Error('Sessão inválida.');
 token=result.access_token;
 await save(token);
 await refresh();
}
async function init(){
 if(!trusted)return false;
 if(initPromise)return initPromise;
 initPromise=(async()=>{
  const fragment=window.location.hash;
  if(fragment.startsWith('#bas-community-auth=')){
   // Clear the one-time grant from the address bar BEFORE requesting anything.
   history.replaceState(history.state,'',window.location.pathname+window.location.search);
   try{
    await exchangeGrant(fragment.slice('#bas-community-auth='.length));
    event('bas:community-login-success');
    restoreOriginalCommunity();
  }catch(e){lastError=e.message;token=null;await save(null);sessionStorage.removeItem(RETURN_KEY);event('bas:community-error',{error:lastError});}
  }else{
   token=await load();
   if(token)try{await refresh();}catch(e){lastError=e.message;token=null;await save(null);}
  }
  if(user&&sessionStorage.getItem(RETURN_KEY)==='profile')
   restoreOriginalCommunity();
  return Boolean(user);
 })();
 return initPromise;
}
async function logout(){
 if(token&&csrf)try{await request('/v1/auth/logout',{method:'POST',data:{}});}catch(_){}
 token=null;csrf=null;user=null;moderator=false;
 sessionStorage.removeItem(RETURN_KEY);
 for(const key of ['avatar','banner']){
  if(pictures[key])URL.revokeObjectURL(pictures[key]);pictures[key]=null;
 }
 await save(null);event('bas:community-auth');return true;
}
async function updateProfile(profile){
 const data=await request('/v1/auth/profile',{method:'PATCH',data:profile});
 user=data.user;event('bas:community-auth',{user});return user;
}
function normalizeTags(value){
 const tags=[];
 for(const raw of String(value||'').split(',')){
  const tag=raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
   .trim().replace(/\s+/g,' ').toLowerCase();
  if(!tag)continue;
  if(tag.length>32||!/^[a-z0-9_-]+(?: [a-z0-9_-]+)*$/.test(tag))
   throw Error('Tags devem ter até 32 caracteres, letras, números ou espaços.');
  if(!tags.includes(tag))tags.push(tag);
 }
 if(tags.length>12)throw Error('Limite de 12 tags.');
 return tags;
}
async function gallery(search='',offset=0,sort='newest',creator=''){
 const q=new URLSearchParams({q:String(search).slice(0,80),offset:String(offset),limit:'12',sort});
 if(creator)q.set('creator',creator);
 return request('/v1/beta/catalog?'+q.toString(),{authenticated:false});
}
async function creators(){
 return request('/v1/beta/creators',{authenticated:false});
}
const socialId=id=>{if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid social item ID');return id;};
const socialHandle=h=>{if(!/^[A-Za-z0-9_]{3,32}$/.test(h))throw Error('Invalid creator handle');return h;};
async function socialAnimation(id,offset=0){
 const path='/v1/social/animations/'+socialId(id)+'?offset='+Math.max(0,Number(offset)||0);
 return request(path,{authenticated:Boolean(token&&user)});
}
async function socialCreator(handle){
 return request('/v1/social/creators/'+socialHandle(handle),{authenticated:Boolean(token&&user)});
}
async function animationDetail(id){return request('/v1/beta/animations/'+socialId(id),{authenticated:false});}
async function likeAnimation(id,enabled){
 return request('/v1/social/animations/'+socialId(id)+'/like',{method:enabled?'PUT':'DELETE'});
}
async function followCreator(handle,enabled){
 return request('/v1/social/creators/'+socialHandle(handle)+'/follow',{method:enabled?'PUT':'DELETE'});
}
async function addComment(id,text){
 return request('/v1/social/animations/'+socialId(id)+'/comments',{method:'POST',data:{text}});
}
async function likeComment(id,enabled){
 return request('/v1/social/comments/'+socialId(id)+'/like',{method:enabled?'PUT':'DELETE'});
}
async function reportComment(id,reason){
 return request('/v1/social/comments/'+socialId(id)+'/reports',{method:'POST',data:{reason}});
}
async function report(id,reason){
 if(!/^[a-f0-9]{32}$/.test(id))throw Error('ID inválido.');
 return request('/v1/beta/reports',{method:'POST',data:{animation_id:id,reason}});
}
async function publishArchive(file,meta){
 if(!token||!user||!csrf)throw Error('Entre na sua conta primeiro.');
 if(!(file instanceof Blob)||file.size<1||file.size>20*1024*1024)
  throw Error('ZIP ausente ou maior que 20 MiB.');
 const filename=String(meta.filename||file.name||'bootanimation.zip');
 if(filename.length>220||!filename.toLowerCase().endsWith('.zip'))
  throw Error('Selecione um arquivo .zip válido.');
 const license=String(meta.license||'CC-BY-4.0');
 const source=String(meta.source||'zip');
 if(!['editor','zip','companion'].includes(source))throw Error('Origem inválida.');
 if(!['CC-BY-4.0','CC-BY-SA-4.0','CC0-1.0','all-rights-reserved'].includes(license))
  throw Error('Licença inválida.');
 const start=await request('/v1/publishing/drafts',{
  method:'POST',headers:{'Idempotency-Key':randomToken().slice(0,40)},
  data:{source,title:String(meta.title||'').trim().slice(0,100),
   summary:String(meta.summary||'').trim().slice(0,1000),
   tags:normalizeTags(meta.tags||''),license,author_credit:String(meta.author_credit||user.display_name).slice(0,120),
   allows_remix:license!=='all-rights-reserved',rights_confirmed:true,
   ...(source==='companion'?{companion_permission_confirmed:true}:{}),
   size_bytes:file.size,filename:'bootanimation.zip',
   ...(source==='editor'&&/^[a-f0-9]{32}$/.test(meta.remix_of||'')?{remix_of:meta.remix_of}:{})}
 });
 if(!/^[a-f0-9]{32}$/.test(start.draft_id||''))throw Error('Rascunho inválido.');
 const complete=await request('/v1/publishing/drafts/'+start.draft_id+'/zip',{
  method:'PUT',data:new Blob([file],{type:'application/zip'})
 });
 try{
  const gif=await window.BASCommunityGif.fromBootZip(file);
  await request('/v1/publishing/drafts/'+start.draft_id+'/preview',{method:'PUT',data:gif});
  return {...complete,moderation_preview:'attached'};
 }catch(error){
  return {...complete,moderation_preview:'unavailable',moderation_preview_error:String(error?.message||error).slice(0,120)};
 }
}
async function drafts(){
 return request('/v1/publishing/drafts');
}
async function ownedAnimations(){
 return request('/v1/publishing/animations');
}
async function proposeRevision(animationId,fields,zip=null){
 if(!/^[a-f0-9]{32}$/.test(animationId))throw Error('Invalid animation ID');
 if(zip!==null&&(!(zip instanceof Blob)||zip.size<1||zip.size>20*1024*1024))
  throw Error('ZIP inválido ou maior que 20 MiB.');
 const license=String(fields.license||'');
 if(!['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','all-rights-reserved'].includes(license))
  throw Error('Licença inválida.');
 const payload={title:String(fields.title||'').trim(),summary:String(fields.summary||''),
  tags:normalizeTags(fields.tags||''),license,
  author_credit:String(fields.author_credit||'').trim(),
  allows_remix:license!=='all-rights-reserved',rights_confirmed:true,
  replace_zip:Boolean(zip),...(zip?{size_bytes:zip.size}:{})};
 const start=await request('/v1/publishing/animations/'+animationId+'/revisions',{
  method:'POST',headers:{'Idempotency-Key':randomToken().slice(0,40)},data:payload
 });
 if(!/^[a-f0-9]{32}$/.test(start.revision_id||''))throw Error('Invalid revision response');
 if(!zip)return start;
 const complete=await request('/v1/publishing/revisions/'+start.revision_id+'/zip',{
  method:'PUT',data:new Blob([zip],{type:'application/zip'})});
 try{
  const gif=await window.BASCommunityGif.fromBootZip(zip);
  await request('/v1/publishing/revisions/'+start.revision_id+'/preview',{method:'PUT',data:gif});
  return {...complete,moderation_preview:'attached'};
 }catch(error){
  return {...complete,moderation_preview:'unavailable',moderation_preview_error:String(error?.message||error).slice(0,120)};
 }
}
async function cancelRevision(revisionId){
 if(!/^[a-f0-9]{32}$/.test(revisionId))throw Error('Invalid revision ID');
 return request('/v1/publishing/revisions/'+revisionId+'/cancel',{method:'POST',data:{}});
}
async function withdrawAnimation(animationId){
 if(!/^[a-f0-9]{32}$/.test(animationId))throw Error('Invalid animation ID');
 return request('/v1/publishing/animations/'+animationId+'/remove',{
  method:'POST',data:{confirm:true}
 });
}
async function approvedZip(id){
 if(!/^[a-f0-9]{32}$/.test(id))throw Error('ID inválido.');
 const res=await request('/v1/beta/downloads/'+id,{raw:true,authenticated:false});
 const blob=await res.blob();
 if(blob.size<1||blob.size>20*1024*1024)throw Error('ZIP inválido.');
 return blob;
}
async function download(id){
 const blob=await approvedZip(id);
 const address=URL.createObjectURL(blob);
 try{
  const a=document.createElement('a');a.href=address;a.download='bootanimation.zip';
  document.body.append(a);a.click();a.remove();
 }finally{window.setTimeout(()=>URL.revokeObjectURL(address),60000);}
}
async function media(kind){
 if(!['avatar','banner'].includes(kind))throw Error('Tipo inválido.');
 const res=await request('/v1/profile-media/'+kind,{raw:true});
 const blob=await res.blob();
 if(!blob.size||blob.size>1024*1024)throw Error('Imagem inválida.');
 if(pictures[kind])URL.revokeObjectURL(pictures[kind]);
 pictures[kind]=URL.createObjectURL(blob);
 return pictures[kind];
}
async function updateMedia(kind,image){
 if(!['avatar','banner'].includes(kind)||!(image instanceof Blob))throw Error('Imagem inválida.');
 const limit=kind==='avatar'?2*1024*1024:4*1024*1024;
 if(image.size<1||image.size>limit||!['image/jpeg','image/png','image/webp'].includes(image.type))
  throw Error('Formato ou tamanho inválido.');
 const res=await request('/v1/profile-media/'+kind,{method:'PUT',
  headers:{'Content-Type':image.type},data:image});
 await media(kind);
 return res;
}
async function setAvatarVisibility(visible){
 if(typeof visible!=='boolean')throw Error('Preferência inválida.');
 const result=await request('/v1/social/me/avatar-visibility',{method:'PUT',data:{visible}});
 if(user)user={...user,avatar_public:result.avatar_public};
 return result;
}
function publicState(){
 return Object.freeze({authenticated:Boolean(token&&user),user:user?{...user}:null,
  hasSession:Boolean(token),error:lastError});
}
window.BASCommunityOnline=Object.freeze({
 available:()=>trusted,apiOrigin:API,init,login:beginLogin,logout,
 state:publicState,refresh,profile:updateProfile,gallery,creators,report,
 publish:publishArchive,drafts,download,approvedZip,media,updateMedia,setAvatarVisibility,normalizeTags,
 socialAnimation,socialCreator,animationDetail,likeAnimation,followCreator,addComment,likeComment,reportComment,
 ownedAnimations,proposeRevision,cancelRevision,withdrawAnimation
});
window.addEventListener('DOMContentLoaded',()=>{void init();});
})();
