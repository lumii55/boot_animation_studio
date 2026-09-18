const BAS_CUSTOM_PROFILE_VERSION = 1;
const BAS_CUSTOM_PROFILE_STORAGE_KEY = 'boot-animation-studio-custom-profiles-v1';
const BAS_CUSTOM_PROFILE_LIMIT = 12;

const customProfileRuntime = {
    initialized: false,
    profiles: [],
    editorOpen: false,
    menuId: '',
    renameId: ''
};

function customProfileText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function customProfileCreateId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function customProfileNormalizeName(value, fallback = '') {
    const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return name || fallback;
}

function customProfileNormalizeResolutionPolicy(value) {
    return ['exact', 'current', 'device'].includes(value) ? value : 'exact';
}

function customProfileSanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = customProfileNormalizeName(raw.id, customProfileCreateId());
    const name = customProfileNormalizeName(raw.name);
    if (!name) return null;
    const resolutionPolicy = customProfileNormalizeResolutionPolicy(raw.resolutionPolicy);
    const width = Math.max(1, Math.floor(Number(raw.width) || 1));
    const height = Math.max(1, Math.floor(Number(raw.height) || 1));
    const fps = Math.max(1, Math.min(60, Math.round(Number(raw.fps) || 30)));
    const format = raw.format === 'png' ? 'png' : 'jpeg';
    const jpegQuality = typeof normalizeJpegExportQuality === 'function'
        ? normalizeJpegExportQuality(raw.jpegQuality)
        : Math.max(0.55, Math.min(0.95, Number(raw.jpegQuality) || 0.9));
    const framing = raw.framing && ['cover', 'contain', 'stretch'].includes(raw.framing) ? raw.framing : null;
    const manufacturer = raw.manufacturer ? String(raw.manufacturer) : null;
    return {
        id,
        name,
        resolutionPolicy,
        width,
        height,
        fps,
        format,
        jpegQuality,
        framing,
        manufacturer,
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now()
    };
}

function customProfileLoad() {
    try {
        const parsed = JSON.parse(localStorage.getItem(BAS_CUSTOM_PROFILE_STORAGE_KEY) || '{}');
        const source = Array.isArray(parsed) ? parsed : parsed.profiles;
        customProfileRuntime.profiles = (Array.isArray(source) ? source : [])
            .map(customProfileSanitize)
            .filter(Boolean)
            .slice(0, BAS_CUSTOM_PROFILE_LIMIT);
    } catch (error) {
        customProfileRuntime.profiles = [];
    }
}

function customProfilePersist() {
    try {
        localStorage.setItem(BAS_CUSTOM_PROFILE_STORAGE_KEY, JSON.stringify({
            version: BAS_CUSTOM_PROFILE_VERSION,
            profiles: customProfileRuntime.profiles
        }));
    } catch (error) {
        if (typeof showToast === 'function') showToast(customProfileText('customProfileStorageError', 'Profiles could not be saved in this browser.'), 'error', 3600);
    }
}

function customProfileCurrentOptions() {
    if (!currentProject) return null;
    if (typeof outputPresetCurrentOptions === 'function') return outputPresetCurrentOptions();
    if (typeof getPerformanceOptions === 'function') return getPerformanceOptions();
    return null;
}

function customProfileDeviceResolution() {
    if (typeof compatibilityGetDeviceResolution === 'function') return compatibilityGetDeviceResolution();
    return null;
}

function customProfileNextName() {
    const base = customProfileText('customProfileDefaultName', 'Profile');
    const used = new Set(customProfileRuntime.profiles.map(profile => profile.name.toLowerCase()));
    let index = customProfileRuntime.profiles.length + 1;
    let candidate = `${base} ${index}`;
    while (used.has(candidate.toLowerCase())) candidate = `${base} ${++index}`;
    return candidate;
}

