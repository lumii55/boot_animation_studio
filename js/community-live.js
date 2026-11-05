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
const PT={explore:'Explorar animações',ready:'Descubra novas animações',empty:'Ainda não há animações por aqui. Que tal compartilhar a primeira?',
 search:'Busque pelo título ou por tags',upload:'Publicar animação',profile:'Meu perfil',manage:'Moderação',
 signin:'Entrar com GitHub',signout:'Sair',edit:'Editar perfil',save:'Salvar perfil',
 needLogin:'Descubra animações para deixar a inicialização do seu celular com a sua cara. Explore e baixe livremente!',view:'Ver detalhes',
 post:'Enviar para publicação',zip:'Escolher arquivo ZIP',title:'Título',
 desc:'Descrição',tags:'Tags',tagTip:'Espaços ficam na tag; vírgulas separam tags diferentes.',
 add:'+ Adicionar',license:'Licença',licenseHelp:'Não sabe qual escolher?',
 author:'Créditos',rights:'Confirmo que possuo os direitos sobre esta animação.',
 report:'Denunciar no BAS',download:'Baixar ZIP',pending:'Aguardando aprovação',moderation:'Revisar envios',
 approve:'Aprovar',reject:'Negar',hide:'Ocultar',dismiss:'Dispensar denúncia',
 nothing:'Nenhum item aguardando moderação.',why:'Informe o motivo da decisão (mínimo 5 caracteres).',
 sent:'Animação enviada para revisão. Ela ainda não está pública.',
 viewProfile:'Perfil BAS',share:'Criar publicação',yes:'Continuar',cancel:'Cancelar'};
const EN={explore:'Explore animations',ready:'Discover animations',empty:'No animations here yet. Be the first to share one!',
 search:'Search titles or tags',upload:'Publish an animation',profile:'My profile',manage:'Moderation',
 signin:'Sign in with GitHub',signout:'Sign out',edit:'Edit profile',save:'Save profile',
 needLogin:'Discover animations to make your phone startup your own. Explore and download freely!',view:'View details',
 post:'Submit for publication',zip:'Choose a ZIP file',title:'Title',
 desc:'Description',tags:'Tags',tagTip:'Spaces stay within one tag; commas separate multiple tags.',
 add:'+ Add',license:'License',licenseHelp:'Not sure which license?',
 author:'Credits',rights:'I confirm I own the rights to share this animation.',
 report:'Report on BAS',download:'Download ZIP',pending:'Awaiting review',moderation:'Review submissions',
 approve:'Approve',reject:'Deny',hide:'Hide',dismiss:'Dismiss report',
 nothing:'No submissions awaiting review.',why:'Give a reason (at least 5 characters).',
 sent:'Submitted for review. This animation is not public yet.',
 viewProfile:'BAS profile',share:'Create post',yes:'Continue',cancel:'Cancel'};
