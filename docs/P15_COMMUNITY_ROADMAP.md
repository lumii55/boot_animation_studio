# BAS Community — P15

> Roadmap consolidado em 2026-11-04: **9 etapas no total**, P15.1–P15.9, substituindo o plano antigo de 14 etapas. Fonte única de verdade para o trabalho futuro. Os marcos históricos P15.1–P15.5 não serão renumerados.

## Estado atual

> Os marcos iniciais abaixo registram o estado historico, nao a configuracao atual. Veja o checkpoint consolidado da P15.6 ao final.

- **P15.1–P15.2 — protótipos de interface prontos:** Developer Lab oculto, galeria de demonstração, busca, filtros, detalhes, perfis ilustrados e opções de publicação simuladas.
- **P15.3 — fundação de API e banco pronta para staging:** Cloudflare D1 `bas-community-staging` criado de verdade, com migrações 0001–0003 aplicadas via API. Worker ainda não publicado; catálogo desligado.
- **P15.4 — autenticação preparada, não ativada:** GitHub OAuth com PKCE, sessões e proteção CSRF testados localmente; ainda faltam aplicativo OAuth real, credenciais, topologia HTTPS compatível e autorização para abrir contas.
- **P15.5 — preparação parcial:** validação de ZIP e cotas implementadas/testadas localmente; seletor e recorte de fotos/banners no navegador. **R2 já foi ativado pela proprietária** e o bucket privado `bas-community-staging` (classe Standard) foi criado. O binding `PRIVATE_UPLOADS` está no `wrangler.jsonc` privado do Termux, não no repositório. **Não há uploads reais, Worker público nem imagens persistidas.**
- **P15.6 — BETA PRIVADO IMPLANTADO, ACEITE REAL PENDENTE:** codigo de contas/perfis, fontes editor/ZIP/Companion e motor de quarentena integrados. Falta validar envio real dos tres caminhos para concluir a etapa.

## Novo roadmap — apenas 4 etapas restantes

### P15.6 — Contas reais + publicação integral (privado)

**Um fluxo completo, não login e upload separados.**
- Finalizar autenticação real, perfis persistentes e personalização de avatar/banner com processamento seguro de imagens no servidor; credenciais e configuração HTTPS somente após autorização.
- Integrar D1 + R2 privado com quotas rígidas por usuário e globais, reservas atômicas, verificação do consumo real e mecanismos para suspender uploads antes de excedentes; não depender de alertas de faturamento.
- Publicar por três caminhos equivalentes: (1) diretamente após edição/exportação no BAS, (2) `bootanimation.zip` existente, (3) Companion conectado, com autorização explícita do dispositivo e compatibilidade preservada.
- Validar conteúdo do ZIP, limites de expansão, estrutura, formatos e prévias; colocar arquivos em **quarentena privada**, com versionamento e atribuição/licença do autor. Suportar projeto editável quando o autor autorizar.
- Entrega aceita somente com contas e arquivos de teste em staging; **nenhum upload ou objeto fica público**.

### P15.7 — Moderação integrada + catálogo real (privado até aprovação)

**A publicação só aparece após revisão.**
- Painel administrativo para fila, aprovação, rejeição, ocultação, denúncias, recursos, registros e auditoria de decisões; autenticação robusta e verificação de permissões no servidor.
- Bot Discord para avisos por DM e ações de moderação, validação da assinatura das interações, IDs de moderadores autorizados, ações idempotentes e acesso privado temporário a ZIPs; painel serve de alternativa se o bot falhar.
- Galeria conectada a registros reais **aprovados**, com busca, filtros, perfis dos criadores, downloads gratuitos, revisões e integração com o editor e Companion.
- Alterações de uma animação aprovada voltam à moderação sem substituir silenciosamente a versão pública anterior.
- Continuação do beta sem abrir a comunidade indiscriminadamente; o acesso público ainda depende da P15.9.

### P15.8 — Recursos sociais completos + proteção antiabuso

**Tudo integrado na mesma etapa.**
- Comentários de texto puro (sem HTML, mídia e anexos), denúncias e revisão de conteúdo.
- Curtidas, favoritos sincronizados, avaliação 1–5 estrelas, seguidores, notificações e classificação/rankings/descoberta.
- Controles de spam e abuso, limites de postagem, opções de privacidade e recursos de moderação também para comentários e perfis.
- Navegação e downloads permanecem gratuitos e sem login; contas exigidas apenas para publicar e participar das ações sociais.

### P15.9 — Auditoria integral + lançamento

