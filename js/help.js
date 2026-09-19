const basHelpRuntime = {
    modal: null,
    tour: null,
    currentStep: 0,
    steps: [],
    target: null,
    previousFocus: null,
    firstRunKey: 'bas-help-intro-v1'
};

function helpText(key, fallback) {
    try {
        return traducoes?.[idiomaAtual]?.[key] || fallback;
    } catch (e) {
        return fallback;
    }
}

function helpElementVisible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function markHelpIntroSeen() {
    try {
        localStorage.setItem(basHelpRuntime.firstRunKey, '1');
    } catch (e) {}
}

function helpIntroWasSeen() {
    try {
        return localStorage.getItem(basHelpRuntime.firstRunKey) === '1';
    } catch (e) {
        return true;
    }
}

async function shouldAutoOpenHelp() {
    if (helpIntroWasSeen()) return false;
    try {
        if (localStorage.getItem('bootstudio_last_phone_ip') || localStorage.getItem('boot-animation-studio-custom-profiles-v1')) {
            markHelpIntroSeen();
            return false;
        }
    } catch (e) {}
    try {
        if (window.BASAutosave && typeof BASAutosave.list === 'function') {
            const projects = await BASAutosave.list();
            if (Array.isArray(projects) && projects.length) {
                markHelpIntroSeen();
                return false;
            }
        }
    } catch (e) {}
    return helpElementVisible(document.getElementById('initial-state'));
}

function syncHelpText() {
    const bindings = {
        'studio-help-button-label': ['helpButton', 'Help'],
        'help-kicker': ['helpKicker', 'HELP'],
        'help-title': ['helpTitle', 'Boot Animation Studio, step by step'],
        'help-desc': ['helpDesc', 'A short map of the workflow. Each editor already explains its own detailed controls.'],
        'help-start-title': ['helpStartTitle', 'Start'],
        'help-start-desc': ['helpStartDesc', 'Add media, open a bootanimation.zip or continue from a .basproject. Phone connection is optional.'],
        'help-edit-title': ['helpEditTitle', 'Edit'],
        'help-edit-desc': ['helpEditDesc', 'Use the timeline for sections and timing. Composition, Audio and Parts add optional control without replacing the main editor.'],
        'help-output-title': ['helpOutputTitle', 'Output'],
        'help-output-desc': ['helpOutputDesc', 'Choose resolution, FPS, frame format and framing. Presets are predictable; Smart Optimize adapts to the current project.'],
        'help-build-title': ['helpBuildTitle', 'Build'],
        'help-build-desc': ['helpBuildDesc', 'Compatibility Center reviews known issues. Choose Download or phone delivery, then generate the final result.'],
        'help-project-title': ['helpProjectTitle', 'Projects'],
        'help-project-desc': ['helpProjectDesc', 'Autosave protects work in this browser. Save a .basproject when you want a portable editable copy.'],
        'help-phone-title': ['helpPhoneTitle', 'Phone integration'],
        'help-phone-desc': ['helpPhoneDesc', 'The Companion Module is optional. It adds direct apply, pull, history, preview and device information.'],
        'help-start-tour-label': ['helpStartTour', 'Show me the interface'],
        'help-close-label': ['helpClose', 'Close'],
        'guided-tour-back-label': ['helpTourBack', 'Back'],
        'guided-tour-next-label': ['helpTourNext', 'Next']
    };
    Object.entries(bindings).forEach(([id, [key, fallback]]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = helpText(key, fallback);
    });
    const button = document.getElementById('studio-help-button');
    if (button) button.setAttribute('aria-label', helpText('helpButtonAria', 'Open help'));
    const closeIcon = document.getElementById('help-close-icon');
    if (closeIcon) closeIcon.setAttribute('aria-label', helpText('helpCloseAria', 'Close help'));
    const tourClose = document.getElementById('guided-tour-close');
    if (tourClose) tourClose.setAttribute('aria-label', helpText('helpTourEnd', 'End tour'));
    if (basHelpRuntime.tour && !basHelpRuntime.tour.hidden && basHelpRuntime.steps.length) renderGuidedTourStep();
}

function openHelp() {
    if (!basHelpRuntime.modal) return;
    endGuidedTour(false);
    basHelpRuntime.previousFocus = document.activeElement;
    basHelpRuntime.modal.style.display = 'flex';
    basHelpRuntime.modal.setAttribute('aria-hidden', 'false');
    markHelpIntroSeen();
    requestAnimationFrame(() => document.getElementById('help-start-tour')?.focus());
}

