// Community moderation panel (moderators only; the API enforces it, this only draws it).
(function () {
    'use strict';

    const TABS = ['mass', 'reports', 'review', 'audit', 'team'];
    const ACTION_STYLE = { approve: 'community-btn-primary', hide: '', clear_profile: '', remove: 'is-danger', ban: 'is-danger' };
    const DANGEROUS = new Set(['remove', 'ban']);

    function relativeTime(kit, ms) {
        const minutes = Math.round((Date.now() - ms) / 60000);
        if (minutes < 1) return kit.t('justNow');
        if (minutes < 60) return kit.t('minutesAgo', { n: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 48) return kit.t('hoursAgo', { n: hours });
        return kit.formatDate(ms);
    }

    function tabsBar(kit, active, summary) {
        const { h, t, navigate } = kit;
        const counts = summary ? { mass: summary.mass, reports: summary.reports, review: summary.review } : {};
        return h('div', { class: 'community-panel-tabs', role: 'tablist' }, TABS.map((tab) => h('button', {
                type: 'button', role: 'tab', class: 'community-panel-tab', 'aria-selected': String(tab === active),
                dataset: { tab, urgent: tab === 'mass' && counts.mass ? 'true' : tab === 'reports' && summary && summary.critical_reports ? 'true' : null },
                onclick: () => navigate(`mod/${tab}`),
            }, t(`panelTab_${tab}`), counts[tab] ? h('span', { class: 'community-badge', text: String(counts[tab]) }) : null)));
    }

    function severityLabel(kit, severity) {
        return kit.t(`severity_${Math.max(0, Math.min(3, severity))}`);
    }

    function caseCard(kit, item) {
        const { h, t, navigate, previewImage } = kit;
        const target = item.target || {};
        const image = target.preview_url || target.image_url;
        return h('button', { class: `community-case is-${item.tab}`, type: 'button', dataset: { severity: String(item.max_severity) }, onclick: () => navigate(`mod/case/${item.id}`) },
            h('div', { class: 'community-case-thumb' }, image ? previewImage(image, null, null, 'community-case-preview') : h('span', { text: t(`targetType_${item.target_type}`) })),
            h('div', { class: 'community-case-body' },
                h('strong', { text: target.missing ? t('targetMissing') : (target.title || item.target_id) }),
                h('span', { class: 'community-muted' }, target.owner ? `@${target.owner} · ` : '', relativeTime(kit, item.updated_at)),
                h('span', { class: 'community-case-flags' },
                    item.report_count ? h('span', { class: 'community-flag', text: t('reportsN', { n: item.report_count }) }) : null,
                    item.report_count ? h('span', { class: `community-flag is-sev-${item.max_severity}`, text: severityLabel(kit, item.max_severity) }) : null,
                    item.auto_hidden ? h('span', { class: 'community-flag is-warn', text: t('autoHidden') }) : null,
                    item.findings.slice(-2).map((finding) => finding.message ? h('span', { class: 'community-flag is-info', text: finding.message }) : null)),
            ));
    }

    function queueView(kit, tab) {
        const { h, t, api } = kit;
        const head = h('div');
        const list = h('div', { class: 'community-case-list' }, h('div', { class: 'community-loading', text: t('loading') }));
        const more = h('button', { class: 'community-btn', type: 'button', hidden: true }, t('loadMore'));
        const el = h('section', { class: 'community-panel' }, head, h('p', { class: 'community-muted community-panel-hint', text: t(`panelHint_${tab}`) }), list, more);
        let cursor = null;

        async function load(reset) {
            more.disabled = true;
            try {
                const page = await api('GET', `/v1/mod/queue?tab=${tab}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
                if (reset) list.replaceChildren();
                page.items.forEach((item) => list.append(caseCard(kit, item)));
                if (reset && !page.items.length) list.replaceChildren(h('div', { class: 'community-empty' }, t('queueEmpty')));
                cursor = page.next_cursor;
                more.hidden = !cursor;
            } catch (error) {
                list.replaceChildren(h('div', { class: 'community-empty' }, error.message));
            } finally {
                more.disabled = false;
            }
        }
        more.addEventListener('click', () => load(false));
        api('GET', '/v1/mod/summary').then((summary) => head.replaceChildren(tabsBar(kit, tab, summary))).catch(() => head.replaceChildren(tabsBar(kit, tab, null)));
        head.replaceChildren(tabsBar(kit, tab, null));
        load(true);
        return { el, title: kit.t('navPanel') };
    }

    function caseView(kit, id) {
        const { h, t, api, navigate, toast, reportError, previewImage, confirmAction, fetchVerified } = kit;
        const el = h('section', { class: 'community-panel community-case-detail' }, h('div', { class: 'community-loading', text: t('loading') }));
        const view = { el, title: t('navPanel') };

        api('GET', `/v1/mod/cases/${id}`).then((item) => {
            const target = item.target || {};
            const reason = h('textarea', { class: 'community-textarea', rows: '2', maxlength: '500', placeholder: t('actionReason') });
            const buttons = item.status === 'open' ? item.actions.map((action) => {
                const button = h('button', { class: `community-btn ${ACTION_STYLE[action] || ''}`, type: 'button' }, t(`action_${action}`));
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

            const inspect = item.target_type === 'animation' && !target.missing ? h('button', { class: 'community-link-btn', type: 'button' }, t('downloadForReview')) : null;
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
            el.replaceChildren(
                h('div', { class: 'community-case-top' },
                    h('button', { class: 'community-link-btn', type: 'button', onclick: () => navigate(`mod/${item.tab}`) }, `‹ ${t(`panelTab_${item.tab}`)}`),
                    h('span', { class: `community-flag is-tab-${item.tab}`, text: t(`panelTab_${item.tab}`) }),
                    item.status !== 'open' ? h('span', { class: 'community-flag', text: t('caseClosed', { resolution: t(`action_${item.resolution}`) }) }) : null),
                h('div', { class: 'community-case-grid' },
                    h('div', { class: 'community-case-media' },
                        image ? previewImage(image, null, null, 'community-detail-preview') : null,
                        item.target_type === 'animation' && !target.missing ? h('button', { class: 'community-link-btn', type: 'button', onclick: () => navigate(`a/${item.target_id}`) }, t('openItem')) : null,
                        inspect),
                    h('div', { class: 'community-case-info' },
                        h('h3', { text: target.missing ? t('targetMissing') : (target.title || item.target_id) }),
                        target.owner ? h('button', { class: 'community-link-btn', type: 'button', onclick: () => navigate(`u/${target.owner}`) }, `@${target.owner}`) : null,
                        target.bio ? h('p', { class: 'community-bio', text: target.bio }) : null,
                        target.status ? h('p', { class: 'community-muted', text: t('targetStatus', { status: t(`status_${target.status}`) }) }) : null,
                        item.auto_hidden ? h('p', { class: 'community-status is-hidden', text: t('autoHiddenLong') }) : null,
                        item.findings.length ? h('div', { class: 'community-subsection' }, h('h4', { text: t('findings') }),
                            h('ul', { class: 'community-findings' }, item.findings.map((finding) => h('li', { dataset: { severity: String(finding.severity) } },
                                h('code', { text: finding.code }), ' ', finding.message)))) : null,
                        item.reports.length ? h('div', { class: 'community-subsection' }, h('h4', { text: t('reportsN', { n: item.reports.length }) }),
                            h('ul', { class: 'community-reports' }, item.reports.map((report) => h('li', { dataset: { severity: String(report.severity) } },
                                h('strong', { text: t(`reportCat_${report.category}`) }),
                                h('span', { class: 'community-muted', text: ` · ${report.reporter ? `@${report.reporter}` : t('deletedUser')} · ${relativeTime(kit, report.created_at)}` }),
                                report.note ? h('p', { text: report.note }) : null)))) : null,
                        buttons.length ? h('div', { class: 'community-subsection' }, h('h4', { text: t('decide') }), reason, h('div', { class: 'community-actions' }, buttons)) : null,
                        item.history.length ? h('div', { class: 'community-subsection' }, h('h4', { text: t('history') }),
                            h('ul', { class: 'community-history' }, item.history.map((entry) => h('li', {},
                                h('strong', { text: t(`action_${entry.action}`) }),
                                h('span', { class: 'community-muted', text: ` · ${entry.actor ? `@${entry.actor}` : t('system')} · ${t(`source_${entry.source}`)} · ${relativeTime(kit, entry.created_at)}` }),
                                entry.reason ? h('p', { text: entry.reason }) : null)))) : null,
                    )),
            );
        }).catch((error) => el.replaceChildren(h('div', { class: 'community-empty' }, error.message)));
        return view;
    }

    function auditView(kit) {
        const { h, t, api } = kit;
        const list = h('ul', { class: 'community-history' });
        const more = h('button', { class: 'community-btn', type: 'button', hidden: true }, t('loadMore'));
        const head = h('div');
        let cursor = null;
        async function load() {
            try {
                const page = await api('GET', `/v1/mod/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
                page.items.forEach((entry) => list.append(h('li', {},
                    h('strong', { text: t(`action_${entry.action}`) }),
                    h('span', { class: 'community-muted', text: ` · ${t(`targetType_${entry.target_type}`)} · ${entry.actor ? `@${entry.actor}` : t('system')} · ${t(`source_${entry.source}`)} · ${relativeTime(kit, entry.created_at)}` }),
                    entry.case_id ? h('button', { class: 'community-link-btn', type: 'button', onclick: () => kit.navigate(`mod/case/${entry.case_id}`) }, t('openCase')) : null,
                    entry.reason ? h('p', { text: entry.reason }) : null)));
                if (!list.childElementCount) list.append(h('li', { class: 'community-muted', text: t('queueEmpty') }));
                cursor = page.next_cursor;
                more.hidden = !cursor;
            } catch (error) {
                kit.reportError(error);
            }
        }
        more.addEventListener('click', load);
        api('GET', '/v1/mod/summary').then((summary) => head.replaceChildren(tabsBar(kit, 'audit', summary))).catch(() => {});
        head.replaceChildren(tabsBar(kit, 'audit', null));
        load();
        return { el: h('section', { class: 'community-panel' }, head, list, more), title: t('navPanel') };
    }

    function teamView(kit) {
        const { h, t, api, toast, reportError } = kit;
        const isOwner = kit.state.me && kit.state.me.role === 'owner';
        const list = h('ul', { class: 'community-team' });
        const head = h('div');
        async function refresh() {
            try {
                const data = await api('GET', '/v1/mod/team');
                list.replaceChildren(...data.items.map((member) => h('li', {},
                    h('strong', { text: member.display_name }), h('span', { class: 'community-muted', text: ` @${member.handle}` }),
                    h('span', { class: 'community-role', text: t(`role_${member.role}`) }),
                    h('span', { class: member.discord_linked ? 'community-flag is-ok' : 'community-flag', text: member.discord_linked ? t('discordLinked') : t('discordNotLinked') }))));
            } catch (error) {
                reportError(error);
            }
        }
        const handle = h('input', { class: 'community-input', placeholder: t('teamHandle'), autocomplete: 'off' });
        const discord = h('input', { class: 'community-input', placeholder: t('teamDiscord'), inputmode: 'numeric', autocomplete: 'off' });
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
        const owner = isOwner ? h('div', { class: 'community-form' },
            h('h4', { text: t('teamManage') }),
            h('p', { class: 'community-muted', text: t('teamIntro') }),
            handle,
            h('div', { class: 'community-actions' },
                h('button', { class: 'community-btn community-btn-primary', type: 'button', onclick: () => run('role', { role: 'moderator' }, t('teamPromoted')) }, t('teamPromote')),
                h('button', { class: 'community-btn', type: 'button', onclick: () => run('role', { role: 'user' }, t('teamDemoted')) }, t('teamDemote'))),
            discord,
            h('div', { class: 'community-actions' },
                h('button', { class: 'community-btn', type: 'button', onclick: () => run('discord', { discord_id: discord.value.trim() }, t('teamLinked')) }, t('teamLink')),
                h('button', { class: 'community-btn', type: 'button', onclick: () => run('discord', { discord_id: null }, t('teamUnlinked')) }, t('teamUnlink'))),
            h('p', { class: 'community-fineprint', text: t('teamDiscordHint') })) : h('p', { class: 'community-muted', text: t('teamOwnerOnly') });
        api('GET', '/v1/mod/summary').then((summary) => head.replaceChildren(tabsBar(kit, 'team', summary))).catch(() => {});
        head.replaceChildren(tabsBar(kit, 'team', null));
        refresh();
        return { el: h('section', { class: 'community-panel' }, head, h('div', { class: 'community-subsection' }, h('h4', { text: t('teamMembers') }), list), owner), title: t('navPanel') };
    }

    function view(sub, kit) {
        if (!kit.state.me || !['moderator', 'owner'].includes(kit.state.me.role)) {
            return { el: kit.h('div', { class: 'community-empty' }, kit.t('modOnly')), title: kit.t('navPanel') };
        }
        const caseMatch = /^case\/([A-Za-z0-9_-]{16})$/.exec(sub);
        if (caseMatch) return caseView(kit, caseMatch[1]);
        if (sub === 'audit') return auditView(kit);
        if (sub === 'team') return teamView(kit);
        return queueView(kit, ['mass', 'reports', 'review'].includes(sub) ? sub : 'mass');
    }

    window.BASCommunityPanel = Object.freeze({ view });
})();