- Revisões de segurança e de permissões, testes reais no Android e navegadores/PWA, compatibilidade com o BAS público e Companion, restauração/backup/rollback, acessibilidade e desempenho.
- Auditoria D1/R2, reconciliação das migrações aplicadas por REST com o controle do Wrangler, privacidade, direitos autorais e custos.
- Conferir limite de consumo de storage **e de operações R2**: franquia gratuita não é uma garantia de cobrança zero. Se não houver segurança de custos, manter funcionalidades limitadas ou desabilitadas.
- Somente após todos os testes e **aprovação explícita da proprietária** liberar a BAS Community ao público.

## Regras permanentes

- Tudo que for compartilhado passa por moderação antes de aparecer publicamente.
- Nenhum arquivo ZIP, dado de perfil ou conteúdo não aprovado deve ter URL pública direta. O bucket R2 continua privado, sem `r2.dev` nem domínio público.
- Login não é obrigatório para explorar, baixar ou aplicar. Recursos sociais sincronizados e publicação usam conta.
- Não colocar credenciais, IDs internos sensíveis, tokens ou dados pessoais no repositório público. Manter staging e produção isolados.
- O editor BAS e o Companion existentes devem continuar compatíveis; não alterar o módulo sem necessidade técnica validada e autorização apropriada.
- R2 Standard inclui franquia gratuita, mas a conta pode ser cobrada por uso excedente. **Não abrir consumo de terceiros nem remover limites sem consentimento**, e não prometer bloqueio financeiro absoluto sem mecanismo verificado.
- Manter o Developer Lab como porta de entrada da prévia. Ele é controle visual, nunca autorização de servidor.
- Preferir **uma entrega/commit por etapa grande**, com implementação e testes completos; correções adicionais somente quando justificadas.

## Testes e prévia

No Termux, a cópia experimental é `~/bas-p15-preview`, branch `dev/p15-community-foundation`:
- Galeria: `http://127.0.0.1:8088/` (Developer Lab: 7 toques no título BAS → Tools & Logs → ativar Community).
- API local: `http://127.0.0.1:8788/v1/health`, somente leitura, uploads e autenticação desativados.
- Testes: `node --test tests/community-preview.test.cjs`; em `community-api`, `node --test tests/*.test.mjs` e `PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p 'test_*.py'`.

**Importante:** P15.1–P15.5 são histórico de progresso, não declarações de prontidão para lançamento. O R2 foi configurado, mas nenhum fluxo real de publicação foi liberado.

## P15.6 — Motor integrado de publicações (2026-11-04)

- Criada API de rascunhos autenticados, idempotência, autorização, CSRF, checagem de direitos, controle de cotas, verificação estrita do ZIP, escrita somente em quarentena R2 e evento na fila de aprovação.
- Publicação via editor e arquivo ZIP compartilham o mesmo motor. Companion aparece como caminho na prévia, mas o servidor bloqueia até implementar pareamento real e autorização explícita do dispositivo.
- Migração D1 0004 aplicada no staging real via REST. Banco verificado com 14 tabelas, 13 triggers, 36 índices e zero contas/publicações/bytes.
- Interface da galeria permite escolher as três origens e preparar rascunho demonstrativo com título/licença/direitos sem qualquer chamada de rede.
- Na nova versão, login poderá usar uma única origem HTTPS site+API, inclusive um hostname Worker, reduzindo a necessidade de domínio próprio. Não foi publicado e OAuth ainda não está ativado.
- A P15.6 continua EM DESENVOLVIMENTO: faltam autenticação real (GitHub OAuth App e credenciais), uploads privados autorizados, armazenamento permanente de foto/banner com processamento seguro, pareamento Companion, recuperação/custo R2 e testes de lançamento.
- Controles PUBLISH_ENABLED, PUBLISH_STAGING_APPROVED, STORAGE_ENABLED, UPLOAD_ENABLED seguem desativados. Nenhum Worker ou ZIP foi publicado e o bucket R2 real não recebeu objetos.

## Continuação P15.6 — mídia persistente de perfis preparada (2026-11-04)

- Criadas rotas autenticadas privadas para trocar e ler avatar/banner de uma conta, com `Origin` e CSRF, validação no servidor, recodificação segura via binding Cloudflare Images Free, e armazenamento privado no R2.
- Cotas diárias, mensais e globais; trocas com ledger de espaço persistente. Uma rotina de recuperação não acessível via HTTP tenta apagar arquivos órfãos e libera a reserva apenas após confirmação de exclusão no R2.
- Migração 0005 aplicada no D1 real: 17 tabelas, 20 triggers, 43 índices, nenhuma conta, nenhuma mídia e 0 bytes utilizados ou reservados.
- Testes cumulativos da P15 no Termux: 61 JS backend + 33 SQLite + 17 frontend = **111/111**. Apenas R2 e Cloudflare Images fictícios nos testes; nenhum arquivo de usuário enviado ao R2 verdadeiro.
- Backend de mídia continua **desativado por padrão**. P15.6 só será concluída com OAuth real/contas reais, frontend conectado às rotas de imagem/publicação, pareamento Companion autenticado, manutenção/recuperação operacional e testes privados na Cloudflare. Ainda não iniciar P15.7.