const EXTRA={
 pt:{
  noFile:'Nenhum arquivo selecionado',latest:'Mais recentes',popular:'Mais populares',
  collections:'Animações da comunidade',results:'animações',creators:'Criadores',
  creatorsDesc:'Conheça quem compartilha animações com a comunidade.',
  creatorWorks:'Animações deste criador',creatorEmpty:'Este criador ainda não publicou animações.',
  works:'publicações',allCreators:'Todos os criadores',noCreators:'Ainda não há criadores com publicações.',
  myPosts:'Minhas publicações',noPosts:'Você ainda não enviou uma animação.',
  name:'Nome',bio:'Sobre mim',imageHelp:'JPG, PNG ou WebP. Imagens armazenadas com privacidade.',
  photoAvatar:'Foto de perfil',photoBanner:'Banner',profileSaved:'Perfil atualizado!',
  sourceEditor:'Animação criada no editor',uploadHelp:'O arquivo será analisado antes de aparecer na galeria.',
  invalidZip:'Escolha um ZIP válido de até 20 MiB.',missingZip:'Escolha um arquivo ZIP antes de publicar.',
  missingTags:'Clique em + Adicionar para confirmar as tags.',
  missingRights:'Confirme que possui os direitos necessários para compartilhar.',
  invalidTitle:'O título deve ter entre 3 e 100 caracteres.',sending:'Enviando e validando a animação…',
  uploadError:'Não foi possível publicar',serverMetadata:'Confira título, tags, créditos e arquivo ZIP.',
  serverZip:'O ZIP não passou na validação. Confira o formato da animação.',
  signinRequired:'Entre com GitHub para publicar ou denunciar.',reportTitle:'Denunciar animação',
  reportHelp:'Descreva o problema para podermos revisar (5 a 500 caracteres).',
  reason:'Motivo',reportSent:'Denúncia enviada. Obrigada por ajudar!',reportError:'Não foi possível enviar a denúncia.',
  minReason:'Escreva de 5 a 500 caracteres.',send:'Enviar',apply:'Aplicar no celular',
  applyTitle:'Aplicar esta animação no celular?',
  applyHelp:'Isso substituirá a animação atual. Recomendamos fazer um backup antes.',
  confirmApply:'Aplicar animação',applied:'Animação aplicada pelo Companion!',
  moduleError:'Companion desconectado ou sem permissão de controle.',
  moduleReadError:'Não foi possível copiar do dispositivo.',
  licenseTitle:'Qual licença escolher?',reportAccount:'Entre com GitHub para denunciar.'
 },
 en:{
  noFile:'No file selected',latest:'Newest',popular:'Most popular',
  collections:'Community animations',results:'animations',creators:'Creators',
  creatorsDesc:'Meet people sharing animations with the community.',
  creatorWorks:'Animations by this creator',creatorEmpty:'This creator has no published animations yet.',
  works:'posts',allCreators:'All creators',noCreators:'No creators with posts yet.',
  myPosts:'My submissions',noPosts:'You have not submitted an animation yet.',
  name:'Name',bio:'About me',imageHelp:'JPG, PNG or WebP. Images are stored privately.',
  photoAvatar:'Profile photo',photoBanner:'Banner',profileSaved:'Profile updated!',
  sourceEditor:'Animation created in the editor',uploadHelp:'The file will be reviewed before appearing in the gallery.',
  invalidZip:'Choose a valid ZIP up to 20 MiB.',missingZip:'Choose a ZIP file before publishing.',
  missingTags:'Click + Add to confirm your tags.',
  missingRights:'Confirm you have the rights to share this animation.',
  invalidTitle:'Title must be between 3 and 100 characters.',sending:'Uploading and validating…',
  uploadError:'Could not publish',serverMetadata:'Check the title, tags, credits and ZIP file.',
  serverZip:'The ZIP failed validation. Check its animation format.',
  signinRequired:'Sign in with GitHub to publish or report.',reportTitle:'Report animation',
  reportHelp:'Describe the problem so we can review it (5 to 500 characters).',
  reason:'Reason',reportSent:'Report submitted. Thanks for helping!',reportError:'Could not submit the report.',
  minReason:'Enter 5 to 500 characters.',send:'Send',apply:'Apply to phone',
  applyTitle:'Apply this animation to your phone?',
  applyHelp:'This will replace the current animation. We recommend a backup first.',
  confirmApply:'Apply animation',applied:'Animation applied through Companion!',
  moduleError:'Companion disconnected or missing control permission.',
  moduleReadError:'Could not copy from device.',
  licenseTitle:'Which license should I choose?',reportAccount:'Sign in with GitHub to report.'
 }
};
const tr=k=>window.BASCommunityLabels?.text(language(),k)||
  EXTRA[language()]?.[k]||(language()==='pt'?PT:EN)[k]||EN[k]||k;
