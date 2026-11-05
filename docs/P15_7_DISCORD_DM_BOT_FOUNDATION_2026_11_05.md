# BAS P15.7 — Bot oficial do Discord por DM (fundação segura)

**Situação:** código, migrações 0012 e 0013, controles e testes implementados; **envio de DM ainda DESATIVADO**. Nada exige editar o repositório do Companion ou a branch `main`. O BAS original permanece a única interface da Community; o Worker Cloudflare é somente backend/API.

## Interface visual e avatares

- Na publicação real, após **Sobre esta animação**, aparecem cartão do criador (incluindo Seguir, exceto no próprio perfil) e ações Baixar, Remix (se licença permitir), Curtir, Compartilhar, aplicar/editar/denunciar. Os comentários ficam depois de todos esses controles, mesmo quando houver centenas deles.
- O botão **Denunciar publicação** aparece apenas em postagens de terceiros; **Denunciar comentário**, apenas em comentários de terceiros quando a pessoa está autenticada. A pessoa não pode denunciar seu próprio conteúdo.
- Fotos privadas nunca viram públicas automaticamente. A nova opção **Mostrar minha foto publicamente no perfil e nos comentários** em *Editar perfil* fica desativada por padrão. Só quando a própria pessoa habilita, o backend permite obter a imagem WebP reprocessada do R2 pelo endpoint restrito `/v1/social/avatars/{handle}`; nunca divulga `object_key`, EXIF ou URL do bucket privado. O backend verifica `avatar_public`, conta ativa, mídia ativa e cotas de leitura. Imagens em comentários e na página dos criadores usam o mesmo estado.
- A escolha do avatar público é traduzida nos oito idiomas do BAS. Testar com duas contas distintas para visualizar uma foto publicada; sem opt-in aparece a inicial.

## Notificações privadas (bot administradora)

- Aplicação bot **oficial** do Discord; não usa self-bot nem token de uma conta pessoal.
- Banco D1: `0013_discord_admin_queue.sql`, tabela `discord_admin_events` e gatilhos para (1) novas publicações, (2) edições aguardando aprovação, (3) denúncias de postagens, (4) denúncias de comentários. Eventos são idempotentes e ficam guardados mesmo com o bot desligado.
- Cloudflare Worker: módulo `src/discord-admin-bot.mjs`; `POST /v1/discord/interactions` (HTTP) verifica assinatura Ed25519 em **TODAS** as requisições, timestamp de 5 minutos, ID da aplicação, ID da administradora e contexto **DM com o bot**. Rejeita invocações externas/servidores/contas não autorizadas. PING só funciona com a configuração aprovada.
- Controles planejados: publicação/revisão → **Aprovar**, **Negar** (modal com motivo obrigatório), **Mais informações**, **Baixar ZIP**; denúncia → **Ocultar**, **Dispensar**, **Mais informações**. Reutiliza no backend as mesmas transições auditadas do painel admin; operação repetida recebe conflito, sem segunda decisão.
- Baixar ZIP: só pela interação autenticada no Discord, usando resposta temporária/ephemeral com anexo; não cria link público de R2. Um ZIP que exceda o limite de anexos Discord precisa ser revisado via painel local `8090`.
- Despacho: evento `scheduled` do Worker tentará enviar no máximo 3 DMs por execução, com IDs de idempotência do Discord, quota, controle de tentativas e confirmação no D1. O destinatário será apenas `DISCORD_ADMIN_USER_ID`. Envio depende de **Cron Trigger configurado depois de conectar o app**.
- **GIF real obrigatório para novas postagens/edições**: antes de enviar por DM, o Worker exige que a versão pendente tenha `preview_key` privado terminando `.gif`, com bytes reais `GIF87a/GIF89a`, até 2 MiB. Como o BAS ainda não gera nem armazena esse GIF no fluxo do ZIP, esses eventos ficam `blocked / gif_preview_required`. **A geração segura do GIF a partir de quadros verdadeiros ainda precisa ser implementada e testada** antes de habilitar DMs. Não substituir por GIF fictício nem vazar ZIP em URL pública.
- Rotas e tarefa de envio ficam desabilitadas enquanto `DISCORD_ADMIN_BOT_ENABLED!='true'`; não ativar agora. O webhook legado de texto segue desativado.

## Para a proprietária fazer mais tarde (quando conectar)

1. Entrar em <https://discord.com/developers/applications> e criar uma **New Application** privada (ex.: `BAS Moderation`); habilitar a conta Bot.
2. Anotar **Application ID** e **Public Key**; a **Bot Token** deve ser configurada *diretamente* como segredo no painel Cloudflare, sem colar token na conversa, GitHub ou Termux. Usar as bindings `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_ADMIN_USER_ID`; a última é o ID numérico da conta Discord que receberá as DMs (Modo Desenvolvedor → Copiar ID).
3. Instalar o bot para a própria conta (ou em ambiente privado apropriado), permitir DMs e confirmar que consegue enviar mensagem ao destinatário. O bot não precisa de privilégios para administrar servidores Discord nem de Message Content Intent para botões.
4. **Só depois** de gerarmos e validarmos o GIF real a partir de ZIPs aprovados e garantirmos queue/retries, definir o endpoint de Interactions para `https://bas-community-staging.caiolive1000.workers.dev/v1/discord/interactions`, com assinatura válida e PING. Configurar um Cron Trigger com cadência curta e segura (por exemplo, a cada minuto) e ativar `DISCORD_ADMIN_BOT_ENABLED=true` por último, **somente no staging**.
5. Testar um ZIP de verdade com DM + GIF, rejeição com motivo, aprovação idempotente, download privado, denúncia de postagem e comentário e rollback. Conferir o painel local como fallback. Não abrir contas públicas nem `main` neste marco.

## Testes e pendências

- Comandos: `node --test tests/*.cjs`; `node --test community-api/tests/*.mjs`; `python -m unittest discover -s community-api/tests -p 'test_*.py'`.
- Testes específicos de Ed25519, origem, identidade autorizada, bot desativado, PING, modal, IDs dos botões, privacidade de avatar e D1 outbox.
- **Ainda pendente:** geração real de GIF, credenciais/consentimento da dona, configuração do evento Cron, conexão Discord efetiva e aceite visual/funcional no Vivaldi. Até esses itens, a P15.7 **não está concluída**.

## Restrições do trabalho

- Branch exclusiva `dev/p15-community-foundation`, repositório BAS. Não tocar `main` nem o repositório de módulo/Companion. O painel administrativo é privado em `~/bas-admin-private`, nunca copiar para GitHub.
- Migrações 0012–0013 são aditivas; `0012` usa ALTER TABLE e deve ser aplicada **uma única vez** no staging (não reaplicar). Antes de qualquer deploy, conservar segredos e todos os bindings existentes; comparar versões e manter a anterior para rollback.
- Toda alteração exige um ZIP de continuidade completo com commit, branch, código, resultados, estado Cloudflare, scripts, decisões e pendências. Nunca incluir secrets, tokens, R2 objetos privados nem mídia pessoal.