## P15.6A — checkpoint OAuth beta privado (2026-11-04)

- Implementada pagina de staging na mesma origem HTTPS do Worker para entrar via GitHub, consultar sessao, editar nome/identificador/bio e sair. Nao substitui galeria publica.
- Arquivos de implementacao: community-api/src/beta-portal.mjs, community-api/tests/beta-portal.test.mjs, integracao em src/index.mjs.
- Requer BETA_PORTAL_ENABLED=true mais autenticacao real, allowlist beta numerica nao vazia, dominio exato e cadastro publico desabilitado. No exemplo, padrao desabilitado.
- Inspecao Cloudflare: Worker bas-community-staging implantado, GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET presentes, OAuth do backend habilitado, allowlist beta de 1 conta, D1/R2/Images com bindings. Uploads, publicacoes, catalogo, midias e cadastro publico permanecem OFF. Subdominio workers.dev ainda desabilitado.
- Testes locais: 17 frontend + 64 backend + 33 SQLite = 114/114, sem testes externos OAuth verdadeiros.
- Proximo: revisar callback OAuth App; implantar bundle de staging sem sobrescrever vars e secrets existentes; habilitar URL apenas para beta restrito; testar login/logout, sessao e perfil com conta autorizada.
- CUIDADO: nao rodar deploy com community-api/wrangler.jsonc antigo: contem flags AUTH false, divergentes do staging remoto. Use --keep-vars com config temporaria sem overrides conflitantes.
- Site main e modulo publico permanecem intocados.


## P15.6A — deployment confirmado em staging (2026-11-04)

- Foi enviada via API Cloudflare uma nova versao MODULAR do Worker, mantendo por keep_bindings os tipos de bindings plain_text, secret_text, d1, r2_bucket e images. O endpoint de upload de versao nao ativou publicamente a comunidade.
- Nova versao implantada no Worker de staging a 100%: d16c9c34-fe74-413b-b4f0-a62fc4a89a8a.
- Versao anterior para rollback: 634c6460-f357-4aec-b392-7fcf752aa5a0.
- Subdominio workers.dev de staging ativado; URLs de preview de versoes continuam desativadas. Isso disponibiliza a pagina de TESTE mas NAO habilita cadastro publico.
- Auditoria confirmou 23 bindings na nova versao, incluindo os quatro secrets, e todas as flags de cadastro publico/upload/storage/publishing/media/catalog OFF. Auth e beta portal ON apenas na instancia de staging.
- Smoke tests reais da origem HTTPS: / HTTP 200 com link de login; /beta/app.js HTTP 200; /v1/health HTTP 200 no modo accounts_enabled; /v1/auth/me HTTP 401 sem sessao; /v1/catalog HTTP 503 (bloqueado).
- /v1/auth/github/start HTTP 302 redirecionando ao GitHub com callback da origem correta, PKCE S256, state e cookie HttpOnly Secure SameSite=Lax verificados.
- PENDENTE: proprietaria entrar com GitHub real na beta; verificar configuracao do callback na OAuth App, sessao, edicao e logout reais. Nao marcar como autenticacao validada fim-a-fim ainda.
- URL de beta: https://bas-community-staging.caiolive1000.workers.dev/
- Callback GitHub: https://bas-community-staging.caiolive1000.workers.dev/v1/auth/github/callback
- Cloudflare Worker nao recebe upload/media/publicacao ate testes posteriores aprovados. Nao liberar publicamente a Community na P15.6.


## P15.6A — correcao diagnostica OAuth (2026-11-04)

- Teste real do GitHub retornou erro generico oauth_provider_unavailable; fluxo nao criou conta nem sessao no D1. Ainda nao sabemos se foi falha de rede, token ou identidade.
- GitHub suporta PKCE S256; esta protecao NAO foi removida.
- Backend agora classifica apenas CODIGOS FIXOS seguros: credenciais do cliente incorretas, callback divergente, codigo expirado, e-mail nao verificado, token rejeitado, JSON invalido, rede inacessivel, identidade negada ou rate limited. Nenhum token, segredo, URL de autorizacao ou resposta arbitraria do GitHub aparece no erro.
- Testes com provedores simulados exercitam varios erros; nenhum segredo real foi usado.
- PENDENTE: novo login REAL pela conta allowlisted para identificar a causa. Nao declarar OAuth finalizado ate confirmar perfil salvo e logout em staging.


