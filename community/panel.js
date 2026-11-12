// Community moderation panel (moderators only; the API enforces it, this only draws it).
(function () {
    'use strict';

    const TABS = ['overview', 'mass', 'reports', 'review', 'animations', 'people', 'audit', 'team'];
    const ACTION_STYLE = { approve: 'is-primary', hide: '', clear_profile: '', remove: 'is-danger', ban: 'is-danger' };
    const DANGEROUS = new Set(['remove', 'ban']);

    function ago(kit, ms) {
        const minutes = Math.round((Date.now() - ms) / 60000);
        if (minutes < 1) return kit.t('justNow');
        if (minutes < 60) return kit.t('minutesAgo', { n: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 48) return kit.t('hoursAgo', { n: hours });
        return kit.formatDate(ms);
    }

    // Tabs with counters; the counters arrive a moment later and are filled in place.
    function tabsBar(kit, active) {
        const { h, t, fill, navigate, api } = kit;
        const bar = h('div', { class: 'cm-chips is-panel', role: 'tablist' });
        const paint = (summary) => fill(bar, TABS.map((tab) => {
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

    function caseRow(kit, item) {
        const { h, t, navigate, media } = kit;
        const target = item.target || {};
        const image = target.preview_url || target.image_url;
        return h('button', { class: `cm-case is-${item.tab}`, type: 'button', dataset: { severity: item.max_severity }, onclick: () => navigate(`mod/case/${item.id}`) },
            h('span', { class: 'cm-case-thumb' }, image ? media(image, 9, 16, 'cm-media') : h('span', { text: t(`targetType_${item.target_type}`) })),
            h('span', { class: 'cm-case-body' },
                h('strong', { text: target.missing ? t('targetMissing') : (target.title || item.target_id) }),
                h('small', { class: 'cm-muted', text: [target.owner ? `@${target.owner}` : '', ago(kit, item.updated_at)].filter(Boolean).join(' · ') }),
                h('span', { class: 'cm-flags' },
                    item.report_count ? h('span', { class: 'cm-flag', text: t('reportsN', { n: item.report_count }) }) : null,
                    item.report_count ? h('span', { class: `cm-flag is-sev-${item.max_severity}`, text: t(`severity_${Math.max(0, Math.min(3, item.max_severity))}`) }) : null,
                    item.auto_hidden ? h('span', { class: 'cm-flag is-warn', text: t('autoHidden') }) : null,
                    item.findings.length && item.findings[item.findings.length - 1].message
                        ? h('span', { class: 'cm-flag is-info', text: item.findings[item.findings.length - 1].message }) : null)));
    }

    function queueView(kit, tab) {
        const { h, t, api, fill, loading, emptyState } = kit;
        const list = h('div', { class: 'cm-cases' }, loading());
        const more = h('button', { class: 'cm-btn is-wide', type: 'button', hidden: true }, t('loadMore'));
        let cursor = null;
        async function load(reset) {
            more.disabled = true;
            try {
                const page = await api('GET', `/v1/mod/queue?tab=${tab}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
                if (reset) fill(list);
                page.items.forEach((item) => list.append(caseRow(kit, item)));
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
        return {
            el: h('section', { class: 'cm-panel' }, tabsBar(kit, tab), h('p', { class: 'cm-fine', text: t(`panelHint_${tab}`) }), list, more),
            title: t('navPanel'),
        };
    }

    function caseView(kit, id) {
        const { h, t, api, fill, navigate, toast, reportError, media, confirmAction, fetchVerified, loading, emptyState } = kit;
        const el = h('section', { class: 'cm-panel cm-case-detail' }, loading());
        api('GET', `/v1/mod/cases/${id}`).then((item) => {
            const target = item.target || {};
            const reason = h('textarea', { class: 'cm-input', rows: '2', maxlength: '500', placeholder: t('actionReason') });
            const buttons = item.status === 'open' ? item.actions.map((action) => {
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
            const section = (title, ...body) => h('div', { class: 'cm-block' }, h('h4', { class: 'cm-section-title', text: title }), body);
            fill(el,
                h('div', { class: 'cm-case-head' },
                    h('span', { class: `cm-flag is-tab-${item.tab}`, text: t(`panelTab_${item.tab}`) }),
                    item.status !== 'open' ? h('span', { class: 'cm-flag', text: t('caseClosed', { resolution: t(`action_${item.resolution}`) }) }) : null),
                image ? h('div', { class: 'cm-case-media' }, media(image, 9, 16, 'cm-media is-large')) : null,
                h('h3', { class: 'cm-detail-title', text: target.missing ? t('targetMissing') : (target.title || item.target_id) }),
                h('div', { class: 'cm-case-links' },
                    target.owner ? h('button', { class: 'cm-link', type: 'button', onclick: () => navigate(`u/${target.owner}`) }, `@${target.owner}`) : null,
                    item.target_type === 'animation' && !target.missing ? h('button', { class: 'cm-link', type: 'button', onclick: () => navigate(`a/${item.target_id}`) }, t('openItem')) : null,
                    inspect),
                target.bio ? h('p', { class: 'cm-text', text: target.bio }) : null,
                target.status ? h('p', { class: 'cm-muted', text: t('targetStatus', { status: t(`status_${target.status}`) }) }) : null,
                item.auto_hidden ? h('p', { class: 'cm-banner-status is-hidden', text: t('autoHiddenLong') }) : null,
                buttons.length ? section(t('decide'), reason, h('div', { class: 'cm-decide' }, buttons)) : null,
                item.findings.length ? section(t('findings'), h('ul', { class: 'cm-entries' }, item.findings.map((finding) => h('li', { dataset: { severity: finding.severity } },
                    h('code', { text: finding.code }), finding.message ? ` ${finding.message}` : null)))) : null,
                item.reports.length ? section(t('reportsN', { n: item.reports.length }), h('ul', { class: 'cm-entries' }, item.reports.map((report) => h('li', { dataset: { severity: report.severity } },
                    h('strong', { text: t(`reportCat_${report.category}`) }),
                    h('small', { class: 'cm-muted', text: ` · ${report.reporter ? `@${report.reporter}` : t('deletedUser')} · ${ago(kit, report.created_at)}` }),
                    report.note ? h('p', { text: report.note }) : null)))) : null,
                item.history.length ? section(t('history'), h('ul', { class: 'cm-entries' }, item.history.map((entry) => h('li', {},
                    h('strong', { text: t(`action_${entry.action}`) }),
                    h('small', { class: 'cm-muted', text: ` · ${entry.actor ? `@${entry.actor}` : t('system')} · ${t(`source_${entry.source}`)} · ${ago(kit, entry.created_at)}` }),
                    entry.reason ? h('p', { text: entry.reason }) : null)))) : null);
        }).catch((error) => fill(el, emptyState(error.message)));
        return { el, title: t('navPanel') };
    }

    function auditView(kit) {
        const { h, t, api, fill } = kit;
        const list = h('ul', { class: 'cm-entries' });
        const more = h('button', { class: 'cm-btn is-wide', type: 'button', hidden: true }, t('loadMore'));
        let cursor = null;
        async function load() {
            try {
                const page = await api('GET', `/v1/mod/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
                page.items.forEach((entry) => list.append(h('li', {},
                    h('strong', { text: t(`action_${entry.action}`) }),
                    h('small', { class: 'cm-muted', text: ` · ${t(`targetType_${entry.target_type}`)} · ${entry.actor ? `@${entry.actor}` : t('system')} · ${t(`source_${entry.source}`)} · ${ago(kit, entry.created_at)}` }),
                    entry.case_id ? h('button', { class: 'cm-link', type: 'button', onclick: () => kit.navigate(`mod/case/${entry.case_id}`) }, t('openCase')) : null,
                    entry.reason ? h('p', { text: entry.reason }) : null)));
                if (!list.childElementCount) fill(list, h('li', { class: 'cm-muted', text: t('queueEmpty') }));
                cursor = page.next_cursor;
                more.hidden = !cursor;
            } catch (error) {
                kit.reportError(error);
            }
        }
        more.addEventListener('click', load);
        load();
        return { el: h('section', { class: 'cm-panel' }, tabsBar(kit, 'audit'), list, more), title: t('navPanel') };
    }

    function teamView(kit) {
        const { h, t, api, fill, toast, reportError } = kit;
        const isOwner = kit.state.me && kit.state.me.role === 'owner';
        const list = h('ul', { class: 'cm-entries' });
        async function refresh() {
            try {
                const data = await api('GET', '/v1/mod/team');
                fill(list, data.items.map((member) => h('li', { class: 'cm-member' },
                    h('span', { class: 'cm-author-names' }, h('strong', { text: member.display_name }), h('small', { text: `@${member.handle}` })),
                    h('span', { class: 'cm-badge', text: t(`role_${member.role}`) }),
                    h('span', { class: `cm-flag${member.discord_linked ? ' is-ok' : ''}`, text: member.discord_linked ? t('discordLinked') : t('discordNotLinked') }))));
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
        const manage = isOwner ? h('div', { class: 'cm-form' },
            h('h4', { class: 'cm-section-title', text: t('teamManage') }),
            h('p', { class: 'cm-fine', text: t('teamIntro') }),
            handle,
            h('div', { class: 'cm-decide' },
                h('button', { class: 'cm-btn is-primary', type: 'button', onclick: () => run('role', { role: 'moderator' }, t('teamPromoted')) }, t('teamPromote')),
                h('button', { class: 'cm-btn', type: 'button', onclick: () => run('role', { role: 'user' }, t('teamDemoted')) }, t('teamDemote'))),
            discord,
            h('div', { class: 'cm-decide' },
                h('button', { class: 'cm-btn', type: 'button', onclick: () => run('discord', { discord_id: discord.value.trim() }, t('teamLinked')) }, t('teamLink')),
                h('button', { class: 'cm-btn', type: 'button', onclick: () => run('discord', { discord_id: null }, t('teamUnlinked')) }, t('teamUnlink'))),
            h('p', { class: 'cm-fine', text: t('teamDiscordHint') })) : h('p', { class: 'cm-fine', text: t('teamOwnerOnly') });
        refresh();
        return {
            el: h('section', { class: 'cm-panel' }, tabsBar(kit, 'team'), h('div', { class: 'cm-block' }, h('h4', { class: 'cm-section-title', text: t('teamMembers') }), list), manage),
            title: t('navPanel'),
        };
    }

    // ------------------------------------------------------------------ overview

    function overviewView(kit) {
        const { h, t, api, fill, toast, reportError, formatBytes, formatCount, navigate, loading, emptyState } = kit;
        const isOwner = kit.state.me && kit.state.me.role === 'owner';
        const body = h('div', { class: 'cm-overview' }, loading());
        async function load() {
            try {
                const data = await api('GET', '/v1/mod/stats');
                const used = data.storage.used_bytes;
                const limit = data.storage.limit_bytes || 1;
                const share = Math.min(1, used / limit);
                const level = share >= 0.95 ? 'is-danger' : share >= 0.8 ? 'is-warn' : '';
                const pause = isOwner ? h('button', { class: `cm-btn ${data.storage.paused ? 'is-primary' : ''}`, type: 'button' },
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
                fill(body,
                    h('section', { class: 'cm-block cm-storage' },
                        h('div', { class: 'cm-storage-head' },
                            h('h4', { class: 'cm-section-title', text: t('storageTitle') }),
                            data.storage.paused ? h('span', { class: 'cm-flag is-warn', text: t('uploadsPausedFlag') }) : null),
                        h('div', { class: `cm-meter ${level}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(limit), 'aria-valuenow': String(used) },
                            h('span', { style: `width:${(share * 100).toFixed(1)}%` })),
                        h('p', { class: 'cm-storage-text', text: t('storageText', { used: formatBytes(used), limit: formatBytes(limit), free: formatBytes(Math.max(0, limit - used)), pct: Math.round(share * 100) }) }),
                        h('p', { class: 'cm-fine', text: t('storageHint') }),
                        pause),
                    h('section', { class: 'cm-block' },
                        h('h4', { class: 'cm-section-title', text: t('waitingForYou') }),
                        h('div', { class: 'cm-stats' },
                            tile(data.open_cases.mass, t('panelTab_mass'), 'mod/mass', data.open_cases.mass ? 'is-danger' : ''),
                            tile(data.open_cases.reports, t('panelTab_reports'), 'mod/reports', data.open_cases.reports ? 'is-warn' : ''),
                            tile(data.open_cases.review, t('panelTab_review'), 'mod/review'))),
                    h('section', { class: 'cm-block' },
                        h('h4', { class: 'cm-section-title', text: t('communityNumbers') }),
                        h('div', { class: 'cm-stats' },
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
                            tile(data.checks.failed_7d, t('statChecksFailed'), null, data.checks.failed_7d ? 'is-warn' : ''))));
            } catch (error) {
                fill(body, emptyState(error.message));
            }
        }
        load();
        return { el: h('section', { class: 'cm-panel' }, tabsBar(kit, 'overview'), body), title: t('navPanel') };
    }

    // ------------------------------------------------------------------ searchable lists (people, animations)

    function searchableList(kit, { filters, initial, fetchPage, renderRow, placeholder }) {
        const { h, t, fill, loading, emptyState } = kit;
        let filter = initial;
        let q = '';
        let cursor = null;
        const input = h('input', { class: 'cm-search-input', type: 'search', placeholder, 'aria-label': placeholder, maxlength: '60' });
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

    function peopleView(kit) {
        const { h, t, api, avatar, formatDate, navigate } = kit;
        const filters = [['all', t('filterAll')], ['new', t('filterNew')], ['team', t('filterTeam')], ['banned', t('filterBanned')]];
        const renderRow = (user, refresh) => {
            const act = (action, label, style, confirm) => ({ label, style, path: `/v1/mod/users/${user.handle}/action`, json: { action }, confirm });
            const actions = [
                user.status === 'banned' ? act('unban', t('userUnban'), 'is-primary') : act('ban', t('userBan'), 'is-danger', t('userBanConfirm')),
                user.trust ? act('untrust', t('userUntrust')) : act('trust', t('userTrust')),
            ];
            const canAct = user.role !== 'owner' && user.handle !== kit.state.me.handle && (user.role !== 'moderator' || kit.state.me.role === 'owner');
            return h('div', { class: 'cm-row-item' },
                h('button', { class: 'cm-row-main', type: 'button', onclick: () => navigate(`u/${user.handle}`) },
                    avatar(user.avatar_url, 'md'),
                    h('span', { class: 'cm-author-names' },
                        h('strong', { text: user.display_name || user.handle }),
                        h('small', { text: `@${user.handle} · ${t('joinedShort', { date: formatDate(user.created_at) })}` }),
                        h('span', { class: 'cm-flags' },
                            user.role !== 'user' ? h('span', { class: 'cm-flag is-ok', text: t(`role_${user.role}`) }) : null,
                            user.status === 'banned' ? h('span', { class: 'cm-flag is-sev-3', text: t('flagBanned') }) : null,
                            h('span', { class: 'cm-flag', text: user.trust ? t('flagTrusted') : t('flagNew') }),
                            h('span', { class: 'cm-flag is-info', text: t('userCounts', { published: user.published, refused: user.refused }) })))),
                canAct ? h('button', { class: 'cm-iconbtn is-small', type: 'button', 'aria-label': t('moreActions'),
                    onclick: () => actionSheet(kit, `@${user.handle}`, actions, refresh) }, '⋯') : null);
        };
        return {
            el: h('section', { class: 'cm-panel' }, tabsBar(kit, 'people'),
                searchableList(kit, {
                    filters, initial: 'all', placeholder: t('searchPeople'), renderRow,
                    fetchPage: ({ filter, q, cursor }) => api('GET', `/v1/mod/users?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
                })),
            title: t('navPanel'),
        };
    }

    function animationsView(kit) {
        const { h, t, api, media, navigate } = kit;
        const filters = [['published', t('status_published')], ['review', t('status_review')], ['scanning', t('status_scanning')],
            ['hidden', t('status_hidden')], ['rejected', t('status_rejected')], ['featured', t('statFeatured')]];
        const renderRow = (item, refresh) => {
            const act = (action, label, style, confirm) => ({ label, style, path: `/v1/mod/animations/${item.id}/action`, json: { action }, confirm });
            const actions = [];
            if (item.status === 'published') actions.push(item.featured ? act('unfeature', t('animUnfeature')) : act('feature', t('animFeature'), 'is-primary'));
            if (item.status === 'review') actions.push(act('restore', t('action_approve'), 'is-primary'));
            if (item.status === 'hidden') actions.push(act('restore', t('animRestore'), 'is-primary'));
            if (['published', 'review'].includes(item.status)) actions.push(act('hide', t('action_hide')));
            if (['published', 'review', 'hidden'].includes(item.status)) actions.push(act('recheck', t('animRecheck')));
            if (['published', 'review', 'hidden', 'scanning'].includes(item.status)) actions.push(act('remove', t('action_remove'), 'is-danger', t('actionConfirm_remove')));
            return h('div', { class: 'cm-row-item' },
                h('button', { class: 'cm-row-main', type: 'button', onclick: () => navigate(`a/${item.id}`) },
                    h('span', { class: 'cm-row-thumb' }, item.preview_url ? media(item.preview_url, 9, 16, 'cm-media') : null),
                    h('span', { class: 'cm-author-names' },
                        h('strong', { text: item.title }),
                        h('small', { text: `@${item.owner.handle}` }),
                        h('span', { class: 'cm-flags' },
                            item.featured ? h('span', { class: 'cm-flag is-ok', text: t('statFeatured') }) : null,
                            item.status_reason ? h('span', { class: 'cm-flag is-info', text: item.status_reason }) : null))),
                actions.length ? h('button', { class: 'cm-iconbtn is-small', type: 'button', 'aria-label': t('moreActions'),
                    onclick: () => actionSheet(kit, item.title, actions, refresh) }, '⋯') : null);
        };
        return {
            el: h('section', { class: 'cm-panel' }, tabsBar(kit, 'animations'),
                searchableList(kit, {
                    filters, initial: 'published', placeholder: t('searchAnimationsPanel'), renderRow,
                    fetchPage: ({ filter, q, cursor }) => api('GET', `/v1/mod/animations?status=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
                })),
            title: t('navPanel'),
        };
    }

    function view(sub, kit) {
        if (!kit.state.me || !['moderator', 'owner'].includes(kit.state.me.role)) {
            return { el: kit.emptyState(kit.t('modOnly')), title: kit.t('navPanel') };
        }
        const match = /^case\/([A-Za-z0-9_-]{16})$/.exec(sub);
        if (match) return caseView(kit, match[1]);
        if (sub === 'overview') return overviewView(kit);
        if (sub === 'people') return peopleView(kit);
        if (sub === 'animations') return animationsView(kit);
        if (sub === 'audit') return auditView(kit);
        if (sub === 'team') return teamView(kit);
        return queueView(kit, ['mass', 'reports', 'review'].includes(sub) ? sub : 'mass');
    }

    window.BASCommunityPanel = Object.freeze({ view });
})();