function closeHelp() {
    if (!basHelpRuntime.modal) return;
    basHelpRuntime.modal.style.display = 'none';
    basHelpRuntime.modal.setAttribute('aria-hidden', 'true');
    markHelpIntroSeen();
    const focusTarget = basHelpRuntime.previousFocus;
    basHelpRuntime.previousFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function') requestAnimationFrame(() => focusTarget.focus());
}

function buildGuidedTourSteps() {
    const editor = document.getElementById('editor-section');
    const editorVisible = helpElementVisible(editor);
    const hasMedia = document.body.classList.contains('workspace-has-media') || helpElementVisible(document.getElementById('video-container'));

    if (!editorVisible) {
        return [
            { selector: '#btn-manual', title: ['helpTourLocalTitle', 'Create locally'], desc: ['helpTourLocalDesc', 'Start with a video, GIF, image or bootanimation.zip. Everything can be edited and downloaded without connecting a phone.'] },
            { selector: '#btn-connect', title: ['helpTourPhoneTitle', 'Connect a phone when you need it'], desc: ['helpTourPhoneDesc', 'The Companion Module is optional. Connect it for direct apply, pull, history and device-aware tools.'] },
            { selector: '#p12-open-project-launch', title: ['helpTourProjectTitle', 'Continue an editable project'], desc: ['helpTourProjectDesc', 'Open a .basproject to restore its media and editor state on this device.'] },
            { selector: '#studio-help-button', title: ['helpTourHelpTitle', 'Help stays available'], desc: ['helpTourHelpDesc', 'Open Help at any time to review the workflow or start this tour again.'] }
        ];
    }

    const steps = [
        { selector: '#source-dock', title: ['helpTourSourceTitle', 'Sources live here'], desc: ['helpTourSourceDesc', 'Add the main media, import a bootanimation.zip or add more visual and audio sources.'] }
    ];
    if (hasMedia) {
        steps.push(
            { selector: '#timeline-editor', title: ['helpTourTimelineTitle', 'Timeline and markers'], desc: ['helpTourTimelineDesc', 'Scrub to a moment, then place the four section markers. The same timeline also carries Parts, audio and Composition timing.'] },
            { selector: '#edit-tool-dock', title: ['helpTourToolsTitle', 'Composition, Audio and Parts'], desc: ['helpTourToolsDesc', 'These tools extend the current project. Composition adds layers, Audio shapes sound, and Parts controls advanced boot structure.'] },
            { selector: '#mobile-workflow-nav', title: ['helpTourWorkflowTitle', 'Edit → Output → Build'], desc: ['helpTourWorkflowDesc', 'Edit the content first, choose output settings second, then review compatibility and generate in Build.'] },
            { selector: '#p12-project-file-actions', title: ['helpTourSaveTitle', 'Keep a portable copy'], desc: ['helpTourSaveDesc', 'Autosave protects this browser. Save a .basproject when you want to move or archive the editable project.'] }
        );
    } else {
        steps.push(
            { selector: '#workspace-empty', title: ['helpTourEmptyTitle', 'Add a source to unlock the editor'], desc: ['helpTourEmptyDesc', 'Timeline, Output and Build become useful after media is loaded. The workflow keeps the same three stages on mobile and desktop.'] },
            { selector: '#p12-project-file-actions', title: ['helpTourSaveTitle', 'Project files'], desc: ['helpTourSaveEmptyDesc', 'You can also open a .basproject from here. Save becomes available after a project exists.'] }
        );
    }
    steps.push({ selector: '#studio-help-button', title: ['helpTourHelpTitle', 'Help stays available'], desc: ['helpTourHelpDesc', 'Open Help at any time to review the workflow or start this tour again.'] });
    return steps;
}

function clearGuidedTourTarget() {
    if (basHelpRuntime.target) basHelpRuntime.target.classList.remove('guided-tour-target');
    basHelpRuntime.target = null;
}