function customProfileOpenEditor() {
    if (customProfileRuntime.profiles.length >= BAS_CUSTOM_PROFILE_LIMIT) {
        if (typeof showToast === 'function') showToast(customProfileText('customProfileLimitToast', 'You can save up to 12 custom profiles.'), 'info', 3200);
        return;
    }
    const options = customProfileCurrentOptions();
    if (!options) return;
    customProfileRuntime.editorOpen = true;
    const editor = document.getElementById('custom-profile-editor');
    const name = document.getElementById('custom-profile-name');
    const policy = document.getElementById('custom-profile-resolution-policy');
    const framing = document.getElementById('custom-profile-include-framing');
    const variant = document.getElementById('custom-profile-include-variant');
    if (editor) editor.hidden = false;
    if (name) {
        name.value = customProfileNextName();
        requestAnimationFrame(() => name.focus());
    }
    if (policy) policy.value = 'exact';
    if (framing) framing.checked = false;
    if (variant) variant.checked = false;
    syncCustomProfilesUi();
}

function customProfileCloseEditor() {
    customProfileRuntime.editorOpen = false;
    const editor = document.getElementById('custom-profile-editor');
    if (editor) editor.hidden = true;
}

function customProfileSaveCurrent() {
    if (customProfileRuntime.profiles.length >= BAS_CUSTOM_PROFILE_LIMIT) return;
    const options = customProfileCurrentOptions();
    if (!options) return;
    const nameInput = document.getElementById('custom-profile-name');
    const policyInput = document.getElementById('custom-profile-resolution-policy');
    const includeFraming = !!document.getElementById('custom-profile-include-framing')?.checked;
    const includeVariant = !!document.getElementById('custom-profile-include-variant')?.checked;
    const name = customProfileNormalizeName(nameInput?.value);
    if (!name) {
        if (typeof showToast === 'function') showToast(customProfileText('customProfileNameRequired', 'Enter a profile name.'), 'error', 2600);
        nameInput?.focus();
        return;
    }
    const duplicate = customProfileRuntime.profiles.some(profile => profile.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
        if (typeof showToast === 'function') showToast(customProfileText('customProfileNameDuplicate', 'A profile with this name already exists.'), 'error', 3000);
        nameInput?.focus();
        return;
    }
    const now = Date.now();
    customProfileRuntime.profiles.push(customProfileSanitize({
        id: customProfileCreateId(),
        name,
        resolutionPolicy: customProfileNormalizeResolutionPolicy(policyInput?.value),
        width: options.width,
        height: options.height,
        fps: options.fps,
        format: options.format,
        jpegQuality: options.jpegQuality,
        framing: includeFraming ? options.framing : null,
        manufacturer: includeVariant ? options.manufacturer : null,
        createdAt: now,
        updatedAt: now
    }));
    customProfilePersist();
    customProfileCloseEditor();
    syncCustomProfilesUi();
    if (typeof showToast === 'function') showToast(customProfileText('customProfileSavedToast', 'Profile saved: {name}').replace('{name}', name), 'success', 2600);
}

function customProfileResolutionLabel(profile) {
    if (profile.resolutionPolicy === 'current') return customProfileText('customProfileResolutionKeepShort', 'Keep size');
    if (profile.resolutionPolicy === 'device') return customProfileText('customProfileResolutionDeviceShort', 'Device');
    return `${profile.width}×${profile.height}`;
}

function customProfileSummary(profile) {
    const format = profile.format === 'png' ? 'PNG' : `JPEG ${Math.round(profile.jpegQuality * 100)}%`;
    return `${customProfileResolutionLabel(profile)} · ${profile.fps} FPS · ${format}`;
}

function customProfileDetails(profile) {
    const details = [];
    if (profile.framing) details.push(customProfileText('customProfileIncludesFraming', 'Framing'));
    if (profile.manufacturer) details.push(customProfileText('customProfileIncludesVariant', 'Device variant'));
    return details.join(' · ');
}