## P15.6A — correcao CONFIRMADA: redirect:'error' nao e suportado nos Workers (2026-11-04)

- Root cause identificado a partir do erro real oauth_github_token_network_error. A documentacao oficial Cloudflare Workers Request (atualizada em 2026-11-02) diz que o modo redirect:'error' lanca TypeError na construcao da Request ANTES de fazer a requisicao, sendo aceitos somente 'follow' ou 'manual'.
- O codigo anterior usava redirect:'error' no POST /login/oauth/access_token e GET /user do GitHub; logo, esse fluxo falhava antes de chamar os endpoints reais.
- Corrigido para redirect:'manual' nas duas requisicoes; o codigo agora bloqueia explicitamente status HTTP 300-399 e resposta opaqueredirect, sem seguir endereco Location e sem exibir tokens, headers ou erros crus.
- Novos testes cobrem o modo suportado e recusam redirects maliciosos em ambos endpoints. Login verdadeiro precisa ser repetido apos deploy (codigo OAuth anterior expirou).
- Fonte: https://developers.cloudflare.com/workers/runtime-apis/request/ (Request.redirect).


## P15.6B — perfil BAS real e personalizacao privada (2026-11-04)

- O beta recebeu um PERFIL BAS de verdade como tela principal apos o login: banner, avatar, nome, @identificador, bio, data de ingresso e area de criações (placeholder ate P15.6C). O botao Editar perfil abre o formulario separado; SALVAR persiste nome, handle e bio no D1 e volta automaticamente ao perfil com dados novos. Cancelar volta ao perfil sem escrever.
- Estrutura de staging: beta-profile-page.mjs (HTML), beta-profile-styles.mjs (visual), beta-profile-client.mjs (sessao, navegacao e recorte) e beta-portal.mjs (rotas CSP). Os assets da UI ainda so sao servidos quando BETA_PORTAL_ENABLED e login beta configurado.
- Personalizacao: trocar avatar e banner abre seletor JPEG/PNG/WebP, recorte arrastavel e zoom, exporta WebP via canvas sem EXIF, envia por PUT autenticado ao backend ja criado na P15.6; o backend valida/recodifica com Images e armazena exclusivamente no R2 privado. Fotos sao carregadas por GET apenas para o dono com cookie de sessao (GET same-origin do navegador nao envia Origin). Alteracoes exigem Origin+CSRF e sessoes validas.
- CSP permite somente img-src self e blob; nenhum script inline, iframe, URL publica de R2 ou HTML gerado por usuarios.
- Cotas ativas no esquema 0005: 8 atualizacoes de imagem por conta/24h, 200 transformacoes por mes, 512 KiB por imagem transformada, reserva/budget R2 e limite global. Free Images 5000 transformacoes gratuitas; free excessos causam erro, nao cobranca, conforme documentacao 2026. R2 pode ter custos fora de franquia, por isso manter gate beta allowlist e limites.
- SEGURANCA: habilitar somente MEDIA_ENABLED, MEDIA_STAGING_APPROVED e STORAGE_ENABLED no Worker bas-community-staging, apos validar todos os bindings. Manter PUBLISH_ENABLED, UPLOAD_ENABLED, PUBLIC_CATALOG_ENABLED, AUTH_PUBLIC_SIGNUP_APPROVED e MEDIA_MAINTENANCE_APPROVED desativados.
- A experiencia visual/navegacao foi testada com conta simulada; fotos reais em Cloudflare ainda exigem teste manual pela usuaria antes de declarar P15.6B completa. P15.6C continua pendente.


## P15.6B — staging privado implantado e verificacao de acesso (2026-11-04)

