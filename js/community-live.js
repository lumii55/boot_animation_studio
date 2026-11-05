/* P15.7 — real Community content inside BAS' EXISTING overlay/classes.
 * The BAS editor, global navigation, PWA and Companion stay untouched.
 * Cloudflare serves API data only. No Community HTML is fetched from it.
 */
(()=>{
'use strict';
const api=()=>window.BASCommunityOnline;
const active=()=>api()?.available()===true;
const logged=()=>api()?.state()?.authenticated===true;
const user=()=>api()?.state()?.user||null;
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const language=()=>{
 const v=window.BASI18n?.locale||'en';
 return ['en','pt','es','fr','de','it','ja','zh'].includes(v)?v:'en';
};
const PT={explore:'Explorar animações',ready:'Animações aprovadas',empty:'Ainda não há animações aprovadas neste beta.',
 search:'Busque pelo título ou por tags',upload:'Publicar animação',profile:'Meu perfil',manage:'Moderação',
 signin:'Entrar com GitHub',signout:'Sair',edit:'Editar perfil',save:'Salvar perfil',
 needLogin:'Entre com GitHub para acessar as publicações privadas.',view:'Ver detalhes',
 post:'Enviar para revisão privada',zip:'Escolher arquivo ZIP',title:'Título',
 desc:'Descrição',tags:'Tags',tagTip:'Espaços ficam na tag; vírgulas separam tags diferentes.',
 add:'+ Adicionar',license:'Licença',licenseHelp:'? Não sabe qual escolher?',
 author:'Créditos',rights:'Confirmo que possuo os direitos sobre esta animação.',
 report:'Denunciar no BAS',download:'Baixar ZIP',pending:'Aguardando aprovação',moderation:'Revisar envios',
 approve:'Aprovar',reject:'Negar',hide:'Ocultar',dismiss:'Dispensar denúncia',
 nothing:'Nenhum item aguardando moderação.',why:'Informe o motivo da decisão (mínimo 5 caracteres).',
 sent:'Animação enviada para revisão. Ela ainda não está pública.',
 viewProfile:'Perfil BAS',share:'Criar publicação',yes:'Continuar',cancel:'Cancelar'};
const EN={explore:'Explore animations',ready:'Approved animations',empty:'No approved animations in this private beta yet.',
 search:'Search titles or tags',upload:'Publish an animation',profile:'My profile',manage:'Moderation',
 signin:'Sign in with GitHub',signout:'Sign out',edit:'Edit profile',save:'Save profile',
 needLogin:'Sign in with GitHub to access private beta posts.',view:'View details',
 post:'Submit for private review',zip:'Choose a ZIP file',title:'Title',
 desc:'Description',tags:'Tags',tagTip:'Spaces stay within one tag; commas separate multiple tags.',
 add:'+ Add',license:'License',licenseHelp:'? Not sure which license?',
 author:'Credits',rights:'I confirm I own the rights to share this animation.',
 report:'Report on BAS',download:'Download ZIP',pending:'Awaiting review',moderation:'Review submissions',
 approve:'Approve',reject:'Deny',hide:'Hide',dismiss:'Dismiss report',
 nothing:'No submissions awaiting review.',why:'Give a reason (at least 5 characters).',
 sent:'Submitted for review. This animation is not public yet.',
 viewProfile:'BAS profile',share:'Create post',yes:'Continue',cancel:'Cancel'};
const tr=k=>(language()==='pt'?PT:EN)[k]||EN[k]||k;
const state={route:'explore',items:[],query:'',sort:'newest',loading:false,
 status:'',busy:false,selected:null,file:null,source:'zip',title:'',summary:'',
 license:'CC-BY-4.0',author:'',tags:[],rights:false,tagInput:'',drafts:[],
 moderation:null,remotePictures:{avatar:null,banner:null},profileDraft:null};
const appRoot=()=>document.getElementById('bas-c-view');
const overlay=()=>document.getElementById('bas-community-preview');
function chrome(){
 const root=overlay();if(!root)return;
 for(const button of root.querySelectorAll('[data-c-action="real-account"]')){
  button.textContent=logged()?'@'+user().handle:tr('signin');
 }
 for(const demo of root.querySelectorAll('[data-c-action="signin"],[data-c-action="logout"]')){
  demo.hidden=!logged();demo.textContent=tr('signout');demo.dataset.cAction=logged()?'logout':'signin';
 }
 for(const nav of root.querySelectorAll('[data-route="saved"]')){
  nav.textContent='♙ '+tr('profile');nav.dataset.route='profile';nav.hidden=!logged();
 }
 for(const nav of root.querySelectorAll('[data-route="creators"]')){
  nav.textContent='⚑ '+tr('manage');nav.dataset.route='moderation';
  nav.hidden=!api()?.state()?.moderator;
 }
 const badge=root.querySelector('.bas-c-topbadge');
 if(badge)badge.textContent='BAS · BETA';
 const foot=root.querySelector('.bas-c-footnote');
 if(foot)foot.textContent='BAS Community · '+(language()==='pt'?'Apenas conteúdo aprovado':'Approved content only');
 for(const nav of root.querySelectorAll('.bas-c-navbtn')){
  nav.classList.toggle('is-current',nav.dataset.route===state.route);
 }
}
function go(route){
 state.route=route;
 const modal=$('bas-c-modal-host');if(modal)modal.replaceChildren();
 render();
 if(route==='explore')void fetchGallery();
 if(route==='moderation')void fetchModeration();
 if(route==='profile'){void fetchPictures();void fetchDrafts();}
}
function statusHTML(){return state.status?'<p class="bas-live-status" role="status">'+safe(state.status)+'</p>':'';}
function welcome(){
 return '<section class="bas-c-hero"><div class="bas-c-hero__copy">'+
  '<span class="bas-c-kicker">BAS COMMUNITY · BETA</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('explore'))+'</h1>'+
  '<p>'+safe(logged()?tr('ready'):tr('needLogin'))+'</p>'+
  '<div class="bas-c-hero__actions">'+
   (logged()?'<button type="button" class="bas-c-button bas-c-button--bright" data-c-action="upload">＋ '+safe(tr('upload'))+'</button>':
   '<button type="button" class="bas-c-button bas-c-button--bright" data-c-action="login">'+safe(tr('signin'))+'</button>')+
  '</div></div><div class="bas-c-hero__figure" aria-hidden="true">'+
  '<span class="bas-c-hero__ring ring-one"></span><span class="bas-c-hero__ring ring-two"></span>'+
  '<span class="bas-c-hero__moon">☾</span></div></section>';
}
function realCard(item){
 return '<article class="bas-c-card">'+
  '<button type="button" class="bas-c-thumb" data-c-action="detail" data-id="'+safe(item.id)+'" aria-label="'+safe(item.title)+'">'+
   '<span class="bas-live-zip-symbol" aria-hidden="true">✦ ZIP</span></button>'+
  '<div class="bas-c-card__content"><div class="bas-c-card__meta"><span>'+safe((item.tags||[]).join(', '))+'</span>'+
   '<span>'+safe(item.fps)+' fps</span></div>'+
  '<button type="button" class="bas-c-card__title" data-c-action="detail" data-id="'+safe(item.id)+'">'+safe(item.title)+'</button>'+
  '<div class="bas-c-card__bottom"><span class="bas-c-author">@'+safe(item.handle)+'</span>'+
   '<button type="button" class="bas-c-heart" data-c-action="download" data-id="'+safe(item.id)+'">↓ ZIP</button>'+
  '</div></div></article>';
}
function galleryView(){
 return welcome()+'<section class="bas-c-sectionhead"><div><span class="bas-c-kicker">COMMUNITY</span>'+
  '<h2>'+safe(tr('ready'))+'</h2></div></section>'+
  '<div class="bas-c-controls"><label class="bas-c-search"><span aria-hidden="true">⌕</span>'+
  '<input type="search" id="bas-live-search" maxlength="80" autocomplete="off" placeholder="'+safe(tr('search'))+
   '" value="'+safe(state.query)+'"></label>'+
  '<label class="bas-c-sort"><select id="bas-live-sort"><option value="newest"'+(state.sort==='newest'?' selected':'')+'>Newest</option>'+
  '<option value="popular"'+(state.sort==='popular'?' selected':'')+'>Popular</option></select></label></div>'+
  statusHTML()+
  '<div class="bas-c-results-meta">'+safe(state.loading?'…':state.items.length)+' '+safe(tr('ready'))+'</div>'+
  '<div class="bas-c-grid">'+(logged()?(state.items.length?state.items.map(realCard).join(''):
   '<p class="bas-c-noresults">'+safe(tr('empty'))+'</p>'):'<p>'+safe(tr('needLogin'))+'</p>')+'</div>';
}
function profileView(){
 const person=user();
 if(!person)return welcome();
 const photos=state.remotePictures;
 const avatar=photos.avatar?
  '<img class="bas-c-profile-avatar" width="88" height="88" alt="Avatar BAS" src="'+safe(photos.avatar)+'">':
  '<span class="bas-live-avatar">✿</span>';
 const cover=photos.banner?
  '<img class="bas-c-account-cover-image" alt="Banner BAS" src="'+safe(photos.banner)+'">':
  '<span class="bas-c-profile-cover__orb" aria-hidden="true">✧</span>';
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS ACCOUNT</span>'+
   '<h1 id="bas-c-page-title">'+safe(tr('profile'))+'</h1></section>'+
  '<div class="bas-c-profile" data-theme="moon"><div class="bas-c-profile-cover">'+cover+'</div>'+
  '<div class="bas-c-profile-content"><div class="bas-c-profile-top"><div class="bas-c-profile-identity">'+avatar+
   '<div class="bas-c-profile-nameblock"><h3>'+safe(person.display_name)+'</h3>'+
    '<span>@'+safe(person.handle)+'</span></div></div></div>'+
   '<div class="bas-c-profile-bio"><strong>Bio</strong><p>'+safe(person.bio||'—')+'</p></div>'+
   '<div class="bas-live-actions"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="edit-profile">'+safe(tr('edit'))+'</button>'+
   '<button type="button" class="bas-c-button" data-c-action="upload">'+safe(tr('upload'))+'</button></div>'+
  '</div></div>'+
  '<section class="bas-c-sectionhead"><div><span class="bas-c-kicker">BAS COMMUNITY</span>'+
   '<h2>'+(language()==='pt'?'Minhas publicações':'My submissions')+'</h2></div></section>'+
  '<div class="bas-c-grid">'+(state.drafts.length?state.drafts.map(item=>
   '<article class="bas-c-card bas-live-admin-item"><div class="bas-c-card__content">'+
   '<h3>'+safe(item.title||item.filename||'ZIP')+'</h3>'+
   '<p>'+safe(item.moderation_status||item.status||'pending')+'</p></div></article>').join(''):
   '<p>'+(language()==='pt'?'Nenhum envio ainda.':'No submissions yet.')+'</p>')+'</div>'+
  statusHTML();
}
function editProfile(){
 const draft=state.profileDraft||user();
 if(!draft)return welcome();
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS ACCOUNT</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('edit'))+'</h1></section>'+
  '<form id="bas-live-profile-form" class="bas-c-publish-draft bas-live-form">'+
   '<label>Handle<input name="handle" minlength="3" maxlength="32" required pattern="[A-Za-z0-9_]{3,32}" value="'+safe(draft.handle)+'"></label>'+
   '<label>Name<input name="display_name" maxlength="80" required value="'+safe(draft.display_name)+'"></label>'+
   '<label>Bio<textarea name="bio" maxlength="500" rows="4">'+safe(draft.bio||'')+'</textarea></label>'+
   '<div class="bas-live-actions"><button type="submit" class="bas-c-button bas-c-button--bright">'+safe(tr('save'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="go-profile">'+safe(tr('cancel'))+'</button></div>'+
  '</form>'+
  '<div class="bas-c-publish-draft bas-live-form"><h3>Avatar / Banner</h3>'+
   '<label class="bas-c-photo-pick">Avatar <input type="file" id="bas-live-avatar-file" accept="image/png,image/jpeg,image/webp"></label>'+
   '<label class="bas-c-photo-pick">Banner <input type="file" id="bas-live-banner-file" accept="image/png,image/jpeg,image/webp"></label>'+
   '<p class="bas-live-hint">A imagem é processada e redimensionada privadamente no servidor.</p>'+
  '</div>'+statusHTML();
}
function detailsView(){
 const item=state.selected;
 if(!item)return galleryView();
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(item.title)+'</h1><p>@'+safe(item.handle)+'</p></section>'+
  '<div class="bas-c-publish-draft bas-live-detail"><p>'+safe(item.summary||'')+'</p>'+
   '<p>'+safe((item.tags||[]).map(x=>'#'+x).join(' · '))+'</p>'+
   '<p>'+safe(item.license)+' · '+safe(item.fps)+' fps · '+safe(item.width)+'×'+safe(item.height)+'</p>'+
   '<div class="bas-live-actions"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="download" data-id="'+safe(item.id)+'">'+safe(tr('download'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="report" data-id="'+safe(item.id)+'">'+safe(tr('report'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="back-gallery">'+safe(tr('cancel'))+'</button></div></div>'+statusHTML();
}
function moderatorView(){
 const queue=state.moderation;
 const submitted=Array.isArray(queue?.pending)?queue.pending:[];
 const reports=Array.isArray(queue?.reports)?queue.reports:[];
 const cards=submitted.map(item=>'<article class="bas-c-card bas-live-admin-item">'+
  '<div class="bas-c-card__content"><span class="bas-c-kicker">'+safe(tr('pending'))+'</span>'+
   '<h3>'+safe(item.title)+'</h3><p>@'+safe(item.handle)+'</p><p>'+safe(item.summary||'')+'</p>'+
   '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" data-c-action="moderation-action" data-id="'+safe(item.id)+'" data-decision="approve">'+safe(tr('approve'))+'</button>'+
    '<button class="bas-c-button" data-c-action="moderation-action" data-id="'+safe(item.id)+'" data-decision="reject">'+safe(tr('reject'))+'</button></div></div></article>').join('');
 const complaints=reports.map(item=>'<article class="bas-c-card bas-live-admin-item">'+
  '<div class="bas-c-card__content"><h3>'+safe(item.title)+'</h3>'+
   '<p>'+safe(item.reason)+'</p>'+
   '<div class="bas-live-actions"><button class="bas-c-button" data-c-action="moderation-action" data-id="'+safe(item.animation_id)+'" data-decision="hide">'+safe(tr('hide'))+'</button>'+
   '<button class="bas-c-button" data-c-action="dismiss-report" data-id="'+safe(item.id)+'">'+safe(tr('dismiss'))+'</button></div></div></article>').join('');
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS ADMIN · BETA</span>'+
   '<h1 id="bas-c-page-title">'+safe(tr('manage'))+'</h1>'+
   '<button type="button" class="bas-c-button" data-c-action="refresh-moderation">↻</button></section>'+
   statusHTML()+
   '<section class="bas-c-sectionhead"><h2>'+safe(tr('moderation'))+'</h2></section>'+
   '<div class="bas-c-grid">'+(cards||'<p>'+safe(tr('nothing'))+'</p>')+'</div>'+
   '<section class="bas-c-sectionhead"><h2>Reports</h2></section>'+
   '<div class="bas-c-grid">'+(complaints||'<p>'+safe(tr('nothing'))+'</p>')+'</div>';
}
function uploadView(){
 if(!logged())return welcome();
 const source=state.source;
 const connected=window.BASCommunityExport?.connected()===true;
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('upload'))+'</h1></section>'+
  '<div class="bas-c-publish-draft bas-live-form">'+
  (source==='editor'?'<p>✦ '+safe(language()==='pt'?'ZIP criado no editor':'ZIP created in the editor')+'</p>':
   '<div class="bas-live-actions"><button class="bas-c-button" data-c-action="choose-zip">'+safe(tr('zip'))+'</button>'+
   (connected?'<button class="bas-c-button" data-c-action="choose-companion">▣ Companion</button>':'')+'</div>')+
  '<input id="bas-live-zip" type="file" accept=".zip,application/zip"'+(source==='editor'?' hidden':'')+'>'+
  '<p class="bas-live-hint">'+safe(state.file?.filename||'bootanimation.zip')+'</p>'+
  '<form id="bas-live-publish-form" class="bas-live-form-fields">'+
  '<label>'+safe(tr('title'))+'<input name="title" id="bas-live-title" maxlength="100" minlength="3" required value="'+safe(state.title)+'"></label>'+
  '<label>'+safe(tr('desc'))+'<textarea name="summary" id="bas-live-summary" maxlength="1000">'+safe(state.summary)+'</textarea></label>'+
  '<label>'+safe(tr('tags'))+'</label>'+
  '<div class="bas-live-tags">'+state.tags.map(tag=>'<button type="button" data-c-action="tag-remove" data-tag="'+safe(tag)+'">#'+safe(tag)+' ×</button>').join('')+'</div>'+
  '<div class="bas-live-tag-row"><input id="bas-live-tag-input" type="text" autocomplete="off" maxlength="400" placeholder="anime, natureza, relaxante" value="'+safe(state.tagInput)+'">'+
   '<button class="bas-c-button" type="button" data-c-action="tag-add">'+safe(tr('add'))+'</button></div>'+
  '<p class="bas-live-hint">'+safe(tr('tagTip'))+'</p>'+
  '<label>'+safe(tr('license'))+' <button type="button" class="bas-live-link" data-c-action="licenses">'+safe(tr('licenseHelp'))+'</button>'+
   '<select id="bas-live-license" name="license">'+
   [['CC-BY-4.0','CC BY 4.0'],['CC-BY-SA-4.0','CC BY-SA 4.0'],['CC0-1.0','CC0 1.0'],['all-rights-reserved','All rights reserved']].map(pair=>
    '<option value="'+pair[0]+'"'+(state.license===pair[0]?' selected':'')+'>'+safe(pair[1])+'</option>').join('')+'</select></label>'+
  '<label>'+safe(tr('author'))+'<input name="credit" id="bas-live-credit" maxlength="120" value="'+safe(state.author||user()?.display_name||'')+'"></label>'+
  '<label class="bas-c-publish-rights"><input id="bas-live-rights" type="checkbox"'+(state.rights?' checked':'')+'> '+safe(tr('rights'))+'</label>'+
  '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" type="submit"'+(state.busy?' disabled':'')+'>'+safe(tr('post'))+'</button>'+
   '<button class="bas-c-button" type="button" data-c-action="back-gallery">'+safe(tr('cancel'))+'</button></div></form>'+
  statusHTML()+'</div>';
}
const LICENSES={
 pt:['Licença e direitos autorais','CC0: compartilhamento e remixes, inclusive comerciais, sem crédito obrigatório.',
 'CC BY: adaptações e uso comercial com crédito e indicação de mudanças.',
 'CC BY-SA: igual à BY, mas adaptações distribuídas mantêm licença compatível.',
 'Todos os direitos reservados: sem permissão geral para remix ou redistribuição. O BAS recebe apenas as permissões de hospedagem e download previstas nos termos.',
 'Não licencie material de terceiros sem ter os direitos. Licenças CC em geral são irrevogáveis para quem segue as condições.'],
 en:['License and copyright','CC0: free sharing, remixing and commercial use with no required credit.',
 'CC BY: adaptations and commercial use with attribution and notice of changes.',
 'CC BY-SA: same as BY, but shared adaptations must retain a compatible license.',
 'All rights reserved: no general remix or redistribution permission; BAS only hosts and provides downloads under its terms.',
 'Do not license other peoples works without permission. CC licenses are generally irrevocable for compliant users.'],
 es:['Licencia y derechos de autor','CC0: uso y modificación libre, incluso comercial, sin crédito obligatorio.',
 'CC BY: adaptaciones y uso comercial con atribución y nota de cambios.',
 'CC BY-SA: igual que BY, con licencia igual o compatible en adaptaciones compartidas.',
 'Todos los derechos reservados: no hay permiso general para redistribuir ni adaptar.',
 'No licencies obras de terceros sin permiso. Las licencias CC suelen ser irrevocables.'],
 fr:['Licence et droits d’auteur','CC0 : copie, adaptation et usage commercial sans obligation de crédit.',
 'CC BY : adaptation et usage commercial avec attribution et mention des changements.',
 'CC BY-SA : comme BY, avec partage sous licence identique ou compatible.',
 'Tous droits réservés : pas de permission générale de modifier ou redistribuer.',
 'Les droits des tiers doivent être respectés. Les licences CC sont généralement irrévocables.'],
 de:['Lizenz und Urheberrecht','CC0: kostenlose Bearbeitung und kommerzielle Nutzung ohne Namensnennung.',
 'CC BY: Änderungen und kommerzielle Nutzung mit Namensnennung und Änderungshinweis.',
 'CC BY-SA: wie BY, aber mit gleicher oder kompatibler Lizenz für geteilte Bearbeitungen.',
 'Alle Rechte vorbehalten: keine allgemeine Erlaubnis zur Bearbeitung oder Weitergabe.',
 'Fremde Rechte beachten. CC-Lizenzen sind für regelkonforme Nutzer meist unwiderruflich.'],
 it:['Licenze e copyright','CC0: modifica, condivisione e uso commerciale senza attribuzione obbligatoria.',
 'CC BY: modifiche e uso commerciale con attribuzione e indicazione dei cambiamenti.',
 'CC BY-SA: come BY, ma con licenza uguale o compatibile per adattamenti condivisi.',
 'Tutti i diritti riservati: nessun permesso generale di modifica o ridistribuzione.',
 'Rispetta i diritti di terzi. Le licenze CC sono generalmente irrevocabili.'],
 ja:['ライセンスと著作権','CC0：クレジットなしで改変、共有、商用利用が可能です。',
 'CC BY：作者表示と変更の明示を条件に改変・商用利用できます。',
 'CC BY-SA：BYと同様ですが、公開する改変作品にも互換ライセンスが必要です。',
 '全著作権を留保：改変や再配布を一般的に許可しません。',
 '第三者の権利を尊重してください。CCライセンスは原則取り消せません。'],
 zh:['许可和版权','CC0：无需署名即可修改、分享和商业使用。',
 'CC BY：署名并说明修改后可改编和商业使用。',
 'CC BY-SA：与BY类似，但共享改编作品时须采用兼容的许可。',
 '保留所有权利：不一般性允许改编和再次分发。',
 '请尊重第三方权利。CC许可对守约者通常不可撤销。']
};
function licensesView(){
 const sections=LICENSES[language()]||LICENSES.en;
 const links=['https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/licenses/by/4.0/','https://creativecommons.org/licenses/by-sa/4.0/'];
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(sections[0])+'</h1></section>'+
  '<div class="bas-c-publish-draft bas-live-guide">'+sections.slice(1).map((paragraph,i)=>
   '<p>'+safe(paragraph)+(i<3?' <a href="'+links[i]+'" target="_blank" rel="noopener noreferrer">Creative Commons</a>':'')+'</p>').join('')+
   '<button class="bas-c-button" data-c-action="back-publish">'+safe(tr('cancel'))+'</button></div>';
}
function render(){
 if(!active())return false;
 chrome();
 const target=appRoot();
 if(!target)return false;
 let content='';
 if(state.route==='profile')content=profileView();
 else if(state.route==='profile-edit')content=editProfile();
 else if(state.route==='moderation')content=moderatorView();
 else if(state.route==='detail')content=detailsView();
 else if(state.route==='upload')content=uploadView();
 else if(state.route==='licenses')content=licensesView();
 else content=galleryView();
 target.innerHTML=content;
 return true;
}
let gallerySequence=0,searchTimeout=null;
async function fetchGallery(){
 if(!logged()){state.items=[];render();return;}
 const seq=++gallerySequence;state.loading=true;state.status='';
 try{
  const results=await api().gallery(state.query,0,state.sort);
  if(seq!==gallerySequence)return;
  state.items=Array.isArray(results.items)?results.items:[];
 }catch(e){state.items=[];state.status=e.message;}
 finally{if(seq===gallerySequence){state.loading=false;render();}}
}
async function fetchModeration(){
 if(!logged()||!api().state().moderator)return;
 try{state.moderation=await api().queue();state.status='';}
 catch(e){state.moderation=null;state.status=e.message;}
 render();
}
async function fetchDrafts(){
 if(!logged())return;
 try{
  const answer=await api().drafts();
  state.drafts=Array.isArray(answer.drafts)?answer.drafts:[];
 }catch(_){state.drafts=[];}
 if(state.route==='profile')render();
}
async function fetchPictures(){
 if(!logged())return;
 for(const kind of ['avatar','banner']){
  try{state.remotePictures[kind]=await api().media(kind);}
  catch(_){state.remotePictures[kind]=null;}
 }
 if(state.route==='profile')render();
}
function openUpload(file=null,source='zip'){
 if(!active())return false;
 if(!logged()){state.status=tr('needLogin');void api().login();return false;}
 if(file){
  const blob=file.blob||file;
  const filename=file.filename||file.name||'bootanimation.zip';
  if(!(blob instanceof Blob)||blob.size>20*1024*1024||blob.size<1)return false;
  state.file={blob,filename};
  state.title=state.title||filename.replace(/\.zip$/i,'');
  state.source=source;
 }else{state.file=null;state.source='zip';}
 if(overlay()?.hidden)window.BASCommunityPreview?.open();
 go('upload');return true;
}
async function pullFromDevice(source,connected){
 if(!active()||!['system','module'].includes(source)||!connected)return false;
 if(!logged()){state.status=tr('needLogin');void api().login();return false;}
 if(!window.confirm('Ler uma CÓPIA do dispositivo e preparar publicação privada? O aparelho não será alterado.'))return false;
 try{
  if(typeof apiFetch!=='function')throw Error('Companion indisponível.');
  const res=await apiFetch('/pull?source='+source+'&t='+Date.now(),{method:'GET'});
  if(!res.ok)throw Error('Companion recusou a leitura.');
  if(Number(res.headers.get('Content-Length')||0)>20*1024*1024)throw Error('Arquivo grande demais.');
  const blob=await res.blob();
  if(blob.size<1||blob.size>20*1024*1024)throw Error('ZIP inválido.');
  return openUpload({blob,filename:'bootanimation.zip'},'companion');
 }catch(e){state.status=e.message;render();return false;}
}
function collectPublishForm(){
 const title=$('bas-live-title'),summary=$('bas-live-summary'),
  credit=$('bas-live-credit'),rights=$('bas-live-rights'),license=$('bas-live-license');
 if(title)state.title=title.value;
 if(summary)state.summary=summary.value;
 if(credit)state.author=credit.value;
 if(rights)state.rights=rights.checked;
 if(license)state.license=license.value;
 const tag=$('bas-live-tag-input');
 if(tag)state.tagInput=tag.value;
}
async function addTags(){
 collectPublishForm();
 try{
  const more=api().normalizeTags(state.tagInput);
  const combined=[...new Set([...state.tags,...more])];
  if(combined.length>12)throw Error('Máximo de 12 tags.');
  state.tags=combined;state.tagInput='';state.status='';
 }catch(e){state.status=e.message;}
 render();
}
async function sendPublish(){
 collectPublishForm();
 if(state.tagInput.trim()){state.status='Clique em + Adicionar para confirmar as tags.';render();return;}
 if(!state.file){state.status='Selecione um ZIP primeiro.';render();return;}
 if(!state.rights){state.status=tr('rights');render();return;}
 if(!state.title.trim()||state.title.trim().length<3){state.status='Título inválido.';render();return;}
 if(!window.confirm('Enviar para a fila PRIVADA de revisão do BAS? Não ficará público automaticamente.'))return;
 state.busy=true;state.status='Validando e enviando ZIP em segurança...';render();
 try{
  const result=await api().publish(state.file.blob,{
   filename:state.file.filename,source:state.source,title:state.title.trim(),
   summary:state.summary,tags:state.tags.join(', '),license:state.license,
   author_credit:state.author||user().display_name
  });
  if(result.status!=='pending_review')throw Error('O servidor não confirmou a revisão.');
  state.file=null;state.title='';state.summary='';state.tags=[];state.tagInput='';
  state.rights=false;state.author='';state.status=tr('sent');
  go('explore');
 }catch(e){state.status='Envio não concluído: '+e.message;}
 finally{state.busy=false;render();}
}
async function saveProfile(form){
 if(!form||!logged())return;
 const fields=new FormData(form);
 const payload={handle:String(fields.get('handle')||'').trim(),
  display_name:String(fields.get('display_name')||'').trim(),bio:String(fields.get('bio')||'')};
 state.busy=true;
 try{
  await api().profile(payload);
  state.status=language()==='pt'?'Perfil salvo!':'Profile saved!';
  go('profile');
 }catch(e){state.status=e.message;render();}
 finally{state.busy=false;}
}
async function updatePicture(file,kind){
 if(!file)return;
 state.status='Enviando imagem privada...';render();
 try{
  await api().updateMedia(kind,file);
  state.status='Imagem salva.';
  state.remotePictures[kind]=await api().media(kind);
  go('profile');
 }catch(e){state.status=e.message;render();}
}
async function decision(id,action){
 if(!logged()||!api().state().moderator)return;
 const reason=window.prompt(tr('why'));
 if(reason===null)return;
 if(reason.trim().length<5||reason.length>500){state.status=tr('why');render();return;}
 if(!window.confirm('Confirmar '+action+'?'))return;
 try{await api().decide(id,action,reason);await fetchModeration();await fetchGallery();}
 catch(e){state.status=e.message;render();}
}
async function dismiss(id){
 const reason=window.prompt(tr('why'));
 if(!reason||reason.trim().length<5)return;
 try{await api().dismissReport(id,reason);await fetchModeration();}
 catch(e){state.status=e.message;render();}
}
async function download(id){
 try{await api().download(id);}catch(e){state.status=e.message;render();}
}
async function report(id){
 const reason=window.prompt('Qual o motivo da denúncia? (5 a 500 caracteres)');
 if(reason===null)return;
 if(reason.trim().length<5||reason.length>500){state.status='Descreva o motivo (5 a 500 caracteres).';render();return;}
 try{await api().report(id,reason);state.status='Denúncia enviada pelo BAS.';}
 catch(e){state.status=e.message;}
 render();
}
function handle(event){
 if(!active()||!overlay()?.contains(event.target))return false;
 const hit=event.target.closest?.('[data-c-action]');
 if(!hit)return false;
 const action=hit.dataset.cAction,id=hit.dataset.id||'';
 if(action==='close'){window.BASCommunityPreview?.close();return true;}
 if(action==='real-account'||action==='signin'||action==='login'){
  if(logged())go('profile');else void api().login();return true;
 }
 if(action==='logout'){
  void api().logout().then(()=>{state.items=[];state.status='';go('explore');});return true;
 }
 if(action==='navigate'){
  const target=hit.dataset.route;
  if(target==='saved'||target==='profile'){go('profile');return true;}
  if(target==='moderation'||target==='creators'){go('moderation');return true;}
  go('explore');return true;
 }
 if(action==='upload'){openUpload();return true;}
 if(action==='choose-zip'){$('bas-live-zip')?.click();return true;}
 if(action==='choose-companion'){
  if(window.BASCommunityExport?.connected())window.BASCommunityExport.chooseDeviceSource();
  return true;
 }
 if(action==='tag-add'){void addTags();return true;}
 if(action==='tag-remove'){collectPublishForm();state.tags=state.tags.filter(x=>x!==hit.dataset.tag);render();return true;}
 if(action==='licenses'){collectPublishForm();go('licenses');return true;}
 if(action==='back-publish'){go('upload');return true;}
 if(action==='back-gallery'||action==='reset'){go('explore');return true;}
 if(action==='detail'){
  const entry=state.items.find(x=>x.id===id);
  if(entry){state.selected=entry;go('detail');}return true;
 }
 if(action==='download'){void download(id);return true;}
 if(action==='report'){void report(id);return true;}
 if(action==='edit-profile'){
  state.profileDraft={...user()};go('profile-edit');return true;
 }
 if(action==='go-profile'){go('profile');return true;}
 if(action==='moderation-action'){void decision(id,hit.dataset.decision);return true;}
 if(action==='dismiss-report'){void dismiss(id);return true;}
 if(action==='refresh-moderation'){void fetchModeration();return true;}
 // Never let BAS' old DEMO handlers process clicks inside a live Community.
 return true;
}
function onInput(event){
 if(!active())return false;
 const id=event.target?.id;
 if(id==='bas-live-search'){
  state.query=String(event.target.value);
  if(searchTimeout)clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>void fetchGallery(),280);
  return true;
 }
 const mapping={'bas-live-title':'title','bas-live-summary':'summary',
  'bas-live-credit':'author','bas-live-tag-input':'tagInput'};
 if(mapping[id]){state[mapping[id]]=event.target.value;return true;}
 return false;
}
function onChange(event){
 if(!active())return false;
 const id=event.target?.id;
 if(id==='bas-live-sort'){
  state.sort=event.target.value;void fetchGallery();return true;
 }
 if(id==='bas-live-zip'){
  const file=event.target.files?.[0];
  if(file){
   if(!file.name.toLowerCase().endsWith('.zip')||file.size<1||file.size>20*1024*1024){
    state.status='Arquivo ZIP inválido ou acima de 20 MiB.';
   }else{
    state.file={blob:file,filename:file.name};state.source='zip';
    if(!state.title)state.title=file.name.replace(/\.zip$/i,'');
    state.status='';
   }
   render();
  }
  return true;
 }
 if(id==='bas-live-rights'){state.rights=Boolean(event.target.checked);return true;}
 if(id==='bas-live-license'){state.license=String(event.target.value);return true;}
 if(id==='bas-live-avatar-file'||id==='bas-live-banner-file'){
  void updatePicture(event.target.files?.[0],id==='bas-live-avatar-file'?'avatar':'banner');return true;
 }
 return false;
}
function onSubmit(event){
 if(!active())return false;
 const id=event.target?.id;
 if(id==='bas-live-publish-form'){event.preventDefault();void sendPublish();return true;}
 if(id==='bas-live-profile-form'){event.preventDefault();void saveProfile(event.target);return true;}
 return false;
}
function mount(){
 if(!active())return false;
 const modal=$('bas-c-modal-host');if(modal)modal.replaceChildren();
 if(overlay()?.hidden)return false;
 chrome();
 render();
 if(logged()){void fetchGallery();void fetchPictures();void fetchDrafts();}
 return true;
}
window.BASCommunityLive=Object.freeze({active,mount,render,handle,onInput,onChange,onSubmit,openUpload,pullFromDevice});
window.addEventListener('bas:community-auth',()=>{
 if(!active())return;
 chrome();
 if(logged()){
  state.status='';
  if(state.route==='profile'||state.route==='profile-edit')go('profile');
  else go('explore');
  void fetchPictures();
 }else{state.items=[];state.moderation=null;state.remotePictures={avatar:null,banner:null};go('explore');}
});
window.addEventListener('bas:community-login-success',()=>{
 if(!active())return;
 if(window.BASCommunityPreview?.open()){
  state.route='profile';render();void fetchPictures();
 }
});
})();
