// Translation payloads are loaded synchronously from js/locales/*.js before this owner.
// Preserve the legacy lexical 'traducoes' binding and BASI18n facade for existing consumers.
const traducoes = window.BASLocalePayloads;
const BAS_SUPPORTED_LOCALES = Object.freeze(["en","pt","es","fr","de","it","ja","zh"]);
if (!traducoes || BAS_SUPPORTED_LOCALES.some(locale => !traducoes[locale])) {
    throw new Error('BAS locale payloads must load before i18n.js');
}

function basI18nTable(locale = idiomaAtual) {
    return traducoes[locale] || null;
}

function basI18nText(key, fallback = '', options = {}) {
    const table = basI18nTable(options.locale || idiomaAtual);
    if (table && table[key]) return table[key];
    if (options.englishFallback && traducoes.en && traducoes.en[key]) return traducoes.en[key];
    return fallback;
}

const BASI18nFacade = {};
Object.defineProperties(BASI18nFacade, {
    locale: { enumerable: true, get: () => idiomaAtual }
});
Object.assign(BASI18nFacade, {
    table: basI18nTable,
    current: () => basI18nTable(idiomaAtual),
    fallback: () => traducoes.en || null,
    text: basI18nText
});
window.BASI18n = Object.freeze(BASI18nFacade);

window.addEventListener('DOMContentLoaded', () => {
    let langDetectada = 'en';
    const idiomasSuportados = ['en', 'pt', 'es', 'fr', 'de', 'it', 'ja', 'zh'];
    try {
        const linguasNavegador = navigator.languages || [navigator.language || navigator.userLanguage];
        let idiomaSistema = null;
        if (window.Intl && Intl.DateTimeFormat) { idiomaSistema = Intl.DateTimeFormat().resolvedOptions().locale; }
        const todasPistas = [...linguasNavegador, idiomaSistema];
        for (let pista of todasPistas) {
            if (pista) {
                const base = pista.split('-')[0];
                if (idiomasSuportados.includes(base)) {
                    langDetectada = base;
                    if (base !== 'en') break; 
                }
            }
        }
    } catch (e) { langDetectada = 'en'; }
    
    idiomaAtual = langDetectada;
    document.getElementById('select-idioma').value = idiomaAtual;
    mudarIdioma(idiomaAtual);
});

