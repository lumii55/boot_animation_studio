/* BAS P15.B — Community interactive UI prototype. Strictly local; no backend or uploads. */
(function () {
  'use strict';

  const KEY = 'bas.community.preview.v1';
  const SHOWCASE = [
    {id:'lunar', name:'Lunar Dreams', author:'Moonlit', genre:'cosmos', res:'1080 × 2400', fps:30, mb:'8.2 MB',likes:284, downloads:1520, date:8, art:'lunar', symbol:'☾', desc:'A gentle purple moon rising through a starlit sky. Calm, luminous and dreamy.'},
    {id:'neon', name:'Neon Pulse', author:'Vanta', genre:'neon', res:'1440 × 3200', fps:60, mb:'12.4 MB',likes:195, downloads:980, date:7, art:'neon', symbol:'◎', desc:'A sharp electronic pulse, sleek lines and a bright geometric glow.'},
    {id:'pixel', name:'Pixel Sunrise', author:'PixelMochi', genre:'pixel', res:'1080 × 2400', fps:24, mb:'5.1 MB',likes:342, downloads:2100, date:6, art:'pixel', symbol:'▦', desc:'An 8-bit sunrise with nostalgic colors, little stars and warm mountains.'},
    {id:'glass', name:'Liquid Glass', author:'Glasswave', genre:'abstract', res:'1080 × 2340', fps:30, mb:'6.9 MB',likes:176, downloads:813, date:5, art:'glass', symbol:'◈', desc:'Fluid gradients and soft translucent shapes inspired by liquid glass.'},
    {id:'sakura', name:'Sakura Breeze', author:'Hanami', genre:'nature', res:'1080 × 2400', fps:30, mb:'9.7 MB',likes:319, downloads:1490, date:4, art:'sakura', symbol:'✿', desc:'Pink petals drifting slowly beneath a spring evening sky.'},
    {id:'orbit', name:'Minimal Orbit', author:'Nullspace', genre:'minimal', res:'720 × 1600', fps:30, mb:'2.8 MB',likes:222, downloads:1100, date:3, art:'orbit', symbol:'◌', desc:'A clean, quiet orbit for anyone who likes boot screens without clutter.'},
    {id:'aurora', name:'Aurora Bloom', author:'Northlight', genre:'nature', res:'1440 × 3200', fps:30, mb:'11.3 MB',likes:153, downloads:760, date:2, art:'aurora', symbol:'✧', desc:'A flowing ribbon of northern lights in a midnight landscape.'},
    {id:'circuit', name:'Cyber Circuit', author:'ByteDust', genre:'neon', res:'1080 × 2400', fps:60, mb:'7.4 MB',likes:139, downloads:684, date:1, art:'circuit', symbol:'⌘', desc:'Futuristic circuitry coming to life with a vivid blue glow.'}
  ];
  const PT = {
    community:'Comunidade', beta:'PRÉVIA P15', explore:'Explorar', saved:'Favoritos', creators:'Criadores',
    local:'Prévia local', localDesc:'Esta galeria é uma demonstração interativa. Nenhuma animação foi publicada ou enviada.',
    eyebrow:'BOOT ANIMATION STUDIO · COMMUNITY', heroTitle:'Uma nova forma de dar vida ao seu boot.',
    heroDesc:'Descubra animações, inspire-se e compartilhe suas próprias criações. Uma comunidade inteira em um só lugar.',
    showGallery:'Explorar galeria', publish:'Publicar animação', browse:'Em destaque',
    gallerySub:'Animações de exemplo para visualizar a futura experiência.', samples:'Exemplos visuais', featured:'Coleção em destaque',
    featuredDesc:'Uma amostra do que a comunidade poderá compartilhar.', all:'Todas', cosmos:'Espaço', neon:'Neon',
    pixel:'Pixel art', abstract:'Abstrato', nature:'Natureza', minimal:'Minimalista',
    search:'Pesquisar animações, estilos ou criadores...', latest:'Mais recentes', popular:'Mais populares', top:'Mais curtidas',
    demos:'demonstrações', emptyTitle:'Nenhuma animação encontrada', emptyDesc:'Tente outra busca ou categoria.',
    detail:'Detalhes', about:'Sobre a animação', by:'por', comments:'Comentários', commentsDesc:'Comentários de demonstração. A publicação real exigirá conta.',
    demoOnly:'CONCEITO · NÃO PUBLICADO', demoLabel:'DEMO', preview:'Prévia visual', previewDesc:'Animação ilustrativa em CSS; não representa um ZIP real.',
    resolution:'Resolução', speed:'FPS', size:'Tamanho', download:'Baixar ZIP', apply:'Aplicar no celular',
    waitBackend:'Disponível depois da implementação de publicações e downloads.',
    previewAction:'Visualizar detalhes', like:'Curtir', favorite:'Favoritar', unfavorite:'Remover favorito',
    favoritesTitle:'Seus favoritos de demonstração', favoritesDesc:'Salvos apenas nesta sessão de testes, sem conta ou sincronização.',
    favoriteEmpty:'Ainda não há favoritos', favoriteEmptyDesc:'Toque no coração de uma animação para guardá-la aqui nesta prévia.',
    creatorsTitle:'Conheça os criadores', creatorsDesc:'Perfis fictícios para testar a navegação. Perfis reais dependerão de contas.',
    creatorAnimations:'animação de exemplo', creatorAnimationPlural:'animações de exemplo',
    uploadTitle:'Como você quer publicar?', uploadDesc:'Três formas de compartilhar sua animação. Nenhum arquivo será enviado nesta prévia.',
    fromEditor:'Pelo editor', editorText:'Publicar assim que terminar e exportar uma animação no Studio.',
    fromZip:'Enviar arquivo ZIP', zipText:'Selecionar um bootanimation.zip que você já possui.',
    fromDevice:'Do celular conectado', deviceText:'Selecionar a animação aplicada, com sua autorização.',
    chooseZip:'Escolher ZIP local', zipHint:'Apenas conferência local do nome e tamanho. Nenhum upload acontece.',
    selectedFile:'Arquivo selecionado (somente local)', overLimit:'Para esta prévia, escolha um ZIP de até 25 MB.',
    wrongType:'Selecione um arquivo .zip.', fileReady:'Nenhum dado foi enviado ao servidor.',
    comingSoon:'Disponível em uma próxima etapa da P15.', close:'Fechar',
    login:'Entrar', accountSoon:'Contas ainda não estão disponíveis nesta prévia.',
    demoComment1:'Esse estilo ficaria lindo com um boot mais lento! ✨',
    demoComment2:'Adorei essa combinação de cores!',
    shareSoon:'Publicação e compartilhamento estarão disponíveis em uma etapa futura.',
    showAll:'Ver todas', pinned:'EXPERIMENTAL', status:'Apenas demonstração',
    labTitle:'BAS Community — P15', labDesc:'Ative uma prévia local da futura galeria, sem serviços online.',
    labToggle:'Mostrar a galeria experimental neste navegador', labOpen:'Abrir galeria',
    labSecurity:'Esta opção altera apenas a interface. Recursos privados futuros exigirão autorização no servidor.',
    on:'Ativa enquanto o Developer Lab estiver habilitado.', off:'Oculta por padrão.',
    menu:'Navegação', clear:'Limpar pesquisa', back:'Voltar', viewCreator:'Ver perfil',
    previewNote:'As imagens deste protótipo são arte CSS original de demonstração; não existem ZIPs para baixar.'
  };
  const EN = {
    community:'Community', beta:'P15 PREVIEW', explore:'Explore', saved:'Favorites', creators:'Creators',
    local:'Local preview', localDesc:'This gallery is an interactive demo. No animation has been published or uploaded.',
    eyebrow:'BOOT ANIMATION STUDIO · COMMUNITY', heroTitle:'A new way to bring your boot to life.',
    heroDesc:'Discover animations, get inspired and share your own creations. A creative community in one place.',
    showGallery:'Explore gallery', publish:'Publish animation', browse:'Featured',
    gallerySub:'Sample animations showing the future experience.', samples:'Visual samples', featured:'Featured collection',
    featuredDesc:'A taste of what the community could share.', all:'All', cosmos:'Space', neon:'Neon',
    pixel:'Pixel art', abstract:'Abstract', nature:'Nature', minimal:'Minimal',
    search:'Search animations, styles or creators...', latest:'Newest', popular:'Most popular', top:'Most liked',
    demos:'demos', emptyTitle:'No animations found', emptyDesc:'Try a different query or category.',
    detail:'Details', about:'About this animation', by:'by', comments:'Comments', commentsDesc:'Sample comments. Real commenting will require an account.',
    demoOnly:'CONCEPT · NOT PUBLISHED', demoLabel:'DEMO', preview:'Visual preview', previewDesc:'CSS illustration only; not an actual bootanimation ZIP.',
    resolution:'Resolution', speed:'FPS', size:'File size', download:'Download ZIP', apply:'Apply to phone',
    waitBackend:'Available after real publication and downloads are implemented.',
    previewAction:'View details', like:'Like', favorite:'Favorite', unfavorite:'Remove favorite',
    favoritesTitle:'Your demo favorites', favoritesDesc:'Saved only during this test session, without an account or syncing.',
    favoriteEmpty:'No favorites yet', favoriteEmptyDesc:'Tap a heart on a sample to save it here.',
    creatorsTitle:'Meet the creators', creatorsDesc:'Fictional profiles to test navigation. Real profiles will require accounts.',
    creatorAnimations:'sample animation', creatorAnimationPlural:'sample animations',
    uploadTitle:'How would you like to publish?', uploadDesc:'Three ways to share your animation. No files will be uploaded in this preview.',
    fromEditor:'From the editor', editorText:'Publish after exporting your animation in Studio.',
    fromZip:'Upload ZIP file', zipText:'Choose an existing bootanimation.zip.',
    fromDevice:'From connected phone', deviceText:'Choose the installed animation with your permission.',
    chooseZip:'Choose local ZIP', zipHint:'Local filename and size check only. No uploading.',
    selectedFile:'Selected file (local only)', overLimit:'For this preview, choose a ZIP under 25 MB.',
    wrongType:'Please choose a .zip file.', fileReady:'Nothing has been sent to a server.',
    comingSoon:'Coming in a later P15 milestone.', close:'Close',
    login:'Sign in', accountSoon:'Accounts are not available in this preview.',
    demoComment1:'This would look lovely with a slower boot! ✨',
    demoComment2:'Love this color palette!',
    shareSoon:'Publishing and sharing will be available in a future milestone.',
    showAll:'See all', pinned:'EXPERIMENTAL', status:'Demonstration only',
    labTitle:'BAS Community — P15', labDesc:'Enable a local preview of the future gallery, with no online services.',
    labToggle:'Show the experimental gallery in this browser', labOpen:'Open gallery',
    labSecurity:'This setting changes only the interface. Future private features require server-side authorization.',
    on:'Active while Developer Lab is enabled.', off:'Hidden by default.',
    menu:'Navigation', clear:'Clear search', back:'Back', viewCreator:'View creator',
    previewNote:'All prototype thumbnails are original CSS demo art; no downloadable ZIP files exist.'
  };
  const state = {
    route:'explore', cat:'all', sort:'latest', search:'', modal:null,
    favorite:new Set(), liked:new Set(), creator:null, zipState:null
  };
  let inMemory = false, lastFocus = null, bound = false, previousTitle = null;
  const byId = id => document.getElementById(id);
  const tr = key => {
    const code = typeof idiomaAtual === 'string' ? idiomaAtual : (document.documentElement.lang || 'en');
    return (code === 'pt' ? PT : EN)[key] || EN[key] || key;
  };
  const activeDev = () => window.BASDeveloperLab?.state?.().enabled === true;
  const flag = () => {
    try { return localStorage.getItem(KEY) === 'enabled'; }
    catch (_) { return inMemory; }
  };
  function saveFlag(value) {
    inMemory = Boolean(value);
    try { localStorage.setItem(KEY, value ? 'enabled' : 'disabled'); }
    catch (_) { /* Storage might be unavailable. */ }
  }
  const enabled = () => activeDev() && flag();
  const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const genreName = genre => tr(genre);
  function art(item, extra) {
    return '<div class="bas-c-art bas-c-art--'+safe(item.art)+(extra?' '+extra:'')+'" aria-hidden="true"><span class="bas-c-art__orbit"></span><span class="bas-c-art__core">'+safe(item.symbol)+'</span><span class="bas-c-art__glow"></span></div>';
  }
  function card(item) {
    const saved = state.favorite.has(item.id);
    return '<article class="bas-c-card">'+
      '<button type="button" class="bas-c-thumb" data-c-action="detail" data-id="'+item.id+'" aria-label="'+safe(tr('previewAction'))+': '+safe(item.name)+'">'+art(item,'')+
      '<span class="bas-c-demo">'+safe(tr('demoLabel'))+'</span></button>'+
      '<div class="bas-c-card__content"><div class="bas-c-card__meta"><span>'+safe(genreName(item.genre))+'</span><span>'+safe(item.res)+'</span></div>'+
      '<button class="bas-c-card__title" data-c-action="detail" data-id="'+item.id+'">'+safe(item.name)+'</button>'+
      '<div class="bas-c-card__bottom"><button class="bas-c-author" data-c-action="creator" data-id="'+item.id+'">@'+safe(item.author)+'</button>'+
      '<span class="bas-c-social">♥ '+(item.likes+(state.liked.has(item.id)?1:0))+'</span>'+
      '<button class="bas-c-heart '+(saved?'is-active':'')+'" aria-pressed="'+saved+'" data-c-action="favorite" data-id="'+item.id+'" aria-label="'+safe(tr(saved?'unfavorite':'favorite'))+' '+safe(item.name)+'">'+(saved?'♥':'♡')+'</button></div></div></article>';
  }
  function filtered() {
    let entries = SHOWCASE.filter(item => {
      const q = state.search.trim().toLocaleLowerCase();
      return (!q || [item.name,item.author,item.genre,genreName(item.genre)].some(v => String(v).toLocaleLowerCase().includes(q))) &&
        (state.cat === 'all' || item.genre === state.cat) &&
        (state.route !== 'saved' || state.favorite.has(item.id)) &&
        (state.route !== 'creator' || item.author === state.creator);
    });
    entries.sort((a,b) => state.sort==='top' ? (b.likes-a.likes) : state.sort==='popular' ? (b.downloads-a.downloads) : (b.date-a.date));
    return entries;
  }
  function navButton(route, label, icon) {
    return '<button type="button" class="bas-c-navbtn '+(state.route===route?'is-current':'')+'" data-c-action="navigate" data-route="'+route+'" aria-current="'+(state.route===route?'page':'false')+'"><span class="bas-c-navicon" aria-hidden="true">'+icon+'</span>'+safe(tr(label))+'</button>';
  }
  function shell() {
    return '<section class="bas-c-app" role="dialog" aria-modal="true" aria-labelledby="bas-c-page-title">'+
      '<aside class="bas-c-sidebar"><div class="bas-c-brand"><span class="bas-c-logo">✦</span><span><b>Boot Animation</b><small>COMMUNITY <em>ALPHA</em></small></span></div>'+
      '<div class="bas-c-side-nav" aria-label="'+safe(tr('menu'))+'">'+navButton('explore','explore','⌕')+navButton('saved','saved','♡')+navButton('creators','creators','♧')+'</div>'+
      '<div class="bas-c-side-bottom"><span class="bas-c-side-flower">✧</span><b>'+safe(tr('local'))+'</b><p>'+safe(tr('localDesc'))+'</p></div></aside>'+
      '<div class="bas-c-stage"><header class="bas-c-topbar"><span class="bas-c-breadcrumb"><span class="bas-c-brand-mini">✦</span> BAS <span class="bas-c-slash">/</span> '+safe(tr('community'))+'</span>'+
      '<span class="bas-c-topbadge">'+safe(tr('beta'))+'</span><div class="bas-c-topactions"><button type="button" class="bas-c-signin" data-c-action="signin">'+safe(tr('login'))+'</button>'+
      '<button type="button" class="bas-c-close" id="bas-community-close" data-c-action="close" aria-label="'+safe(tr('close'))+'">×</button></div></header>'+
      '<div class="bas-c-mobile-nav" aria-label="'+safe(tr('menu'))+'">'+navButton('explore','explore','⌕')+navButton('saved','saved','♡')+navButton('creators','creators','♧')+'</div>'+
      '<main class="bas-c-scroll" id="bas-c-main"><div id="bas-c-view"></div><div class="bas-c-footnote">✧ BAS Community · '+safe(tr('previewNote'))+'</div></main></div>'+
      '<div id="bas-c-modal-host"></div></section>';
  }
  function hero() {
    return '<section class="bas-c-hero"><div class="bas-c-hero__copy"><span class="bas-c-kicker">'+safe(tr('eyebrow'))+'</span>'+
      '<h1 id="bas-c-page-title">'+safe(tr('heroTitle'))+'</h1><p>'+safe(tr('heroDesc'))+'</p>'+
      '<div class="bas-c-hero__actions"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="scroll-gallery">'+safe(tr('showGallery'))+' <span>↗</span></button>'+
      '<button type="button" class="bas-c-button bas-c-button--ghost" data-c-action="upload">＋ '+safe(tr('publish'))+'</button></div></div>'+
      '<div class="bas-c-hero__figure" aria-hidden="true"><span class="bas-c-hero__ring ring-one"></span><span class="bas-c-hero__ring ring-two"></span><span class="bas-c-hero__moon">☾</span><span class="bas-c-hero__star star-one">✧</span><span class="bas-c-hero__star star-two">✦</span></div></section>';
  }
  function categories() {
    const cats = ['all','cosmos','neon','pixel','abstract','nature','minimal'];
    return '<div class="bas-c-categories" aria-label="Categories">'+cats.map(c =>
      '<button type="button" data-c-action="category" data-cat="'+c+'" aria-pressed="'+(state.cat===c)+'" class="'+(state.cat===c?'is-active':'')+'">'+safe(tr(c))+'</button>'
    ).join('')+'</div>';
  }
  function galleryHead() {
    return '<div class="bas-c-sectionhead" id="bas-c-gallery-start"><div><span class="bas-c-kicker">'+safe(tr('samples'))+'</span><h2>'+
      safe(state.route==='saved'?tr('favoritesTitle'):state.route==='creator'?('@'+state.creator):tr('featured'))+'</h2>'+
      '<p>'+safe(state.route==='saved'?tr('favoritesDesc'):state.route==='creator'?tr('creatorsDesc'):tr('featuredDesc'))+'</p></div>'+
      '<button type="button" class="bas-c-button bas-c-button--small" data-c-action="upload">＋ '+safe(tr('publish'))+'</button></div>'+
      '<div class="bas-c-controls"><label class="bas-c-search"><span aria-hidden="true">⌕</span><input id="bas-c-search" type="search" autocomplete="off" placeholder="'+safe(tr('search'))+'" value="'+safe(state.search)+'" aria-label="'+safe(tr('search'))+'"></label>'+
      '<label class="bas-c-sort"><select id="bas-c-sort" aria-label="Sort"><option value="latest" '+(state.sort==='latest'?'selected':'')+'>'+safe(tr('latest'))+'</option><option value="popular" '+(state.sort==='popular'?'selected':'')+'>'+safe(tr('popular'))+'</option><option value="top" '+(state.sort==='top'?'selected':'')+'>'+safe(tr('top'))+'</option></select></label></div>'+
      categories()+'<div class="bas-c-results-meta"><span id="bas-c-count"></span><span>● '+safe(tr('status'))+'</span></div>'+
      '<div id="bas-c-grid" class="bas-c-grid"></div>';
  }
  function creatorsView() {
    const unique = Array.from(new Set(SHOWCASE.map(a=>a.author))).sort();
    return '<section class="bas-c-plainhead"><span class="bas-c-kicker">'+safe(tr('samples'))+'</span>'+
      '<h1 id="bas-c-page-title">'+safe(tr('creatorsTitle'))+'</h1><p>'+safe(tr('creatorsDesc'))+'</p></section>'+
      '<div class="bas-c-creators">'+unique.map((author,index)=>{
        const records=SHOWCASE.filter(x=>x.author===author);
        const record=records[0];return '<button type="button" class="bas-c-creator-tile" data-c-action="creator" data-id="'+record.id+'">'+
          '<span class="bas-c-creator-avatar" style="--avatar-index:'+index+'">'+safe(author.charAt(0))+'</span><strong>@'+safe(author)+'</strong>'+
          '<small>'+records.length+' '+safe(tr(records.length===1?'creatorAnimations':'creatorAnimationPlural'))+'</small><span class="bas-c-tilearrow">↗</span></button>';
      }).join('')+'</div>';
  }
  function renderView() {
    const target=byId('bas-c-view');
    if (!target) return;
    if (state.route==='creators') target.innerHTML=creatorsView();
    else target.innerHTML=(state.route==='explore'?hero():state.route==='saved'?'<section class="bas-c-plainhead"><span class="bas-c-kicker">'+safe(tr('samples'))+'</span><h1 id="bas-c-page-title">'+safe(tr('favoritesTitle'))+'</h1><p>'+safe(tr('favoritesDesc'))+'</p></section>':state.route==='creator'?'<section class="bas-c-plainhead"><span class="bas-c-kicker">'+safe(tr('samples'))+'</span><h1 id="bas-c-page-title">@'+safe(state.creator)+'</h1><p>'+safe(tr('creatorsDesc'))+'</p></section>':'')+galleryHead();
    updateCards();
    const area=byId('bas-community-preview');
    if (area) {
      area.querySelectorAll('.bas-c-navbtn').forEach(btn => {
        const selected=btn.getAttribute('data-route')===state.route;
        btn.classList.toggle('is-current',selected);
        btn.setAttribute('aria-current',selected?'page':'false');
      });
    }
  }
  function updateCards() {
    const grid=byId('bas-c-grid');
    if (!grid) return;
    const items=filtered();
    const count=byId('bas-c-count');
    if (count) count.textContent=items.length+' '+tr('demos');
    grid.innerHTML=items.length?items.map(card).join(''):'<div class="bas-c-noresults"><span>☁</span><h3>'+safe(state.route==='saved'?tr('favoriteEmpty'):tr('emptyTitle'))+'</h3><p>'+safe(state.route==='saved'?tr('favoriteEmptyDesc'):tr('emptyDesc'))+'</p><button type="button" data-c-action="reset">'+safe(tr('showAll'))+'</button></div>';
  }
  function detail(item) {
    const liked=state.liked.has(item.id);
    const favorite=state.favorite.has(item.id);
    return '<div class="bas-c-modal-backdrop" data-c-action="dismiss"><section role="dialog" aria-modal="true" aria-labelledby="bas-c-detail-title" class="bas-c-modal bas-c-detail">'+
      '<div class="bas-c-modal-top"><span class="bas-c-kicker">'+safe(tr('detail'))+' · '+safe(tr('demoLabel'))+'</span><button type="button" class="bas-c-roundclose" data-c-action="dismiss" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<div class="bas-c-detail-layout"><div><div class="bas-c-detail-art">'+art(item,'bas-c-art--large')+'<span class="bas-c-demo">'+safe(tr('demoLabel'))+'</span></div>'+
      '<div class="bas-c-preview-note">✧ '+safe(tr('previewDesc'))+'</div></div><div class="bas-c-detail-copy">'+
      '<span class="bas-c-detail-genre">'+safe(genreName(item.genre))+'</span><h2 id="bas-c-detail-title">'+safe(item.name)+'</h2>'+
      '<button class="bas-c-author bas-c-author--detail" data-c-action="creator" data-id="'+item.id+'">'+safe(tr('by'))+' @'+safe(item.author)+' ↗</button>'+
      '<p>'+safe(item.desc)+'</p><div class="bas-c-specs">'+
      '<div><small>'+safe(tr('resolution'))+'</small><strong>'+safe(item.res)+'</strong></div>'+
      '<div><small>'+safe(tr('speed'))+'</small><strong>'+item.fps+'</strong></div>'+
      '<div><small>'+safe(tr('size'))+'</small><strong>'+safe(item.mb)+'</strong></div></div>'+
      '<div class="bas-c-detail-actions"><button type="button" class="bas-c-button bas-c-button--bright" disabled title="'+safe(tr('waitBackend'))+'">'+safe(tr('download'))+'</button>'+
      '<button type="button" class="bas-c-button bas-c-button--ghost" disabled title="'+safe(tr('waitBackend'))+'">'+safe(tr('apply'))+'</button></div>'+
      '<div class="bas-c-detail-social"><button type="button" data-c-action="like" data-id="'+item.id+'" aria-pressed="'+liked+'">'+(liked?'♥':'♡')+' '+safe(tr('like'))+'</button>'+
      '<button type="button" data-c-action="favorite" data-id="'+item.id+'" aria-pressed="'+favorite+'">'+(favorite?'♥':'☆')+' '+safe(tr(favorite?'unfavorite':'favorite'))+'</button></div>'+
      '<div class="bas-c-comments"><h3>'+safe(tr('comments'))+' <span>2 '+safe(tr('demoLabel'))+'</span></h3>'+
      '<p class="bas-c-comments-note">'+safe(tr('commentsDesc'))+'</p>'+
      '<div class="bas-c-comment"><span>☁</span><div><strong>@CloudTea · '+safe(tr('demoLabel'))+'</strong><p>'+safe(tr('demoComment1'))+'</p></div></div>'+
      '<div class="bas-c-comment"><span>✿</span><div><strong>@PetalByte · '+safe(tr('demoLabel'))+'</strong><p>'+safe(tr('demoComment2'))+'</p></div></div>'+
      '</div></div></div></section></div>';
  }
  function upload() {
    return '<div class="bas-c-modal-backdrop" data-c-action="dismiss"><section role="dialog" aria-modal="true" aria-labelledby="bas-c-upload-title" class="bas-c-modal bas-c-upload">'+
      '<div class="bas-c-modal-top"><span class="bas-c-kicker">'+safe(tr('beta'))+'</span><button type="button" class="bas-c-roundclose" data-c-action="dismiss" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<h2 id="bas-c-upload-title">'+safe(tr('uploadTitle'))+'</h2><p>'+safe(tr('uploadDesc'))+'</p>'+
      '<div class="bas-c-upload-options">'+
      '<div class="bas-c-upload-option"><span>✦</span><strong>'+safe(tr('fromEditor'))+'</strong><p>'+safe(tr('editorText'))+'</p><small>'+safe(tr('comingSoon'))+'</small></div>'+
      '<div class="bas-c-upload-option bas-c-upload-option--zip"><span>⇧</span><strong>'+safe(tr('fromZip'))+'</strong><p>'+safe(tr('zipText'))+'</p>'+
      '<label class="bas-c-file-label" for="bas-c-zip-input">'+safe(tr('chooseZip'))+'</label><input type="file" id="bas-c-zip-input" accept=".zip,application/zip" hidden>'+
      '<small>'+safe(tr('zipHint'))+'</small><p class="bas-c-zip-result" id="bas-c-zip-result" aria-live="polite"></p></div>'+
      '<div class="bas-c-upload-option"><span>▣</span><strong>'+safe(tr('fromDevice'))+'</strong><p>'+safe(tr('deviceText'))+'</p><small>'+safe(tr('comingSoon'))+'</small></div></div></section></div>';
  }
  function notice() {
    return '<div class="bas-c-modal-backdrop" data-c-action="dismiss"><section class="bas-c-modal bas-c-notice" role="dialog" aria-modal="true" aria-labelledby="bas-c-notice-title">'+
      '<div class="bas-c-modal-top"><span class="bas-c-kicker">'+safe(tr('beta'))+'</span><button type="button" class="bas-c-roundclose" data-c-action="dismiss" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<div class="bas-c-notice-symbol">✦</div><h2 id="bas-c-notice-title">'+safe(tr('comingSoon'))+'</h2><p>'+safe(tr('accountSoon'))+'</p></section></div>';
  }
  function modalRender() {
    const host=byId('bas-c-modal-host');
    if (!host) return;
    if (!state.modal) { host.innerHTML=''; return; }
    let contents='';
    if (state.modal.type==='detail') {
      const item=SHOWCASE.find(x=>x.id===state.modal.id);
      contents=item?detail(item):'';
    } else if (state.modal.type==='upload') contents=upload();
    else contents=notice();
    host.innerHTML=contents;
    const closer=host.querySelector?.('.bas-c-roundclose');
    if (closer) closer.focus();
  }
  function openModal(type,id) {
    state.modal={type,id};
    modalRender();
  }
  function closeModal() {
    if (!state.modal) return;
    state.modal=null; modalRender();
  }
  function navigate(route,creator) {
    closeModal();
    state.route=route;
    state.creator=creator||null;
    state.cat='all'; state.search='';
    renderView();
    const main=byId('bas-c-main');
    if (main) main.scrollTop=0;
  }
  function close() {
    const layer=byId('bas-community-preview');
    if (!layer || layer.hidden) return;
    closeModal();
    layer.hidden=true;
    layer.setAttribute('aria-hidden','true');
    document.body.classList.remove('bas-community-open');
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus=null;
  }
  function open() {
    if (!enabled()) return false;
    const layer=byId('bas-community-preview');
    if (!layer) return false;
    lastFocus=document.activeElement;
    layer.innerHTML=shell();
    layer.hidden=false;
    layer.setAttribute('aria-hidden','false');
    document.body.classList.add('bas-community-open');
    renderView();
    const closer=byId('bas-community-close');
    if (closer) closer.focus();
    return true;
  }
  function sync() {
    const allowed=enabled(), opt=byId('bas-community-feature-toggle');
    if (opt) { opt.checked=flag(); opt.disabled=!activeDev(); }
    const launch=byId('bas-community-launcher'), preview=byId('bas-community-preview-open');
    if (launch) launch.hidden=!allowed;
    if (preview) preview.disabled=!allowed;
    if (!allowed) close();
    const status=byId('bas-community-status');
    if (status) status.textContent=tr(allowed?'on':'off');
    const labels={labTitle:'labTitle',labDesc:'labDesc',labToggle:'labToggle',labOpen:'labOpen',labSecurity:'labSecurity'};
    document.querySelectorAll('[data-community-copy]').forEach(el => {
      const key=el.getAttribute('data-community-copy');
      if (labels[key]) el.textContent=tr(labels[key]);
    });
    if (allowed && byId('bas-community-preview') && !byId('bas-community-preview').hidden) {
      const search=byId('bas-c-search');
      const current=search?search.value:state.search;
      state.search=current;
      renderView(); modalRender();
    }
  }
  function handler(event) {
    const element=event.target.closest?.('[data-c-action]');
    if (!element || !element.closest('#bas-community-preview')) return;
    const action=element.dataset.cAction;
    const id=element.dataset.id;
    if (action==='dismiss') {
      if (element.classList.contains('bas-c-modal-backdrop') && event.target!==element) return;
      closeModal(); return;
    }
    if (action==='close') { close(); return; }
    if (action==='detail') { openModal('detail',id); return; }
    if (action==='upload') { openModal('upload'); return; }
    if (action==='signin') { openModal('signin'); return; }
    if (action==='creator') {
      const item=SHOWCASE.find(x=>x.id===id);
      if (item) navigate('creator',item.author);
      return;
    }
    if (action==='navigate') { navigate(element.dataset.route); return; }
    if (action==='scroll-gallery') { byId('bas-c-gallery-start')?.scrollIntoView?.({behavior:'smooth',block:'start'}); return; }
    if (action==='category') {
      state.cat=element.dataset.cat;
      renderView(); return;
    }
    if (action==='reset') {
      state.cat='all';state.search='';if(state.route==='saved')state.route='explore';
      renderView();return;
    }
    if (action==='favorite') {
      if(state.favorite.has(id))state.favorite.delete(id);else state.favorite.add(id);
      updateCards();
      if (state.modal?.type==='detail') modalRender();
      return;
    }
    if (action==='like') {
      if(state.liked.has(id))state.liked.delete(id);else state.liked.add(id);
      updateCards();if (state.modal?.type==='detail') modalRender();
    }
  }
  function onInput(event) {
    if (event.target?.id==='bas-c-search') {
      state.search=event.target.value;
      updateCards();
    }
  }
  function onChange(event) {
    const t=event.target;
    if (t?.id==='bas-c-sort') {state.sort=t.value;updateCards();}
    if (t?.id==='bas-c-zip-input') {
      const file=t.files?.[0];
      const output=byId('bas-c-zip-result');
      if(!file||!output)return;
      const valid=/\.zip$/i.test(file.name) && file.size<=25*1024*1024 && file.size>0;
      const note=!/\.zip$/i.test(file.name)?tr('wrongType'):file.size>25*1024*1024?tr('overLimit'):tr('fileReady');
      output.textContent=tr('selectedFile')+': '+file.name+' · '+(file.size/1024/1024).toFixed(2)+' MB. '+note;
      output.classList.toggle('is-error',!valid);
    }
  }
  function bind() {
    if (bound) return;
    bound=true;
    byId('bas-community-feature-toggle')?.addEventListener('change', ev=>{
      if (!activeDev()){sync();return;}
      saveFlag(Boolean(ev.target.checked));sync();
    });
    byId('bas-community-launcher')?.addEventListener('click',open);
    byId('bas-community-preview-open')?.addEventListener('click',open);
    byId('bas-community-preview')?.addEventListener('click',handler);
    byId('bas-community-preview')?.addEventListener('input',onInput);
    byId('bas-community-preview')?.addEventListener('change',onChange);
    document.addEventListener('keydown',ev=>{
      const layer=byId('bas-community-preview');
      if(!layer||layer.hidden)return;
      if(ev.key==='Escape') {if(state.modal)closeModal();else close();return;}
      if(ev.key!=='Tab')return;
      const scope=state.modal?byId('bas-c-modal-host'):layer;
      const focusables=scope?.querySelectorAll?.('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]),a[href]');
      if (!focusables?.length)return;
      const first=focusables[0],last=focusables[focusables.length-1];
      if(ev.shiftKey && document.activeElement===first){ev.preventDefault();last.focus();}
      else if(!ev.shiftKey && document.activeElement===last){ev.preventDefault();first.focus();}
    });
    window.addEventListener('bas:developer-mode-changed',sync);
    window.addEventListener('bas:languagechange',sync);
    sync();
  }
  window.BASCommunityPreview=Object.freeze({
    version:2,enabled,open,close,sync,
    state:()=>({optedIn:flag(),available:enabled(),open:!!byId('bas-community-preview')&&!byId('bas-community-preview').hidden,route:state.route,showcaseCount:SHOWCASE.length})
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
