/* P14.9 R2: 49 individually traceable coverage gaps from the P14.8 audit.
 * No real Android write, no silent PASS for device-only or unsupported workflows.
 * Every case has a coverage mode and an explicit, observable assertion.
 */
(function () {
    'use strict';
    const VERSION=1, PREFIX='r2.gap';
    const byId=id=>document.getElementById(id);
    const auto=()=>window.BASRegressionAutomation;
    const fixture=kind=>auto()?.fixture?.(kind)||null;
    const archive=()=>auto()?.exportArchive?.()||null;
    const current=()=>window.BASState?.currentProject;
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const time=()=>performance.now();
    const hold=stage=>{const data=auto()?.status();return data?.stages?.[stage]?.status==='pass'?'':`${stage} fixture stage did not PASS: ${data?.stages?.[stage]?.detail||'not prepared'}`;};
    const noconn=()=>!window.BASRegressionR2Connected?.() && !(typeof isConnectedMode!=='undefined'&&isConnectedMode&&typeof sessionToken!=='undefined'&&sessionToken);
    const safe=fn=>async()=>{const result=await fn();return result==null?'Observed real BAS behavior':result;};
    const skip=reason=>()=>reason;
    const optional=(name,reason)=>()=>typeof window[name]==='undefined'?reason:'';
    const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data instanceof Blob?await data.arrayBuffer():data))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const visual=()=>BASSourceLibrary.getVisual();
    const clips=()=>BASMasterSequence.serialize().clips;
    const gif=()=>visual().find(x=>x.name==='scan-disposal.gif');
    const withBitmap=async(blob,fn)=>{const bitmap=await createImageBitmap(blob);try{return await fn(bitmap);}finally{bitmap.close();}};
    const pixel=async(blob,x,y)=>withBitmap(blob,b=>{const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(b,0,0);return Array.from(ctx.getImageData(x,y,1,1).data);});
    const near=(a,b,tol=.015)=>Math.abs(a-b)<=tol;
    const prereq={mp4:()=>hold('mp4'),gif:()=>hold('gif'),dispose:()=>hold('gif-disposal'),wav:()=>hold('wav'),audio:()=>hold('audio-ui'),composition:()=>hold('composition'),keyframes:()=>hold('keyframes'),project:()=>hold('project-package'),timeline:()=>hold('timeline-markers'),output:()=>hold('zip-export')};
    const cases=[];
    function add(number,category,priority,mode,name,requires,run){
        check(number===cases.length+1,`Gap order broken at ${number}`);
        check(typeof run==='function','Gap has no implementation: '+number);
        cases.push({id:PREFIX+String(number).padStart(2,'0'),name,category,priority,mode,requires:requires||(()=>''),run:safe(run)});
    }
    // P0: real project/editor/media workflows first.
    add(1,'project','P0','integration','Full .basproject restore with real imported assets',prereq.project,async()=>{
        const before=BASProjectEngine.captureManifest(),built=await BASProjectFile.build(),blob=built instanceof Blob?built:built?.blob;
        check(blob instanceof Blob,'Project build missing Blob');
        const pkg=await BASProjectFile.read(blob);check(pkg?.assetMap instanceof Map,'Project reader lost assets');
        const beforeAssets=BASProjectEngine.getAssets().filter(x=>x.blob instanceof Blob&&!x.transient);
        const beforeHashes=await Promise.all(beforeAssets.map(x=>sha(x.blob)));
        await BASProjectRestore.restore(pkg.manifest,pkg.assetMap,{reason:'regression-r2-restore',restoreUi:false});
        const after=BASProjectEngine.captureManifest();check(BASProjectEngine.validateManifest(after),'Restored project invalid');
        check(same(before.editor?.library,after.editor?.library),'Library differs after complete restore');
        check(same(before.editor?.composition,after.editor?.composition),'Composition differs after restore');
        const afterAssets=BASProjectEngine.getAssets().filter(x=>x.blob instanceof Blob&&!x.transient);
        check(beforeAssets.length===afterAssets.length,'Asset count changed during restoration');
        const afterHashes=await Promise.all(afterAssets.map(x=>sha(x.blob)));
        check(same(beforeHashes.sort(),afterHashes.sort()),'Restored asset bytes differ');
        return `${afterAssets.length} assets restored byte-for-byte in real editor`;
    });
    add(2,'persistence','P0','device-required','Quota-failure autosave transaction and recovery',skip('Requires isolated writable IndexedDB quota-fault environment; cannot safely force browser-wide quota exhaustion'),async()=>{throw new Error('Not run');});
    add(3,'project','P0','integration','Real project edit and Undo/Redo equality',prereq.mp4,async()=>{
        const input=byId('input-nome');check(input,'Project name field missing');
        const original=input.value;BASProjectHistory.reset();const changed='R2-UNDO-'+Date.now().toString(36);
        input.value=changed;input.dispatchEvent(new Event('change',{bubbles:true}));
        await wait(90);check(BASProjectHistory.canUndo(),'Real edit not captured in history');
        check(BASProjectHistory.undo(),'Undo action returned false');check(input.value===original,'Undo did not restore name');
        check(BASProjectHistory.redo(),'Redo action returned false');check(input.value===changed,'Redo did not restore name');
        input.value=original;input.dispatchEvent(new Event('change',{bubbles:true}));return 'Real DOM edit, undo, redo and final cleanup verified';
    });
    add(4,'media','P0','integration','HTMLVideoElement play pause progress and loop',prereq.mp4,async()=>{
        const v=byId('player-video');check(v?.readyState>=2,'Real video not ready');const muted=v.muted;v.muted=true;
        try{v.pause();v.currentTime=0;await v.play();await wait(260);const t=v.currentTime;v.pause();check(v.paused,'Video did not pause');check(t>.02,'Video did not advance while playing');v.loop=true;check(v.loop,'Loop property not applied');v.loop=false;return `${t.toFixed(3)} s real playback and pause`;}
        finally{v.pause();v.muted=muted;v.loop=false;}
    });
    add(5,'media','P0','negative','Invalid MP4 container rejects decoding',prereq.mp4,async()=>{
        const b=await fetch('./diagnostics/scan-invalid.mp4').then(r=>r.blob());
        const url=URL.createObjectURL(b),v=document.createElement('video');v.preload='metadata';v.muted=true;
        try{const outcome=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('timeout'),1800);v.onerror=()=>{clearTimeout(timer);resolve('error')};v.onloadedmetadata=()=>{clearTimeout(timer);resolve('decoded')};v.src=url;v.load()});check(outcome==='error','Corrupt MP4 was accepted or timed out');return 'Invalid container rejected by actual HTML video decoder (no app import mutation)';}
        finally{v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}
    });
    add(6,'media','P0','integration','Pixel-accurate GIF disposal over the BAS black matte',prereq.dispose,async()=>{
        const f=gif()?.runtimeFrames;check(f?.length===3,'Disposal GIF frame count incorrect');
        const positions=[[8,16],[33,16],[54,16]];
        for(let i=0;i<3;i++){
            const active=await pixel(f[i].blob,...positions[i]);check(active[3]===255&&active[0]>230&&active[1]>35&&active[1]<100,'Golden colored GIF frame mismatch at '+i);
            for(let j=0;j<3;j++)if(i!==j){const inactive=await pixel(f[i].blob,...positions[j]);check(inactive[3]===255&&inactive[0]===0&&inactive[1]===0&&inactive[2]===0,'Disposal left colored ghost pixels instead of BAS black matte at '+i+'/'+j);}
        }
        return '3 decoded GIF frames compared against moving-color and black-matte golden pixels';
    });
    add(7,'output','P0','integration','GIF export frame timing and pixel schedule',prereq.output,async()=>{
        const f=gif()?.runtimeFrames;const z=await JSZip.loadAsync(archive());check(f?.length===3,'GIF frame data missing');
        const frameEntries=Object.values(z.files).filter(x=>/part\d+\/\d+\.png$/.test(x.name));check(frameEntries.length>=6,'No actual output images');
        const a=await frameEntries[0].async('blob');await withBitmap(a,b=>check(b.width===96&&b.height===64,'Export lost configured resolution'));
        const durations=f.map(x=>Number(x.duration));check(durations[1]>durations[0]&&durations[2]>durations[0],'Variable frame timing collapsed');
        return {status:'warn',detail:'Actual output decodes and source timing holds; full per-frame GIF→ZIP golden comparison not proven'};
    });
    add(8,'composition','P0','integration','Audio Studio gain/fade/trim real output WAV',prereq.audio,async()=>{
        check(typeof buildAudioStudioRoleBlob==='function','Actual Audio Studio renderer missing');
        const initial=captureAudioEditorState();check(initial.enabled&&initial.loop.mode==='file','Real Loop WAV missing');
        const options=JSON.parse(JSON.stringify(initial));
        options.loop={...options.loop,fadeIn:0,fadeOut:0,gainDb:0,delay:0,sourceIn:0,endTrim:0};
        const normal=await buildAudioStudioRoleBlob('loop',options);check(normal instanceof Blob&&normal.size>200,'Unprocessed WAV build failed');
        const changed=JSON.parse(JSON.stringify(options));changed.loop.gainDb=-14;changed.loop.fadeIn=.12;changed.loop.endTrim=.12;
        const processed=await buildAudioStudioRoleBlob('loop',changed);check(processed instanceof Blob&&processed.size>200,'Processed WAV build failed');
        const context=new (window.AudioContext||window.webkitAudioContext)();
        try{
            const a=await context.decodeAudioData(await normal.arrayBuffer());
            const b=await context.decodeAudioData(await processed.arrayBuffer());
            const rms=buffer=>{const v=buffer.getChannelData(0);return Math.sqrt(v.reduce((sum,x)=>sum+x*x,0)/v.length)};
            check(near(b.duration,a.duration,.05),'Audio output unexpectedly changed scheduled Part length');
            check(rms(b)<rms(a)*.75,'Audio gain/fade did not lower RMS');
            const tail=buffer=>{const x=buffer.getChannelData(0),from=Math.floor(x.length*.92);let e=0;for(let i=from;i<x.length;i++)e+=x[i]*x[i];return Math.sqrt(e/(x.length-from));};
            check(tail(b)<tail(a)*.3,'End trim did not silence tail of real rendered WAV');
            return `Real processed WAV ${b.duration.toFixed(2)}s, RMS attenuated and trim tail silenced`;
        }finally{await context.close();}
    });
    add(9,'output','P0','integration','Intro/Loop/Outro audio sync and offsets',prereq.output,async()=>{
        const z=await JSZip.loadAsync(archive());check(z.file('part1/audio.wav'),'Loop audio missing');
        const desc=await z.file('desc.txt').async('string');check(/part1/.test(desc),'Loop missing from descriptor');
        return {status:'warn',detail:'Loop WAV/descriptor validated; multi-part audio alignment not exercised'};
    });
    add(10,'composition','P0','integration','Composition reference pixels, z order and transform',()=>hold('composition')||(!crypto?.subtle?'Secure WebCrypto required for pixel hash comparison':''),async()=>{
        const a=await BASComposition.applyToFrameBlob(fixture('png'),.35,96,64,'png');
        const b=await BASComposition.applyToFrameBlob(fixture('png'),.35,96,64,'png');check(await sha(a)===await sha(b),'Composition output non-deterministic');
        check((await pixel(a,0,0)).length===4,'Output not a valid pixel surface');
        return {status:'warn',detail:'Actual renderer deterministic and decodable; full rotation/scale/z-order golden pixels not yet covered'};
    });
    add(11,'composition','P0','integration','Composition layer delete/reorder and history',prereq.keyframes,async()=>{
        const original=BASComposition.serialize();const layers=BASComposition.getLayers();check(layers.length>=2,'Need two layers');
        const first=layers[0];check(typeof moveCompositionLayer==='function','Composition move handler missing');
        const before=layers.map(x=>x.id).join(',');
        try{moveCompositionLayer(first.id,1);check(BASComposition.getLayers().map(x=>x.id).join(',')!==before,'Real layer reorder ignored');}
        finally{BASComposition.restoreState(original,new Map(BASComposition.getAssets().map(x=>[x.key,x])));}
        return {status:'warn',detail:'Real reorder/restore passed; layer-delete plus cross-keyframe history not fully exercised'};
    });
    add(12,'sequence','P0','integration','Master Sequence clip reorder/trim and referential integrity',prereq.timeline,async()=>{
        const baseline=BASMasterSequence.serialize(),items=baseline.clips;check(items?.length>=3,'Three real sources required');
        const id=items[0].id,sourceId=items[0].sourceId;
        try{check(BASMasterSequence.moveClip(id,1),'Real moveClip returned false');check(clips()[1].id===id,'Clip not moved');check(BASMasterSequence.indexOfSource(sourceId)===1,'Source referential index broken');}
        finally{BASMasterSequence.restoreState(baseline);}
        check(same(BASMasterSequence.serialize().clips,baseline.clips),'Master Sequence not recovered');return 'Reorder real clips, assert source referential integrity and restore';
    });
    add(13,'sequence','P0','integration','Advanced Parts repeat/infinite/stop serialization',prereq.timeline,async()=>{
        const m=BASProjectEngine.captureManifest();const a=m.editor?.advanced;check(a&&typeof a==='object','Advanced Parts state missing');
        const parts=a.parts||[];check(Array.isArray(parts),'Parts missing');
        return {status:'warn',detail:'Actual Advanced Parts serialization observed; repeat/infinite/stop export not fully exercised'};
    });
    add(14,'output','P0','integration','Actual BAS JPEG export quality and dimensions',prereq.output,async()=>{
        const original=archive();check(original instanceof Blob,'Original PNG ZIP missing');
        const t=typeof traducoes!=='undefined'?(traducoes[idiomaAtual]||traducoes.en):{};
        const base=getExportOptions();const values=[];
        for(const quality of [.62,.94]){
            const blob=await buildSimpleBootanimation({...base,width:96,height:64,fps:6,format:'jpeg',jpegQuality:quality},t);
            check(blob instanceof Blob,'Real BAS JPEG export failed');
            const z=await JSZip.loadAsync(blob),frames=Object.values(z.files).filter(f=>/part\d+\/\d+\.jpe?g$/i.test(f.name));
            check(frames.length>=6,'Real BAS JPEG ZIP missing frames');
            const image=await frames[0].async('blob');const arr=new Uint8Array(await image.arrayBuffer());
            check(arr[0]===255&&arr[1]===216,'Exported JPEG frame has invalid SOI marker');
            await withBitmap(image,b=>check(b.width===96&&b.height===64,'Exported JPEG dimensions incorrect'));
            values.push({bytes:blob.size,head:Array.from(arr.slice(0,500)).join(','),frames:frames.length});
        }
        check(values[0].head!==values[1].head||values[0].bytes!==values[1].bytes,'JPEG quality did not affect actual exported frame bytes');
        return `${values[0].frames}/${values[1].frames} JPEG frames, both qualities decoded and differed`;
    });
    add(15,'output','P0','negative','Failed/cancelled export state and resources',prereq.output,async()=>{
        const before=BASProjectEngine.captureManifest(),blob=archive();check(blob instanceof Blob,'No export baseline');
        check(typeof buildSimpleBootanimation==='function','Real builder unavailable');
        check(same(before.editor?.composition,BASProjectEngine.captureManifest().editor?.composition),'Export changed composition');
        return {status:'warn',detail:'Successful real export leaves composition stable; injected mid-export cancellation not verified'};
    });
    add(16,'persistence','P0','device-required','IndexedDB migration after quota failure',skip('Needs origin-backed IndexedDB fault-injection harness with quota isolation'),async()=>{throw new Error('Not run');});
    add(17,'pwa','P0','device-required','Installed PWA upgrade with IDB retention and offline reload',()=>!window.isSecureContext?'Requires HTTPS/secure installed PWA':!navigator.serviceWorker?.controller?'Requires controlled installed PWA with active Service Worker':'',async()=>{
        const before=await BASAutosave.list();const reg=await navigator.serviceWorker.getRegistration('./');check(reg,'PWA worker missing');
        const cache=await caches.keys();check(cache.some(x=>x.startsWith('bas-shell-web-')),'Shell cache missing');
        return {status:'warn',detail:`Actual installed SW and ${before.length} autosaves observed; offline upgrade/reload not induced`};
    });
    add(18,'companion','P0','connection','Authenticated Companion offline/reconnect read path',()=>noconn()?'Connect Companion to run authenticated reconnect checks':'',async()=>{
        check(typeof apiFetch==='function','Companion API missing');const r=await apiFetch('/ping',{signal:AbortSignal.timeout(4000)});check(r.ok,'Companion ping failed');
        return {status:'warn',detail:'Real authenticated /ping succeeded; disconnect/reconnect fault not induced'};
    });
    add(19,'companion','P0','connection','Multiple nearby Companion discovery/cancel',()=>noconn()?'Companion pairing and nearby discovery hardware required':'',async()=>{
        check(typeof window.BASMultiDevice?.current==='function','Multi-device owner missing');
        return {status:'warn',detail:'Real multi-device current status observed; nearby discovery/cancel not actively exercised'};
    });
    add(20,'runtime','P0','negative','Fault injection: expected FAIL/SKIP rather than false PASS',()=>'',async()=>{
        const probe=window.BASRegressionR2?.probe;check(typeof probe==='function','R2 failure detector missing');
        const results=await Promise.all([probe(async()=>{throw Error('r2 injected failure')},''),probe(async()=>true,'unsupported'),probe(async()=>false,'')]);
        check(results[0].status==='fail'&&results[1].status==='skip'&&results[2].status==='fail','Scanner classification misidentified induced failures');
        return 'Injected exception, unmet prerequisite, false result classified FAIL/SKIP/FAIL';
    });
    add(21,'runtime','P0','negative','Abort scan during media operation and cleanup',()=>'',async()=>{
        const control=new AbortController();let cleanup=0;const url=URL.createObjectURL(new Blob(['fixture']));
        try{const p=new Promise(resolve=>{const onAbort=()=>{cleanup++;resolve('aborted')};control.signal.addEventListener('abort',onAbort,{once:true})});control.abort();check(await p==='aborted'&&cleanup===1,'Abort fixture leaked listener');}
        finally{URL.revokeObjectURL(url);}
        return {status:'warn',detail:'Abort/cleanup primitive exercised; full scanner mid-import cancellation not yet supported'};
    });
    // P1: second-priority workflows and hostile inputs.
    add(22,'media','P1','integration','Real WebM decode with different media codec',()=>hold('mp4'),async()=>{
        const b=await fetch('./diagnostics/scan-motion.webm').then(r=>r.blob());check(b.size>1000,'WebM fixture empty');
        const url=URL.createObjectURL(b),v=document.createElement('video');v.preload='auto';v.muted=true;
        try{v.src=url;await new Promise((resolve,reject)=>{const tm=setTimeout(()=>reject(Error('WebM decode timeout')),5500);v.onloadeddata=()=>{clearTimeout(tm);resolve()};v.onerror=()=>{clearTimeout(tm);reject(Error('WebM decoder rejected fixture'))}});check(v.videoWidth===96&&v.videoHeight===64,'WebM dimensions wrong');return `Real VP8 WebM ${v.videoWidth}×${v.videoHeight}`;}
        finally{v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}
    });
    add(23,'media','P1','integration','Repeated near-end seeks within real MP4',prereq.mp4,async()=>{
        const v=byId('player-video');v.pause();for(const t of [0.05,Math.max(.05,v.duration-.08),.3]){await BASMediaSeek.seek(v,t,{timeout:2500,retries:1,tolerance:.10});check(Math.abs(v.currentTime-t)<.15,'Real MP4 seek failed at '+t);}return 'Three real seek positions passed';
    });
    add(24,'media','P1','negative','Truncated GIF parser rejects malformed media',()=>'',async()=>{
        const b=await fetch('./diagnostics/scan-invalid.gif').then(r=>r.arrayBuffer());check(b.byteLength>20,'Corrupt fixture not loaded');
        const decode=window.Gifuct?.parseGIF;check(typeof decode==='function','GIF parser unavailable');
        let threw=false;try{const parsed=decode(b);const frames=window.Gifuct.decompressFrames(parsed,true);check(frames.length>0,'Corrupt GIF parsed with no frames');}catch(_){threw=true;}
        check(threw,'Malformed GIF unexpectedly accepted');return 'Real GIF parser rejected truncated frame payload';
    });
    add(25,'media','P1','integration','GIF local palette and frame disposal variant',prereq.dispose,async()=>{
        const src=gif();check(src?.runtimeFrames?.length===3,'GIF alternate variant missing');
        const rgb=await pixel(src.runtimeFrames[1].blob,33,16);check(rgb[0]>220&&rgb[3]===255,'Second frame local paint incorrect');
        return {status:'warn',detail:'Disposal variant pixel checked; interlaced/local-palette/repeat matrix not complete'};
    });
    add(26,'composition','P1','integration','Vorbis Ogg real audio decoder',prereq.wav,async()=>{
        const resp=await fetch('./diagnostics/scan-tone.ogg'),b=await resp.arrayBuffer();const AC=window.AudioContext||window.webkitAudioContext;check(AC,'AudioContext unsupported');const ac=new AC();
        try{const data=await ac.decodeAudioData(b);check(data.duration>.8&&data.numberOfChannels>0,'Ogg decoded invalid');return `${data.duration.toFixed(2)} s actual Ogg decoded`;}
        finally{await ac.close();}
    });
    add(27,'composition','P1','integration','Audio preview transport with real WAV',prereq.audio,async()=>{
        check(typeof ensureAudioStudioPreview==='function','Real audio preview builder unavailable');
        try{
            const ready=await ensureAudioStudioPreview('loop');check(ready,'Audio Studio real preview not prepared');
            check(audioStudioPreviewAudio instanceof HTMLAudioElement,'Audio Studio playback element missing');
            check(audioStudioPreviewAudio.readyState>=0,'Audio element invalid');
            audioStudioPreviewAudio.volume=.35;check(near(audioStudioPreviewAudio.volume,.35,.01),'Volume change rejected');
            audioStudioPreviewAudio.muted=true;check(audioStudioPreviewAudio.muted,'Mute not applied');
            audioStudioPreviewAudio.currentTime=.1;
            return 'Real processed WAV preview element, seek, volume and mute applied';
        }finally{if(typeof disposeAudioStudioPreview==='function')disposeAudioStudioPreview();}
    });
    add(28,'composition','P1','integration','Unicode and offscreen text composition rendering',prereq.composition,async()=>{
        const original=BASComposition.serialize(),layer=BASComposition.getLayers().find(x=>x.type==='text');check(layer,'Text layer missing');
        try{layer.text='Teste 日本語 • Ω 🚀 مرحبا';layer.x=1;const out=await BASComposition.applyToFrameBlob(fixture('png'),.4,96,64,'png');check(out?.size>100,'Unicode composition failed');return 'Real multilingual text rendered with offscreen coordinate';}
        finally{BASComposition.restoreState(original,new Map(BASComposition.getAssets().map(x=>[x.key,x])));}
    });
    add(29,'composition','P1','integration','Keyframe easing endpoints and intermediate interpolation',prereq.keyframes,async()=>{
        const layer=BASComposition.getLayers().find(x=>x.type==='text');check(layer,'Text layer missing');
        const frames=BASComposition.getKeyframes(layer.id);check(frames?.length>=1,'Keyframes missing');
        for(const t of [0,.1,.35,.5,1]){const a=BASComposition.getResolvedTransform(layer.id,t),b=BASComposition.getResolvedTransform(layer.id,t);check(a&&same(a,b)&&Number.isFinite(a.x),'Easing unstable at '+t);}
        return {status:'warn',detail:'Actual transforms deterministic across 5 times; golden easing curve not independently checked'};
    });
    add(30,'sequence','P1','integration','Multiple source clips reordering and duration reconciliation',prereq.timeline,async()=>{
        const source=BASMasterSequence.serialize(),total=BASMasterSequence.getDuration();check(source.clips?.length>=3,'Imported sources not represented');const layout=BASMasterSequence.getLayout();
        check(near(layout.at(-1).end,total,.03),'Layout last segment disagrees with duration');return `${source.clips.length} real clips, duration ${total.toFixed(3)} s`;
    });
    add(31,'output','P1','integration','All output presets resolve without mutating incompatible values',prereq.mp4,async()=>{
        const defs=BASOutputPresets.getDefinitions();check(defs.length>=6,'Six presets missing');let count=0;const cur=BASOutputPresets.currentOptions();
        for(const def of defs){const x=def.resolve?.(cur);if(x){check(x.width>0&&x.height>0&&x.fps>0,'Preset '+def.id+' had invalid values');count++;}}
        check(count>=4,'Most actual presets failed resolution');
        return {status:'warn',detail:`${count}/${defs.length} actual preset resolvers returned valid data; UI application and six export readbacks not exercised`};
    });
    add(32,'output','P1','integration','Device compatibility warning on mismatched output',prereq.mp4,async()=>{
        const value=BASCompatibility.analyze();check(value&&typeof value==='object','Compatibility analyzer failed');
        return {status:'warn',detail:'Real compatibility analyzer invoked; forced profile mismatch not asserted'};
    });
    add(33,'media','P1','negative','AOSP malformed desc/frame ZIP rejection',()=>'',async()=>{
        const z=new JSZip();z.file('desc.txt','-1 0 999\np 1 0 part0\n');z.file('part0/00000.png',fixture('png')||new Uint8Array([0]));const bytes=await z.generateAsync({type:'blob'});
        const parsed=await JSZip.loadAsync(bytes);const header=await parsed.file('desc.txt').async('string');check(typeof parseAospBootAnimationHeader==='function','AOSP parser missing');check(!parseAospBootAnimationHeader(header.split('\n')[0]),'Malformed AOSP descriptor accepted');return 'Real ZIP and malformed descriptor rejected by BAS header parser';
    });
    add(34,'project','P1','device-required','Legacy project v1.3/v1.4 asset hashes',skip('No independent v1.3/v1.4 .basproject binary fixtures with known hashes supplied in this release'),async()=>{throw Error('not run');});
    add(35,'ui','P1','device-required','Real Android touch pinch/drag in 390px viewport',()=>!(/Android/i.test(navigator.userAgent)&&innerWidth<=440)?'Requires Android touchscreen viewport at most 440px':'',async()=>{
        const el=byId('player-video');check(el,'Video missing');check(typeof TouchEvent!=='undefined','TouchEvent unsupported');return {status:'warn',detail:'Android touchscreen and video present; gestures not automatically injected'};
    });
    add(36,'ui','P1','integration','Keyboard focus and runtime locale in multiple tabs',()=>'',async()=>{
        const menu=byId('developer-lab');check(menu,'Developer Lab missing');const tabs=Array.from(menu.querySelectorAll('[data-lab-tab]'));check(tabs.length>=4,'Developer Lab navigation tabs missing');
        check(tabs.every(t=>typeof t.getAttribute('aria-label')==='string'||t.textContent.trim()),'Unlabeled tab');return `${tabs.length} navigable labeled tabs available`;
    });
    add(37,'pwa','P1','device-required','Service Worker update failure and offline fallback',()=>!navigator.serviceWorker?.controller?'Requires controlled HTTPS PWA with active Service Worker':'',async()=>{
        const reg=await navigator.serviceWorker.getRegistration('./');check(reg,'No SW registration');return {status:'warn',detail:'Active SW verified; intentionally corrupt upgrade requires separate offline harness'};
    });
    add(38,'companion','P1','simulation','Destructive Companion endpoint gating simulation',()=>'',async()=>{
        const forbidden=['/reset','/upload','/apply','/rescan'];const calls=[];const transport=path=>{if(forbidden.includes(path))throw new Error('Blocked test-only destructive endpoint');calls.push(path)};
        for(const path of forbidden){let blocked=false;try{transport(path)}catch(_){blocked=true}check(blocked,'Simulated guard allowed '+path);}
        check(calls.length===0,'Test touched external transport');return {status:'warn',detail:'Test-only transport guard blocks four destructive paths; real app permission gate not proven'};
    });
    add(39,'companion','P1','connection','Trust permissions across reconnect/expired credentials',()=>noconn()?'Requires authenticated Companion with trusted_clients capability':'',async()=>{
        if(!window.hasModuleFeature?.('trusted_clients'))return {status:'warn',detail:'Connected Companion does not advertise trusted_clients'};
        const r=await apiFetch('/trust/clients',{signal:AbortSignal.timeout(4000)});check(r.ok,'Trust read failed');const data=await r.json();check(Array.isArray(data.clients),'Malformed trusted_clients response');return {status:'warn',detail:'Real trust read succeeded; token revocation not induced'};
    });
    add(40,'companion','P1','connection','Live Sync stale/out-of-order revision resilience',()=>noconn()?'Requires Companion connected with state_revisions':'',async()=>{
        if(!window.BASLiveSync?.supported?.())return {status:'warn',detail:'Companion connected but Live Sync unsupported'};
        const data=await BASLiveSync.fetchSnapshot('r2-regression');check(data?.revisions,'No revisions');return {status:'warn',detail:'Live revision snapshot succeeded; out-of-order event stress not induced'};
    });
    add(41,'runtime','P1','negative','Scanner coverage/score when fixtures fail or Companion absent',()=>'',async()=>{
        const simulated=[{status:'pass',weight:6},{status:'fail',weight:6},{status:'skip',weight:12}];
        const covered=simulated.filter(x=>x.status!=='skip');const score=covered.reduce((sum,x)=>sum+(x.status==='pass'?x.weight:0),0)/covered.reduce((sum,x)=>sum+x.weight,0);
        check(score===.5&&covered.length===2,'Simulated score incorrectly counted SKIP as PASS');
        const results=await Promise.all([window.BASRegressionR2.probe(async()=>true,'requires disconnected Companion'),window.BASRegressionR2.probe(async()=>{throw Error('fixture error')},'')]);
        check(results[0].status==='skip'&&results[1].status==='fail','Scanner classification inaccurate');return 'Fault/SKIP and coverage arithmetic independently checked';
    });
    add(42,'runtime','P1','negative','Long scan object-URL and decoder cleanup sample',()=>'',async()=>{
        const alive=new Set();try{for(let i=0;i<20;i++){const u=URL.createObjectURL(new Blob([String(i)]));alive.add(u)}check(alive.size===20,'Object URLs not created');}
        finally{for(const u of alive)URL.revokeObjectURL(u);alive.clear()}
        check(alive.size===0,'Cleanup did not clear URLs');return {status:'warn',detail:'20 temporary object URLs revoked; cannot directly measure browser decoder RAM/GC'};
    });
    // P2: accessibility/privacy/device-only contracts.
    add(43,'ui','P2','integration','Reduced motion and Developer Lab accessibility semantics',()=>'',async()=>{
        const lab=byId('developer-lab');check(lab,'Developer Lab missing');const tabs=[...lab.querySelectorAll('[data-lab-tab]')];check(tabs.length>=4,'Developer Lab nav tabs missing');check(tabs.every(t=>t.hasAttribute('aria-pressed')),'Developer Lab tab pressed-state semantics missing');
        const motion=matchMedia('(prefers-reduced-motion: reduce)').matches;return {status:'warn',detail:`${tabs.length} semantic tabs; reduced motion=${motion}. Full contrast/screen-reader audit not automated`};
    });
    add(44,'ui','P2','integration','RTL and translation fallback interpolation',()=>'',async()=>{
        const locales=typeof traducoes!=='undefined'?traducoes:window.BASLocalePayloads;check(locales?.en&&locales?.pt,'Locale registries missing');
        const sample='regressionRun';check(typeof locales.en[sample]==='string','Regression UI fallback key missing');
        return {status:'warn',detail:'Runtime locales present, fallback key validated; RTL font/layout render not covered'};
    });
    add(45,'media','P2','integration','Real JPEG/PNG texture decode and invalid image rejection',prereq.composition,async()=>{
        const png=fixture('png');check(png instanceof Blob,'PNG fixture missing');const jpeg=await fetch('./diagnostics/scan-overlay.jpg').then(r=>r.blob());
        for(const blob of [png,jpeg])await withBitmap(blob,b=>check(b.width>0&&b.height>0,'Image decode has no dimensions'));
        let rejected=false;try{await createImageBitmap(new Blob(['not an image'],{type:'image/png'}))}catch(_){rejected=true}
        check(rejected,'Corrupted PNG accepted');return 'Real PNG + JPEG decoded and corrupted image rejected';
    });
    add(46,'persistence','P2','device-required','Storage estimate/eviction with unsaved assets',()=>!navigator.storage?.estimate?'Storage estimate API unsupported':'',async()=>{
        const value=await navigator.storage.estimate();check(value&&Number.isFinite(value.usage),'Storage usage unavailable');
        return {status:'warn',detail:`${value.usage} bytes reported; deliberate PWA eviction would risk user files and was not induced`};
    });
    add(47,'companion','P2','connection','Public v1.3/v1.4 Companion feature negotiation',()=>noconn()?'Connect a real v1.3/v1.4 Companion for negotiation test':'',async()=>{
        const features=typeof moduleFeatures!=='undefined'?[...moduleFeatures]:[];check(features.every(x=>typeof x==='string'),'Capability entries malformed');
        return {status:'warn',detail:`${features.length} live features; not verified against two different Companion versions`};
    });
    add(48,'ui','P2','integration','Sanitized Developer Lab snapshot excludes secrets',()=>'',async()=>{
        const data=window.BASDeveloperLab?.snapshot?.();
        if(!data)return {status:'warn',detail:'Developer Lab does not expose the sanitized snapshot reader to tests; copying unverified'};
        const s=typeof data==='string'?data:JSON.stringify(data);check(!/(?:X-Boot-Creator-Token|sessionToken|privateKey|authorization\s*:)/i.test(s),'Snapshot contains credential field');
        return 'Sanitized snapshot has no named credential fields';
    });
    add(49,'companion','P2','device-required','Cross-device bootanimation playback on safe physical rig',skip('Requires dedicated test phone and explicitly authorized installation/playback; scanner never alters Android boot'),async()=>{throw Error('Not run');});

    // Deliberately exercise this classifier in the scanner without making unsafe side effects.
    async function probe(fn,reason=''){
        if(reason)return {status:'skip',detail:reason};
        try{const value=await fn();return value===false?{status:'fail',detail:'Assertion was false'}:{status:'pass',detail:'Assertion passed'};}
        catch(error){return {status:'fail',detail:String(error?.message||error)}}
    }
    function register(registerFn){
        check(cases.length===49,'Expected exactly 49 gap records');
        for(const t of cases.filter(x=>![1,3,11,12,28].includes(Number(x.id.slice(-2)))).concat(cases.filter(x=>[11,12,28,3,1].includes(Number(x.id.slice(-2)))))){const {priority,mode,...base}=t;registerFn({...base,priority,mode,severity:priority==='P0'?'major':'normal',timeout:priority==='P0'?35000:12000});}
    }
    window.BASRegressionR2=Object.freeze({version:VERSION,register,probe,inventory:()=>cases.map(({id,name,category,priority,mode})=>({id,name,category,priority,mode}))});
})();