function mudarIdioma(lang) {
    idiomaAtual = lang;
    const t = traducoes[lang];

    document.getElementById('txt-titulo').textContent = t.titulo;
    document.getElementById('txt-subtitulo').textContent = t.subtitulo;
    document.getElementById('select-idioma')?.setAttribute('aria-label', t.languageSelectAria);
    document.getElementById('input-ip')?.setAttribute('aria-label', t.networkIpAria);
    const workspaceTextBindings = {
        'p11-launch-kicker': 'workspaceLaunchKicker',
        'p11-launch-title': 'workspaceLaunchTitle',
        'p11-launch-desc': 'workspaceLaunchDesc',
        'p11-launch-privacy': 'workspaceLaunchPrivacy',
        'p11-launch-local-desc': 'workspaceLaunchLocalDesc',
        'p11-launch-device-desc': 'workspaceLaunchDeviceDesc',
        'p11-device-kicker': 'deviceKicker',
        'p11-device-desc': 'deviceDesc',
        'p11-device-badge': 'deviceOnlineBadge',
        'p11-device-actions-label': 'deviceActionsLabel',
        'p11-history-kicker': 'historyKicker',
        'p11-release-kicker': 'releaseKicker',
        'p11-release-title': 'releaseTitle',
        'p11-release-desc': 'releaseDesc',
        'p11-release-resolution-label': 'releaseResolutionLabel',
        'p11-release-fps-label': 'releaseFpsLabel',
        'p11-release-structure-label': 'releaseStructureLabel',
        'p11-release-audio-label': 'releaseAudioLabel',
        'p11-delivery-kicker': 'deliveryKicker',
        'p11-delivery-title': 'deliveryTitle',
        'p11-delivery-desc': 'deliveryDesc',
        'p11-delivery-download-title': 'deliveryDownloadTitle',
        'p11-delivery-download-desc': 'deliveryDownloadDesc',
        'p11-delivery-phone-title': 'deliveryPhoneTitle',
        'p11-delivery-phone-desc': 'deliveryPhoneDesc',
        'p11-build-secondary-label': 'buildSecondaryLabel',
        'p11-editor-kicker': 'workspaceEditorKicker',
        'p11-source-kicker': 'workspaceSourceKicker',
        'p11-source-title': 'workspaceSourceTitle',
        'p11-source-desc': 'workspaceSourceDesc',
        'p11-edit-kicker': 'workspaceEditKicker',
        'p11-edit-title': 'workspaceEditTitle',
        'p11-edit-desc': 'workspaceEditDesc',
        'p11-empty-title': 'workspaceEmptyTitle',
        'p11-empty-desc': 'workspaceEmptyDesc',
        'p11-tune-kicker': 'workspaceTuneKicker',
        'p11-tune-title': 'workspaceTuneTitle',
        'p11-tune-desc': 'workspaceTuneDesc',
        'p11-build-kicker': 'workspaceBuildKicker',
        'p11-build-title': 'workspaceBuildTitle',
        'p11-build-desc': 'workspaceBuildDesc',
        'p11-build-ready-title': 'workspaceBuildReadyTitle',
        'p11-build-ready-desc': 'workspaceBuildReadyDesc',
        'p11-nav-edit': 'workspaceNavEdit',
        'p11-nav-tune': 'workspaceNavTune',
        'p11-nav-build': 'workspaceNavBuild',
        'p11-next-tune': 'workspaceNextTune',
        'p11-next-build': 'workspaceNextBuild',
        'p11-back-edit': 'workspaceBackEdit',
        'p11-back-tune': 'workspaceBackTune',
        'build-package-kicker': 'buildPackageKicker',
        'build-package-title': 'buildPackageTitle',
        'build-package-desc': 'buildPackageDesc',
        'build-package-module-hint': 'buildPackageModuleHint',
        'build-package-note': 'buildPackageNote',
        'finish-kicker': 'finishKicker',
        'finish-file-label': 'finishFileLabel',
        'finish-size-label': 'finishSizeLabel',
        'finish-output-label': 'finishOutputLabel',
        'finish-package-label': 'finishPackageLabel',
        'finish-delivery-label': 'finishDeliveryLabel',
        'finish-stale': 'finishStaleNote',
        'finish-save-project-label': 'finishSaveProject',
        'finish-open-history-label': 'finishOpenHistory',
        'finish-build-again-label': 'finishBuildAgain'
    };
    Object.entries(workspaceTextBindings).forEach(([id, key]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = t[key];
    });
    window.BASFinishCenter?.sync?.();
    document.getElementById('txt-dicas-titulo').innerHTML = t.dicasTitulo;
    document.getElementById('txt-dica-modulo-prefix').textContent = t.dicaModuloPrefix;
    document.getElementById('txt-dica-modulo-text').textContent = t.dicaModuloText;
    document.getElementById('txt-dica-modulo-link').textContent = t.dicaModuloLink;
    document.getElementById('txt-dica1').innerHTML = `<strong>${t.dica1.split(': ')[0]}:</strong> ${t.dica1.split(': ')[1]}`;
    document.getElementById('txt-dica2').innerHTML = `<strong>${t.dica2.split(': ')[0]}:</strong> ${t.dica2.split(': ')[1]}`;
    document.getElementById('txt-dica3').innerHTML = `<strong>${t.dica3.split(': ')[0]}:</strong> ${t.dica3.split(': ')[1]}`;
    document.getElementById('lbl-upload').textContent = t.upload;
    document.getElementById('lbl-upload-zip').textContent = t.uploadZip;
    document.getElementById('lbl-upload-direto').textContent = t.btnInjectZip;
    document.getElementById('btn-pull').textContent = t.btnPull;
    document.getElementById('lbl-modal-pull-title').textContent = t.modalPullTitle;
    document.getElementById('lbl-modal-pull-desc').textContent = t.modalPullDesc;
    document.getElementById('btn-pull-module').textContent = t.btnPullModule;
    document.getElementById('btn-pull-system').textContent = t.btnPullSystem;
    document.getElementById('btn-pull-cancel').textContent = t.btnPullCancel;
    document.getElementById('lbl-modal-net-title').textContent = t.modalNetTitle;
    document.getElementById('lbl-modal-net-desc').textContent = t.modalNetDesc;
    document.getElementById('btn-connect-ip').textContent = t.btnConnectIp;
    document.getElementById('btn-cancel-net').textContent = t.btnPullCancel;
    document.getElementById('lbl-network-other').textContent = t.pairOther;
    document.getElementById('btn-baixar-video').textContent = t.btnDownloadVideo;
    document.getElementById('btn-baixar-zip').textContent = t.btnDownloadZip;
    document.getElementById('txt-dicavideo').textContent = t.dicaVideo;
    const resetFocusButton = document.getElementById('btn-reset-focus');
    if (resetFocusButton) {
        resetFocusButton.setAttribute('aria-label', t.focusReset);
        resetFocusButton.title = t.focusReset;
    }
    window.BASTimelineFraming?.refreshPreview?.();
    window.BASTimelineControls?.updateTimeReadout?.();
    window.BASTimelineControls?.syncEditorUi?.();
    document.getElementById('lbl-m0').textContent = t.m0;
    document.getElementById('lbl-m1').textContent = t.m1;
    document.getElementById('lbl-m2').textContent = t.m2;
    document.getElementById('lbl-m3').textContent = t.m3;
    document.getElementById('txt-hint-tooltip').textContent = t.hintTooltip;
    document.getElementById('lbl-fabricante').textContent = t.lblFabricante;
    document.getElementById('opt-standard').textContent = t.optStandard;
    document.getElementById('opt-miui').textContent = t.optMiui;
    document.getElementById('opt-mtk').textContent = t.optMtk;
    document.getElementById('opt-motorola').textContent = t.optMotorola;
    document.getElementById('opt-emui').textContent = t.optEmui;
    document.getElementById('lbl-gerarmodulo').textContent = t.lblGerarModulo;
    document.getElementById('lbl-nome').textContent = t.lblNome;
    document.getElementById('lbl-formato').textContent = t.lblFormato;
    const jpegQualityLabel = document.getElementById('lbl-jpeg-quality');
    const jpegQualityHint = document.getElementById('jpeg-quality-hint');
    if (jpegQualityLabel) jpegQualityLabel.textContent = t.lblJpegQuality;
    if (jpegQualityHint) jpegQualityHint.textContent = t.jpegQualityHint;
    document.getElementById('lbl-qualidade').textContent = t.lblQualidade;
    document.getElementById('lbl-enquadramento').textContent = t.lblEnquadramento;
    document.getElementById('opt-cover').textContent = t.optCover;
    document.getElementById('opt-contain').textContent = t.optContain;
    document.getElementById('opt-stretch').textContent = t.optStretch;
    document.getElementById('lbl-fps').textContent = t.lblFps;
    document.getElementById('lbl-largura').textContent = t.lblLargura;
    document.getElementById('lbl-altura').textContent = t.lblAltura;
    document.getElementById('lbl-perf-title').textContent = t.perfTitle;
    document.getElementById('lbl-perf-frames').textContent = t.perfFrames;
    document.getElementById('lbl-perf-process').textContent = t.perfProcess;
    document.getElementById('lbl-perf-boot-size').textContent = t.perfBootSize;
    document.getElementById('lbl-perf-size').textContent = t.perfSize;
    document.getElementById('lbl-perf-memory').textContent = t.perfMemory;
    document.getElementById('opt-jpeg').textContent = t.optJpeg;
    document.getElementById('opt-png').textContent = t.optPng;
    document.getElementById('opt-320').textContent = t.opt320;
    document.getElementById('opt-480').textContent = t.opt480;
    document.getElementById('opt-720').textContent = t.opt720;
    document.getElementById('opt-orig').textContent = t.optOrig;
    document.getElementById('opt-custom').textContent = t.optCustom;
    document.getElementById('lbl-modal-titulo').textContent = t.modalTitulo;
    document.getElementById('btn-fechar-modal').textContent = t.btnFechar;
    document.getElementById('txt-loading-timeline').textContent = t.carregandoTimeline;
    document.getElementById('lbl-usar-som').textContent = t.lblUsarSom;
    document.getElementById('lbl-audio-intro').textContent = t.lblAudioIntro;
    document.getElementById('lbl-audio-loop').textContent = t.lblAudioLoop;
    document.getElementById('lbl-audio-final').textContent = t.lblAudioFinal;
    
    document.getElementById('btn-connect').textContent = t.btnConnect;
    document.getElementById('btn-manual').textContent = t.btnManual;
    document.getElementById('btn-build-connect').textContent = t.deliveryConnect;
    document.getElementById('status-connected').textContent = isConnectedMode && window.connectedPhoneModel ? window.connectedPhoneModel : t.statusConnected;
    document.getElementById('btn-remove').textContent = t.btnRemove;
    document.getElementById('btn-reset').textContent = t.btnResetModule;
    document.getElementById('btn-disconnect').textContent = t.btnDisconnect;

    document.getElementById('lbl-history').textContent = t.lblHistory;
    document.getElementById('lbl-hist-footer').textContent = t.lblHistFooter;

    document.getElementById('btn-ver-preview').textContent = t.btnVerPreview;
    document.getElementById('lbl-modal-escolha-title').textContent = t.modalEscolhaTitle;
    document.getElementById('lbl-modal-escolha-desc').textContent = t.modalEscolhaDesc;
    document.getElementById('btn-web').textContent = t.btnWeb;
    document.getElementById('btn-phone').textContent = t.btnPhone;
    document.getElementById('btn-cancel-preview').textContent = t.btnPullCancel;
    document.getElementById('confirm-title').textContent = t.confirmTitle;
    document.getElementById('confirm-cancel').textContent = t.confirmCancel;
    document.getElementById('confirm-accept').textContent = t.confirmYes;

    ['intro', 'loop', 'final'].forEach(part => {
        const optNone = document.getElementById(`opt-none-${part}`);
        const optVid = document.getElementById(`opt-vid-${part}`);
        const optFile = document.getElementById(`opt-file-${part}`);
        if(optNone.textContent !== optNone.getAttribute('data-custom')) optNone.textContent = t.optNone;
        if(optVid.textContent !== optVid.getAttribute('data-custom')) optVid.textContent = t.optVid;
        if(optFile.textContent !== optFile.getAttribute('data-custom')) optFile.textContent = t.optFile;
        document.getElementById(`audio-advanced-summary-${part}`).textContent = t.audioAdvanced;
        document.getElementById(`lbl-fade-in-${part}`).textContent = t.audioFadeIn;
        document.getElementById(`lbl-fade-out-${part}`).textContent = t.audioFadeOut;
        document.getElementById(`lbl-delay-${part}`).textContent = t.audioDelay;
        document.getElementById(`lbl-source-in-${part}`).textContent = t.audioSourceIn;
        document.getElementById(`lbl-end-trim-${part}`).textContent = t.audioEndTrim;
        document.getElementById(`audio-studio-timing-kicker-${part}`).textContent = t.audioStudioTimingKicker;
        document.getElementById(`audio-studio-timing-help-${part}`).textContent = t.audioTimingHint;
        const waveformKicker = document.getElementById(`audio-studio-waveform-kicker-${part}`);
        const waveformTitle = document.getElementById(`audio-studio-waveform-title-${part}`);
        const waveformHint = document.getElementById(`audio-studio-waveform-hint-${part}`);
        const waveformZoomOut = document.getElementById(`audio-studio-waveform-zoom-out-${part}`);
        const waveformZoomIn = document.getElementById(`audio-studio-waveform-zoom-in-${part}`);
        const waveformFit = document.getElementById(`audio-studio-waveform-fit-${part}`);
        const waveformCanvas = document.getElementById(`audio-studio-waveform-${part}`);
        if (waveformKicker) waveformKicker.textContent = t.audioWaveformKicker;
        if (waveformTitle) waveformTitle.textContent = t.audioWaveformTitle;
        if (waveformHint) waveformHint.textContent = t.audioWaveformHint;
        if (waveformZoomOut) waveformZoomOut.setAttribute('aria-label', t.audioWaveformZoomOut);
        if (waveformZoomIn) waveformZoomIn.setAttribute('aria-label', t.audioWaveformZoomIn);
        if (waveformFit) waveformFit.textContent = t.audioWaveformFit;
        if (waveformCanvas) waveformCanvas.setAttribute('aria-label', t.audioWaveformTitle);
        window.BASAudioStudio?.syncControlsText?.(part);
        window.BASAudioStudio?.syncProcessingText?.(part);
        window.BASAudioStudio?.syncExportText?.(part);
        window.BASAudioStudio?.refreshExportCompatibility?.(part)?.catch(() => {});
        window.BASAudioStudio?.renderWaveformMarkers?.(part);
        const transportButton = document.getElementById(`audio-studio-preview-${part}`);
        if (transportButton) transportButton.setAttribute('aria-label', t.audioStudioPlay);
        const transportProgress = document.getElementById(`audio-studio-progress-${part}`);
        if (transportProgress) transportProgress.setAttribute('aria-label', t.audioStudioProgress);
        document.getElementById(`lbl-normalize-${part}`).textContent = t.audioNormalize;
        window.BASMediaAudio?.syncAdvancedLabels?.(part);
        window.BASMediaAudio?.syncAdvancedVisibility?.(part);
    });
    window.BASParts?.syncUi?.();
    if (window.BASParts?.isActive?.()) window.BASParts?.renderEditor?.();
    window.BASTimelineControls.refreshBuildControls();
    window.BASUX?.updateOutputIntent?.();
    window.BASPerformance?.syncOptimizerText?.();
    window.BASPerformance?.syncQuality?.();
    window.BASPerformance?.scheduleEstimate?.();
    window.BASWorkspace?.sync?.();
    window.BASContextual?.syncText?.();
    window.BASContextual?.syncFramingToolUi?.();
    window.BASRelease?.sync?.();
    window.BASLoadingTips?.syncText?.();
    window.BASProjectEngine?.syncUi?.();
    window.BASAutosave?.syncUiText?.();
    window.BASProjectFile?.syncText?.();
    window.BASPWA?.syncText?.();
    window.BASProjectHistory?.syncUi?.();
    window.BASSourceLibrary?.syncText?.();
    window.BASMasterSequence?.syncText?.();
    window.BASTimeline3?.syncText?.();
    window.BASComposition?.syncText?.();
    window.BASCompatibility?.syncText?.();
    window.BASOutputPresets?.syncText?.();
    window.BASCustomProfiles?.syncText?.();
    if (window.BASDeviceProfile?.syncText) window.BASDeviceProfile.sync();
    if (window.BASDeviceIntelligence?.sync) window.BASDeviceIntelligence.sync();
    window.BASHelp?.syncText?.();
    window.BASModuleWorkspace?.syncText?.();
    window.BASMultiDevice?.syncText?.();
    window.BASModuleTest?.sync?.();
    if (window.BASPlaylist?.syncText) window.BASPlaylist.syncText();
    if (window.BASPlaylist?.render) window.BASPlaylist.render();
    if (window.BASRotation?.syncText) window.BASRotation.syncText();
    if (window.BASBootQueue?.sync) window.BASBootQueue.sync();
    if (window.BASBootActivity?.sync) window.BASBootActivity.sync();
    if (window.BASHealthCenter?.syncText) window.BASHealthCenter.syncText();
    if (window.BASPresence?.syncText) window.BASPresence.syncText();
    if (window.BASPathResilience?.sync) window.BASPathResilience.sync();
    if (window.BASDeveloperLab?.syncText) window.BASDeveloperLab.syncText();
}



