const loadingTipsState = {
    context: 'general',
    order: [],
    position: 0,
    active: false,
    revealTimer: null,
    rotateTimer: null,
    swapTimer: null,
    lastTip: null
};

const loadingTipsContexts = {
    general: [1, 2, 3, 4, 5, 7, 10, 11, 12, 16, 17],
    source: [1, 3, 5, 6, 7, 10, 16, 17],
    timeline: [7, 8, 9, 10, 11, 16],
    zip: [1, 3, 4, 11, 12, 13, 17],
    device: [2, 12, 13, 14, 15, 18]
};

function loadingTipsTranslation() {
    try {
        return traducoes[idiomaAtual] || traducoes.en;
    } catch (error) {
        return {};
    }
}

function loadingTipsShuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    if (result.length > 1 && result[0] === loadingTipsState.lastTip) {
        [result[0], result[1]] = [result[1], result[0]];
    }
    return result;
}

function loadingTipsSplit(text) {
    const index = text.indexOf(':');
    if (index < 0) return { title: text, body: '' };
    return {
        title: text.slice(0, index).trim(),
        body: text.slice(index + 1).trim()
    };
}

function loadingTipsCurrentIds() {
    return loadingTipsContexts[loadingTipsState.context] || loadingTipsContexts.general;
}

function renderLoadingTip(tipId, animate = true) {
    const panel = document.getElementById('loading-tip-panel');
    const label = document.getElementById('loading-tip-label');
    const counter = document.getElementById('loading-tip-counter');
    const title = document.getElementById('loading-tip-title');
    const body = document.getElementById('loading-tip-text');
    const progress = document.getElementById('loading-tip-progress');
    if (!panel || !label || !counter || !title || !body || !progress) return;
    const t = loadingTipsTranslation();
    const text = t[`loadingTip${tipId}`] || '';
    if (!text) return;
    const parts = loadingTipsSplit(text);
    const apply = () => {
        label.textContent = t.loadingTipLabel || 'TIP';
        counter.textContent = `${loadingTipsState.position + 1}/${loadingTipsState.order.length}`;
        title.textContent = parts.title;
        body.textContent = parts.body;
        progress.style.animation = 'none';
        void progress.offsetWidth;
        progress.style.animation = '';
        panel.hidden = false;
        panel.classList.remove('is-changing');
        panel.classList.add('is-visible');
        loadingTipsState.lastTip = tipId;
    };
    clearTimeout(loadingTipsState.swapTimer);
    if (animate && panel.classList.contains('is-visible')) {
        panel.classList.add('is-changing');
        loadingTipsState.swapTimer = setTimeout(apply, 170);
    } else {
        apply();
    }
}

function advanceLoadingTip() {
    if (!loadingTipsState.active || loadingTipsState.order.length === 0) return;
    loadingTipsState.position = (loadingTipsState.position + 1) % loadingTipsState.order.length;
    if (loadingTipsState.position === 0) {
        loadingTipsState.order = loadingTipsShuffle(loadingTipsCurrentIds());
    }
    renderLoadingTip(loadingTipsState.order[loadingTipsState.position]);
}

function stopLoadingTips() {
    loadingTipsState.active = false;
    clearTimeout(loadingTipsState.revealTimer);
    clearTimeout(loadingTipsState.swapTimer);
    clearInterval(loadingTipsState.rotateTimer);
    loadingTipsState.revealTimer = null;
    loadingTipsState.rotateTimer = null;
    const panel = document.getElementById('loading-tip-panel');
    if (panel) {
        panel.classList.remove('is-visible', 'is-changing');
        panel.hidden = true;
    }
}

function startLoadingTips() {
    stopLoadingTips();
    loadingTipsState.active = true;
    loadingTipsState.order = loadingTipsShuffle(loadingTipsCurrentIds());
    loadingTipsState.position = 0;
    loadingTipsState.revealTimer = setTimeout(() => {
        if (!loadingTipsState.active || loadingTipsState.order.length === 0) return;
        renderLoadingTip(loadingTipsState.order[0], false);
        loadingTipsState.rotateTimer = setInterval(advanceLoadingTip, 4500);
    }, 650);
}

function setLoadingTipContext(context) {
    loadingTipsState.context = loadingTipsContexts[context] ? context : 'general';
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.dataset.tipContext = loadingTipsState.context;
    if (loadingTipsState.active) startLoadingTips();
}

function syncLoadingTipText() {
    if (!loadingTipsState.active || loadingTipsState.order.length === 0) return;
    renderLoadingTip(loadingTipsState.order[loadingTipsState.position], false);
}

function bindLoadingTips() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const sync = () => {
        const visible = overlay.style.display === 'flex' || getComputedStyle(overlay).display !== 'none';
        if (visible && !loadingTipsState.active) {
            loadingTipsState.context = loadingTipsContexts[overlay.dataset.tipContext] ? overlay.dataset.tipContext : loadingTipsState.context;
            startLoadingTips();
        } else if (!visible && loadingTipsState.active) {
            stopLoadingTips();
        }
    };
    new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['style', 'class'] });
    sync();
}

window.setLoadingTipContext = setLoadingTipContext;
window.syncLoadingTipText = syncLoadingTipText;
window.addEventListener('DOMContentLoaded', bindLoadingTips);