- Nova versao implantada no Worker bas-community-staging: 5827baa2-885f-4500-ae74-3150c7d65d6b.
- Versao anterior para rollback: 096ce9fe-b21f-4a89-8acf-8990354ba017.
- URL unica de teste: https://bas-community-staging.caiolive1000.workers.dev/
- 23 bindings preservados, incluindo quatro secrets. Somente MEDIA_ENABLED, MEDIA_STAGING_APPROVED e STORAGE_ENABLED habilitados a mais para fotos no STAGING. Cadastro publico, catalogo, publicacao, uploads de animacoes e manutencao de orfaos permanecem OFF.
- Smoke tests reais: pagina do perfil, JS e CSS HTTP 200; API health 200 com uploads/catalgo OFF; /v1/auth/me sem cookie HTTP 401; avatar/banner privados sem cookie HTTP 403; catalogo 503 e endpoint geral de uploads 403.
- Testes cumulativos locais: 17 frontend + 70 backend JS + 33 SQLite = 120/120 aprovados. Teste com navegador simulado confirmou salvar e voltar automaticamente ao perfil. GET privado de imagem exige sessao valida, mas nao Origin/CSRF porque browsers podem nao enviar Origin em GET; PUT continua protegido com Origin e CSRF.
- Ainda precisa de validacao REAL pela proprietaria: recarregar sessao, alterar e salvar nome/bio, selecionar imagem e banner, recortar, enviar e recarregar para confirmar persistencia no R2. Nao declarar P15.6B completamente finalizada ate esses testes passarem.
- Esta e uma interface de perfis beta no Worker, NAO a liberacao publica da galeria; a integracao futura com o app BAS e publicacoes segue P15.6C-E.


## P15.6 — checkpoint consolidado do beta privado (2026-11-04)

Status: todos os componentes de codigo e staging foram implantados; a conclusao depende de teste REAL dos tres caminhos. Nenhum ZIP fica publico.

- Perfil OAuth/PKCE real e personalizacao persistente D1/R2; a titular relatou que o perfil persiste apos sair, entrar e recarregar.
- BAS local http://127.0.0.1:8088/ preservado no Developer Lab. Botao Conta BAS e Enviar para beta conectam a galeria demonstrativa ao staging HTTPS, mantendo os cookies seguros separados do localhost e a main intacta.
- ZIP existente, arquivo exportado pelo editor (transferencia explicita em memoria por postMessage de origens verificadas) e copia do Companion local pareado (permissao view, confirmacao antes de ler) usam o mesmo backend. O worker jamais acessa o aparelho; a flag do Companion identifica procedencia declarada e nao constitui prova criptografica do hardware. O envio requer NOVA confirmacao no site HTTPS.
- Arquivos com validacao estrita de ZIP, CRC, expansao, formato e limites sao armazenados apenas na quarentena R2 com estado pending_review no D1; direitos e licencas do autor obrigatorios.
- Cap do staging reduzido para 64 MiB no ledger D1. Cotas por usuario e dia, limite de operacoes R2 e reconciliador manual de rascunhos expirados/orfaos, sem endpoint HTTP.
- Cloudflare Worker ativo bas-community-staging version 2dcf8a1f-d38b-493d-8144-fd0dee1c7ca9. Rollback 5827baa2-885f-4500-ae74-3150c7d65d6b. Auth beta allowlist 1. Cadastro publico, galeria real, moderacao e manutencao publica OFF.
- Testes 126/126 locais (17 frontend, 76 JS API e 33 SQLite). Staging HTTPS: pagina e scripts HTTP 200; /v1/publishing/drafts e envio anonimo HTTP 403; catalogo HTTP 503. Nao afirmar ZIP real enviado nem Companion fisico testado ate a titular confirmar.
- P15.7, P15.8 e P15.9 devem ser entregues cada uma como um unico marco grande; subdividir apenas diante de bloqueios reais de seguranca, compatibilidade ou infraestrutura. Nao mover para main antes da aprovacao final.


## P15.7 — requisitos de UX, tags e busca aprovados pela proprietaria (2026-11-04)

Estas mudancas sao parte da entrega UNICA da P15.7 (moderacao + galeria real + Discord), nao subetapas novas. Nao alterar a P15.6 somente para estas preferencias. Nao fazer commit isolado desta nota; consolidar na entrega da P15.7.

