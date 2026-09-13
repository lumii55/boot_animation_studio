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

window.addEventListener('DOMContentLoaded', setupP11Panels);
