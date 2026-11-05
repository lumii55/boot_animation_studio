# BAS Community — correções P15.7 (2026-11-05)

Esta é UMA revisão consolidada, sem etapas adicionais.

## Erro invalid_metadata: causa corrigida

O cliente js/community-online.js enviava
companion_permission_confirmed:false para source=zip e source=editor.
O backend aceita esse campo apenas quando source=companion.
Corrigimos o corpo dos metadados sem relaxar nenhuma verificação
do Worker. Nomes originais com acentos/parênteses seguem visíveis
no BAS, mas o nome técnico enviado é bootanimation.zip para evitar
rejeição desnecessária.

## Interface do BAS original preservada

- Seleção ZIP: botão único; input nativo oculto, sem duplicação.
- Ajuda da licença: sem pontuação duplicada.
- Guia de licenças: explicações detalhadas das quatro opções, com
  permissões, atribuição, obras derivadas, comércio e exemplos.
  Idiomas: pt/en/es/fr/de/it/ja/zh. Fontes oficiais:
  https://creativecommons.org/share-your-work/use-remix/cc-licenses/
  https://creativecommons.org/reusing-cc-licensed-content/
  https://creativecommons.org/chooser/
- Textos e filtros localizados, sem destacar a moderação para quem
  apenas explora. A mudança de idioma acompanha o seletor do BAS.
- Criadores: aba funcional, lista apenas criadores ativos com
  publicações aprovadas. Novo GET /v1/beta/creators e filtro
  opcional creator=handle no catálogo de posts aprovados.
- Publicar: clique definitivo após preencher o formulário; nenhum
  confirm extra de navegador. Erros e status ficam na Community.
- Denúncias e aplicação no Companion: diálogos próprios do BAS,
  sem prompt/alert/confirm do navegador; aplicação destrutiva segue
  exigindo confirmação explícita, além das permissões do Companion.
- Todos os ajustes CSS são locais ao overlay Community. Editor,
  interface principal, APK Companion e main não foram alterados.

## Segurança e testes

- Publicação só entra em fila privada de revisão, não fica pública
  automaticamente. R2 quarentena e validação do ZIP preservados.
- Apenas posts published+approved, criados por contas active,
  aparecem na galeria, perfis de criador e downloads anônimos.
- Backend Cloudflare continua API-only, sem servir páginas.
- 159/159 testes locais: 32 frontend, 94 API, 33 SQLite.
  Testes novos verificam corpo real de publicação nas três origens,
  arquivo com nome unicode, textos, 8 guias, aba Criadores,
  modais próprios, permissões e catálogos approved-only.
- Staging Worker 4a8d9367-6d73-43cc-8aec-7de8c181de2c.
  Rollback  fe62cf59-8a0c-4846-a43b-bd9c07728f47.
- Smoke real: /v1/beta/creators 200, /v1/beta/catalog 200,
  /v1/auth/me 401 sem login, fila ADM 403 sem autorização,
  / 404 e /v1/catalog 503. Ainda zero posts aprovados neste beta.
- Falta aceite humano de ZIP real, revisão no ADM, download
  aprovado e integração Companion. Não fingir que testes locais
  cobrem esse ciclo completo.
- Bot Discord de administração com GIF real e botões ainda pendente.