1. **Origens de publicacao:** eliminar a escolha redundante "editor" no formulario comum. O formulario normal oferece ZIP existente; so mostra opcao Companion se realmente conectado e autorizado (quando nao ha Companion, abrir direto seletor de ZIP). O backend pode manter source='editor' para distinguir origem de forma interna. Nao confiar em indicador meramente visual como autorizacao.
2. **Editor:** ao terminar a geracao, oferecer os botoes lado a lado "Baixar ZIP" e "Publicar na Community". Publicacao usa em memoria o ZIP recem-gerado (sem exigir download), abre/reusa o formulario real com metadados e confirmacao explicita, nao envia automaticamente.
3. **Companion:** no painel principal do modulo acrescentar botao "Publicar animacao". Reusar a experiencia de puxar do dispositivo para selecionar a animacao original/stock ou a aplicada pelo modulo, quando existirem. Em vez de abrir o editor, encaminhar a COPIA escolhida ao formulario de publicacao para confirmacao. A opcao Companion permanece tambem na tela comum, mas so quando houver pareamento e permissao apropriados; nunca acessar o Android sem consentimento explicito.
4. **Tags livres:** substituir categorias fixas obrigatorias como Neon/Natureza/Espaco por multiplas tags escritas pelo autor. Entrada separa por espaco e virgula, transformando automaticamente cada token em chip removivel. Exemplo "anime luffy one_piece" => tags anime, luffy, one_piece. Tratar caixa, Unicode/acentos de modo consistente, deduplicar e estabelecer limites anti-spam (quantidade/comprimento); preservar registros e compatibilidade de categorias antigas mediante migracao planejada, sem perder dados. Nao usar espaco dentro da mesma tag no modelo inicial.
5. **Pesquisa real:** recuperar animacoes aprovadas por correspondencia parcial de TITULO OU TAG, sem distincao de maiusculas/minusculas. "Lu" encontra "Luffy" e tambem titulo contendo "lu"; "anime" encontra um titulo sem essa palavra se possuir tag anime. Se possivel, busca sem distincao de acentos. Ranking razoavel (exato > prefixo > substring), resultados seguros e paginados. Indexar tags no D1 com relacao normalizada (e nao concatenacao sem indice), impedindo tags de conteudo nao aprovado de aparecer publicamente.
6. **Licencas e consentimento:** explicar as quatro opcoes na interface e impedir combinacoes juridicamente inconsistentes: CC0, CC BY 4.0 e CC BY-SA 4.0 ja permitem remixes e usos comerciais nas condicoes aplicaveis; uma checkbox de "nao permitir remix" nao pode contradize-las. "Todos os direitos reservados" nao autoriza remixes ou redistribuicao por terceiros sem permissao especifica, embora o uploader conceda licenca operacional limitada ao BAS para hospedar/mostrar/disponibilizar conforme Termos. Nao transformar IP de terceiros em obra original usando CC sem direitos necessarios. Lembrar que licencas CC em geral nao podem ser unilateralmente revogadas de destinatarios cumpridores.
7. **Aceite:** testar nas interfaces locais e staging privado as tres entradas, presenca condicional de Companion, tags, busca parcial e por tags (sem vazar pendentes), moderacao/Discord, direitos e compatibilidade mobile. Sem publicar a Community ate aprovacao final na P15.9.
8. **Ajuda na escolha de licenca:** exibir ao lado ou acima do campo Licenca um botao pequeno e acessivel, preferencialmente com icone ? e rotulo acessivel 'Nao sabe qual escolher? Clique aqui'. Ao ativar, abrir uma pagina explicativa propria dentro do BAS (em vez de substituir a tela do formulario), de linguagem simples, com exemplos praticos de CC0 1.0, CC BY 4.0, CC BY-SA 4.0 e Todos os direitos reservados, incluindo atribuicao, uso comercial, remixes, condicoes ShareAlike, direitos autorais de terceiros e licencas Creative Commons usualmente irrevogaveis. Links para as paginas oficiais da Creative Commons; para Todos os direitos reservados, explicar a permissao limitada que o criador concede ao BAS e a terceiros para download/uso conforme termos. Preservar dados digitados ao voltar. Garantir teclado, leitores de tela, mobile e traducoes; nunca abrir um link externo sem contexto. Incluir testes dessa navegacao e do retorno seguro ao formulario.

## P15.7 — entrega integrada da Community (2026-11-04)

**Situação:** implementação local e beta privado de moderação, catálogo real, tags, pesquisa e ajuda de licenças. Não é o lançamento público; testes humanos finais ainda necessários. Um único commit para a etapa, sem mini-etapas arbitrárias.

