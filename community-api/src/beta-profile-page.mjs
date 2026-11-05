/* The private BAS Community staging profile, rendered only for allowlisted beta accounts. */
export const profilePage = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#101221">
<title>Meu perfil · BAS Community Beta</title>
<link rel="stylesheet" href="/beta/style.css">
<script defer src="/beta/app.js"></script>\n<script defer src="/beta/publish.js"></script>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/"><span class="brand-mark">✦</span><span>Boot Animation <b>Studio</b></span></a>
  <span class="tag">COMMUNITY · BETA PRIVADA</span>
</header>
<main class="layout">
  <section class="welcome" aria-labelledby="heading">
    <p class="eyebrow">SEU CANTINHO CRIATIVO</p>
    <h1 id="heading">Seu perfil na <em>Community.</em></h1>
    <p>Personalize seu espaço, compartilhe suas ideias e prepare suas futuras animações.</p>
  </section>
  <p id="status" role="status" aria-live="polite">Conectando sua conta...</p>
  <section class="guest panel" id="guest" hidden>
    <h2>Entre no seu perfil</h2><p>Esta prévia está disponível somente para contas autorizadas.</p>
    <a class="btn primary" href="/v1/auth/github/start">Entrar com GitHub</a>
  </section>
  <section id="member" hidden>
    <article class="profile-card" id="profile-view" aria-label="Seu perfil BAS">
      <div class="cover" id="cover">
        <img id="banner-image" alt="Banner do seu perfil" hidden>
        <span class="cover-symbol" aria-hidden="true">✧</span>
        <button type="button" id="change-banner" class="cover-action">✎ Alterar banner</button>
      </div>
      <div class="profile-body">
        <div class="identity">
          <div class="avatar" id="avatar">
            <span id="avatar-initial" aria-hidden="true">✦</span>
            <img id="avatar-image" alt="Sua foto de perfil" hidden>
          </div>
          <div class="identity-names">
            <h2 id="view-name"></h2>
            <p id="view-handle"></p>
            <span id="view-joined" class="joined"></span>
          </div>
          <button type="button" id="edit-profile" class="btn outline">✎ Editar perfil</button>
        </div>
        <div class="profile-bio"><h3>Sobre mim</h3><p id="view-bio"></p></div>
        <div class="profile-actions"><button type="button" class="btn subtle" id="change-avatar">✿ Alterar foto</button>
          <button type="button" class="btn subtle" id="logout">Sair da conta</button></div>
      </div>
    </article>
    <section class="creations panel" id="creations" aria-labelledby="creations-heading">
      <div class="section-heading"><div><p class="eyebrow">CRIAÇÕES</p><h2 id="creations-heading">Minhas animações</h2></div>
      <span class="coming">Em preparação</span></div>
      <div class="empty-icon" aria-hidden="true">✧</div>
      <h3>Seu espaço está pronto para criar!</h3>
      <p>Suas animações aparecerão aqui quando o sistema de publicações privadas for liberado na P15.6.</p>
    </section>
    <section class="panel publish-panel" id="publish-panel" aria-labelledby="publish-heading">
      <div class="section-heading"><div><p class="eyebrow">SUA OFICINA</p>
        <h2 id="publish-heading">Enviar animação para revisão</h2></div>
        <span class="coming">Beta privado</span></div>
      <p>Envie um bootanimation.zip para a fila privada. Nada será divulgado na galeria antes da moderação.</p>
      <form id="publish-form">
        <label for="publish-source">Origem do arquivo</label>
        <select id="publish-source" name="source">
          <option value="zip">ZIP existente</option>
          <option value="editor">Exportado pelo editor BAS</option>
          <option value="companion">Companion (dispositivo pareado)</option>
        </select>
        <p class="hint">O BAS pode enviar o último ZIP exportado diretamente para esta página após sua confirmação.</p>
        <label for="publish-file">Arquivo bootanimation.zip</label>
        <input id="publish-file" name="file" type="file" accept=".zip,application/zip" required>
        <p class="hint" id="publish-file-hint">Selecione um arquivo de até 20 MiB, com estrutura de boot animation válida.</p>
        <label for="publish-title">Título</label>
        <input id="publish-title" name="title" minlength="3" maxlength="100" required>
        <label for="publish-summary">Descrição</label>
        <textarea id="publish-summary" name="summary" rows="3" maxlength="1000"></textarea>
        <label for="publish-category">Categoria</label>
        <select id="publish-category" name="category">
          <option value="abstract">Abstrato</option>
          <option value="cosmos">Espaço</option>
          <option value="neon">Neon</option>
          <option value="pixel">Pixel</option>
          <option value="nature">Natureza</option>
          <option value="minimal">Minimalista</option>
        </select>
        <label for="publish-license">Licença</label>
        <select id="publish-license" name="license">
          <option value="CC-BY-4.0">CC BY 4.0</option>
          <option value="CC-BY-SA-4.0">CC BY-SA 4.0</option>
          <option value="CC0-1.0">CC0 (domínio público)</option>
          <option value="all-rights-reserved">Todos os direitos reservados</option>
        </select>
        <label for="publish-credit">Créditos do autor</label>
        <input id="publish-credit" name="author_credit" maxlength="120">
        <label class="checkline"><input id="publish-remix" type="checkbox"> Permitir adaptações e remixes</label>
        <label class="checkline"><input id="publish-rights" type="checkbox" required>
          Confirmo que tenho os direitos para compartilhar esta animação.</label>
        <div class="form-actions"><button type="submit" id="publish-submit" class="btn primary">
          Enviar para revisão privada</button></div>
      </form>
      <p id="publish-status" role="status" aria-live="polite"></p>
      <h3>Meus envios</h3>
      <ul id="publish-drafts" class="draft-list" aria-live="polite">
        <li>Carregando seus rascunhos...</li>
      </ul>
    </section>
    <section id="profile-edit" class="panel editor" hidden aria-label="Editar perfil">
      <div class="editor-header"><div><p class="eyebrow">PERSONALIZAÇÃO</p><h2>Editar perfil</h2></div>
        <button type="button" class="btn outline" id="cancel-edit">Voltar ao perfil</button></div>
      <form id="profile-form">
        <label for="handle">Identificador</label>
        <input id="handle" name="handle" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" autocomplete="off" required>
        <p class="hint">3 a 32 letras, números ou underscores.</p>
        <label for="display-name">Nome de exibição</label>
        <input id="display-name" name="display_name" maxlength="80" required>
        <label for="bio">Biografia</label>
        <textarea id="bio" name="bio" maxlength="500" rows="4"></textarea>
        <p class="hint">Até 500 caracteres. Conte um pouquinho sobre você!</p>
        <div class="photo-options">
          <button type="button" class="btn subtle" id="edit-avatar">✿ Trocar foto</button>
          <button type="button" class="btn subtle" id="edit-banner">▧ Trocar banner</button>
        </div>
        <div class="form-actions">
          <button type="button" class="btn outline" id="discard">Cancelar</button>
          <button type="submit" class="btn primary" id="save">Salvar alterações</button>
        </div>
      </form>
    </section>
  </section>
  <footer>Boot Animation Studio · P15.6 Beta privada · <a href="https://lumii55.github.io/boot_animation_studio/">Voltar ao BAS público</a></footer>
