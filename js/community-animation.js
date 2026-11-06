/* BAS Community: local, read-only preview of APPROVED bootanimation.zip files.
 * Uses the existing guarded download API and bundled JSZip; no additional server
 * endpoints, public R2 keys or privileged Companion operations. Beta-only: lazy
 * downloads consume the same R2 read budget as regular ZIP downloads.
 */
(()=>{
'use strict';
const MAX_ARCHIVE=20*1024*1024, MAX_ENTRIES=480, MAX_FRAMES=450;
const LOOP_SECONDS=5, MAX_PREVIEW_FPS=60, DECODE_LIMIT=12, ZIP_CACHE_LIMIT=2;
const cache=new Map();
let generation=0, observer=null;
const active=new Map();
function trimCache(){
 while(cache.size>ZIP_CACHE_LIMIT){
  const oldest=[...cache.keys()].find(id=>![...active.values()].some(record=>record.id===id));
  if(!oldest)break; // Never close bitmaps still used by visible cards.
  const value=cache.get(oldest);cache.delete(oldest);
  Promise.resolve(value).then(model=>{for(const image of model.bitmaps.values())image.close?.();}).catch(()=>{});
 }
}
const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
function parseDescription(raw){
 const lines=String(raw).replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 const header=/^(\d{1,5})\s+(\d{1,5})\s+(\d{1,3})$/.exec(lines.shift()||'');
 if(!header)throw Error('Invalid bootanimation description');
 const [width,height,fps]=header.slice(1).map(Number);
 if(!width||!height||width>8192||height>8192||fps<1||fps>120)throw Error('Invalid preview dimensions');
 const parts=lines.map(line=>{
  const m=/^([pc])\s+(\d{1,5})\s+(\d{1,5})\s+(part\d{1,2})$/.exec(line);
  if(!m)throw Error('Unsupported bootanimation part');
  return {type:m[1],count:Number(m[2]),pause:Number(m[3]),name:m[4]};
 });
 if(!parts.length||parts.length>100)throw Error('No animation parts');
 return {width,height,fps,parts};
}
function makeTimeline(description,framePaths){
 let total=0;
 const segments=description.parts.map(part=>{
  const frames=framePaths[part.name]||[];
  if(!frames.length)throw Error('Preview frames are missing');
  const cycle=(frames.length+part.pause)/description.fps;
  // Android's count=0 repeats until boot completes; simulate five REAL seconds
  // before advancing to subsequent final parts. Other parts keep real timing.
  const duration=part.count===0?
   (part.type==='c'?Math.max(cycle,Math.ceil(LOOP_SECONDS/cycle)*cycle):LOOP_SECONDS):
   cycle*part.count;
  const segment={...part,frames,cycle,start:total,end:total+duration};
  total+=duration;
  return segment;
 });
 if(!(total>0)||!Number.isFinite(total))throw Error('Invalid preview timeline');
 return {fps:description.fps,width:description.width,height:description.height,
  segments,total};
}
function frameAtTime(plan,time){
 const t=Math.max(0,Number(time)||0)%plan.total;
 const part=plan.segments.find(s=>t<s.end)||plan.segments.at(-1);
 const elapsed=Math.max(0,t-part.start);
 const step=(elapsed%part.cycle)*plan.fps;
 const index=Math.min(part.frames.length-1,Math.floor(step));
 return part.frames[index];
}
async function buildFromZip(blob){
 if(!(blob instanceof Blob)||blob.size<1||blob.size>MAX_ARCHIVE||typeof JSZip==='undefined')
  throw Error('Preview ZIP unavailable');
 const zip=await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
 const all=Object.keys(zip.files);
 if(all.length>MAX_ENTRIES)throw Error('Too many preview files');
 const descEntry=zip.file('desc.txt');
 if(!descEntry)throw Error('desc.txt missing');
 const desc=parseDescription(await descEntry.async('string'));
 const paths={};let count=0;
 for(const name of all){
  const match=/^(part\d{1,2})\/([A-Za-z0-9_-]{1,64}\.(?:png|jpe?g|webp))$/.exec(name);
  if(!match)continue;
  (paths[match[1]]??=[]).push(name);count++;
 }
 if(count<1||count>MAX_FRAMES)throw Error('Invalid preview frames');
 for(const group of Object.values(paths))group.sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
 return {zip,plan:makeTimeline(desc,paths),bitmaps:new Map()};
}
async function modelFor(id){
 if(!/^[a-f0-9]{32}$/.test(id))throw Error('Unknown animation');
 if(cache.has(id)){
  const model=cache.get(id);cache.delete(id);cache.set(id,model);
  return model;
 }
 // Deduplicate simultaneous requests to the same approved archive.
 const promise=(async()=>buildFromZip(await window.BASCommunityOnline.approvedZip(id)))();
 cache.set(id,promise);
 trimCache();
 try{return await promise;}catch(e){cache.delete(id);throw e;}
}
async function bitmapFor(model,path){
 if(model.bitmaps.has(path)){
  const hit=model.bitmaps.get(path);model.bitmaps.delete(path);model.bitmaps.set(path,hit);return hit;
 }
 const entry=model.zip.file(path);
 if(!entry)throw Error('Missing frame');
 const blob=await entry.async('blob');
 if(blob.size>4*1024*1024)throw Error('Oversized frame');
 const scale=Math.min(1,420/Math.max(model.plan.width,model.plan.height));
 const w=Math.max(1,Math.round(model.plan.width*scale));
 const h=Math.max(1,Math.round(model.plan.height*scale));
 const image=await createImageBitmap(blob,{resizeWidth:w,resizeHeight:h,resizeQuality:'high'});
 model.bitmaps.set(path,image);
 while(model.bitmaps.size>DECODE_LIMIT){
  const oldest=model.bitmaps.keys().next().value;
  const previous=model.bitmaps.get(oldest);model.bitmaps.delete(oldest);previous.close?.();
 }
 return image;
}
function showImage(canvas,image){
 const width=Math.max(1,canvas.clientWidth||300),height=Math.max(1,canvas.clientHeight||240);
 const density=Math.min(window.devicePixelRatio||1,2);
 const cw=Math.round(width*density),ch=Math.round(height*density);
 if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)return;
 ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);
 const ratio=Math.min(cw/image.width,ch/image.height);
 const w=image.width*ratio,h=image.height*ratio;
 ctx.drawImage(image,(cw-w)/2,(ch-h)/2,w,h);
}
function stop(canvas){
 const record=active.get(canvas);
 if(!record)return;
 record.stopped=true;clearTimeout(record.timer);
 active.delete(canvas);
 trimCache();
}
async function start(canvas,seq){
 if(active.has(canvas)||!canvas.isConnected||generation!==seq||document.hidden)return;
 const id=canvas.dataset.basAnimation;
 const record={id,stopped:false,timer:null};active.set(canvas,record);
 const valid=()=>!record.stopped&&generation===seq&&canvas.isConnected&&!document.hidden;
 const marker=canvas.parentElement?.querySelector('.bas-live-preview-loading');
 try{
  const model=await modelFor(id);
  if(!valid())return;
  if(marker)marker.hidden=true;
  const started=performance.now();
  const fps=Math.min(MAX_PREVIEW_FPS,model.plan.fps);
  const play=async()=>{
   if(!valid())return;
   const elapsed=Math.max(0,(performance.now()-started)/1000);
   const image=await bitmapFor(model,frameAtTime(model.plan,elapsed));
   if(!valid())return;
   showImage(canvas,image);
   if(reduced())return;
   const next=1000/fps;
   const until=next-(performance.now()-started)%next;
   record.timer=setTimeout(()=>void play().catch(fail),Math.max(8,until));
  };
  const fail=()=>{if(marker){marker.hidden=false;marker.textContent='✧';}};
  await play();
 }catch(_){if(valid()&&marker){marker.hidden=false;marker.textContent='✧';}}
 finally{if(!valid())stop(canvas);}
}
function unmount(){
 generation++;
 observer?.disconnect();observer=null;
 for(const canvas of active.keys())stop(canvas);
}
function mount(root){
 unmount();
 if(!root)return;
 const seq=generation;
 const canvases=Array.from(root.querySelectorAll('canvas[data-bas-animation]'));
 if(!canvases.length)return;
 if(typeof IntersectionObserver==='undefined'){
  // Never eagerly fetch an entire gallery in browsers without intersection observation.
  void start(canvases[0],seq);return;
 }
 observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(entry.isIntersecting)void start(entry.target,seq);
   else stop(entry.target);
  }
 },{root:document.querySelector('.bas-c-scroll'),rootMargin:'80px',threshold:.01});
 for(const canvas of canvases)observer.observe(canvas);
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){for(const canvas of active.keys())stop(canvas);}
 else if(observer){
  // Reobserve to trigger a fresh intersection check when returning to the tab.
  for(const canvas of document.querySelectorAll('canvas[data-bas-animation]')){
   observer.unobserve(canvas);observer.observe(canvas);
  }
 }
});