- **Publicação:** formulário comum apresenta ZIP como padrão, sem opção redundante Editor. O Companion só aparece no seletor quando a origem BAS local informa conexão; isso é apenas UX, não substitui autenticação. No editor BAS completo, o botão Publicar na Community aparece ao concluir a exportação; transfere o ZIP em memória via postMessage de origem conferida, sem upload automático. Na tela principal do dispositivo conectado, botão Publicar animação do dispositivo oferece a animação original e a aplicada (esta somente quando confirmada), reutiliza leitura autorizada e requer confirmação na conta HTTPS. O site e módulo do aparelho não são expostos publicamente.
- **Tags livres:** campo de etiquetas transforma espaços, vírgulas ou Enter em tags removíveis e evita duplicatas. Limite de 12 tags e 32 caracteres cada, normalização Unicode para remoção de acentos e case folding; no D1, relações normalizadas em animation_tags com índice e limite via trigger. Categoria antiga interna mantida para compatibilidade, mas não é obrigatória no formulário.
- **Galeria beta e pesquisa:** página no Worker autenticado com busca parcial em título e tags, sem distinção de caixa/acentos; ranking exato > prefixo > substring e paginação. Somente animations.status='published' + animation_versions.status='approved' + contas ativas. Downloads de aprovadas via endpoint de streaming autenticado, rate limit de operações do aplicativo; R2 nunca retorna object_key ao cliente. /v1/catalog PUBLICO segue OFF.
- **Moderação:** fila privada de pendentes e denúncias. Moderador é a única conta que aparece em MODERATOR_USER_IDS e a habilitação MODERATION_STAGING_APPROVED. Aprovação, rejeição, ocultação, restauração e tratamento de denúncias registram auditoria no D1; a aprovação não dispensa revisão humana. Índice único impede revisões conflitantes da mesma versão. Denúncias requerem conta autenticada, duplicatas bloqueadas e máximo de 5 por 24h.
- **Licenças:** guia próprio /beta/licenses, link acima do seletor em nova aba para preservar formulário. Explica CC0, CC BY, CC BY-SA e Todos os direitos reservados com links oficiais. Backend recusa CC com remixes negados e direitos reservados com remixes liberados. Autor deve confirmar direitos de publicação.
- **Discord:** notificações de aprovações, rejeições, ocultações e denúncias vão para fila discord_outbox. Envio manual e autenticado usa apenas webhook HTTPS de Discord, com allowlist de host e sem mencionar contas automaticamente. **NÃO há webhook configurado; DISCORD_NOTIFICATIONS_APPROVED=false, portanto nenhuma notificação foi realmente enviada.** Configuração real depende de a proprietária informar ou autorizar um webhook; não criar segredo ou canal fictício.
- **Banco:** migração 0006 adiciona animation_search, animation_tags, community_reports e discord_outbox sem apagar registros anteriores; aplicada com sucesso ao D1 staging. User existente e upload anterior preservados. 64 MiB de teto D1/R2 do beta seguem inalterados.
- **Cloudflare:** Worker bas-community-staging, credenciais OAuth preservadas, exatamente uma conta no allowlist de beta e no moderador. BETA_CATALOG_ENABLED, MODERATION_STAGING_APPROVED e STAGING_DOWNLOADS_APPROVED ativos **somente no staging**; PUBLIC_CATALOG_ENABLED e AUTH_PUBLIC_SIGNUP_APPROVED continuam falsos. Discord OFF.
- **Validação pendente:** usuário autenticado deve testar tags reais, busca após aprovação, downloads, envio direto do editor, original/aplicada do Companion pareado e verificação de relatórios/moderação. Sem webhook real não declarar entrega Discord ponta a ponta concluída. P15.9 contém aprovação final do lançamento, revisão de custos, segurança, disponibilidade e merge na main.

## P15.7 — entrega consolidada de staging privado (2026-11-05)

**Implementado em codigo e implantado no beta privado; aceite humano em navegador/Companion ainda pendente.** Nao houve lancamento publico e a main ficou intocada.

- Cloudflare Worker bas-community-staging versao final 7ce6e9e0-36c7-4bd9-a4fc-8df79c3a22be (rollback c776e069-0fa3-4816-bde6-67301976c48e). 28 bindings preservados, quatro secrets intactos, lista privada com uma conta GitHub. Moderador vinculado ao ID de usuario ja autenticado, sem publicar sua identidade nos documentos.
- D1 migracao 0006_moderation_catalog_tags.sql aplicada no staging: animation_tags, animation_search, community_reports, discord_outbox. A conta e o envio do beta preexistentes foram preservados; limite global R2 segue 64 MiB. O dev-server aplica 0001 a 0006.
- Tags livres (12 por obra, 32 caracteres, deduplicadas, Unicode/acentos normalizados) com separacao por espaco, virgula ou Enter, chips removiveis. Mantem categoria legada interna abstract por compatibilidade, nao obriga categoria no formulario. Backend recusa dados invalidos e licencas contraditorias.
- Galeria REAL beta /v1/beta/catalog e detalhes/downloads autenticados, somente versoes published e approved de autores ativos. Busca parcial em titulo, handle ou tags, sem distincao de caixa/acentos para itens no novo pipeline. Paginacao, sem chaves R2. Catalogo publico /v1/catalog continua 503; cadastro publico OFF.
- Moderacao privada: fila, aprovar/rejeitar, ocultar/restaurar, denuncias autenticadas limitadas a cinco/dia e deduplicadas, justificativas, auditoria e dispensa de denuncia. Acesso do moderador separado por MODERATOR_USER_IDS e MODERATION_STAGING_APPROVED, nenhuma aprovacao automatica.
- Discord: fila no D1 e despacho opt-in implementados; DISCORD_NOTIFICATIONS_APPROVED=false, webhook nao conectado e envio real nao testado. Somente o titular podera autorizar e configurar webhook como segredo futuramente.
- Editor do BAS: Publicar na Community nos controles de exportacao E na tela de conclusao ao gerar ZIP. ZIP em memoria ate clique e confirmacao em HTTPS. Na tela comum nao exibir origem Editor; ZIP por padrao e Companion apenas com informacao da conexao autenticada via handoff local.
- Modulo/Companion: na interface conectada do BAS, botao Publicar animacao do dispositivo; modal escolhe copia da original do celular ou da aplicada (se detectada). Usa endpoint local pull com permissao e consentimento; nenhuma mudanca no APK/modulo publicado, nenhum flash/instalacao. Teste fisico nao realizado.
- Licencas: guia first-party /beta/licenses, link de ajuda em nova aba para preservar formulario, fontes Creative Commons, licencas CC0, CC BY, CC BY-SA e todos os direitos reservados explicados. Backend impede permitir-remix contraditorio.
- Regressoes locais: **139/139** = 17 UI, 89 JS API, 33 SQLite. Smoke HTTPS: pagina, assets, licencas 200; API beta sem login 403; /v1/catalog 503; /v1/auth/me 401. Teste real de publicacao, fluxo Companion e webhook Discord ainda pendentes.
- Proximos marcos: P15.8 unica entrega de recursos sociais e seguranca; P15.9 auditoria/launch com aprovacao expressa; main intocada.

