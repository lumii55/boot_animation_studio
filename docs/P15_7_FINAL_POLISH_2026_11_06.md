# BAS Community — P15.7: acabamento de perfis, visitantes e DMs
Data: 2026-11-06. Status: implementado no staging privado e preview local; aguardando aceite no navegador.

## Escopo
- BAS original continua sendo a única interface; preview local http://127.0.0.1:8088/; nenhuma alteração na main.
- Perfis: dois toggles independentes e destacados para mostrar avatar e banner publicamente, mais seletores de arquivo personalizados.
- Novas contas GitHub começam com avatar e banner visíveis. Imagens de contas anteriores continuam privadas até autorização explícita. R2 original é sempre privado; apenas versão ativa e consentida é servida pelos endpoints públicos de imagem. Desativar o toggle retorna 404 na rota pública.
- Visitantes: curtir, seguir, denunciar, curtir/denunciar comentários e comentar solicitam login em modal contextual. Nenhuma mutação nem redirecionamento ocorre sem escolha. Após autenticar, retorna à animação ou ao perfil anterior; baixar e explorar continuam livres.
- Discord: as DMs entregues pelo bot são removidas após a decisão de moderação. DMs pendentes e registros de auditoria ficam intactos. Em caso de falha, bot tenta desativar botões e agenda nova tentativa.
- Sistema avançado de denúncias, sanções e banimentos fica reservado para P15.8.

## Infraestrutura
- Migração aditiva 0015_profile_visibility_discord_cleanup.sql aplicada ao D1 privado: banner_public default 0 e quatro campos para gerenciamento da limpeza de DMs.
- Staging Worker: deployment e8110062-f458-4421-bf67-31b07466287a; version aee7cbef-2ed0-4bf9-818e-d51b1dee2b81 em 100% do staging. Doze módulos e 41 bindings preservados.
- Permissões: AUTH_STAGING_TEST_SIGNUP_ENABLED=true, AUTH_PUBLIC_SIGNUP_APPROVED=false, PUBLIC_CATALOG_ENABLED=false, BETA_CATALOG_ENABLED=true.
- Preview local atualizado para o cache PWA bas-shell-web-v21. Backup dos seis arquivos anteriores em ~/bas-p15-preview-before-final-polish-2026-11-06.
- Código no worktree ~/bas-p15-rejection-nav-integration, ainda sem commit de fechamento. Branch remota dev/p15-community-foundation e main preservadas.
- Banco D1 no último teste continha duas contas e dez animações com status removed; a galeria vazia é consistente com esses estados.

## Testes automáticos
- Interface: 61 OK
- API: 126 OK
- Banco de dados: 50 OK
- Total: 237/237 OK
- Staging: catálogo e criadores HTTP 200.

## Aceite humano pendente antes do commit P15.7
1. Na conta principal antiga, abrir Editar perfil. Os dois toggles precisam iniciar desligados, até consentimento. Ligar, salvar e testar foto + banner em conta secundária e visitante.
2. Desligar apenas banner, mantendo foto, e depois inverter, conferindo privacidade individual e persistência após refresh.
3. Alterar avatar e banner pelos botões personalizados, verificando upload e layout no Vivaldi móvel.
4. Sem login, abrir uma animação aprovada e tocar Curtir/Seguir/Denunciar/Comentar. Modal deve aparecer; Agora não cancela sem perder a tela. Entrar com GitHub deve retornar ao detalhe. Download permanece livre.
5. Criar publicação de teste, verificar DM pendente, aprovar/negar via Discord e painel. DM resolvida some, pendentes ficam, histórico administrativo preservado. Exclusão via painel pode aguardar próximo cron.
6. Conferir novamente moderação, 9GB, ZIP até 40 MiB e dados de contas. Após aceite, consolidar um commit final da P15.7 na branch dev e atualizar roadmap/handoff.
