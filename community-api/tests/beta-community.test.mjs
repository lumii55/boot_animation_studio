import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import worker from '../src/index.mjs';
import {foldSearch,normalizeTags} from '../src/search-tags.mjs';
const API='http://127.0.0.1:8788',SECRET='TEST_SESSION_SECRET_12345678901234567890',COOKIE='A'.repeat(43);
const uid='test-moderator-creator',id=n=>n.toString(16).padStart(32,'0');
const sessionHash=createHash('sha256').update('session:'+COOKIE).digest('hex');
const csrf=createHmac('sha256',SECRET).update('csrf:'+COOKIE).digest('hex');
function setup(t){
 const local=createLocalServer({memory:true});t.after(()=>local.database.close());
 const db=local.database;
 db.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)').run(uid,'creator_luna','Creator Luna');
 db.prepare('INSERT INTO auth_sessions(session_hash,user_id,expires_at) VALUES(?,?,?)')
  .run(sessionHash,uid,Math.floor(Date.now()/1000)+3600);
 const files=new Map();
 const env={DB:databaseBinding(db),AUTH_ENABLED:'true',AUTH_DEPLOYMENT_APPROVED:'true',
  AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:API,AUTH_PUBLIC_SIGNUP_APPROVED:'false',
  GITHUB_CLIENT_ID:'Iv1_TEST',GITHUB_CLIENT_SECRET:'TEST_SECRET_123456789',
  AUTH_PEPPER:'TEST_PEPPER_12345678901234567890',AUTH_SESSION_SECRET:SECRET,
  BETA_CATALOG_ENABLED:'true',PUBLIC_CATALOG_ENABLED:'false',
  MODERATION_STAGING_APPROVED:'true',MODERATOR_USER_IDS:uid,
  STAGING_DOWNLOADS_APPROVED:'true',
  PRIVATE_UPLOADS:{async get(key){return files.get(key)?{body:new Blob([files.get(key)])}:null}}};
 async function req(path,method='GET',body=null,extra={}){
  const headers={Cookie:'__Host-bas_session='+COOKIE,...extra};
  if(method!=='GET'){headers.Origin=API;headers['X-CSRF-Token']=csrf;headers['Content-Type']='application/json';}
  const r=await worker.fetch(new Request(API+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
  const payload=r.headers.get('content-type')?.includes('application/json')?await r.json():null;
  return {status:r.status,body:payload,headers:r.headers};
 }
 function animation(num,title,tags,approved=false){
  const a=id(num),v=id(num+100),key='quarantine/'+a+'/'+v+'.zip';
  db.prepare("INSERT INTO animations(id,owner_id,title,summary,category,status) VALUES(?,?,?,'test','abstract','draft')")
   .run(a,uid,title);
  db.prepare("INSERT INTO animation_rights(animation_id,license,author_credit,allows_remix) VALUES(?,'CC-BY-4.0','Author',1)")
   .run(a);
  db.prepare('INSERT INTO animation_search(animation_id,title_fold) VALUES(?,?)').run(a,foldSearch(title));
  for(const tag of tags)db.prepare('INSERT INTO animation_tags(animation_id,tag) VALUES(?,?)').run(a,tag);
  if(approved){
   db.prepare("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES(?,?,1,'approved',?,?,1024,1080,2400,30)")
    .run(v,a,key,'a'.repeat(64));
   db.prepare("UPDATE animations SET status='published',published_version_id=?,published_at=unixepoch() WHERE id=?").run(v,a);
   files.set(key,new Uint8Array([80,75,3,4]));
  }
  return {a,v,key};
 }
 return {db,env,req,animation,files};
}
test('tag normalization handles accents, deduplication and invalid tokens',()=>{
 assert.deepEqual(normalizeTags(['Anime','animé','ONE_PIECE','luffy']),['anime','one_piece','luffy']);
 assert.equal(normalizeTags(Array(13).fill('x')),null);
 assert.equal(normalizeTags(['tag with space']),null);
 assert.equal(foldSearch('Animação do Luffy'),'animacao do luffy');
});
test('beta catalog searches approved titles and tags with case/accent folding',async t=>{
 const x=setup(t);
 x.animation(1,'Animação legal do Luffy',['anime','luffy'],true);
 x.animation(2,'Anime secreto PENDENTE',['anime'],false);
 for(const q of ['anime','Lu','LU','ANIMAÇÃO','luffy']){
  const r=await x.req('/v1/beta/catalog?q='+encodeURIComponent(q));
  assert.equal(r.status,200,q);
  assert.equal(r.body.items.length,1,q);
  assert.equal(r.body.items[0].title,'Animação legal do Luffy');
  assert.deepEqual(r.body.items[0].tags,['anime','luffy']);
  assert.equal(r.body.items[0].object_key,undefined);
 }
 assert.equal((await x.req('/v1/catalog')).status,503);
 assert.equal((await x.req('/v1/beta/animations/'+id(2))).status,404);
});
function pending(x,num,title,tags){
 const a=x.animation(num,title,tags,false),db=x.db;
 const reservation=id(num+200),draft=id(num+300),expires=Math.floor(Date.now()/1000)+900;
 db.prepare("INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,1024,'reserved',?,?)")
  .run(reservation,uid,id(num).repeat(2),expires);
 db.prepare("INSERT INTO publication_drafts(id,owner_id,animation_id,reservation_id,source,filename,expected_bytes,request_hash,expires_at) VALUES(?,?,?,?,'zip','bootanimation.zip',1024,?,?)")
  .run(draft,uid,a.a,reservation,id(num).repeat(2),expires);
 db.prepare("UPDATE publication_drafts SET status='processing' WHERE id=?").run(draft);
 db.prepare("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES(?,?,1,'pending',?,?,1024,1080,2400,30)")
  .run(a.v,a.a,a.key,'a'.repeat(64));
 db.prepare("UPDATE publication_drafts SET status='pending_review',version_id=? WHERE id=?").run(a.v,draft);
 db.prepare("UPDATE animations SET status='pending' WHERE id=?").run(a.a);
 db.prepare("UPDATE upload_reservations SET status='committed' WHERE id=?").run(reservation);
 x.files.set(a.key,new Uint8Array([80,75,3,4]));
 return a;
}
test('moderator approves and can hide/restore; catalog excludes hidden versions',async t=>{
 const x=setup(t),a=pending(x,3,'Moonlight original',['moon']);
 const q=await x.req('/v1/beta/moderation/queue');
 assert.equal(q.status,200,JSON.stringify(q.body));
 assert.equal(q.body.pending.length,1);
 x.env.MODERATOR_USER_IDS='different-id';
 assert.equal((await x.req('/v1/beta/moderation/queue')).status,403);
 x.env.MODERATOR_USER_IDS=uid;
 let r=await x.req('/v1/beta/moderation/decision/'+a.a,'POST',
  {action:'approve',reason:'Original content verified'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await x.req('/v1/beta/catalog?q=moon')).body.items.length,1);
 assert.equal((await x.req('/v1/beta/moderation/decision/'+a.a,'POST',
  {action:'approve',reason:'Duplicate approval'})).status,409);
 r=await x.req('/v1/beta/moderation/decision/'+a.a,'POST',
  {action:'hide',reason:'Additional review requested'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await x.req('/v1/beta/catalog?q=moon')).body.items.length,0);
 r=await x.req('/v1/beta/moderation/decision/'+a.a,'POST',
  {action:'restore',reason:'Checked and restored'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await x.req('/v1/beta/catalog?q=moon')).body.items.length,1);
 assert.equal(x.db.prepare('SELECT count(*) n FROM moderation_events WHERE moderator_id=?').get(uid).n,3);
});
test('report requires a real account and a published target, deduplicates',async t=>{
 const x=setup(t),a=x.animation(4,'Reportable',['example'],true),b=pending(x,5,'Private',['hidden']);
 assert.equal((await x.req('/v1/beta/reports','POST',{
  animation_id:b.a,reason:'Needs review'})).status,404);
 let r=await x.req('/v1/beta/reports','POST',{
  animation_id:a.a,reason:'Copyright concern'});
 assert.equal(r.status,201,JSON.stringify(r.body));
 r=await x.req('/v1/beta/reports','POST',{
  animation_id:a.a,reason:'Duplicate concern'});
 assert.equal(r.status,409);
 assert.equal((await x.req('/v1/beta/moderation/queue')).body.reports.length,1);
});
test('no cookie cannot read beta catalog, moderators or submit reports',async t=>{
 const x=setup(t),a=x.animation(6,'Example',['tag'],true);
 for(const path of ['/v1/beta/catalog','/v1/beta/downloads/'+a.a,'/v1/beta/moderation/queue']){
  const r=await x.req(path,'GET',null,{Cookie:''});
  assert.equal(r.status,403,path);
 }
 assert.equal((await x.req('/v1/beta/reports','POST',{
  animation_id:a.a,reason:'Cannot report anonymously'},{Cookie:''})).status,403);
 x.env.BETA_CATALOG_ENABLED='false';
 assert.equal((await x.req('/v1/beta/catalog')).status,404);
});
test('download requires approved version and is disabled independently',async t=>{
 const x=setup(t),a=x.animation(7,'Approved',['good'],true),b=pending(x,8,'Pending',['secret']);
 assert.equal((await x.req('/v1/beta/downloads/'+b.a)).status,404);
 const r=await worker.fetch(new Request(API+'/v1/beta/downloads/'+a.a,{
  headers:{Cookie:'__Host-bas_session='+COOKIE}}),x.env);
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/zip');
 assert.equal(r.headers.get('content-disposition'),'attachment; filename="bootanimation.zip"');
 x.env.STAGING_DOWNLOADS_APPROVED='false';
 assert.equal((await x.req('/v1/beta/downloads/'+a.a)).status,404);
});
test('Discord notification worker requires explicitly approved webhook',async t=>{
 const x=setup(t);
 const r=await x.req('/v1/beta/moderation/discord/dispatch','POST',{});
 assert.equal(r.status,503);assert.equal(r.body.error,'discord_not_configured');
});
test('moderator can dismiss a report with reason and cannot resolve twice',async t=>{
 const x=setup(t),a=x.animation(9,'Report dismissal example',['original'],true);
 const report=await x.req('/v1/beta/reports','POST',
  {animation_id:a.a,reason:'I think this needs a second look'});
 assert.equal(report.status,201);
 const result=await x.req('/v1/beta/moderation/reports/'+report.body.report_id,
  'POST',{action:'dismiss',reason:'Original work confirmed'});
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.status,'dismissed');
 assert.equal((await x.req('/v1/beta/moderation/queue')).body.reports.length,0);
 assert.equal((await x.req('/v1/beta/moderation/reports/'+report.body.report_id,
  'POST',{action:'dismiss',reason:'Repeated attempt'})).status,409);
});
test('rejected animation never becomes visible in beta search or downloads',async t=>{
 const x=setup(t),a=pending(x,10,'Rejected example',['blocked']);
 const decision=await x.req('/v1/beta/moderation/decision/'+a.a,
  'POST',{action:'reject',reason:'Invalid rights documentation'});
 assert.equal(decision.status,200,JSON.stringify(decision.body));
 assert.equal((await x.req('/v1/beta/catalog?q=blocked')).body.items.length,0);
 assert.equal((await x.req('/v1/beta/downloads/'+a.a)).status,404);
 assert.equal((await x.req('/v1/beta/moderation/decision/'+a.a,
  'POST',{action:'approve',reason:'Try to approve rejected'})).status,409);
});
