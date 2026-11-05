/* Browser-only controller for the BAS Community private profile. */
export const profileClient = `(()=>{
'use strict';
const el=id=>document.getElementById(id);
let csrf=null,user=null,busy=false,crop=null;
const urls={avatar:null,banner:null};
const guest=el('guest'),member=el('member'),view=el('profile-view'),creations=el('creations'),edit=el('profile-edit'),form=el('profile-form'),status=el('status');
const say=t=>status.textContent=t;
const json=async r=>{try{return await r.json()}catch(_){return {}}};
function fill(){
  if(!user)return;
  for(const key of ['handle','display_name','bio'])form.elements[key].value=user[key]||'';
}
function profile(){
  if(!user)return;
  member.hidden=false;guest.hidden=true;
  el('view-name').textContent=user.display_name||user.handle;
  el('view-handle').textContent='@'+user.handle;
  el('view-bio').textContent=user.bio||'Ainda não escrevi minha biografia. ✧';
  el('avatar-initial').textContent=(user.display_name||user.handle||'✦').slice(0,1).toLocaleUpperCase();
  let joined='Criadora da comunidade';
  if(Number.isSafeInteger(user.created_at)){
    try{joined='Na comunidade desde '+new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(user.created_at*1000));}catch(_){}
  }
  el('view-joined').textContent=joined;
  view.hidden=false;creations.hidden=false;edit.hidden=true;
  history.replaceState(null,'','#meu-perfil');
}
function startEdit(){
  if(!user)return;
  fill();view.hidden=true;creations.hidden=true;edit.hidden=false;
  history.replaceState(null,'','#editar-perfil');
  form.elements.display_name.focus();
}
el('edit-profile').addEventListener('click',startEdit);
el('cancel-edit').addEventListener('click',profile);
el('discard').addEventListener('click',()=>{fill();profile()});
form.addEventListener('submit',async e=>{
  e.preventDefault();if(!csrf||!form.reportValidity())return;
  const btn=el('save');btn.disabled=true;say('Salvando perfil...');
  const value={};
  for(const k of ['handle','display_name','bio'])value[k]=form.elements[k].value;
  try{
    const r=await fetch('/v1/auth/profile',{method:'PATCH',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(value)});
    const d=await json(r);
    if(!r.ok||!d.user)throw Error('Não foi possível salvar: '+(d.error||r.status));
    user=d.user;profile();say('Perfil salvo! Seu cantinho foi atualizado. ♡');
  }catch(error){say(error.message||'Falha ao salvar.');}finally{btn.disabled=false}
});
function photo(kind,url){
  const old=urls[kind];urls[kind]=url;
  if(old)URL.revokeObjectURL(old);
  const img=el(kind+'-image');img.hidden=!url;
  if(url)img.src=url;else img.removeAttribute('src');
  if(kind==='avatar')el('avatar-initial').hidden=Boolean(url);
}
async function refreshPhoto(kind){
  if(!csrf)return;
  try{
    const r=await fetch('/v1/profile-media/'+kind,{credentials:'same-origin',cache:'no-store'});
    if(r.status===404||r.status===503)return;
    if(!r.ok)throw Error('Falha ao carregar a imagem ('+r.status+')');
    const blob=await r.blob();
    if(blob.type!=='image/webp'||blob.size>524288)throw Error('Imagem recebida inválida');
    photo(kind,URL.createObjectURL(blob));
  }catch(_){say('Perfil carregado, mas não foi possível obter uma das imagens.');}
}
async function boot(){
  try{
    const r=await fetch('/v1/auth/me',{credentials:'same-origin',cache:'no-store'});
    if(r.status===401){guest.hidden=false;member.hidden=true;say('Entre no beta para visualizar seu perfil.');return}
    if(!r.ok)throw Error('Sessão indisponível ('+r.status+').');
    const d=await json(r);if(!d.user||typeof d.csrf!=='string')throw Error('Sessão incompleta.');
    user=d.user;csrf=d.csrf;profile();say('Perfil BAS carregado. ✧');
    await Promise.all([refreshPhoto('avatar'),refreshPhoto('banner')]);
  }catch(error){member.hidden=true;guest.hidden=true;say(error.message||'Não foi possível abrir o perfil.');}
}
el('logout').addEventListener('click',async()=>{
  if(!csrf)return;
  const btn=el('logout');btn.disabled=true;say('Saindo...');
  try{
    const r=await fetch('/v1/auth/logout',{method:'POST',credentials:'same-origin',
      headers:{'X-CSRF-Token':csrf}});
    if(!r.ok)throw Error('Erro ao sair ('+r.status+').');
    user=null;csrf=null;photo('avatar',null);photo('banner',null);
    member.hidden=true;guest.hidden=false;say('Sessão encerrada.');
  }catch(error){say(error.message||'Falha ao sair.');}finally{btn.disabled=false}
});
const targets={avatar:{width:512,height:512,max:2097152},banner:{width:1280,height:480,max:4194304}};
for(const [button,kind] of [['change-avatar','avatar'],['change-banner','banner'],['edit-avatar','avatar'],['edit-banner','banner']])
  el(button).addEventListener('click',()=>{if(!busy)el('file-'+kind).click()});
const dialog=el('crop-dialog'),stage=el('crop-stage'),image=el('crop-source'),zoom=el('crop-zoom');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function metrics(){
  if(!crop)return null;
  const w=stage.clientWidth,h=stage.clientHeight;
  const scale=Math.max(w/crop.bitmap.width,h/crop.bitmap.height)*crop.zoom;
  const iw=crop.bitmap.width*scale,ih=crop.bitmap.height*scale;
  crop.x=clamp(crop.x,-(iw-w)/2,(iw-w)/2);
  crop.y=clamp(crop.y,-(ih-h)/2,(ih-h)/2);
  return {w,h,scale,iw,ih,left:(w-iw)/2+crop.x,top:(h-ih)/2+crop.y};
}
function drawCrop(){
  const m=metrics();if(!m)return;
  image.style.width=m.iw+'px';image.style.height=m.ih+'px';
  image.style.left=m.left+'px';image.style.top=m.top+'px';
  el('zoom-value').textContent=Math.round(crop.zoom*100)+'%';
}
function closeCrop(){
  if(!crop)return;const c=crop;crop=null;
  if(dialog.open)dialog.close();
  image.removeAttribute('src');
  URL.revokeObjectURL(c.url);if(c.bitmap.close)c.bitmap.close();
}
async function openCrop(kind,file){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>targets[kind].max){
    say('Escolha JPG, PNG ou WebP de até '+(targets[kind].max/1048576)+' MB.');return;
  }
  let bitmap;
  try{
    closeCrop();bitmap=await createImageBitmap(file);
    if(bitmap.width<1||bitmap.height<1||bitmap.width>10000||bitmap.height>10000||
        bitmap.width*bitmap.height>32000000)throw Error('Dimensões inválidas.');
    const url=URL.createObjectURL(file);
    crop={kind,bitmap,url,zoom:1,x:0,y:0,pointer:null};
    image.src=url;stage.classList.remove('avatar','banner');stage.classList.add(kind);
    el('crop-title').textContent=kind==='avatar'?'Enquadrar foto de perfil':'Enquadrar banner';
    zoom.value='100';dialog.showModal();requestAnimationFrame(drawCrop);
  }catch(error){if(bitmap&&bitmap.close)bitmap.close();say('Imagem inválida: '+(error.message||'erro ao abrir'))}
}
for(const kind of ['avatar','banner']){
  const input=el('file-'+kind);
  input.addEventListener('change',()=>{
    const file=input.files&&input.files[0];input.value='';
    void openCrop(kind,file);
  });
}
el('cancel-crop').addEventListener('click',closeCrop);
dialog.addEventListener('cancel',e=>{e.preventDefault();closeCrop()});
zoom.addEventListener('input',()=>{if(crop){crop.zoom=Number(zoom.value)/100;drawCrop()}});
el('reset-crop').addEventListener('click',()=>{
  if(crop){crop.zoom=1;crop.x=0;crop.y=0;zoom.value='100';drawCrop()}
});
stage.addEventListener('pointerdown',e=>{
  if(!crop)return;
  crop.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove',e=>{
  if(!crop||!crop.pointer||crop.pointer.id!==e.pointerId)return;
  crop.x+=e.clientX-crop.pointer.x;crop.y+=e.clientY-crop.pointer.y;
  crop.pointer.x=e.clientX;crop.pointer.y=e.clientY;drawCrop();
});
const stop=e=>{if(crop&&crop.pointer&&crop.pointer.id===e.pointerId)crop.pointer=null};
stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
stage.addEventListener('keydown',e=>{
  if(!crop||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();const step=e.shiftKey?20:5;
  if(e.key==='ArrowLeft')crop.x-=step;
  if(e.key==='ArrowRight')crop.x+=step;
  if(e.key==='ArrowUp')crop.y-=step;
  if(e.key==='ArrowDown')crop.y+=step;
  drawCrop();
});
el('apply-crop').addEventListener('click',async()=>{
  if(!crop||!csrf||busy)return;
  const c=crop,m=metrics(),target=targets[c.kind],btn=el('apply-crop');
  if(!m)return;
  busy=true;btn.disabled=true;say('Salvando imagem privada...');
  try{
    const canvas=document.createElement('canvas');
    canvas.width=target.width;canvas.height=target.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas indisponível.');
    const sx=clamp(-m.left/m.scale,0,c.bitmap.width);
    const sy=clamp(-m.top/m.scale,0,c.bitmap.height);
    const sw=Math.min(m.w/m.scale,c.bitmap.width-sx);
    const sh=Math.min(m.h/m.scale,c.bitmap.height-sy);
    if(sw<=0||sh<=0)throw Error('Enquadramento inválido.');
    ctx.drawImage(c.bitmap,sx,sy,sw,sh,0,0,target.width,target.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.83));
    if(!blob||blob.type!=='image/webp'||!blob.size||blob.size>target.max)
      throw Error('Recorte grande demais.');
    const r=await fetch('/v1/profile-media/'+c.kind,{
      method:'PUT',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'image/webp','X-CSRF-Token':csrf},body:blob
    });
    const result=await json(r);
    if(!r.ok)throw Error(r.status===503?'Armazenamento privado de fotos ainda indisponível.':
      'Falha ao salvar imagem: '+(result.error||r.status));
    const kind=c.kind;closeCrop();await refreshPhoto(kind);
    say((kind==='avatar'?'Foto de perfil':'Banner')+' salvo! ♡');
  }catch(error){say(error.message||'Erro ao processar imagem.');}
  finally{busy=false;btn.disabled=false;}
});
window.addEventListener('beforeunload',()=>{
  closeCrop();for(const kind of ['avatar','banner'])if(urls[kind])URL.revokeObjectURL(urls[kind]);
});
boot();
})();`;
