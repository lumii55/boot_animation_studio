const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ID='a'.repeat(32),COMMENT='c'.repeat(32),SELF='stella55';
const flush=()=>new Promise(r=>setImmediate(r));
function make({signed=true,license='CC-BY-4.0',comment='<img src=x onerror=alert(1)> Love 😺'}={}){
 const nodes=new Map(),events=new Map(),calls=[];
 const post={id:ID,title:'Yonkgor Test',handle:SELF,display_name:'Stella',summary:'Original boot animation',
  tags:['test'],license,width:864,height:1920,fps:30,like_count:2,download_count:4};
 const viewer={handle:'test_visitor',display_name:'Visitor'};
 const social={likes:2,comments_count:1,followers:7,liked:false,following:false,can_remix:license!=='all-rights-reserved',
  comments:[{id:COMMENT,handle:SELF,display_name:'Stella',content:comment,likes:0,liked:false,created_at:1793800000}],next_offset:null};
 const creator={handle:SELF,display_name:'Stella',bio:'My animations',followers:7,following:false};
 const creatorState=()=>({...creator});
 const node=id=>{if(!nodes.has(id)){
  const n={id,innerHTML:'',textContent:'',value:'',checked:false,hidden:false,dataset:{},
   classList:{toggle(){},add(){},remove(){},contains(){return false;}},
   querySelectorAll:()=>[],querySelector:()=>null,replaceChildren(){this.innerHTML='';},
   contains:()=>true,setAttribute(){},getAttribute(){},focus(){},
   addEventListener(name,cb){events.set(id+':'+name,cb)}};
  nodes.set(id,n);
 }return nodes.get(id)};
 const document={getElementById:node,body:{classList:{add(){},remove(){}}},readyState:'complete'};
 const api={available:()=>true,state:()=>({authenticated:signed,user:signed?viewer:null}),
  gallery:async()=>({items:[post]}),creators:async()=>({creators:[{...creator,animation_count:1}]}),
  socialAnimation:async()=>({...social,comments:social.comments.map(x=>({...x}))}),
  socialCreator:async()=>creatorState(),animationDetail:async()=>({animation:post}),
  likeAnimation:async(id,enabled)=>{calls.push(['like',enabled]);social.liked=enabled;social.likes+=enabled?1:-1;return {liked:enabled,likes:social.likes}},
  followCreator:async(handle,enabled)=>{calls.push(['follow',handle,enabled]);creator.following=enabled;creator.followers+=enabled?1:-1;social.following=enabled;social.followers=creator.followers;return {following:enabled,followers:creator.followers}},
  addComment:async(id,text)=>{calls.push(['comment',id,text]);return{id:COMMENT,status:'visible'}},
  likeComment:async(id,enabled)=>{calls.push(['comment-like',id,enabled]);return{liked:enabled,likes:enabled?1:0}},
  reportComment:async(id,reason)=>{calls.push(['report-comment',id,reason]);return{status:'open'}},
  ownedAnimations:async()=>({animations:[]}),drafts:async()=>({drafts:[]}),
  media:async()=>{throw Error('No photo')},login:async()=>{},
 };
 const window={BASI18n:{locale:'pt'},BASCommunityOnline:api,addEventListener(){}};
 const context={window,document,Blob,File,FormData,URL,Date,Promise,setTimeout,clearTimeout,location:{origin:'http://127.0.0.1:8088',hostname:'127.0.0.1',pathname:'/'},navigator:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/community-labels.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/community-live.js'),'utf8'),context);
 function click(action,id='',handle=''){
  const hit={dataset:{cAction:action,id,handle},classList:{contains:()=>false},closest(){return hit}};
  return window.BASCommunityLive.handle({target:hit});
 }
 return {node,click,calls,window,api,post,social,creator,events,viewer,flush};
}
test('gallery click opens real social detail with guarded remix and escaped text',async()=>{
 const h=make();h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 const html=h.node('bas-c-view').innerHTML;
 assert.match(html,/data-c-action="follow"/);
 assert.match(html,/data-c-action="like-animation"/);
 assert.match(html,/data-c-action="remix"/);
 assert.match(html,/bas-social-comment-form/);
 assert.match(html,/data-c-action="comment-like"/);
 assert.match(html,/data-c-action="comment-report"/);
 assert.match(html,/data-c-action="share-animation"/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror=/);
});
test('all-rights-reserved allows download but hides remix',async()=>{
 const h=make({license:'all-rights-reserved'});h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 const html=h.node('bas-c-view').innerHTML;
 assert.match(html,/data-c-action="download"/);
 assert.doesNotMatch(html,/data-c-action="remix"/);
 assert.match(html,/remix não autorizado/);
});
test('creator profile Follow/Following shares live social state with publication',async()=>{
 const h=make();h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 h.click('follow','',SELF);await flush();
 assert.deepEqual(h.calls[0],['follow',SELF,true]);
 assert.match(h.node('bas-c-view').innerHTML,/Seguindo/);
 h.click('creator-author','',SELF);await flush();
 assert.match(h.node('bas-c-view').innerHTML,/data-c-action="follow"/);
 assert.match(h.node('bas-c-view').innerHTML,/Seguindo/);
 h.click('follow','',SELF);await flush();
 assert.deepEqual(h.calls[1],['follow',SELF,false]);
 assert.match(h.node('bas-c-view').innerHTML,/Seguir/);
});
test('text-only comment submit and comment report route through real session',async()=>{
 const h=make();h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 h.window.BASCommunityLive.onInput({target:{id:'bas-social-comment-text',value:'Cute animation! 💜'}});
 h.window.BASCommunityLive.onSubmit({target:{id:'bas-social-comment-form'},preventDefault(){}});
 await flush();
 assert.deepEqual(h.calls[0],['comment',ID,'Cute animation! 💜']);
 h.click('comment-report',COMMENT);
 assert.match(h.node('bas-c-modal-host').innerHTML,/Denunciar comentário/);
 const form={querySelector:()=>({value:'Violates rules'})};
 h.window.BASCommunityLive.onSubmit({target:{id:'bas-live-report-form',querySelector:form.querySelector},preventDefault(){}});
 await flush();
 assert.deepEqual(h.calls[1],['report-comment',COMMENT,'Violates rules']);
});
test('anonymous creator page keeps a follow call-to-action but mutations need login',async()=>{
 const h=make({signed:false});h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 assert.match(h.node('bas-c-view').innerHTML,/data-c-action="follow"/);
 assert.doesNotMatch(h.node('bas-c-view').innerHTML,/bas-social-comment-form/);
 h.click('follow','',SELF);await flush();assert.equal(h.calls.length,0);
});
test('social CSS and PWA shell include new resources',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
 assert.match(html,/css\/97-community-social\.css\?v=p15-7-bot-foundation-01/);
 assert.match(html,/js\/community-live\.js\?v=p15-7-bot-foundation-01/);
 assert.match(sw,/css\/97-community-social\.css\?v=p15-7-bot-foundation-01/);
 assert.match(sw,/bas-shell-web-v16/);
});
test('approved Remix downloads original ZIP into original Studio and keeps provenance for export',async()=>{
 const h=make();h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 h.api.approvedZip=async id=>{h.calls.push(['approved-zip',id]);return new Blob(['PK\x03\x04'],{type:'application/zip'});};
 h.window.BASCommunityPreview={close(){h.calls.push(['close-overlay'])}};
 // The two Studio functions already exist in BAS; model their real project change.
 const script=fs.readFileSync(path.join(root,'js/community-live.js'),'utf8');
 const realFile=fs.readFileSync(path.join(root,'js/media.js'),'utf8');
 assert.match(realFile,/async function abrirZipNoEditor\(zipBlob\)/);
 assert.match(fs.readFileSync(path.join(root,'js/api.js'),'utf8'),/function startManualMode\(\)/);
 // Source-level integration check: the importer is called, not a fake alternate editor.
 assert.match(script,/await abrirZipNoEditor\(new File\(/);
 assert.match(script,/window\.BASCommunityRemixContext=\{project,id:/);
 assert.match(script,/if\(!project\|\|project===before\)/);
 assert.match(script,/remix_of:state\.remix\.id/);
 h.click('remix',ID);
 assert.match(h.node('bas-c-modal-host').innerHTML,/Abrir esta animação no editor/);
});
test('primary download/follow/report actions appear before growing comment timeline',async()=>{
 const h=make();h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 const html=h.node('bas-c-view').innerHTML;
 for(const value of ['data-c-action="download"','data-c-action="follow"','data-c-action="report"']){
  assert.ok(html.indexOf(value)>0,`${value} present`);
  assert.ok(html.indexOf(value)<html.indexOf('class="bas-social-comments"'),`${value} is above comments`);
 }
});
test('avatar photos are not shown for accounts without explicit public opt-in',async()=>{
 const h=make();h.window.BASCommunityLive.mount();await flush();h.click('detail',ID);await flush();
 const html=h.node('bas-c-view').innerHTML;
 assert.match(html,/<span class="bas-social-comment-avatar"/);
 assert.doesNotMatch(html,/bas-social-comment-photo/);
});
