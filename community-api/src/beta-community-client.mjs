/* Read-only approved gallery + owner-only moderation. Never renders user HTML. */
export const betaCommunityClient = `(()=>{
'use strict';
const $=id=>document.getElementById(id);
const results=$('catalog-results'),more=$('catalog-more'),query=$('catalog-search');
const modPanel=$('moderation-panel'),modList=$('moderation-list'),reports=$('moderation-reports');
let offset=0,csrf=null,loading=false;
const api='/v1/beta/';
const read=async r=>{try{return await r.json();}catch(_){return {}}};
const txt=(v,len=150)=>typeof v==='string'?v.slice(0,len):'';
function node(tag,text,cls){
 const n=document.createElement(tag);if(text!==undefined)n.textContent=text;
 if(cls)n.className=cls;return n;
}
function button(text,cb,cls='btn subtle'){
 const b=node('button',text,cls);b.type='button';b.addEventListener('click',cb);return b;
}
async function token(){
 const r=await fetch('/v1/auth/me',{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('Entre novamente na conta.');
 const data=await read(r);
 if(!data.csrf)throw Error('Sessão incompleta.');
 csrf=data.csrf;return csrf;
}
async function post(endpoint,data){
 const t=await token();
 const r=await fetch(api+endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json','X-CSRF-Token':t},body:JSON.stringify(data)});
 const payload=await read(r);
 if(!r.ok)throw Error(payload.error||'Erro HTTP '+r.status);
 return payload;
}
async function search(reset=false){
 if(loading)return;
 if(reset){offset=0;results.replaceChildren();}
 loading=true;more.disabled=true;
 try{
  const params=new URLSearchParams({q:query.value,limit:'12',offset:String(offset)});
  const res=await fetch(api+'catalog?'+params,{credentials:'same-origin',cache:'no-store'});
  const data=await read(res);
  if(!res.ok){
   if(reset)results.append(node('p','Galeria privada indisponível no momento.'));
   more.hidden=true;return;
  }
  const items=Array.isArray(data.items)?data.items:[];
  if(!items.length&&offset===0)results.append(node('p','Ainda não há animações aprovadas neste beta.'));
  for(const item of items){
   const card=node('article',undefined,'catalog-card');
   const title=node('h3',txt(item.title,100));card.append(title);
   card.append(node('p','por @'+txt(item.handle,32)));
   if(item.summary)card.append(node('p',txt(item.summary,500)));
   const holder=node('div');
   for(const tag of (Array.isArray(item.tags)?item.tags:[]).slice(0,12)){
    const tagButton=button('#'+txt(tag,32),()=>{query.value=tag;void search(true)},'tag');
    holder.append(tagButton);
   }
   card.append(holder);
   card.append(node('p',txt(item.license,35)+' · '+Number(item.fps||0)+' fps'));
   const actions=node('div',undefined,'profile-actions');
   const link=node('a','Baixar ZIP aprovado','btn outline');
   if(/^[a-f0-9]{32}$/.test(item.id)){
    link.href=api+'downloads/'+item.id;link.download='bootanimation.zip';
    actions.append(link);
    actions.append(button('Denunciar',async()=>{
     const reason=window.prompt('Por que esta animação deve ser revisada? (5 a 500 caracteres)');
     if(reason===null)return;
     try{await post('reports',{animation_id:item.id,reason});
      window.alert('Denúncia enviada para análise privada.');}
     catch(e){window.alert('Não foi possível denunciar: '+e.message);}
    }));
   }
   card.append(actions);results.append(card);
  }
  more.hidden=data.next_offset===null;
  if(data.next_offset!==null)offset=data.next_offset;
 }catch(_){if(reset)results.append(node('p','Não foi possível carregar a galeria.'));}
 finally{loading=false;more.disabled=false;}
}
$('catalog-find').addEventListener('click',()=>void search(true));
query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void search(true)}});
more.addEventListener('click',()=>void search());
async function review(id,action){
 const reason=window.prompt('Justificativa de moderação (5 a 500 caracteres):');
 if(reason===null)return;
 if(reason.trim().length<5||reason.length>500){
  window.alert('A justificativa deve ter de 5 a 500 caracteres.');return;
 }
 if(!window.confirm('Confirmar '+action+' neste beta privado?'))return;
 try{
  await post('moderation/decision/'+id,{action,reason});
  await Promise.all([moderation(),search(true)]);
 }catch(e){window.alert('Decisão não registrada: '+e.message);}
}
async function moderation(){
 try{
  const r=await fetch(api+'moderation/queue',{credentials:'same-origin',cache:'no-store'});
  if(r.status===403||r.status===404){modPanel.hidden=true;return;}
  if(!r.ok)throw Error('Fila indisponível');
  const data=await read(r);modPanel.hidden=false;
  modList.replaceChildren();reports.replaceChildren();
  if(!data.pending?.length)modList.append(node('p','Nenhuma animação aguardando revisão.'));
  for(const item of data.pending||[]){
   const box=node('article',undefined,'moderation-item');
   box.append(node('h3',txt(item.title,100)));
   box.append(node('p','@'+txt(item.handle,32)+' · '+txt(item.license,30)+' · '+
     Number(item.size_bytes||0)+' bytes'));
   box.append(node('p',txt(item.summary,500)));
   const actions=node('div',undefined,'actions');
   actions.append(button('Aprovar',()=>void review(item.id,'approve')));
   actions.append(button('Rejeitar',()=>void review(item.id,'reject')));
   box.append(actions);modList.append(box);
  }
  if(!data.reports?.length)reports.append(node('p','Nenhuma denúncia aberta.'));
  for(const item of data.reports||[]){
   const box=node('article',undefined,'moderation-item');
   box.append(node('h3',txt(item.title,100)));
   box.append(node('p','Denúncia: '+txt(item.reason,500)));
   box.append(button('Ocultar animação aprovada',()=>void review(item.animation_id,'hide')));
   box.append(button('Dispensar denúncia',async()=>{
     const reason=window.prompt('Por que dispensar a denúncia? (5 a 500 caracteres)');
     if(reason===null)return;
     try{await post('moderation/reports/'+item.id,{action:'dismiss',reason});
       await moderation();}
     catch(e){window.alert('Não foi possível registrar: '+e.message);}
   }));
   reports.append(box);
  }
 }catch(_){modPanel.hidden=true;}
}
$('moderation-refresh').addEventListener('click',()=>void moderation());
window.addEventListener('bas:authenticated',()=>{void search(true);void moderation()});
void (async()=>{try{await token();await Promise.all([search(true),moderation()]);}catch(_){}})();
})();`;