function customProfileResolve(profile) {
    const current = customProfileCurrentOptions();
    if (!current) return null;
    const candidate = {
        ...current,
        fps: profile.fps,
        format: profile.format,
        jpegQuality: profile.jpegQuality
    };
    if (profile.resolutionPolicy === 'exact') {
        candidate.width = profile.width;
        candidate.height = profile.height;
    } else if (profile.resolutionPolicy === 'device') {
        const device = customProfileDeviceResolution();
        if (!device) return null;
        candidate.width = device.width;
        candidate.height = device.height;
    }
    if (profile.framing) candidate.framing = profile.framing;
    if (profile.manufacturer) candidate.manufacturer = profile.manufacturer;
    return candidate;
}

function customProfileApply(id) {
    const profile = customProfileRuntime.profiles.find(item => item.id === id);
    if (!profile) return;
    const candidate = customProfileResolve(profile);
    if (!candidate) {
        if (typeof showToast === 'function') showToast(customProfileText('customProfileDeviceUnavailableToast', 'Connect a device before applying this profile.'), 'info', 3000);
        return;
    }
    if (typeof outputPresetApplyResolvedOptions === 'function') {
        outputPresetApplyResolvedOptions(candidate, {
            reason: 'custom-profile',
            changeKey: `custom-profile:${profile.id}`,
            qualitySource: 'profile'
        });
    } else return;
    if (typeof syncOutputPresetsUi === 'function') syncOutputPresetsUi();
    syncCustomProfilesUi();
    if (typeof showToast === 'function') showToast(customProfileText('customProfileAppliedToast', 'Profile applied: {name}').replace('{name}', profile.name), 'success', 2600);
}

function customProfileStartRename(id) {
    customProfileRuntime.menuId = '';
    customProfileRuntime.renameId = id;
    renderCustomProfiles();
    requestAnimationFrame(() => document.querySelector(`[data-custom-profile-id="${CSS.escape(id)}"] [data-profile-rename-input]`)?.focus());
}

function customProfileCancelRename() {
    customProfileRuntime.renameId = '';
    renderCustomProfiles();
}

function customProfileCommitRename(id) {
    const profile = customProfileRuntime.profiles.find(item => item.id === id);
    const input = document.querySelector(`[data-custom-profile-id="${CSS.escape(id)}"] [data-profile-rename-input]`);
    if (!profile || !input) return;
    const name = customProfileNormalizeName(input.value);
    if (!name) return;
    const duplicate = customProfileRuntime.profiles.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
        if (typeof showToast === 'function') showToast(customProfileText('customProfileNameDuplicate', 'A profile with this name already exists.'), 'error', 3000);
        input.focus();
        return;
    }
    profile.name = name;
    profile.updatedAt = Date.now();
    customProfileRuntime.renameId = '';
    customProfilePersist();
    renderCustomProfiles();
}

async function customProfileDelete(id) {
    const profile = customProfileRuntime.profiles.find(item => item.id === id);
    if (!profile) return;
    const message = customProfileText('customProfileDeleteConfirm', 'Delete “{name}”?').replace('{name}', profile.name);
    const confirmed = typeof askConfirmation === 'function' ? await askConfirmation(message, true) : true;
    if (!confirmed) return;
    customProfileRuntime.profiles = customProfileRuntime.profiles.filter(item => item.id !== id);
    customProfileRuntime.menuId = '';
    customProfileRuntime.renameId = '';
    customProfilePersist();
    renderCustomProfiles();
    if (typeof showToast === 'function') showToast(customProfileText('customProfileDeletedToast', 'Profile deleted.'), 'info', 2200);
}

function customProfileMenuButton(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'custom-profile-menu-button';
    button.dataset.profileMenuToggle = id;
    button.setAttribute('aria-label', customProfileText('customProfileMenu', 'Profile options'));
    button.textContent = '•••';
    return button;
}

