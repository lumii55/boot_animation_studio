const healthCenterState = { data: null, loading: false, error: false, actionRunning: '' };

function healthText(key, fallback) {
    try {
        return traducoes?.[idiomaAtual]?.[key] || traducoes?.en?.[key] || fallback;
    } catch (error) {
        return fallback;
    }
}

function healthSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('module_health');
}

function healthMaintenanceSupported() {
    return typeof hasModuleFeature === 'function' && hasModuleFeature('module_health_maintenance');
}

function healthCanManage() {
    return typeof hasModulePermission !== 'function' || hasModulePermission('manage');
}

const HEALTH_ACTION_KEYS = {
    cleanup_stale_temps: ['healthActionTempsTitle', 'Clean stale temporary files', 'healthActionTempsDesc', 'Remove interrupted-write .tmp files older than five minutes.'],
    cleanup_orphan_objects: ['healthActionOrphansTitle', 'Remove unused playlist objects', 'healthActionOrphansDesc', 'Delete stored playlist objects that are not referenced by any playlist, Queue, override or prepared next boot.'],
    clear_invalid_staging: ['healthActionStagingTitle', 'Clear invalid test staging', 'healthActionStagingDesc', 'Remove only the invalid temporary Test Lab animation so a clean staging session can be created.']
};

function healthActionCopy(action) {
    const row = HEALTH_ACTION_KEYS[action.id] || ['healthActionGenericTitle', action.id || 'Maintenance', 'healthActionGenericDesc', 'Narrowly scoped module maintenance.'];
    return { title: healthText(row[0], row[1]), description: healthText(row[2], row[3]) };
}

function healthBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function healthEscape(value) {
    return String(value ?? '').replace(/[&<>\"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
}

function healthStateLabel(state) {
    if (state === 'error') return healthText('healthStateError', 'Problem');
    if (state === 'warn') return healthText('healthStateWarning', 'Attention');
    return healthText('healthStateOk', 'OK');
}

function healthOverallLabel(value) {
    if (value === 'degraded') return healthText('healthOverallDegraded', 'Needs attention');
    if (value === 'attention') return healthText('healthOverallAttention', 'Attention');
    return healthText('healthOverallHealthy', 'Healthy');
}

const HEALTH_CHECK_KEYS = {
    boot_paths: ['healthCheckBootPaths', 'Boot paths', 'healthCheckBootPathsDesc', 'Saved bootanimation targets can be read and validated.'],
    current_animation: ['healthCheckCurrentAnimation', 'Current animation', 'healthCheckCurrentAnimationDesc', 'The currently active boot archive is readable when a custom animation is applied.'],
    stock_backup: ['healthCheckStockBackup', 'Stock backup', 'healthCheckStockBackupDesc', 'A usable original animation backup exists when one is required for recovery.'],
    history_integrity: ['healthCheckHistory', 'History', 'healthCheckHistoryDesc', 'History ZIPs and metadata are internally consistent.'],
    playlist_integrity: ['healthCheckPlaylist', 'Playlist library', 'healthCheckPlaylistDesc', 'Playlist state points only to available stored animation objects.'],
    automation_integrity: ['healthCheckAutomation', 'Rotation & Queue', 'healthCheckAutomationDesc', 'Automation state does not reference missing playlists or animation objects.'],
    staging_integrity: ['healthCheckStaging', 'Test staging', 'healthCheckStagingDesc', 'The staged test animation is valid when present.'],
    security_state: ['healthCheckSecurity', 'Trust & audit state', 'healthCheckSecurityDesc', 'Trusted-client and Security Audit state can be read safely.'],
    temporary_files: ['healthCheckTemp', 'Temporary files', 'healthCheckTempDesc', 'No stale interrupted-write temporary files were found.'],
    orphan_objects: ['healthCheckOrphans', 'Unused playlist objects', 'healthCheckOrphansDesc', 'Stored playlist objects are still referenced by playlists or automation.'],
    free_space: ['healthCheckFreeSpace', 'Free storage', 'healthCheckFreeSpaceDesc', 'The device has enough free space for normal module operations.']
};

function healthCheckCopy(check) {
    const row = HEALTH_CHECK_KEYS[check.id] || ['healthCheckGeneric', check.id || 'Check', 'healthCheckGenericDesc', 'Module diagnostic check.'];
    return { title: healthText(row[0], row[1]), description: healthText(row[2], row[3]) };
}

function healthDetail(check) {
    const parts = [];
    if (check.count) parts.push(`${healthText('healthCountLabel', 'Count')}: ${check.count}`);
    if (check.bytes) parts.push(healthBytes(check.bytes));
    if (check.detail) parts.push(String(check.detail));
    return parts.join(' · ');
}

function renderHealthCenter() {
    const root = document.getElementById('module-health-center');
    if (!root) return;
    root.hidden = !healthSupported() || moduleWorkspaceUi?.currentTab !== 'device';
    if (!healthSupported()) return;
    const data = healthCenterState.data;
    const status = document.getElementById('health-center-status');
    const summary = document.getElementById('health-summary-grid');
    const checks = document.getElementById('health-check-list');
    const storage = document.getElementById('health-storage-grid');
    if (!data) {
        if (status) {
            status.hidden = false;
            status.textContent = healthCenterState.loading
                ? healthText('healthLoading', 'Checking module health…')
                : healthCenterState.error
                    ? healthText('healthLoadError', 'Could not load module health information.')
                    : healthText('healthNotLoaded', 'Health information has not been loaded yet.');
        }
        if (summary) summary.innerHTML = '';
        if (checks) checks.innerHTML = '';
        if (storage) storage.innerHTML = '';
        return;
    }
    if (status) status.hidden = true;
    if (summary) {
        summary.innerHTML = `
            <article class="health-summary-card health-${data.overall === 'degraded' ? 'error' : data.overall === 'attention' ? 'warn' : 'ok'}"><span>${healthText('healthOverallLabel', 'Overall')}</span><strong>${healthOverallLabel(data.overall)}</strong><small>${data.ok_count || 0} ${healthText('healthOkShort', 'OK')} · ${data.warning_count || 0} ${healthText('healthWarningsShort', 'warnings')} · ${data.error_count || 0} ${healthText('healthErrorsShort', 'errors')}</small></article>
            <article class="health-summary-card"><span>${healthText('healthModuleStorage', 'Module storage')}</span><strong>${healthBytes(data.storage?.module_bytes)}</strong><small>${data.storage?.module_files || 0} ${healthText('healthFiles', 'files')}</small></article>
            <article class="health-summary-card"><span>${healthText('healthFreeStorage', 'Device free space')}</span><strong>${data.storage?.filesystem_available ? healthBytes(data.storage.filesystem_free_bytes) : healthText('healthUnknown', 'Unknown')}</strong><small>${data.storage?.filesystem_available ? `${healthBytes(data.storage.filesystem_total_bytes)} ${healthText('healthTotal', 'total')}` : healthText('healthUnknown', 'Unknown')}</small></article>`;
    }
    if (checks) {
        checks.innerHTML = (data.checks || []).map(check => {
            const copy = healthCheckCopy(check);
            const detail = healthDetail(check);
            return `<article class="health-check health-${check.state || 'ok'}"><div class="health-check-main"><span class="health-state-dot" aria-hidden="true"></span><div><strong>${healthEscape(copy.title)}</strong><p>${healthEscape(copy.description)}</p>${detail ? `<small>${healthEscape(detail)}</small>` : ''}</div></div><span class="health-state-label">${healthStateLabel(check.state)}</span></article>`;
        }).join('');
    }
    if (storage) {
        storage.innerHTML = (data.storage?.buckets || []).map(bucket => `<article><span>${healthText(`healthBucket_${bucket.id}`, bucket.id)}</span><strong>${healthBytes(bucket.bytes)}</strong><small>${bucket.files || 0} ${healthText('healthFiles', 'files')}</small></article>`).join('');
    }
    const maintenanceBlock = document.getElementById('health-maintenance-block');
    const maintenanceList = document.getElementById('health-maintenance-list');
    const actions = healthMaintenanceSupported() && Array.isArray(data.actions) ? data.actions : [];
    if (maintenanceBlock) maintenanceBlock.hidden = !healthMaintenanceSupported();
    if (maintenanceList && healthMaintenanceSupported()) {
        maintenanceList.replaceChildren();
        if (!actions.length) {
            const empty = document.createElement('div');
            empty.className = 'health-maintenance-empty';
            empty.textContent = healthText('healthMaintenanceEmpty', 'No safe maintenance is needed right now.');
            maintenanceList.appendChild(empty);
        } else {
            actions.forEach(action => {
                const copy = healthActionCopy(action);
                const card = document.createElement('article');
                card.className = 'health-maintenance-card';
                const body = document.createElement('div');
                const title = document.createElement('strong');
                title.textContent = copy.title;
                const desc = document.createElement('p');
                desc.textContent = copy.description;
                const impact = document.createElement('small');
                const bits = [];
                if (Number(action.count) > 0) bits.push(`${healthText('healthCountLabel', 'Count')}: ${Number(action.count)}`);
                if (Number(action.bytes) > 0) bits.push(healthBytes(action.bytes));
                impact.textContent = bits.join(' · ');
                body.append(title, desc);
                if (impact.textContent) body.appendChild(impact);
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn-upload';
                button.textContent = healthCenterState.actionRunning === action.id ? healthText('healthActionRunning', 'Working…') : healthText('healthActionRun', 'Run maintenance');
                button.disabled = !!healthCenterState.actionRunning || !healthCanManage();
                if (!healthCanManage()) button.title = healthText('healthActionManageRequired', 'Manage access is required for maintenance actions.');
                button.addEventListener('click', () => runHealthMaintenance(action));
                card.append(body, button);
                maintenanceList.appendChild(card);
            });
        }
    }
}

async function refreshHealthCenter(options = {}) {
    if (!healthSupported() || healthCenterState.loading) return;
    healthCenterState.loading = true;
    renderHealthCenter();
    try {
        const response = await apiFetch('/health/status', { cache: 'no-store' });
        if (!response.ok) throw new Error(`${response.status}`);
        healthCenterState.data = await response.json();
        healthCenterState.error = false;
    } catch (error) {
        healthCenterState.error = true;
        if (!options.silent) console.warn('Health Center refresh failed', error);
    } finally {
        healthCenterState.loading = false;
        renderHealthCenter();
    }
}

async function runHealthMaintenance(action) {
    if (!healthMaintenanceSupported() || !healthCanManage() || healthCenterState.actionRunning) return;
    const copy = healthActionCopy(action);
    const question = healthText('healthActionConfirm', 'Run “{name}”? BAS will only touch the items described by this maintenance action.').replace('{name}', copy.title);
    const confirmed = typeof askConfirmation === 'function' ? await askConfirmation(question, true) : window.confirm(question);
    if (!confirmed) return;
    healthCenterState.actionRunning = action.id;
    renderHealthCenter();
    try {
        const response = await apiFetch('/health/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action.id })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.status !== 'ok') throw new Error(result.message || 'maintenance_failed');
        if (result.health) healthCenterState.data = result.health;
        else await refreshHealthCenter({ silent: true });
        const message = healthText('healthActionDone', 'Maintenance finished: {count} item(s) removed.').replace('{count}', String(Number(result.removed_count) || 0));
        if (typeof showToast === 'function') showToast(message, 'success', 3200);
    } catch (error) {
        if (typeof showToast === 'function') showToast(healthText('healthActionError', 'Could not complete module maintenance.'), 'error', 4500);
    } finally {
        healthCenterState.actionRunning = '';
        renderHealthCenter();
    }
}

function sanitizeHealthReport(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        status: raw.status || '',
        schema_version: Number(raw.schema_version) || 0,
        collected_at: Number(raw.collected_at) || 0,
        overall: raw.overall || '',
        ok_count: Number(raw.ok_count) || 0,
        warning_count: Number(raw.warning_count) || 0,
        error_count: Number(raw.error_count) || 0,
        checks: Array.isArray(raw.checks) ? raw.checks.map(check => ({
            id: String(check?.id || ''),
            state: String(check?.state || ''),
            code: String(check?.code || ''),
            detail: String(check?.detail || ''),
            count: Number(check?.count) || 0,
            bytes: Number(check?.bytes) || 0
        })) : [],
        storage: raw.storage && typeof raw.storage === 'object' ? {
            filesystem_available: Boolean(raw.storage.filesystem_available),
            filesystem_total_bytes: Number(raw.storage.filesystem_total_bytes) || 0,
            filesystem_free_bytes: Number(raw.storage.filesystem_free_bytes) || 0,
            module_bytes: Number(raw.storage.module_bytes) || 0,
            module_files: Number(raw.storage.module_files) || 0,
            orphan_object_bytes: Number(raw.storage.orphan_object_bytes) || 0,
            orphan_object_count: Number(raw.storage.orphan_object_count) || 0,
            buckets: Array.isArray(raw.storage.buckets) ? raw.storage.buckets.map(bucket => ({
                id: String(bucket?.id || ''),
                bytes: Number(bucket?.bytes) || 0,
                files: Number(bucket?.files) || 0
            })) : []
        } : null,
        available_actions: Array.isArray(raw.actions) ? raw.actions.map(action => ({
            id: String(action?.id || ''),
            count: Number(action?.count) || 0,
            bytes: Number(action?.bytes) || 0,
            required_permission: String(action?.required_permission || '')
        })) : []
    };
}

function sanitizeModuleInfo(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        api_version: Number(raw.api_version) || 0,
        model: String(raw.model || ''),
        module_version: String(raw.module_version || ''),
        module_version_code: Number(raw.module_version_code) || 0,
        companion_version_code: Number(raw.companion_version_code) || 0,
        features: Array.isArray(raw.features) ? raw.features.filter(value => typeof value === 'string') : [],
        max_direct_upload_bytes: Number(raw.max_direct_upload_bytes) || 0,
        direct_upload_warning_bytes: Number(raw.direct_upload_warning_bytes) || 0,
        history_limit: Number(raw.history_limit) || 0
    };
}

function sanitizeDeviceProbe(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const system = raw.system && typeof raw.system === 'object' ? raw.system : {};
    const boot = raw.boot && typeof raw.boot === 'object' ? raw.boot : {};
    const archive = value => value && typeof value === 'object' ? {
        status: String(value.status || ''), format: String(value.format || ''), width: Number(value.width) || 0,
        height: Number(value.height) || 0, fps: Number(value.fps) || 0, frame_count: Number(value.frame_count) || 0,
        parts: Number(value.parts) || 0, video_count: Number(value.video_count) || 0, has_audio_wav: Boolean(value.has_audio_wav),
        has_audio_config: Boolean(value.has_audio_config)
    } : null;
    return {
        status: String(raw.status || ''),
        schema_version: Number(raw.schema_version) || 0,
        collected_at: Number(raw.collected_at) || 0,
        system: {
            manufacturer: String(system.manufacturer || ''), brand: String(system.brand || ''), model: String(system.model || ''),
            device: String(system.device || ''), product: String(system.product || ''), android: String(system.android || ''),
            sdk: Number(system.sdk) || 0, build_id: String(system.build_id || ''), build_display: String(system.build_display || ''),
            security_patch: String(system.security_patch || ''), slot: String(system.slot || ''), resolution: String(system.resolution || ''),
            density_dpi: Number(system.density_dpi) || 0
        },
        boot: {
            primary_path: String(boot.primary_path || ''),
            primary_path_confidence: String(boot.primary_path_confidence || ''),
            custom_applied: Boolean(boot.custom_applied),
            targets: Array.isArray(boot.targets) ? boot.targets.map(target => ({
                path: String(target?.path || ''), global_present: Boolean(target?.global_present),
                module_overlay: Boolean(target?.module_overlay), stock_backup: Boolean(target?.stock_backup),
                verified_system_path: Boolean(target?.verified_system_path)
            })) : [],
            stock_archive: archive(boot.stock_archive),
            current_archive: archive(boot.current_archive),
            renderer: boot.renderer && typeof boot.renderer === 'object' ? {
                present: Boolean(boot.renderer.present), audio_wav_marker: Boolean(boot.renderer.audio_wav_marker),
                audio_conf_marker: Boolean(boot.renderer.audio_conf_marker)
            } : null,
            audio: boot.audio && typeof boot.audio === 'object' ? {
                state: String(boot.audio.state || ''),
                evidence: Array.isArray(boot.audio.evidence) ? boot.audio.evidence.map(value => String(value)) : [],
                play_sound_property: String(boot.audio.play_sound_property || ''),
                set_volume_property: String(boot.audio.set_volume_property || '')
            } : null,
            global_mount_access: Boolean(boot.global_mount_access),
            path_schema: String(boot.path_schema || '')
        }
    };
}

async function exportHealthDiagnostics() {
    if (!healthSupported()) return;
    try {
        const [healthResponse, infoResponse, probesResponse] = await Promise.all([
            apiFetch('/health/status', { cache: 'no-store' }),
            apiFetch('/info', { cache: 'no-store' }),
            hasModuleFeature('device_intelligence') ? apiFetch('/device/probes', { cache: 'no-store' }) : Promise.resolve(null)
        ]);
        if (!healthResponse.ok || !infoResponse.ok || (probesResponse && !probesResponse.ok)) throw new Error('diagnostics');
        const health = await healthResponse.json();
        const info = await infoResponse.json();
        const probes = probesResponse ? await probesResponse.json() : null;
        const report = {
            format: 'boot-animation-studio-support-report',
            schema_version: 1,
            generated_at: new Date().toISOString(),
            studio: { release: 'P13.11 R4.2.1', locale: String(idiomaAtual || 'en') },
            privacy_manifest: {
                shareable_by_default: true,
                includes: [
                    'module version/capability metadata without bridge identity',
                    'module health checks and storage counters',
                    'device/build and boot-animation compatibility metadata',
                    'system boot-animation paths used only for diagnostics'
                ],
                excludes: [
                    'session tokens and authorization credentials',
                    'trusted-client IDs, public keys and private browser keys',
                    'bridge_id and client IP addresses',
                    'Security Audit and module log contents',
                    'projects, source media, bootanimation archives and History files'
                ],
                note: 'This report is generated from an explicit whitelist. It does not export arbitrary module state.'
            },
            module: sanitizeModuleInfo(info),
            health: sanitizeHealthReport(health),
            device: sanitizeDeviceProbe(probes)
        };
        const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `boot-animation-studio-support-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        alert(healthText('healthExportError', 'Could not export the support report.'));
    }
}

function syncHealthCenterText() {
    const set = (id, key, fallback) => {
        const element = document.getElementById(id);
        if (element) element.textContent = healthText(key, fallback);
    };
    set('health-center-kicker', 'healthKicker', 'MODULE HEALTH');
    set('health-center-title', 'healthTitle', 'Health & diagnostics');
    set('health-center-desc', 'healthDesc', 'Check current module integrity, storage and recoverability without changing anything.');
    set('health-center-refresh-label', 'healthRefresh', 'Run checks');
    set('health-center-export-label', 'healthExport', 'Export support report');
    set('health-checks-title', 'healthChecksTitle', 'Integrity checks');
    set('health-storage-title', 'healthStorageTitle', 'Storage');
    set('health-maintenance-title', 'healthMaintenanceTitle', 'Safe maintenance');
    set('health-maintenance-desc', 'healthMaintenanceDesc', 'Only disposable or unreferenced data detected by the checks appears here.');
    set('health-readonly-note', 'healthReadonlyNote', 'Maintenance is explicit and narrowly scoped. BAS rechecks module health after every action.');
    renderHealthCenter();
}

function bindHealthCenter() {
    document.getElementById('health-center-refresh')?.addEventListener('click', () => refreshHealthCenter());
    document.getElementById('health-center-export')?.addEventListener('click', exportHealthDiagnostics);
    syncHealthCenterText();
}

window.BASHealthCenter = { supported: healthSupported, refresh: refreshHealthCenter, render: renderHealthCenter, sync: renderHealthCenter, syncText: syncHealthCenterText, exportDiagnostics: exportHealthDiagnostics };
window.addEventListener('DOMContentLoaded', bindHealthCenter);
