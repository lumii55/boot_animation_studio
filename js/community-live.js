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
  invalidZip:'Escolha um ZIP válido de até 40 MiB.',missingZip:'Escolha um arquivo ZIP antes de publicar.',
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
  invalidZip:'Choose a valid ZIP up to 40 MiB.',missingZip:'Choose a ZIP file before publishing.',
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
const SOCIAL_TEXT={
 pt:{tagline:'Uma criação da comunidade',about:'Sobre esta animação',creator:'Criador',follower:'seguidores',
  like:'Curtir',liked:'Curtido',follow:'Seguir',following:'Seguindo',comment:'Comentários',commentEmpty:'Seja a primeira pessoa a comentar! ✨',
  commentPlaceholder:'Escreva um comentário (somente texto e emoji)…',commentNote:'Somente texto e emoji · máximo de 600 caracteres · sem imagens, vídeos ou anexos.',
  commentSend:'Comentar',commentLogin:'Entre com GitHub para comentar e interagir.',commentBusy:'Enviando…',
  share:'Compartilhar',shareReady:'Compartilhamento preparado!',shareBeta:'No beta local, links para outras pessoas só funcionarão após o lançamento no site público.',
  remix:'Remixar no Studio',remixTitle:'Abrir esta animação no editor?',remixHelp:'O arquivo aprovado será importado no Studio e poderá substituir o seu projeto atual. Salve antes de continuar. A licença e os créditos do original serão preservados.',
  remixDenied:'A licença desta animação não permite remix.',remixWorking:'Importando animação no Studio…',remixAttribution:'Remix baseado em',
  remixOriginal:'Remix de',remixRights:'Ao publicar um remix, você deve respeitar a atribuição e a licença original.',
  loading:'Carregando conversas…',more:'Mais comentários',reportComment:'Denunciar comentário',reportCommentTitle:'Denunciar comentário',
  reportCommentHelp:'Descreva o problema (5–500 caracteres). A denúncia vai para moderação privada.',
  noOwnerFollow:'Sua publicação',back:'Voltar à galeria',statsDownloads:'downloads',statsLikes:'curtidas',
  statsComments:'comentários',sendError:'Não foi possível concluir a ação.',editPost:'Editar publicação',showProfile:'Ver perfil',
  cancel:'Cancelar',confirm:'Continuar',remixDisabled:'Somente download · remix não autorizado'},
 en:{tagline:'A community creation',about:'About this animation',creator:'Creator',follower:'followers',
  like:'Like',liked:'Liked',follow:'Follow',following:'Following',comment:'Comments',commentEmpty:'Be the first to comment! ✨',
  commentPlaceholder:'Write a comment (text and emoji only)…',commentNote:'Text and emoji only · up to 600 characters · no images, videos or attachments.',
  commentSend:'Comment',commentLogin:'Sign in with GitHub to comment and interact.',commentBusy:'Sending…',
  share:'Share',shareReady:'Ready to share!',shareBeta:'In local beta, links to other people will only work after the public site launches.',
  remix:'Remix in Studio',remixTitle:'Open this animation in the editor?',remixHelp:'The approved ZIP will be imported in Studio and may replace your current project. Save it first. Original attribution and license will be preserved.',
  remixDenied:'This animation license does not allow remixing.',remixWorking:'Importing to Studio…',remixAttribution:'Remix based on',
  remixOriginal:'Remix of',remixRights:'Publishing a remix must respect the original license and attribution.',
  loading:'Loading discussion…',more:'More comments',reportComment:'Report comment',reportCommentTitle:'Report comment',
  reportCommentHelp:'Describe the issue (5–500 characters). A private moderator will review it.',
  noOwnerFollow:'Your post',back:'Back to gallery',statsDownloads:'downloads',statsLikes:'likes',
  statsComments:'comments',sendError:'Could not complete the action.',editPost:'Edit post',showProfile:'View profile',
  cancel:'Cancel',confirm:'Continue',remixDisabled:'Download only · remix not permitted'},
 es:{tagline:'Una creación de la comunidad',about:'Sobre esta animación',creator:'Creador',follower:'seguidores',like:'Me gusta',liked:'Te gusta',follow:'Seguir',following:'Siguiendo',comment:'Comentarios',commentEmpty:'¡Sé la primera persona en comentar! ✨',commentPlaceholder:'Escribe un comentario (solo texto y emojis)…',commentNote:'Solo texto y emojis · hasta 600 caracteres · sin archivos.',commentSend:'Comentar',commentLogin:'Inicia sesión para comentar.',share:'Compartir',remix:'Remezclar en Studio',remixTitle:'¿Abrir en el editor?',remixHelp:'Se importará el ZIP aprobado y se puede reemplazar el proyecto actual. Guárdalo primero.',remixDenied:'La licencia no permite remixes.',remixOriginal:'Remix de',reportComment:'Denunciar comentario',reportCommentTitle:'Denunciar comentario',reportCommentHelp:'Explica el motivo (5–500 caracteres).',loading:'Cargando comentarios…',more:'Más comentarios',statsDownloads:'descargas',statsLikes:'me gusta',statsComments:'comentarios',editPost:'Editar publicación',showProfile:'Ver perfil',cancel:'Cancelar',confirm:'Continuar'},
 fr:{tagline:'Une création de la communauté',about:'À propos de cette animation',creator:'Créateur',follower:'abonnés',like:'Aimer',liked:'Aimé',follow:'Suivre',following:'Abonné',comment:'Commentaires',commentEmpty:'Soyez la première personne à commenter ! ✨',commentPlaceholder:'Écrivez un commentaire (texte et émojis uniquement)…',commentNote:'Texte et émojis uniquement · 600 caractères max · aucun fichier.',commentSend:'Commenter',commentLogin:'Connectez-vous pour commenter.',share:'Partager',remix:'Remixer dans Studio',remixTitle:'Ouvrir dans l’éditeur ?',remixHelp:'Le ZIP approuvé sera importé et peut remplacer le projet actuel. Sauvegardez-le avant.',remixDenied:'Cette licence interdit les remixes.',remixOriginal:'Remix de',reportComment:'Signaler un commentaire',reportCommentTitle:'Signaler un commentaire',reportCommentHelp:'Expliquez le problème (5 à 500 caractères).',loading:'Chargement…',more:'Plus de commentaires',statsDownloads:'téléchargements',statsLikes:'j’aime',statsComments:'commentaires',editPost:'Modifier la publication',showProfile:'Voir le profil',cancel:'Annuler',confirm:'Continuer'},
 de:{tagline:'Ein Werk der Community',about:'Über diese Animation',creator:'Ersteller',follower:'Follower',like:'Gefällt mir',liked:'Gefällt dir',follow:'Folgen',following:'Folge ich',comment:'Kommentare',commentEmpty:'Schreibe den ersten Kommentar! ✨',commentPlaceholder:'Kommentar schreiben (nur Text und Emoji)…',commentNote:'Nur Text und Emoji · max. 600 Zeichen · keine Dateien.',commentSend:'Kommentieren',commentLogin:'Zum Kommentieren anmelden.',share:'Teilen',remix:'Im Studio remixen',remixTitle:'Im Editor öffnen?',remixHelp:'Die genehmigte ZIP-Datei wird importiert und kann dein aktuelles Projekt ersetzen. Bitte vorher speichern.',remixDenied:'Diese Lizenz erlaubt keine Remixe.',remixOriginal:'Remix von',reportComment:'Kommentar melden',reportCommentTitle:'Kommentar melden',reportCommentHelp:'Beschreibe das Problem (5–500 Zeichen).',loading:'Lädt…',more:'Weitere Kommentare',statsDownloads:'Downloads',statsLikes:'Likes',statsComments:'Kommentare',editPost:'Beitrag bearbeiten',showProfile:'Profil ansehen',cancel:'Abbrechen',confirm:'Fortfahren'},
 it:{tagline:'Una creazione della community',about:'Informazioni sull’animazione',creator:'Creatore',follower:'follower',like:'Mi piace',liked:'Ti piace',follow:'Segui',following:'Segui già',comment:'Commenti',commentEmpty:'Lascia il primo commento! ✨',commentPlaceholder:'Scrivi un commento (solo testo ed emoji)…',commentNote:'Solo testo ed emoji · massimo 600 caratteri · nessun allegato.',commentSend:'Commenta',commentLogin:'Accedi per commentare.',share:'Condividi',remix:'Remix nello Studio',remixTitle:'Aprire nell’editor?',remixHelp:'Lo ZIP approvato sarà importato e potrebbe sostituire il progetto corrente. Salvalo prima.',remixDenied:'La licenza non consente remix.',remixOriginal:'Remix di',reportComment:'Segnala commento',reportCommentTitle:'Segnala commento',reportCommentHelp:'Descrivi il problema (5–500 caratteri).',loading:'Caricamento…',more:'Altri commenti',statsDownloads:'download',statsLikes:'mi piace',statsComments:'commenti',editPost:'Modifica post',showProfile:'Vedi profilo',cancel:'Annulla',confirm:'Continua'},
 ja:{tagline:'コミュニティ作品',about:'このアニメーションについて',creator:'作者',follower:'フォロワー',like:'いいね',liked:'いいね済み',follow:'フォロー',following:'フォロー中',comment:'コメント',commentEmpty:'最初のコメントを書こう！ ✨',commentPlaceholder:'コメント（テキスト・絵文字のみ）…',commentNote:'テキスト・絵文字のみ · 最大600文字 · 添付不可',commentSend:'投稿',commentLogin:'コメントするにはログインしてください。',share:'共有',remix:'Studioでリミックス',remixTitle:'エディターで開きますか？',remixHelp:'承認済みZIPを読み込みます。現在のプロジェクトが置き換わる可能性があるので先に保存してください。',remixDenied:'このライセンスではリミックスできません。',remixOriginal:'元の作品',reportComment:'コメントを通報',reportCommentTitle:'コメントを通報',reportCommentHelp:'理由を5〜500文字で入力してください。',loading:'読み込み中…',more:'もっと見る',statsDownloads:'ダウンロード',statsLikes:'いいね',statsComments:'コメント',editPost:'投稿を編集',showProfile:'プロフィールを見る',cancel:'キャンセル',confirm:'続行'},
 zh:{tagline:'社区作品',about:'关于这个动画',creator:'创作者',follower:'关注者',like:'点赞',liked:'已点赞',follow:'关注',following:'已关注',comment:'评论',commentEmpty:'发表第一条评论吧！ ✨',commentPlaceholder:'写评论（仅限文字和表情）…',commentNote:'仅限文字和表情 · 最多600字 · 不支持附件',commentSend:'发表',commentLogin:'登录后可发表评论。',share:'分享',remix:'在 Studio 中二次创作',remixTitle:'在编辑器中打开？',remixHelp:'将导入已审核ZIP，可能替换当前项目。请先保存。',remixDenied:'该许可证不允许二次创作。',remixOriginal:'改编自',reportComment:'举报评论',reportCommentTitle:'举报评论',reportCommentHelp:'请输入5至500字的原因。',loading:'加载中…',more:'更多评论',statsDownloads:'下载',statsLikes:'点赞',statsComments:'评论',editPost:'编辑帖子',showProfile:'查看主页',cancel:'取消',confirm:'继续'}
};
Object.assign(SOCIAL_TEXT.es,{commentBusy:'Enviando…',shareReady:'¡Listo para compartir!',shareBeta:'El enlace de esta beta local solo funciona en tu dispositivo hasta el lanzamiento público.',remixWorking:'Importando al Studio…',remixAttribution:'Remix basado en',remixRights:'Publicar un remix requiere respetar la licencia y los créditos originales.',noOwnerFollow:'Tu publicación',back:'Volver a la galería',sendError:'No se pudo completar la acción.',remixDisabled:'Solo descarga · remix no autorizado'});
Object.assign(SOCIAL_TEXT.fr,{commentBusy:'Envoi…',shareReady:'Prêt à partager !',shareBeta:'Le lien de la bêta locale ne marche que sur votre appareil avant le lancement public.',remixWorking:'Importation dans Studio…',remixAttribution:'Remix basé sur',remixRights:'Respectez la licence et les crédits d’origine lors de la publication.',noOwnerFollow:'Votre publication',back:'Retour à la galerie',sendError:'Action impossible.',remixDisabled:'Téléchargement uniquement · remix non autorisé'});
Object.assign(SOCIAL_TEXT.de,{commentBusy:'Wird gesendet…',shareReady:'Bereit zum Teilen!',shareBeta:'Der lokale Beta-Link funktioniert bis zum öffentlichen Start nur auf deinem Gerät.',remixWorking:'Wird in Studio importiert…',remixAttribution:'Remix basierend auf',remixRights:'Beim Veröffentlichen eines Remixes gelten die ursprüngliche Lizenz und Quellenangabe.',noOwnerFollow:'Dein Beitrag',back:'Zur Galerie',sendError:'Aktion fehlgeschlagen.',remixDisabled:'Nur Download · kein Remix erlaubt'});
Object.assign(SOCIAL_TEXT.it,{commentBusy:'Invio…',shareReady:'Pronto da condividere!',shareBeta:'Il collegamento della beta locale funziona solo su questo dispositivo fino al lancio pubblico.',remixWorking:'Importazione in Studio…',remixAttribution:'Remix basato su',remixRights:'Per pubblicare un remix rispetta la licenza e i crediti originali.',noOwnerFollow:'Il tuo post',back:'Torna alla galleria',sendError:'Impossibile completare l’azione.',remixDisabled:'Solo download · remix non consentito'});
Object.assign(SOCIAL_TEXT.ja,{commentBusy:'送信中…',shareReady:'共有の準備ができました！',shareBeta:'ローカルβのリンクは正式公開までこの端末だけで動作します。',remixWorking:'Studioへ読み込み中…',remixAttribution:'元の作品',remixRights:'リミックスを投稿する際は元のライセンスとクレジットを守ってください。',noOwnerFollow:'自分の投稿',back:'ギャラリーに戻る',sendError:'操作に失敗しました。',remixDisabled:'ダウンロードのみ・リミックス不可'});
Object.assign(SOCIAL_TEXT.zh,{commentBusy:'发送中…',shareReady:'已准备分享！',shareBeta:'本地测试链接在公开发布前仅能在此设备使用。',remixWorking:'正在导入 Studio…',remixAttribution:'改编自',remixRights:'发布改编作品时须遵守原始许可证并注明出处。',noOwnerFollow:'你的帖子',back:'返回图库',sendError:'操作失败。',remixDisabled:'仅限下载 · 不允许改编'});
SOCIAL_TEXT.pt.publicAvatarConsent='Mostrar minha foto publicamente no perfil e nos comentários';
SOCIAL_TEXT.en.publicAvatarConsent='Show my profile photo publicly in profiles and comments';
SOCIAL_TEXT.es.publicAvatarConsent='Mostrar mi foto públicamente en perfiles y comentarios';
SOCIAL_TEXT.fr.publicAvatarConsent='Afficher ma photo publiquement sur les profils et commentaires';
SOCIAL_TEXT.de.publicAvatarConsent='Mein Profilbild öffentlich in Profilen und Kommentaren zeigen';
SOCIAL_TEXT.it.publicAvatarConsent='Mostrare pubblicamente la foto nel profilo e nei commenti';
SOCIAL_TEXT.ja.publicAvatarConsent='プロフィールやコメントに自分の写真を公開する';
SOCIAL_TEXT.zh.publicAvatarConsent='在个人主页和评论中公开显示我的头像';
Object.assign(SOCIAL_TEXT.pt,{"publicAvatarConsent": "Mostrar minha foto nos perfis e comentários", "publicBannerConsent": "Mostrar meu banner no perfil público", "profileVisibility": "Visibilidade das imagens", "profileVisibilityHint": "Escolha quem pode ver suas imagens. Fotos antigas permanecem privadas até você autorizar.", "choosePhoto": "Escolher foto", "chooseBanner": "Escolher banner", "guestActionTitle": "Entre para interagir", "guestActionHelp": "Para curtir, seguir, comentar ou denunciar, entre com GitHub. Explorar e baixar continuam livres.", "guestLoginNow": "Entrar com GitHub", "guestNotNow": "Agora não"});
Object.assign(SOCIAL_TEXT.en,{"publicAvatarConsent": "Show my photo in profiles and comments", "publicBannerConsent": "Show my banner on my public profile", "profileVisibility": "Image visibility", "profileVisibilityHint": "Choose who can see your images. Old private photos stay private until you allow them.", "choosePhoto": "Choose photo", "chooseBanner": "Choose banner", "guestActionTitle": "Sign in to interact", "guestActionHelp": "Sign in with GitHub to like, follow, comment or report. Browsing and downloads remain free.", "guestLoginNow": "Sign in with GitHub", "guestNotNow": "Not now"});
Object.assign(SOCIAL_TEXT.es,{"publicAvatarConsent": "Mostrar mi foto en perfiles y comentarios", "publicBannerConsent": "Mostrar mi banner en el perfil público", "profileVisibility": "Visibilidad de imágenes", "profileVisibilityHint": "Las fotos antiguas siguen siendo privadas hasta que lo permitas.", "choosePhoto": "Elegir foto", "chooseBanner": "Elegir banner", "guestActionTitle": "Inicia sesión para participar", "guestActionHelp": "Accede con GitHub para dar me gusta, seguir, comentar o denunciar. Explorar y descargar es libre.", "guestLoginNow": "Entrar con GitHub", "guestNotNow": "Ahora no"});
Object.assign(SOCIAL_TEXT.fr,{"publicAvatarConsent": "Afficher ma photo dans les profils et commentaires", "publicBannerConsent": "Afficher ma bannière sur mon profil public", "profileVisibility": "Visibilité des images", "profileVisibilityHint": "Les anciennes photos privées le restent sans accord.", "choosePhoto": "Choisir la photo", "chooseBanner": "Choisir la bannière", "guestActionTitle": "Connectez-vous pour participer", "guestActionHelp": "Connectez-vous avec GitHub pour aimer, suivre, commenter ou signaler. Exploration et téléchargement restent libres.", "guestLoginNow": "Se connecter avec GitHub", "guestNotNow": "Pas maintenant"});
Object.assign(SOCIAL_TEXT.de,{"publicAvatarConsent": "Mein Foto in Profilen und Kommentaren zeigen", "publicBannerConsent": "Mein Banner im öffentlichen Profil zeigen", "profileVisibility": "Bildsichtbarkeit", "profileVisibilityHint": "Alte private Fotos bleiben privat, bis du sie freigibst.", "choosePhoto": "Foto wählen", "chooseBanner": "Banner wählen", "guestActionTitle": "Zum Mitmachen anmelden", "guestActionHelp": "Mit GitHub anmelden, um zu liken, zu folgen, zu kommentieren oder zu melden. Downloads sind frei.", "guestLoginNow": "Mit GitHub anmelden", "guestNotNow": "Nicht jetzt"});
Object.assign(SOCIAL_TEXT.it,{"publicAvatarConsent": "Mostra la foto nei profili e commenti", "publicBannerConsent": "Mostra il banner nel profilo pubblico", "profileVisibility": "Visibilità immagini", "profileVisibilityHint": "Le vecchie foto private restano tali fino al tuo consenso.", "choosePhoto": "Scegli foto", "chooseBanner": "Scegli banner", "guestActionTitle": "Accedi per partecipare", "guestActionHelp": "Accedi con GitHub per Mi piace, seguire, commentare o segnalare. Download e ricerca sono liberi.", "guestLoginNow": "Accedi con GitHub", "guestNotNow": "Non ora"});
Object.assign(SOCIAL_TEXT.ja,{"publicAvatarConsent": "プロフィールとコメントで写真を表示", "publicBannerConsent": "公開プロフィールでバナーを表示", "profileVisibility": "画像の公開設定", "profileVisibilityHint": "以前の非公開写真は許可するまで非公開です。", "choosePhoto": "写真を選択", "chooseBanner": "バナーを選択", "guestActionTitle": "ログインして参加", "guestActionHelp": "いいね・フォロー・コメント・通報にはGitHubログインが必要です。閲覧とダウンロードは自由です。", "guestLoginNow": "GitHubでログイン", "guestNotNow": "後で"});
Object.assign(SOCIAL_TEXT.zh,{"publicAvatarConsent": "在主页和评论中显示照片", "publicBannerConsent": "在公开主页显示横幅", "profileVisibility": "图片可见性", "profileVisibilityHint": "旧的私人照片在授权前保持私密。", "choosePhoto": "选择照片", "chooseBanner": "选择横幅", "guestActionTitle": "登录以参与", "guestActionHelp": "点赞、关注、评论和举报需要登录GitHub。浏览和下载免费。", "guestLoginNow": "通过GitHub登录", "guestNotNow": "暂不"});
const st=k=>SOCIAL_TEXT[language()]?.[k]||SOCIAL_TEXT.en[k]||k;
const state={route:'explore',items:[],query:'',sort:'newest',loading:false,
 status:'',busy:false,selected:null,file:null,source:'zip',title:'',summary:'',
 license:'CC-BY-4.0',author:'',tags:[],rights:false,tagInput:'',drafts:[],
 moderation:null,remotePictures:{avatar:null,banner:null},profileDraft:null,creators:[],creatorItems:[],selectedCreator:null,modal:null,owned:[],editDraft:null,social:null,creatorSocial:null,commentText:'',socialBusy:false,commentBusy:false,remix:null,rejectedId:null};
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
 const foot=root.querySelector('.bas-c-footnote');
 if(foot)foot.textContent='BAS Community';
 for(const nav of root.querySelectorAll('.bas-c-navbtn')){
  nav.classList.toggle('is-current',nav.dataset.route===state.route);
 }
}
// Route-local return stack: X never closes the entire BAS Community.
// The scroll container belongs to the Community overlay, not window.
const routeHistory=[];
const nestedRoutes=new Set(['detail','creator','licenses','edit-animation',
 'profile-edit','rejected','upload']);