</main>
<input type="file" id="file-avatar" accept="image/png,image/jpeg,image/webp" hidden>
<input type="file" id="file-banner" accept="image/png,image/jpeg,image/webp" hidden>
<dialog id="crop-dialog" aria-labelledby="crop-title">
  <div class="crop-heading"><div><p class="eyebrow">AJUSTAR IMAGEM</p><h2 id="crop-title">Enquadrar foto</h2></div>
    <button type="button" class="btn outline" id="cancel-crop">Cancelar</button></div>
  <p>Arraste para posicionar, ajuste o zoom e confira o resultado antes de enviar.</p>
  <div id="crop-stage" class="crop-stage" tabindex="0" aria-label="Enquadramento da foto; arraste ou use as setas">
    <img id="crop-source" alt="" draggable="false">
    <div class="crop-guides" aria-hidden="true"></div>
  </div>
  <label class="zoom-label" for="crop-zoom">Zoom <output id="zoom-value">100%</output></label>
  <input id="crop-zoom" type="range" min="100" max="350" step="5" value="100">
  <div class="form-actions"><button type="button" class="btn outline" id="reset-crop">Centralizar</button>
    <button type="button" class="btn primary" id="apply-crop">Aplicar e salvar foto</button></div>
</dialog>
</body></html>`;
