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
  /* All profile information below is fictional, local prototype data. */
  const PROFILES = {
    Moonlit: {
      display:'Moonlit Studio', theme:'moon', icon:'☾', followers:128, joinedPt:'agosto de 2026', joinedEn:'August 2026',
      bioPt:'Coleciono luas, estrelas e animações que deixam a inicialização mais aconchegante. ✧',
      bioEn:'Collecting moons, stars and soft animations to make every boot feel a little cozier. ✧',
      hair:'#39255e', skin:'#f3c6ab', shirt:'#8166d9', background:'#9a7eee'
    },
    Vanta: {
      display:'Vanta.exe', theme:'neon', icon:'◎', followers:83, joinedPt:'julho de 2026', joinedEn:'July 2026',
      bioPt:'Brilho neon, sintetizadores e tecnologia futurista. Se pisca, eu provavelmente gosto.',
      bioEn:'Neon lights, synthesizers and futuristic tech. If it glows, I probably love it.',
      hair:'#131d43', skin:'#b98f79', shirt:'#1c7f9e', background:'#3caed1'
    },
    PixelMochi: {
      display:'PixelMochi', theme:'pixel', icon:'▦', followers:214, joinedPt:'junho de 2026', joinedEn:'June 2026',
      bioPt:'Uma pixel artist que transforma pequenos quadradinhos em grandes ideias. ☀',
      bioEn:'A pixel artist turning tiny squares into big, colorful ideas. ☀',
      hair:'#583047', skin:'#f4cba0', shirt:'#d98191', background:'#ffcc91'
    },
    Glasswave: {
      display:'Glasswave', theme:'glass', icon:'◈', followers:65, joinedPt:'setembro de 2026', joinedEn:'September 2026',
      bioPt:'Gosto de transparências, curvas suaves e animações minimalistas com personalidade.',
      bioEn:'Exploring translucency, soft shapes and minimal animations with personality.',
      hair:'#2f516d', skin:'#d9b8a9', shirt:'#56bbc4', background:'#96dce9'
    },
    Hanami: {
      display:'Hanami', theme:'sakura', icon:'✿', followers:173, joinedPt:'maio de 2026', joinedEn:'May 2026',
      bioPt:'Flores de cerejeira, tardes tranquilas e pequenos detalhes cheios de cor. 🌸',
      bioEn:'Cherry blossoms, quiet afternoons and little details filled with color. 🌸',
      hair:'#77405b', skin:'#f1c5b2', shirt:'#d78ea6', background:'#f5b9cf'
    },
    Nullspace: {
      display:'Nullspace', theme:'orbit', icon:'◌', followers:97, joinedPt:'abril de 2026', joinedEn:'April 2026',
      bioPt:'Menos distrações, mais significado. Espaço, órbitas e movimentos limpos.',
      bioEn:'Less noise, more meaning. Space, orbit paths and clean motion.',
      hair:'#303b55', skin:'#bb9e90', shirt:'#747fa4', background:'#8099bf'
    },
    Northlight: {
      display:'Northlight', theme:'aurora', icon:'✧', followers:116, joinedPt:'agosto de 2026', joinedEn:'August 2026',
      bioPt:'Inspirada pelo céu noturno, pelas auroras e por tudo que parece magia de verdade.',
      bioEn:'Inspired by night skies, auroras and everything that feels like real magic.',
      hair:'#2b5b61', skin:'#e6bfa9', shirt:'#4baf93', background:'#79cfc1'
    },
    ByteDust: {
      display:'ByteDust', theme:'circuit', icon:'⌘', followers:74, joinedPt:'outubro de 2026', joinedEn:'October 2026',
      bioPt:'Circuitos, jogos e um pouquinho de caos digital. Construindo futuros pixel por pixel.',
      bioEn:'Circuits, games and a little digital chaos. Building futures one pixel at a time.',
      hair:'#344267', skin:'#c4998b', shirt:'#446cb7', background:'#7ea6ed'
    }
  };

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
    profileDemo:'PERFIL FICTÍCIO', profilePicture:'Foto ilustrativa de perfil', coverPicture:'Banner ilustrativo do perfil',
    profileCreations:'Criações', profileFollowers:'Seguidores', profileLikes:'Curtidas recebidas', profileBio:'Sobre',
    profileJoined:'Na comunidade desde', profileFollow:'Seguir criador', profileFollowing:'Seguindo',
    profileWorksTitle:'Animações do criador', profileWorksDesc:'Todas as criações de demonstração deste perfil.',
    profileBack:'Todos os criadores', profileFollowNote:'O botão Seguir funciona apenas nesta prévia, sem conta ou notificações.',

    publishPrep:'Rascunho de publicação · prévia',publishName:'Título da animação',publishLicense:'Licença',
    publishConsent:'Tenho o direito de compartilhar esta animação',publishCheck:'Conferir rascunho',
    publishReady:'Rascunho conferido. A publicação real depende de login e aprovação, e ainda está desligada.',
    publishNeed:'Adicione um título (3–100 caracteres), confirme os direitos e, para ZIP, escolha um arquivo válido.',
    publishEditorNote:'O editor usará o arquivo exportado quando a conexão for habilitada.',
    publishCompanionNote:'A publicação pelo Companion exigirá pareamento seguro e confirmação no dispositivo.',
    publishZipNote:'Escolha um bootanimation.zip de até 20 MB.',publishDemoNote:'Nenhum dado será enviado neste teste.',
    publishChoose:'Selecionar',
    uploadTitle:'Como você quer publicar?', uploadDesc:'Três formas de compartilhar sua animação. Nenhum arquivo será enviado nesta prévia.',
    fromEditor:'Pelo editor', editorText:'Publicar assim que terminar e exportar uma animação no Studio.',
    fromZip:'Enviar arquivo ZIP', zipText:'Selecionar um bootanimation.zip que você já possui.',
    fromDevice:'Do celular conectado', deviceText:'Selecionar a animação aplicada, com sua autorização.',
    chooseZip:'Escolher ZIP local', zipHint:'Apenas conferência local do nome e tamanho. Nenhum upload acontece.',
    selectedFile:'Arquivo selecionado (somente local)', overLimit:'Para esta prévia, escolha um ZIP de até 20 MB.',
    wrongType:'Selecione um arquivo .zip.', fileReady:'Nenhum dado foi enviado ao servidor.',
    comingSoon:'Disponível em uma próxima etapa da P15.', close:'Fechar',
    login:'Entrar', accountSoon:'Contas ainda não estão disponíveis nesta prévia.',
    demoAvatarPhoto:'Escolher foto de perfil',demoBannerPhoto:'Escolher foto de banner',
    demoRemoveAvatar:'Remover foto',demoRemoveBanner:'Remover banner',
    demoImageHint:'JPG, PNG ou WebP. Foto até 4 MB; banner até 8 MB. Cortados e reduzidos no navegador.',
    demoImageWorking:'Preparando imagem com segurança...',demoImageUpdated:'Imagem aplicada somente nesta página, sem upload.',
    demoImageInvalid:'Imagem inválida ou grande demais. Escolha JPG, PNG ou WebP dentro dos limites.',
    demoImageDecodeFail:'Não consegui abrir esta imagem. Tente outra foto.',
    demoCropTitle:'Ajustar imagem',demoCropAvatar:'Enquadre sua foto de perfil',demoCropBanner:'Enquadre seu banner',
    demoCropInstructions:'Arraste a imagem para posicionar. Use o controle para aproximar ou afastar.',
    demoCropZoom:'Zoom',demoCropReset:'Centralizar',demoCropCancel:'Cancelar',demoCropApply:'Aplicar recorte',
    demoCropSaveError:'Não foi possível aplicar o recorte. Experimente outra imagem.',
    demoAvatarAlt:'Foto personalizada de perfil (prévia local)',
    demoBannerAlt:'Banner personalizado (prévia local)',
    demoAccountBtn:'Meu perfil · demo', demoAccountTitle:'Personalize seu perfil', demoAccountNote:'Prévia local, sem login real. As alterações ficam apenas nesta aba até você recarregar a página.',
    demoHandle:'Nome de usuário',demoName:'Nome de exibição',demoBio:'Biografia',demoTheme:'Estilo do banner',
    demoSave:'Salvar prévia',demoSaved:'Prévia atualizada nesta sessão!',demoInvalid:'Confira os campos: @usuário de 3 a 32 caracteres (letras, números e _), nome até 80 e bio até 500.',
    demoAvatarNote:'Foto e banner ilustrativos. Upload de imagens estará disponível depois que o armazenamento privado for configurado.',
    demoLoginNote:'Login GitHub com PKCE preparado no backend, mas desligado até configurarmos um domínio e credenciais seguras.',
    demoMine:'Seu perfil de exemplo',demoThemeMoon:'Lunar',demoThemeNeon:'Neon',demoThemeSakura:'Sakura',demoThemeAurora:'Aurora',

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
    profileDemo:'FICTIONAL PROFILE', profilePicture:'Illustrated profile picture', coverPicture:'Illustrated profile banner',
    profileCreations:'Creations', profileFollowers:'Followers', profileLikes:'Likes received', profileBio:'About',
    profileJoined:'Part of the community since', profileFollow:'Follow creator', profileFollowing:'Following',
    profileWorksTitle:'Creator animations', profileWorksDesc:'All sample creations by this creator.',
    profileBack:'All creators', profileFollowNote:'Following works only in this preview, without accounts or notifications.',

    publishPrep:'Publication draft · preview',publishName:'Animation title',publishLicense:'License',
    publishConsent:'I have permission to share this animation',publishCheck:'Check draft',
    publishReady:'Draft checked. Actual publishing needs sign-in and approval and is still disabled.',
    publishNeed:'Add a title (3–100 chars), confirm rights and, for ZIP, choose a valid file.',
    publishEditorNote:'The editor will provide the exported animation when this connection is enabled.',
    publishCompanionNote:'Companion publishing will require secure pairing and explicit device confirmation.',
    publishZipNote:'Select a bootanimation.zip up to 20 MB.',publishDemoNote:'Nothing will be uploaded during this test.',
    publishChoose:'Select',
    uploadTitle:'How would you like to publish?', uploadDesc:'Three ways to share your animation. No files will be uploaded in this preview.',
    fromEditor:'From the editor', editorText:'Publish after exporting your animation in Studio.',
    fromZip:'Upload ZIP file', zipText:'Choose an existing bootanimation.zip.',
    fromDevice:'From connected phone', deviceText:'Choose the installed animation with your permission.',
    chooseZip:'Choose local ZIP', zipHint:'Local filename and size check only. No uploading.',
    selectedFile:'Selected file (local only)', overLimit:'For this preview, choose a ZIP under 20 MB.',
    wrongType:'Please choose a .zip file.', fileReady:'Nothing has been sent to a server.',
    comingSoon:'Coming in a later P15 milestone.', close:'Close',
    login:'Sign in', accountSoon:'Accounts are not available in this preview.',
    demoAvatarPhoto:'Choose profile photo',demoBannerPhoto:'Choose banner photo',
    demoRemoveAvatar:'Remove photo',demoRemoveBanner:'Remove banner',
    demoImageHint:'JPG, PNG or WebP. Avatar up to 4 MB; banner up to 8 MB. Cropped and resized in your browser.',
    demoImageWorking:'Processing your image safely...',demoImageUpdated:'Image applied only to this page. Nothing uploaded.',
    demoImageInvalid:'Invalid or oversized image. Choose JPG, PNG or WebP within the limits.',
    demoImageDecodeFail:'Could not read this photo. Try another image.',
    demoCropTitle:'Adjust image',demoCropAvatar:'Frame your profile photo',demoCropBanner:'Frame your banner',
    demoCropInstructions:'Drag the picture to position it. Use the slider to zoom in or out.',
    demoCropZoom:'Zoom',demoCropReset:'Recenter',demoCropCancel:'Cancel',demoCropApply:'Apply crop',
    demoCropSaveError:'Could not apply the crop. Please try another image.',
    demoAvatarAlt:'Custom profile photo (local preview)',
    demoBannerAlt:'Custom banner photo (local preview)',
    demoAccountBtn:'My profile · demo', demoAccountTitle:'Customize your profile', demoAccountNote:'Local preview, not a real sign-in. Changes remain only in this tab until you reload.',
    demoHandle:'Username',demoName:'Display name',demoBio:'Bio',demoTheme:'Banner style',
    demoSave:'Save preview',demoSaved:'Preview updated for this session!',demoInvalid:'Check the fields: username 3–32 letters, numbers or _, name up to 80, bio up to 500.',
    demoAvatarNote:'Illustrated avatar and banner. Image uploads will be available after private storage is configured.',
    demoLoginNote:'GitHub OAuth with PKCE is prepared in the backend, but disabled until we configure secure credentials and domains.',
    demoMine:'Your demo profile',demoThemeMoon:'Lunar',demoThemeNeon:'Neon',demoThemeSakura:'Sakura',demoThemeAurora:'Aurora',

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
    favorite:new Set(), liked:new Set(), followed:new Set(), creator:null, zipState:null,
    demoProfile:{handle:'creator_demo',display_name:'Meu cantinho',bio:'Animando cada inicialização com carinho. ✧',theme:'moon'},
    profileDraft:null, profileSaved:false,photoUrls:{avatar:null,banner:null},imageJob:{avatar:0,banner:0},crop:null,publishDraft:{source:'zip',title:'',license:'CC-BY-4.0',rights:false,filename:null,size:0,ready:false}
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
  const enabled = () => window.BASCommunityOnline?.available() === true || (activeDev() && flag());
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
      '<span class="bas-c-topbadge">'+safe(tr('beta'))+'</span><div class="bas-c-topactions"><button type="button" class="bas-c-signin" data-c-action="real-account" aria-label="Conta BAS Community real">✦ Conta BAS ↗</button><button type="button" class="bas-c-signin" data-c-action="signin">'+safe(tr('demoAccountBtn'))+'</button>'+
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
      safe(state.route==='saved'?tr('favoritesTitle'):state.route==='creator'?tr('profileWorksTitle'):tr('featured'))+'</h2>'+
      '<p>'+safe(state.route==='saved'?tr('favoritesDesc'):state.route==='creator'?tr('profileWorksDesc'):tr('featuredDesc'))+'</p></div>'+
      '<button type="button" class="bas-c-button bas-c-button--small" data-c-action="upload">＋ '+safe(tr('publish'))+'</button></div>'+
      '<div class="bas-c-controls"><label class="bas-c-search"><span aria-hidden="true">⌕</span><input id="bas-c-search" type="search" autocomplete="off" placeholder="'+safe(tr('search'))+'" value="'+safe(state.search)+'" aria-label="'+safe(tr('search'))+'"></label>'+
      '<label class="bas-c-sort"><select id="bas-c-sort" aria-label="Sort"><option value="latest" '+(state.sort==='latest'?'selected':'')+'>'+safe(tr('latest'))+'</option><option value="popular" '+(state.sort==='popular'?'selected':'')+'>'+safe(tr('popular'))+'</option><option value="top" '+(state.sort==='top'?'selected':'')+'>'+safe(tr('top'))+'</option></select></label></div>'+
      categories()+'<div class="bas-c-results-meta"><span id="bas-c-count"></span><span>● '+safe(tr('status'))+'</span></div>'+
      '<div id="bas-c-grid" class="bas-c-grid"></div>';
  }
  /* Stand-in illustrated avatars: self-contained SVG images, no external network or user photos. */
  function creatorAvatar(author) {
    const profile = PROFILES[author] || PROFILES.Moonlit;
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img">'+
      '<defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">'+
      '<stop stop-color="'+profile.background+'"/><stop offset="1" stop-color="#27243e"/></linearGradient></defs>'+
      '<rect width="160" height="160" rx="35" fill="url(#shade)"/>'+
      '<circle cx="115" cy="35" r="29" fill="#fff" opacity=".09"/>'+
      '<ellipse cx="80" cy="162" rx="64" ry="59" fill="'+profile.shirt+'"/>'+
      '<ellipse cx="80" cy="76" rx="40" ry="50" fill="'+profile.hair+'"/>'+
      '<path d="M50 69Q52 34 80 34Q109 35 111 68L108 101Q97 120 80 120Q61 120 52 103Z" fill="'+profile.skin+'"/>'+
      '<path d="M47 73Q33 29 71 25Q108 15 119 57Q109 52 104 47Q76 67 50 61Z" fill="'+profile.hair+'"/>'+
      '<ellipse cx="65" cy="80" rx="3" ry="3.4" fill="#40364d"/><ellipse cx="94" cy="80" rx="3" ry="3.4" fill="#40364d"/>'+
      '<path d="M72 99Q80 105 89 99" stroke="#9e686f" stroke-width="2.5" stroke-linecap="round" fill="none"/>'+
      '<path d="M72 140Q80 146 88 140" stroke="#fff" opacity=".54" stroke-width="2" fill="none"/>'+
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
  }

  function creatorProfile(author) {
    const profile = PROFILES[author];
    if (!profile) return '<section class="bas-c-plainhead"><h1 id="bas-c-page-title">'+safe(tr('creatorsTitle'))+'</h1></section>';
    const language = typeof idiomaAtual === 'string' ? idiomaAtual : (document.documentElement.lang || 'en');
    const works = SHOWCASE.filter(item => item.author === author);
    const followers = profile.followers + (state.followed.has(author) ? 1 : 0);
    const totalLikes = works.reduce((sum,item) => sum + item.likes + (state.liked.has(item.id)?1:0), 0);
    const followed = state.followed.has(author);
    return '<section class="bas-c-profile" data-theme="'+safe(profile.theme)+'">'+
      '<div class="bas-c-profile-cover" role="img" aria-label="'+safe(tr('coverPicture'))+'">'+
        '<span class="bas-c-profile-cover__orb" aria-hidden="true">'+safe(profile.icon)+'</span>'+
        '<span class="bas-c-profile-cover__spark" aria-hidden="true">✦</span>'+
        '<span class="bas-c-profile-cover__spark bas-c-profile-cover__spark--small" aria-hidden="true">✧</span>'+
        '<span class="bas-c-profile-demo">'+safe(tr('profileDemo'))+'</span>'+
      '</div>'+
      '<div class="bas-c-profile-content">'+
        '<div class="bas-c-profile-top"><div class="bas-c-profile-identity">'+
          '<img class="bas-c-profile-avatar" src="'+creatorAvatar(author)+'" alt="'+safe(tr('profilePicture'))+' @'+safe(author)+'" width="98" height="98" draggable="false">'+
          '<div class="bas-c-profile-nameblock"><h1 id="bas-c-page-title">'+safe(profile.display)+'</h1>'+
            '<span>@'+safe(author)+'</span></div></div>'+
          '<button type="button" class="bas-c-profile-follow '+(followed?'is-following':'')+'" data-c-action="follow" data-author="'+safe(author)+'" aria-pressed="'+String(followed)+'">'+
            (followed?'✓ ':'＋ ')+safe(tr(followed?'profileFollowing':'profileFollow'))+'</button>'+
        '</div>'+
        '<div class="bas-c-profile-bio"><strong>'+safe(tr('profileBio'))+'</strong><p>'+
          safe(language==='pt'?profile.bioPt:profile.bioEn)+'</p>'+
          '<span class="bas-c-profile-joined">✧ '+safe(tr('profileJoined'))+' '+safe(language==='pt'?profile.joinedPt:profile.joinedEn)+'</span></div>'+
        '<div class="bas-c-profile-stats">'+
          '<div><strong>'+works.length+'</strong><span>'+safe(tr('profileCreations'))+'</span></div>'+
          '<div><strong>'+followers+'</strong><span>'+safe(tr('profileFollowers'))+'</span></div>'+
          '<div><strong>'+totalLikes+'</strong><span>'+safe(tr('profileLikes'))+'</span></div>'+
        '</div>'+
        '<div class="bas-c-profile-bottom"><span>✧ '+safe(tr('profileFollowNote'))+'</span>'+
          '<button type="button" data-c-action="navigate" data-route="creators">← '+safe(tr('profileBack'))+'</button></div>'+
      '</div>'+
    '</section>';
  }

  function creatorsView() {
    const unique = Array.from(new Set(SHOWCASE.map(a=>a.author))).sort();
    return '<section class="bas-c-plainhead"><span class="bas-c-kicker">'+safe(tr('samples'))+'</span>'+
      '<h1 id="bas-c-page-title">'+safe(tr('creatorsTitle'))+'</h1><p>'+safe(tr('creatorsDesc'))+'</p></section>'+
      '<div class="bas-c-creators">'+unique.map((author,index)=>{
        const records=SHOWCASE.filter(x=>x.author===author);
        const record=records[0];return '<button type="button" class="bas-c-creator-tile" data-c-action="creator" data-id="'+record.id+'">'+
          '<img class="bas-c-creator-avatar" src="'+creatorAvatar(author)+'" width="46" height="46" loading="lazy" alt="'+safe(tr('profilePicture'))+' @'+safe(author)+'"><strong>@'+safe(author)+'</strong>'+
          '<small>'+records.length+' '+safe(tr(records.length===1?'creatorAnimations':'creatorAnimationPlural'))+'</small><span class="bas-c-tilearrow">↗</span></button>';
      }).join('')+'</div>';
  }
  function renderView() {
    if(window.BASCommunityLive?.active()){window.BASCommunityLive.render();return;}
    const target=byId('bas-c-view');
    if (!target) return;
    if (state.route==='creators') target.innerHTML=creatorsView();
    else target.innerHTML=(state.route==='explore'?hero():state.route==='saved'?'<section class="bas-c-plainhead"><span class="bas-c-kicker">'+safe(tr('samples'))+'</span><h1 id="bas-c-page-title">'+safe(tr('favoritesTitle'))+'</h1><p>'+safe(tr('favoritesDesc'))+'</p></section>':state.route==='creator'?creatorProfile(state.creator):'')+galleryHead();
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
  // A ZIP is prepared in memory and handed directly to the local BAS
  // Community overlay. No second site, popup or postMessage is involved.
  let recentExport=null;
  let selectedPublishFile=null;
  function modulePublishReady(){
    return typeof apiFetch==='function'&&typeof ensureModuleFeature==='function'&&
      (typeof isConnectedMode==='undefined'||isConnectedMode===true) &&
      (typeof hasModuleFeature!=='function'||hasModuleFeature('pull')) &&
      (typeof hasModulePermission!=='function'||hasModulePermission('view'));
  }
  async function publishFromDevice(source){
    if(!window.BASCommunityLive?.active())return false;
    return window.BASCommunityLive.pullFromDevice(source,modulePublishReady());
  }
  window.BASCommunityExport=Object.freeze({
    capture(blob,filename){
      if(!(blob instanceof Blob)||blob.size<=0||blob.size>20*1024*1024)return;
      recentExport={blob,filename:typeof filename==='string'&&
        filename.toLowerCase().endsWith('.zip')&&/^[A-Za-z0-9_. -]{1,90}$/.test(filename)
        ?filename:'bootanimation.zip'};
      const button=byId('btn-community-publish-finish');if(button)button.hidden=false;
      const endButton=byId('finish-community-publish');if(endButton)endButton.hidden=false;
    },
    available(){return !!recentExport;},
    openRecent(){
      return window.BASCommunityLive?.active()
        ?window.BASCommunityLive.openUpload(recentExport,'editor'):false;
    },
    publishFromDevice,
    chooseDeviceSource(){
      if(!modulePublishReady())return false;
      const overlay=byId('modal-community-device');
      if(!overlay)return false;
      const applied=byId('btn-community-device-applied');
      if(applied)applied.hidden=window.hasCustomAnimApplied!==true;
      overlay.style.display='flex';return true;
    },
    connected:modulePublishReady
  });
  function launchPrivatePublish(){
    // Legacy demo publishing cannot upload anything. Only BAS' local
    // online controller may submit explicitly confirmed real ZIP files.
    return false;
  }
  function upload() {
    const d=state.publishDraft;
    const sources=[['editor','✦','fromEditor','editorText'],['zip','⇧','fromZip','zipText'],['companion','▣','fromDevice','deviceText']];
    const cards=sources.map(([key,symbol,label,description])=>
      '<div class="bas-c-upload-option'+(key===d.source?' is-selected':'')+'"><span>'+symbol+'</span>'+
      '<strong>'+safe(tr(label))+'</strong><p>'+safe(tr(description))+'</p>'+
      '<button type="button" class="bas-c-publish-source" data-c-action="publish-source" data-source="'+key+
      '" aria-pressed="'+String(key===d.source)+'">'+safe(tr('publishChoose'))+'</button>'+
      (key==='zip'?'<label class="bas-c-file-label" for="bas-c-zip-input">'+safe(tr('chooseZip'))+'</label>'+
       '<input type="file" id="bas-c-zip-input" accept=".zip,application/zip" hidden>'+
       '<small>'+safe(tr('zipHint'))+'</small>'+
       '<p class="bas-c-zip-result" id="bas-c-zip-result" aria-live="polite">'+
       (d.filename?safe(tr('selectedFile')+': '+d.filename):'')+'</p>':'')+
      '</div>').join('');
    const note=d.source==='editor'?'publishEditorNote':d.source==='companion'?'publishCompanionNote':'publishZipNote';
    return '<div class="bas-c-modal-backdrop" data-c-action="dismiss"><section role="dialog" aria-modal="true" aria-labelledby="bas-c-upload-title" class="bas-c-modal bas-c-upload">'+
      '<div class="bas-c-modal-top"><span class="bas-c-kicker">'+safe(tr('beta'))+' · P15.6</span><button type="button" class="bas-c-roundclose" data-c-action="dismiss" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<h2 id="bas-c-upload-title">'+safe(tr('uploadTitle'))+'</h2><p>'+safe(tr('uploadDesc'))+'</p>'+
      '<div class="bas-c-upload-options">'+cards+'</div>'+
      '<div class="bas-c-publish-draft"><strong>'+safe(tr('publishPrep'))+'</strong><p>'+safe(tr(note))+'</p>'+
      '<div class="bas-c-publish-fields"><label for="bas-c-publish-title">'+safe(tr('publishName'))+
      '<input id="bas-c-publish-title" type="text" maxlength="100" autocomplete="off" value="'+safe(d.title)+'"></label>'+
      '<label for="bas-c-publish-license">'+safe(tr('publishLicense'))+
      '<select id="bas-c-publish-license">'+['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','all-rights-reserved'].map(k=>
      '<option value="'+k+'"'+(d.license===k?' selected':'')+'>'+safe(k)+'</option>').join('')+'</select></label></div>'+
      '<label class="bas-c-publish-rights"><input type="checkbox" id="bas-c-publish-rights"'+(d.rights?' checked':'')+'> '+safe(tr('publishConsent'))+'</label>'+
      '<div class="bas-c-publish-footer"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="publish-check">'+safe(tr('publishCheck'))+'</button>'+
      '<button type="button" class="bas-c-button" data-c-action="publish-private">Enviar para beta privado</button>'+
      '<p id="bas-c-publish-status" aria-live="polite">'+safe(tr(d.ready?'publishReady':'publishDemoNote'))+'</p></div>'+
      '</div></section></div>';
  }

  /* No identity is created by this UI. It is a local interactive profile design tool. */
  function demoAccount() {
    const d=state.profileDraft||state.demoProfile;
    const avatarByTheme={moon:'Moonlit',neon:'Vanta',sakura:'Hanami',aurora:'Northlight'};
    const avatar=avatarByTheme[d.theme]||'Moonlit';
    const photo=state.photoUrls;
    const choices=['moon','neon','sakura','aurora'].map(theme =>
      '<option value="'+theme+'"'+(theme===d.theme?' selected':'')+'>'+safe(tr('demoTheme'+theme[0].toUpperCase()+theme.slice(1)))+'</option>'
    ).join('');
    return '<div class="bas-c-modal-backdrop" data-c-action="dismiss"><section role="dialog" aria-modal="true" aria-labelledby="bas-c-demo-title" class="bas-c-modal bas-c-account-modal">'+
      '<div class="bas-c-modal-top"><span class="bas-c-kicker">'+safe(tr('beta'))+' · '+safe(tr('profileDemo'))+'</span>'+
      '<button type="button" class="bas-c-roundclose" data-c-action="dismiss" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<h2 id="bas-c-demo-title">'+safe(tr('demoAccountTitle'))+'</h2><p class="bas-c-account-intro">'+safe(tr('demoAccountNote'))+'</p>'+
      '<div class="bas-c-account-columns"><form id="bas-c-account-form" novalidate>'+
      '<label for="bas-c-account-handle">'+safe(tr('demoHandle'))+'</label>'+
      '<input id="bas-c-account-handle" name="handle" type="text" minlength="3" maxlength="32" autocomplete="off" spellcheck="false" value="'+safe(d.handle)+'">'+
      '<label for="bas-c-account-name">'+safe(tr('demoName'))+'</label>'+
      '<input id="bas-c-account-name" name="display_name" type="text" maxlength="80" autocomplete="off" value="'+safe(d.display_name)+'">'+
      '<label for="bas-c-account-bio">'+safe(tr('demoBio'))+'</label>'+
      '<textarea id="bas-c-account-bio" name="bio" maxlength="500" rows="4">'+safe(d.bio)+'</textarea>'+
      '<label for="bas-c-account-theme">'+safe(tr('demoTheme'))+'</label>'+
      '<select id="bas-c-account-theme" name="theme">'+choices+'</select>'+
      '<div class="bas-c-photo-inputs"><div><label class="bas-c-photo-pick" for="bas-c-avatar-file">✿ '+safe(tr('demoAvatarPhoto'))+'</label>'+
      '<input id="bas-c-avatar-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">'+
      '<button type="button" id="bas-c-account-remove-avatar" class="bas-c-photo-remove" data-c-action="remove-photo" data-photo="avatar" '+(photo.avatar?'':'disabled')+'>'+safe(tr('demoRemoveAvatar'))+'</button></div>'+
      '<div><label class="bas-c-photo-pick" for="bas-c-banner-file">▧ '+safe(tr('demoBannerPhoto'))+'</label>'+
      '<input id="bas-c-banner-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">'+
      '<button type="button" id="bas-c-account-remove-banner" class="bas-c-photo-remove" data-c-action="remove-photo" data-photo="banner" '+(photo.banner?'':'disabled')+'>'+safe(tr('demoRemoveBanner'))+'</button></div></div>'+
      '<p class="bas-c-photo-hint">'+safe(tr('demoImageHint'))+'</p>'+'<button class="bas-c-button bas-c-button--bright bas-c-account-save" type="submit">'+safe(tr('demoSave'))+'</button>'+
      '<p class="bas-c-account-status" id="bas-c-account-status" role="status" aria-live="polite">'+
      (state.profileSaved?safe(tr('demoSaved')):safe(tr('demoLoginNote')))+'</p></form>'+
      '<div class="bas-c-account-mock"><span class="bas-c-kicker">'+safe(tr('demoMine'))+'</span>'+
      '<div class="bas-c-profile" id="bas-c-account-card" data-theme="'+safe(d.theme)+'">'+
      '<div class="bas-c-profile-cover '+(photo.banner?'bas-c-has-photo':'')+'" aria-label="'+safe(tr('coverPicture'))+'">'+
      '<img id="bas-c-account-banner-image" class="bas-c-account-cover-image" src="'+(photo.banner?safe(photo.banner):'')+'" '+(photo.banner?'':'hidden ')+'alt="'+safe(tr('demoBannerAlt'))+'">'+
      '<span class="bas-c-profile-cover__orb">✧</span>'+
      '<span class="bas-c-profile-demo">'+safe(tr('profileDemo'))+'</span></div>'+
      '<div class="bas-c-profile-content"><div class="bas-c-profile-top"><div class="bas-c-profile-identity">'+
      '<img class="bas-c-profile-avatar" id="bas-c-account-avatar" src="'+(photo.avatar?safe(photo.avatar):creatorAvatar(avatar))+'" alt="'+safe(photo.avatar?tr('demoAvatarAlt'):tr('profilePicture'))+'" width="88" height="88">'+
      '<div class="bas-c-profile-nameblock"><h3 id="bas-c-account-display">'+safe(d.display_name)+'</h3>'+
      '<span id="bas-c-account-user">@'+safe(d.handle)+'</span></div></div></div>'+
      '<div class="bas-c-profile-bio"><strong>'+safe(tr('profileBio'))+'</strong><p id="bas-c-account-preview-bio">'+safe(d.bio)+'</p></div>'+
      '</div></div><p class="bas-c-account-disclaimer">'+safe(tr('demoAvatarNote'))+'</p></div></div><div id="bas-c-crop-host"></div></section></div>';
  }

  /* Browser-only photo previews. Never transmit, persist or keep original EXIF.
   * After validation, canvas exports a resized JPEG/WebP without source metadata.
   * These object URLs live in memory and are revoked on replacement/reset/page unload. */
  const IMAGE_LIMITS=Object.freeze({avatar:4*1024*1024,banner:8*1024*1024});
  const IMAGE_TARGETS=Object.freeze({avatar:[512,512],banner:[1280,480]});
  function imageMagic(bytes) {
    if(bytes.length<12)return false;
    if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return 'image/png';
    if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
    if(String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
    return false;
  }
  function photoStatus(key) {
    const el=byId('bas-c-account-status');
    if(el)el.textContent=tr(key);
  }
  function disposeUrl(kind) {
    const old=state.photoUrls[kind];
    state.photoUrls[kind]=null;
    if(old&&typeof URL!=='undefined'&&typeof URL.revokeObjectURL==='function')URL.revokeObjectURL(old);
  }
  function setLocalPhoto(kind,url) {
    disposeUrl(kind);
    state.photoUrls[kind]=url;
    const cover=byId('bas-c-account-banner-image');
    const avatar=byId('bas-c-account-avatar');
    const card=byId('bas-c-account-card');
    if(kind==='avatar' && avatar)avatar.setAttribute('src',url||creatorAvatar(({moon:'Moonlit',neon:'Vanta',sakura:'Hanami',aurora:'Northlight'})[(state.profileDraft||state.demoProfile).theme]));
    if(kind==='banner' && cover){cover.hidden=!url;if(url)cover.setAttribute('src',url);else cover.removeAttribute('src');}
    const box=card?.querySelector('.bas-c-profile-cover');
    if(kind==='banner'&&box)box.classList.toggle('bas-c-has-photo',Boolean(url));
    const btn=byId(kind==='avatar'?'bas-c-account-remove-avatar':'bas-c-account-remove-banner');
    if(btn)btn.disabled=!url;
  }

  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function destroyCrop() {
    const c=state.crop;
    if(!c)return;
    state.crop=null;
    if(c.sourceUrl&&typeof URL!=='undefined'&&URL.revokeObjectURL)URL.revokeObjectURL(c.sourceUrl);
    if(c.bitmap?.close)c.bitmap.close();
    const host=byId('bas-c-crop-host');
    if(host)host.innerHTML='';
  }
  function cropHTML(c) {
    const avatar=c.kind==='avatar';
    return '<div class="bas-c-crop-backdrop" data-c-action="crop-cancel"><section class="bas-c-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="bas-c-crop-title">'+
      '<div class="bas-c-crop-heading"><div><span class="bas-c-kicker">'+safe(tr('demoCropTitle'))+'</span>'+
      '<h2 id="bas-c-crop-title">'+safe(tr(avatar?'demoCropAvatar':'demoCropBanner'))+'</h2></div>'+
      '<button type="button" class="bas-c-roundclose" data-c-action="crop-cancel" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<p class="bas-c-crop-help">'+safe(tr('demoCropInstructions'))+'</p>'+
      '<div id="bas-c-crop-stage" class="bas-c-crop-stage '+(avatar?'bas-c-crop-stage--avatar':'bas-c-crop-stage--banner')+
      '" tabindex="0" role="img" aria-label="'+safe(tr(avatar?'demoCropAvatar':'demoCropBanner'))+'">'+
      '<img id="bas-c-crop-image" src="'+safe(c.sourceUrl)+'" alt="" draggable="false">'+
      '<div class="bas-c-crop-guides" aria-hidden="true"></div></div>'+
      '<div class="bas-c-crop-zoom"><label for="bas-c-crop-zoom">◉ '+safe(tr('demoCropZoom'))+'</label>'+
      '<input id="bas-c-crop-zoom" type="range" min="100" max="350" step="5" value="'+Math.round(c.zoom*100)+'" aria-label="'+safe(tr('demoCropZoom'))+'">'+
      '<output id="bas-c-crop-zoom-value">'+Math.round(c.zoom*100)+'%</output></div>'+
      '<div class="bas-c-crop-actions"><button type="button" class="bas-c-button" data-c-action="crop-reset">'+safe(tr('demoCropReset'))+'</button>'+
      '<div class="bas-c-crop-actions-right"><button type="button" class="bas-c-button" data-c-action="crop-cancel">'+safe(tr('demoCropCancel'))+'</button>'+
      '<button type="button" id="bas-c-crop-apply" class="bas-c-button bas-c-button--bright" data-c-action="crop-apply">'+safe(tr('demoCropApply'))+'</button></div></div>'+
      '<small class="bas-c-crop-privacy">'+safe(tr('demoImageUpdated'))+'</small></section></div>';
  }
  function renderCrop() {
    const c=state.crop,host=byId('bas-c-crop-host');
    if(!c||!host)return;
    host.innerHTML=cropHTML(c);
    updateCropVisual();
    byId('bas-c-crop-stage')?.focus();
  }
  function cropMetrics() {
    const c=state.crop,stage=byId('bas-c-crop-stage');
    if(!c||!stage)return null;
    const rect=stage.getBoundingClientRect?.();
    const [tw,th]=IMAGE_TARGETS[c.kind];
    const width=rect?.width||stage.clientWidth||Math.min(tw,480);
    const height=rect?.height||stage.clientHeight||width*th/tw;
    const base=Math.max(width/c.bitmap.width,height/c.bitmap.height);
    const dw=c.bitmap.width*base*c.zoom,dh=c.bitmap.height*base*c.zoom;
    return {width,height,dw,dh,maxX:Math.max(0,(dw-width)/2),maxY:Math.max(0,(dh-height)/2)};
  }
  function updateCropVisual() {
    const c=state.crop,m=cropMetrics(),img=byId('bas-c-crop-image');
    if(!c||!m||!img)return;
    img.style.width=m.dw+'px';
    img.style.height=m.dh+'px';
    img.style.transform='translate(-50%, -50%) translate('+(m.maxX*c.panX)+'px, '+(m.maxY*c.panY)+'px)';
    const percentage=byId('bas-c-crop-zoom-value');
    if(percentage)percentage.textContent=Math.round(c.zoom*100)+'%';
  }
  function setCropZoom(value) {
    const c=state.crop;
    if(!c||c.applying)return;
    c.zoom=clamp(Number(value)/100||1,1,3.5);
    updateCropVisual();
  }
  function startCropDrag(event) {
    const c=state.crop,stage=byId('bas-c-crop-stage');
    if(!c||c.applying||!stage||!stage.contains?.(event.target))return;
    if(event.isPrimary===false||event.button>0)return;
    c.drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    stage.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
  }
  function moveCropDrag(event) {
    const c=state.crop;
    if(!c||!c.drag||c.drag.id!==event.pointerId)return;
    const m=cropMetrics();
    if(!m)return;
    if(m.maxX>0)c.panX=clamp(c.panX+(event.clientX-c.drag.x)/m.maxX,-1,1);
    if(m.maxY>0)c.panY=clamp(c.panY+(event.clientY-c.drag.y)/m.maxY,-1,1);
    c.drag.x=event.clientX;c.drag.y=event.clientY;
    updateCropVisual();
  }
  function stopCropDrag(event) {
    const c=state.crop;
    if(c?.drag&&(event.pointerId===c.drag.id||event.type==='pointercancel'))c.drag=null;
  }
  async function applyCrop() {
    const c=state.crop;
    if(!c||c.applying||!enabled())return;
    c.applying=true;
    try {
      const [tw,th]=IMAGE_TARGETS[c.kind];
      const width=c.bitmap.width,height=c.bitmap.height;
      const scale=Math.max(tw/width,th/height)*c.zoom;
      const sw=tw/scale,sh=th/scale;
      const sx=clamp((width-sw)*(1-c.panX)/2,0,width-sw);
      const sy=clamp((height-sh)*(1-c.panY)/2,0,height-sh);
      const canvas=document.createElement('canvas');
      canvas.width=tw;canvas.height=th;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('missing_canvas');
      ctx.drawImage(c.bitmap,sx,sy,sw,sh,0,0,tw,th);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
      if(!blob||!blob.size||blob.size>2*1024*1024)throw Error('invalid_result');
      if(state.crop!==c||!enabled())return;
      const url=URL.createObjectURL(blob);
      const kind=c.kind;
      destroyCrop();
      setLocalPhoto(kind,url);
      photoStatus('demoImageUpdated');
    }catch(_) {
      if(state.crop===c){c.applying=false;photoStatus('demoCropSaveError');}
    }
  }
  async function photoChosen(file,kind) {
    if(!file||!IMAGE_TARGETS[kind]||!enabled())return;
    destroyCrop();
    const job=++state.imageJob[kind];
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>IMAGE_LIMITS[kind]) {
      photoStatus('demoImageInvalid');return;
    }
    photoStatus('demoImageWorking');
    let bitmap=null,sourceUrl=null;
    try {
      const signature=new Uint8Array(await file.slice(0,16).arrayBuffer());
      if(imageMagic(signature)!==file.type)throw Error('magic_mismatch');
      if(typeof createImageBitmap!=='function')throw Error('bitmap_unsupported');
      bitmap=await createImageBitmap(file);
      if(!bitmap.width||!bitmap.height||bitmap.width>10000||bitmap.height>10000||bitmap.width*bitmap.height>32000000)throw Error('dimensions');
      if(job!==state.imageJob[kind]||!enabled()){bitmap.close?.();return;}
      sourceUrl=URL.createObjectURL(file);
      state.crop={kind,bitmap,sourceUrl,zoom:1,panX:0,panY:0,drag:null,applying:false};
      bitmap=null;sourceUrl=null;
      renderCrop();
    }catch(_){
      if(bitmap?.close)bitmap.close();
      if(sourceUrl&&URL.revokeObjectURL)URL.revokeObjectURL(sourceUrl);
      if(job===state.imageJob[kind])photoStatus('demoImageDecodeFail');
    }
  }
  function clearLocalPhoto(kind) {
    if(!IMAGE_TARGETS[kind])return;
    if(state.crop?.kind===kind)destroyCrop();
    ++state.imageJob[kind];
    setLocalPhoto(kind,null);
    const input=byId(kind==='avatar'?'bas-c-avatar-file':'bas-c-banner-file');
    if(input)input.value='';
    photoStatus('demoImageUpdated');
  }

  function validateDraft(d) {
    return d && typeof d.handle==='string' && /^[A-Za-z0-9_]{3,32}$/.test(d.handle) &&
      typeof d.display_name==='string' && d.display_name.trim().length>0 &&
      [...d.display_name.trim()].length<=80 && !/[<>\x00-\x1f\x7f]/.test(d.display_name) &&
      typeof d.bio==='string' && [...d.bio].length<=500 &&
      !/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(d.bio) &&
      ['moon','neon','sakura','aurora'].includes(d.theme);
  }
  function demoInput(event) {
    if (state.modal?.type!=='account') return false;
    const target=event.target;
    const fields={
      'bas-c-account-handle':['handle','bas-c-account-user'],
      'bas-c-account-name':['display_name','bas-c-account-display'],
      'bas-c-account-bio':['bio','bas-c-account-preview-bio']
    };
    if (target?.id==='bas-c-account-theme') {
      if(!['moon','neon','sakura','aurora'].includes(target.value))return true;
      state.profileDraft={...(state.profileDraft||state.demoProfile),theme:target.value};
      const card=byId('bas-c-account-card');
      if(card)card.setAttribute('data-theme',target.value);
      const av=byId('bas-c-account-avatar');
      const avatars={moon:'Moonlit',neon:'Vanta',sakura:'Hanami',aurora:'Northlight'};
      if(av)av.setAttribute('src',state.photoUrls.avatar||creatorAvatar(avatars[target.value]));
      return true;
    }
    const field=fields[target?.id];
    if(!field)return false;
    state.profileDraft={...(state.profileDraft||state.demoProfile),[field[0]]:target.value};
    const visual=byId(field[1]);
    if(visual) visual.textContent=field[0]==='handle'?'@'+target.value:target.value;
    const status=byId('bas-c-account-status');
    if(status)status.textContent=tr('demoLoginNote');
    return true;
  }
  function onSubmit(event) {
    if(window.BASCommunityLive?.onSubmit(event))return;
    if(event.target?.id!=='bas-c-account-form'||state.modal?.type!=='account')return;
    event.preventDefault();
    const draft=state.profileDraft||state.demoProfile;
    const status=byId('bas-c-account-status');
    if(!validateDraft(draft)) {
      if(status)status.textContent=tr('demoInvalid');
      return;
    }
    state.demoProfile={...draft,display_name:draft.display_name.trim(),bio:draft.bio.trim()};
    state.profileDraft={...state.demoProfile};
    state.profileSaved=true;
    if(status)status.textContent=tr('demoSaved');
  }

  function notice() {
    return '<div class="bas-c-modal-backdrop" data-c-action="dismiss"><section class="bas-c-modal bas-c-notice" role="dialog" aria-modal="true" aria-labelledby="bas-c-notice-title">'+
      '<div class="bas-c-modal-top"><span class="bas-c-kicker">'+safe(tr('beta'))+'</span><button type="button" class="bas-c-roundclose" data-c-action="dismiss" aria-label="'+safe(tr('close'))+'">×</button></div>'+
      '<div class="bas-c-notice-symbol">✦</div><h2 id="bas-c-notice-title">'+safe(tr('comingSoon'))+'</h2><p>'+safe(tr('accountSoon'))+'</p></section></div>';
  }
  function modalRender() {
    if(window.BASCommunityLive?.active())return;
    const host=byId('bas-c-modal-host');
    if (!host) return;
    if (!state.modal) { host.innerHTML=''; return; }
    let contents='';
    if (state.modal.type==='detail') {
      const item=SHOWCASE.find(x=>x.id===state.modal.id);
      contents=item?detail(item):'';
    } else if (state.modal.type==='upload') contents=upload();
    else if (state.modal.type==='account') contents=demoAccount();
    else contents=notice();
    host.innerHTML=contents;
    if(state.crop&&state.modal?.type==='account')renderCrop();
    else {const closer=host.querySelector?.('.bas-c-roundclose');if(closer)closer.focus();}
  }
  function openModal(type,id) {
    state.modal={type,id};
    modalRender();
  }
  function closeModal() {
    if (!state.modal) return;
    destroyCrop();
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
    window.BASCommunityLive?.mount();
    const closer=byId('bas-community-close');
    if (closer) closer.focus();
    return true;
  }
  function sync() {
    const allowed=enabled(), opt=byId('bas-community-feature-toggle');
    if (opt) { opt.checked=flag(); opt.disabled=!activeDev(); }
    if(window.BASCommunityOnline?.available()){
      const legacyPreview=byId('bas-community-devtools');
      if(legacyPreview)legacyPreview.hidden=true;
    }
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
    if(window.BASCommunityLive?.handle(event))return;
    const element=event.target.closest?.('[data-c-action]');
    if (!element || !element.closest('#bas-community-preview')) return;
    const action=element.dataset.cAction;
    const id=element.dataset.id;
    if (action==='crop-cancel' && state.crop) {
      if(element.classList.contains('bas-c-crop-backdrop')&&event.target!==element)return;
      destroyCrop();return;
    }
    if (action==='crop-reset' && state.crop) {
      state.crop.zoom=1;state.crop.panX=0;state.crop.panY=0;
      const input=byId('bas-c-crop-zoom');if(input)input.value='100';
      updateCropVisual();return;
    }
    if (action==='crop-apply' && state.crop) {void applyCrop();return;}
    if (action==='dismiss') {
      if (element.classList.contains('bas-c-modal-backdrop') && event.target!==element) return;
      closeModal(); return;
    }
    if (action==='close') { close(); return; }
    if (action==='detail') { openModal('detail',id); return; }
    if (action==='upload') { openModal('upload'); return; }
    if(action==='publish-source' && state.modal?.type==='upload'){
      const value=element.dataset.source;
      if(['editor','zip','companion'].includes(value)){
        state.publishDraft.source=value;
        state.publishDraft.ready=false;
        modalRender();
      }
      return;
    }
    if(action==='publish-check' && state.modal?.type==='upload'){
      const d=state.publishDraft;
      d.ready=d.rights && d.title.trim().length>=3 && d.title.trim().length<=100 &&
        !/[<>\x00-\x1f]/.test(d.title) && (d.source!=='zip'||!!selectedPublishFile) &&
        (d.source!=='editor'||!!recentExport) &&
        (d.source!=='companion'||(typeof apiFetch==='function'&&typeof ensureModuleFeature==='function'));
      const status=byId('bas-c-publish-status');
      if(status)status.textContent=tr(d.ready?'publishReady':'publishNeed');
      return;
    }
    if(action==='publish-private' && state.modal?.type==='upload'){launchPrivatePublish();return;}
    if(action==='real-account'){
      if(window.BASCommunityOnline?.available())void window.BASCommunityOnline.login();return;
    }
    if (action==='signin') { state.profileDraft={...state.demoProfile}; openModal('account'); return; }
    if (action==='remove-photo' && state.modal?.type==='account') { clearLocalPhoto(element.dataset.photo); return; }
    if (action==='creator') {
      const item=SHOWCASE.find(x=>x.id===id);
      if (item) navigate('creator',item.author);
      return;
    }
    if (action==='navigate') { navigate(element.dataset.route); return; }
    if (action==='follow') {
      const author=element.dataset.author;
      if (!PROFILES[author] || state.route!=='creator' || state.creator!==author) return;
      if (state.followed.has(author)) state.followed.delete(author);
      else state.followed.add(author);
      renderView(); return;
    }
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
    if(window.BASCommunityLive?.onInput(event))return;
    if(event.target?.id==='bas-c-publish-title'&&state.modal?.type==='upload'){
      state.publishDraft.title=String(event.target.value);state.publishDraft.ready=false;return;
    }
    if (event.target?.id==='bas-c-crop-zoom'&&state.crop) {setCropZoom(event.target.value);return;}
    if (demoInput(event)) return;
    if (event.target?.id==='bas-c-search') {
      state.search=event.target.value;
      updateCards();
    }
  }
  function onChange(event) {
    if(window.BASCommunityLive?.onChange(event))return;
    if(state.modal?.type==='upload'){
      if(event.target?.id==='bas-c-publish-rights'){
        state.publishDraft.rights=Boolean(event.target.checked);state.publishDraft.ready=false;return;
      }
      if(event.target?.id==='bas-c-publish-license'){
        state.publishDraft.license=String(event.target.value);state.publishDraft.ready=false;return;
      }
    }
    if (demoInput(event)) return;
    const t=event.target;
    if(state.modal?.type==='account' && (t?.id==='bas-c-avatar-file'||t?.id==='bas-c-banner-file')){
      void photoChosen(t.files?.[0],t.id==='bas-c-avatar-file'?'avatar':'banner');return;
    }
    if (t?.id==='bas-c-sort') {state.sort=t.value;updateCards();}
    if (t?.id==='bas-c-zip-input') {
      const file=t.files?.[0];
      const output=byId('bas-c-zip-result');
      if(!file||!output)return;
      const valid=/\.zip$/i.test(file.name) && file.size<=20*1024*1024 && file.size>0;
      const note=!/\.zip$/i.test(file.name)?tr('wrongType'):file.size>20*1024*1024?tr('overLimit'):tr('fileReady');
      selectedPublishFile=valid?file:null;
      state.publishDraft.filename=valid?file.name:null;
      state.publishDraft.size=valid?file.size:0;state.publishDraft.ready=false;
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
    byId('bas-community-preview')?.addEventListener('submit',onSubmit);
    byId('bas-community-preview')?.addEventListener('pointerdown',startCropDrag);
    byId('bas-community-preview')?.addEventListener('pointermove',moveCropDrag);
    byId('bas-community-preview')?.addEventListener('pointerup',stopCropDrag);
    byId('bas-community-preview')?.addEventListener('pointercancel',stopCropDrag);
    document.addEventListener('keydown',ev=>{
      const layer=byId('bas-community-preview');
      if(!layer||layer.hidden)return;
      if(ev.key==='Escape') {if(state.crop)destroyCrop();else if(state.modal)closeModal();else close();return;}
      if(state.crop&&document.activeElement===byId('bas-c-crop-stage')){
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.key)){
          ev.preventDefault();const c=state.crop;
          if(ev.key==='ArrowUp')c.panY=clamp(c.panY-.08,-1,1);
          if(ev.key==='ArrowDown')c.panY=clamp(c.panY+.08,-1,1);
          if(ev.key==='ArrowLeft')c.panX=clamp(c.panX-.08,-1,1);
          if(ev.key==='ArrowRight')c.panX=clamp(c.panX+.08,-1,1);
          updateCropVisual();return;
        }
      }
      if(ev.key!=='Tab')return;
      const scope=state.crop?byId('bas-c-crop-host'):(state.modal?byId('bas-c-modal-host'):layer);
      const focusables=scope?.querySelectorAll?.('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]),a[href]');
      if (!focusables?.length)return;
      const first=focusables[0],last=focusables[focusables.length-1];
      if(ev.shiftKey && document.activeElement===first){ev.preventDefault();last.focus();}
      else if(!ev.shiftKey && document.activeElement===last){ev.preventDefault();first.focus();}
    });
    window.addEventListener('bas:developer-mode-changed',sync);
    window.addEventListener('bas:languagechange',sync);
    window.addEventListener('pagehide',()=>{destroyCrop();disposeUrl('avatar');disposeUrl('banner');});
    sync();
  }
  window.BASCommunityPreview=Object.freeze({
    version:2,enabled,open,close,sync,
    state:()=>({optedIn:flag(),available:enabled(),open:!!byId('bas-community-preview')&&!byId('bas-community-preview').hidden,route:state.route,showcaseCount:SHOWCASE.length,profilePreview:{...state.demoProfile},customPhotos:{avatar:Boolean(state.photoUrls.avatar),banner:Boolean(state.photoUrls.banner)},cropEditing:state.crop?.kind||null,cropZoom:state.crop?.zoom||null,publishingPreview:{...state.publishDraft}})
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