function scrollContainer(){
 return overlay()?.querySelector?.('.bas-c-scroll')||
   document.querySelector?.('#bas-community-preview .bas-c-scroll')||null;
}
function go(route,{reset=false}={}){
 const previous=state.route;
 if(reset)routeHistory.length=0;
 else if(route!==previous&&nestedRoutes.has(route)){
  routeHistory.push({route:previous,top:scrollContainer()?.scrollTop||0,
   selected:state.selected,social:state.social,selectedCreator:state.selectedCreator,
   creatorSocial:state.creatorSocial,creatorItems:state.creatorItems,editDraft:state.editDraft});
  if(routeHistory.length>24)routeHistory.shift();
 }
 state.route=route;
 state.modal=null;renderModal();
 if(previous!==route){const scroller=scrollContainer();if(scroller)scroller.scrollTop=0;}
 render();
 if(route==='explore')void fetchGallery();
 if(route==='creators')void fetchCreators();
 if(route==='creator'){void fetchCreatorPosts();void fetchCreatorSocial();}
 if(route==='detail')void fetchSocial();
 if(route==='profile'){void fetchPictures();void fetchDrafts();void fetchOwned();}
}
function leaveView(){
 const saved=routeHistory.pop();
 if(!saved){go('explore',{reset:true});return;}
 state.route=saved.route;
 if(saved.route==='detail'){state.selected=saved.selected;state.social=saved.social;}
 if(saved.route==='creator'){
  state.selectedCreator=saved.selectedCreator;state.creatorSocial=saved.creatorSocial;
  state.creatorItems=saved.creatorItems;
 }
 if(saved.route==='edit-animation')state.editDraft=saved.editDraft;
 state.modal=null;renderModal();
 render();
 const restore=()=>{
  if(state.route!==saved.route)return;
  const scroller=scrollContainer();
  if(scroller)scroller.scrollTop=saved.top;
 };
 restore();
 window.requestAnimationFrame?.(restore);
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
 if(['storage_quota_exceeded','quota_or_draft_conflict'].includes(raw))return 'Armazenamento privado do beta cheio. Nenhum arquivo foi apagado.';
 if(raw==='draft_conflict')return 'Conflito no rascunho. Tente novamente.';
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
   '<canvas class="bas-live-anim-canvas" data-bas-animation="'+safe(item.id)+'" aria-hidden="true"></canvas>'+
   '<span class="bas-live-preview-loading" aria-hidden="true">✧</span></button>'+
  '<div class="bas-c-card__content"><div class="bas-c-card__meta"><span>'+safe((item.tags||[]).join(', '))+'</span>'+
   '<span>'+safe(item.fps)+' fps</span></div>'+
  '<button type="button" class="bas-c-card__title" data-c-action="detail" data-id="'+safe(item.id)+'">'+safe(item.title)+'</button>'+
  '<div class="bas-c-card__bottom"><button type="button" class="bas-c-author bas-live-author-link" data-c-action="creator-author" data-handle="'+safe(item.handle)+'">@'+safe(item.handle)+'</button>'+
   '<button type="button" class="bas-c-heart" data-c-action="download" data-id="'+safe(item.id)+'">↓ '+safe(tr('download').replace(/\s*ZIP$/i,''))+'</button>'+
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
function avatarSource(creator){
 const handle=creator?.handle;
 if(!handle||!/^[A-Za-z0-9_]{3,32}$/.test(handle))return null;
 const self=user();
 if(self?.handle===handle&&state.remotePictures.avatar)return state.remotePictures.avatar;
 return (creator.avatar_public===true||creator.avatar_public===1)?api().apiOrigin+'/v1/social/avatars/'+encodeURIComponent(handle):null;
}
function creatorAvatar(creator){
 const src=avatarSource(creator);
 return src?'<img class="bas-live-creator-avatar" alt="" src="'+safe(src)+'">':
  '<span class="bas-live-creator-avatar" aria-hidden="true">'+safe(creator.display_name?.charAt(0)||'✧')+'</span>';
}
function creatorsView(){
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('creators'))+'</h1>'+
  '<p>'+safe(tr('creatorsDesc'))+'</p></section>'+
  '<div class="bas-c-creators">'+(state.creators.length?state.creators.map(creator=>
   '<button type="button" class="bas-c-creator-tile" data-c-action="creator" data-handle="'+safe(creator.handle)+'">'+
   creatorAvatar(creator)+
   '<strong>'+safe(creator.display_name||creator.handle)+'</strong>'+
   '<small>@'+safe(creator.handle)+' · '+safe(creator.animation_count)+' '+safe(tr('works'))+'</small>'+
   '<span class="bas-c-tilearrow">↗</span></button>').join(''):
   '<p class="bas-c-noresults">'+safe(tr('noCreators'))+'</p>')+'</div>'+statusHTML();
}
function creatorView(){
 const creator=state.selectedCreator;
 if(!creator)return creatorsView();
 return '<section class="bas-c-profile" data-theme="moon"><div class="bas-c-profile-cover">'+
  (user()&&creator.handle===user().handle&&state.remotePictures.banner?'<img class="bas-c-account-cover-image" alt="" src="'+safe(state.remotePictures.banner)+'">':(state.creatorSocial?.banner_public||creator.banner_public?'<img class="bas-c-account-cover-image" alt="" src="'+safe(api().apiOrigin+'/v1/social/banners/'+encodeURIComponent(creator.handle))+'">':'<span class="bas-c-profile-cover__orb">✧</span>'))+'</div>'+
  '<div class="bas-c-profile-content"><div class="bas-c-profile-top"><div class="bas-c-profile-identity">'+
  creatorAvatar({...creator,avatar_public:state.creatorSocial?.avatar_public??creator.avatar_public})+
  '<div class="bas-c-profile-nameblock"><h1 id="bas-c-page-title">'+safe(creator.display_name||creator.handle)+'</h1>'+
  '<span>@'+safe(creator.handle)+'</span></div></div>'+
  (!logged()||user()?.handle!==creator.handle?'<button type="button" class="bas-c-button bas-c-button--bright" data-c-action="follow" data-handle="'+safe(creator.handle)+'" aria-pressed="'+Boolean(state.creatorSocial?.following)+'">'+safe(state.creatorSocial?.following?st('following'):st('follow'))+'</button>':'')+
  '</div><p>'+safe(state.creatorSocial?.bio||tr('creatorWorks'))+'</p>'+
  '<div class="bas-social-creator-stats">'+socialStat(state.creatorSocial?.followers,st('follower'))+'</div></div></section>'+
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
  '<div class="bas-c-grid">'+(state.owned.length?state.owned.map(item=>{
   const canOpen=item.status==='published',editable=canOpen&&!item.edit_id;
   return '<article class="bas-c-card bas-live-admin-item"><div class="bas-c-card__content">'+
   '<h3>'+safe(item.title)+'</h3>'+
   '<p>'+safe(localStatus(item.status))+'</p>'+
   (item.rejected_revision_reason?'<p class="bas-live-hint bas-live-rejection-summary">Ultima revisao negada: '+safe(item.rejected_revision_reason)+'</p>':'')+
   (item.edit_id?'<p class="bas-live-hint">✧ '+safe(tr('ownerPendingEdit'))+'</p>':'')+
   '<div class="bas-live-actions">'+
   (item.status==='rejected'?'<button class="bas-c-button bas-c-button--bright" type="button" data-c-action="open-rejected" data-id="'+safe(item.id)+'">Ver motivo e previa</button>':'')+
   (canOpen?'<button class="bas-c-button" type="button" data-c-action="open-owned" data-id="'+safe(item.id)+'">'+safe(tr('ownerOpen'))+'</button>':'')+
   (editable?'<button class="bas-c-button bas-c-button--bright" type="button" data-c-action="edit-animation" data-id="'+safe(item.id)+'">'+safe(tr('ownerEdit'))+'</button>':'')+
   (item.edit_id?'<button class="bas-c-button" type="button" data-c-action="cancel-owner-edit" data-id="'+safe(item.edit_id)+'">'+safe(tr('ownerCancelEdit'))+'</button>':'')+
   '<button class="bas-c-button bas-live-danger" type="button" data-c-action="remove-animation" data-id="'+safe(item.id)+'">'+safe(tr('ownerRemove'))+'</button></div></div></article>';
  }).join(''):'<p class="bas-c-noresults">'+safe(tr('noPosts'))+'</p>')+'</div>'+
  statusHTML();
}