const state={route:'explore',items:[],query:'',sort:'newest',loading:false,
 status:'',busy:false,selected:null,file:null,source:'zip',title:'',summary:'',
 license:'CC-BY-4.0',author:'',tags:[],rights:false,tagInput:'',drafts:[],
 moderation:null,remotePictures:{avatar:null,banner:null},profileDraft:null,creators:[],creatorItems:[],selectedCreator:null,modal:null};
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
 for(const nav of root.querySelectorAll('[data-route="explore"]')){
  nav.textContent='⌕ '+tr('explore');
 }
 for(const nav of root.querySelectorAll('[data-route="saved"]')){
  nav.textContent='♙ '+tr('profile');nav.dataset.route='profile';nav.hidden=!logged();
 }
 for(const nav of root.querySelectorAll('[data-route="creators"]')){
  nav.hidden=false;nav.textContent='♧ '+tr('creators');
 }
 const badge=root.querySelector('.bas-c-topbadge');
 if(badge)badge.textContent='BAS COMMUNITY';
 const foot=root.querySelector('.bas-c-footnote');
 if(foot)foot.textContent='BAS Community';
 for(const nav of root.querySelectorAll('.bas-c-navbtn')){
  nav.classList.toggle('is-current',nav.dataset.route===state.route);
 }
}
function go(route){
 state.route=route;
 state.modal=null;renderModal();
 render();
 if(route==='explore')void fetchGallery();
 if(route==='creators')void fetchCreators();
 if(route==='creator')void fetchCreatorPosts();
 if(route==='profile'){void fetchPictures();void fetchDrafts();}
}
function localStatus(value){
 const labels={
  pt:{pending:'Em análise',published:'Publicada',rejected:'Rejeitada',failed:'Falha no envio',cancelled:'Cancelada'},
  en:{pending:'Under review',published:'Published',rejected:'Rejected',failed:'Upload failed',cancelled:'Cancelled'},
  es:{pending:'En revisión',published:'Publicada',rejected:'Rechazada',failed:'Error de envío',cancelled:'Cancelada'},
  fr:{pending:'En vérification',published:'Publiée',rejected:'Refusée',failed:'Échec de l’envoi',cancelled:'Annulée'},
  de:{pending:'In Prüfung',published:'Veröffentlicht',rejected:'Abgelehnt',failed:'Upload fehlgeschlagen',cancelled:'Abgebrochen'},
  it:{pending:'In revisione',published:'Pubblicata',rejected:'Rifiutata',failed:'Invio non riuscito',cancelled:'Annullata'},
  ja:{pending:'審査中',published:'公開済み',rejected:'却下',failed:'送信失敗',cancelled:'キャンセル'},
  zh:{pending:'审核中',published:'已发布',rejected:'已拒绝',failed:'上传失败',cancelled:'已取消'}
 };
 const normalized={pending_review:'pending',awaiting_upload:'pending',processing:'pending'}[value]||value;
 return labels[language()]?.[normalized]||tr('pending');
}
function translateError(message){
 const raw=String(message||'');
 if(raw==='invalid_metadata')return tr('serverMetadata');
 if(raw.startsWith('zip_')||raw==='invalid_zip_upload')return tr('serverZip');
 return raw;
}
function statusHTML(){return state.status?'<p class="bas-live-status" role="status">'+safe(state.status)+'</p>':'';}
function welcome(){
 return '<section class="bas-c-hero"><div class="bas-c-hero__copy">'+
  '<span class="bas-c-kicker">BOOT ANIMATION STUDIO · COMMUNITY</span>'+
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
  '<div class="bas-c-card__bottom"><button type="button" class="bas-c-author bas-live-author-link" data-c-action="creator-author" data-handle="'+safe(item.handle)+'">@'+safe(item.handle)+'</button>'+
   '<button type="button" class="bas-c-heart" data-c-action="download" data-id="'+safe(item.id)+'">↓ ZIP</button>'+
  '</div></div></article>';
}
function galleryView(){
 return welcome()+'<section class="bas-c-sectionhead"><div><span class="bas-c-kicker">COMMUNITY</span>'+
  '<h2>'+safe(tr('collections'))+'</h2></div></section>'+
  '<div class="bas-c-controls"><label class="bas-c-search"><span aria-hidden="true">⌕</span>'+
  '<input type="search" id="bas-live-search" maxlength="80" autocomplete="off" placeholder="'+safe(tr('search'))+
   '" value="'+safe(state.query)+'"></label>'+
  '<label class="bas-c-sort"><select id="bas-live-sort"><option value="newest"'+(state.sort==='newest'?' selected':'')+'>'+safe(tr('latest'))+'</option>'+
  '<option value="popular"'+(state.sort==='popular'?' selected':'')+'>'+safe(tr('popular'))+'</option></select></label></div>'+
  statusHTML()+
  '<div class="bas-c-results-meta">'+safe(state.loading?'…':state.items.length)+' '+safe(tr('results'))+'</div>'+
  '<div class="bas-c-grid">'+(state.items.length?state.items.map(realCard).join(''):
   '<p class="bas-c-noresults">'+safe(tr('empty'))+'</p>')+'</div>';
}
function creatorsView(){
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('creators'))+'</h1>'+
  '<p>'+safe(tr('creatorsDesc'))+'</p></section>'+
  '<div class="bas-c-creators">'+(state.creators.length?state.creators.map(creator=>
   '<button type="button" class="bas-c-creator-tile" data-c-action="creator" data-handle="'+safe(creator.handle)+'">'+
   '<span class="bas-live-creator-avatar" aria-hidden="true">'+safe(creator.display_name?.charAt(0)||'✧')+'</span>'+
   '<strong>'+safe(creator.display_name||creator.handle)+'</strong>'+
   '<small>@'+safe(creator.handle)+' · '+safe(creator.animation_count)+' '+safe(tr('works'))+'</small>'+
   '<span class="bas-c-tilearrow">↗</span></button>').join(''):
   '<p class="bas-c-noresults">'+safe(tr('noCreators'))+'</p>')+'</div>'+statusHTML();
}
function creatorView(){
 const creator=state.selectedCreator;
 if(!creator)return creatorsView();
 return '<section class="bas-c-profile" data-theme="moon"><div class="bas-c-profile-cover">'+
  '<span class="bas-c-profile-cover__orb">✧</span></div>'+
  '<div class="bas-c-profile-content"><div class="bas-c-profile-top"><div class="bas-c-profile-identity">'+
  '<span class="bas-live-avatar">'+safe(creator.display_name?.charAt(0)||'✦')+'</span>'+
  '<div class="bas-c-profile-nameblock"><h1 id="bas-c-page-title">'+safe(creator.display_name||creator.handle)+'</h1>'+
  '<span>@'+safe(creator.handle)+'</span></div></div></div>'+
  '<p>'+safe(tr('creatorWorks'))+'</p></div></section>'+
  '<section class="bas-c-sectionhead"><h2>'+safe(tr('creatorWorks'))+'</h2></section>'+
  '<div class="bas-c-grid">'+(state.creatorItems.length?state.creatorItems.map(realCard).join(''):
   '<p class="bas-c-noresults">'+safe(tr('creatorEmpty'))+'</p>')+'</div>'+
  '<button class="bas-c-button" type="button" data-c-action="back-creators">'+safe(tr('allCreators'))+'</button>'+
  statusHTML();
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
   '<div class="bas-c-profile-bio"><strong>'+safe(tr('bio'))+'</strong><p>'+safe(person.bio||'—')+'</p></div>'+
   '<div class="bas-live-actions"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="edit-profile">'+safe(tr('edit'))+'</button>'+
   '<button type="button" class="bas-c-button" data-c-action="upload">'+safe(tr('upload'))+'</button></div>'+
  '</div></div>'+
  '<section class="bas-c-sectionhead"><div><span class="bas-c-kicker">BAS COMMUNITY</span>'+
   '<h2>'+safe(tr('myPosts'))+'</h2></div></section>'+
  '<div class="bas-c-grid">'+(state.drafts.length?state.drafts.map(item=>
   '<article class="bas-c-card bas-live-admin-item"><div class="bas-c-card__content">'+
   '<h3>'+safe(item.title||item.filename||'ZIP')+'</h3>'+
   '<p>'+safe(localStatus(item.moderation_status||item.status||'pending'))+'</p></div></article>').join(''):
   '<p>'+safe(tr('noPosts'))+'</p>')+'</div>'+
  statusHTML();
}
function editProfile(){
 const draft=state.profileDraft||user();
 if(!draft)return welcome();
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS ACCOUNT</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('edit'))+'</h1></section>'+
  '<form id="bas-live-profile-form" class="bas-c-publish-draft bas-live-form">'+
   '<label>Handle<input name="handle" minlength="3" maxlength="32" required pattern="[A-Za-z0-9_]{3,32}" value="'+safe(draft.handle)+'"></label>'+
   '<label>'+safe(tr('name'))+'<input name="display_name" maxlength="80" required value="'+safe(draft.display_name)+'"></label>'+
   '<label>'+safe(tr('bio'))+'<textarea name="bio" maxlength="500" rows="4">'+safe(draft.bio||'')+'</textarea></label>'+
   '<div class="bas-live-actions"><button type="submit" class="bas-c-button bas-c-button--bright">'+safe(tr('save'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="go-profile">'+safe(tr('cancel'))+'</button></div>'+
  '</form>'+
  '<div class="bas-c-publish-draft bas-live-form"><h3>'+safe(tr('photoAvatar'))+' / '+safe(tr('photoBanner'))+'</h3>'+
   '<label class="bas-c-photo-pick">'+safe(tr('photoAvatar'))+' <input type="file" id="bas-live-avatar-file" accept="image/png,image/jpeg,image/webp"></label>'+
   '<label class="bas-c-photo-pick">'+safe(tr('photoBanner'))+' <input type="file" id="bas-live-banner-file" accept="image/png,image/jpeg,image/webp"></label>'+
   '<p class="bas-live-hint">'+safe(tr('imageHelp'))+'</p>'+
  '</div>'+statusHTML();
}
function moduleCanApply(){
 const bridge=window.BASApi;
 return Boolean(bridge?.hasFeature?.('direct_upload') &&
   bridge?.hasPermission?.('control') &&
   (typeof isConnectedMode==='undefined'||isConnectedMode===true));
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
    (moduleCanApply()?'<button type="button" class="bas-c-button" data-c-action="apply-module" data-id="'+safe(item.id)+'">'+
     (language()==='pt'?'Aplicar no celular':'Apply to phone')+'</button>':'')+
    '<button type="button" class="bas-c-button" data-c-action="report" data-id="'+safe(item.id)+'">'+safe(tr('report'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="back-gallery">'+safe(tr('cancel'))+'</button></div></div>'+statusHTML();
}
function uploadView(){
 if(!logged())return welcome();
 const source=state.source;
 const connected=window.BASCommunityExport?.connected()===true;
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('upload'))+'</h1></section>'+
  '<div class="bas-c-publish-draft bas-live-form">'+
  (source==='editor'?'<p>✦ '+safe(tr('sourceEditor'))+'</p>':
   '<div class="bas-live-actions"><button class="bas-c-button" data-c-action="choose-zip">'+safe(tr('zip'))+'</button>'+
   (connected?'<button class="bas-c-button" data-c-action="choose-companion">▣ Companion</button>':'')+'</div>')+
  '<input id="bas-live-zip" type="file" accept=".zip,application/zip" hidden>'+
  '<p class="bas-live-hint">'+safe(state.file?.filename||tr('noFile'))+'</p>'+
  '<form id="bas-live-publish-form" class="bas-live-form-fields">'+
  '<label>'+safe(tr('title'))+'<input name="title" id="bas-live-title" maxlength="100" minlength="3" required value="'+safe(state.title)+'"></label>'+
  '<label>'+safe(tr('desc'))+'<textarea name="summary" id="bas-live-summary" maxlength="1000">'+safe(state.summary)+'</textarea></label>'+
  '<label>'+safe(tr('tags'))+'</label>'+
  '<div class="bas-live-tags">'+state.tags.map(tag=>'<button type="button" data-c-action="tag-remove" data-tag="'+safe(tag)+'">#'+safe(tag)+' ×</button>').join('')+'</div>'+
  '<div class="bas-live-tag-row"><input id="bas-live-tag-input" type="text" autocomplete="off" maxlength="400" placeholder="'+safe(language()==='pt'?'anime, natureza, relaxante':'anime, nature, relaxing')+'" value="'+safe(state.tagInput)+'">'+
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
function licensesView(){
 const guide=window.BASCommunityLicenses?.forLanguage(language());
 if(!guide)return '<p role="alert">'+safe(tr('licenseTitle'))+'</p>';
 const links=window.BASCommunityLicenses.urls;
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('licenseTitle'))+'</h1>'+
  '<p>'+safe(guide.intro)+'</p></section>'+
  '<div class="bas-live-license-list">'+guide.entries.map((entry,i)=>
   '<article class="bas-c-publish-draft bas-live-license-card">'+
   '<h2>'+safe(entry[0])+'</h2>'+
   '<p>'+safe(entry[1])+'</p>'+
   '<p class="bas-live-license-use">'+safe(entry[2])+'</p>'+
   (i<3?'<a href="'+links[i]+'" target="_blank" rel="noopener noreferrer">Creative Commons ↗</a>':'')+
   '</article>').join('')+
   '<p class="bas-live-license-warning">'+safe(guide.note)+'</p>'+
   '<button type="button" class="bas-c-button" data-c-action="back-publish">'+safe(tr('cancel'))+'</button></div>';
}
function renderModal(){
 const host=$('bas-c-modal-host');if(!host)return;
 if(!state.modal){host.replaceChildren();return;}
 const modal=state.modal;
 const contents=modal.kind==='report'
  ?'<form id="bas-live-report-form"><p>'+safe(tr('reportHelp'))+'</p>'+
   '<label for="bas-live-report-reason">'+safe(tr('reason'))+'</label>'+
   '<textarea id="bas-live-report-reason" required minlength="5" maxlength="500" rows="5">'+safe(modal.reason||'')+'</textarea>'+
   '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" type="submit">'+safe(tr('send'))+'</button>'+
   '<button class="bas-c-button" type="button" data-c-action="modal-close">'+safe(tr('cancel'))+'</button></div></form>'
  :'<p>'+safe(tr('applyHelp'))+'</p>'+
   '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" type="button" data-c-action="modal-apply">'+safe(tr('confirmApply'))+'</button>'+
   '<button class="bas-c-button" type="button" data-c-action="modal-close">'+safe(tr('cancel'))+'</button></div>';
 host.innerHTML='<div class="bas-c-modal-backdrop bas-live-modal-backdrop" data-c-action="modal-close">'+
  '<section role="dialog" aria-modal="true" aria-labelledby="bas-live-dialog-title" class="bas-c-modal bas-live-modal">'+
  '<div class="bas-c-modal-top"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<button class="bas-c-roundclose" type="button" data-c-action="modal-close" aria-label="'+safe(tr('close'))+'">×</button></div>'+
  '<h2 id="bas-live-dialog-title">'+safe(tr(modal.kind==='report'?'reportTitle':'applyTitle'))+'</h2>'+
  contents+
  (modal.error?'<p class="bas-live-status" role="alert">'+safe(modal.error)+'</p>':'')+
  '</section></div>';
}
function openModal(kind,id){
 state.modal={kind,id,reason:'',error:''};
 renderModal();
}
function closeModal(){
 state.modal=null;renderModal();
}
function render(){
 if(!active())return false;
 chrome();
 const target=appRoot();
 if(!target)return false;
 let content='';
 if(state.route==='profile')content=profileView();
 else if(state.route==='profile-edit')content=editProfile();
 else if(state.route==='detail')content=detailsView();
 else if(state.route==='creators')content=creatorsView();
 else if(state.route==='creator')content=creatorView();
 else if(state.route==='upload')content=uploadView();
 else if(state.route==='licenses')content=licensesView();
 else content=galleryView();
 target.innerHTML=content;
 renderModal();
 return true;
}
let gallerySequence=0,searchTimeout=null;
async function fetchGallery(){
 const seq=++gallerySequence;state.loading=true;state.status='';
 try{
  const results=await api().gallery(state.query,0,state.sort);
  if(seq!==gallerySequence)return;
  state.items=Array.isArray(results.items)?results.items:[];
 }catch(e){state.items=[];state.status=e.message;}
 finally{if(seq===gallerySequence){state.loading=false;render();}}
}
async function fetchCreators(){
 state.status='';
 try{
  const result=await api().creators();
  state.creators=Array.isArray(result.creators)?result.creators:[];
 }catch(e){state.creators=[];state.status=e.message;}
 if(state.route==='creators')render();
}
async function fetchCreatorPosts(){
 if(!state.selectedCreator)return;
 try{
  const result=await api().gallery('',0,'newest',state.selectedCreator.handle);
  state.creatorItems=Array.isArray(result.items)?result.items:[];
  state.status='';
 }catch(e){state.creatorItems=[];state.status=e.message;}
 if(state.route==='creator')render();
}
function viewCreator(handle){
 let creator=state.creators.find(x=>x.handle===handle);
 if(!creator&&handle){
  const known=[...state.items,...state.creatorItems].find(x=>x.handle===handle);
  if(known)creator={handle,display_name:known.display_name||handle,animation_count:0};
 }
 if(!creator)return;
 state.selectedCreator=creator;state.creatorItems=[];
 go('creator');
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
 if(!logged()){state.status=tr('signinRequired');void api().login();return false;}
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
 try{
  if(typeof apiFetch!=='function')throw Error('Companion indisponível.');
  const res=await apiFetch('/pull?source='+source+'&t='+Date.now(),{method:'GET'});
  if(!res.ok)throw Error('Companion recusou a leitura.');
  if(Number(res.headers.get('Content-Length')||0)>20*1024*1024)throw Error('Arquivo grande demais.');
  const blob=await res.blob();
  if(blob.size<1||blob.size>20*1024*1024)throw Error('ZIP inválido.');
  return openUpload({blob,filename:'bootanimation.zip'},'companion');
 }catch(e){state.status=tr('moduleReadError')+': '+String(e.message||e);render();return false;}
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
 if(state.busy)return;
 collectPublishForm();
 if(state.tagInput.trim()){state.status=tr('missingTags');render();return;}
 if(!state.file){state.status=tr('missingZip');render();return;}
 if(!state.rights){state.status=tr('missingRights');render();return;}
 if(!state.title.trim()||state.title.trim().length<3){state.status=tr('invalidTitle');render();return;}
 state.busy=true;state.status=tr('sending');render();
 try{
  const result=await api().publish(state.file.blob,{
   filename:state.file.filename,source:state.source,title:state.title.trim(),
   summary:state.summary,tags:state.tags.join(', '),license:state.license,
   author_credit:state.author||user().display_name
  });
  if(result.status!=='pending_review')throw Error('upload_status_unconfirmed');
  state.file=null;state.title='';state.summary='';state.tags=[];state.tagInput='';
  state.rights=false;state.author='';state.status=tr('sent');
  go('explore');
 }catch(e){state.status=tr('uploadError')+': '+translateError(e.message);}
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
  state.status=tr('profileSaved');
  go('profile');
 }catch(e){state.status=e.message;render();}
 finally{state.busy=false;}
}
async function updatePicture(file,kind){
 if(!file)return;
 state.status=tr('sending');render();
 try{
  await api().updateMedia(kind,file);
  state.status=tr('profileSaved');
  state.remotePictures[kind]=await api().media(kind);
  go('profile');
 }catch(e){state.status=e.message;render();}
}
async function applyModule(id){
 if(!moduleCanApply())return;

 try{
  const blob=await api().approvedZip(id);
  if(!moduleCanApply()||!window.BASApi.ensureFeature('direct_upload'))
   throw Error(tr('moduleError'));
  const zip=new File([blob],'bootanimation.zip',{type:'application/zip'});
  const body=new FormData();body.append('bootanimation',zip,'bootanimation.zip');
  const result=await window.BASApi.fetch('/upload',{method:'POST',body});
  if(!result.ok)throw Error('Companion recusou a instalação: '+result.status);
  window.hasCustomAnimApplied=true;
  window.BASApi.syncConnectedSurfaces?.();
  await window.BASApi.loadHistory?.();
  state.status=tr('applied');
 }catch(e){state.status=String(e.message||e);}
 render();
}
async function download(id){
 try{await api().download(id);}catch(e){state.status=e.message;render();}
}
function report(id){
 if(!logged()){state.status=tr('reportAccount');render();return;}
 openModal('report',id);
}
async function sendReport(form){
 const modal=state.modal;
 if(!modal||modal.kind!=='report'||!form)return;
 const text=form.querySelector('#bas-live-report-reason')?.value?.trim()||'';
 if(text.length<5||text.length>500){
  modal.reason=text;modal.error=tr('minReason');renderModal();return;
 }
 try{
  await api().report(modal.id,text);
  closeModal();
  state.status=tr('reportSent');render();
 }catch(e){modal.reason=text;modal.error=tr('reportError')+': '+String(e.message||e);renderModal();}
}
function handle(event){
 if(!active()||!overlay()?.contains(event.target))return false;
 const hit=event.target.closest?.('[data-c-action]');
 if(!hit)return false;
 const action=hit.dataset.cAction,id=hit.dataset.id||'';
 if(action==='modal-close'){
  if(hit.classList?.contains?.('bas-live-modal-backdrop')&&event.target!==hit)
   return true; // clicks inside dialog must NOT dismiss the dialog
  closeModal();return true;
 }
 if(action==='modal-apply'){
  const selected=state.modal?.kind==='apply'?state.modal.id:null;
  closeModal();
  if(selected)void applyModule(selected);
  return true;
 }
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
  if(target==='creators'){go('creators');return true;}
  if(target==='moderation')return true;
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
 if(action==='back-creators'){go('creators');return true;}
 if(action==='creator'||action==='creator-author'){viewCreator(hit.dataset.handle);return true;}
 if(action==='detail'){
  const entry=state.items.find(x=>x.id===id);
  if(entry){state.selected=entry;go('detail');}return true;
 }
 if(action==='download'){void download(id);return true;}
 if(action==='apply-module'){if(moduleCanApply())openModal('apply',id);return true;}
 if(action==='report'){void report(id);return true;}
 if(action==='edit-profile'){
  state.profileDraft={...user()};go('profile-edit');return true;
 }
 if(action==='go-profile'){go('profile');return true;}
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
 if(id==='bas-live-report-reason'&&state.modal?.kind==='report'){
  state.modal.reason=event.target.value;return true;
 }
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
    state.status=tr('invalidZip');
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
 if(id==='bas-live-report-form'){event.preventDefault();void sendReport(event.target);return true;}
 return false;
}
function mount(){
 if(!active())return false;
 state.modal=null;renderModal();
 if(overlay()?.hidden)return false;
 chrome();
 render();
 void fetchGallery();
 if(logged()){void fetchPictures();void fetchDrafts();}
 return true;
}
window.BASCommunityLive=Object.freeze({
 active,mount,render,handle,onInput,onChange,onSubmit,openUpload,pullFromDevice,
 showProfile(){if(!active()||!logged())return false;go('profile');return true;}
});
document.getElementById('select-idioma')?.addEventListener?.('change',()=>{
 Promise.resolve().then(()=>{if(active()&&overlay()&&!overlay().hidden)render();});
});
window.addEventListener('bas:community-auth',()=>{
 if(!active())return;
 chrome();
 if(logged()){
  state.status='';
  if(state.route==='profile'||state.route==='profile-edit')go('profile');
  else go('explore');
  void fetchPictures();
 }else{state.remotePictures={avatar:null,banner:null};go('explore');}
});
})();