function customProfileCreateCard(profile) {
    const card = document.createElement('article');
    card.className = 'custom-profile-card';
    card.dataset.customProfileId = profile.id;

    const head = document.createElement('div');
    head.className = 'custom-profile-card-head';
    if (customProfileRuntime.renameId === profile.id) {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 40;
        input.value = profile.name;
        input.dataset.profileRenameInput = '';
        input.setAttribute('aria-label', customProfileText('customProfileRenameLabel', 'Profile name'));
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') customProfileCommitRename(profile.id);
            if (event.key === 'Escape') customProfileCancelRename();
        });
        head.appendChild(input);
    } else {
        const title = document.createElement('strong');
        title.textContent = profile.name;
        head.append(title, customProfileMenuButton(profile.id));
    }

    const summary = document.createElement('small');
    summary.className = 'custom-profile-summary';
    summary.textContent = customProfileSummary(profile);
    card.append(head, summary);

    const detailsText = customProfileDetails(profile);
    if (detailsText) {
        const details = document.createElement('small');
        details.className = 'custom-profile-details';
        details.textContent = detailsText;
        card.appendChild(details);
    }

    if (customProfileRuntime.renameId === profile.id) {
        const renameActions = document.createElement('div');
        renameActions.className = 'custom-profile-rename-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.dataset.profileRenameSave = profile.id;
        save.textContent = customProfileText('customProfileRenameSave', 'Save');
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.dataset.profileRenameCancel = profile.id;
        cancel.textContent = customProfileText('customProfileCancel', 'Cancel');
        renameActions.append(save, cancel);
        card.appendChild(renameActions);
        return card;
    }

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'custom-profile-apply';
    apply.dataset.profileApply = profile.id;
    apply.textContent = customProfileText('customProfileApply', 'Apply');
    const available = !!customProfileResolve(profile);
    apply.disabled = !available;
    if (!available && profile.resolutionPolicy === 'device') {
        const unavailable = document.createElement('small');
        unavailable.className = 'custom-profile-unavailable';
        unavailable.textContent = customProfileText('customProfileDeviceUnavailable', 'Connect a device to use this resolution policy.');
        card.appendChild(unavailable);
    }
    card.appendChild(apply);

    if (customProfileRuntime.menuId === profile.id) {
        const menu = document.createElement('div');
        menu.className = 'custom-profile-menu';
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.dataset.profileRename = profile.id;
        rename.textContent = customProfileText('customProfileRename', 'Rename');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'is-danger';
        remove.dataset.profileDelete = profile.id;
        remove.textContent = customProfileText('customProfileDelete', 'Delete');
        menu.append(rename, remove);
        card.appendChild(menu);
    }
    return card;
}

function renderCustomProfiles() {
    const strip = document.getElementById('custom-profile-strip');
    const empty = document.getElementById('custom-profile-empty');
    const count = document.getElementById('custom-profile-count');
    const saveButton = document.getElementById('custom-profile-save-open');
    if (count) count.textContent = `${customProfileRuntime.profiles.length}/${BAS_CUSTOM_PROFILE_LIMIT}`;
    if (saveButton) saveButton.disabled = customProfileRuntime.profiles.length >= BAS_CUSTOM_PROFILE_LIMIT;
    if (!strip || !empty) return;
    strip.replaceChildren();
    empty.hidden = customProfileRuntime.profiles.length > 0;
    customProfileRuntime.profiles.forEach(profile => strip.appendChild(customProfileCreateCard(profile)));
}