// Reuse the published Community's ZIP frame parser, timeline and canvas painter
// for PRIVATE pending archives. Caller fetches ZIP with its own authorization.
function playBlob(canvas,blob,{onReady=()=>{},onError=()=>{}}={}){
 let model=null,stopped=false,paused=false,timer=null,first=true,elapsed=0,started=0;
 const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
 const free=()=>{
  if(!model)return;
  for(const bitmap of model.bitmaps.values())bitmap.close?.();
  model.bitmaps.clear();model=null;
 };
 const stop=()=>{
  if(stopped)return;
  stopped=true;clear();
  document.removeEventListener('visibilitychange',visibility);
  free();
 };
 const fail=error=>{stop();try{onError(error);}catch(_){}};
 const tick=async()=>{
  if(stopped||paused||document.hidden||!canvas.isConnected)return;
  const target=model;
  if(!target)return;
  elapsed=Math.max(0,(performance.now()-started)/1000);
  const bitmap=await bitmapFor(target,frameAtTime(target.plan,elapsed));
  if(stopped||paused||document.hidden||!canvas.isConnected)return;
  showImage(canvas,bitmap);
  if(first){first=false;onReady();}
  if(reduced())return;
  const fps=Math.min(MAX_PREVIEW_FPS,target.plan.fps);
  timer=setTimeout(()=>void tick().catch(fail),Math.max(12,1000/fps));
 };
 function visibility(){
  if(stopped)return;
  if(document.hidden){clear();return;}
  if(!paused&&!timer&&model){started=performance.now()-elapsed*1000;void tick().catch(fail);}
 }
 document.addEventListener('visibilitychange',visibility);
 const pause=()=>{if(stopped)return;paused=true;clear();};
 const resume=()=>{if(stopped||!paused)return;paused=false;started=performance.now()-elapsed*1000;
  if(!document.hidden&&model)void tick().catch(fail);};
 const ready=(async()=>{
  if(!canvas?.isConnected)throw Error('Preview canvas is detached');
  model=await buildFromZip(blob);
  if(stopped){free();return;}
  started=performance.now();
  if(!document.hidden)await tick();
 })().catch(fail);
 return Object.freeze({stop,pause,resume,ready});
}

window.BASCommunityAnimation=Object.freeze({mount,unmount,parseDescription,makeTimeline,frameAtTime,buildFromZip,playBlob});
})();
