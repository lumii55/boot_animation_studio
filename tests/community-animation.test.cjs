'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const JSZip=require('../vendor/jszip.min.js');
const script=fs.readFileSync(path.join(root,'js/community-animation.js'),'utf8');
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/L0sAAAAASUVORK5CYII=','base64');
function harness(){
 const events=new Map(),window={matchMedia:()=>({matches:false})};
 const document={hidden:false,addEventListener:(event,callback)=>events.set(event,callback)};
 const ctx={window,document,JSZip,Blob,Uint8Array,ArrayBuffer,console,setTimeout,clearTimeout};
 vm.runInNewContext(script,ctx,{filename:'community-animation.js'});
 return {api:window.BASCommunityAnimation,window,document,events};
}
function plain(value){return JSON.parse(JSON.stringify(value));}
test('desc parser supports p/c parts, explicit repeats and infinite Android loop',()=>{
 const {api}=harness();
 const desc=api.parseDescription('1080 2400 30\n# comment\np 1 0 part0\np 0 2 part1\nc 1 0 part2\n');
 assert.equal(desc.fps,30);
 assert.deepEqual(plain(desc.parts.map(x=>[x.name,x.count,x.pause])),
  [['part0',1,0],['part1',0,2],['part2',1,0]]);
 assert.throws(()=>api.parseDescription('x\n0 1 part0'),/Invalid/);
 assert.throws(()=>api.parseDescription('1080 2400 130\np 0 0 part0'),/dimensions/);
});
test('preview holds loop 5 seconds then plays final frames at original FPS',()=>{
 const {api}=harness();
 const desc=api.parseDescription('1080 2400 30\np 1 0 part0\np 0 0 part1\np 1 0 part2');
 const plan=api.makeTimeline(desc,{part0:['intro'],part1:['loopA','loopB'],part2:['endA','endB']});
 assert.equal(api.frameAtTime(plan,0),'intro');
 assert.equal(api.frameAtTime(plan,0.033),'intro');
 assert.equal(api.frameAtTime(plan,0.034),'loopA');
 assert.equal(api.frameAtTime(plan,4.99),'loopA');
 assert.equal(api.frameAtTime(plan,.085),'loopB');
 assert.equal(api.frameAtTime(plan,5.034),'endA');
 assert.equal(api.frameAtTime(plan,5.068),'endB');
 assert.equal(api.frameAtTime(plan,plan.total),'intro');
});
test('preview honors per-part pause frames without accelerating playback',()=>{
 const {api}=harness();
 const d=api.parseDescription('1080 2400 10\np 2 2 part0\np 0 0 part1\np 1 0 part2');
 const p=api.makeTimeline(d,{part0:['a','b'],part1:['loop'],part2:['end']});
 assert.equal(api.frameAtTime(p,.3),'b','holds last frame during 2 pause frames');
 assert.equal(api.frameAtTime(p,.42),'a','new part cycle begins after pause');
 assert.equal(p.segments[1].end-p.segments[1].start,5);
 assert.equal(api.frameAtTime(p,.8),'loop');
 assert.equal(api.frameAtTime(p,5.81),'end');
});
test('ZIPs are read in browser; unsupported or unsafe archives fail closed',async()=>{
 const {api}=harness();
 const zip=new JSZip();
 zip.file('desc.txt','480 800 20\np 1 0 part0\np 0 0 part1\np 1 0 part2');
 zip.file('part0/0001.png',pixel);
 zip.file('part1/0001.png',pixel);
 zip.file('part1/0002.png',pixel);
 zip.file('part2/0001.png',pixel);
 const bytes=await zip.generateAsync({type:'uint8array'});
 const archive=await api.buildFromZip(new Blob([bytes]));
 assert.equal(archive.plan.fps,20);
 assert.deepEqual(plain(archive.plan.segments.map(x=>x.frames.length)),[1,2,1]);
 assert.equal(api.frameAtTime(archive.plan,archive.plan.segments[2].start+.01),'part2/0001.png');
 const oversized=new Blob([new Uint8Array(20*1024*1024+1)]);
 await assert.rejects(()=>api.buildFromZip(oversized),/unavailable/);
 const bad=new JSZip();bad.file('desc.txt','480 800 30\np 1 0 part0');
 bad.file('part0/evil.svg','<svg/>');
 const badBytes=await bad.generateAsync({type:'uint8array'});
 await assert.rejects(()=>api.buildFromZip(new Blob([badBytes])),/frames|missing/);
});
test('preview media is loaded lazily only after intersecting cards',()=>{
 const {api,window}=harness();
 assert.equal(typeof api.mount,'function');
 let observed=0,disconnects=0;
 const canvas={dataset:{basAnimation:'a'.repeat(32)}};
 const scope=Object.assign({},window);
 const proto=api;
 assert.equal(typeof proto.frameAtTime,'function');
 const root={querySelectorAll:()=>[canvas]};
 // No window IntersectionObserver in this harness: fallback only starts
 // one node, but detached nodes never fetch the private ZIP.
 window.BASCommunityOnline={approvedZip:()=>{observed++;throw Error('Should not fetch');}};
 canvas.isConnected=false;
 api.mount(root);
 assert.equal(observed,0);
 api.unmount();
});
test('mobile Community entry is on original home screen, not site header',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const [header,main]=html.split('<main class="studio-main">');
 assert.doesNotMatch(header,/id="bas-community-launcher"/);
 assert.match(main,/launch-choice-community.*id="bas-community-launcher"/s);
 assert.match(html,/js\/community-animation\.js/);
 const shell=fs.readFileSync(path.join(root,'js/community-preview.js'),'utf8');
 assert.doesNotMatch(shell,/class="bas-c-topbadge"/);
});

test('Community preview preserves private media for other creators',()=>{
 const source=fs.readFileSync(path.join(root,'js/community-live.js'),'utf8');
 assert.match(source,/self\?\.handle===handle/);
 assert.match(source,/state\.remotePictures\.avatar/);
 assert.doesNotMatch(source,/creator-private\/|PRIVATE_UPLOADS|\.object_key/);
 const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
 assert.match(sw,/community-animation\.js\?v=p15-7-visual-preview/);
});
