const healthCenterState = { data: null, loading: false, error: false };

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
    root.hidden = !healthSupported();
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

async function exportHealthDiagnostics() {
    if (!healthSupported()) return;
    try {
        const [healthResponse, infoResponse, probesResponse] = await Promise.all([
            apiFetch('/health/status', { cache: 'no-store' }),
            apiFetch('/info', { cache: 'no-store' }),
            hasModuleFeature('device_intelligence') ? apiFetch('/device/probes', { cache: 'no-store' }) : Promise.resolve(null)
        ]);
        if (!healthResponse.ok || !infoResponse.ok || (probesResponse && !probesResponse.ok)) throw new Error('diagnostics');
        const report = {
            generated_at: new Date().toISOString(),
            health: await healthResponse.json(),
            module: await infoResponse.json(),
            device: probesResponse ? await probesResponse.json() : null
        };
        const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `boot-animation-studio-diagnostics-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        alert(healthText('healthExportError', 'Could not export diagnostics.'));
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
    set('health-center-export-label', 'healthExport', 'Export diagnostics');
    set('health-checks-title', 'healthChecksTitle', 'Integrity checks');
    set('health-storage-title', 'healthStorageTitle', 'Storage');
    set('health-readonly-note', 'healthReadonlyNote', 'This checkpoint is read-only. Repair and cleanup actions will only appear after their safety rules are validated.');
    renderHealthCenter();
}

function bindHealthCenter() {
    document.getElementById('health-center-refresh')?.addEventListener('click', () => refreshHealthCenter());
    document.getElementById('health-center-export')?.addEventListener('click', exportHealthDiagnostics);
    syncHealthCenterText();
}

window.BASHealthCenter = { supported: healthSupported, refresh: refreshHealthCenter, render: renderHealthCenter, sync: renderHealthCenter, syncText: syncHealthCenterText, exportDiagnostics: exportHealthDiagnostics };
window.addEventListener('DOMContentLoaded', bindHealthCenter);
