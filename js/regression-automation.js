/* BAS Developer Lab 2 — actual editor pipeline regression fixtures.
 * The scan is intentionally destructive to the current editor project after
 * an explicit confirmation, but NEVER writes to the connected Android device.
 */
(function () {
    'use strict';
    const VERSION = 2;
    const ROOT = './diagnostics/';
    const MEDIA = Object.freeze({
        mp4: ['scan-motion.mp4', 'video/mp4'],
        gif: ['scan-motion.gif', 'image/gif'],
        gifDisposal: ['scan-disposal.gif', 'image/gif'],
        wav: ['scan-tone.wav', 'audio/wav'],
        png: ['scan-overlay.png', 'image/png']
    });
    const state = { running:false, stages:{}, files:{}, decoded:null, lastEvents:[], errors:[], fullExport:null, lastBuild:null };
    const MAX_EVENTS = 100;
    let disposers = [];
    const now = () => performance.now();
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const isBlob = value => value instanceof Blob;
    const project = () => window.BASState?.currentProject || null;
    const el = id => document.getElementById(id);
    function assert(condition, detail) { if (!condition) throw new Error(detail); }
    function record(kind, detail) {
        const message = String(detail?.message || detail || '')
            .replace(/(authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
            .replace(/[\r\n]+/g, ' ').slice(0, 240);
        state.lastEvents.push({ at: new Date().toISOString(), kind, detail:message });
        if (state.lastEvents.length > MAX_EVENTS) state.lastEvents.shift();
        if (kind === 'error' || kind === 'rejection') {
            state.errors.push({ kind, detail:message });
            if (state.errors.length > MAX_EVENTS) state.errors.shift();
        }
    }
    async function until(test, label, timeoutMs=18000) {
        const start=now();
        while (now()-start < timeoutMs) {
            try { if (test()) return true; } catch (_) {}
            await delay(70);
        }
        throw new Error(`${label} was not observed within ${Math.round(timeoutMs/1000)} seconds`);
    }
    async function stage(name, fn) {
        const begin=now();
        try {
            record('step', `Starting ${name}`);
            const detail=await fn();
            state.stages[name]={status:'pass',durationMs:Math.round(now()-begin),detail:String(detail||'real application path completed').slice(0,200)};
            record('pass', `${name}: ${state.stages[name].detail}`);
        } catch(error) {
            state.stages[name]={status:'fail',durationMs:Math.round(now()-begin),detail:String(error?.message||error).slice(0,240)};
            record('step-fail', `${name}: ${state.stages[name].detail}`);
        }
        window.dispatchEvent(new CustomEvent('bas:regression-progress',{detail:{stage:name,result:state.stages[name]}}));
    }
    function stageCheck(name) {
        const s=state.stages[name];
        if(!s) return {status:'warn',detail:`Setup did not reach ${name}`};
        if(s.status!=='pass') throw new Error(s.detail);
        return `${s.detail} · ${s.durationMs} ms`;
    }
    function requireStage(name) { const s=state.stages[name]; return s?.status==='pass'?'':`${name}: ${s?.detail||'not prepared'}`; }
    async function file(kind) {
        const spec=MEDIA[kind]; assert(spec, 'Unknown fixture');
        const response=await fetch(ROOT+spec[0],{cache:'no-store'});
        assert(response.ok, `Fixture ${kind} unavailable (HTTP ${response.status})`);
        const blob=await response.blob();
        assert(blob.size>100, `Fixture ${kind} is empty`);
        const f=new File([blob],spec[0],{type:spec[1]});
        state.files[kind]=f;
        return f;
    }
    function dispatchFile(id, file) {
        const input=el(id); assert(input?.type==='file', `Missing real input ${id}`);
        const dt=new DataTransfer(); dt.items.add(file);
        input.files=dt.files;
        // The normal BAS event listener is used; this is not a fake state assignment.
        input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    function startMonitor() {
        const error=e=>record('error',e.message || e.error);
        const rejection=e=>record('rejection',e.reason);
        window.addEventListener('error',error);
        window.addEventListener('unhandledrejection',rejection);
        disposers.push(()=>{window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection);});
    }
    async function prepare() {
        if(state.running) throw new Error('Automatic preparation already running');
        state.running=true;state.stages={};state.files={};state.decoded=null;state.fullExport=null;state.lastEvents=[];state.errors=[];
        startMonitor();
        try {
            await stage('fixtures',async()=>{
                await Promise.all(Object.keys(MEDIA).map(file));
                return `${Object.values(state.files).reduce((v,f)=>v+f.size,0)} bytes of real MP4, GIF, WAV, PNG`;
            });
            if(state.stages.fixtures.status!=='pass') return state;
            await stage('mp4',async()=>{
                assert(el('upload-video')&&el('player-video'),'Primary import controls unavailable');
                dispatchFile('upload-video',state.files.mp4);
                await until(()=>project()?.sourceBlob instanceof Blob && project()?.sourceName===MEDIA.mp4[0], 'actual MP4 project import');
                await until(()=>el('player-video').readyState>=2 && el('player-video').videoWidth>0,'MP4 first decoded frame',22000);
                const video=el('player-video');
                assert(video.videoWidth===96 && video.videoHeight===64,`Unexpected MP4 dimensions ${video.videoWidth}x${video.videoHeight}`);
                assert(video.duration>1.8 && video.duration<2.3,'MP4 duration metadata invalid');
                return `${video.videoWidth}×${video.videoHeight}, ${video.duration.toFixed(2)}s, decoded frame ready`;
            });
            if(state.stages.mp4.status!=='pass') return state;
            await stage('gif',async()=>{
                assert(window.BASSourceLibrary?.addFiles,'Source library importer missing');
                const added=await BASSourceLibrary.addFiles([state.files.gif]);
                const gif=added.find(x=>x.kind==='gif');
                assert(gif,'The real GIF importer did not add a GIF');
                assert(gif.runtimeFrames?.length>=4,'GIF decoder produced insufficient frames');
                assert(gif.width===64&&gif.height===64,'GIF dimensions lost');
                assert(gif.duration>0.5 && gif.fps>0,'GIF frame timing invalid');
                return `${gif.runtimeFrames.length} decoded frames, ${gif.duration.toFixed(2)}s, preview ${gif.previewBlob?.size||0} bytes`;
            });
            await stage('gif-disposal',async()=>{
                const added=await BASSourceLibrary.addFiles([state.files.gifDisposal]);
                const gif=added.find(source=>source.kind==='gif');
                assert(gif?.runtimeFrames?.length===3,'GIF transparency/disposal fixture did not decode three frames');
                assert(gif.duration>.45&&gif.duration<.8,`Unexpected GIF timing ${gif.duration}`);
                assert(gif.previewBlob?.size>250,'Disposal GIF preview missing');
                return `${gif.runtimeFrames.length} transparency/disposal frames, ${gif.duration.toFixed(2)}s`;
            });
            await stage('wav',async()=>{
                const added=await BASSourceLibrary.addFiles([state.files.wav]);
                const audio=added.find(x=>x.role==='audio');
                assert(audio&&audio.blob?.size>100,'WAV not imported to Source Library');
                const Audio=window.AudioContext||window.webkitAudioContext;
                assert(Audio,'Web Audio unsupported');
                const ctx=new Audio();
                try {
                    const decoded=await ctx.decodeAudioData(await state.files.wav.arrayBuffer());
                    assert(decoded.duration>1.8&&decoded.numberOfChannels>0,'WAV decode invalid');
                    const channels=decoded.getChannelData(0);
                    const rms=Math.sqrt(channels.reduce((a,v)=>a+v*v,0)/channels.length);
                    assert(rms>0.02&&rms<0.95,'WAV content was silent or clipped');
                    state.decoded={duration:decoded.duration,sampleRate:decoded.sampleRate,rms};
                    return `${decoded.duration.toFixed(2)}s, ${decoded.sampleRate} Hz, RMS ${rms.toFixed(3)}`;
                } finally { await ctx.close().catch(()=>{}); }
            });
            await stage('audio-ui',async()=>{
                assert(state.stages.wav?.status==='pass','WAV must decode first');
                const toggle=el('input-usar-som');assert(toggle,'Audio Studio enable toggle missing');
                toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
                dispatchFile('file-audio-loop',state.files.wav);
                await until(()=>typeof captureAudioEditorState==='function' && captureAudioEditorState().loop.mode==='file'&&isBlob(getSelectedAudioFile('loop')),'WAV attachment to real Loop Audio Studio',12000);
                const audio=captureAudioEditorState();
                assert(audio.enabled,'Audio Studio did not enable');
                return 'Real WAV selected in Loop Audio Studio and captured in project state';
            });
            await stage('composition',async()=>{
                const button=el('composition-add-text');assert(button,'Composition add-text UI missing');
                button.click();
                await until(()=>window.BASComposition?.getLayers?.().some(x=>x.type==='text'),'Real text composition UI');
                const textLayer=BASComposition.getLayers().find(x=>x.type==='text');
                assert(textLayer,'Text layer absent');
                // Exercise the real overlay import event rather than constructing a fake layer.
                dispatchFile('composition-add-image',state.files.png);
                await until(()=>BASComposition.getLayers().some(x=>x.type==='image'&&isBlob(x.blob)),'Real image composition import',15000);
                assert(BASComposition.validate()?.valid,'Composition failed validation');
                return `${BASComposition.getLayers().length} real UI layers (text + PNG image)`;
            });
            await stage('keyframes',async()=>{
                assert(state.stages.composition?.status==='pass','Composition prerequisite failed');
                const layer=BASComposition.getLayers().find(x=>x.type==='text');
                BASComposition.select(layer.id);
                const video=el('player-video');video.pause(); video.currentTime=0;
                await delay(100);
                assert(BASComposition.addKeyframeAtPlayhead(layer.id),'Cannot add first keyframe');
                const before=BASComposition.getKeyframes(layer.id);
                assert(before.length>=1,'Keyframe missing');
                assert(BASComposition.setKeyframeTime(layer.id,before[0].id,0.35,{commit:true}),'Cannot move keyframe');
                const after=BASComposition.getKeyframes(layer.id);
                assert(after.some(x=>Math.abs(x.time-0.35)<0.02),'Keyframe move did not persist');
                const a=BASComposition.getResolvedTransform(layer.id,0.35);
                assert(a&&Number.isFinite(a.x)&&Number.isFinite(a.opacity),'Keyframe interpolation failed');
                return `${after.length} keyframe(s), moved to 0.35s, transform resolved`;
            });
            await stage('composition-render',async()=>{
                assert(state.stages.composition?.status==='pass','Composition prerequisite failed');
                const base=state.files.png;
                const frame=await BASComposition.applyToFrameBlob(base,0.4,96,64,'png');
                assert(frame instanceof Blob && frame.size>100,'Composition renderer returned no PNG');
                const bytesA=new Uint8Array(await base.arrayBuffer());
                const bytesB=new Uint8Array(await frame.arrayBuffer());
                const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
                assert((await digest(bytesA))!==(await digest(bytesB)),'Composition image matches unmodified source');
                return `${frame.size} bytes rendered by BASComposition.applyToFrameBlob`;
            });
            await stage('project-package',async()=>{
                assert(window.BASProjectFile?.build&&BASProjectFile.read,'Project package APIs unavailable');
                const built=await BASProjectFile.build();
                const blob=isBlob(built)?built:(built?.blob||built?.file||null);
                assert(isBlob(blob),'Project package build returned no Blob');
                assert(blob.size>state.files.mp4.size,'Project package lost media assets');
                const loaded=await BASProjectFile.read(blob);
                assert(loaded&&typeof loaded==='object','Project package could not be parsed');
                return `${blob.size} bytes, .basproject built and reopened`;
            });
            await stage('timeline-markers',async()=>{
                assert(typeof window.marcarTrecho==='function'&&typeof seekTimelineTo==='function','Real timeline controls unavailable');
                await until(()=>typeof isBuildingTimeline==='undefined'||!isBuildingTimeline,'Editor timeline ready',14000);
                const points=[['m0',0],['m1',.35],['m2',1.3],['m3',1.85]];
                for(const [id,time] of points){
                    seekTimelineTo(time);
                    await until(()=>Math.abs(getTimelineCurrentTimeExact()-time)<.1,`Timeline seek to ${time}s`,6500);
                    const button=el('st-'+id)?.closest('button');
                    assert(button,'Marker button '+id+' missing');
                    button.click();
                    await until(()=>Number.isFinite(project()?.markers?.[id]),`Timeline marker ${id}`,2000);
                }
                const marked=points.map(([id])=>project().markers[id]);
                assert(marked.every((time,index)=>!index||time>marked[index-1]),'Marker order invalid');
                assert(marked[3]-marked[0]>1,'Marker span too short');
                return `${marked.map(x=>x.toFixed(2)).join(' / ')}s through real marker controls`;
            });
            await stage('zip-export',async()=>{
                assert(state.stages['timeline-markers']?.status==='pass','Timeline marker setup failed');
                assert(typeof buildSimpleBootanimation==='function'&&typeof getExportOptions==='function','Real export engine unavailable');
                // No download, upload, or Android apply: exercise the same ZIP builder in memory.
                const controls=['input-largura','input-altura','input-fps','input-formato'];
                assert(controls.every(el),'Export controls missing');
                const prev=Object.fromEntries(controls.map(id=>[id,el(id).value]));
                try {
                    el('input-largura').value='96'; el('input-altura').value='64';el('input-fps').value='6';el('input-formato').value='png';
                    const options=getExportOptions();
                    assert(options.width===96&&options.height===64&&options.fps===6,'Export options were not applied');
                    const trans=window.traducoes?.[window.idiomaAtual]||window.traducoes?.en||{};
                    const built=await buildSimpleBootanimation(options,trans);
                    assert(isBlob(built)&&built.size>1000,'Real export produced empty ZIP');
                    const zip=await JSZip.loadAsync(built);
                    const descriptor=await zip.file('desc.txt')?.async('string');
                    const frames=Object.values(zip.files).filter(x=>/\.png$/i.test(x.name)&&!x.dir);
                    assert(descriptor?.startsWith('96 64 6\n'),`Incorrect descriptor: ${String(descriptor).slice(0,50)}`);
                    assert(frames.length>=6,`Export generated only ${frames.length} PNG frames`);
                    assert(frames.some(x=>x.name.startsWith('part1/')),'Export missed loop frames');
                    state.fullExport={bytes:built.size,frames:frames.length,descriptor,archive:built};
                    return `${frames.length} real PNG frames, ${built.size} bytes, desc.txt verified`;
                } finally { for(const id of controls)el(id).value=prev[id]; }
            });
            return state;
        } finally {
            disposers.splice(0).forEach(f=>{try{f();}catch(_){}});
            state.running=false;
        }
    }
    function buildTests(register) {
        const tests=[
            ['autolab.fixtures','Real offline MP4/GIF/WAV/PNG fixture files','media','fixtures'],
            ['autolab.mp4-import','Real MP4 project import + decoded video','media','mp4'],
            ['autolab.gif-import','GIF imported using BAS Source Library','media','gif'],
            ['autolab.wav-decode','Real WAV decoding and non-silent waveform','composition','wav'],
            ['autolab.gif-disposal-import','Transparency/disposal GIF imported by real decoder','media','gif-disposal'],
            ['autolab.audio-editor','WAV attached through real Audio Studio input','composition','audio-ui'],
            ['autolab.composition-ui','Text and image layers created using real controls','composition','composition'],
            ['autolab.keyframes','Real keyframe creation, movement and interpolation','composition','keyframes'],
            ['autolab.composition-render','Real composition renderer changes frame pixels','composition','composition-render'],
            ['autolab.basproject-roundtrip','Real project package build and readback','persistence','project-package'],
            ['autolab.timeline-markers','Real timeline seeks and four marker UI actions','sequence','timeline-markers'],
            ['autolab.bootanimation-export','Real bootanimation ZIP export and desc.txt','output','zip-export']
        ];
        for(const [id,name,category,key] of tests)register({id,name,category,severity:key==='zip-export'||key==='mp4'?'critical':'major',timeout:2500,run:()=>stageCheck(key)});
        register({id:'autolab.gif-frame-schedule',name:'GIF timestamps monotonic and nonzero',category:'media',severity:'major',requires:()=>requireStage('gif'),run:()=>{
            const gif=BASSourceLibrary.getVisual().find(s=>s.kind==='gif'&&!s.isPrimary);
            assert(gif?.runtimeFrames?.length>=4,'GIF frames missing');
            let end=0;for(const f of gif.runtimeFrames){assert(Number(f.startTime)>=end-0.001,'GIF frame time went backwards');assert(Number(f.duration)>0,'Zero-duration GIF frame');end=Number(f.startTime)+Number(f.duration);}return `${gif.runtimeFrames.length} contiguous frames`;
        }});
        register({id:'autolab.gif-frame-diversity',name:'Animated GIF frames have distinct real image bytes',category:'media',severity:'major',requires:()=>requireStage('gif'),run:async()=>{
            const frames=BASSourceLibrary.getVisual().find(s=>s.kind==='gif'&&!s.isPrimary)?.runtimeFrames||[];
            assert(frames.length>=4,'Not enough GIF frames');const bytes=await Promise.all([frames[0],frames[Math.floor(frames.length/2)]].map(f=>f.blob.arrayBuffer()));
            const hashes=await Promise.all(bytes.map(b=>crypto.subtle.digest('SHA-256',b).then(x=>Array.from(new Uint8Array(x)).join(','))));
            assert(hashes[0]!==hashes[1],'GIF frames collapsed into identical images');return 'Distinct decoded image frames';
        }});
        register({id:'autolab.gif-preview-blob',name:'GIF generates playable preview media bytes',category:'media',severity:'major',requires:()=>requireStage('gif'),run:()=>{
            const gif=BASSourceLibrary.getVisual().find(s=>s.kind==='gif'&&!s.isPrimary);
            assert(isBlob(gif?.previewBlob)&&gif.previewBlob.size>400,'GIF preview failed');return `${gif.previewBlob.size} bytes`;
        }});
        register({id:'autolab.video-seek',name:'MP4 real media seek reaches requested timestamp',category:'media',severity:'major',requires:()=>requireStage('mp4'),timeout:6500,run:async()=>{
            const video=el('player-video');video.pause();
            const target=.75; video.currentTime=target;
            await until(()=>Math.abs(video.currentTime-target)<.06&&video.readyState>=2,'MP4 seek',4900);
            return `Reached ${video.currentTime.toFixed(2)} s`;
        }});
        register({id:'autolab.video-canvas',name:'Decoded MP4 frame draws into real Canvas',category:'media',severity:'major',requires:()=>requireStage('mp4'),run:()=>{
            const c=document.createElement('canvas');c.width=32;c.height=32;const ctx=c.getContext('2d');
            ctx.drawImage(el('player-video'),0,0,32,32);
            const pixels=ctx.getImageData(0,0,32,32).data;
            assert(pixels.some((v,i)=>i%4!==3&&v>20),'Decoded video produced blank pixels');
            return 'Canvas frame pixels nonempty';
        }});
        register({id:'autolab.audio-asset-inventory',name:'Real WAV present in Source Library and project assets',category:'composition',severity:'major',requires:()=>requireStage('wav'),run:()=>{
            assert(BASSourceLibrary.getAudio().some(x=>x.blob?.size===state.files.wav.size),'WAV missing from source library');
            assert(BASProjectEngine.getAssets().some(x=>x.blob?.size===state.files.wav.size),'WAV missing from project assets');
            return 'WAV present in both inventories';
        }});
        register({id:'autolab.composition-assets',name:'Real PNG composition image retained by asset inventory',category:'composition',severity:'major',requires:()=>requireStage('composition'),run:()=>{
            const assets=BASComposition.getAssets();assert(assets.some(x=>x.blob?.size===state.files.png.size),'PNG composition asset missing');return `${assets.length} composition asset(s)`;
        }});
        register({id:'autolab.composition-serialize',name:'Composition text/image and keyframes serialize correctly',category:'composition',severity:'major',requires:()=>requireStage('keyframes'),run:()=>{
            const serial=BASComposition.serialize();assert(serial.layers.some(l=>l.type==='text'&&l.keyframes?.length),'Serialized text keyframes missing');assert(serial.layers.some(l=>l.type==='image'&&l.assetName),'Image asset reference missing');return `${serial.layers.length} serialized layers`;
        }});
        register({id:'autolab.export-zip-contents',name:'Generated ZIP has image frames and valid AOSP paths',category:'output',severity:'critical',requires:()=>requireStage('zip-export'),run:()=>{
            assert(state.fullExport?.frames>=6,'No exported frames recorded');
            const data=state.fullExport?.descriptor||'';assert(/part1/.test(data),'Loop descriptor missing');return `${state.fullExport.frames} frames in ${state.fullExport.bytes} byte archive`;
        }});
        register({id:'autolab.gif-disposal-duration',name:'GIF variable frame delays preserved',category:'media',severity:'major',requires:()=>requireStage('gif-disposal'),run:()=>{
            const src=BASSourceLibrary.getVisual().find(x=>x.name===MEDIA.gifDisposal[0]);assert(src,'Disposal GIF missing');
            const durations=src.runtimeFrames.map(f=>Number(f.duration));
            assert(durations[1]>durations[0]*2.2,'Variable GIF frame timing collapsed');
            assert(durations[2]>durations[0]*1.5,'Last GIF delay lost');
            return durations.map(x=>x.toFixed(2)).join(' / ')+'s';
        }});
        register({id:'autolab.gif-disposal-frames',name:'Disposal GIF successive composited PNGs are distinct',category:'media',severity:'major',requires:()=>requireStage('gif-disposal'),run:async()=>{
            const src=BASSourceLibrary.getVisual().find(x=>x.name===MEDIA.gifDisposal[0]);const frames=src?.runtimeFrames||[];
            assert(frames.length===3,'Disposal frame count wrong');
            const sizes=frames.map(f=>f.blob?.size||0);assert(sizes.every(x=>x>90),'Disposal frame PNG empty');
            const digests=await Promise.all(frames.map(async f=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.blob.arrayBuffer()))).join('.')));
            assert(new Set(digests).size===3,'Disposal frames collapsed to repeated image');
            return `${digests.length} different composited PNGs`;
        }});
        register({id:'autolab.gif-source-inventory',name:'Both GIF fixtures remain identifiable in project assets',category:'media',severity:'major',requires:()=>requireStage('gif-disposal'),run:()=>{
            const gifs=BASSourceLibrary.getVisual().filter(x=>x.kind==='gif');
            assert(gifs.length===2&&new Set(gifs.map(x=>x.name)).size===2,'Source Library lost a GIF');return gifs.map(x=>x.name).join(', ');
        }});
        register({id:'autolab.mp4-source-inventory',name:'MP4 primary source retains dimensions and Blob',category:'media',severity:'major',requires:()=>requireStage('mp4'),run:()=>{
            const primary=BASSourceLibrary.getVisual().find(x=>x.isPrimary);
            assert(primary?.blob?.size===state.files.mp4.size,'Primary source Blob modified');
            assert(primary.width===96&&primary.height===64,'Primary Source Library resolution missing');
            return `${primary.width}×${primary.height} · ${primary.blob.size} bytes`;
        }});
        register({id:'autolab.source-serialization',name:'Source Library serializes visual and audio assets',category:'project',severity:'major',requires:()=>requireStage('wav'),run:()=>{
            const serial=BASSourceLibrary.serialize();
            const collection=Array.isArray(serial)?serial:(serial?.sources||serial?.library||[]);
            assert(collection.length>=3,'Library serialization lost sources');
            return `${collection.length} serializable source entries`;
        }});
        register({id:'autolab.sequence-playback',name:'Master Sequence includes imported GIF clips',category:'sequence',severity:'major',requires:()=>requireStage('gif-disposal'),run:()=>{
            const seq=BASMasterSequence.serialize();const clips=Array.isArray(seq)?seq:(seq?.clips||seq?.sequence||[]);
            assert(clips.length>=3,'Master Sequence missing imported visuals');
            assert(BASMasterSequence.getDuration()>2,'Sequence timeline duration invalid');
            return `${clips.length} clips, ${BASMasterSequence.getDuration().toFixed(2)}s`;
        }});
        register({id:'autolab.audio-state-source',name:'Audio Studio Loop stores the real WAV file source',category:'composition',severity:'major',requires:()=>requireStage('audio-ui'),run:()=>{
            const audioState=captureAudioEditorState();assert(audioState.enabled&&audioState.loop.mode==='file','Audio mode lost');
            assert(getSelectedAudioFile('loop')?.size===state.files.wav.size,'Audio Studio WAV Blob changed');
            return 'Loop Audio Studio retains imported WAV';
        }});
        register({id:'autolab.composition-render-dimensions',name:'Composition output is decodable at requested resolution',category:'composition',severity:'major',requires:()=>requireStage('composition-render'),run:async()=>{
            const blob=await BASComposition.applyToFrameBlob(state.files.png,.5,96,64,'png');
            const bitmap=await createImageBitmap(blob);try{assert(bitmap.width===96&&bitmap.height===64,'Rendered frame dimension mismatch');}finally{bitmap.close();}
            return '96×64 PNG image decoded successfully';
        }});
        register({id:'autolab.marker-serialization',name:'Four marked timeline boundaries survive project capture',category:'sequence',severity:'major',requires:()=>requireStage('timeline-markers'),run:()=>{
            const values=Object.values(project()?.markers||{});
            assert(values.length===4 && values.every(Number.isFinite),'Project lost markers');
            const manifest=BASProjectEngine.captureManifest();assert(manifest&&BASProjectEngine.validateManifest(manifest),'Manifest invalid after marker updates');
            return `Four timeline markers in valid project`;
        }});
        register({id:'autolab.export-audio-in-zip',name:'Generated ZIP includes processed Loop WAV audio',category:'output',severity:'critical',requires:()=>requireStage('zip-export'),run:async()=>{
            const zip=await JSZip.loadAsync(state.fullExport.archive);
            const wav=zip.file('part1/audio.wav');assert(wav,'Real WAV not included in Loop export');
            const bytes=await wav.async('uint8array');assert(bytes.length>200&&String.fromCharCode(...bytes.slice(0,4))==='RIFF','Exported audio not a valid RIFF/WAV');
            return `${bytes.length} bytes of processed WAV inside generated ZIP`;
        }});
        register({id:'autolab.export-frames-decode',name:'Exported PNG frame can be decoded and inspected',category:'output',severity:'major',requires:()=>requireStage('zip-export'),run:async()=>{
            const zip=await JSZip.loadAsync(state.fullExport.archive);
            const first=Object.values(zip.files).find(f=>/part[012]\/\d+\.png$/i.test(f.name));assert(first,'No frame in exported ZIP');
            const b=await first.async('blob');const bitmap=await createImageBitmap(b);
            try{assert(bitmap.width===96&&bitmap.height===64,'Exported PNG dimensions invalid');}finally{bitmap.close();}
            return `${first.name} decoded at 96×64`;
        }});
        register({id:'autolab.export-entry-safety',name:'Generated ZIP has no unsafe paths or duplicate entries',category:'output',severity:'critical',requires:()=>requireStage('zip-export'),run:async()=>{
            const zip=await JSZip.loadAsync(state.fullExport.archive);const names=Object.keys(zip.files);
            assert(names.every(n=>!n.startsWith('/')&&!n.includes('..')&&!n.includes('\\')),'Unsafe ZIP path');
            assert(new Set(names).size===names.length,'Duplicate ZIP entry');
            assert(names.includes('desc.txt'),'Descriptor missing');return `${names.length} safe entries`;
        }});
        register({id:'autolab.file-assets-integrity',name:'Media file bytes survive the real import pipeline',category:'persistence',severity:'major',requires:()=>requireStage('gif-disposal'),run:()=>{
            const sources=BASSourceLibrary.getAll();for(const [kind,spec] of Object.entries(MEDIA)){
                const collection=kind==='png'?BASComposition.getAssets():sources;
                const match=collection.find(x=>x.name===spec[0] || x.blob?.size===state.files[kind].size);
                assert(match?.blob?.size===state.files[kind].size,`Missing or changed ${kind} media`);
            }
            return `${Object.keys(MEDIA).length} fixture files retained`;
        }});
        register({id:'autolab.runtime-errors',name:'No uncaught JavaScript errors during automatic setup',category:'runtime',severity:'major',run:()=>{
            if(state.errors.length)throw new Error(`${state.errors.length} unexpected runtime error(s): ${state.errors[0].detail}`);
            return 'No window.error / unhandledrejection during fixture preparation';
        }});
        register({id:'autolab.compact-assets',name:'Embedded test media remain bounded in size',category:'runtime',severity:'normal',requires:()=>requireStage('fixtures'),run:()=>{
            const total=Object.values(state.files).reduce((v,f)=>v+f.size,0);assert(total<300000,'Regression media accidentally too heavy');return `${total} bytes`;
        }});
    }
    window.BASRegressionAutomation=Object.freeze({version:VERSION,prepare,register:buildTests,status:()=>({running:state.running,stages:structuredClone(state.stages),events:state.lastEvents.slice(-40),errors:state.errors.slice(-20),media:Object.fromEntries(Object.entries(state.files).map(([k,v])=>[k,{name:v.name,bytes:v.size,type:v.type}]))})});
})();
