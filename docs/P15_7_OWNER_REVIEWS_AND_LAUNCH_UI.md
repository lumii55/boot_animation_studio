# P15.7 — ajustes na entrada da Comunidade e gerenciamento do autor

**Escopo:** somente `lumii55/boot_animation_studio`, branch `dev/p15-community-foundation`. O código do módulo/Companion e a `main` não foram alterados. O Cloudflare continua sendo **apenas API/backend**, nunca um segundo site.

## Entrada do BAS

O terceiro cartão da tela inicial fica entre **Conectar ao celular** e **Abrir arquivo de projeto**, com tamanhos e tipografia nativos (sem bordas duplas). As etiquetas de título e descrição acompanham a escolha de idioma nos oito idiomas `pt,en,es,fr,de,it,ja,zh`. Uma sincronização adicional após a inicialização de idiomas evita que o botão carregue em inglês quando a interface do BAS já está em português. O Service Worker agora utiliza um cache de nova versão para evitar reutilização da UI anterior no celular.

## Ações de autor dentro da Community

O perfil privado apresenta todas as animações pertencentes ao usuário autenticado, inclusive publicações aguardando aprovação. Uma publicação aprovada pode ser aberta, editada ou retirada. Nunca conceder acesso de edição com base apenas em um botão no frontend: todas as rotas exigem sessão BAS válida, `owner_id`, origem autorizada e CSRF para mutações.

**Edição:** título, descrição, tags, licença e atribuição, com ZIP opcional. O autor confirma direitos sobre a obra novamente. Toda edição gera uma entrada imutável em `owner_revisions` e fica `pending_review`. **A versão aprovada atual continua pública sem alterações** enquanto a edição aguarda decisão. Se o autor anexar ZIP, ele é validado e enviado exclusivamente para a quarentena privada R2; o vídeo/ZIP anterior não é modificado. A aprovação administrativa substitui os metadados e, se houver ZIP, troca a versão publicada de maneira transacional. Rejeitar mantém a publicação antiga. O autor pode cancelar uma edição pendente (mas não uma revisão já em processamento/upload).

**Exclusão:** o autor confirma a remoção em um modal próprio do BAS. A publicação é retirada imediatamente do catálogo por `status='removed'` (soft delete); a API pública exige `published` e `approved` e deixa de exibi-la/entregá-la. Registros de moderação e objetos privados permanecem para auditoria e limpeza futura. Não há restauração automática na interface.

**Administração:** a fila privada retorna tanto primeiras publicações quanto edições, identificando `review_kind` e `edit_id`. As decisões de aprovar/negar reutilizam autenticação de moderadora, separação de sessão administrativa e histórico de `moderation_events`. O download de ZIP pendente de uma edição usa `?edit=<id>` com mesma sessão administrativa, sem URL R2 pública.

## Backend e migração

- Nova migração aditiva `community-api/migrations/0010_owner_revisions.sql`; aplicar **somente no D1 staging** e somente depois de validar os resultados de testes. Nunca reverter o banco removendo tabelas históricas.
- Nova rota privada `GET /v1/publishing/animations` lista publicações da própria pessoa.
- `POST /v1/publishing/animations/:id/revisions` cria revisão com chave idempotente; metadados sempre exigem moderação.
- `PUT /v1/publishing/revisions/:id/zip` recebe novo ZIP opcional e verifica formato, tamanho e regras de segurança.
- `POST /v1/publishing/revisions/:id/cancel` cancela revisão pendente do próprio autor.
- `POST /v1/publishing/animations/:id/remove` retira publicação do próprio autor após confirmação explícita.
- **Não expor essas rotas em contas administrativas comuns sem sessão BAS; não permitir modificar conteúdo de terceiros.**

## Testes executados

- `node --test tests/*.cjs`: **44/44**; inclui testes do perfil, formulário, confirmação, localizações e cache/markup.
- `node --test community-api/tests/*.mjs`: **97/97**, com cenários API+SQLite para editar somente metadados ou ZIP, aprovar/rejeitar, idempotência, exclusão, terceiros bloqueados e revisão pendente.
- `python -m unittest discover -s community-api/tests -p 'test_*.py'`: **39/39**, incluindo gatilhos SQLite e idempotência da migração.
- Total: **180/180** testes. Checagem JS e conferência do shell offline e assets do BAS passaram.

## Aceite ainda necessário

- Browser Android real: revisar cor, layout e tradução; entrar no perfil, abrir publicação, editar e testar aprovação no painel privado e aparição na galeria.
- A edição administrativa precisa ser verificada com a sessão ADM no navegador real, além dos testes do backend.
- O bot **Discord administrativo com GIF real, ações verificadas e botões interativos** ainda depende de configuração/aprovação de aplicação, ID, canal e credenciais privadas; webhook de texto **não substitui** o requisito e não deve ser ativado.
- Prévia da galeria ainda baixa ZIP aprovado completo em beta; otimizar prévia compacta antes de lançamento público.
- Nenhum lançamento público/main até confirmação da dona do BAS. Sanitizar menções internas de fases P somente quando houver autorização de merge final.

**Regra permanente de continuidade:** toda alteração exige imediatamente novo ZIP *completo* contendo código/commit/branch/estado real/testes/pendências, sem tokens, segredos de Cloudflare, fotos privadas, exportações D1 ou arquivos privilegiados do módulo.
