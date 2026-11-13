// Studio app mode (phones): once a source is loaded, the Studio becomes a full-screen editor — top bar, preview,
// frame strip, a row of tools and one tool at a time in a sheet below. Nothing is rebuilt: the existing working
// pieces (preview, timeline, sources, stages, history and file buttons) are MOVED into the frame and put back exactly
// where they were when the mode ends (leaving the Studio, removing the source, or a wide screen). Tools switch only
// through their owners: the workspace view (edit / settings / export) and the existing edit-tool buttons.
(function () {
    'use strict';
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const byId = (id) => document.getElementById(id);
    const PHONE = window.matchMedia ? window.matchMedia('(max-width: 959px)') : { matches: false };
    const FRAME = ['studio-app-head', 'studio-app-stage', 'studio-app-strip', 'studio-app-tools', 'studio-app-sheet'];
    const EDIT_TOOL = { text: 'composition', audio: 'audio', parts: 'parts' };
    const TOOLS = ['media', 'markers', 'text', 'audio', 'parts', 'settings'];
    const moved = [];
    let active = false;
    let tool = 'markers';

    function text(key, fallback) {
        const lang = typeof idiomaAtual === 'string' ? idiomaAtual : 'en';
        const table = (typeof traducoes === 'object' && traducoes && (traducoes[lang] || traducoes.en)) || {};
        return table[key] || fallback;
    }

    function syncTexts() {
        const labels = {
            'studio-tool-media-label': text('studioToolMedia', 'Media'),
            'studio-tool-markers-label': text('studioToolMarkers', 'Sections'),
            'studio-tool-text-label': text('studioToolText', 'Text'),
            'studio-tool-audio-label': text('studioToolAudio', 'Audio'),
            'studio-tool-parts-label': text('studioToolParts', 'Parts'),
            'studio-tool-settings-label': text('studioToolSettings', 'Adjust'),
            'studio-app-export-label': text('studioExport', 'Export'),
        };
        Object.entries(labels).forEach(([id, value]) => { const el = byId(id); if (el) el.textContent = value; });
        const back = byId('studio-app-back');
        if (back) back.setAttribute('aria-label', text('btnHomeAria', 'Back to the start screen'));
        byId('studio-app-tools')?.setAttribute('aria-label', text('studioTools', 'Studio tools'));
    }

    // ------------------------------------------------------------------ moving the pieces

    function park(node, slot) {
        if (!node || !slot || !node.parentNode) return;
        const marker = document.createComment(`studio-app:${node.id || node.className}`);
        node.parentNode.insertBefore(marker, node);
        moved.push({ node, marker });
        slot.appendChild(node);
    }

    function restoreAll() {
        while (moved.length) {
            const { node, marker } = moved.pop();
            if (marker.parentNode) marker.parentNode.insertBefore(node, marker);
            marker.remove();
        }
    }

    function editor() {
        return byId('editor-section');
    }

    function shouldBeActive() {
        const ed = editor();
        return !!ed && PHONE.matches && ed.style.display === 'flex' && ed.classList.contains('has-media');
    }

    function refreshLayout() {
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            window.BASTimelineLayout?.refreshPadding?.();
        });
    }

    function enter() {
        active = true;
        FRAME.forEach((id) => { const el = byId(id); if (el) el.hidden = false; });
        park(document.querySelector('#editor-section .editor-context'), byId('studio-app-context-slot'));
        park(byId('p12-history-controls'), byId('studio-app-history-slot'));
        park(byId('video-container'), byId('studio-app-stage'));
        park(byId('timeline-editor'), byId('studio-app-strip'));
        park(byId('p12-project-file-actions'), byId('studio-app-files-slot'));
        park(byId('source-dock'), byId('studio-app-sheet'));
        park(document.querySelector('#editor-section .editor-grid'), byId('studio-app-sheet'));
        document.body.classList.add('ui-studio-app');
        selectTool(tool);
        refreshLayout();
    }

    function exit() {
        active = false;
        restoreAll();
        FRAME.forEach((id) => { const el = byId(id); if (el) el.hidden = true; });
        document.body.classList.remove('ui-studio-app');
        const ed = editor();
        if (ed) delete ed.dataset.studioTool;
        refreshLayout();
    }

    // ------------------------------------------------------------------ tools

    function selectTool(next) {
        if (next !== 'export' && !TOOLS.includes(next)) return;
        tool = next;
        const ed = editor();
        if (!ed) return;
        ed.dataset.studioTool = next;
        const view = next === 'settings' ? 'settings' : next === 'export' ? 'export' : 'edit';
        if (typeof setWorkspaceView === 'function' && ed.dataset.mobileView !== view) setWorkspaceView(view, { scroll: false });
        if (EDIT_TOOL[next]) document.querySelector(`.edit-tool-button[data-edit-tool="${EDIT_TOOL[next]}"]`)?.click();
        document.querySelectorAll('.studio-app-tool').forEach((button) => {
            if (button.dataset.studioTool === next) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
        });
        byId('studio-app-export')?.classList.toggle('is-active', next === 'export');
        const sheet = byId('studio-app-sheet');
        if (sheet) sheet.scrollTop = 0;
    }

    function sync() {
        const want = shouldBeActive();
        if (want && !active) enter();
        else if (!want && active) exit();
    }

    function bind() {
        const ed = editor();
        if (!ed || !byId('studio-app-head')) return;
        document.querySelectorAll('.studio-app-tool').forEach((button) => {
            button.addEventListener('click', () => selectTool(button.dataset.studioTool));
        });
        byId('studio-app-export')?.addEventListener('click', () => selectTool(tool === 'export' ? 'markers' : 'export'));
        byId('studio-app-back')?.addEventListener('click', () => window.BASModuleWorkspace?.returnToLaunch?.());
        new MutationObserver(sync).observe(ed, { attributes: true, attributeFilter: ['style', 'class'] });
        if (PHONE.addEventListener) PHONE.addEventListener('change', sync);
        window.addEventListener('bas:languagechange', syncTexts);
        syncTexts();
        sync();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();

    window.BASStudioShell = Object.freeze({ isActive: () => active, selectTool, currentTool: () => tool });
})();