// The rejected publication remains unpublished. All fields below are read-only.
function rejectedView(){
 const post=state.owned.find(x=>x.id===state.rejectedId&&x.status==='rejected');
 if(!post)return profileView();
 const reason=(post.rejection_reason||'').trim()||'A moderacao nao informou o motivo.';
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(post.title)+'</h1>'+
  '<p class="bas-live-rejected-label">Rejeitada pela moderacao</p></section>'+
  '<section class="bas-live-rejected-panel">'+
   '<div class="bas-social-edit-header"><div class="bas-social-edit-preview">'+
    '<canvas data-rejected-preview="'+safe(post.id)+'" class="bas-live-rejected-canvas" aria-label="Previa privada da animacao rejeitada"></canvas>'+
    '<span class="bas-live-preview-loading" data-rejected-load>Preparando previa...</span></div>'+
    '<div><span class="bas-c-kicker">Motivo da rejeicao</span>'+
    '<p class="bas-live-rejected-reason">'+safe(reason)+'</p></div></div>'+
   '<dl class="bas-live-rejected-fields">'+
    '<dt>Titulo</dt><dd>'+safe(post.title)+'</dd>'+
    '<dt>Descricao</dt><dd>'+safe(post.summary||'Sem descricao')+'</dd>'+
    '<dt>Tags</dt><dd>'+safe((post.tags||[]).join(', ')||'Nenhuma')+'</dd>'+
    '<dt>Licenca</dt><dd>'+safe(post.license||'Nao informada')+'</dd>'+
    '<dt>Creditos</dt><dd>'+safe(post.author_credit||'Nao informados')+'</dd>'+
    '<dt>Dimensoes</dt><dd>'+safe(post.width||'?')+' x '+safe(post.height||'?')+' / '+safe(post.fps||'?')+' fps</dd>'+
   '</dl>'+
   '<div class="bas-live-actions"><button type="button" class="bas-c-button bas-live-danger" data-c-action="remove-animation" data-id="'+safe(post.id)+'">'+safe(tr('ownerRemove'))+'</button></div>'+
  '</section>'+statusHTML();
}
let rejectedController=null,rejectedGeneration=0;
async function attachRejectedPreview(target,generation){
 const id=state.rejectedId;
 const canvas=target.querySelector?.('canvas[data-rejected-preview]');
 const status=target.querySelector?.('[data-rejected-load]');
 if(!canvas||!id||!api().rejectedZip)return;
 try{
  const blob=await api().rejectedZip(id);
  if(generation!==rejectedGeneration||state.route!=='rejected'||!canvas.isConnected)return;
  const engine=window.BASCommunityAnimation;
  if(!engine?.playBlob)throw Error('Previa do BAS indisponivel.');
  rejectedController=engine.playBlob(canvas,blob,{
   onReady(){if(generation===rejectedGeneration&&status){status.textContent='';status.hidden=true;}},
   onError(error){if(generation===rejectedGeneration&&status){status.hidden=false;status.textContent='Previa indisponivel: '+String(error?.message||error);}}
  });
  await rejectedController.ready;
 }catch(error){
  if(generation===rejectedGeneration&&status){status.hidden=false;status.textContent='Previa indisponivel: '+String(error?.message||error);}
 }
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
    '<section class="bas-live-visibility"><h3>'+safe(st('profileVisibility'))+'</h3><p>'+safe(st('profileVisibilityHint'))+'</p>'+
   ['avatar','banner'].map(kind=>'<label class="bas-live-visibility-row"><span class="bas-live-visibility-copy"><strong>'+safe(st(kind==='avatar'?'publicAvatarConsent':'publicBannerConsent'))+'</strong></span>'+
    '<input type="checkbox" role="switch" name="'+kind+'_public"'+(draft[kind+'_public']?' checked':'')+'>'+
    '<span class="bas-live-switch" aria-hidden="true"></span></label>').join('')+'</section>'+
   '<div class="bas-live-actions"><button type="submit" class="bas-c-button bas-c-button--bright">'+safe(tr('save'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="go-profile">'+safe(tr('cancel'))+'</button></div>'+
  '</form>'+
  '<div class="bas-c-publish-draft bas-live-form"><h3>'+safe(tr('photoAvatar'))+' / '+safe(tr('photoBanner'))+'</h3>'+
   '<label class="bas-live-image-picker"><span class="bas-live-picker-icon" aria-hidden="true">✿</span><strong>'+safe(tr('photoAvatar'))+'</strong><span class="bas-live-picker-cta">'+safe(st('choosePhoto'))+' ✧</span><input class="bas-live-picker-input" type="file" id="bas-live-avatar-file" accept="image/png,image/jpeg,image/webp" aria-label="'+safe(st('choosePhoto'))+'"></label>'+
   '<label class="bas-live-image-picker"><span class="bas-live-picker-icon" aria-hidden="true">▧</span><strong>'+safe(tr('photoBanner'))+'</strong><span class="bas-live-picker-cta">'+safe(st('chooseBanner'))+' ✧</span><input class="bas-live-picker-input" type="file" id="bas-live-banner-file" accept="image/png,image/jpeg,image/webp" aria-label="'+safe(st('chooseBanner'))+'"></label>'+
   '<p class="bas-live-hint">'+safe(tr('imageHelp'))+'</p>'+
  '</div>'+statusHTML();
}
function moduleCanApply(){
 const bridge=window.BASApi;
 return Boolean(bridge?.hasFeature?.('direct_upload') &&
   bridge?.hasPermission?.('control') &&
   (typeof isConnectedMode==='undefined'||isConnectedMode===true));
}
function socialStat(value,label){return '<span class="bas-social-stat"><strong>'+safe(value??0)+'</strong> '+safe(label)+'</span>';}
function detailSocialComments(item){
 const data=state.social,comments=data?.comments||[];
 return '<section class="bas-social-comments" aria-label="'+safe(st('comment'))+'">'+
  '<div class="bas-social-section-title"><span class="bas-c-kicker">DISCUSSÃO</span><h2>'+safe(st('comment'))+
  ' <span>'+safe(data?.comments_count??'—')+'</span></h2></div>'+
  (logged()?'<form id="bas-social-comment-form" class="bas-social-compose">'+
   '<textarea id="bas-social-comment-text" maxlength="600" required placeholder="'+safe(st('commentPlaceholder'))+'">'+safe(state.commentText)+'</textarea>'+
   '<div class="bas-social-compose-foot"><small>'+safe(st('commentNote'))+'</small>'+
   '<button class="bas-c-button bas-c-button--bright" type="submit"'+(state.commentBusy?' disabled':'')+'>'+safe(state.commentBusy?st('commentBusy'):st('commentSend'))+'</button></div></form>':
   '<div class="bas-social-loginhint"><p>'+safe(st('commentLogin'))+'</p><button type="button" class="bas-c-button" data-c-action="guest-signin">'+safe(st('guestLoginNow'))+'</button></div>')+
  (data===null?'<p class="bas-live-hint">'+safe(st('loading'))+'</p>':
   comments.length?'<div class="bas-social-comment-list">'+comments.map(c=>
    '<article class="bas-social-comment" data-comment="'+safe(c.id)+'">'+
    (avatarSource(c)?'<img class="bas-social-comment-avatar bas-social-comment-photo" src="'+safe(avatarSource(c))+'" alt="" loading="lazy" referrerpolicy="no-referrer">':
      '<span class="bas-social-comment-avatar" aria-hidden="true">'+safe(c.display_name?.charAt(0)||'✧')+'</span>')+
    '<div class="bas-social-comment-content"><div class="bas-social-comment-meta"><strong>@'+safe(c.handle)+'</strong><time datetime="'+new Date(Number(c.created_at)*1000).toISOString()+'">'+
    safe(new Date(Number(c.created_at)*1000).toLocaleDateString(language()))+'</time></div>'+
    '<p>'+safe(c.content)+'</p><div class="bas-social-comment-actions">'+
    '<button type="button" class="bas-social-ghost" data-c-action="comment-like" data-id="'+safe(c.id)+'" aria-pressed="'+Boolean(c.liked)+'">'+(c.liked?'♥':'♡')+' '+safe(c.likes)+' '+safe(st('like'))+'</button>'+
    (logged()&&c.handle!==user()?.handle?'<button type="button" class="bas-social-ghost" data-c-action="comment-report" data-id="'+safe(c.id)+'">⚑ '+safe(st('reportComment'))+'</button>':'')+
    '</div></div></article>').join('')+'</div>':
   '<p class="bas-social-comment-empty">'+safe(st('commentEmpty'))+'</p>')+
  (data?.next_offset!==null&&data?.next_offset!==undefined?'<button type="button" class="bas-c-button bas-social-more" data-c-action="comments-more">'+safe(st('more'))+'</button>':'')+
  '</section>';
}
function detailsView(){
 const item=state.selected;
 if(!item)return galleryView();
 const mine=logged()?state.owned.find(owned=>owned.id===item.id):null;
 const self=logged()&&user()?.handle===item.handle;
 const stats=state.social||{};
 const canRemix=item.license!=='all-rights-reserved'&&stats.can_remix!==false;
 const creatorAvatarMarkup=creatorAvatar({handle:item.handle,display_name:item.display_name||item.handle,avatar_public:stats.creator_avatar_public});
 return '<article class="bas-social-publication">'+
  '<header class="bas-social-heading"><span class="bas-c-kicker">✦ BAS COMMUNITY</span>'+
   '<h1 id="bas-c-page-title">'+safe(item.title)+'</h1>'+
   '<p>'+safe(st('tagline'))+'</p></header>'+
  '<div class="bas-social-post-grid"><div class="bas-social-post-main">'+
   '<div class="bas-social-preview"><canvas class="bas-live-anim-canvas" data-bas-animation="'+safe(item.id)+'" aria-hidden="true"></canvas>'+
    '<span class="bas-live-preview-loading" aria-hidden="true">✧</span><div class="bas-social-preview-corner">'+safe(item.fps)+' FPS</div></div>'+
   '<div class="bas-social-metrics">'+socialStat(stats.likes??item.like_count,st('statsLikes'))+
    socialStat(stats.comments_count,st('statsComments'))+socialStat(item.download_count,st('statsDownloads'))+'</div>'+
   '<section class="bas-social-about"><span class="bas-c-kicker">'+safe(st('about'))+'</span>'+
    '<p>'+safe(item.summary||'—')+'</p>'+
    '<div class="bas-social-tags">'+(item.tags||[]).map(x=>'<span>#'+safe(x)+'</span>').join('')+'</div>'+
    (item.remix_of?'<p class="bas-social-provenance">↝ '+safe(st('remixOriginal'))+' <button type="button" data-c-action="detail" data-id="'+safe(item.remix_of.id)+'">'+safe(item.remix_of.title)+' · @'+safe(item.remix_of.handle)+'</button></p>':'')+
    '<div class="bas-social-specs"><span>'+safe(item.license)+'</span><span>'+safe(item.width)+' × '+safe(item.height)+'</span><span>'+safe(item.fps)+' fps</span></div>'+
   '</section>'+
  '<aside class="bas-social-sidebar"><section class="bas-social-creator-card"><span class="bas-c-kicker">'+safe(st('creator'))+'</span>'+
   '<div class="bas-social-authorline">'+creatorAvatarMarkup+
    '<div><strong>'+safe(item.display_name||item.handle)+'</strong><span>@'+safe(item.handle)+'</span></div></div>'+
   '<p>'+safe(stats.followers??'—')+' '+safe(st('follower'))+'</p>'+
   '<div class="bas-social-card-actions">'+
    (!self?'<button type="button" class="bas-c-button bas-c-button--bright" data-c-action="follow" data-handle="'+safe(item.handle)+'" aria-pressed="'+Boolean(stats.following)+'">'+safe(stats.following?st('following'):st('follow'))+'</button>':'')+
    '<button type="button" class="bas-c-button" data-c-action="creator-author" data-handle="'+safe(item.handle)+'">'+safe(st('showProfile'))+'</button></div></section>'+
   '<section class="bas-social-action-card"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="download" data-id="'+safe(item.id)+'">↓ '+safe(tr('download'))+'</button>'+
    (canRemix?'<button type="button" class="bas-c-button bas-social-remix" data-c-action="remix" data-id="'+safe(item.id)+'">✦ '+safe(st('remix'))+'</button>':
     '<p class="bas-live-hint">'+safe(st('remixDisabled'))+'</p>')+
    '<button type="button" class="bas-c-button" data-c-action="like-animation" data-id="'+safe(item.id)+'" aria-pressed="'+Boolean(stats.liked)+'">'+(stats.liked?'♥':'♡')+' '+safe(stats.liked?st('liked'):st('like'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="share-animation" data-id="'+safe(item.id)+'">↗ '+safe(st('share'))+'</button>'+
    (moduleCanApply()?'<button type="button" class="bas-c-button" data-c-action="apply-module" data-id="'+safe(item.id)+'">'+safe(tr('apply'))+'</button>':'')+
    (mine&&!mine.edit_id?'<button type="button" class="bas-c-button" data-c-action="edit-animation" data-id="'+safe(item.id)+'">✎ '+safe(st('editPost'))+'</button>':'')+
    (mine?'<button type="button" class="bas-c-button bas-live-danger" data-c-action="remove-animation" data-id="'+safe(item.id)+'">'+safe(tr('ownerRemove'))+'</button>':
     '<button type="button" class="bas-c-button" data-c-action="report" data-id="'+safe(item.id)+'">⚑ '+safe(tr('report'))+'</button>')+
    '</section></aside>'+detailSocialComments(item)+'</div></div></article>'+statusHTML();
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
  (state.remix?'<div class="bas-social-remix-disclosure">↝ '+safe(st('remixOriginal'))+' '+safe(state.remix.title)+' · @'+safe(state.remix.handle)+'<p>'+safe(st('remixRights'))+'</p></div>':'')+
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
function editAnimationView(){
 const e=state.editDraft;
 if(!e||!logged())return profileView();
 return '<section class="bas-c-plainhead"><span class="bas-c-kicker">✦ BAS COMMUNITY</span>'+
  '<h1 id="bas-c-page-title">'+safe(tr('ownerEditTitle'))+'</h1>'+
  '<p>'+safe(tr('ownerEditHelp'))+'</p></section>'+
  '<div class="bas-social-edit-header"><div class="bas-social-edit-preview"><canvas class="bas-live-anim-canvas" data-bas-animation="'+safe(e.id)+'" aria-hidden="true"></canvas>'+
  '<span class="bas-live-preview-loading" aria-hidden="true">✧</span></div>'+
  '<div><span class="bas-c-kicker">'+safe(st('editPost'))+'</span><h2>'+safe(e.title)+'</h2>'+
  '<p>'+safe(tr('ownerEditHelp'))+'</p><div class="bas-social-remix-disclosure">✧ '+safe(tr('ownerPendingEdit'))+'</div></div></div>'+
  '<form id="bas-owner-edit-form" class="bas-c-publish-draft bas-live-form bas-social-edit-form">'+
   '<label>'+safe(tr('title'))+'<input id="bas-owner-title" required minlength="3" maxlength="100" value="'+safe(e.title)+'"></label>'+
   '<label>'+safe(tr('desc'))+'<textarea id="bas-owner-summary" maxlength="1000" rows="4">'+safe(e.summary)+'</textarea></label>'+
   '<label>'+safe(tr('tags'))+'</label>'+
   '<div class="bas-live-tags">'+e.tags.map(tag=>'<button type="button" data-c-action="owner-tag-remove" data-tag="'+safe(tag)+'">#'+safe(tag)+' ×</button>').join('')+'</div>'+
   '<div class="bas-live-tag-row"><input id="bas-owner-tag-input" type="text" maxlength="400" value="'+safe(e.tagInput)+'">'+
    '<button class="bas-c-button" type="button" data-c-action="owner-tag-add">'+safe(tr('add'))+'</button></div>'+
   '<label>'+safe(tr('license'))+'<select id="bas-owner-license">'+
     [['CC-BY-4.0','CC BY 4.0'],['CC-BY-SA-4.0','CC BY-SA 4.0'],['CC0-1.0','CC0 1.0'],['all-rights-reserved','All rights reserved']].map(pair=>
       '<option value="'+safe(pair[0])+'"'+(e.license===pair[0]?' selected':'')+'>'+safe(pair[1])+'</option>').join('')+
   '</select></label>'+
   '<label>'+safe(tr('author'))+'<input id="bas-owner-credit" maxlength="120" value="'+safe(e.author_credit)+'"></label>'+
   '<label>'+safe(tr('ownerReplaceZip'))+'<input id="bas-owner-zip" type="file" accept=".zip,application/zip"></label>'+
   '<p class="bas-live-hint">'+safe(e.file?e.file.name:tr('ownerReplaceHint'))+'</p>'+
   '<label class="bas-c-publish-rights"><input id="bas-owner-rights" type="checkbox"'+(e.rights?' checked':'')+'> '+safe(tr('rights'))+'</label>'+
   '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" type="submit"'+(state.busy?' disabled':'')+'>'+safe(state.busy?tr('ownerBusy'):tr('ownerSave'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="go-profile">'+safe(tr('cancel'))+'</button></div>'+statusHTML()+'</form>';
}
function collectOwnerEdit(){
 const e=state.editDraft;if(!e)return;
 for(const [id,key] of [['bas-owner-title','title'],['bas-owner-summary','summary'],
  ['bas-owner-credit','author_credit'],['bas-owner-tag-input','tagInput'],['bas-owner-license','license']]){
  const node=$(id);if(node)e[key]=node.value;
 }
 if($('bas-owner-rights'))e.rights=$('bas-owner-rights').checked;
}
function openOwnerEdit(id){
 const item=state.owned.find(v=>v.id===id&&v.status==='published'&&!v.edit_id);
 if(!item)return false;
 state.editDraft={id,title:item.title,summary:item.summary||'',tags:[...(item.tags||[])],
  license:item.license||'CC-BY-4.0',author_credit:item.author_credit||user()?.display_name||'',
  tagInput:'',rights:false,file:null};
 state.status='';go('edit-animation');return true;
}
async function addOwnerTags(){
 const e=state.editDraft;if(!e)return;
 collectOwnerEdit();
 try{
  const tags=api().normalizeTags(e.tagInput),all=[...new Set([...e.tags,...tags])];
  if(all.length>12)throw Error('Limite de 12 tags.');
  e.tags=all;e.tagInput='';state.status='';
 }catch(error){state.status=String(error.message||error);}
 render();
}
async function sendOwnerEdit(){
 const e=state.editDraft;if(!e||state.busy)return;
 collectOwnerEdit();
 if(e.tagInput.trim()){state.status=tr('missingTags');render();return;}
 if(!e.rights){state.status=tr('missingRights');render();return;}
 if(e.title.trim().length<3||e.title.trim().length>100){state.status=tr('invalidTitle');render();return;}
 state.busy=true;state.status=tr('ownerBusy');render();
 try{
  const result=await api().proposeRevision(e.id,{title:e.title,summary:e.summary,tags:e.tags.join(','),
   license:e.license,author_credit:e.author_credit},e.file);
  if(result.status!=='pending_review')throw Error('revision_status_unconfirmed');
  state.editDraft=null;state.status=tr('ownerEditSent')+(result.moderation_preview==='unavailable'?' · GIF indisponível: revisão pelo painel privado.':'');go('profile');
 }catch(error){state.status=tr('ownerUnable')+': '+translateError(error.message);render();}
 finally{state.busy=false;render();}
}
async function cancelOwnerEdit(id){
 if(state.busy)return;
 state.busy=true;
 try{await api().cancelRevision(id);state.status=tr('ownerEditCancelled');await fetchOwned();}
 catch(error){state.status=tr('ownerUnable')+': '+String(error.message||error);}
 finally{state.busy=false;render();}
}
async function removeOwnerAnimation(id){
 if(state.busy)return;
 state.busy=true;
 try{await api().withdrawAnimation(id);state.selected=null;state.editDraft=null;
  state.status=tr('ownerRemoved');go('profile');}
 catch(error){state.status=tr('ownerUnable')+': '+String(error.message||error);render();}
 finally{state.busy=false;}
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
 const contents=modal.kind==='guest-signin'
  ?'<p>'+safe(st('guestActionHelp'))+'</p><div class="bas-live-actions">'+
    '<button type="button" class="bas-c-button bas-c-button--bright" data-c-action="modal-login">'+safe(st('guestLoginNow'))+'</button>'+
    '<button type="button" class="bas-c-button" data-c-action="modal-close">'+safe(st('guestNotNow'))+'</button></div>'
  :(modal.kind==='report'||modal.kind==='comment-report')
  ?'<form id="bas-live-report-form"><p>'+safe(modal.kind==='comment-report'?st('reportCommentHelp'):tr('reportHelp'))+'</p>'+
   '<label for="bas-live-report-reason">'+safe(tr('reason'))+'</label>'+
   '<textarea id="bas-live-report-reason" required minlength="5" maxlength="500" rows="5">'+safe(modal.reason||'')+'</textarea>'+
   '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" type="submit">'+safe(tr('send'))+'</button>'+
   '<button class="bas-c-button" type="button" data-c-action="modal-close">'+safe(tr('cancel'))+'</button></div></form>'
  :modal.kind==='remix'?'<p>'+safe(st('remixHelp'))+'</p>'+
   '<div class="bas-live-actions"><button type="button" class="bas-c-button bas-c-button--bright" data-c-action="modal-remix">'+safe(st('confirm'))+'</button>'+
   '<button type="button" class="bas-c-button" data-c-action="modal-close">'+safe(st('cancel'))+'</button></div>'
  :modal.kind==='remove'?'<p>'+safe(tr('ownerRemoveWarning'))+'</p>'+
   '<div class="bas-live-actions"><button type="button" class="bas-c-button bas-live-danger" data-c-action="modal-remove">'+safe(tr('ownerRemoveConfirm'))+'</button>'+
   '<button type="button" class="bas-c-button" data-c-action="modal-close">'+safe(tr('cancel'))+'</button></div>'
  :'<p>'+safe(tr('applyHelp'))+'</p>'+
   '<div class="bas-live-actions"><button class="bas-c-button bas-c-button--bright" type="button" data-c-action="modal-apply">'+safe(tr('confirmApply'))+'</button>'+
   '<button class="bas-c-button" type="button" data-c-action="modal-close">'+safe(tr('cancel'))+'</button></div>';
 host.innerHTML='<div class="bas-c-modal-backdrop bas-live-modal-backdrop" data-c-action="modal-close">'+
  '<section role="dialog" aria-modal="true" aria-labelledby="bas-live-dialog-title" class="bas-c-modal bas-live-modal">'+
  '<div class="bas-c-modal-top"><span class="bas-c-kicker">BAS COMMUNITY</span>'+
  '<button class="bas-c-roundclose" type="button" data-c-action="modal-close" aria-label="'+safe(tr('close'))+'">×</button></div>'+
  '<h2 id="bas-live-dialog-title">'+safe(modal.kind==='guest-signin'?st('guestActionTitle'):modal.kind==='comment-report'?st('reportCommentTitle'):modal.kind==='remix'?st('remixTitle'):tr(modal.kind==='report'?'reportTitle':modal.kind==='remove'?'ownerRemoveQuestion':'applyTitle'))+'</h2>'+
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
 rejectedGeneration++;
 rejectedController?.stop();rejectedController=null;
 let content='';
 if(state.route==='profile')content=profileView();
 else if(state.route==='profile-edit')content=editProfile();
 else if(state.route==='detail')content=detailsView();
 else if(state.route==='creators')content=creatorsView();
 else if(state.route==='creator')content=creatorView();
 else if(state.route==='upload')content=uploadView();
 else if(state.route==='edit-animation')content=editAnimationView();
 else if(state.route==='rejected')content=rejectedView();
 else if(state.route==='licenses')content=licensesView();
 else content=galleryView();
 target.innerHTML=(nestedRoutes.has(state.route)?
  '<div class="bas-live-viewclose"><button class="bas-c-roundclose" type="button" data-c-action="view-close" aria-label="'+safe(tr('close'))+'" title="'+safe(tr('close'))+'">&times;</button></div>':'')+content;
 window.BASCommunityAnimation?.mount(target);
 if(state.route==='rejected')void attachRejectedPreview(target,rejectedGeneration);
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
async function fetchSocial(){
 const current=state.selected?.id;
 if(!current||!/^[a-f0-9]{32}$/.test(current))return;
 try{
  const [social,detail]=await Promise.all([api().socialAnimation(current),api().animationDetail(current)]);
  if(state.route!=='detail'||state.selected?.id!==current)return;
  state.social=social;
  if(detail?.animation)state.selected={...state.selected,...detail.animation};
 }catch(error){if(state.route==='detail'&&state.selected?.id===current)state.status=st('sendError')+' '+String(error.message||error);}
 if(state.route==='detail'&&state.selected?.id===current)render();
}
async function fetchMoreComments(){
 const current=state.selected?.id,existing=state.social;
 if(!current||existing?.next_offset==null||state.socialBusy)return;
 state.socialBusy=true;
 try{
  const next=await api().socialAnimation(current,existing.next_offset);
  if(state.selected?.id===current&&state.route==='detail'){
   state.social={...next,comments:[...existing.comments,...next.comments]};render();
  }
 }catch(error){state.status=String(error.message||error);render();}
 finally{state.socialBusy=false;}
}
async function fetchCreatorSocial(){
 const handle=state.selectedCreator?.handle;
 if(!handle)return;
 try{
  const social=await api().socialCreator(handle);
  if(state.route==='creator'&&state.selectedCreator?.handle===handle){state.creatorSocial=social;render();}
 }catch(error){state.status=String(error.message||error);if(state.route==='creator')render();}
}
function requireSocialLogin(){
 if(logged())return true;
 openModal('guest-signin',state.selected?.id||'');return false;
}
async function toggleAnimationLike(id){
 if(!requireSocialLogin()||state.socialBusy)return;
 const was=Boolean(state.social?.liked);state.socialBusy=true;
 try{
  const result=await api().likeAnimation(id,!was);
  if(state.selected?.id===id){state.social={...state.social,liked:result.liked,likes:result.likes};render();}
 }catch(e){state.status=st('sendError')+' '+String(e.message||e);render();}
 finally{state.socialBusy=false;}
}
async function toggleFollow(handle){
 if(!requireSocialLogin()||state.socialBusy||handle===user()?.handle)return;
 const current=(state.route==='creator'&&state.selectedCreator?.handle===handle)?state.creatorSocial:state.social;
 const was=Boolean(current?.following);state.socialBusy=true;
 try{
  const result=await api().followCreator(handle,!was);
  if(state.selected?.handle===handle&&state.social)state.social={...state.social,following:result.following,followers:result.followers};
  if(state.selectedCreator?.handle===handle&&state.creatorSocial)state.creatorSocial={...state.creatorSocial,following:result.following,followers:result.followers};
  render();
 }catch(e){state.status=st('sendError')+' '+String(e.message||e);render();}
 finally{state.socialBusy=false;}
}
async function sendComment(){
 const id=state.selected?.id,text=state.commentText.trim();
 if(!id||!requireSocialLogin()||state.commentBusy)return;
 if(!text||[...text].length>600){state.status=st('commentNote');render();return;}
 state.commentBusy=true;
 try{
  await api().addComment(id,text);
  state.commentText='';state.status='';await fetchSocial();
 }catch(e){state.status=st('sendError')+' '+String(e.message||e);render();}
 finally{state.commentBusy=false;render();}
}
async function toggleCommentLike(id){
 if(!requireSocialLogin()||state.socialBusy)return;
 const comment=state.social?.comments.find(c=>c.id===id);if(!comment)return;
 state.socialBusy=true;
 try{
  const res=await api().likeComment(id,!comment.liked);
  comment.liked=res.liked;comment.likes=res.likes;render();
 }catch(e){state.status=st('sendError')+' '+String(e.message||e);render();}
 finally{state.socialBusy=false;}
}
async function shareAnimation(){
 const post=state.selected;if(!post)return;
 const publicSite=location.hostname==='lumii55.github.io';
 const url=location.origin+location.pathname+'?community_animation='+encodeURIComponent(post.id);
 const title=post.title+' · BAS Community';
 const content=title+' — @'+post.handle+'\n'+url;
 try{
  if(navigator.share)await navigator.share({title,text:content,url});
  else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(content);
  else throw Error('share_unavailable');
  state.status=st(publicSite?'shareReady':'shareBeta');
 }catch(error){if(error?.name!=='AbortError')state.status=st('shareBeta');}
 render();
}
async function importRemix(id){
 if(state.socialBusy)return;
 state.socialBusy=true;state.status=st('remixWorking');render();
 try{
  const info=await api().animationDetail(id),original=info?.animation;
  if(!original||original.license==='all-rights-reserved')throw Error(st('remixDenied'));
  const social=await api().socialAnimation(id);
  if(!social.can_remix)throw Error(st('remixDenied'));
  if(typeof abrirZipNoEditor!=='function'||typeof startManualMode!=='function')throw Error('Studio importer unavailable');
  const before=typeof currentProject==='undefined'?null:currentProject;
  const zip=await api().approvedZip(id);
  // Preserve the exact approved artifact; do not expand archives in this UI.
  window.BASCommunityPreview?.close();
  startManualMode();
  await abrirZipNoEditor(new File([zip],'remix-'+id+'.zip',{type:'application/zip'}));
  const project=typeof currentProject==='undefined'?null:currentProject;
  if(!project||project===before)throw Error('ZIP import not confirmed');
  window.BASCommunityRemixContext={project,id:original.id,title:original.title,
   handle:original.handle,license:original.license,sourceVersion:original.remix_of?.id||null};
  state.remix=window.BASCommunityRemixContext;
  state.status='';
 }catch(error){state.status=st('sendError')+' '+String(error.message||error);render();}
 finally{state.socialBusy=false;}
}
async function openById(id){
 if(!/^[a-f0-9]{32}$/.test(id))return false;
 try{
  const data=await api().animationDetail(id);
  if(!data?.animation)return false;
  state.selected=data.animation;state.social=null;state.commentText='';
  if(overlay()?.hidden)window.BASCommunityPreview?.open();
  go('detail');return true;
 }catch(_){return false;}
}
function viewCreator(handle){
 let creator=state.creators.find(x=>x.handle===handle);
 if(!creator&&handle){
  const known=[...state.items,...state.creatorItems,...(state.selected?[state.selected]:[])].find(x=>x.handle===handle);
  if(known)creator={handle,display_name:known.display_name||handle,animation_count:0};
 }
 if(!creator)return;
 state.selectedCreator=creator;state.creatorItems=[];state.creatorSocial=null;
 go('creator');
}
async function fetchOwned(){
 if(!logged()||!api().ownedAnimations)return;
 try{
  const response=await api().ownedAnimations();
  state.owned=Array.isArray(response.animations)?response.animations:[];
 }catch(error){state.owned=[];state.status=tr('ownerUnable')+': '+String(error.message||error);}
 if(state.route==='profile')render();
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
 if(['profile','creators','creator'].includes(state.route))render();
}
function openUpload(file=null,source='zip'){
 if(!active())return false;
 if(!logged()){state.status=tr('signinRequired');void api().login();return false;}
 if(file){
  const blob=file.blob||file;
  const filename=file.filename||file.name||'bootanimation.zip';
  if(!(blob instanceof Blob)||blob.size>40*1024*1024||blob.size<1)return false;
  state.file={blob,filename};
  state.title=state.title||filename.replace(/\.zip$/i,'');
  state.source=source;
 }else{state.file=null;state.source='zip';}
 const context=window.BASCommunityRemixContext;
 const linked=source==='editor'&&context?.project&&(typeof currentProject!=='undefined')&&currentProject===context.project;
 state.remix=linked?context:null;
 if(linked){state.title=st('remixOriginal')+' '+context.title;state.summary=st('remixAttribution')+' '+context.title+' · @'+context.handle;
  state.license=context.license==='CC-BY-SA-4.0'?'CC-BY-SA-4.0':'CC-BY-4.0';
  state.author=(user()?.display_name||'')+' · @'+context.handle;}
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
  if(Number(res.headers.get('Content-Length')||0)>40*1024*1024)throw Error('Arquivo grande demais.');
  const blob=await res.blob();
  if(blob.size<1||blob.size>40*1024*1024)throw Error('ZIP inválido.');
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
   ...(state.remix?.id?{remix_of:state.remix.id}:{}),
   author_credit:state.author||user().display_name
  });
  if(result.status!=='pending_review')throw Error('upload_status_unconfirmed');
  state.file=null;state.title='';state.summary='';state.tags=[];state.tagInput='';
  state.rights=false;state.author='';state.status=tr('sent')+(result.moderation_preview==='unavailable'?' · GIF indisponível: revisão pelo painel privado.':'');
  go('explore',{reset:true});
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
  await api().setAvatarVisibility(fields.get('avatar_public')==='on');
  await api().setBannerVisibility(fields.get('banner_public')==='on');
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
 if(!logged()){openModal('guest-signin',id);return;}
 openModal('report',id);
}
async function sendReport(form){
 const modal=state.modal;
 if(!modal||!['report','comment-report'].includes(modal.kind)||!form)return;
 const text=form.querySelector('#bas-live-report-reason')?.value?.trim()||'';
 if(text.length<5||text.length>500){
  modal.reason=text;modal.error=tr('minReason');renderModal();return;
 }
 try{
  if(modal.kind==='comment-report')await api().reportComment(modal.id,text);
  else await api().report(modal.id,text);
  closeModal();
  state.status=tr('reportSent');render();
 }catch(e){modal.reason=text;modal.error=tr('reportError')+': '+String(e.message||e);renderModal();}
}
function handle(event){
 if(!active()||!overlay()?.contains(event.target))return false;
 const hit=event.target.closest?.('[data-c-action]');
 if(!hit)return false;
 const action=hit.dataset.cAction,id=hit.dataset.id||'';
 if(action==='modal-login'){
  const intent=state.route==='detail'&&state.selected?.id?'detail:'+state.selected.id:
   state.route==='creator'&&state.selectedCreator?.handle?'creator:'+state.selectedCreator.handle:'explore';
  closeModal();void api().login(intent);return true;
 }
 if(action==='guest-signin'){openModal('guest-signin',id);return true;}
 if(action==='modal-close'){
  if(hit.classList?.contains?.('bas-live-modal-backdrop')&&event.target!==hit)
   return true; // clicks inside dialog must NOT dismiss the dialog
  closeModal();return true;
 }
 if(action==='modal-remove'){const target=state.modal?.kind==='remove'?state.modal.id:null;
  closeModal();if(target)void removeOwnerAnimation(target);return true;}
 if(action==='modal-remix'){const id=state.modal?.kind==='remix'?state.modal.id:null;closeModal();if(id)void importRemix(id);return true;}
 if(action==='modal-apply'){
  const selected=state.modal?.kind==='apply'?state.modal.id:null;
  closeModal();
  if(selected)void applyModule(selected);
  return true;
 }
 if(action==='view-close'){leaveView();return true;}
 if(action==='close'){window.BASCommunityPreview?.close();return true;}
 if(action==='real-account'||action==='signin'||action==='login'){
  if(logged())go('profile',{reset:true});else void api().login();return true;
 }
 if(action==='logout'){
  void api().logout().then(()=>{state.items=[];state.status='';go('explore');});return true;
 }
 if(action==='navigate'){
  const target=hit.dataset.route;
  if(target==='saved'||target==='profile'){go('profile',{reset:true});return true;}
  if(target==='creators'){go('creators',{reset:true});return true;}
  if(target==='moderation')return true;
  go('explore',{reset:true});return true;
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
 if(action==='back-publish'){leaveView();return true;}
 if(action==='back-gallery'||action==='reset'){leaveView();return true;}
 if(action==='back-creators'){go('creators',{reset:true});return true;}
 if(action==='creator'||action==='creator-author'){viewCreator(hit.dataset.handle);return true;}
 if(action==='detail'){
  const entry=[...state.items,...state.creatorItems].find(x=>x.id===id);
  if(entry){state.selected=entry;state.social=null;state.commentText='';go('detail');}
  else void openById(id);
  return true;
 }
 if(action==='like-animation'){void toggleAnimationLike(id);return true;}
 if(action==='follow'){void toggleFollow(hit.dataset.handle);return true;}
 if(action==='comment-like'){void toggleCommentLike(id);return true;}
 if(action==='comment-report'){
  if(requireSocialLogin())openModal('comment-report',id);
  return true;
 }
 if(action==='comments-more'){void fetchMoreComments();return true;}
 if(action==='share-animation'){void shareAnimation();return true;}
 if(action==='remix'){
  if(state.selected?.id===id&&state.selected.license!=='all-rights-reserved')openModal('remix',id);
  return true;
 }
 if(action==='download'){void download(id);return true;}
 if(action==='apply-module'){if(moduleCanApply())openModal('apply',id);return true;}
 if(action==='report'){void report(id);return true;}
 if(action==='open-rejected'){const item=state.owned.find(v=>v.id===id&&v.status==='rejected');
  if(item){state.rejectedId=id;go('rejected');}return true;}
 if(action==='open-owned'){const entry=state.owned.find(v=>v.id===id);
  if(entry?.status==='published'){state.selected={...entry,handle:user().handle};state.social=null;state.commentText='';go('detail');}return true;}
 if(action==='edit-animation'){openOwnerEdit(id);return true;}
 if(action==='remove-animation'){if(state.owned.some(v=>v.id===id))openModal('remove',id);return true;}
 if(action==='cancel-owner-edit'){void cancelOwnerEdit(id);return true;}
 if(action==='owner-tag-add'){void addOwnerTags();return true;}
 if(action==='owner-tag-remove'){collectOwnerEdit();state.editDraft.tags=state.editDraft.tags.filter(v=>v!==hit.dataset.tag);render();return true;}
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
 if(id==='bas-social-comment-text'){state.commentText=String(event.target.value||'');return true;}
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
 if(id?.startsWith('bas-owner-')&&state.editDraft){
   const mapped={'bas-owner-title':'title','bas-owner-summary':'summary','bas-owner-credit':'author_credit','bas-owner-tag-input':'tagInput'};
   if(mapped[id]){state.editDraft[mapped[id]]=event.target.value;return true;}
 }
 if(mapping[id]){state[mapping[id]]=event.target.value;return true;}
 return false;
}
function onChange(event){
 if(!active())return false;
 const id=event.target?.id;
 if(id==='bas-owner-zip'&&state.editDraft){
  const f=event.target.files?.[0];
  if(f&&(!f.name.toLowerCase().endsWith('.zip')||f.size<1||f.size>40*1024*1024)){
   state.status=tr('invalidZip');state.editDraft.file=null;
  }else{state.editDraft.file=f||null;state.status='';}
  render();return true;
 }
 if(id==='bas-owner-license'&&state.editDraft){state.editDraft.license=event.target.value;return true;}
 if(id==='bas-owner-rights'&&state.editDraft){state.editDraft.rights=Boolean(event.target.checked);return true;}
 if(id==='bas-live-sort'){
  state.sort=event.target.value;void fetchGallery();return true;
 }
 if(id==='bas-live-zip'){
  const file=event.target.files?.[0];
  if(file){
   if(!file.name.toLowerCase().endsWith('.zip')||file.size<1||file.size>40*1024*1024){
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
 if(id==='bas-owner-edit-form'){event.preventDefault();void sendOwnerEdit();return true;}
 if(id==='bas-live-publish-form'){event.preventDefault();void sendPublish();return true;}
 if(id==='bas-live-profile-form'){event.preventDefault();void saveProfile(event.target);return true;}
 if(id==='bas-social-comment-form'){event.preventDefault();void sendComment();return true;}
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
 if(logged()){void fetchPictures();void fetchDrafts();void fetchOwned();}
 return true;
}
window.BASCommunityLive=Object.freeze({
 active,mount,render,handle,onInput,onChange,onSubmit,openUpload,pullFromDevice,
 openById,openCreator(handle){if(active())void viewCreator(handle);},showProfile(){if(!active()||!logged())return false;go('profile');return true;}
});
document.getElementById('select-idioma')?.addEventListener?.('change',()=>{
 Promise.resolve().then(()=>{if(active()&&overlay()&&!overlay().hidden)render();});
});
// Signed-out users can open a shared approved post. The beta local link only
// works on its own device; a public URL will work after the main-site launch.
window.addEventListener('load',()=>{
 try{
  const id=new URLSearchParams(location.search).get('community_animation');
  if(/^[a-f0-9]{32}$/.test(id||'')&&active())void openById(id);
 }catch(_){}
});
window.addEventListener('bas:community-auth',()=>{
 if(!active())return;
 chrome();
 if(logged()){
  state.status='';
  if(state.route==='profile'||state.route==='profile-edit')go('profile');
  else go('explore');
  void fetchPictures();
 }else{state.remotePictures={avatar:null,banner:null};state.owned=[];state.editDraft=null;go('explore');}
});
})();
