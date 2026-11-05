# P15.7 — Preview real do ZIP e integração móvel (2026-11-05)

Escopo: **somente** o repositório `lumii55/boot_animation_studio`, branch `dev/p15-community-foundation`. Nenhum arquivo do repositório do módulo foi alterado e a `main` não foi modificada.

## Alterações de UX

- O atalho da Community foi movido do cabeçalho do site para a terceira opção grande da página inicial (Studio / Conectar celular / Comunidade), com textos em oito idiomas. Continua abrindo a **Community nativa dentro do próprio BAS**.
- A etiqueta verde redundante do cabeçalho da Community foi removida. No celular, o breadcrumb se resume a BAS, preservando os controles da conta e de fechamento.
- O grande marcador estático "✦ ZIP" foi substituído por um canvas que renderiza os quadros da animação de inicialização real. O detalhe da publicação também oferece a mesma prévia. O botão de download deixou de repetir "ZIP".
- A foto e o banner da **própria conta conectada** aparecem em Criadores e no perfil público visualizado pela proprietária, reutilizando os object URLs privados já obtidos pela sessão do BAS. Fotos de outros autores **continuam privadas**: não criar links públicos para R2 nem tornar mídia privada de terceiros visível sem nova configuração de consentimento.
- Clicar numa animação na página de um criador abre os detalhes (antes a busca do clique estava limitada aos itens da galeria principal).

## Comportamento e limitações das prévias

1. `js/community-animation.js` usa o `BASCommunityOnline.approvedZip(id)` **existente**, somente para arquivos **aprovados/publicados**; não introduz endpoint novo nem expõe objetos de quarentena do R2.
2. Executa um parser restrito do `desc.txt` (`WIDTH HEIGHT FPS` e partes `p/c count pause partN`) e lista quadros PNG/JPG/WebP com ordenação numérica.
3. Para `count > 0`, respeita as repetições e pausas originais no FPS especificado. Para `count=0`, simula cerca de cinco segundos de loop antes da parte final; a parte `c` aguarda o término de um ciclo para não cortar o trecho no meio. A prévia completa reinicia após o final.
4. A taxa de quadros nunca ultrapassa o FPS do ZIP e é limitada a 60 fps para poupar o dispositivo; dispositivos lentos podem pular quadros, não acelerar a reprodução. A renderização reduz cada frame a no máximo 420 px de dimensão maior. Imagens são decodificadas sob demanda com LRU máximo de 12 frames, e ZIPs carregados ficam em LRU de 2 quando não estão visíveis.
5. `IntersectionObserver` carrega apenas cartões próximos da área visível, interrompe a reprodução ao rolar para fora ou sair da Community. Respeita `prefers-reduced-motion` exibindo o primeiro frame estático. Falhas mostram um fallback neutro, não um ZIP inventado.
6. **Limitação de beta:** a primeira visualização de um cartão precisa ler o ZIP publicado inteiro pelo endpoint de downloads, consumindo banda móvel e orçamento de leitura R2. O arquivo é cacheado apenas em memória desta sessão. Antes do lançamento público, substituir este mecanismo por previews compactas pré-geradas após validação/moderação e servidas por endpoint específico, mantendo a privacidade e a revisão dos arquivos.
7. A prévia é uma simulação do comportamento de boot de acordo com o `desc.txt`; não representa com precisão absoluta tempos de boot, firmware ou desempenho de todos os aparelhos. Não altera nem instala nada no celular.

## Verificações

- `node --test tests/*.cjs`: 39/39, incluindo sete testes novos para parser, FPS, loop, pause, leitura de ZIP e entrada móvel.
- `node --test community-api/tests/*.mjs`: 94/94; backend não alterado.
- `python -m unittest discover -s community-api/tests -p 'test_*.py'`: 33/33.
- Todos os arquivos JS alterados passam em `node --check`.
- Navegador Android real: verificar manualmente prévia da publicação existente, foto pessoal, disposição do botão de início e retorno OAuth. A validação de interface Chromium sandbox não foi possível neste ambiente, que bloqueia navegação local HTTP.

## Notas para próxima revisão

- Não fazer deploy Cloudflare quando a mudança envolver só frontend: o Worker de staging, D1 e R2 continuam sem alterações.
- A branch de desenvolvimento contém nomenclaturas internas de P15; ao integrar na `main` fazer revisão de textos/arquivos internos e a limpeza exigida pela proprietária.
- Qualquer nova alteração, por menor que seja, requer um novo pacote ZIP de continuidade verificável, com código atualizado, branch/commit, resultados de testes e pendências. Não incluir credenciais, conteúdo privado de D1/R2, painel ADM, APK ou código de outros repositórios.