## Correções solicitadas após P15.7 (2026-11-05)

- Tags: espaço permanece dentro da MESMA tag; vírgula separa tags.
  Só confirmar clicando em + Adicionar (Enter é atalho); nunca gerar
  automaticamente ao digitar ou perder foco. Exemplo One piece -> uma
  tag; One piece, Teste -> duas. Exemplos do campo: anime, natureza,
  relaxante. Migration D1 0007 permite tags compostas sem apagar antigas.
- Idioma: guia de licenças nas oito línguas do BAS, determinado pelo
  idioma selecionado pelo usuário, não fixado em português. A UI nativa
  da Community também deverá reutilizar o i18n original do BAS.
- Discord: bot administrativo privado conforme
  docs/P15_DISCORD_ADMIN_BOT.md. O usuário denuncia no site.
  Bot recebe eventos administrativos com preview GIF real e botões
  Aprovar/Negar/Mais informações/Baixar. Antiga tentativa de
  webhook texto foi bloqueada. O bot completo permanece pendente.
- Integração verdadeira: NÃO substituir a interface do BAS por uma
  página paralela. Ver docs/P15_UNIFIED_SITE_ARCHITECTURE.md.
  A rota same-origin e o bundle estático estão preparados mas
  ainda não foram implantados com Cloudflare Assets; a experiência
  nativa do BAS ainda requer implementação.
- Manter revisão consolidada da P15.7 na branch dev,
  sem criar novas mini-etapas nem alterar main; nenhum lançamento público.

## Revisão consolidada dos reportes da P15.7 (2026-11-05)

- Correções live no Worker privado bas-community-staging: versão
  1b723004-f4ed-487a-ae24-600c7c6518d1; rollback possível para
  7ce6e9e0-36c7-4bd9-a4fc-8df79c3a22be.
- Migracao 0007_multiword_tags.sql aplicada ao D1: 1 usuário e 1
  animação preservados; tags antigas intactas (0 tags neste beta).
- UI com + Adicionar: espaço permanece na tag, apenas vírgula
  divide; tags com múltiplas palavras retornam como array JSON
  na API sem serem quebradas; placeholder genérico.
- Licenças no idioma solicitado via lang ou Accept-Language, com
  oito idiomas do BAS; idioma da origem do editor é encaminhado
  ao beta quando abre o formulário.
- Discord: botão legado de despachar webhook removido, rota de texto
  bloqueada mesmo se configurada; bot administrativo solicitado
  não implementado. Ver documentação específica.
- Preparados build de static assets do BAS ORIGINAL, exemplo de
  configuração Cloudflare Assets e rota /studio/ protegida por sessão,
  mas ainda NÃO implantados na Cloudflare nem integrados visualmente
  com o BAS original. Staging /studio/ ainda retorna 404.
- Testes locais: **144/144** (17 site, 94 API JS, 33 SQLite).
  Teste HTTP live: campo/manual Add e scripts 200, oito guias
  com html.lang correto, /v1/auth/me 401 sem login,
  /v1/beta/catalog 403 sem login, /v1/catalog 503,
  /studio/ 404 (por segurança, até o deploy de assets).
- main e Companion publicado não alterados. Beta privado mantido.
