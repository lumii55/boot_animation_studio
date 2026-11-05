/* P15.6 authenticated private submission from ZIP/editor bridge.
 * Only one-time user-confirmed uploads, never automatic publication.
 */
export const betaPublishingClient = `(()=>{
'use strict';
const $=id=>document.getElementById(id);
const form=$('publish-form'),status=$('publish-status'),list=$('publish-drafts'),
      input=$('publish-file'),source=$('publish-source'),submit=$('publish-submit');
const MAX_ARCHIVE=20*1024*1024;
const safeLanguages=new Set(['en','pt','es','fr','de','it','ja','zh']);
const browserLanguage=typeof navigator==='object'&&navigator.language?navigator.language:'en';
const pageLanguage=(new URLSearchParams(window.location.search).get('lang')||browserLanguage)
  .split('-')[0].toLowerCase();
const basLanguage=safeLanguages.has(pageLanguage)?pageLanguage:'en';
const licenseLink=document.querySelector('.license-help');
if(licenseLink)licenseLink.href='/beta/licenses?lang='+encodeURIComponent(basLanguage);
const tags=[];
const tagEntry=$('publish-tags-input'),tagChips=$('publish-tag-chips'),
  tagAdd=$('publish-tags-add'),sourceChoice=$('source-choice');
function normalizeTag(raw){
  if(typeof raw!=='string')return null;
  const tag=raw.normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'')
    .replace(/\\s+/g,' ').replace(/^#/,'').trim().toLowerCase();
  return tag.length>0&&tag.length<=32&&/^[a-z0-9_-]+(?: [a-z0-9_-]+)*$/.test(tag)?tag:null;
}
function drawTags(){
  tagChips.replaceChildren();
  for(const tag of tags){
    const button=document.createElement('button');
    button.type='button';button.textContent='#'+tag+' ×';
    button.setAttribute('aria-label','Remover tag '+tag);
    button.addEventListener('click',()=>{
      const i=tags.indexOf(tag);if(i>=0)tags.splice(i,1);drawTags();
    });
    tagChips.append(button);
  }
}
function addTags(){
  const value=tagEntry.value;
  if(!value.trim())return;
  const incoming=value.split(',');
  const normalized=incoming.map(normalizeTag);
  if(normalized.some(tag=>!tag)){say('Use letras, números, espaços, - ou _. Separe tags usando vírgulas.');return;}
  const combined=[...new Set([...tags,...normalized])];
  if(combined.length>12){say('Limite de 12 tags atingido.');return;}
  tags.splice(0,tags.length,...combined);
  tagEntry.value='';
  drawTags();
}
tagAdd.addEventListener('click',addTags);
tagEntry.addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();addTags();}
});
const API='/v1/publishing';
let borrowedFile=null,submitting=false,fromCompanion=false;
const safeJSON=async response=>{try{return await response.json();}catch(_){return {}}};
const say=value=>{status.textContent=value;};
const failure=(response,data)=>new Error(String(data?.error||'HTTP '+response.status));
function toText(value){return typeof value==='string'?value:'';}
function validateFile(file){
  return file&&Number.isSafeInteger(file.size)&&file.size>0&&file.size<=MAX_ARCHIVE&&
    typeof file.name==='string'&&file.name.length<=90&&
    /^[A-Za-z0-9_. -]+$/.test(file.name)&&file.name.toLowerCase().endsWith('.zip');
}
function key(){
  const bytes=crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function fileChoice(){
  return input.files?.[0]||borrowedFile;
}
function setBorrowedFile(blob,filename,device=false){
  if(!(blob instanceof Blob)||blob.size<=0||blob.size>MAX_ARCHIVE)return;
  if(typeof filename!=='string'||!filename.toLowerCase().endsWith('.zip')||
      !/^[A-Za-z0-9_. -]{1,90}$/.test(filename))filename='bootanimation.zip';
  borrowedFile=new File([blob],filename,{type:'application/zip'});
  fromCompanion=device;
  if(!validateFile(borrowedFile))return;
  input.required=false;
  source.value=device?'companion':'editor';
  if(device){
    sourceChoice.hidden=false;source.querySelector('option[value="companion"]').hidden=false;
  }
  $('publish-file-hint').textContent='Arquivo recebido do BAS. O envio acontece apenas após sua confirmação.';
  say('ZIP recebido. Confira os detalhes e autorize o envio privado.');
  $('publish-title').value=$('publish-title').value||filename.slice(0,-4).slice(0,100);
}
const TRUSTED_EDITOR_ORIGINS=new Set(['http://127.0.0.1:8088','https://lumii55.github.io']);
const openerOrigin=new URLSearchParams(window.location.search).get('editor_origin');
if(TRUSTED_EDITOR_ORIGINS.has(openerOrigin)&&window.opener){
  window.addEventListener('message',ev=>{
    if(ev.origin!==openerOrigin||ev.source!==window.opener||
      !['bas:p15:export-ready','bas:p15:module-status'].includes(ev.data?.type))return;
    const value=ev.data;
    if(value.type==='bas:p15:module-status'){
      const connected=value.connected===true;
      sourceChoice.hidden=!connected;
      source.querySelector('option[value="companion"]').hidden=!connected;
      if(!connected&&source.value==='companion'){source.value='zip';fromCompanion=false;}
      return;
    }
    if(!['editor','zip','companion'].includes(value.source))return;
    setBorrowedFile(value.file,value.filename,value.source==='companion');
    if(source.value!==value.source)source.value=value.source;
    if(typeof value.title==='string')$('publish-title').value=value.title.slice(0,100);
    if(['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','all-rights-reserved'].includes(value.license))
      $('publish-license').value=value.license;
  });
  window.opener.postMessage({type:'bas:p15:portal-ready'},openerOrigin);
}
source.addEventListener('change',()=>{
  if(source.value==='zip'){borrowedFile=null;fromCompanion=false;}
  input.required=!borrowedFile;
});
input.addEventListener('change',()=>{
  borrowedFile=null;fromCompanion=false;source.value='zip';input.required=true;
  const file=input.files?.[0];
  if(file&&!validateFile(file))say('ZIP inválido ou acima do limite de 20 MiB.');
});
async function getCSRF(){
  const response=await fetch('/v1/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('Faça login novamente antes de enviar.');
  const data=await safeJSON(response);
  if(typeof data.csrf!=='string'||!data.csrf)throw new Error('Sessão incompleta.');
  return data.csrf;
}
async function drafts(){
  try{
    const response=await fetch(API+'/drafts',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){
      list.replaceChildren();const li=document.createElement('li');
      li.textContent=response.status===503?'Publicações privadas ainda não liberadas.':'Não foi possível consultar seus envios.';
      list.append(li);return;
    }
    const data=await safeJSON(response);
    list.replaceChildren();
    if(!Array.isArray(data.drafts)||data.drafts.length===0){
      const li=document.createElement('li');li.textContent='Você ainda não enviou nenhuma animação.';list.append(li);return;
    }
    for(const draft of data.drafts){
      const li=document.createElement('li');
      const title=document.createElement('strong'),desc=document.createElement('span');
      title.textContent=toText(draft.title).slice(0,100);
      const state=toText(draft.status);
      const labels={awaiting_upload:'Aguardando arquivo',pending_review:'Na fila de revisão privada',
        failed:'Falhou — nenhum arquivo público',cancelled:'Cancelado',processing:'Em processamento'};
      desc.textContent=(draft.moderation_status==='published'?'Aprovado no beta':
        draft.moderation_status==='rejected'?'Rejeitado':
        draft.moderation_status==='hidden'?'Oculto':
        labels[state]||'Em andamento')+' · '+toText(draft.filename).slice(0,90);
      li.append(title,desc);list.append(li);
    }
  }catch(_){say('Não foi possível atualizar a lista de envios.');}
}
form.addEventListener('submit',async ev=>{
  ev.preventDefault();
  if(submitting||!form.reportValidity())return;
  const file=fileChoice();
  if(!validateFile(file)){say('Selecione um ZIP válido de até 20 MiB.');return;}
  if(source.value==='companion'&&!fromCompanion){
    say('Para enviar pelo Companion, abra o BAS conectado ao dispositivo e autorize a leitura por lá.');return;
  }
  if(tagEntry.value.trim()){
    say('Clique em + Adicionar para confirmar suas tags antes de enviar.');return;
  }
  const title=form.elements.title.value.trim();
  const license=form.elements.license.value;
  if(!$('publish-rights').checked){say('Confirme que tem os direitos de compartilhar.');return;}
  if(!window.confirm('Enviar este ZIP para a fila PRIVADA de revisão do BAS? Ele não ficará público.'))return;
  submitting=true;submit.disabled=true;say('Reservando espaço para seu envio privado...');
  let draftId=null;
  try{
    const csrf=await getCSRF();
    const meta={source:source.value,title,summary:form.elements.summary.value,
      license,author_credit:form.elements.author_credit.value,
      tags:[...tags],allows_remix:license!=='all-rights-reserved',rights_confirmed:true,
      size_bytes:file.size,filename:file.name};
    if(source.value==='companion')meta.companion_permission_confirmed=true;
    const start=await fetch(API+'/drafts',{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','Idempotency-Key':key(),'X-CSRF-Token':csrf},
      body:JSON.stringify(meta)});
    const first=await safeJSON(start);
    if(!start.ok||typeof first.draft_id!=='string')throw failure(start,first);
    draftId=first.draft_id;say('Validando ZIP no servidor e enviando para quarentena privada...');
    const result=await fetch(API+'/drafts/'+encodeURIComponent(draftId)+'/zip',{
      method:'PUT',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/zip','X-CSRF-Token':csrf},body:file
    });
    const finish=await safeJSON(result);
    if(result.status!==202||finish.status!=='pending_review')throw failure(result,finish);
    say('Enviado com sucesso! Agora está na fila privada de revisão. ♡');
    borrowedFile=null;fromCompanion=false;input.value='';input.required=true;form.reset();
    tags.length=0;drawTags();source.value='zip';
    await drafts();
  }catch(e){
    say('Envio não concluído: '+(e.message||'falha desconhecida'));
    // Never re-attempt a partially completed upload automatically.
  }finally{submitting=false;submit.disabled=false;}
});
window.addEventListener('bas:authenticated',()=>{void drafts()});
void (async()=>{
  try{const r=await fetch('/v1/auth/me',{credentials:'same-origin',cache:'no-store'});
    if(r.ok)await drafts();
  }catch(_){}
})();
})();`;
