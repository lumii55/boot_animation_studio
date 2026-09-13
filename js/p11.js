function p11SelectedText(id) {
    const element = document.getElementById(id);
    if (!element || element.selectedIndex < 0) return '';
    return element.options[element.selectedIndex]?.textContent?.trim() || '';
}

function p11DimensionsText() {
    const width = Number(document.getElementById('input-largura')?.value || 0);
    const height = Number(document.getElementById('input-altura')?.value || 0);
    if (width > 0 && height > 0) return `${Math.round(width)}×${Math.round(height)}`;
    return p11SelectedText('input-qualidade');
}

function updateP11CustomSizeVisibility() {
    const grid = document.getElementById('p11-custom-size-grid');
    const resolution = document.getElementById('input-qualidade');
    if (!grid || !resolution) return;
    grid.hidden = resolution.value !== 'custom';
}

function updateP11PanelMeta() {
    const t = traducoes?.[idiomaAtual] || traducoes?.en;
    if (!t) return;
    const visualMeta = document.getElementById('p11-visual-meta');
    const audioMeta = document.getElementById('p11-audio-meta');
    const outputMeta = document.getElementById('p11-output-meta');
    const visualSection = document.getElementById('p11-visual-section');
    const audioSection = document.getElementById('p11-audio-section');
    const outputSection = document.getElementById('p11-output-section');
    const fps = Math.max(1, Math.round(Number(document.getElementById('input-fps')?.value || 0)));
    const format = String(document.getElementById('input-formato')?.value || '').toUpperCase();
    if (visualMeta) visualMeta.textContent = `${p11DimensionsText()} · ${fps} FPS · ${format}`;
    const audioEnabled = !!document.getElementById('input-usar-som')?.checked;
    if (audioMeta) audioMeta.textContent = audioEnabled ? t.p11AudioOn : t.p11AudioOff;
    if (audioSection) audioSection.classList.toggle('p11-section-active', audioEnabled);
    const fileName = String(document.getElementById('input-nome')?.value || 'bootanimation').trim() || 'bootanimation';
    const size = document.getElementById('perf-size')?.textContent?.trim();
    if (outputMeta) outputMeta.textContent = `${fileName}.zip · ${size && size !== '—' ? size : t.p11OutputPreparing}`;
    const ready = size && size !== '—';
    if (outputSection) outputSection.classList.toggle('p11-section-active', !!ready);
    if (visualSection) visualSection.classList.toggle('p11-section-active', !!p11DimensionsText());
    updateP11CustomSizeVisibility();
}

function syncP11UiText() {
    const t = traducoes?.[idiomaAtual] || traducoes?.en;
    if (!t) return;
    const visualTitle = document.getElementById('p11-visual-title');
    const audioTitle = document.getElementById('p11-audio-title');
    const outputTitle = document.getElementById('p11-output-title');
    if (visualTitle) visualTitle.textContent = t.p11VisualTitle;
    if (audioTitle) audioTitle.textContent = t.p11AudioTitle;
    if (outputTitle) outputTitle.textContent = t.p11OutputTitle;
    const textMap = {
        'p11-preview-kicker': t.p11PreviewKicker,
        'p11-preview-title': t.p11PreviewTitle,
        'p11-framing-open-label': t.p11AdjustFraming,
        'p11-framing-title': t.p11FramingTitle,
        'p11-framing-hint': t.p11FramingHint,
        'p11-framing-done': t.p11FramingDone,
        'p11-framing-cover': t.p11FramingCover,
        'p11-framing-contain': t.p11FramingContain,
        'p11-framing-stretch': t.p11FramingStretch,
        'p11-timeline-title': t.p11TimelineTitle,
        'p11-timeline-hint': t.p11TimelineHint,
        'p11-marker-title': t.p11MarkerTitle,
        'p11-marker-hint': t.p11MarkerHint
    };
    Object.entries(textMap).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && value) element.textContent = value;
    });
    updateP11PlaybackButton();
    updateP11PanelMeta();
}

function setupP11Panels() {
    const sections = Array.from(document.querySelectorAll('.p11-control-section'));
    if (window.innerWidth > 900) sections.forEach(section => { section.open = true; });
    sections.forEach(section => {
        section.addEventListener('toggle', () => {
            if (!section.open || window.innerWidth > 720) return;
            sections.forEach(other => {
                if (other !== section) other.open = false;
            });
        });
    });
    const watched = [
        'input-enquadramento',
        'input-qualidade',
        'input-fps',
        'input-formato',
        'input-largura',
        'input-altura',
        'input-usar-som',
        'input-nome',
        'input-gerar-modulo',
        'sel-audio-intro',
        'sel-audio-loop',
        'sel-audio-final'
    ];
    watched.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        const sync = () => requestAnimationFrame(updateP11PanelMeta);
        element.addEventListener('input', sync);
        element.addEventListener('change', sync);
    });
    const perfSize = document.getElementById('perf-size');
    if (perfSize) new MutationObserver(updateP11PanelMeta).observe(perfSize, { childList: true, characterData: true, subtree: true });
    syncP11UiText();
}

