import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import worker from '../src/index.mjs';
const API='http://127.0.0.1:8788',SITE='http://127.0.0.1:8088',ADMIN='http://127.0.0.1:8090';
const SECRET='STAGING_SESSION_FAKE_0123456789_abcdefghij';
const ANIM='a'.repeat(32),BASE='b'.repeat(32);
function zipFixture(){
 function crc(bytes){let v=0xffffffff;for(const x of bytes){v^=x;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^0xffffffff)>>>0;}
 const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png,0);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(720,16);png.writeUInt32BE(1600,20);
 const entries=[{name:'desc.txt',data:Buffer.from('720 1600 30\np 1 0 part0\n')},{name:'part0/00000.png',data:png}];
 const locals=[],central=[];let off=0;
 for(const entry of entries){const filename=Buffer.from(entry.name),data=entry.data,c=crc(data);
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(c,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(filename.length,26);
  locals.push(l,filename,data);
  const h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt32LE(c,16);h.writeUInt32LE(data.length,20);h.writeUInt32LE(data.length,24);h.writeUInt16LE(filename.length,28);h.writeUInt32LE(off,42);central.push(h,filename);off+=l.length+filename.length+data.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...locals,dir,end]);
}
async function envSetup(t){
 const local=createLocalServer({memory:true});t.after(()=>local.database.close());
 const db=local.database;const objects=new Map();
 for(const [id,handle] of [['u1','author_55'],['u2','other_author']]){
  db.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)').run(id,handle,handle);
 }
 const tokens={u1:'A'.repeat(43),u2:'B'.repeat(43),admin:'C'.repeat(43)};
 for(const [who,token] of Object.entries(tokens)){
  const kind=who==='admin'?'admin':'bas',id=who==='admin'?'u1':who;
  db.prepare('INSERT INTO auth_sessions(session_hash,user_id,expires_at,client_kind) VALUES(?,?,?,?)')
   .run(createHash('sha256').update('session:'+token).digest('hex'),id,Math.floor(Date.now()/1000)+3600,kind);
 }
 db.prepare("INSERT INTO animations(id,owner_id,title,summary,status) VALUES(?,'u1','Old title','Old summary','draft')").run(ANIM);
 db.prepare("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES(?,?,1,'approved','quarantine/old.zip',?,1234,720,1600,30)")
  .run(BASE,ANIM,'b'.repeat(64));
 db.prepare("UPDATE animations SET status='published',published_version_id=?,published_at=unixepoch() WHERE id=?").run(BASE,ANIM);
 db.prepare("INSERT INTO animation_rights(animation_id,license,author_credit,allows_remix) VALUES(?,'CC-BY-4.0','Original author',1)").run(ANIM);
 db.prepare('INSERT INTO animation_search(animation_id,title_fold) VALUES(?,?)').run(ANIM,'old title');
 db.prepare('INSERT INTO animation_tags(animation_id,tag) VALUES(?,?)').run(ANIM,'old');
 objects.set('quarantine/old.zip',Buffer.from('original-zip-stub'));
 const env={DB:databaseBinding(db),PRIVATE_UPLOADS:{
  put:async(key,data)=>{objects.set(key,Buffer.from(data));},
  delete:async(key)=>objects.delete(key),
  get:async(key)=>{const data=objects.get(key);return data?{body:data}:null;}
 },
  PUBLISH_ENABLED:'true',PUBLISH_STAGING_APPROVED:'true',STORAGE_ENABLED:'true',UPLOAD_ENABLED:'true',
  PUBLIC_CATALOG_ENABLED:'false',BETA_CATALOG_ENABLED:'true',AUTH_ENABLED:'true',
  AUTH_DEPLOYMENT_APPROVED:'true',AUTH_PUBLIC_SIGNUP_APPROVED:'false',
  AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:SITE,BAS_LOCAL_CLIENT_ENABLED:'true',BAS_LOCAL_ORIGINS:SITE,
  ADMIN_PANEL_SEPARATED:'true',BAS_ADMIN_CLIENT_ENABLED:'true',BAS_ADMIN_ORIGIN:ADMIN,
  MODERATION_STAGING_APPROVED:'true',MODERATOR_USER_IDS:'u1',COMMUNITY_GUEST_READ_ENABLED:'true',
  STAGING_DOWNLOADS_APPROVED:'true',GITHUB_CLIENT_ID:'FAKE',GITHUB_CLIENT_SECRET:'TEST_PRIVATE_CLIENT_SECRET_123456',
  AUTH_PEPPER:'FAKE_PEPPER_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234',AUTH_SESSION_SECRET:SECRET};
 async function request(path,method='GET',body=null,who='u1',extra={}){
  const token=tokens[who]||'',origin=who==='admin'?ADMIN:SITE;
  const csrf=createHmac('sha256',SECRET).update('csrf:'+token).digest('hex');
  const headers={Origin:origin,'Authorization':'Bearer '+token,'X-CSRF-Token':csrf,...extra};
  if(body!==null&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const req=new Request(API+path,{method,headers,body:body===null?undefined:body});
  const res=await worker.fetch(req,env);
  return {status:res.status,data:res.headers.get('content-type')?.startsWith('application/json')?await res.json():await res.arrayBuffer()};
 }
 const meta={title:'Updated and reviewed',summary:'New summary with approval',tags:['fresh','design'],
  license:'CC-BY-SA-4.0',author_credit:'Own art',allows_remix:true,rights_confirmed:true,replace_zip:false};
 const propose=(m=meta,key='OWNER_REVISION_IDEMPOTENCY_00001',who='u1')=>request('/v1/publishing/animations/'+ANIM+'/revisions','POST',JSON.stringify(m),who,{'Idempotency-Key':key});
 return {db,env,objects,request,meta,propose};
}
test('owner metadata proposal is private, visible only after moderator approval, preserving old ZIP',async t=>{
 const x=await envSetup(t);
 const before=await x.request('/v1/beta/animations/'+ANIM);
 assert.equal(before.status,200);assert.equal(before.data.animation.title,'Old title');
 const create=await x.propose();assert.equal(create.status,201,JSON.stringify(create.data));
 assert.equal(create.data.status,'pending_review');
 const queue=await x.request('/v1/beta/moderation/queue','GET',null,'admin');
 assert.equal(queue.status,200,JSON.stringify(queue.data));
 assert.equal(queue.data.pending.length,1);
 assert.equal(queue.data.pending[0].review_kind,'revision');
 assert.equal(queue.data.pending[0].title,'Updated and reviewed');
 const repeat=await x.propose();assert.equal(repeat.status,200);
 assert.equal(repeat.data.revision_id,create.data.revision_id);
 const clash=await x.propose({...x.meta,title:'Attack'},'OWNER_REVISION_IDEMPOTENCY_00001');
 assert.equal(clash.status,409);
 assert.equal((await x.request('/v1/beta/animations/'+ANIM)).data.animation.title,'Old title');
 const approval=await x.request('/v1/beta/moderation/decision/'+ANIM,'POST',JSON.stringify({action:'approve'}),'admin');
 assert.equal(approval.status,200,JSON.stringify(approval.data));
 assert.equal(approval.data.revision_status,'approved');
 const after=await x.request('/v1/beta/animations/'+ANIM);assert.equal(after.status,200);
 assert.equal(after.data.animation.title,'Updated and reviewed');
 assert.deepEqual(after.data.animation.tags,['design','fresh']);
 assert.equal(after.data.animation.license,'CC-BY-SA-4.0');
 assert.equal(x.db.prepare('SELECT published_version_id FROM animations WHERE id=?').get(ANIM).published_version_id,BASE);
 const duplicate=await x.request('/v1/beta/moderation/decision/'+ANIM,'POST',JSON.stringify({action:'approve'}),'admin');
 assert.equal(duplicate.status,409);
});
test('author-only checks, cancellation, rejection and withdrawal revoke public catalog without deleting audit',async t=>{
 const x=await envSetup(t);
 assert.equal((await x.propose(x.meta,'OTHER_AUTHOR_00000001','u2')).status,404);
 const own=await x.request('/v1/publishing/animations');assert.equal(own.status,200);
 assert.equal(own.data.animations.length,1);assert.equal(own.data.animations[0].id,ANIM);
 const other=await x.request('/v1/publishing/animations','GET',null,'u2');assert.equal(other.data.animations.length,0);
 const proposal=await x.propose();assert.equal(proposal.status,201);
 assert.equal((await x.request('/v1/publishing/revisions/'+proposal.data.revision_id+'/cancel','POST','{}','u2')).status,409);
 assert.equal((await x.request('/v1/publishing/revisions/'+proposal.data.revision_id+'/cancel','POST','{}')).status,200);
 const again=await x.propose(x.meta,'SECOND_OWNER_REQUEST_00000001');assert.equal(again.status,201);
 const reject=await x.request('/v1/beta/moderation/decision/'+ANIM,'POST',JSON.stringify({action:'reject'}),'admin');
 assert.equal(reject.status,200);assert.equal(reject.data.revision_status,'rejected');
 assert.equal((await x.request('/v1/beta/animations/'+ANIM)).data.animation.title,'Old title');
 assert.equal((await x.request('/v1/publishing/animations/'+ANIM+'/remove','POST',JSON.stringify({confirm:true}),'u2')).status,404);
 assert.equal((await x.request('/v1/publishing/animations/'+ANIM+'/remove','POST',JSON.stringify({confirm:false}))).status,400);
 const remove=await x.request('/v1/publishing/animations/'+ANIM+'/remove','POST',JSON.stringify({confirm:true}));
 assert.equal(remove.status,200,JSON.stringify(remove.data));
 assert.equal((await x.request('/v1/beta/animations/'+ANIM)).status,404);
 assert.equal((await x.request('/v1/beta/downloads/'+ANIM)).status,404);
 assert.equal(x.db.prepare('SELECT count(*) AS n FROM moderation_events WHERE action=\'remove\'').get().n,1);
 assert.equal(x.objects.size,1,'private historical R2 should not be silently destroyed');
});
test('new ZIP is quarantined as next revision, kept hidden until approval then switched atomically',async t=>{
 const x=await envSetup(t),zip=zipFixture();
 const create=await x.propose({...x.meta,replace_zip:true,size_bytes:zip.length},'UPLOAD_REVISION_00000000000001');
 assert.equal(create.status,201,JSON.stringify(create.data));
 assert.equal(create.data.status,'awaiting_upload');
 const row=x.db.prepare('SELECT status FROM animations WHERE id=?').get(ANIM);assert.equal(row.status,'published');
 const uploaded=await x.request('/v1/publishing/revisions/'+create.data.revision_id+'/zip','PUT',zip,'u1',{'Content-Type':'application/zip'});
 assert.equal(uploaded.status,202,JSON.stringify(uploaded.data));
 assert.equal(uploaded.data.status,'pending_review');
 assert.equal(x.objects.size,2);
 assert.equal(x.db.prepare('SELECT count(*) AS n FROM animation_versions WHERE status=\'pending\'').get().n,1);
 const publicBefore=await x.request('/v1/beta/animations/'+ANIM);assert.equal(publicBefore.data.animation.title,'Old title');
 assert.equal(publicBefore.data.animation.width,720);
 const queue=await x.request('/v1/beta/moderation/queue','GET',null,'admin');
 const edit=queue.data.pending.find(item=>item.review_kind==='revision');
 assert.equal(edit.size_bytes,zip.length);
 const zipForAdmin=await x.request('/v1/beta/moderation/pending/'+ANIM+'/zip?edit='+edit.edit_id,'GET',null,'admin');
 assert.equal(zipForAdmin.status,200);
 const decision=await x.request('/v1/beta/moderation/decision/'+ANIM,'POST',JSON.stringify({action:'approve'}),'admin');
 assert.equal(decision.status,200,JSON.stringify(decision.data));
 const publicAfter=await x.request('/v1/beta/animations/'+ANIM);
 assert.equal(publicAfter.data.animation.width,720);
 assert.equal(publicAfter.data.animation.title,'Updated and reviewed');
 assert.notEqual(x.db.prepare('SELECT published_version_id AS id FROM animations WHERE id=?').get(ANIM).id,BASE);
 assert.equal(x.db.prepare('SELECT status FROM animation_versions WHERE id=?').get(BASE).status,'approved');
});

