import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import worker from '../src/index.mjs';
const API='http://127.0.0.1:8788',SITE='http://127.0.0.1:8088',ADMIN='http://127.0.0.1:8090';
const SECRET='STAGING_SOCIAL_TEST_SESSION_0123456789_abcdefghij';
const A='a'.repeat(32),B='b'.repeat(32);
async function make(t){
 const local=createLocalServer({memory:true});t.after(()=>local.database.close());
 const db=local.database,tokens={owner:'A'.repeat(43),guest:'B'.repeat(43),admin:'C'.repeat(43)};
 for(const [id,handle] of [['u1','an_approved'],['u2','social_viewer']])
  db.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)').run(id,handle,handle);
 for(const [role,token] of Object.entries(tokens)){
  const uid=role==='guest'?'u2':'u1';
  db.prepare('INSERT INTO auth_sessions(session_hash,user_id,expires_at,client_kind) VALUES(?,?,?,?)')
   .run(createHash('sha256').update('session:'+token).digest('hex'),uid,Math.floor(Date.now()/1000)+3600,role==='admin'?'admin':'bas');
 }
 db.prepare("INSERT INTO animations(id,owner_id,title,summary,status) VALUES(?,'u1','Anime rocket','Hello','draft')").run(A);
 db.prepare("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES(?,?,1,'approved','original.zip',?,200,900,2000,30)")
  .run(B,A,'e'.repeat(64));
 db.prepare("UPDATE animations SET status='published',published_version_id=?,published_at=unixepoch() WHERE id=?").run(B,A);
 db.prepare("INSERT INTO animation_rights(animation_id,license,author_credit,allows_remix) VALUES(?,'CC-BY-SA-4.0','Author',1)").run(A);
 db.prepare('INSERT INTO animation_search(animation_id,title_fold) VALUES(?,?)').run(A,'anime rocket');
 const env={DB:databaseBinding(db),AUTH_ENABLED:'true',AUTH_DEPLOYMENT_APPROVED:'true',
  PUBLIC_CATALOG_ENABLED:'false',BETA_CATALOG_ENABLED:'true',AUTH_PUBLIC_SIGNUP_APPROVED:'false',
  AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:SITE,BAS_LOCAL_CLIENT_ENABLED:'true',BAS_LOCAL_ORIGINS:SITE,
  AUTH_PEPPER:'SOCIAL_PEPPER_abcdefghijklmnopqrstuvwxyz1234',AUTH_SESSION_SECRET:SECRET,
  GITHUB_CLIENT_ID:'TEST',GITHUB_CLIENT_SECRET:'EXAMPLE_TEST_SECRET_123456789',
  ADMIN_PANEL_SEPARATED:'true',BAS_ADMIN_CLIENT_ENABLED:'true',BAS_ADMIN_ORIGIN:ADMIN,
  MODERATION_STAGING_APPROVED:'true',MODERATOR_USER_IDS:'u1',COMMUNITY_GUEST_READ_ENABLED:'true'};
 async function req(path,method='GET',data,role='guest',opts={}){
  const token=tokens[role],headers={Origin:role==='admin'?ADMIN:SITE};
  if(!opts.anonymous){headers.Authorization='Bearer '+token;headers['X-CSRF-Token']=createHmac('sha256',SECRET).update('csrf:'+token).digest('hex');}
  const body=data===undefined?undefined:JSON.stringify(data);
  if(body)headers['Content-Type']='application/json';
  const response=await worker.fetch(new Request(API+path,{method,headers,body}),env);
  return {status:response.status,data:await response.json()};
 }
 return {db,env,req};
}
test('guest can read approved social detail but cannot mutate',async t=>{
 const x=await make(t);
 const info=await x.req('/v1/social/animations/'+A,'GET',undefined,'guest',{anonymous:true});
 assert.equal(info.status,200,JSON.stringify(info.data));
 assert.equal(info.data.can_remix,true);assert.equal(info.data.comments_count,0);
 assert.equal((await x.req('/v1/social/animations/'+A+'/like','PUT',undefined,'guest',{anonymous:true})).status,403);
 assert.equal((await x.req('/v1/social/creators/an_approved','GET',undefined,'guest',{anonymous:true})).status,200);
 assert.equal((await x.req('/v1/social/animations/'+B,'GET',undefined,'guest',{anonymous:true})).status,404);
});
test('likes are idempotent, maintain canonical counters, and cannot touch hidden posts',async t=>{
 const x=await make(t),url='/v1/social/animations/'+A+'/like';
 assert.equal((await x.req(url,'PUT')).status,200);assert.equal((await x.req(url,'PUT')).status,200);
 assert.equal(x.db.prepare('SELECT like_count FROM animations WHERE id=?').get(A).like_count,1);
 assert.equal((await x.req(url,'DELETE')).status,200);
 assert.equal((await x.req(url,'DELETE')).status,200);
 assert.equal(x.db.prepare('SELECT like_count FROM animations WHERE id=?').get(A).like_count,0);
 x.db.prepare("UPDATE animations SET status='hidden' WHERE id=?").run(A);
 assert.equal((await x.req(url,'PUT')).status,404);
});
test('follow creator from publication and profile; disallow self-follow',async t=>{
 const x=await make(t),url='/v1/social/creators/an_approved/follow';
 assert.equal((await x.req(url,'PUT')).status,200);
 assert.equal((await x.req(url,'PUT')).status,200);
 assert.equal((await x.req('/v1/social/creators/an_approved')).data.followers,1);
 assert.equal((await x.req(url,'PUT',undefined,'owner')).status,409);
 assert.equal((await x.req(url,'DELETE')).status,200);
 assert.equal((await x.req('/v1/social/creators/an_approved')).data.followers,0);
});
test('text + emoji comments, blocked attachments and no HTML execution',async t=>{
 const x=await make(t),url='/v1/social/animations/'+A+'/comments';
 for(const payload of [{text:' '},{text:'hi',image:'evil.png'},{text:'ok',video:'https://example.com/a.mp4'},
  {text:'😺'.repeat(601)},{text:'a\u0000b'}]){
  assert.equal((await x.req(url,'POST',payload)).status,400);
 }
 const res=await x.req(url,'POST',{text:'<img src=x onerror=alert(1)> Olá 😺'});
 assert.equal(res.status,201,JSON.stringify(res.data));
 const listing=await x.req('/v1/social/animations/'+A);
 assert.equal(listing.data.comments_count,1);
 assert.equal(listing.data.comments[0].content,'<img src=x onerror=alert(1)> Olá 😺');
 assert.equal((await x.req(url,'POST',{text:'spam again'})).status,429);
});
test('comment likes are idempotent; reports require reason and moderator decision hides comment',async t=>{
 const x=await make(t);
 const created=await x.req('/v1/social/animations/'+A+'/comments','POST',{text:'Hi 🌙'},'owner');
 assert.equal(created.status,201);const id=created.data.id;
 const like='/v1/social/comments/'+id+'/like';
 assert.equal((await x.req(like,'PUT')).status,200);
 assert.equal((await x.req(like,'PUT')).data.likes,1);
 assert.equal((await x.req(like,'DELETE')).data.likes,0);
 const reports='/v1/social/comments/'+id+'/reports';
 assert.equal((await x.req(reports,'POST',{reason:'Spam links'})).status,201);
 assert.equal((await x.req(reports,'POST',{reason:'Spam links'})).status,409);
 assert.equal((await x.req(reports,'POST',{reason:'Spam links'},'owner')).status,409);
 const queue=await x.req('/v1/beta/moderation/queue','GET',undefined,'admin');
 assert.equal(queue.status,200,JSON.stringify(queue.data));
 assert.equal(queue.data.comment_reports.length,1);
 const repId=queue.data.comment_reports[0].id;
 assert.equal((await x.req('/v1/beta/moderation/comments/'+repId,'POST',{action:'hide'},'admin')).status,200);
 const info=await x.req('/v1/social/animations/'+A);
 assert.equal(info.data.comments_count,0);
 assert.equal((await x.req(like,'PUT')).status,404);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM moderation_events WHERE action=\'hide\'').get().n,1);
});
test('remix must use an approved license and preserve ShareAlike',async t=>{
 const x=await make(t);
 x.env.PUBLISH_ENABLED='true';x.env.PUBLISH_STAGING_APPROVED='true';
 x.env.UPLOAD_ENABLED='true';x.env.STORAGE_ENABLED='true';
 x.env.PRIVATE_UPLOADS={put:async()=>{},delete:async()=>{},get:async()=>null};
 const meta={source:'editor',title:'Remix of rocket',summary:'Different colors',tags:[],
  license:'CC-BY-4.0',author_credit:'Remixer · @an_approved',allows_remix:true,rights_confirmed:true,
  filename:'bootanimation.zip',size_bytes:2048,remix_of:A};
 const url='/v1/publishing/drafts';
 const makeFirst=async()=>{
  const token='B'.repeat(43),headers={Origin:SITE,Authorization:'Bearer '+token,
   'X-CSRF-Token':createHmac('sha256',SECRET).update('csrf:'+token).digest('hex'),
   'Idempotency-Key':'SOCIAL_REMIX_123456789ABCD','Content-Type':'application/json'};
  const r=await worker.fetch(new Request(API+url,{method:'POST',headers,body:JSON.stringify(meta)}),x.env);
  return r.status;
 };
 assert.equal(await makeFirst(),409);
 // Allow exact ShareAlike license while preserving the original link.
 meta.license='CC-BY-SA-4.0';
 const makeRequest=async(p,who='guest',h={})=>{
  const token=who==='guest'?'B'.repeat(43):'A'.repeat(43);
  const header={Origin:SITE,Authorization:'Bearer '+token,
   'X-CSRF-Token':createHmac('sha256',SECRET).update('csrf:'+token).digest('hex'),
   'Idempotency-Key':'SOCIAL_REMIX_123456789ABCD','Content-Type':'application/json',...h};
  const r=await worker.fetch(new Request(API+p,{method:'POST',headers:header,body:JSON.stringify(meta)}),x.env);
  return {status:r.status,data:await r.json()};
 };
 // An adaptation needs explicit original attribution, not just a matching license.
 meta.author_credit='Remixer without attribution';
 assert.equal((await makeRequest(url)).status,409);
 meta.author_credit='Remixer · @an_approved';
 const accepted=await makeRequest(url);
 assert.equal(accepted.status,201,JSON.stringify(accepted.data));
 const row=x.db.prepare('SELECT source_animation_id,source_license FROM animation_remixes').get();
 assert.equal(row.source_animation_id,A);assert.equal(row.source_license,'CC-BY-SA-4.0');
 const detail=await x.req('/v1/beta/animations/'+A);
 assert.equal(detail.status,200);
 // Refuse future remixes if the owner removes permission for new adaptations.
 x.db.prepare("UPDATE animation_rights SET license='all-rights-reserved',allows_remix=0 WHERE animation_id=?").run(A);
 assert.equal((await makeRequest(url,'guest',{'Idempotency-Key':'SOCIAL_REMIX_2_123456789'})).status,403);
});
test('avatar is private by default and only public after explicit authenticated opt-in',async t=>{
 const x=await make(t);
 x.db.prepare("INSERT INTO creator_media(id,owner_id,kind,object_key,status) VALUES(?,?,?,'creator-private/u1/avatar/0123456789abcdef0123456789abcdef.webp','processing')")
  .run('d'.repeat(32),'u1','avatar');
 x.db.prepare("UPDATE creator_media SET status='active',size_bytes=? WHERE id=?").run(88,'d'.repeat(32));
 x.db.prepare("INSERT INTO creator_media_current(user_id,kind,media_id) VALUES(?,?,?)")
  .run('u1','avatar','d'.repeat(32));
 const bytes=Buffer.from('RIFF0123WEBP '+'x'.repeat(100));
 x.env.PRIVATE_UPLOADS={get:async()=>({size:bytes.length,body:new Blob([bytes]).stream()})};
 let status=await x.req('/v1/social/avatars/an_approved','GET',undefined,'guest',{anonymous:true});
 assert.equal(status.status,404);
 const url='/v1/social/me/avatar-visibility';
 assert.equal((await x.req(url,'PUT',{visible:true},'owner')).status,200);
 assert.equal(x.db.prepare('SELECT avatar_public FROM community_users WHERE id=?').get('u1').avatar_public,1);
 const social=await x.req('/v1/social/animations/'+A);
 assert.equal(social.data.creator_avatar_public,true);
 const headers={Origin:SITE};
 const raw=await worker.fetch(new Request(API+'/v1/social/avatars/an_approved',{headers}),x.env);
 assert.equal(raw.status,200);
 assert.equal(raw.headers.get('content-type'),'image/webp');
 assert.equal((await raw.arrayBuffer()).byteLength,bytes.length);
 assert.equal((await x.req(url,'PUT',{visible:false},'owner')).status,200);
 assert.equal((await x.req('/v1/social/avatars/an_approved','GET',undefined,'guest',{anonymous:true})).status,404);
 assert.equal((await x.req(url,'PUT',{visible:'yes'},'owner')).status,400);
 assert.equal((await x.req(url,'PUT',{visible:true},'guest',{anonymous:true})).status,403);
});
