(function() {
    'use strict';

    const VERSION = 1;
    const RELEASE = 'P13.12 R1';
    const state = { running:false, results:[], report:null, acknowledged:false, includePreview:false };
    const weights = { critical:12, major:6, normal:3, minor:1 };
    const factors = { pass:1, warn:.6, fail:0, skip:0 };

    function byId(id){ return document.getElementById(id); }
    function text(key,fallback){ try { return (traducoes[idiomaAtual]||traducoes.en)?.[key]||fallback; } catch(_){ return fallback; } }
    function connected(){ try { return Boolean(isConnectedMode && sessionToken); } catch(_){ return false; } }
    function hasFeature(name){ try { return Boolean(window.hasModuleFeature?.(name)); } catch(_){ return false; } }
    function hasPermission(name){ try { return Boolean(window.hasModulePermission?.(name)); } catch(_){ return false; } }
    function safe(value,max=260){ return String(value??'').replace(/\s+/g,' ').trim().slice(0,max); }
    function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

    async function request(path,options={}){
        const response=await apiFetch(path,{cache:'no-store',signal:options.signal||AbortSignal.timeout(8000),...options});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data?.message||`${path} ${response.status}`);
        return data;
    }
    function postJSON(path,payload){ return request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); }

    async function buildProbeZip(tag){
        if(typeof JSZip==='undefined') throw new Error('JSZip unavailable');
        const zip=new JSZip();
        zip.file('desc.txt','1 1 1\np 1 0 part0\n');
        zip.file('bas-diagnostic.txt',String(tag||'BAS_DIAGNOSTIC'));
        const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
        zip.file('part0/00000.png',png,{binary:true});
        return zip.generateAsync({type:'blob',compression:'STORE'});
    }

    function addResult(id,name,severity,status,detail,durationMs=0){
        const item={id,name,severity,status,detail:safe(detail),durationMs:Math.max(0,Math.round(durationMs)),weight:weights[severity]||3};
        state.results.push(item); renderResults(); return item;
    }
    async function step(id,name,severity,fn,skipReason=''){
        if(skipReason) return addResult(id,name,severity,'skip',skipReason,0);
        const started=performance.now();
        try{
            const raw=await fn();
            if(raw&&typeof raw==='object'&&['pass','warn','fail'].includes(raw.status)) return addResult(id,name,severity,raw.status,raw.detail||raw.message||'',performance.now()-started);
            return addResult(id,name,severity,'pass',raw||'OK',performance.now()-started);
        }catch(error){ return addResult(id,name,severity,'fail',error?.message||error||'Failed',performance.now()-started); }
    }

    function summarize(){
        const executed=state.results.filter(r=>r.status!=='skip');
        const denom=executed.reduce((s,r)=>s+r.weight,0)||1;
        let score=100*executed.reduce((s,r)=>s+r.weight*(factors[r.status]??0),0)/denom;
        if(executed.some(r=>r.status==='fail'&&r.severity==='critical')) score=Math.min(score,60);
        else if(executed.some(r=>r.status==='fail'&&r.severity==='major')) score=Math.min(score,85);
        return {score:Math.max(0,Math.min(100,Math.round(score))),passed:state.results.filter(r=>r.status==='pass').length,warnings:state.results.filter(r=>r.status==='warn').length,failed:state.results.filter(r=>r.status==='fail').length,skipped:state.results.filter(r=>r.status==='skip').length,total:state.results.length};
    }

    function renderSummary(){
        const root=byId('developer-extended-summary'); if(!root) return;
        if(!state.report){ root.innerHTML=`<div class="developer-regression-empty">${text('extendedNoScan','No extended device scan has been run yet.')}</div>`; return; }
        const s=state.report.summary;
        root.innerHTML=`<div class="developer-regression-score"><strong>${s.score}</strong><span>/ 100</span><small>${text('extendedDeviceScore','device mutation health')}</small></div><div class="developer-regression-counts"><span data-state="pass">${s.passed} ${text('regressionPassed','passed')}</span><span data-state="warn">${s.warnings} ${text('regressionWarnings','warnings')}</span><span data-state="fail">${s.failed} ${text('regressionFailed','failed')}</span><span data-state="skip">${s.skipped} ${text('regressionSkipped','untested')}</span></div>`;
    }
    function renderResults(){
        const root=byId('developer-extended-results'); if(!root) return; root.innerHTML='';
        if(!state.results.length){ root.innerHTML=`<div class="developer-lab-empty">${state.running?text('extendedRunning','Extended scan running…'):text('extendedNoResults','No extended scan results yet.')}</div>`; return; }
        state.results.forEach(item=>{ const row=document.createElement('article'); row.className='developer-regression-result'; row.dataset.state=item.status; row.innerHTML=`<div><strong></strong><span>${item.severity.toUpperCase()} · ${item.durationMs} ms</span><small></small></div><b>${item.status.toUpperCase()}</b>`; row.querySelector('strong').textContent=item.name; row.querySelector('small').textContent=item.detail; root.appendChild(row); });
    }
    function syncControls(){
        const ack=byId('developer-extended-ack'); const preview=byId('developer-extended-preview'); const run=byId('developer-extended-run');
        state.acknowledged=Boolean(ack?.checked); state.includePreview=Boolean(preview?.checked);
        if(run) run.disabled=state.running||!state.acknowledged;
    }
    function syncText(){
        const set=(id,key,fallback)=>{ const el=byId(id); if(el) el.textContent=text(key,fallback); };
        set('developer-extended-title','extendedTitle','Extended Device Scan');
        set('developer-extended-desc','extendedDesc','Opt-in destructive-to-sandbox diagnostics. This scan temporarily writes module state and cleans up only resources it creates.');
        set('developer-extended-warning-title','extendedWarningTitle','This scan temporarily changes the Companion Module');
        set('developer-extended-warning','extendedWarning','It can create, rename and delete diagnostic playlists, stage a tiny test boot animation, and optionally start a visible temporary preview. It never applies a permanent animation, restores stock, rescans paths, factory-resets, or changes Rotation/Queue.');
        set('developer-extended-ack-label','extendedAck','I understand that temporary module state will be changed.');
        set('developer-extended-preview-label','extendedPreview','Include visible Device Test preview (temporary).');
        set('developer-extended-run',state.running?'extendedRunning':'extendedRun',state.running?'Extended scan running…':'Run Extended Device Scan');
        set('developer-extended-copy','extendedCopy','Copy extended report');
        syncControls();
    }
    function render(){ renderSummary(); renderResults(); syncText(); }

    async function confirmRun(){
        const message=text('extendedConfirm','The Extended Device Scan will temporarily modify Companion Module state and clean up its own diagnostic resources. Continue?');
        if(typeof askConfirmation==='function') return askConfirmation(message,false);
        return window.confirm(message);
    }

    async function run(){
        if(state.running) return state.report;
        syncControls();
        if(!state.acknowledged) throw new Error(text('extendedNeedAck','Acknowledge the warning first.'));
        if(!connected()) throw new Error(text('developerLabNotConnected','Not connected'));
        if(!await confirmRun()) return null;

        state.running=true; state.results=[]; state.report=null; render();
        const startedAt=Date.now();
        const createdPlaylists=new Set();
        const createdObjects=new Set();
        let stagedByScan=false, previewStarted=false, probeBlob=null, primaryPlaylist='';
        let beforeRevisions=null;
        let preTestStatus=null;
        const tag=`BAS_DIAG_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;

        try{
            await step('extended.preflight','Connected mutation preflight','critical',async()=>{
                const ping=await request('/ping'); if(ping.status!=='ok') throw new Error('Unexpected ping status');
                if(!hasPermission('control')) throw new Error('Control permission required');
                return `${ping.permission||moduleAccessPermission} · ${tag}`;
            });

            if(window.BASLiveSync?.supported?.()){
                try{ beforeRevisions=await BASLiveSync.fetchSnapshot('extended-device-scan-before'); }catch(_){ beforeRevisions=null; }
            }

            await step('extended.test-prestate','Preserve existing Device Test staging','critical',async()=>{
                if(!hasFeature('test_staging')) return {status:'warn',detail:'test_staging capability unavailable'};
                preTestStatus=await request('/test/status');
                if(preTestStatus.has_staged||preTestStatus.preview_active) return {status:'warn',detail:'Existing staged/preview state detected; staging tests will be skipped and preserved'};
                return 'Device Test staging is clear';
            });

            await step('extended.playlist-create','Create diagnostic playlist','major',async()=>{
                if(!hasFeature('playlists')) return {status:'warn',detail:'playlists capability unavailable'};
                if(!hasPermission('manage')) return {status:'warn',detail:'Manage permission unavailable; playlist mutation skipped'};
                const d=await postJSON('/playlist/create',{name:`${tag} A`});
                if(!d.id) throw new Error('Create did not return playlist id'); primaryPlaylist=d.id; createdPlaylists.add(d.id); return d.id;
            },!hasFeature('playlists')?'playlists capability unavailable':'');

            await step('extended.playlist-readback','Verify diagnostic playlist readback','major',async()=>{
                if(!primaryPlaylist) throw new Error('Diagnostic playlist was not created'); const d=await request('/playlist/list');
                const item=(d.playlists||[]).find(p=>p.id===primaryPlaylist); if(!item) throw new Error('Created playlist not found'); return item.name||primaryPlaylist;
            },!primaryPlaylist?'Create step unavailable':'');

            await step('extended.playlist-rename','Rename diagnostic playlist','normal',async()=>{
                await postJSON('/playlist/rename',{id:primaryPlaylist,name:`${tag} RENAMED`});
                const d=await request('/playlist/list'); const item=(d.playlists||[]).find(p=>p.id===primaryPlaylist); if(!item||item.name!==`${tag} RENAMED`) throw new Error('Rename not reflected'); return 'Rename readback OK';
            },!primaryPlaylist?'Create step unavailable':'');

            await step('extended.playlist-duplicate','Duplicate diagnostic playlist','normal',async()=>{
                const d=await postJSON('/playlist/duplicate',{id:primaryPlaylist,name:`${tag} COPY`}); if(!d.id) throw new Error('Duplicate id missing'); createdPlaylists.add(d.id);
                const list=await request('/playlist/list'); if(!(list.playlists||[]).some(p=>p.id===d.id)) throw new Error('Duplicate not found'); return d.id;
            },!primaryPlaylist?'Create step unavailable':'');

            const canStage=hasFeature('test_staging')&&hasPermission('control')&&!preTestStatus?.has_staged&&!preTestStatus?.preview_active;
            await step('extended.stage-probe','Stage synthetic bootanimation.zip','critical',async()=>{
                probeBlob=await buildProbeZip(tag); const form=new FormData(); form.append('bootanimation',probeBlob,'bootanimation.zip');
                const d=await request('/test/stage',{method:'POST',body:form,signal:AbortSignal.timeout(12000)}); stagedByScan=true;
                if(!d||typeof d!=='object') throw new Error('Invalid stage response'); return `${probeBlob.size} byte diagnostic ZIP staged`;
            },canStage?'':'Existing staging preserved or test_staging unavailable');

            await step('extended.stage-readback','Verify staged diagnostic metadata','major',async()=>{
                const d=await request('/test/status'); if(!d.has_staged) throw new Error('Staged probe missing'); if(Number(d.width)!==1||Number(d.height)!==1) return {status:'warn',detail:`Staged but reported ${d.width||'?'}×${d.height||'?'}`}; return '1×1 diagnostic animation recognized';
            },stagedByScan?'':'No diagnostic staging created');

            await step('extended.staged-playlist-object','Exercise staged → playlist object store','major',async()=>{
                if(!primaryPlaylist) throw new Error('Diagnostic playlist unavailable'); const item=await postJSON('/playlist/item/from-staged',{playlist_id:primaryPlaylist,name:`${tag} PROBE`});
                if(!item?.id||!item?.object_id) throw new Error('Playlist item/object id missing');
                createdObjects.add(item.object_id);
                const list=await request('/playlist/list'); const pl=(list.playlists||[]).find(p=>p.id===primaryPlaylist); if(!(pl?.items||[]).some(x=>x.id===item.id)) throw new Error('Staged item not persisted');
                const response=await apiFetch('/playlist/download?object='+encodeURIComponent(item.object_id),{cache:'no-store',signal:AbortSignal.timeout(8000)}); if(!response.ok) throw new Error(`Download ${response.status}`); const blob=await response.blob();
                const zip=await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer())); if(!zip.file('desc.txt')||!zip.file('part0/00000.png')) throw new Error('Downloaded object is incomplete'); return `${blob.size} bytes roundtrip`;
            },stagedByScan&&primaryPlaylist?'':'Requires staged probe + diagnostic playlist');

            await step('extended.visible-preview','Visible Device Test preview start/stop','major',async()=>{
                await request('/test/start',{method:'POST'}); previewStarted=true; await sleep(350);
                const active=await request('/test/status'); if(!active.preview_active) return {status:'warn',detail:'Preview start returned OK but status did not report active'};
                await request('/test/stop',{method:'POST'}); previewStarted=false; const stopped=await request('/test/status'); if(stopped.preview_active) throw new Error('Preview still active after stop'); return 'Preview start → active → stop';
            },state.includePreview&&stagedByScan&&hasFeature('test_animation')?'':'Visible preview not selected or unavailable');

            await step('extended.live-revisions','Mutation revision propagation','major',async()=>{
                if(!beforeRevisions||!window.BASLiveSync?.supported?.()) return {status:'warn',detail:'Live revision snapshot unavailable'};
                const after=await BASLiveSync.fetchSnapshot('extended-device-scan-after'); const domains=[];
                for(const domain of ['playlist','test']){ const before=Number(beforeRevisions.revisions?.[domain]||0), next=Number(after.revisions?.[domain]||0); if(next>before) domains.push(`${domain} ${before}→${next}`); }
                if(!domains.length) throw new Error('Expected playlist/test revision increment not observed'); return domains.join(' · ');
            });

        } finally {
            // Cleanup is deliberately best-effort first, then explicitly verified/scored below.
            if(previewStarted){ try{ await request('/test/stop',{method:'POST'}); previewStarted=false; }catch(_){} }
            if(stagedByScan){ try{ await request('/test/clear',{method:'POST'}); }catch(_){} }
            for(const id of [...createdPlaylists]){ try{ await postJSON('/playlist/delete',{id}); }catch(_){} }

            await step('extended.cleanup','Sandbox cleanup verification','critical',async()=>{
                const problems=[];
                if(stagedByScan){ try{ const d=await request('/test/status'); if(d.has_staged||d.preview_active) problems.push('diagnostic staging remains'); }catch(e){ problems.push('could not verify test cleanup'); } }
                if(createdPlaylists.size){ try{ const d=await request('/playlist/list'); const left=(d.playlists||[]).filter(p=>createdPlaylists.has(p.id)); if(left.length) problems.push(`${left.length} diagnostic playlist(s) remain`); }catch(e){ problems.push('could not verify playlist cleanup'); } }
                for(const objectID of createdObjects){
                    try{
                        const response=await apiFetch('/playlist/download?object='+encodeURIComponent(objectID),{cache:'no-store',signal:AbortSignal.timeout(8000)});
                        if(response.ok) problems.push(`diagnostic object ${objectID.slice(0,12)}… remains`);
                    }catch(_){}
                }
                if(problems.length) throw new Error(problems.join('; ')); return 'All scanner-owned module state removed, including object-store data';
            });

            await step('extended.post-health','Post-scan Module Health','critical',async()=>{
                if(!hasFeature('module_health')) return {status:'warn',detail:'module_health capability unavailable'}; const d=await request('/health/status'); return String(d.overall||'health available');
            });

            state.running=false;
            const summary=summarize();
            state.report={format:'boot-animation-studio-extended-device-report',version:1,generated_at:new Date().toISOString(),release:RELEASE,duration_ms:Date.now()-startedAt,tag,include_visible_preview:state.includePreview,summary,results:state.results.map(x=>({...x}))};
            render();
            window.BASDeveloperLab?.notify?.(`${text('extendedComplete','Extended scan complete')}: ${summary.score}/100`,summary.failed?'warning':'success');
        }
        return state.report;
    }

    async function copyReport(){
        if(!state.report) return false; const value=JSON.stringify(state.report,null,2); let ok=false;
        try{ await navigator.clipboard.writeText(value); ok=true; }catch(_){ try{ const a=document.createElement('textarea'); a.value=value; a.style.position='fixed'; a.style.opacity='0'; document.body.appendChild(a); a.select(); ok=document.execCommand('copy'); a.remove(); }catch(_){} }
        window.BASDeveloperLab?.notify?.(ok?text('developerLabCopied','Copied.'):text('developerLabCopyFailed','Could not copy.'),ok?'success':'error'); return ok;
    }

    function bind(){
        byId('developer-extended-ack')?.addEventListener('change',syncControls);
        byId('developer-extended-preview')?.addEventListener('change',syncControls);
        byId('developer-extended-run')?.addEventListener('click',()=>run().catch(e=>{ state.running=false; render(); window.BASDeveloperLab?.notify?.(safe(e?.message||e),'error'); }));
        byId('developer-extended-copy')?.addEventListener('click',copyReport);
        window.addEventListener('bas:languagechange',render); render();
    }

    window.BASExtendedDeviceScan=Object.freeze({version:VERSION,release:RELEASE,run,render,syncText,report:()=>state.report?JSON.parse(JSON.stringify(state.report)):null,state:()=>({running:state.running,acknowledged:state.acknowledged,includePreview:state.includePreview,resultCount:state.results.length})});
    window.addEventListener('DOMContentLoaded',bind);
})();
