// Community moderation panel. The API enforces every rule; this file only draws what the signed-in moderator may do.
(function () {
    'use strict';

    const TABS = ['overview', 'mass', 'reports', 'review', 'animations', 'people', 'audit', 'team', 'settings'];
    const OWNER_TABS = new Set(['settings']);
    const CASE_ACTION_PERMISSION = { approve: 'review', hide: 'review', remove: 'remove', ban: 'ban', clear_profile: 'clear_profile' };
    const ACTION_STYLE = { approve: 'is-primary', hide: '', clear_profile: '', remove: 'is-danger', ban: 'is-danger' };
    const DANGEROUS = new Set(['remove', 'ban']);
    const DAY = 86400000;

    const isOwner = (kit) => !!kit.state.me && kit.state.me.role === 'owner';
    const can = (kit, permission) => !!kit.state.me && (kit.state.me.role === 'owner' || (kit.state.me.permissions || []).includes(permission));

    function ago(kit, ms) {
        const minutes = Math.round((Date.now() - ms) / 60000);
        if (minutes < 1) return kit.t('justNow');
        if (minutes < 60) return kit.t('minutesAgo', { n: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 48) return kit.t('hoursAgo', { n: hours });
        return kit.formatDate(ms);
    }

    function tabsBar(kit, active) {
        const { h, t, fill, navigate, api } = kit;
        const bar = h('div', { class: 'cm-chips is-panel', role: 'tablist' });
        const paint = (summary) => fill(bar, TABS.filter((tab) => !OWNER_TABS.has(tab) || isOwner(kit)).map((tab) => {
            const count = summary ? summary[tab] : 0;
            const urgent = summary && ((tab === 'mass' && summary.mass) || (tab === 'reports' && summary.critical_reports));
            return h('button', {
                class: 'cm-chip', type: 'button', role: 'tab', 'aria-selected': String(tab === active),
                dataset: { tab, urgent: urgent ? 'true' : null },
                onclick: () => navigate(`mod/${tab}`),
            }, t(`panelTab_${tab}`), count ? h('span', { class: 'cm-count-badge', text: String(count) }) : null);
        }));
        paint(null);
        api('GET', '/v1/mod/summary').then(paint).catch(() => {});
        return bar;
    }

    function panelPage(kit, tab, ...body) {
        return { el: kit.h('section', { class: 'cm-panel' }, tabsBar(kit, tab), body), title: kit.t('navPanel') };
    }

    function section(kit, title, ...body) {
        return kit.h('section', { class: 'cm-block' }, kit.h('h4', { class: 'cm-section-title', text: title }), body);
    }
    function namedSection(kit, name, title, ...body) {
        const el = section(kit, title, ...body);
        el.classList.add(name);
        return el;
    }

    // ------------------------------------------------------------------ notes (people and cases)

    function notesBlock(kit, targetType, targetId, initial) {
        const { h, t, api, fill, reportError } = kit;
        const list = h('ul', { class: 'cm-entries' });
        const input = h('textarea', { class: 'cm-input', rows: '2', maxlength: '1000', placeholder: t('notePlaceholder') });
        const add = h('button', { class: 'cm-btn', type: 'button' }, t('noteAdd'));
        const paint = (items) => fill(list, items.length ? items.map((note) => h('li', {},
            h('p', { text: note.body }),
            h('small', { class: 'cm-muted', text: `${note.author ? `@${note.author}` : t('deletedUser')} · ${ago(kit, note.created_at)}` }),
            note.mine || isOwner(kit) ? h('button', { class: 'cm-link is-danger', type: 'button', onclick: async () => {
                try {
                    await api('DELETE', `/v1/mod/notes/${note.id}`);
                    paint(items.filter((item) => item.id !== note.id));
                } catch (error) { reportError(error); }
            } }, t('noteDelete')) : null)) : h('li', { class: 'cm-muted', text: t('notesEmpty') }));
        add.addEventListener('click', async () => {
            if (!input.value.trim()) return;
            add.disabled = true;
            try {
                const data = await api('POST', '/v1/mod/notes', { json: { target_type: targetType, target_id: targetId, body: input.value } });
                input.value = '';
                paint(data.items);
            } catch (error) {
                reportError(error);
            } finally {
                add.disabled = false;
            }
        });
        if (initial) paint(initial);
        else api('GET', `/v1/mod/notes?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`).then((data) => paint(data.items)).catch(reportError);
        return namedSection(kit, 'cm-notes', t('notesTitle'), h('p', { class: 'cm-fine', text: t('notesHint') }), list, input, add);
    }

    // ------------------------------------------------------------------ queues (mass / reports / review) with bulk actions

    function caseRow(kit, item, selection) {
        const { h, t, navigate, media } = kit;
        const target = item.target || {};
        const image = target.preview_url || target.image_url;
        const box = h('input', { type: 'checkbox', 'aria-label': t('selectCase') });
        box.addEventListener('change', () => selection.toggle(item.id, box.checked));
        return h('div', { class: `cm-case-wrap is-${item.tab}` }, box,
            h('button', { class: 'cm-case', type: 'button', dataset: { severity: item.max_severity }, onclick: () => navigate(`mod/case/${item.id}`) },
                h('span', { class: 'cm-case-thumb' }, image ? media(image, 9, 16, 'cm-media') : h('span', { text: t(`targetType_${item.target_type}`) })),
                h('span', { class: 'cm-case-body' },
                    h('strong', { text: target.missing ? t('targetMissing') : (target.title || item.target_id) }),
                    h('small', { class: 'cm-muted', text: [target.owner ? `@${target.owner}` : '', ago(kit, item.updated_at)].filter(Boolean).join(' · ') }),
                    h('span', { class: 'cm-flags' },
                        item.report_count ? h('span', { class: 'cm-flag', text: t('reportsN', { n: item.report_count }) }) : null,
                        item.report_count ? h('span', { class: `cm-flag is-sev-${item.max_severity}`, text: t(`severity_${Math.max(0, Math.min(3, item.max_severity))}`) }) : null,
                        item.auto_hidden ? h('span', { class: 'cm-flag is-warn', text: t('autoHidden') }) : null,
                        item.findings.length && item.findings[item.findings.length - 1].message
                            ? h('span', { class: 'cm-flag is-info', text: item.findings[item.findings.length - 1].message }) : null))));
    }

    function queueView(kit, tab) {
        const { h, t, api, fill, loading, emptyState, toast, reportError, confirmAction } = kit;
        const list = h('div', { class: 'cm-cases' }, loading());
        const more = h('button', { class: 'cm-btn is-wide', type: 'button', hidden: true }, t('loadMore'));
        const chosen = new Set();
        const bulkCount = h('strong');
        const bulkButtons = [['approve', 'is-primary'], ['hide', ''], ['remove', 'is-danger']]
            .filter(([action]) => can(kit, CASE_ACTION_PERMISSION[action]))
            .map(([action, style]) => {
                const button = h('button', { class: `cm-btn ${style}`, type: 'button' }, t(`action_${action}`));
                button.addEventListener('click', async () => {
                    if (DANGEROUS.has(action) && !(await confirmAction(t(`actionConfirm_${action}`), true))) return;
                    button.disabled = true;
                    try {
                        const res = await api('POST', '/v1/mod/cases/bulk', { json: { ids: [...chosen], action } });
                        toast(t('bulkDone', { done: res.done, total: res.results.length }), res.done === res.results.length ? 'success' : 'info', 4200);
                        kit.state.views.clear();
                        chosen.clear();
                        load(true);
                    } catch (error) {
                        reportError(error);
                    } finally {
                        button.disabled = false;
                    }
                });
                return button;
            });
        const bulkBar = h('div', { class: 'cm-bulk', hidden: true }, bulkCount, h('div', { class: 'cm-bulk-actions' }, bulkButtons));
        const selection = {
            toggle(id, on) {
                if (on) chosen.add(id); else chosen.delete(id);
                bulkBar.hidden = !chosen.size || !bulkButtons.length;
                bulkCount.textContent = t('selectedN', { n: chosen.size });
            },
        };
        let cursor = null;
        async function load(reset) {
            more.disabled = true;
            if (reset) { cursor = null; chosen.clear(); selection.toggle(null, false); }
            try {
                const page = await api('GET', `/v1/mod/queue?tab=${tab}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
                if (reset) fill(list);
                page.items.forEach((item) => list.append(caseRow(kit, item, selection)));
                if (reset && !page.items.length) fill(list, emptyState(t('queueEmpty')));
                cursor = page.next_cursor;
                more.hidden = !cursor;
            } catch (error) {
                fill(list, emptyState(error.message));
            } finally {
                more.disabled = false;
            }
        }
        more.addEventListener('click', () => load(false));
        load(true);
        return panelPage(kit, tab, h('p', { class: 'cm-fine', text: t(`panelHint_${tab}`) }), bulkBar, list, more);
    }

    function caseView(kit, id) {
        const { h, t, api, fill, navigate, toast, reportError, media, confirmAction, fetchVerified, loading, emptyState } = kit;
        const el = h('section', { class: 'cm-panel cm-case-detail' }, loading());
        api('GET', `/v1/mod/cases/${id}`).then((item) => {
            const target = item.target || {};
            const reason = h('textarea', { class: 'cm-input', rows: '2', maxlength: '500', placeholder: t('actionReason') });
            const buttons = item.status === 'open' ? item.actions.filter((action) => can(kit, CASE_ACTION_PERMISSION[action])).map((action) => {
                const button = h('button', { class: `cm-btn ${ACTION_STYLE[action] || ''}`, type: 'button' }, t(`action_${action}`));
                button.addEventListener('click', async () => {
                    if (DANGEROUS.has(action) && !(await confirmAction(t(`actionConfirm_${action}`), true))) return;
                    button.disabled = true;
                    try {
                        await api('POST', `/v1/mod/cases/${item.id}/action`, { json: { action, reason: reason.value } });
                        kit.state.views.clear();
                        toast(t('actionDone'), 'success');
                        navigate(`mod/${item.tab}`, { replace: true });
                    } catch (error) {
                        reportError(error);
                        button.disabled = false;
                    }
                });
                return button;
            }) : [];
            const inspect = item.target_type === 'animation' && !target.missing
                ? h('button', { class: 'cm-link', type: 'button' }, t('downloadForReview')) : null;
            if (inspect) {
                inspect.addEventListener('click', async () => {
                    try {
                        const detail = await api('GET', `/v1/animations/${item.target_id}`);
                        const blob = await fetchVerified(detail);
                        if (window.BASExport && window.BASExport.downloadBlob) window.BASExport.downloadBlob(blob, `review-${item.target_id}.zip`);
                    } catch (error) {
                        reportError(error);
                    }
                });
            }
            const image = target.preview_url || target.image_url;
            fill(el,
                h('div', { class: 'cm-case-head' },
                    h('button', { class: 'cm-link', type: 'button', onclick: () => navigate(`mod/${item.tab}`) }, `‹ ${t(`panelTab_${item.tab}`)}`),
                    item.status !== 'open' ? h('span', { class: 'cm-flag', text: t('caseClosed', { resolution: t(`action_${item.resolution}`) }) }) : null),
                image ? h('div', { class: 'cm-case-media' }, media(image, 9, 16, 'cm-media is-large')) : null,
                h('h3', { class: 'cm-detail-title', text: target.missing ? t('targetMissing') : (target.title || item.target_id) }),
                h('div', { class: 'cm-case-links' },
                    target.owner ? h('button', { class: 'cm-link', type: 'button', onclick: () => navigate(`mod/person/${target.owner}`) }, t('personFileOf', { handle: target.owner })) : null,
                    item.target_type === 'animation' && !target.missing ? h('button', { class: 'cm-link', type: 'button', onclick: () => navigate(`a/${item.target_id}`) }, t('openItem')) : null,
                    inspect),
                target.bio ? h('p', { class: 'cm-text', text: target.bio }) : null,
                target.status ? h('p', { class: 'cm-muted', text: t('targetStatus', { status: t(`status_${target.status}`) }) }) : null,
                item.auto_hidden ? h('p', { class: 'cm-banner-status is-hidden', text: t('autoHiddenLong') }) : null,
                buttons.length ? section(kit, t('decide'), reason, h('div', { class: 'cm-decide' }, buttons))
                    : (item.status === 'open' ? h('p', { class: 'cm-fine', text: t('noPermissionHere') }) : null),
                item.findings.length ? section(kit, t('findings'), h('ul', { class: 'cm-entries' }, item.findings.map((finding) => h('li', { dataset: { severity: finding.severity } },
                    h('code', { text: finding.code }), finding.message ? ` ${finding.message}` : null)))) : null,
                item.reports.length ? section(kit, t('reportsN', { n: item.reports.length }), h('ul', { class: 'cm-entries' }, item.reports.map((report) => h('li', { dataset: { severity: report.severity } },
                    h('strong', { text: t(`reportCat_${report.category}`) }),
                    h('small', { class: 'cm-muted', text: ` · ${report.reporter ? `@${report.reporter}` : t('deletedUser')} · ${ago(kit, report.created_at)}` }),
                    report.note ? h('p', { text: report.note }) : null)))) : null,
                notesBlock(kit, 'case', item.id),
                item.history.length ? section(kit, t('history'), h('ul', { class: 'cm-entries' }, item.history.map((entry) => h('li', {},
                    h('strong', { text: t(`action_${entry.action}`) }),
                    h('small', { class: 'cm-muted', text: ` · ${entry.actor ? `@${entry.actor}` : t('system')} · ${t(`source_${entry.source}`)} · ${ago(kit, entry.created_at)}` }),
                    entry.reason ? h('p', { text: entry.reason }) : null)))) : null);
        }).catch((error) => fill(el, emptyState(error.message)));
        return { el, title: t('navPanel') };
    }

    // ------------------------------------------------------------------ overview: storage, waiting, charts, numbers, tools

    // One small bar chart per measure (single series: the title names it, no legend). Each bar has a tooltip.
    function barChart(kit, title, values, days) {
        const { h, t, formatCount, formatDate } = kit;
        const max = Math.max(1, ...values);
        const total = values.reduce((sum, value) => sum + value, 0);
        const width = 300;
        const height = 64;
        const gap = 2;
        const bar = (width - gap * (values.length - 1)) / values.length;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('class', 'cm-chart-svg');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', t('chartAria', { title, total: formatCount(total), max: formatCount(Math.max(...values)) }));
        const base = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        Object.entries({ x1: 0, x2: width, y1: height - 0.5, y2: height - 0.5, class: 'cm-chart-base' }).forEach(([k, v]) => base.setAttribute(k, v));
        svg.append(base);
        values.forEach((value, i) => {
            const barHeight = value ? Math.max(3, (value / max) * (height - 6)) : 0;
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            Object.entries({ x: i * (bar + gap), y: 0, width: bar + gap, height, class: 'cm-chart-hit' }).forEach(([k, v]) => hit.setAttribute(k, v));
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            Object.entries({ x: i * (bar + gap), y: height - barHeight, width: bar, height: barHeight, rx: Math.min(2, bar / 2), class: 'cm-chart-bar' }).forEach(([k, v]) => rect.setAttribute(k, v));
            const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            tip.textContent = `${formatDate(days[i])}: ${formatCount(value)}`;
            group.append(hit, rect, tip);
            svg.append(group);
        });
        return h('figure', { class: 'cm-chart' },
            h('figcaption', {}, h('span', { text: title }), h('strong', { text: formatCount(total) })),
            svg,
            h('div', { class: 'cm-chart-axis' }, h('span', { text: formatDate(days[0]) }), h('span', { text: t('today') })));
    }

    function overviewView(kit) {
        const { h, t, api, fill, toast, reportError, formatBytes, formatCount, navigate, loading, emptyState, confirmAction } = kit;
        const body = h('div', { class: 'cm-overview' }, loading());
        async function load() {
            try {
                const [data, series, abusive, config] = await Promise.all([
                    api('GET', '/v1/mod/stats'), api('GET', '/v1/mod/timeseries'), api('GET', '/v1/mod/reporters'), api('GET', '/v1/config'),
                ]);
                const used = data.storage.used_bytes;
                const limit = data.storage.limit_bytes || 1;
                const share = Math.min(1, used / limit);
                const level = share >= 0.95 ? 'is-danger' : share >= 0.8 ? 'is-warn' : '';
                const pause = isOwner(kit) ? h('button', { class: `cm-btn ${data.storage.paused ? 'is-primary' : ''}`, type: 'button' },
                    data.storage.paused ? t('resumeUploads') : t('pauseUploads')) : null;
                if (pause) {
                    pause.addEventListener('click', async () => {
                        pause.disabled = true;
                        try {
                            await api('PUT', '/v1/mod/settings/uploads', { json: { paused: !data.storage.paused } });
                            toast(data.storage.paused ? t('uploadsResumed') : t('uploadsPausedNow'), 'success');
                            load();
                        } catch (error) {
                            reportError(error);
                            pause.disabled = false;
                        }
                    });
                }
                const tile = (value, label, path, tone) => h(path ? 'button' : 'div', {
                    class: `cm-stat${tone ? ` ${tone}` : ''}`, type: path ? 'button' : null, onclick: path ? () => navigate(path) : null,
                }, h('strong', { text: formatCount(value) }), h('span', { text: label }));

                // Announcement (needs the permission).
                let announceBlock = null;
                if (can(kit, 'announce')) {
                    const text = h('textarea', { class: 'cm-input', rows: '2', maxlength: '280', placeholder: t('announcePlaceholder') });
                    text.value = config.announcement ? config.announcement.text : '';
                    const save = h('button', { class: 'cm-btn is-primary', type: 'button' }, t('announcePublish'));
                    const clear = h('button', { class: 'cm-btn', type: 'button' }, t('announceClear'));
                    const send = async (value) => {
                        try {
                            await api('PUT', '/v1/mod/announcement', { json: { text: value } });
                            toast(value ? t('announceSaved') : t('announceCleared'), 'success');
                            if (!value) text.value = '';
                        } catch (error) { reportError(error); }
                    };
                    save.addEventListener('click', () => send(text.value.trim() || null));
                    clear.addEventListener('click', () => send(null));
                    announceBlock = namedSection(kit, 'cm-announce-editor', t('announceTitle'), h('p', { class: 'cm-fine', text: t('announceHint') }), text, h('div', { class: 'cm-decide' }, save, clear));
                }
                let recheckBlock = null;
                if (can(kit, 'recheck')) {
                    const button = h('button', { class: 'cm-btn', type: 'button' }, t('recheckAll'));
                    button.addEventListener('click', async () => {
                        if (!(await confirmAction(t('recheckAllConfirm')))) return;
                        button.disabled = true;
                        try {
                            const res = await api('POST', '/v1/mod/recheck-all');
                            toast(t('recheckAllQueued', { n: res.queued }), 'success', 5200);
                        } catch (error) { reportError(error); } finally { button.disabled = false; }
                    });
                    recheckBlock = namedSection(kit, 'cm-recheck', t('recheckTitle'), h('p', { class: 'cm-fine', text: t('recheckHint') }), button);
                }

                fill(body,
                    namedSection(kit, 'cm-storage', t('storageTitle'),
                        data.storage.paused ? h('span', { class: 'cm-flag is-warn', text: t('uploadsPausedFlag') }) : null,
                        h('div', { class: `cm-meter ${level}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(limit), 'aria-valuenow': String(used) },
                            h('span', { style: `width:${(share * 100).toFixed(1)}%` })),
                        h('p', { class: 'cm-storage-text', text: t('storageText', { used: formatBytes(used), limit: formatBytes(limit), free: formatBytes(Math.max(0, limit - used)), pct: Math.round(share * 100) }) }),
                        h('p', { class: 'cm-fine', text: t('storageHint') }),
                        pause),
                    section(kit, t('waitingForYou'), h('div', { class: 'cm-stats' },
                        tile(data.open_cases.mass, t('panelTab_mass'), 'mod/mass', data.open_cases.mass ? 'is-danger' : ''),
                        tile(data.open_cases.reports, t('panelTab_reports'), 'mod/reports', data.open_cases.reports ? 'is-warn' : ''),
                        tile(data.open_cases.review, t('panelTab_review'), 'mod/review'))),
                    namedSection(kit, 'cm-charts-block', t('last30Days'), h('div', { class: 'cm-charts' },
                        barChart(kit, t('chartUploads'), series.uploads, series.days),
                        barChart(kit, t('chartDownloads'), series.downloads, series.days),
                        barChart(kit, t('chartPeople'), series.people, series.days),
                        barChart(kit, t('chartReports'), series.reports, series.days))),
                    section(kit, t('communityNumbers'), h('div', { class: 'cm-stats' },
                        tile(data.users.total, t('statPeople'), 'mod/people'),
                        tile(data.users.new_7d, t('statNewPeople')),
                        tile(data.animations.published, t('statPublished'), 'mod/animations'),
                        tile(data.animations.featured, t('statFeatured')),
                        tile(data.downloads, t('downloadsLabel')),
                        tile(data.reports_7d, t('statReports7d')),
                        tile(data.animations.hidden, t('statHidden')),
                        tile(data.animations.rejected, t('statRefused')),
                        tile(data.users.banned, t('statBanned')),
                        tile(data.checks.running, t('statChecksRunning')),
                        tile(data.checks.failed_7d, t('statChecksFailed'), null, data.checks.failed_7d ? 'is-warn' : ''))),
                    namedSection(kit, 'cm-abusive', t('abusiveTitle'), h('p', { class: 'cm-fine', text: t('abusiveHint') }),
                        abusive.items.length
                            ? h('div', { class: 'cm-rows' }, abusive.items.map((item) => h('button', { class: 'cm-row-item is-button', type: 'button', onclick: () => navigate(`mod/person/${item.handle}`) },
                                h('span', { class: 'cm-author-names' }, h('strong', { text: item.display_name || item.handle }), h('small', { text: `@${item.handle}` })),
                                h('span', { class: 'cm-flag is-warn', text: t('abusiveStat', { unfounded: item.unfounded, total: item.total }) }))))
                            : h('p', { class: 'cm-muted', text: t('abusiveNone') })),
                    announceBlock,
                    recheckBlock);
            } catch (error) {
                fill(body, emptyState(error.message));
            }
        }
        load();
        return panelPage(kit, 'overview', body);
    }

    // ------------------------------------------------------------------ searchable lists

    function searchableList(kit, { filters, initial, fetchPage, renderRow, placeholder, query = '' }) {
        const { h, t, fill, loading, emptyState } = kit;
        let filter = initial;
        let q = query;
        let cursor = null;
        const input = h('input', { class: 'cm-search-input', type: 'search', placeholder, 'aria-label': placeholder, maxlength: '60', value: query });
        const chips = h('div', { class: 'cm-chips', role: 'tablist' });
        const list = h('div', { class: 'cm-rows' });
        const more = h('button', { class: 'cm-btn is-wide', type: 'button', hidden: true }, t('loadMore'));
        const paintChips = () => fill(chips, filters.map(([id, label]) => h('button', {
            class: 'cm-chip', type: 'button', role: 'tab', 'aria-selected': String(id === filter),
            onclick: () => { if (filter !== id) { filter = id; paintChips(); load(true); } },
        }, label)));
        async function load(reset) {
            if (reset) { cursor = null; fill(list, loading()); }
            more.disabled = true;
            try {
                const page = await fetchPage({ filter, q, cursor });
                if (reset) fill(list);
                page.items.forEach((item) => list.append(renderRow(item, () => load(true))));
                if (reset && !page.items.length) fill(list, emptyState(t('nothingFound')));
                cursor = page.next_cursor;
                more.hidden = !cursor;
            } catch (error) {
                fill(list, emptyState(error.message));
            } finally {
                more.disabled = false;
            }
        }
        let debounce = 0;
        input.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => { if (input.value.trim() !== q) { q = input.value.trim(); load(true); } }, 320);
        });
        more.addEventListener('click', () => load(false));
        paintChips();
        load(true);
        return [h('label', { class: 'cm-search' }, kit.icon('search'), input), chips, list, more];
    }

    function actionSheet(kit, title, actions, onDone) {
        const { h, t, api, toast, reportError, confirmAction, modal } = kit;
        const reason = h('textarea', { class: 'cm-input', rows: '2', maxlength: '500', placeholder: t('actionReason') });
        const buttons = actions.map(({ label, style, path, json, confirm, done }) => {
            const button = h('button', { class: `cm-btn is-wide ${style || ''}`, type: 'button' }, label);
            button.addEventListener('click', async () => {
                if (confirm && !(await confirmAction(confirm, true))) return;
                button.disabled = true;
                try {
                    await api('POST', path, { json: { ...json, reason: reason.value } });
                    sheet.close();
                    toast(done || t('actionDone'), 'success');
                    onDone();
                } catch (error) {
                    reportError(error);
                    button.disabled = false;
                }
            });
            return button;
        });
        const sheet = modal(title, h('div', { class: 'cm-form is-plain' }, reason, buttons));
    }

    function peopleView(kit, query = '') {
        const { h, t, api, avatar, formatDate, navigate } = kit;
        const filters = [['all', t('filterAll')], ['new', t('filterNew')], ['team', t('filterTeam')], ['banned', t('filterBanned')]];
        const renderRow = (user) => h('button', { class: 'cm-row-item is-button', type: 'button', onclick: () => navigate(`mod/person/${user.handle}`) },
            avatar(user.avatar_url, 'md'),
            h('span', { class: 'cm-author-names' },
                h('strong', { text: user.display_name || user.handle }),
                h('small', { text: `@${user.handle} · ${t('joinedShort', { date: formatDate(user.created_at) })}` }),
                h('span', { class: 'cm-flags' },
                    user.role !== 'user' ? h('span', { class: 'cm-flag is-ok', text: t(`role_${user.role}`) }) : null,
                    user.status === 'banned' ? h('span', { class: 'cm-flag is-sev-3', text: t('flagBanned') }) : null,
                    h('span', { class: 'cm-flag', text: user.trust ? t('flagTrusted') : t('flagNew') }),
                    h('span', { class: 'cm-flag is-info', text: t('userCounts', { published: user.published, refused: user.refused }) }))));
        return panelPage(kit, 'people', searchableList(kit, {
            filters, initial: 'all', placeholder: t('searchPeople'), renderRow, query,
            fetchPage: ({ filter, q, cursor }) => api('GET', `/v1/mod/users?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
        }));
    }

    // ------------------------------------------------------------------ person file

    const SANCTION_PERMISSION = { warning: 'warn', restrict: 'restrict', suspend: 'suspend', ban: 'ban' };
    const RESTRICTIONS = ['upload', 'report', 'rate', 'profile'];
    const DURATIONS = [1, 3, 7, 30, 90, 365];

    function sanctionSummary(kit, s) {
        const { t, formatDate } = kit;
        const until = s.ends_at ? t('untilDate', { date: formatDate(s.ends_at) }) : (s.kind === 'restrict' ? t('permanent') : '');
        const what = s.kind === 'restrict' ? s.restrictions.map((item) => t(`restriction_${item}`)).join(', ') : '';
        return [t(`sanction_${s.kind}`), what, until, s.hide_uploads ? t('uploadsHiddenShort') : ''].filter(Boolean).join(' · ');
    }

    function punishSheet(kit, person, onDone) {
        const { h, t, api, toast, reportError, confirmAction, modal, fill } = kit;
        const kinds = Object.keys(SANCTION_PERMISSION).filter((kind) => can(kit, SANCTION_PERMISSION[kind]));
        if (!kinds.length) return toast(t('noPermissionHere'), 'info', 4200);
        let kind = kinds[0];
        const options = h('div');
        const reason = h('textarea', { class: 'cm-input', rows: '3', maxlength: '500', placeholder: t('sanctionReason') });
        const restrictionBoxes = RESTRICTIONS.map((item) => ({ item, box: h('input', { type: 'checkbox' }) }));
        const duration = h('select', { class: 'cm-input' });
        const hide = h('input', { type: 'checkbox' }); // off by default (owner decision)
        const paintDuration = () => fill(duration,
            kind === 'restrict' ? h('option', { value: '', text: t('permanent') }) : null,
            DURATIONS.map((days) => h('option', { value: String(days), text: t('daysN', { n: days }), selected: days === 7 ? true : null })));
        const chooser = h('div', { class: 'cm-segmented is-scroll' });
        const paintKinds = () => fill(chooser, kinds.map((id) => h('button', {
            type: 'button', role: 'radio', 'aria-checked': String(id === kind),
            onclick: () => { kind = id; paintKinds(); paintOptions(); },
        }, t(`sanction_${id}`))));
        const paintOptions = () => {
            paintDuration();
            fill(options,
                h('p', { class: 'cm-fine', text: t(`sanctionHint_${kind}`) }),
                kind === 'restrict' ? h('div', { class: 'cm-field' }, h('span', { class: 'cm-label', text: t('restrictWhat') }),
                    restrictionBoxes.map(({ item, box }) => h('label', { class: 'cm-check' }, box, h('span', { text: t(`restriction_${item}`) })))) : null,
                kind === 'restrict' || kind === 'suspend' ? h('label', { class: 'cm-field' }, h('span', { class: 'cm-label', text: t('duration') }), duration) : null,
                kind === 'suspend' ? h('label', { class: 'cm-check' }, hide, h('span', { text: t('hideUploadsUntilEnd') })) : null);
        };
        paintKinds();
        paintOptions();
        const send = h('button', { class: 'cm-btn is-danger is-wide', type: 'button' }, t('applySanction'));
        const sheet = modal(t('punishTitle', { handle: person.handle }), h('div', { class: 'cm-form is-plain' }, chooser, options, reason, send));
        send.addEventListener('click', async () => {
            if (!reason.value.trim()) { reason.focus(); return toast(t('sanctionNeedsReason'), 'info'); }
            const json = { kind, reason: reason.value };
            if (kind === 'restrict') {
                json.restrictions = restrictionBoxes.filter(({ box }) => box.checked).map(({ item }) => item);
                if (!json.restrictions.length) return toast(t('restrictChoose'), 'info');
            }
            if (kind === 'restrict' || kind === 'suspend') json.days = duration.value ? Number(duration.value) : null;
            if (kind === 'suspend') json.hide_uploads = hide.checked;
            if (kind === 'ban' && !(await confirmAction(t('actionConfirm_ban'), true))) return;
            send.disabled = true;
            try {
                await api('POST', `/v1/mod/users/${person.handle}/sanctions`, { json });
                sheet.close();
                toast(t('sanctionApplied'), 'success');
                onDone();
            } catch (error) {
                reportError(error);
                send.disabled = false;
            }
        });
    }

    function personView(kit, handle) {
        const { h, t, api, fill, navigate, avatar, formatDate, formatCount, loading, emptyState, toast, reportError, confirmAction } = kit;
        const el = h('section', { class: 'cm-panel cm-person' }, loading());
        async function load() {
            try {
                const p = await api('GET', `/v1/mod/users/${handle}`);
                const active = p.sanctions.filter((s) => s.active);
                const lift = (s) => h('button', { class: 'cm-link', type: 'button', onclick: async () => {
                    if (!(await confirmAction(t('liftConfirm')))) return;
                    try {
                        await api('POST', `/v1/mod/sanctions/${s.id}/revoke`, { json: {} });
                        toast(t('sanctionLifted'), 'success');
                        load();
                    } catch (error) { reportError(error); }
                } }, t('liftSanction'));
                const quick = [];
                if (p.can.act && can(kit, 'trust')) {
                    quick.push(h('button', { class: 'cm-btn', type: 'button', onclick: () => actionSheet(kit, `@${p.handle}`, [
                        p.trust ? { label: t('userUntrust'), path: `/v1/mod/users/${p.handle}/action`, json: { action: 'untrust' } }
                            : { label: t('userTrust'), style: 'is-primary', path: `/v1/mod/users/${p.handle}/action`, json: { action: 'trust' } }], load) },
                    p.trust ? t('userUntrustShort') : t('userTrustShort')));
                }
                if (p.can.act && can(kit, 'clear_profile')) {
                    quick.push(h('button', { class: 'cm-btn', type: 'button', onclick: () => actionSheet(kit, `@${p.handle}`, [
                        { label: t('action_clear_profile'), style: 'is-danger', path: `/v1/mod/users/${p.handle}/action`, json: { action: 'clear_profile' }, confirm: t('clearProfileConfirm') }], load) },
                    t('action_clear_profile')));
                }
                if (p.can.export) {
                    quick.push(h('button', { class: 'cm-btn', type: 'button', onclick: async () => {
                        try {
                            const response = await fetch(`${kit.API}/v1/mod/users/${p.handle}/export`, { headers: { Authorization: `Bearer ${kit.state.token}` } });
                            if (!response.ok) throw new Error(t('errGeneric'));
                            if (window.BASExport && window.BASExport.downloadBlob) window.BASExport.downloadBlob(await response.blob(), `bas-community-${p.handle}.json`);
                        } catch (error) { reportError(error); }
                    } }, t('exportData')));
                }
                const anyPunish = p.can.act && Object.values(SANCTION_PERMISSION).some((perm) => can(kit, perm));
                fill(el,
                    h('div', { class: 'cm-case-head' }, h('button', { class: 'cm-link', type: 'button', onclick: () => navigate('mod/people') }, `‹ ${t('panelTab_people')}`)),
                    h('div', { class: 'cm-person-head' },
                        avatar(p.avatar_url, 'xl'),
                        h('div', { class: 'cm-author-names' },
                            h('h3', { text: p.display_name || p.handle }),
                            h('small', { text: `@${p.handle} · ${t('joinedShort', { date: formatDate(p.joined_at) })} · ${t('githubSince', { date: formatDate(p.github_created_at) })}` }),
                            h('span', { class: 'cm-flags' },
                                p.role !== 'user' ? h('span', { class: 'cm-flag is-ok', text: t(`role_${p.role}`) }) : null,
                                p.status === 'banned' ? h('span', { class: 'cm-flag is-sev-3', text: t('flagBanned') }) : null,
                                p.suspended_until ? h('span', { class: 'cm-flag is-warn', text: t('suspendedUntil', { date: formatDate(p.suspended_until) }) }) : null,
                                h('span', { class: 'cm-flag', text: p.trust ? t('flagTrusted') : t('flagNew') })))),
                    h('div', { class: 'cm-actions' },
                        h('button', { class: 'cm-btn', type: 'button', onclick: () => navigate(`u/${p.handle}`) }, t('publicProfile')),
                        anyPunish ? h('button', { class: 'cm-btn is-danger', type: 'button', onclick: () => punishSheet(kit, p, load) }, t('punish')) : null),
                    quick.length ? h('div', { class: 'cm-actions' }, quick) : null,
                    h('div', { class: 'cm-stats' },
                        h('div', { class: `cm-stat${p.strikes.count >= 3 ? ' is-danger' : p.strikes.count ? ' is-warn' : ''}` },
                            h('strong', { text: String(p.strikes.count) }), h('span', { text: t('strikesLabel') })),
                        h('div', { class: 'cm-stat' }, h('strong', { text: formatCount(p.animations.published) }), h('span', { text: t('statPublished') })),
                        h('div', { class: 'cm-stat' }, h('strong', { text: formatCount(p.animations.refused) }), h('span', { text: t('statRefused') })),
                        h('div', { class: 'cm-stat' }, h('strong', { text: formatCount(p.animations.downloads) }), h('span', { text: t('downloadsLabel') })),
                        h('div', { class: 'cm-stat' }, h('strong', { text: formatCount(p.reports_received) }), h('span', { text: t('reportsReceived') })),
                        h('div', { class: `cm-stat${p.reports_made.total >= 5 && p.reports_made.unfounded / p.reports_made.total >= 0.7 ? ' is-warn' : ''}` },
                            h('strong', { text: `${p.reports_made.total}` }), h('span', { text: t('reportsMadeStat', { unfounded: p.reports_made.unfounded }) }))),
                    p.strikes.suggestion ? h('p', { class: 'cm-banner-status', text: t('suggestion', { kind: t(`sanction_${p.strikes.suggestion}`) }) }) : null,
                    namedSection(kit, 'cm-active-sanctions', t('activeSanctions'), active.length
                        ? h('ul', { class: 'cm-entries' }, active.map((s) => h('li', { dataset: { severity: s.kind === 'ban' || s.kind === 'suspend' ? 3 : 2 } },
                            h('strong', { text: sanctionSummary(kit, s) }), h('p', { text: s.reason }),
                            h('small', { class: 'cm-muted', text: `${s.actor ? `@${s.actor}` : t('system')} · ${formatDate(s.created_at)}` }),
                            can(kit, SANCTION_PERMISSION[s.kind]) && p.can.act ? lift(s) : null)))
                        : h('p', { class: 'cm-muted', text: t('noActiveSanctions') })),
                    namedSection(kit, 'cm-sanction-history', t('sanctionHistory'), h('p', { class: 'cm-fine', text: t('strikesHint', { days: p.strikes.window_days }) }),
                        p.sanctions.length ? h('ul', { class: 'cm-entries' }, p.sanctions.map((s) => h('li', { class: s.active ? '' : 'is-past' },
                            h('strong', { text: sanctionSummary(kit, s) }), h('p', { text: s.reason }),
                            h('small', { class: 'cm-muted', text: [`${s.actor ? `@${s.actor}` : t('system')} · ${formatDate(s.created_at)}`,
                                s.revoked_at ? t('liftedBy', { who: s.revoked_by ? `@${s.revoked_by}` : '', date: formatDate(s.revoked_at) }) : ''].filter(Boolean).join(' · ') }))))
                            : h('p', { class: 'cm-muted', text: t('noSanctions') })),
                    notesBlock(kit, 'user', p.handle, p.notes),
                    h('div', { class: 'cm-actions' },
                        h('button', { class: 'cm-btn', type: 'button', onclick: () => navigate(`mod/audit?person=${p.handle}`) }, t('seeHistory')),
                        h('button', { class: 'cm-btn', type: 'button', onclick: () => navigate(`mod/animations?q=@${p.handle}`) }, t('seeAnimations'))));
            } catch (error) {
                fill(el, emptyState(error.message));
            }
        }
        load();
        return { el, title: t('navPanel') };
    }

    // ------------------------------------------------------------------ animations

    function animationsView(kit, query = '') {
        const { h, t, api, media, navigate } = kit;
        const filters = [['published', t('status_published')], ['review', t('status_review')], ['scanning', t('status_scanning')],
            ['hidden', t('status_hidden')], ['rejected', t('status_rejected')], ['featured', t('statFeatured')]];
        const renderRow = (item, refresh) => {
            const act = (action, label, permission, style, confirm) => (can(kit, permission)
                ? { label, style, path: `/v1/mod/animations/${item.id}/action`, json: { action }, confirm } : null);
            const actions = [];
            if (item.status === 'published') actions.push(item.featured ? act('unfeature', t('animUnfeature'), 'feature') : act('feature', t('animFeature'), 'feature', 'is-primary'));
            if (item.status === 'review') actions.push(act('restore', t('action_approve'), 'review', 'is-primary'));
            if (item.status === 'hidden') actions.push(act('restore', t('animRestore'), 'review', 'is-primary'));
            if (['published', 'review'].includes(item.status)) actions.push(act('hide', t('action_hide'), 'review'));
            if (['published', 'review', 'hidden'].includes(item.status)) actions.push(act('recheck', t('animRecheck'), 'recheck'));
            if (['published', 'review', 'hidden', 'scanning'].includes(item.status)) actions.push(act('remove', t('action_remove'), 'remove', 'is-danger', t('actionConfirm_remove')));
            const allowed = actions.filter(Boolean);
            return h('div', { class: 'cm-row-item' },
                h('button', { class: 'cm-row-main', type: 'button', onclick: () => navigate(`a/${item.id}`) },
                    h('span', { class: 'cm-row-thumb' }, item.preview_url ? media(item.preview_url, 9, 16, 'cm-media') : null),
                    h('span', { class: 'cm-author-names' },
                        h('strong', { text: item.title }),
                        h('small', { text: `@${item.owner.handle}` }),
                        h('span', { class: 'cm-flags' },
                            item.featured ? h('span', { class: 'cm-flag is-ok', text: t('statFeatured') }) : null,
                            item.status_reason ? h('span', { class: 'cm-flag is-info', text: item.status_reason }) : null))),
                allowed.length ? h('button', { class: 'cm-iconbtn is-small', type: 'button', 'aria-label': t('moreActions'),
                    onclick: () => actionSheet(kit, item.title, allowed, refresh) }, '⋯') : null);
        };
        return panelPage(kit, 'animations', searchableList(kit, {
            filters, initial: 'published', placeholder: t('searchAnimationsPanel'), renderRow, query,
            fetchPage: ({ filter, q, cursor }) => api('GET', `/v1/mod/animations?status=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
        }));
    }

    // ------------------------------------------------------------------ history with filters

    function auditView(kit, params) {
        const { h, t, api, fill, navigate } = kit;
        const filters = { actor: params.get('actor') || '', person: params.get('person') || '', action: params.get('action') || '' };
        const list = h('ul', { class: 'cm-entries' });
        const more = h('button', { class: 'cm-btn is-wide', type: 'button', hidden: true }, t('loadMore'));
        const actor = h('input', { class: 'cm-input', placeholder: t('filterActor'), value: filters.actor, autocapitalize: 'off' });
        const person = h('input', { class: 'cm-input', placeholder: t('filterPerson'), value: filters.person, autocapitalize: 'off' });
        const action = h('select', { class: 'cm-input' }, ['', 'sanction', 'revoke', 'approve', 'hide', 'remove', 'auto_', 'feature', 'user_', 'role', 'permissions', 'settings', 'announcement', 'export']
            .map((value) => h('option', { value, text: value ? t(`auditAction_${value.replace(/_$/, '')}`) : t('auditActionAll'), selected: value === filters.action ? true : null })));
        let cursor = null;
        const query = () => {
            const q = new URLSearchParams();
            if (actor.value.trim()) q.set('actor', actor.value.trim());
            if (person.value.trim()) q.set('person', person.value.trim());
            if (action.value) q.set('action', action.value);
            return q;
        };
        async function load(reset) {
            if (reset) { cursor = null; fill(list); }
            try {
                const q = query();
                if (cursor) q.set('cursor', cursor);
                const page = await api('GET', `/v1/mod/audit?${q}`);
                page.items.forEach((entry) => list.append(h('li', {},
                    h('strong', { text: t(`action_${entry.action}`) }),
                    h('small', { class: 'cm-muted', text: ` · ${t(`targetType_${entry.target_type}`)} · ${entry.actor ? `@${entry.actor}` : t('system')} · ${t(`source_${entry.source}`)} · ${ago(kit, entry.created_at)}` }),
                    entry.case_id ? h('button', { class: 'cm-link', type: 'button', onclick: () => navigate(`mod/case/${entry.case_id}`) }, t('openCase')) : null,
                    entry.reason ? h('p', { text: entry.reason }) : null)));
                if (!list.childElementCount) fill(list, h('li', { class: 'cm-muted', text: t('nothingFound') }));
                cursor = page.next_cursor;
                more.hidden = !cursor;
            } catch (error) {
                kit.reportError(error);
            }
        }
        let debounce = 0;
        const reload = () => { clearTimeout(debounce); debounce = setTimeout(() => load(true), 320); };
        actor.addEventListener('input', reload);
        person.addEventListener('input', reload);
        action.addEventListener('change', () => load(true));
        more.addEventListener('click', () => load(false));
        load(true);
        return panelPage(kit, 'audit', h('div', { class: 'cm-filters' }, actor, person, action), list, more);
    }

    // ------------------------------------------------------------------ team with per-moderator permissions

    function permissionBoxes(kit, all, checked) {
        const { h, t } = kit;
        const boxes = all.map((permission) => ({ permission, box: h('input', { type: 'checkbox', checked: checked.includes(permission) ? true : null }) }));
        return {
            el: h('div', { class: 'cm-perms' }, boxes.map(({ permission, box }) => h('label', { class: 'cm-check' }, box,
                h('span', {}, h('strong', { text: t(`perm_${permission}`) }), h('small', { class: 'cm-muted', text: t(`permHint_${permission}`) }))))),
            value: () => boxes.filter(({ box }) => box.checked).map(({ permission }) => permission),
        };
    }

    function teamView(kit) {
        const { h, t, api, fill, toast, reportError, modal } = kit;
        const owner = isOwner(kit);
        const list = h('div', { class: 'cm-rows' });
        let allPermissions = [];
        async function refresh() {
            try {
                const data = await api('GET', '/v1/mod/team');
                allPermissions = data.permissions;
                fill(list, data.items.map((member) => h('div', { class: 'cm-row-item is-column' },
                    h('div', { class: 'cm-member' },
                        h('span', { class: 'cm-author-names' }, h('strong', { text: member.display_name }), h('small', { text: `@${member.handle}` })),
                        h('span', { class: 'cm-badge', text: t(`role_${member.role}`) }),
                        h('span', { class: `cm-flag${member.discord_linked ? ' is-ok' : ''}`, text: member.discord_linked ? t('discordLinked') : t('discordNotLinked') })),
                    member.role === 'moderator' ? h('small', { class: 'cm-muted', text: member.permissions.length
                        ? member.permissions.map((permission) => t(`perm_${permission}`)).join(' · ') : t('noPermissionsYet') }) : null,
                    owner && member.role === 'moderator' ? h('button', { class: 'cm-btn', type: 'button', onclick: () => {
                        const boxes = permissionBoxes(kit, allPermissions, member.permissions);
                        const save = h('button', { class: 'cm-btn is-primary is-wide', type: 'button' }, t('save'));
                        const sheet = modal(t('permissionsOf', { handle: member.handle }), h('div', { class: 'cm-form is-plain' }, boxes.el, save));
                        save.addEventListener('click', async () => {
                            try {
                                await api('PUT', `/v1/mod/users/${member.handle}/permissions`, { json: { permissions: boxes.value() } });
                                sheet.close();
                                toast(t('settingsSaved'), 'success');
                                refresh();
                            } catch (error) { reportError(error); }
                        });
                    } }, t('editPermissions')) : null)));
            } catch (error) {
                reportError(error);
            }
        }
        const handle = h('input', { class: 'cm-input', placeholder: t('teamHandle'), autocomplete: 'off', autocapitalize: 'off' });
        const discord = h('input', { class: 'cm-input', placeholder: t('teamDiscord'), inputmode: 'numeric', autocomplete: 'off' });
        const clean = () => handle.value.trim().replace(/^@/, '').toLowerCase();
        async function run(path, json, done) {
            if (!clean()) return toast(t('teamHandleRequired'), 'info');
            try {
                await api('PUT', `/v1/mod/users/${encodeURIComponent(clean())}/${path}`, { json });
                toast(done, 'success');
                refresh();
            } catch (error) {
                reportError(error);
            }
        }
        let manage = h('p', { class: 'cm-fine', text: t('teamOwnerOnly') });
        if (owner) {
            const promoteBoxesSlot = h('div');
            let promoteBoxes = null;
            refresh().then(() => {
                promoteBoxes = permissionBoxes(kit, allPermissions, []);
                fill(promoteBoxesSlot, h('span', { class: 'cm-label', text: t('newModPermissions') }), promoteBoxes.el);
            });
            manage = h('div', { class: 'cm-form' },
                h('h4', { class: 'cm-section-title', text: t('teamManage') }),
                h('p', { class: 'cm-fine', text: t('teamIntro') }),
                handle,
                promoteBoxesSlot,
                h('div', { class: 'cm-decide' },
                    h('button', { class: 'cm-btn is-primary', type: 'button', onclick: () => run('role', { role: 'moderator', permissions: promoteBoxes ? promoteBoxes.value() : [] }, t('teamPromoted')) }, t('teamPromote')),
                    h('button', { class: 'cm-btn', type: 'button', onclick: () => run('role', { role: 'user' }, t('teamDemoted')) }, t('teamDemote'))),
                discord,
                h('div', { class: 'cm-decide' },
                    h('button', { class: 'cm-btn', type: 'button', onclick: () => run('discord', { discord_id: discord.value.trim() }, t('teamLinked')) }, t('teamLink')),
                    h('button', { class: 'cm-btn', type: 'button', onclick: () => run('discord', { discord_id: null }, t('teamUnlinked')) }, t('teamUnlink'))),
                h('p', { class: 'cm-fine', text: t('teamDiscordHint') }));
        } else {
            refresh();
        }
        return panelPage(kit, 'team', section(kit, t('teamMembers'), list), manage);
    }

    // ------------------------------------------------------------------ owner settings

    function settingsView(kit) {
        const { h, t, api, fill, toast, reportError, loading, emptyState } = kit;
        const body = h('div', { class: 'cm-form' }, loading());
        api('GET', '/v1/mod/settings').then((settings) => {
            const number = (key, min, max) => h('input', { class: 'cm-input', type: 'number', inputmode: 'numeric', min: String(min), max: String(max), value: String(settings[key]) });
            const size = number('max_animation_mb', 1, 50);
            const perHour = number('uploads_per_hour', 1, 50);
            const perDay = number('uploads_per_day', 1, 200);
            const mass = number('mass_report_threshold', 2, 20);
            let detector = settings.detector;
            const detectorPicker = h('div', { class: 'cm-segmented' });
            const paintDetector = () => fill(detectorPicker, ['relaxed', 'normal', 'strict'].map((level) => h('button', {
                type: 'button', role: 'radio', 'aria-checked': String(level === detector), onclick: () => { detector = level; paintDetector(); },
            }, t(`detector_${level}`))));
            paintDetector();
            const events = Object.keys(settings.discord_events).map((key) => ({ key, box: h('input', { type: 'checkbox', checked: settings.discord_events[key] ? true : null }) }));
            const save = h('button', { class: 'cm-btn is-primary is-wide', type: 'button' }, t('save'));
            save.addEventListener('click', async () => {
                save.disabled = true;
                try {
                    await api('PUT', '/v1/mod/settings', { json: {
                        max_animation_mb: Number(size.value), uploads_per_hour: Number(perHour.value), uploads_per_day: Number(perDay.value),
                        mass_report_threshold: Number(mass.value), detector,
                        discord_events: Object.fromEntries(events.map(({ key, box }) => [key, box.checked])),
                    } });
                    toast(t('settingsSaved'), 'success');
                } catch (error) {
                    reportError(error);
                } finally {
                    save.disabled = false;
                }
            });
            const field = (label, control, hint) => h('label', { class: 'cm-field' }, h('span', { class: 'cm-label', text: label }), control, hint ? h('small', { class: 'cm-muted', text: hint }) : null);
            fill(body,
                field(t('settingMaxSize'), size, t('settingMaxSizeHint')),
                field(t('settingPerHour'), perHour),
                field(t('settingPerDay'), perDay, t('settingLimitsHint')),
                field(t('settingMass'), mass, t('settingMassHint')),
                h('div', { class: 'cm-field' }, h('span', { class: 'cm-label', text: t('settingDetector') }), detectorPicker, h('small', { class: 'cm-muted', text: t('settingDetectorHint') })),
                h('div', { class: 'cm-field' }, h('span', { class: 'cm-label', text: t('settingDiscord') }),
                    events.map(({ key, box }) => h('label', { class: 'cm-check' }, box, h('span', { text: t(`discordEvent_${key}`) }))),
                    h('small', { class: 'cm-muted', text: t('settingDiscordHint') })),
                save);
        }).catch((error) => fill(body, emptyState(error.message)));
        return panelPage(kit, 'settings', body);
    }

    // ------------------------------------------------------------------ router

    function view(sub, kit) {
        if (!kit.state.me || !['moderator', 'owner'].includes(kit.state.me.role)) {
            return { el: kit.emptyState(kit.t('modOnly')), title: kit.t('navPanel') };
        }
        const [path, search = ''] = String(sub || 'overview').split('?');
        const params = new URLSearchParams(search);
        const caseMatch = /^case\/([A-Za-z0-9_-]{16})$/.exec(path);
        if (caseMatch) return caseView(kit, caseMatch[1]);
        const personMatch = /^person\/([a-z0-9-]{1,39})$/.exec(path);
        if (personMatch) return personView(kit, personMatch[1]);
        if (path === 'overview') return overviewView(kit);
        if (path === 'people') return peopleView(kit, params.get('q') || '');
        if (path === 'animations') return animationsView(kit, params.get('q') || '');
        if (path === 'audit') return auditView(kit, params);
        if (path === 'team') return teamView(kit);
        if (path === 'settings' && isOwner(kit)) return settingsView(kit);
        return queueView(kit, ['mass', 'reports', 'review'].includes(path) ? path : 'mass');
    }

    window.BASCommunityPanel = Object.freeze({ view });
})();