window.addEventListener('DOMContentLoaded', () => { setupP11Panels(); setupP11EditorWorkspace(); });

function updateP11PlaybackButton() {
    const button = document.getElementById('p11-play-toggle');
    const icon = document.getElementById('p11-play-icon');
    const label = document.getElementById('p11-play-label');
    if (!button || !icon || !label || !playerVideo) return;
    const t = traducoes?.[idiomaAtual] || traducoes?.en;
    const playing = !playerVideo.paused && !playerVideo.ended;
    icon.textContent = playing ? 'Ⅱ' : '▶';
    label.textContent = playing ? t.p11Pause : t.p11Play;
    button.setAttribute('aria-label', playing ? t.p11Pause : t.p11Play);
    button.classList.toggle('is-playing', playing);
}

function syncP11TimelineReadout() {
    const readout = document.getElementById('p11-timeline-readout');
    const current = document.getElementById('video-current-time');
    const total = document.getElementById('video-total-time');
    if (!readout || !current || !total) return;
    readout.textContent = `${current.textContent || '0.00s'} / ${total.textContent || '0.00s'}`;
}

function syncP11FramingModeButtons() {
    const select = document.getElementById('input-enquadramento');
    if (!select) return;
    document.querySelectorAll('.p11-framing-mode').forEach(button => {
        const active = button.dataset.framingMode === select.value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function setP11FramingSession(active) {
    const container = document.getElementById('video-container');
    const session = document.getElementById('p11-framing-session');
    if (!container || !session) return;
    container.classList.toggle('p11-framing-active', active);
    document.body.classList.toggle('p11-framing-session-active', active);
    session.setAttribute('aria-hidden', active ? 'false' : 'true');
    syncP11FramingModeButtons();
    if (typeof atualizarPreviewEnquadramento === 'function') requestAnimationFrame(atualizarPreviewEnquadramento);
    if (active && window.innerWidth <= 640) requestAnimationFrame(() => container.scrollTo({ top: 0, behavior: 'auto' }));
}

function setupP11EditorWorkspace() {
    const playButton = document.getElementById('p11-play-toggle');
    const framingOpen = document.getElementById('p11-framing-open');
    const framingDone = document.getElementById('p11-framing-done');
    const framingSelect = document.getElementById('input-enquadramento');
    if (playButton) {
        playButton.addEventListener('click', () => {
            if (isGenerating || isBuildingTimeline || !playerVideo.src) return;
            if (playerVideo.paused) playerVideo.play().catch(() => {});
            else playerVideo.pause();
        });
    }
    if (framingOpen) framingOpen.addEventListener('click', () => setP11FramingSession(true));
    if (framingDone) framingDone.addEventListener('click', () => setP11FramingSession(false));
    document.querySelectorAll('.p11-framing-mode').forEach(button => {
        button.addEventListener('click', () => {
            if (!framingSelect) return;
            framingSelect.value = button.dataset.framingMode;
            framingSelect.dispatchEvent(new Event('change', { bubbles: true }));
            syncP11FramingModeButtons();
        });
    });
    if (framingSelect) framingSelect.addEventListener('change', syncP11FramingModeButtons);
    playerVideo.addEventListener('play', updateP11PlaybackButton);
    playerVideo.addEventListener('pause', updateP11PlaybackButton);
    playerVideo.addEventListener('ended', updateP11PlaybackButton);
    playerVideo.addEventListener('emptied', () => setP11FramingSession(false));
    playerVideo.addEventListener('loadedmetadata', () => {
        updateP11PlaybackButton();
        syncP11TimelineReadout();
    });
    playerVideo.addEventListener('timeupdate', syncP11TimelineReadout);
    playerVideo.addEventListener('durationchange', syncP11TimelineReadout);
    const current = document.getElementById('video-current-time');
    const total = document.getElementById('video-total-time');
    const observer = new MutationObserver(syncP11TimelineReadout);
    if (current) observer.observe(current, { childList: true, characterData: true, subtree: true });
    if (total) observer.observe(total, { childList: true, characterData: true, subtree: true });
    const markerGrid = document.getElementById('grid-marcadores');
    const markerHead = document.getElementById('p11-marker-head');
    const syncMarkerHead = () => {
        if (!markerGrid || !markerHead) return;
        markerHead.style.display = markerGrid.style.display === 'grid' ? 'flex' : 'none';
    };
    if (markerGrid) new MutationObserver(syncMarkerHead).observe(markerGrid, { attributes: true, attributeFilter: ['style'] });
    syncMarkerHead();
    syncP11FramingModeButtons();
    updateP11PlaybackButton();
    syncP11TimelineReadout();
}