test('pending ZIP revision accepts only its author real bounded GIF; stores privately with budget',async t=>{
 const x=await envSetup(t);
 const zip=zipFixture();
 const changed={...x.meta,replace_zip:true,size_bytes:zip.length};
 const start=await x.propose(changed,'GIF_PREVIEW_REVISION_TEST_00001');
 assert.equal(start.status,201,JSON.stringify(start.data));
 const revisionId=start.data.revision_id;
 const upload=await x.request('/v1/publishing/revisions/'+revisionId+'/zip','PUT',zip,'u1',{'Content-Type':'application/zip'});
 assert.equal(upload.status,202,JSON.stringify(upload.data));
 const browser={window:{}};
 runInNewContext(readFileSync(new URL('../../js/community-gif.js',import.meta.url),'utf8'),browser);
 const pixels=new Uint8Array(64);pixels.fill(255);
 const gif=Buffer.from(browser.window.BASCommunityGif.encodeRGB332([pixels,pixels],4,4,10));
 const url='/v1/publishing/revisions/'+revisionId+'/preview';
 const bad=await x.request(url,'PUT',gif,'u2',{'Content-Type':'image/gif'});
 assert.equal(bad.status,404);
 const fake=await x.request(url,'PUT',Buffer.from('not a GIF'),'u1',{'Content-Type':'image/gif'});
 assert.equal(fake.status,422);
 const before=x.db.prepare('SELECT used_bytes FROM storage_budget WHERE id=1').get().used_bytes;
 const good=await x.request(url,'PUT',gif,'u1',{'Content-Type':'image/gif'});
 assert.equal(good.status,200,JSON.stringify(good.data));
 assert.equal(good.data.preview,'stored_privately');
 const version=x.db.prepare('SELECT version_id FROM owner_revisions WHERE id=?').get(revisionId).version_id;
 const key='previews/'+ANIM+'/'+version+'.gif';
 assert.equal(x.db.prepare('SELECT preview_key FROM animation_versions WHERE id=?').get(version).preview_key,key);
 assert.equal(x.objects.get(key)?.length,gif.length);
 assert.equal(x.db.prepare('SELECT used_bytes FROM storage_budget WHERE id=1').get().used_bytes,before+gif.length);
 const duplicate=await x.request(url,'PUT',gif,'u1',{'Content-Type':'image/gif'});
 assert.equal(duplicate.status,409);
 const tooBig=await x.request(url,'PUT',Buffer.alloc(2*1024*1024+1),'u1',{'Content-Type':'image/gif'});
 assert.equal(tooBig.status,409); // already attached; no additional R2 bytes
});
