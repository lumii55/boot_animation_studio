(function() {
    'use strict';

    const VERSION = 1;
    const RELEASE = 'P13.11 R5';
    const HISTORY_KEY = 'bas.developer.regression.history.v1';
    const HISTORY_LIMIT = 5;
    const DEFAULT_TIMEOUT_MS = 7000;
    const STATUS_FACTOR = Object.freeze({ pass: 1, warn: 0.6, fail: 0 });
    const SEVERITY_WEIGHT = Object.freeze({ critical: 12, major: 6, normal: 3, minor: 1 });
    const CATEGORY_ORDER = ['runtime', 'project', 'media', 'sequence', 'composition', 'output', 'persistence', 'ui', 'pwa', 'companion'];

    const registry = [];
    const state = {
        running: false,
        results: [],
        report: null,
        history: [],
        selectedCategory: 'all',
        lastError: ''
    };

    function byId(id) { return document.getElementById(id); }
    function now() { return Date.now(); }
    function round(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function text(key, fallback) {
        try {
            const table = traducoes[idiomaAtual] || traducoes.en;
            return table?.[key] || fallback;
        } catch (_) { return fallback; }
    }
    function safeString(value, max = 260) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
    function canonical(value) {
        if (Array.isArray(value)) return value.map(canonical);
        if (!value || typeof value !== 'object') return value;
        const out = {};
        Object.keys(value).sort().forEach(key => { out[key] = canonical(value[key]); });
        return out;
    }
    function stableStringify(value) { return JSON.stringify(canonical(value)); }
    function testWeight(test) { return SEVERITY_WEIGHT[test.severity] || SEVERITY_WEIGHT.normal; }
    function hasFeature(name) { try { return Boolean(window.hasModuleFeature?.(name)); } catch (_) { return false; } }
    function connected() { try { return Boolean(isConnectedMode && sessionToken); } catch (_) { return false; } }
    function hasProject() { try { return Boolean(currentProject); } catch (_) { return false; } }

    function register(test) {
        if (!test || !test.id || typeof test.run !== 'function') throw new Error('Invalid regression test registration');
        if (registry.some(item => item.id === test.id)) throw new Error(`Duplicate regression test: ${test.id}`);
        registry.push(Object.freeze({
            category: 'runtime', severity: 'normal', timeout: DEFAULT_TIMEOUT_MS,
            ...test
        }));
    }

    function resultDetail(value) {
        if (value == null) return 'OK';
        if (typeof value === 'string') return value;
        if (typeof value === 'object') return safeString(value.detail || value.message || JSON.stringify(value));
        return String(value);
    }

    async function withTimeout(task, timeout, label) {
        let timer = 0;
        try {
            return await Promise.race([
                Promise.resolve().then(task),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout} ms`)), timeout); })
            ]);
        } finally { clearTimeout(timer); }
    }

    function context() {
        let manifest = null;
        let assets = [];
        try { if (hasProject()) manifest = window.BASProjectEngine?.captureManifest?.() || null; } catch (_) {}
        try { if (hasProject()) assets = window.BASProjectEngine?.getAssets?.() || []; } catch (_) {}
        return {
            connected: connected(),
            projectLoaded: hasProject(),
            manifest,
            assets,
            features: Array.from((typeof moduleFeatures !== 'undefined' && moduleFeatures instanceof Set) ? moduleFeatures : []),
            release: RELEASE
        };
    }

    async function runOne(test, ctx) {
        const base = {
            id: test.id,
            name: test.name,
            category: test.category,
            severity: test.severity,
            weight: testWeight(test),
            startedAt: now(),
            durationMs: 0,
            status: 'skip',
            detail: ''
        };
        try {
            const reason = typeof test.requires === 'function' ? await test.requires(ctx) : '';
            if (reason) {
                base.detail = safeString(reason);
                return base;
            }
            const started = performance.now();
            const raw = await withTimeout(() => test.run(ctx), Math.max(250, Number(test.timeout) || DEFAULT_TIMEOUT_MS), test.name);
            base.durationMs = Math.max(0, Math.round(performance.now() - started));
            if (raw && typeof raw === 'object' && ['pass', 'warn', 'fail'].includes(raw.status)) {
                base.status = raw.status;
                base.detail = resultDetail(raw);
            } else {
                base.status = 'pass';
                base.detail = resultDetail(raw);
            }
        } catch (error) {
            base.status = 'fail';
            base.detail = safeString(error?.message || error || 'Failed');
        }
        return base;
    }

    function scoreResults(results) {
        const eligible = results.filter(item => item.status !== 'skip');
        const totalWeight = registry.reduce((sum, item) => sum + testWeight(item), 0);
        const executedWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
        const denominator = Math.max(1, executedWeight);
        let score = 100 * eligible.reduce((sum, item) => sum + item.weight * (STATUS_FACTOR[item.status] ?? 0), 0) / denominator;
        if (eligible.some(item => item.status === 'fail' && item.severity === 'critical')) score = Math.min(score, 60);
        else if (eligible.some(item => item.status === 'fail' && item.severity === 'major')) score = Math.min(score, 85);
        const categories = {};
        CATEGORY_ORDER.forEach(category => {
            const rows = results.filter(item => item.category === category);
            const executed = rows.filter(item => item.status !== 'skip');
            const weight = executed.reduce((sum, item) => sum + item.weight, 0);
            categories[category] = {
                total: rows.length,
                executed: executed.length,
                passed: rows.filter(item => item.status === 'pass').length,
                warnings: rows.filter(item => item.status === 'warn').length,
                failed: rows.filter(item => item.status === 'fail').length,
                skipped: rows.filter(item => item.status === 'skip').length,
                score: weight ? round(100 * executed.reduce((sum, item) => sum + item.weight * (STATUS_FACTOR[item.status] ?? 0), 0) / weight) : null
            };
        });
        return {
            score: round(score),
            coverage: round(100 * executedWeight / Math.max(1, totalWeight)),
            passed: results.filter(item => item.status === 'pass').length,
            warnings: results.filter(item => item.status === 'warn').length,
            failed: results.filter(item => item.status === 'fail').length,
            skipped: results.filter(item => item.status === 'skip').length,
            total: results.length,
            categories
        };
    }

    function loadHistory() {
        try {
            const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            state.history = Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
        } catch (_) { state.history = []; }
        return state.history;
    }

    function saveHistory(report) {
        const slim = {
            id: report.id,
            generated_at: report.generated_at,
            release: report.release,
            score: report.summary.score,
            coverage: report.summary.coverage,
            passed: report.summary.passed,
            warnings: report.summary.warnings,
            failed: report.summary.failed,
            skipped: report.summary.skipped,
            results: report.results.map(item => ({ id: item.id, status: item.status }))
        };
        state.history = [slim, ...state.history.filter(item => item.id !== slim.id)].slice(0, HISTORY_LIMIT);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch (_) {}
    }

    function compareWithPrevious(report) {
        const previous = state.history[0] || null;
        if (!previous) return { previous: null, regressions: [], improvements: [] };
        const prev = new Map((previous.results || []).map(item => [item.id, item.status]));
        const rank = { fail: 0, warn: 1, pass: 2 };
        const regressions = [];
        const improvements = [];
        report.results.forEach(item => {
            if (item.status === 'skip') return;
            const before = prev.get(item.id);
            if (!before || before === 'skip' || !(before in rank)) return;
            if (rank[item.status] < rank[before]) regressions.push({ id: item.id, before, after: item.status });
            if (rank[item.status] > rank[before]) improvements.push({ id: item.id, before, after: item.status });
        });
        return { previous, regressions, improvements };
    }

    function healthLabel(score) {
        if (score >= 95) return text('regressionHealthExcellent', 'Excellent');
        if (score >= 85) return text('regressionHealthGood', 'Good');
        if (score >= 70) return text('regressionHealthWatch', 'Needs attention');
        if (score >= 50) return text('regressionHealthPoor', 'Unhealthy');
        return text('regressionHealthCritical', 'Critical');
    }

    function renderSummary() {
        const report = state.report;
        const root = byId('developer-regression-summary');
        if (!root) return;
        if (!report) {
            root.innerHTML = `<div class="developer-regression-empty">${text('regressionNoScan', 'No full scan has been run in this page session yet.')}</div>`;
            return;
        }
        const summary = report.summary;
        const delta = report.comparison?.previous ? summary.score - Number(report.comparison.previous.score || 0) : null;
        const deltaText = delta == null ? '' : ` <span class="developer-regression-delta ${delta < 0 ? 'is-down' : delta > 0 ? 'is-up' : ''}">${delta > 0 ? '+' : ''}${delta}</span>`;
        root.innerHTML = `
            <div class="developer-regression-score"><strong>${summary.score}</strong><span>/ 100</span><small>${healthLabel(summary.score)}${deltaText}</small></div>
            <div class="developer-regression-score"><strong>${summary.coverage}%</strong><span>${text('regressionCoverage', 'coverage')}</span><small>${summary.total - summary.skipped}/${summary.total} ${text('regressionExecuted', 'executed')}</small></div>
            <div class="developer-regression-counts">
                <span data-state="pass">${summary.passed} ${text('regressionPassed', 'passed')}</span>
                <span data-state="warn">${summary.warnings} ${text('regressionWarnings', 'warnings')}</span>
                <span data-state="fail">${summary.failed} ${text('regressionFailed', 'failed')}</span>
                <span data-state="skip">${summary.skipped} ${text('regressionSkipped', 'untested')}</span>
            </div>`;
    }

    function categoryLabel(category) {
        const labels = {
            runtime: ['regressionCategoryRuntime', 'Runtime'], project: ['regressionCategoryProject', 'Project'],
            media: ['regressionCategoryMedia', 'Media'], sequence: ['regressionCategorySequence', 'Timeline / Sequence'],
            composition: ['regressionCategoryComposition', 'Composition / Audio'], output: ['regressionCategoryOutput', 'Output / Compatibility'],
            persistence: ['regressionCategoryPersistence', 'Persistence'], ui: ['regressionCategoryUi', 'UI / Wiring'],
            pwa: ['regressionCategoryPwa', 'PWA'], companion: ['regressionCategoryCompanion', 'Companion']
        };
        const pair = labels[category] || [category, category];
        return text(pair[0], pair[1]);
    }

    function renderCategories() {
        const root = byId('developer-regression-categories');
        if (!root) return;
        root.innerHTML = '';
        if (!state.report) return;
        CATEGORY_ORDER.forEach(category => {
            const item = state.report.summary.categories[category];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'developer-regression-category';
            card.dataset.category = category;
            if (state.selectedCategory === category) card.dataset.active = 'true';
            const score = item.score == null ? '—' : `${item.score}`;
            card.innerHTML = `<span>${categoryLabel(category)}</span><strong>${score}</strong><small>${item.failed ? `${item.failed} ${text('regressionFailed', 'failed')}` : `${item.executed}/${item.total}`}</small>`;
            card.addEventListener('click', () => {
                state.selectedCategory = state.selectedCategory === category ? 'all' : category;
                renderCategories(); renderResults();
            });
            root.appendChild(card);
        });
    }

    function renderResults() {
        const root = byId('developer-regression-results');
        if (!root) return;
        root.innerHTML = '';
        const rows = state.results.filter(item => state.selectedCategory === 'all' || item.category === state.selectedCategory);
        if (!rows.length) {
            root.innerHTML = `<div class="developer-lab-empty">${state.running ? text('regressionRunning', 'Scanning…') : text('regressionNoResults', 'No scan results yet.')}</div>`;
            return;
        }
        rows.forEach(item => {
            const row = document.createElement('article');
            row.className = 'developer-regression-result';
            row.dataset.state = item.status;
            const label = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = item.name;
            const meta = document.createElement('span');
            meta.textContent = `${categoryLabel(item.category)} · ${item.severity.toUpperCase()} · ${item.durationMs || 0} ms`;
            const detail = document.createElement('small');
            detail.textContent = item.detail || '';
            label.append(title, meta, detail);
            const badge = document.createElement('b');
            badge.textContent = item.status.toUpperCase();
            row.append(label, badge);
            root.appendChild(row);
        });
    }

    function renderComparison() {
        const root = byId('developer-regression-comparison');
        if (!root) return;
        root.innerHTML = '';
        const comparison = state.report?.comparison;
        if (!comparison?.previous) {
            root.textContent = text('regressionNoPrevious', 'No previous scan is available for comparison.');
            return;
        }
        const header = document.createElement('div');
        header.className = 'developer-regression-compare-head';
        header.textContent = `${text('regressionPrevious', 'Previous')}: ${comparison.previous.score}/100 · ${comparison.previous.coverage}% ${text('regressionCoverage', 'coverage')}`;
        root.appendChild(header);
        if (!comparison.regressions.length && !comparison.improvements.length) {
            const stable = document.createElement('div'); stable.className = 'developer-lab-empty';
            stable.textContent = text('regressionStable', 'No pass/warn/fail status changed since the previous scan.'); root.appendChild(stable); return;
        }
        comparison.regressions.forEach(item => {
            const row = document.createElement('div'); row.className = 'developer-regression-change is-regression';
            row.textContent = `↓ ${item.id}: ${item.before.toUpperCase()} → ${item.after.toUpperCase()}`; root.appendChild(row);
        });
        comparison.improvements.forEach(item => {
            const row = document.createElement('div'); row.className = 'developer-regression-change is-improvement';
            row.textContent = `↑ ${item.id}: ${item.before.toUpperCase()} → ${item.after.toUpperCase()}`; root.appendChild(row);
        });
    }

    function renderHistory() {
        const root = byId('developer-regression-history');
        if (!root) return;
        root.innerHTML = '';
        if (!state.history.length) { root.textContent = text('regressionHistoryEmpty', 'No saved scans yet.'); return; }
        state.history.forEach(item => {
            const row = document.createElement('div'); row.className = 'developer-regression-history-row';
            const stamp = new Date(item.generated_at).toLocaleString();
            row.innerHTML = `<span>${stamp}</span><strong>${item.score}/100</strong><small>${item.coverage}%</small>`;
            root.appendChild(row);
        });
    }

    function render() { renderSummary(); renderCategories(); renderResults(); renderComparison(); renderHistory(); syncText(); }

    function syncText() {
        const set = (id, key, fallback) => { const el = byId(id); if (el) el.textContent = text(key, fallback); };
        set('developer-regression-title', 'regressionTitle', 'Full Regression Scanner');
        set('developer-regression-desc', 'regressionDesc', 'Deep, read-only validation across editor owners, persistence, UI wiring, PWA and connected Companion read paths.');
        set('developer-regression-run', state.running ? 'regressionRunning' : 'regressionRun', state.running ? 'Scanning…' : 'Run Full BAS Scan');
        set('developer-regression-copy', 'regressionCopy', 'Copy report');
        set('developer-regression-clear-history', 'regressionClearHistory', 'Clear scan history');
        set('developer-regression-comparison-title', 'regressionComparisonTitle', 'Changes since previous scan');
        set('developer-regression-history-title', 'regressionHistoryTitle', 'Recent local scans');
        const button = byId('developer-regression-run'); if (button) button.disabled = state.running;
    }

    async function run(options = {}) {
        if (state.running) return state.report;
        state.running = true;
        state.results = [];
        state.report = null;
        state.selectedCategory = 'all';
        state.lastError = '';
        loadHistory();
        render();
        const startedAt = now();
        const ctx = context();
        try {
            for (const test of registry) {
                const result = await runOne(test, ctx);
                state.results.push(result);
                renderResults();
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            const summary = scoreResults(state.results);
            const report = {
                format: 'boot-animation-studio-regression-report', version: 1,
                id: `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                generated_at: new Date().toISOString(), release: RELEASE,
                duration_ms: Math.max(0, now() - startedAt), summary,
                environment: {
                    locale: String(typeof idiomaAtual !== 'undefined' ? idiomaAtual : navigator.language || 'en'),
                    connected: ctx.connected,
                    project_loaded: ctx.projectLoaded,
                    api_version: typeof moduleApiVersion !== 'undefined' ? moduleApiVersion : null,
                    capability_count: ctx.features.length
                },
                results: state.results.map(item => ({ ...item }))
            };
            report.comparison = compareWithPrevious(report);
            state.report = report;
            saveHistory(report);
            if (!options.silent) window.BASDeveloperLab?.notify?.(`${summary.score}/100 · ${summary.coverage}%`, summary.failed ? 'warning' : 'success');
            return report;
        } catch (error) {
            state.lastError = safeString(error?.message || error);
            throw error;
        } finally {
            state.running = false;
            render();
        }
    }

    async function copyReport() {
        if (!state.report) return false;
        const sanitized = {
            ...state.report,
            comparison: state.report.comparison ? {
                previous: state.report.comparison.previous ? {
                    generated_at: state.report.comparison.previous.generated_at,
                    score: state.report.comparison.previous.score,
                    coverage: state.report.comparison.previous.coverage
                } : null,
                regressions: state.report.comparison.regressions,
                improvements: state.report.comparison.improvements
            } : null
        };
        const value = JSON.stringify(sanitized, null, 2);
        let ok = false;
        try { await navigator.clipboard.writeText(value); ok = true; } catch (_) {
            try { const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); ok = document.execCommand('copy'); area.remove(); } catch (_) {}
        }
        window.BASDeveloperLab?.notify?.(ok ? text('developerLabCopied', 'Copied.') : text('developerLabCopyFailed', 'Could not copy.'), ok ? 'success' : 'error');
        return ok;
    }

    function clearHistory() {
        state.history = [];
        try { localStorage.removeItem(HISTORY_KEY); } catch (_) {}
        renderHistory(); renderComparison();
    }

    async function jsonEndpoint(path, feature = '') {
        if (!connected()) throw new Error('Not connected');
        if (feature && !hasFeature(feature)) throw new Error(`Capability unavailable: ${feature}`);
        const response = await apiFetch(path, { cache: 'no-store', signal: AbortSignal.timeout(5500) });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || `${path} ${response.status}`);
        return data;
    }

    // ---- Registry: runtime / contracts ----
    register({ id: 'runtime.canonical-owners', name: 'Canonical owner availability', category: 'runtime', severity: 'critical', run: () => {
        const owners = ['BASProjectEngine','BASSourceLibrary','BASMasterSequence','BASComposition','BASOutputPresets','BASCompatibility','BASAutosave','BASProjectFile','BASProjectRestore','BASMediaSeek','BASDeveloperLab'];
        const missing = owners.filter(name => !window[name]); if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`); return `${owners.length} owners available`;
    }});
    register({ id: 'runtime.crypto', name: 'WebCrypto SHA-256 determinism', category: 'runtime', severity: 'major', run: async () => {
        if (!crypto?.subtle) throw new Error('WebCrypto unavailable');
        const bytes = new TextEncoder().encode('BAS regression scanner');
        const a = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const b = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        if (a.length !== 32 || a.some((value, index) => value !== b[index])) throw new Error('SHA-256 mismatch'); return '32-byte deterministic digest';
    }});
    register({ id: 'runtime.jszip', name: 'JSZip in-memory roundtrip', category: 'runtime', severity: 'major', run: async () => {
        if (typeof JSZip === 'undefined') throw new Error('JSZip unavailable'); const zip = new JSZip(); zip.file('probe.txt', 'bas-ok');
        const blob = await zip.generateAsync({ type: 'blob' }); const read = await JSZip.loadAsync(blob); const value = await read.file('probe.txt').async('text');
        if (value !== 'bas-ok') throw new Error('ZIP roundtrip mismatch'); return `${blob.size} bytes`;
    }});
    register({ id: 'runtime.connection-lifecycle', name: 'Connection lifecycle / BFCache contract', category: 'runtime', severity: 'major', run: () => {
        const owner = window.BASConnectionLifecycle;
        if (!owner || typeof owner.status !== 'function' || typeof owner.shouldDisconnectOnPageHide !== 'function') throw new Error('Lifecycle owner unavailable');
        if (owner.shouldDisconnectOnPageHide({ type: 'pagehide', persisted: true }) !== false) throw new Error('BFCache pagehide would disconnect');
        if (owner.shouldDisconnectOnPageHide({ type: 'pagehide', persisted: false }) !== true) throw new Error('Real page exit would not disconnect');
        return 'BFCache preserved · real exits disconnect';
    }});
    register({ id: 'runtime.media-seek-clamp', name: 'Media seek boundary clamp', category: 'media', severity: 'major', run: () => {
        const fake = { duration: 10 }; const value = BASMediaSeek.clampTarget(fake, 99, 0.001); if (!(value > 9.99 && value < 10)) throw new Error(`Unexpected clamp ${value}`); return value.toFixed(3);
    }});
    register({ id: 'runtime.media-seek-ready', name: 'Media frame readiness contract', category: 'media', severity: 'normal', run: () => {
        const ready = BASMediaSeek.isFrameReady({ readyState: 2, videoWidth: 10, videoHeight: 10, tagName: 'VIDEO', error: null });
        const bad = BASMediaSeek.isFrameReady({ readyState: 1, videoWidth: 10, videoHeight: 10, tagName: 'VIDEO', error: null });
        if (!ready || bad) throw new Error('Readiness contract mismatch'); return 'ready / not-ready distinguished';
    }});

    // ---- Project / editor state ----
    register({ id: 'project.engine-contract', name: 'Project Engine API contract', category: 'project', severity: 'critical', run: () => {
        const required = ['captureManifest','getAssets','validateManifest','migrateManifest','restoreState','commitRestoredState','sync','touch','markClean','suspend'];
        const missing = required.filter(name => typeof BASProjectEngine[name] !== 'function'); if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
        if (!(Number(BASProjectEngine.schemaVersion) > 0)) throw new Error('Invalid schema version'); return `engine ${BASProjectEngine.engineVersion} · schema ${BASProjectEngine.schemaVersion}`;
    }});
    register({ id: 'project.reject-malformed', name: 'Malformed manifest rejection', category: 'project', severity: 'critical', run: () => {
        if (BASProjectEngine.validateManifest({ format: 'boot-animation-studio-project', schemaVersion: BASProjectEngine.schemaVersion })) throw new Error('Malformed manifest accepted'); return 'Rejected';
    }});
    register({ id: 'project.reject-future-schema', name: 'Future project schema rejection', category: 'project', severity: 'critical', run: () => {
        const future = { format:'boot-animation-studio-project', schemaVersion:Number(BASProjectEngine.schemaVersion)+99, project:{}, source:{}, editor:{} };
        let rejected = false; try { BASProjectEngine.migrateManifest(future); } catch (_) { rejected = true; } if (!rejected) throw new Error('Future schema accepted'); return 'Rejected safely';
    }});
    register({ id: 'project.current-valid', name: 'Current project manifest validity', category: 'project', severity: 'critical', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: ctx => {
        if (!ctx.manifest || !BASProjectEngine.validateManifest(ctx.manifest)) throw new Error('Current manifest invalid'); return `schema ${ctx.manifest.schemaVersion}`;
    }});
    register({ id: 'project.capture-deterministic', name: 'Manifest capture stability', category: 'project', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        const a = stableStringify(BASProjectEngine.captureManifest()); const b = stableStringify(BASProjectEngine.captureManifest()); if (a !== b) throw new Error('Back-to-back captures differ'); return `${a.length} serialized chars`;
    }});
    register({ id: 'project.migrate-idempotent', name: 'Current manifest migration idempotence', category: 'project', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: ctx => {
        const migrated = BASProjectEngine.migrateManifest(clone(ctx.manifest)); if (!BASProjectEngine.validateManifest(migrated)) throw new Error('Migrated manifest invalid');
        if (stableStringify(migrated) !== stableStringify(ctx.manifest)) return { status:'warn', detail:'Current-schema migration normalizes fields' }; return 'Stable';
    }});
    register({ id: 'project.asset-inventory', name: 'Project asset inventory integrity', category: 'project', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: ctx => {
        const keys = new Set(); for (const asset of ctx.assets) { if (!asset?.key) throw new Error('Asset without key'); if (keys.has(asset.key)) throw new Error(`Duplicate asset key ${asset.key}`); keys.add(asset.key); if (!(asset.blob instanceof Blob)) throw new Error(`Asset ${asset.key} is not a Blob`); } return `${ctx.assets.length} unique assets`;
    }});
    register({ id: 'project.source-library', name: 'Source Library invariants', category: 'media', severity: 'critical', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        const sources = BASSourceLibrary.getAll(); const ids = new Set(); sources.forEach(source => { if (!source?.id) throw new Error('Source without id'); if (ids.has(source.id)) throw new Error(`Duplicate source ${source.id}`); ids.add(source.id); });
        const primary = BASSourceLibrary.getPrimaryId(); if (sources.length && (!primary || !BASSourceLibrary.getById(primary))) throw new Error('Primary source missing'); return `${sources.length} source(s)`;
    }});
    register({ id: 'project.source-serialize', name: 'Source Library serialization', category: 'media', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        const value = BASSourceLibrary.serialize(); if (!value || !Array.isArray(value.sources)) throw new Error('Invalid serialized library');
        const ids = value.sources.map(item => item.id); if (new Set(ids).size !== ids.length) throw new Error('Serialized duplicate source IDs'); return `${value.sources.length} serialized source(s)`;
    }});
    register({ id: 'project.master-sequence', name: 'Master Sequence referential integrity', category: 'sequence', severity: 'critical', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        const value = BASMasterSequence.serialize(); if (!Array.isArray(value.clips)) throw new Error('Invalid sequence');
        const seen = new Set(); value.clips.forEach(clip => { if (!clip.id || seen.has(clip.id)) throw new Error('Duplicate/empty clip id'); seen.add(clip.id); if (!BASSourceLibrary.getById(clip.sourceId)) throw new Error(`Missing source ${clip.sourceId}`); if (!(Number(clip.out) >= Number(clip.in))) throw new Error(`Invalid clip range ${clip.id}`); });
        return `${value.clips.length} clip(s) · ${BASMasterSequence.getDuration().toFixed(3)} s`;
    }});
    register({ id: 'project.master-layout', name: 'Master Sequence layout continuity', category: 'sequence', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        const layout = BASMasterSequence.getLayout(); let cursor = 0; layout.forEach(item => { if (Math.abs(Number(item.start) - cursor) > 0.002) throw new Error('Sequence gap/overlap'); if (Number(item.end) < Number(item.start)) throw new Error('Negative duration'); cursor = Number(item.end); });
        if (Math.abs(cursor - BASMasterSequence.getDuration()) > 0.002) throw new Error('Duration mismatch'); return `${layout.length} contiguous segment(s)`;
    }});
    register({ id: 'project.timeline-owners', name: 'Timeline owner contracts', category: 'sequence', severity: 'major', run: () => {
        const missing = []; if (!window.BASSequenceTimeline) missing.push('BASSequenceTimeline'); if (!window.BASTimeline3) missing.push('BASTimeline3'); if (missing.length) throw new Error(`Missing ${missing.join(', ')}`);
        return 'Timeline 1 + sequence infrastructure + Timeline 3 present';
    }});
    register({ id: 'project.no-timeline4', name: 'NO_TIMELINE_4 invariant', category: 'sequence', severity: 'minor', run: () => {
        const scripts = Array.from(document.scripts).map(item => item.src).filter(Boolean); if (scripts.some(src => /timeline-4(?:\.|-)/i.test(src))) throw new Error('TIMELINE 4 DETECTED 😭'); return 'Still safely nonexistent';
    }});
    register({ id: 'project.composition-valid', name: 'Composition validity', category: 'composition', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        const validation = BASComposition.validate(); if (!validation?.valid) throw new Error(validation?.message || 'Composition invalid'); return `${BASComposition.getLayers().length} layer(s)`;
    }});
    register({ id: 'project.composition-keyframes', name: 'Composition keyframe ordering', category: 'composition', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: () => {
        let total = 0; BASComposition.getLayers().forEach(layer => { const frames = BASComposition.getKeyframes(layer.id); total += frames.length; for (let i=1;i<frames.length;i++) if (Number(frames[i].time) < Number(frames[i-1].time)) throw new Error(`Unsorted keyframes in ${layer.id}`); }); return `${total} keyframe(s)`;
    }});
    register({ id: 'project.composition-deterministic', name: 'Composition interpolation determinism', category: 'composition', severity: 'major', requires: ctx => ctx.projectLoaded && BASComposition.getLayers().length ? '' : 'No composition layers', run: () => {
        for (const layer of BASComposition.getLayers()) { const t = Math.max(Number(layer.start)||0, Math.min(Number(layer.end)||0, ((Number(layer.start)||0)+(Number(layer.end)||0))/2)); const a = BASComposition.getResolvedTransform(layer.id,t); const b = BASComposition.getResolvedTransform(layer.id,t); if (stableStringify(a)!==stableStringify(b)) throw new Error(`Non-deterministic transform ${layer.id}`); } return 'Stable at midpoint';
    }});
    register({ id: 'project.audio-state', name: 'Audio manifest state', category: 'composition', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: ctx => {
        const audio = ctx.manifest?.editor?.audio; if (!audio || typeof audio !== 'object') throw new Error('Audio state missing from manifest'); return audio.enabled ? 'Enabled state serialized' : 'Disabled state serialized';
    }});
    register({ id: 'project.parts-state', name: 'Parts manifest state', category: 'sequence', severity: 'major', requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: ctx => {
        const advanced = ctx.manifest?.editor?.advanced; if (!advanced || typeof advanced !== 'object') throw new Error('Advanced Parts state missing from manifest'); return Array.isArray(advanced.parts) ? `${advanced.parts.length} part(s)` : 'Advanced Parts state available';
    }});

    // ---- Output / compatibility ----
    register({ id: 'output.presets-contract', name: 'Output preset registry', category: 'output', severity: 'major', run: () => {
        const defs = BASOutputPresets.getDefinitions(); if (!Array.isArray(defs) || defs.length < 5) throw new Error('Preset definitions missing'); const ids = defs.map(item=>item.id); if (new Set(ids).size!==ids.length) throw new Error('Duplicate preset ids');
        const expected = ['source-quality','balanced','lightweight','lossless','match-device','imported-original']; const missing = expected.filter(id=>!ids.includes(id)); if (missing.length) throw new Error(`Missing ${missing.join(', ')}`); return `${defs.length} deterministic presets`;
    }});
    register({ id: 'output.preset-resolvers', name: 'Output preset resolver contracts', category: 'output', severity: 'normal', run: () => {
        const defs = BASOutputPresets.getDefinitions(); const bad = defs.filter(item => typeof item.resolve !== 'function' || !item.id); if (bad.length) throw new Error(`${bad.length} invalid preset definition(s)`); return 'All resolvers callable';
    }});
    register({ id: 'output.compatibility-owner', name: 'Compatibility analyzer contract', category: 'output', severity: 'critical', run: () => {
        if (typeof BASCompatibility.analyze !== 'function' || typeof BASCompatibility.getResult !== 'function') throw new Error('Compatibility owner incomplete'); return `v${BASCompatibility.version}`;
    }});
    register({ id: 'output.compatibility-unknown', name: 'Unknown compatibility remains representable', category: 'output', severity: 'major', run: () => {
        const source = BASCompatibility.getResult?.() || BASCompatibility.analyze?.(); if (!source || typeof source !== 'object') throw new Error('Compatibility result unavailable');
        const allowedScopes = new Set(['ready','warning','blocked','unknown']); const allowedSeverity = new Set(['blocked','warning','unknown','info']);
        const invalidScope = Object.entries(source.scopes || {}).find(([,value]) => !allowedScopes.has(String(value)));
        const invalidDiagnostic = (source.diagnostics || []).find(item => !allowedSeverity.has(String(item?.severity || '')));
        if (invalidScope || invalidDiagnostic) throw new Error('Compatibility state enum drift');
        const encoded = stableStringify(source).toLowerCase(); return encoded.includes('unknown') || encoded.includes('unavailable') || encoded.includes('pending') ? 'Unknown/unavailable state represented' : 'Current result fully known · unknown remains a valid analyzer state';
    }});
    register({ id: 'output.device-profile-contract', name: 'Device profile contract', category: 'output', severity: 'normal', run: () => {
        if (!window.BASDeviceProfile || typeof BASDeviceProfile.getResolution !== 'function') throw new Error('Device Profile unavailable'); return `v${BASDeviceProfile.version || 'current'}`;
    }});

    // ---- Persistence ----
    register({ id: 'persistence.localstorage', name: 'localStorage scratch roundtrip', category: 'persistence', severity: 'major', run: () => {
        const key = `bas-regression-${Math.random().toString(36).slice(2)}`; try { localStorage.setItem(key,'ok'); if(localStorage.getItem(key)!=='ok') throw new Error('Mismatch'); } finally { localStorage.removeItem(key); } return 'Read/write/delete OK';
    }});
    register({ id: 'persistence.sessionstorage', name: 'sessionStorage scratch roundtrip', category: 'persistence', severity: 'normal', run: () => {
        const key = `bas-regression-${Math.random().toString(36).slice(2)}`; try { sessionStorage.setItem(key,'ok'); if(sessionStorage.getItem(key)!=='ok') throw new Error('Mismatch'); } finally { sessionStorage.removeItem(key); } return 'Read/write/delete OK';
    }});
    register({ id: 'persistence.indexeddb-scratch', name: 'IndexedDB scratch transaction', category: 'persistence', severity: 'critical', timeout:10000, run: async () => {
        if (!indexedDB) throw new Error('IndexedDB unavailable'); const name = `bas-regression-${Date.now()}-${Math.random()}`;
        try { await new Promise((resolve,reject)=>{ const req=indexedDB.open(name,1); req.onupgradeneeded=()=>req.result.createObjectStore('probe'); req.onerror=()=>reject(req.error); req.onsuccess=()=>{ const db=req.result; const tx=db.transaction('probe','readwrite'); tx.objectStore('probe').put('ok','key'); tx.oncomplete=()=>{ const rtx=db.transaction('probe'); const get=rtx.objectStore('probe').get('key'); get.onsuccess=()=>{ const value=get.result; db.close(); value==='ok'?resolve():reject(new Error('IndexedDB value mismatch')); }; get.onerror=()=>reject(get.error); }; tx.onerror=()=>reject(tx.error); }; }); } finally { try { indexedDB.deleteDatabase(name); } catch (_) {} } return 'Scratch DB transaction OK';
    }});
    register({ id: 'persistence.autosave-read', name: 'Autosave index read', category: 'persistence', severity: 'major', run: async () => {
        const list = await BASAutosave.list(); if (!Array.isArray(list)) throw new Error('Autosave list is not an array'); const status=BASAutosave.status(); if(!status||typeof status!=='object') throw new Error('Autosave status unavailable'); return `${list.length} record(s)`;
    }});
    register({ id: 'persistence.project-file-contract', name: '.basproject API contract', category: 'persistence', severity: 'critical', run: () => {
        const required=['build','open','read','readLoaded','migrateContainer']; const missing=required.filter(name=>typeof BASProjectFile[name]!=='function'); if(missing.length) throw new Error(`Missing: ${missing.join(', ')}`); return `container v${BASProjectFile.containerVersion}`;
    }});
    register({ id: 'persistence.project-package-roundtrip', name: '.basproject package readback', category: 'persistence', severity: 'critical', timeout:20000, requires: ctx => ctx.projectLoaded ? '' : 'No project loaded', run: async () => {
        const built = await BASProjectFile.build(); const blob = built?.blob; if (!(blob instanceof Blob) || blob.size<=0) throw new Error('Project package build failed'); const loaded = await BASProjectFile.read(blob); if (!loaded?.manifest || !BASProjectEngine.validateManifest(BASProjectEngine.migrateManifest(loaded.manifest))) throw new Error('Readback manifest invalid'); return `${Math.round(blob.size/1024)} KB package readback OK`;
    }});
    register({ id: 'persistence.restore-contract', name: 'Project restore API contract', category: 'persistence', severity: 'major', run: () => {
        const required=['restore','openSource','toFile','waitForCondition']; const missing=required.filter(name=>typeof BASProjectRestore[name]!=='function'); if(missing.length) throw new Error(`Missing: ${missing.join(', ')}`); return `v${BASProjectRestore.version}`;
    }});
    register({ id: 'persistence.undo-redo-status', name: 'Undo/Redo runtime status', category: 'persistence', severity: 'normal', run: () => {
        const status=window.BASProjectHistory?.status?.(); if(!status||typeof status!=='object') throw new Error('History status unavailable'); return JSON.stringify(status).slice(0,140);
    }});

    // ---- UI / wiring ----
    register({ id: 'ui.duplicate-ids', name: 'DOM ID uniqueness', category: 'ui', severity: 'critical', run: () => {
        const ids=Array.from(document.querySelectorAll('[id]')).map(el=>el.id); const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))]; if(dup.length) throw new Error(`Duplicate IDs: ${dup.slice(0,8).join(', ')}`); return `${ids.length} unique ids`;
    }});
    register({ id: 'ui.script-uniqueness', name: 'Classic script uniqueness', category: 'ui', severity: 'major', run: () => {
        const src=Array.from(document.scripts).map(s=>s.src).filter(Boolean); const dup=[...new Set(src.filter((v,i)=>src.indexOf(v)!==i))]; if(dup.length) throw new Error(`${dup.length} duplicate scripts`); return `${src.length} script(s)`;
    }});
    register({ id: 'ui.stylesheets', name: 'Stylesheet accessibility', category: 'ui', severity: 'major', run: () => {
        const sheets=Array.from(document.styleSheets); let failed=0; sheets.forEach(sheet=>{ try { void sheet.cssRules; } catch (_) { if(!sheet.href || new URL(sheet.href,location.href).origin===location.origin) failed++; } }); if(failed) throw new Error(`${failed} same-origin stylesheet(s) unreadable`); return `${sheets.length} stylesheet(s)`;
    }});
    register({ id: 'ui.i18n-parity', name: 'Translation key parity', category: 'ui', severity: 'major', run: () => {
        const locales=Object.keys(traducoes||{}); if(!locales.length) throw new Error('No translations'); const base=new Set(Object.keys(traducoes[locales[0]]||{})); const mismatches=[]; locales.slice(1).forEach(locale=>{ const keys=new Set(Object.keys(traducoes[locale]||{})); const missing=[...base].filter(k=>!keys.has(k)); const extra=[...keys].filter(k=>!base.has(k)); if(missing.length||extra.length)mismatches.push(`${locale} -${missing.length} +${extra.length}`); }); if(mismatches.length) throw new Error(mismatches.join('; ')); return `${base.size} keys × ${locales.length} locales`;
    }});
    register({ id: 'ui.i18n-placeholders', name: 'Translation placeholder parity', category: 'ui', severity: 'major', run: () => {
        const locales=Object.keys(traducoes||{}); const base=traducoes[locales[0]]||{}; const tokens=s=>[...String(s||'').matchAll(/\{[A-Za-z0-9_]+\}/g)].map(m=>m[0]).sort().join('|'); const bad=[]; Object.keys(base).forEach(key=>{ const expected=tokens(base[key]); locales.slice(1).forEach(locale=>{ if(tokens(traducoes[locale]?.[key])!==expected) bad.push(`${locale}:${key}`); }); }); if(bad.length) throw new Error(`Placeholder mismatches: ${bad.slice(0,6).join(', ')}`); return 'Placeholders aligned';
    }});
    register({ id: 'ui.actionable-identities', name: 'Actionable control identities', category: 'ui', severity: 'minor', run: () => {
        const nodes=Array.from(document.querySelectorAll('button,input,select,textarea')); const stable=el=>Boolean(el.id||el.name||el.onclick||el.getAttribute('aria-label')||el.getAttribute('aria-controls')||Object.keys(el.dataset||{}).length||el.labels?.length); const anonymous=nodes.filter(el=>!stable(el)); if(anonymous.length>15) return {status:'warn',detail:`${anonymous.length} controls without stable identity`}; return `${nodes.length-anonymous.length}/${nodes.length} identifiable`;
    }});
    register({ id: 'ui.developer-lab-wiring', name: 'Developer Lab wiring', category: 'ui', severity: 'major', run: () => {
        const ids=['developer-lab','developer-lab-launcher','developer-regression-run','developer-regression-results']; const missing=ids.filter(id=>!byId(id)); if(missing.length) throw new Error(`Missing: ${missing.join(', ')}`); return 'Hidden lab surfaces present';
    }});

    // ---- PWA ----
    register({ id: 'ui.developer-lab-modal-layering', name: 'Developer Lab confirmation layering', category: 'ui', severity: 'major', run: () => {
        const lab=byId('developer-lab'), modal=byId('modal-confirm'); if(!lab||!modal) throw new Error('Developer Lab or confirmation modal missing');
        const labZ=Number.parseInt(getComputedStyle(lab).zIndex,10)||0, modalZ=Number.parseInt(getComputedStyle(modal).zIndex,10)||0;
        if(modalZ<=labZ) throw new Error(`Confirmation modal hidden behind Developer Lab (${modalZ} <= ${labZ})`); return `confirmation ${modalZ} > lab ${labZ}`;
    }});
    register({ id: 'pwa.manifest', name: 'PWA manifest parse', category: 'pwa', severity: 'major', run: async () => {
        const response=await fetch('./manifest.webmanifest',{cache:'no-store'}); if(!response.ok) throw new Error(`manifest ${response.status}`); const data=await response.json(); if(!data.name||!data.start_url||!Array.isArray(data.icons)||!data.icons.length) throw new Error('Manifest fields incomplete'); return `${data.icons.length} icon(s)`;
    }});
    register({ id: 'pwa.service-worker-source', name: 'Service Worker source contract', category: 'pwa', severity: 'critical', run: async () => {
        const response=await fetch('./service-worker.js',{cache:'no-store'}); if(!response.ok) throw new Error(`SW ${response.status}`); const source=await response.text(); if(!/const\s+BAS_CACHE\s*=/.test(source)||!source.includes("request.mode === 'navigate'")) throw new Error('Service Worker contract missing'); return `${source.length} chars`;
    }});
    register({ id: 'pwa.service-worker-registration', name: 'Service Worker registration', category: 'pwa', severity: 'normal', run: async () => {
        if(!('serviceWorker' in navigator)) throw new Error('Service Worker unsupported'); const reg=await navigator.serviceWorker.getRegistration('./'); return reg ? 'Registered' : {status:'warn',detail:'Supported but not registered in this browsing context'};
    }});
    register({ id: 'pwa.shell-integrity', name: 'PWA shell asset reachability', category: 'pwa', severity: 'critical', timeout:30000, run: async () => {
        const response=await fetch('./service-worker.js',{cache:'no-store'}); const source=await response.text(); const match=source.match(/const\s+BAS_SHELL\s*=\s*(\[[\s\S]*?\]);/); if(!match) throw new Error('BAS_SHELL not found'); const list=JSON.parse(match[1]); let failed=[]; for(const path of list){ try{ const r=await fetch(path,{cache:'no-store'}); if(!r.ok)failed.push(`${path}:${r.status}`);}catch(e){failed.push(path);} } if(failed.length) throw new Error(`${failed.length} unreachable: ${failed.slice(0,4).join(', ')}`); return `${list.length}/${list.length} assets reachable`;
    }});
    register({ id: 'pwa.cache-version', name: 'PWA cache version matches release', category: 'pwa', severity: 'normal', run: async () => {
        const source=await (await fetch('./service-worker.js',{cache:'no-store'})).text(); const cache=source.match(/const\s+BAS_CACHE\s*=\s*['"]([^'"]+)/)?.[1]||''; if(!cache) throw new Error('Cache name missing'); if(!cache.includes('p13-11-r5')) return {status:'warn',detail:`Unexpected cache name ${cache}`}; return cache;
    }});

    // ---- Connected Companion: read-only ----
    const requireConnected = () => connected() ? '' : text('developerLabNotConnected', 'Not connected');
    register({ id: 'companion.info', name: 'Companion /info', category: 'companion', severity: 'critical', requires:requireConnected, run:async()=>{ const r=await localNetworkFetch(IP_LOCAL+'/info',{cache:'no-store',signal:AbortSignal.timeout(5000)}); const d=await r.json().catch(()=>null); if(!r.ok||!Number.isInteger(Number(d?.api_version)))throw new Error('/info invalid'); return `API ${d.api_version} · ${(d.features||[]).length} capabilities`; }});
    register({ id: 'companion.ping', name: 'Authorized /ping', category: 'companion', severity: 'critical', requires:requireConnected, run:async()=>{ const d=await jsonEndpoint('/ping'); if(d?.status!=='ok')throw new Error('Unexpected ping status'); return d.permission||'authorized'; }});
    register({ id: 'companion.capabilities', name: 'Capability set integrity', category: 'companion', severity: 'major', requires:requireConnected, run:()=>{ const values=Array.from(moduleFeatures||[]); if(values.some(v=>typeof v!=='string'||!v.trim()))throw new Error('Invalid capability'); if(new Set(values).size!==values.length)throw new Error('Duplicate capability'); return `${values.length} capabilities`; }});
    register({ id: 'companion.live-capability-gating', name: 'Live capability gating', category: 'companion', severity: 'major', requires:requireConnected, run:()=>{ const expected=hasFeature('live_events')&&hasFeature('state_revisions'); const actual=Boolean(window.BASLiveSync?.supported?.()); if(actual!==expected)throw new Error(`Live gating mismatch: advertised=${expected} runtime=${actual}`); return expected?'Live endpoints enabled by capability':'Legacy fallback · no /live/* assumption'; }});
    register({ id: 'companion.coordination-capability-gating', name: 'Presence / coordination capability gating', category: 'companion', severity: 'normal', requires:requireConnected, run:()=>{ const expectedPresence=hasFeature('client_presence'); const expectedCoordination=hasFeature('operation_coordination'); const actualPresence=Boolean(window.BASPresence?.supported?.()); const actualCoordination=Boolean(window.BASPresence?.operationSupported?.()); if(actualPresence!==expectedPresence||actualCoordination!==expectedCoordination)throw new Error('Presence/coordination gating mismatch'); return `${expectedPresence?'presence':'no presence'} · ${expectedCoordination?'coordination':'no coordination'}`; }});
    register({ id: 'companion.live-revisions', name: 'Live revision snapshot', category: 'companion', severity: 'major', requires:()=>connected()&&window.BASLiveSync?.supported?.()?'':'Live Sync unavailable', run:async()=>{ const d=await BASLiveSync.fetchSnapshot('full-regression'); if(!d||typeof d.epoch!=='string'||!d.revisions)throw new Error('Invalid revision snapshot'); return `${Object.keys(d.revisions).length} domains`; }});
    register({ id: 'companion.presence', name: 'Presence status', category: 'companion', severity: 'normal', requires:()=>connected()&&hasFeature('client_presence')?'':'Presence unavailable', run:async()=>{ const d=await jsonEndpoint('/presence/status','client_presence'); if(!Array.isArray(d.clients))throw new Error('clients missing'); return `${d.clients.length} live stream(s)`; }});
    register({ id: 'companion.history', name: 'History read path', category: 'companion', severity: 'normal', requires:()=>connected()&&hasFeature('history')?'':'History unavailable', run:async()=>{ const d=await jsonEndpoint('/history/items','history'); if(!Array.isArray(d))throw new Error('History payload invalid'); return `${d.length} item(s)`; }});
    register({ id: 'companion.playlists', name: 'Playlist read path', category: 'companion', severity: 'major', requires:()=>connected()&&hasFeature('playlists')?'':'Playlists unavailable', run:async()=>{ const d=await jsonEndpoint('/playlist/list','playlists'); if(!Array.isArray(d.playlists))throw new Error('Playlist payload invalid'); return `${d.playlists.length} playlist(s)`; }});
    register({ id: 'companion.rotation', name: 'Rotation / queue read path', category: 'companion', severity: 'major', requires:()=>connected()&&hasFeature('boot_rotation')?'':'Rotation unavailable', run:async()=>{ const d=await jsonEndpoint('/rotation/status','boot_rotation'); if(!d||typeof d!=='object')throw new Error('Rotation payload invalid'); return `${Array.isArray(d.queue)?d.queue.length:0} queued`; }});
    register({ id: 'companion.activity', name: 'Boot Activity read path', category: 'companion', severity: 'normal', requires:()=>connected()&&hasFeature('boot_activity')?'':'Activity unavailable', run:async()=>{ const d=await jsonEndpoint('/activity/list','boot_activity'); const items=d?.items==null?[]:d.items; if(!d||typeof d!=='object'||!Array.isArray(items)){ const shape=Array.isArray(d)?'top-level array':(d&&typeof d==='object'?`object keys: ${Object.keys(d).slice(0,8).join(', ')||'(none)'}`:typeof d); throw new Error(`Activity payload invalid (${shape})`); } if(d.status&&d.status!=='success'&&d.status!=='ok')throw new Error(`Unexpected activity status ${d.status}`); return `${items.length} event(s)`; }});
    register({ id: 'companion.device-probes', name: 'Device Intelligence probes', category: 'companion', severity: 'major', requires:()=>connected()&&hasFeature('device_intelligence')?'':'Device Intelligence unavailable', run:async()=>{ const d=await jsonEndpoint('/device/probes','device_intelligence'); if(!d||typeof d!=='object')throw new Error('Probe payload invalid'); return 'Probe payload available'; }});
    register({ id: 'companion.health', name: 'Module Health read path', category: 'companion', severity: 'critical', requires:()=>connected()&&hasFeature('module_health')?'':'Health unavailable', run:async()=>{ const d=await jsonEndpoint('/health/status','module_health'); if(!d||typeof d!=='object')throw new Error('Health payload invalid'); return String(d.overall||'available'); }});
    register({ id: 'companion.test-status', name: 'Device Test Lab read path', category: 'companion', severity: 'normal', requires:()=>connected()&&hasFeature('test_staging')?'':'Device Test unavailable', run:async()=>{ const d=await jsonEndpoint('/test/status','test_staging'); if(!d||typeof d!=='object')throw new Error('Test status invalid'); return d.has_staged?'staged':'clear'; }});

    function bind() {
        loadHistory();
        byId('developer-regression-run')?.addEventListener('click', () => run().catch(error => window.BASDeveloperLab?.notify?.(safeString(error?.message||error), 'error')));
        byId('developer-regression-copy')?.addEventListener('click', copyReport);
        byId('developer-regression-clear-history')?.addEventListener('click', clearHistory);
        window.addEventListener('bas:languagechange', render);
        render();
    }

    window.BASRegressionScanner = Object.freeze({
        version: VERSION, release: RELEASE, register, run, render, syncText,
        report: () => state.report ? clone(state.report) : null,
        history: () => clone(state.history),
        tests: () => registry.map(({run,requires,...item}) => ({...item})),
        state: () => ({ running:state.running, resultCount:state.results.length, lastError:state.lastError })
    });

    window.addEventListener('DOMContentLoaded', bind);
})();
