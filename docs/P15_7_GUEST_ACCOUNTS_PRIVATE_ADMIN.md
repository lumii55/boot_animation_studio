# P15.7 — retorno de OAuth, convidados e administração separada

Data: 2026-11-05. A interface principal do BAS, editor e Companion
continuam intocados. Todas as mudanças permanecem em P15.7, sem
mini-etapas adicionais nem publicação da branch main.

## Login sem segunda navegação

O GitHub OAuth continua sendo um redirect completo no navegador,
porém o BAS salva em sessionStorage a intenção de reabrir a Community.
Ao receber a autorização PKCE de uso único, o BAS restaura a
Community na rota Meu perfil automaticamente. Também tenta a
restauração em load e pageshow, evitando corridas de inicialização.
A intenção é limpa após sucesso, falha ou logout. Nunca enviar token
de sessão em URL, mensagem entre páginas ou logs.

## Seletor de conta GitHub

Usar o mecanismo oficial GitHub OAuth prompt=select_account.
O GitHub, não o BAS, mostra as contas disponíveis e permite trocar.
Referência oficial:
https://github.blog/changelog/2024-06-07-account-picker-updates-for-oauth-and-github-app-sign-in/

O beta restrito mantém AUTH_BETA_GITHUB_IDS. Escolher outra conta
não implica automaticamente aprovação de um segundo usuário.
Não autorizar inscrições públicas sem aprovação explícita da dona.

## Galeria, ZIP e módulo acessíveis sem login

COMMUNITY_GUEST_READ_ENABLED ativa exclusivamente leitura GET de
catálogo beta, detalhes e download de versões published/approved
de criadores active. NUNCA dá acesso a rascunhos, conteúdos pendentes,
fila administrativa, denúncias ou publicação.

O BAS local pode pesquisar por nome e tags e baixar ZIP sem conta.
Para aplicar pelo Companion, é preciso que esteja conectado com
feature direct_upload, permissão control e confirmação explícita.
Usa o endpoint /upload já existente e respeita os limites de ZIP.
Nada é aplicado automaticamente.

Denúncias, publicação, comentários/curtidas futuras e ações de
identidade exigem autenticação. PUBLIC_CATALOG_ENABLED permanece
false: não é aprovação de lançamento público do site.

## Painel administrativo independente

O código do painel não é enviado com o BAS open source.
Aplicação local privada: $HOME/bas-admin-private no Termux,
servida apenas em http://127.0.0.1:8090/ (loopback).
Não expor portas externamente ou repositório público.

No Worker, ações ADM exigem simultaneamente:
- MODERATION_STAGING_APPROVED true e ID em MODERATOR_USER_IDS;
- ADMIN_PANEL_SEPARATED e BAS_ADMIN_CLIENT_ENABLED;
- Origin exatamente igual a BAS_ADMIN_ORIGIN;
- sessão separada client_kind=admin, obtida por OAuth GitHub;
- prova CSRF para alterações e estados validados em D1.

Migração 0009_admin_session_scope.sql adiciona client_kind e
define bas como valor de todas as sessões existentes.
Uma sessão comum do BAS nunca autoriza acesso administrativo,
mesmo com a conta de uma moderadora.

Painel privado oferece Aprovar, Negar, informações, Baixar ZIP
pendente, Ocultar e Dispensar denúncia, usando as regras e auditoria
do próprio backend. Um futuro admin hospedado online precisará
domínio privado e Cloudflare Access ou autenticação equivalente.
O GIF de preview real e o bot Discord de administração permanecem
requisitos pendentes; não fingir que notificações texto substituem bot.

## Flag de beta / rollout

Manter bloqueados cadastro público, catálogo público da fase de
lançamento, o webhook antigo do Discord, o site beta separado,
Workers Static Assets, e a main. Ativar apenas o portal privado
local e o GET de conteúdo aprovado conforme a autorização atual.

Validar em Chrome real: retorno ao perfil, troca de conta GitHub,
explorar/download sem conta, instalação pelo Companion com confirmação
e decisões do painel administrativo independente. Testes simulados
não substituem aceitação da dona.

## Estado confirmado da implantação staging

- Worker bas-community-staging versão ativa
  9abba123-c5c0-4003-a657-292c62b5b0d1.
- Versão anterior para rollback:
  7e4c043c-974c-47af-8b52-2ea4b005f3e5.
- 35 bindings preservados, inclusive os 4 segredos de OAuth/sessão.
- D1 0009 aplicada, 1 usuário e 1 animação anteriores preservados.
- Flags de leitura anônima de aprovados e admin separado habilitadas.
  Signup público, catálogo geral de lançamento, portal HTML no
  Worker e webhook texto Discord continuam desativados.
- Smoke real: galeria sem login 200 (0 itens aprovados no momento),
  /v1/auth/me sem login 401, admin sem login 403,
  rota de website Cloudflare 404, catálogo público antigo 503,
  prompt=select_account presente no redirect GitHub OAuth 302.
- Frontend BAS local permanece em http://127.0.0.1:8088/;
  painel admin separado local em http://127.0.0.1:8090/.
- Testes automáticos completos: 148/148 (25 BAS, 90 API,
  33 Python SQLite). Testes de OAuth e Companion reais no
  navegador da dona ainda aguardam confirmação.