function syncCustomProfilesText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = customProfileText(key, fallback);
    };
    set('custom-profiles-kicker', 'customProfileKicker', 'CUSTOM PROFILES');
    set('custom-profiles-title', 'customProfileTitle', 'Reuse your output settings');
    set('custom-profiles-desc', 'customProfileDesc', 'Profiles are stored on this browser, separately from projects.');
    set('custom-profile-save-open', 'customProfileSaveCurrent', 'Save current');
    set('custom-profile-editor-title', 'customProfileEditorTitle', 'Save current output as a profile');
    set('custom-profile-name-label', 'customProfileNameLabel', 'Profile name');
    set('custom-profile-resolution-label', 'customProfileResolutionLabel', 'Resolution policy');
    set('custom-profile-resolution-exact', 'customProfileResolutionExact', 'Use this exact resolution');
    set('custom-profile-resolution-current', 'customProfileResolutionCurrent', 'Keep the project resolution when applied');
    set('custom-profile-resolution-device', 'customProfileResolutionDevice', 'Match the connected device when applied');
    set('custom-profile-framing-label', 'customProfileFramingLabel', 'Include framing mode');
    set('custom-profile-variant-label', 'customProfileVariantLabel', 'Include device variant');
    set('custom-profile-save', 'customProfileSave', 'Save profile');
    set('custom-profile-cancel', 'customProfileCancel', 'Cancel');
    set('custom-profile-empty-title', 'customProfileEmptyTitle', 'No personal profiles yet');
    set('custom-profile-empty-desc', 'customProfileEmptyDesc', 'Set up Output the way you like, then save it for reuse.');
    const name = document.getElementById('custom-profile-name');
    if (name) name.placeholder = customProfileText('customProfileNamePlaceholder', 'Ex: My daily profile');
    renderCustomProfiles();
}

function syncCustomProfilesUi() {
    const editor = document.getElementById('custom-profile-editor');
    if (editor) editor.hidden = !customProfileRuntime.editorOpen;
    syncCustomProfilesText();
}

function bindCustomProfiles() {
    if (customProfileRuntime.initialized) return;
    customProfileRuntime.initialized = true;
    customProfileLoad();
    document.getElementById('custom-profile-save-open')?.addEventListener('click', customProfileOpenEditor);
    document.getElementById('custom-profile-cancel')?.addEventListener('click', customProfileCloseEditor);
    document.getElementById('custom-profile-save')?.addEventListener('click', customProfileSaveCurrent);
    document.getElementById('custom-profile-name')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') customProfileSaveCurrent();
        if (event.key === 'Escape') customProfileCloseEditor();
    });
    document.getElementById('custom-profile-strip')?.addEventListener('click', event => {
        const apply = event.target.closest('[data-profile-apply]');
        if (apply) return customProfileApply(apply.dataset.profileApply);
        const menu = event.target.closest('[data-profile-menu-toggle]');
        if (menu) {
            const id = menu.dataset.profileMenuToggle;
            customProfileRuntime.menuId = customProfileRuntime.menuId === id ? '' : id;
            renderCustomProfiles();
            return;
        }
        const rename = event.target.closest('[data-profile-rename]');
        if (rename) return customProfileStartRename(rename.dataset.profileRename);
        const remove = event.target.closest('[data-profile-delete]');
        if (remove) return void customProfileDelete(remove.dataset.profileDelete);
        const renameSave = event.target.closest('[data-profile-rename-save]');
        if (renameSave) return customProfileCommitRename(renameSave.dataset.profileRenameSave);
        const renameCancel = event.target.closest('[data-profile-rename-cancel]');
        if (renameCancel) return customProfileCancelRename();
    });
    document.addEventListener('click', event => {
        if (!customProfileRuntime.menuId) return;
        if (event.target.closest('.custom-profile-card')) return;
        customProfileRuntime.menuId = '';
        renderCustomProfiles();
    });
    window.addEventListener('bas:projectchange', () => renderCustomProfiles());
    syncCustomProfilesUi();
}

window.BASCustomProfiles = Object.freeze({
    version: BAS_CUSTOM_PROFILE_VERSION,
    limit: BAS_CUSTOM_PROFILE_LIMIT,
    getAll: () => customProfileRuntime.profiles.map(profile => ({ ...profile })),
    apply: customProfileApply,
    sync: syncCustomProfilesUi
});
window.syncCustomProfilesUi = syncCustomProfilesUi;
window.syncCustomProfilesText = syncCustomProfilesText;
window.addEventListener('DOMContentLoaded', bindCustomProfiles);
