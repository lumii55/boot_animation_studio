/* P15.6 authenticated private submission from ZIP/editor bridge.
 * Only one-time user-confirmed uploads, never automatic publication.
 */
export const betaPublishingClient = `(()=>{
'use strict';
const $=id=>document.getElementById(id);
const form=$('publish-form'),status=$('publish-status'),list=$('publish-drafts'),
      input=$('publish-file'),source=$('publish-source'),submit=$('publish-submit');
const MAX_ARCHIVE=20*1024*1024;
const API='/v1/publishing';
let borrowedFile=null,submitting=false,fromCompanion=false;
const safeJSON=async response=>{try{return await response.json();}catch(_){return {}}};
const say=value=>{status.textContent=value;};
const failure=(response,data)=>new Error(String(data?.error||'HTTP '+response.status));
function toText(value){return typeof value==='string'?value:'';}
function validateFile(file){
  return file&&Number.isSafeInteger(file.size)&&file.size>0&&file.size<=MAX_ARCHIVE&&
    /^[A-Za-z0-9_. -]{1,86}\\.zip$/i.test(file.name);
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
  if(!/^[A-Za-z0-9_. -]{1,86}\\.zip$/i.test(filename))filename='bootanimation.zip';
  borrowedFile=new File([blob],filename,{type:'application/zip'});fromCompanion=device;
  if(!validateFile(borrowedFile))return;
  input.required=false;
  source.value='editor';
  $('publish-file-hint').textContent='Arquivo exportado recebido do editor BAS. O envio só ocorrerá depois da sua confirmação.';
  say('ZIP exportado recebido. Preencha os dados e confirme para enviar à quarentena privada.');
  $('publish-title').value=$('publish-title').value||filename.replace(/\\.zip$/i,'').slice(0,100);
}
const TRUSTED_EDITOR_ORIGINS=new Set(['http://127.0.0.1:8088','https://lumii55.github.io']);
const openerOrigin=new URLSearchParams(window.location.search).get('editor_origin');
if(TRUSTED_EDITOR_ORIGINS.has(openerOrigin)&&window.opener){
  window.addEventListener('message',ev=>{
    if(ev.origin!==openerOrigin||ev.source!==window.opener||
      ev.data?.type!=='bas:p15:export-ready')return;
    const value=ev.data;
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
  if(source.value!=='editor'&&source.value!=='companion')borrowedFile=null;\n  if(source.value!=='companion')fromCompanion=false;
  input.required=!borrowedFile;
});
input.addEventListener('change',()=>{
  borrowedFile=null;fromCompanion=false;input.required=true;
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
      desc.textContent=(labels[state]||'Em andamento')+' · '+toText(draft.filename).slice(0,90);
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
  const title=form.elements.title.value.trim();
  const license=form.elements.license.value;
  if(license==='all-rights-reserved'&&$('publish-remix').checked){
    say('A licença de direitos reservados não permite marcar remixes.');return;
  }
  if(!$('publish-rights').checked){say('Confirme que tem os direitos de compartilhar.');return;}
  if(!window.confirm('Enviar este ZIP para a fila PRIVADA de revisão do BAS? Ele não ficará público.'))return;
  submitting=true;submit.disabled=true;say('Reservando espaço para seu envio privado...');
  let draftId=null;
  try{
    const csrf=await getCSRF();
    const meta={source:source.value,title,summary:form.elements.summary.value,
      category:form.elements.category.value,license,author_credit:form.elements.author_credit.value,
      allows_remix:$('publish-remix').checked,rights_confirmed:true,
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
