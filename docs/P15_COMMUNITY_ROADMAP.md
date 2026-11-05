# BAS Community — P15

> Roadmap consolidado em 2026-11-04: **9 etapas no total**, P15.1–P15.9, substituindo o plano antigo de 14 etapas. Fonte única de verdade para o trabalho futuro. Os marcos históricos P15.1–P15.5 não serão renumerados.

## Estado atual

- **P15.1–P15.2 — protótipos de interface prontos:** Developer Lab oculto, galeria de demonstração, busca, filtros, detalhes, perfis ilustrados e opções de publicação simuladas.
- **P15.3 — fundação de API e banco pronta para staging:** Cloudflare D1 `bas-community-staging` criado de verdade, com migrações 0001–0003 aplicadas via API. Worker ainda não publicado; catálogo desligado.
- **P15.4 — autenticação preparada, não ativada:** GitHub OAuth com PKCE, sessões e proteção CSRF testados localmente; ainda faltam aplicativo OAuth real, credenciais, topologia HTTPS compatível e autorização para abrir contas.
- **P15.5 — preparação parcial:** validação de ZIP e cotas implementadas/testadas localmente; seletor e recorte de fotos/banners no navegador. **R2 já foi ativado pela proprietária** e o bucket privado `bas-community-staging` (classe Standard) foi criado. O binding `PRIVATE_UPLOADS` está no `wrangler.jsonc` privado do Termux, não no repositório. **Não há uploads reais, Worker público nem imagens persistidas.**
- **P15.6 — EM DESENVOLVIMENTO:** interface de publicação unificada, APIs autenticadas de rascunho e envio em quarentena privada implementadas/testadas localmente, mas sem login real ou uploads ativados. Pareamento Companion, mídias de perfil persistentes, infraestrutura pública segura e reconciliação R2 ainda pendentes.

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
