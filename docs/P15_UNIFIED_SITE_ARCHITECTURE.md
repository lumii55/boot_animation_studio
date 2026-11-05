# BAS Community — integração real no BAS original

**Decisão de 2026-11-05:** o site BAS original deve fornecer o layout,
a navegação, o editor e toda a experiência. A Community não pode ser
um site visualmente independente.

## Problema

O beta anterior em Workers.dev apresentou perfil e galeria em outra
página. BAS original estava em GitHub Pages ou Termux.
Popups e links entre os dois endereços não são a integração definitiva.

## Trabalho preparado

- build_studio_assets.py cria uma cópia allowlisted dos arquivos estáticos
  do BAS original (HTML/CSS/JS/traduções/ícones), sem banco e sem segredos.
- wrangler.unified.example.jsonc configura Workers Static Assets com
  binding ASSETS e execução Worker-first. A configuração exemplo é
  fail-closed e não deve substituir os bindings vivos.
- studio-assets.mjs implementa rota opcional /studio/ protegida pela sessão
  OAuth e flag BAS_UNIFIED_STUDIO_ENABLED, servida na MESMA origem HTTPS
  da API /v1, sem iframe nem cookies de terceiros.
- Testes com Assets simulado confirmam autenticação, caminho dos arquivos
  e recusa quando desativado.

## Ainda não concluído

1. Upload real da árvore estática para Cloudflare Workers Static Assets.
   O conector disponível atualizou Worker JS, mas não completou o
   fluxo de upload autenticado de static assets.
2. Montar perfil, galeria, publicações e moderação no layout e menus
   DO BAS ORIGINAL. Não copiar o layout separado da página beta.
3. Validar navegador real, login seguro same-origin, editor,
   arquivos, Android Companion e oito idiomas em UMA única origem.
4. Nunca ativar cadastro/catálogo público nem modificar main sem
   aprovação da proprietária.

A estrutura preparada é progresso de arquitetura, não prova de que
o BAS inteiro já está hospedado e integrado.