function renderGuidedTourStep() {
    if (!basHelpRuntime.tour || !basHelpRuntime.steps.length) return;
    clearGuidedTourTarget();
    let step = basHelpRuntime.steps[basHelpRuntime.currentStep];
    let target = document.querySelector(step.selector);
    if (!helpElementVisible(target)) {
        const nextIndex = basHelpRuntime.steps.findIndex((candidate, index) => index > basHelpRuntime.currentStep && helpElementVisible(document.querySelector(candidate.selector)));
        if (nextIndex >= 0) {
            basHelpRuntime.currentStep = nextIndex;
            step = basHelpRuntime.steps[nextIndex];
            target = document.querySelector(step.selector);
        }
    }
    if (!helpElementVisible(target)) {
        endGuidedTour();
        return;
    }

    basHelpRuntime.target = target;
    target.classList.add('guided-tour-target');
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    document.getElementById('guided-tour-counter').textContent = `${basHelpRuntime.currentStep + 1} / ${basHelpRuntime.steps.length}`;
    document.getElementById('guided-tour-title').textContent = helpText(step.title[0], step.title[1]);
    document.getElementById('guided-tour-desc').textContent = helpText(step.desc[0], step.desc[1]);
    const back = document.getElementById('guided-tour-back');
    const next = document.getElementById('guided-tour-next');
    back.disabled = basHelpRuntime.currentStep === 0;
    next.querySelector('span').textContent = basHelpRuntime.currentStep === basHelpRuntime.steps.length - 1
        ? helpText('helpTourDone', 'Done')
        : helpText('helpTourNext', 'Next');

    requestAnimationFrame(() => {
        const card = document.querySelector('.guided-tour-card');
        if (!card) return;
        const rect = target.getBoundingClientRect();
        card.classList.toggle('is-top', rect.top > window.innerHeight * 0.56);
    });
}

function startGuidedTour() {
    closeHelp();
    basHelpRuntime.steps = buildGuidedTourSteps().filter(step => helpElementVisible(document.querySelector(step.selector)));
    if (!basHelpRuntime.steps.length || !basHelpRuntime.tour) return;
    basHelpRuntime.currentStep = 0;
    basHelpRuntime.tour.hidden = false;
    basHelpRuntime.tour.setAttribute('aria-hidden', 'false');
    document.body.classList.add('guided-tour-active');
    markHelpIntroSeen();
    renderGuidedTourStep();
}

function endGuidedTour(restoreFocus = true) {
    clearGuidedTourTarget();
    if (basHelpRuntime.tour) {
        basHelpRuntime.tour.hidden = true;
        basHelpRuntime.tour.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('guided-tour-active');
    basHelpRuntime.steps = [];
    basHelpRuntime.currentStep = 0;
    if (restoreFocus) requestAnimationFrame(() => document.getElementById('studio-help-button')?.focus());
}

function moveGuidedTour(delta) {
    if (!basHelpRuntime.steps.length) return;
    const nextIndex = basHelpRuntime.currentStep + delta;
    if (nextIndex < 0) return;
    if (nextIndex >= basHelpRuntime.steps.length) {
        endGuidedTour();
        return;
    }
    basHelpRuntime.currentStep = nextIndex;
    renderGuidedTourStep();
}

function bindHelpUi() {
    basHelpRuntime.modal = document.getElementById('modal-help');
    basHelpRuntime.tour = document.getElementById('guided-tour');
    document.getElementById('studio-help-button')?.addEventListener('click', openHelp);
    document.getElementById('help-close')?.addEventListener('click', closeHelp);
    document.getElementById('help-close-icon')?.addEventListener('click', closeHelp);
    document.getElementById('help-start-tour')?.addEventListener('click', startGuidedTour);
    document.getElementById('guided-tour-close')?.addEventListener('click', () => endGuidedTour());
    document.getElementById('guided-tour-back')?.addEventListener('click', () => moveGuidedTour(-1));
    document.getElementById('guided-tour-next')?.addEventListener('click', () => moveGuidedTour(1));
    basHelpRuntime.modal?.addEventListener('click', event => {
        if (event.target === basHelpRuntime.modal) closeHelp();
    });
    document.addEventListener('keydown', event => {
        if (!basHelpRuntime.tour?.hidden) {
            if (event.key === 'Escape') {
                event.preventDefault();
                endGuidedTour();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveGuidedTour(1);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveGuidedTour(-1);
            }
            return;
        }
        if (basHelpRuntime.modal?.getAttribute('aria-hidden') === 'false' && event.key === 'Escape') {
            event.preventDefault();
            closeHelp();
        }
    });
    window.addEventListener('resize', () => {
        if (!basHelpRuntime.tour?.hidden && basHelpRuntime.steps.length) renderGuidedTourStep();
    }, { passive: true });
    syncHelpText();
    setTimeout(async () => {
        if (await shouldAutoOpenHelp()) openHelp();
    }, 650);
}

window.addEventListener('DOMContentLoaded', bindHelpUi);
window.syncHelpText = syncHelpText;
window.openBasHelp = openHelp;
window.startBasGuidedTour = startGuidedTour;
