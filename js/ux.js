let confirmResolver = null;
let toastSequence = 0;

function formatUxBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function showToast(message, type = 'info', duration = 3400) {
    const container = document.getElementById('toast-container');
    if (!container || !message) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.type = type;
    toast.dataset.toastId = String(++toastSequence);
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

function askConfirmation(message, danger = false) {
    const t = traducoes[idiomaAtual];
    const modal = document.getElementById('modal-confirm');
    const accept = document.getElementById('confirm-accept');
    document.getElementById('confirm-title').textContent = t.confirmTitle;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-cancel').textContent = t.confirmCancel;
    accept.textContent = t.confirmYes;
    accept.dataset.danger = danger ? 'true' : 'false';
    modal.style.display = 'flex';
    requestAnimationFrame(() => accept.focus());
    return new Promise(resolve => { confirmResolver = resolve; });
}

function closeConfirmation(result) {
    document.getElementById('modal-confirm').style.display = 'none';
    if (confirmResolver) {
        const resolve = confirmResolver;
        confirmResolver = null;
        resolve(result);
    }
}

function getGenerateReadyLabel(t) {
    if (isConnectedMode) return t.btnGenerateApply;
    const generateModule = document.getElementById('input-gerar-modulo').checked;
    return generateModule ? t.btnGenerateModule : t.btnGenerateDownload;
}

function updateOutputIntent() {
    const el = document.getElementById('output-intent');
    if (!el) return;
    const hasMedia = document.getElementById('video-container').style.display === 'block';
    if (!hasMedia) { el.style.display = 'none'; return; }
    const t = traducoes[idiomaAtual];
    if (isConnectedMode) {
        const historyAvailable = typeof hasModuleFeature !== 'function' || hasModuleFeature('history');
        el.textContent = historyAvailable ? t.outputIntentPhone : t.outputIntentPhoneSimple;
    }
    else if (document.getElementById('input-gerar-modulo').checked) el.textContent = t.outputIntentModule;
    else el.textContent = t.outputIntentDownload;
    el.style.display = 'block';
}

function generationSuccessText(result, t) {
    const size = formatUxBytes(result.outputBytes);
    if (result.kind === 'installed') return t.successApplied.replace('{size}', size);
    if (result.kind === 'module') return t.successModule.replace('{size}', size);
    return t.successDownload.replace('{size}', size);
}

function friendlyExportError(error, t) {
    const name = String(error && error.name || '').toLowerCase();
    const message = String(error && error.message || '').toLowerCase();
    if (name.includes('quota') || message.includes('memory') || message.includes('allocation') || message.includes('out of memory')) return t.errorExportMemory;
    if (name.includes('notsupported') || message.includes('codec') || message.includes('mediarecorder') || message.includes('decode')) return t.errorExportMedia;
    if (message.includes('upload failed') || message.includes('failed to fetch') || message.includes('network')) return t.errorExportConnection;
    return t.errorExportGeneric;
}

document.getElementById('confirm-cancel').addEventListener('click', () => closeConfirmation(false));
document.getElementById('confirm-accept').addEventListener('click', () => closeConfirmation(true));
document.getElementById('modal-confirm').addEventListener('click', event => { if (event.target.id === 'modal-confirm') closeConfirmation(false); });

document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById('modal-confirm').style.display === 'flex') closeConfirmation(false); });
