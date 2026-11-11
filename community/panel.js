// Community moderation panel (moderators only; the API enforces it, this only draws it).
(function () {
    'use strict';

    const TABS = ['mass', 'reports', 'review', 'audit', 'team'];
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

    function view(sub, kit) {
        if (!kit.state.me || !['moderator', 'owner'].includes(kit.state.me.role)) {
            return { el: kit.emptyState(kit.t('modOnly')), title: kit.t('navPanel') };
        }
        const match = /^case\/([A-Za-z0-9_-]{16})$/.exec(sub);
        if (match) return caseView(kit, match[1]);
        if (sub === 'audit') return auditView(kit);
        if (sub === 'team') return teamView(kit);
        return queueView(kit, ['mass', 'reports', 'review'].includes(sub) ? sub : 'mass');
    }

    window.BASCommunityPanel = Object.freeze({ view });
})();
