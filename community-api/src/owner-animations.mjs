/* BAS P15.7: signed-in author ownership actions. Staging only.
 * Approved content stays visible until an owner edit is approved; the
 * owner can withdraw a publication immediately (audited soft delete).
 * R2 stays private and historical bytes require separate operator GC.
 */
import {publishingReady,readJson,validateMetadata,randomId,hash,timestamp,
  reserveR2Write,boundedZip} from './publishing.mjs';
import {verifyPublisher,verifyPrivateProfileReader} from './auth.mjs';
import {validateArchive,ArchiveRejected} from './worker-zip.mjs';
import {foldSearch} from './search-tags.mjs';
const ID=/^[0-9a-f]{32}$/;
const HEADERS={'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, private','Content-Security-Policy':"default-src 'none'",
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const send=(status,body)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const fail=(status,code)=>send(status,{error:code});
const validKey=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{16,64}$/.test(s);
function parseRevisionInput(data){
 if(!data||Object.keys(data).some(k=>!['title','summary','tags','license','author_credit',
  'allows_remix','rights_confirmed','replace_zip','size_bytes'].includes(k))||
  typeof data.replace_zip!=='boolean')return null;
 const zip=data.replace_zip;
 if(zip!==Object.hasOwn(data,'size_bytes'))return null;
 const meta=validateMetadata({source:'zip',filename:'bootanimation.zip',
  size_bytes:zip?data.size_bytes:1,title:data.title,summary:data.summary,
  tags:data.tags,license:data.license,author_credit:data.author_credit,
  allows_remix:data.allows_remix,rights_confirmed:data.rights_confirmed});
 return meta?.blocked?null:meta;
}
async function listOwned(env,user){
 try{
  const rows=(await env.DB.prepare(
   'SELECT a.id,a.title,a.summary,a.category,a.status,a.created_at,a.updated_at,'+
   'a.published_at,COALESCE(v.id,rv.id) AS version_id,'+
   'COALESCE(v.fps,rv.fps) AS fps,COALESCE(v.width,rv.width) AS width,'+
   'COALESCE(v.height,rv.height) AS height,r.license,r.author_credit,'+
   "(SELECT me.reason FROM moderation_events me WHERE me.animation_id=a.id "+
   "AND me.action='reject' AND me.version_id=d.version_id "+
   "ORDER BY me.occurred_at DESC LIMIT 1) AS rejection_reason,"+
   "(SELECT CASE WHEN instr(me.reason,': ')>0 THEN substr(me.reason,instr(me.reason,': ')+2) ELSE '' END " +
   "FROM moderation_events me WHERE me.animation_id=a.id AND me.action='reject' " +
   "AND me.reason LIKE 'owner revision %' ORDER BY me.occurred_at DESC LIMIT 1) AS rejected_revision_reason,"+
   "(SELECT COALESCE(json_group_array(tag),'[]') FROM animation_tags t WHERE t.animation_id=a.id) AS tags_json,"+
   'e.id AS edit_id,e.status AS edit_status FROM animations a '+
   'LEFT JOIN animation_versions v ON v.id=a.published_version_id '+
   'LEFT JOIN publication_drafts d ON d.animation_id=a.id '+
   'LEFT JOIN animation_versions rv ON rv.id=d.version_id '+
   'LEFT JOIN animation_rights r ON r.animation_id=a.id '+
   "LEFT JOIN owner_revisions e ON e.animation_id=a.id AND e.status IN ('awaiting_upload','processing','pending_review') "+
   "WHERE a.owner_id=? AND a.status!='removed' ORDER BY a.created_at DESC LIMIT 50"
  ).bind(user.userId).all()).results||[];
  return send(200,{animations:rows.map(r=>({id:r.id,title:r.title,summary:r.summary,
   category:r.category,status:r.status,created_at:r.created_at,updated_at:r.updated_at,
   published_at:r.published_at,version_id:r.version_id,width:r.width,height:r.height,fps:r.fps,
   license:r.license,author_credit:r.author_credit,tags:JSON.parse(r.tags_json||'[]'),
   edit_id:r.edit_id,edit_status:r.edit_status,
   rejection_reason:r.status==='rejected'?r.rejection_reason||'':null,
   rejected_revision_reason:r.rejected_revision_reason||null}))});
 }catch(_){return fail(503,'owner_catalog_unavailable');}
}
// A rejected archive is readable only by its original signed-in author.
// This never exposes object_key or grants access to a different creator.
async function rejectedAuthorZip(env,user,animationId){
 if(!ID.test(animationId))return fail(404,'not_found');
 const row=await env.DB.prepare(
  'SELECT v.object_key,v.size_bytes FROM animations a '+
  'JOIN publication_drafts d ON d.animation_id=a.id '+
  'JOIN animation_versions v ON v.id=d.version_id '+
  "WHERE a.id=? AND a.owner_id=? AND a.status='rejected' AND v.status='rejected' LIMIT 1"
 ).bind(animationId,user.userId).first();
 if(!row||!/^quarantine\/[a-f0-9]{32}\/[a-f0-9]{32}\.zip$/.test(row.object_key||'')||
   row.size_bytes<1||row.size_bytes>40*1024*1024)return fail(404,'not_found');
 const month=new Date().toISOString().slice(0,7);
 const allowed=await env.DB.prepare(
  'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,0,1) '+
  'ON CONFLICT(month) DO UPDATE SET class_b=class_b+1,updated_at=unixepoch() '+
  'WHERE class_b<5000 RETURNING class_b'
 ).bind(month).first();
 if(!allowed)return fail(429,'download_quota');
 const obj=await env.PRIVATE_UPLOADS.get(row.object_key);
 if(!obj?.body)return fail(503,'zip_unavailable');
 return new Response(obj.body,{status:200,headers:{
  'Content-Type':'application/zip','Cache-Control':'no-store, private',
  'Content-Disposition':'attachment; filename="bootanimation-rejected.zip"',
  'Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'
 }});
}
async function createRevision(request,env,user,animationId){
 if(!ID.test(animationId))return fail(404,'not_found');
 const key=request.headers.get('Idempotency-Key');
 if(!validKey(key))return fail(400,'idempotency_key_required');
 const data=await readJson(request,4096),meta=parseRevisionInput(data);
 if(!meta)return fail(400,'invalid_revision_metadata');
 const replacing=data.replace_zip;
 const idHash=await hash('edit:'+user.userId+':'+key);
 const requestHash=await hash(JSON.stringify({animationId,replacing,meta}));
 try{
  const existing=await env.DB.prepare('SELECT id,animation_id,status,request_hash FROM owner_revisions WHERE owner_id=? AND idempotency_hash=?')
   .bind(user.userId,idHash).first();
  if(existing)return existing.request_hash===requestHash&&existing.animation_id===animationId?
   send(200,{revision_id:existing.id,status:existing.status,review_required:true}):
   fail(409,'idempotency_conflict');
  const current=await env.DB.prepare(
   "SELECT a.published_version_id FROM animations a JOIN animation_versions v ON v.id=a.published_version_id "+
   "WHERE a.id=? AND a.owner_id=? AND a.status='published' AND v.status='approved' LIMIT 1"
  ).bind(animationId,user.userId).first();
  if(!current)return fail(404,'not_found_or_unpublished');
  // Revisions cannot silently relicense a remix or erase its original credit.
  const source=await env.DB.prepare(
   'SELECT m.source_license,u.handle FROM animation_remixes m '+
   'JOIN animations a ON a.id=m.source_animation_id '+
   'JOIN community_users u ON u.id=a.owner_id WHERE m.animation_id=? LIMIT 1'
  ).bind(animationId).first();
  if(source){
   if(source.source_license==='CC-BY-SA-4.0'&&meta.license!=='CC-BY-SA-4.0')
    return fail(409,'remix_sharealike_required');
   if(source.source_license==='CC-BY-4.0'&&!['CC-BY-4.0','CC-BY-SA-4.0'].includes(meta.license))
    return fail(409,'remix_attribution_required');
   if(['CC-BY-4.0','CC-BY-SA-4.0'].includes(source.source_license)&&
      !meta.author_credit.toLowerCase().includes('@'+source.handle.toLowerCase()))
    return fail(409,'remix_author_credit_required');
  }
  const revisionId=randomId(),reservationId=replacing?randomId():null,
    expires=replacing?timestamp()+900:null;
  const changes=[];
  if(replacing)changes.push(env.DB.prepare(
   "INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,?,'reserved',?,?)"
  ).bind(reservationId,user.userId,meta.size_bytes,idHash,expires));
  changes.push(env.DB.prepare(
   'INSERT INTO owner_revisions(id,animation_id,owner_id,base_version_id,status,'+
   'title,summary,category,license,author_credit,allows_remix,tags_json,'+
   'expected_bytes,reservation_id,expires_at,idempotency_hash,request_hash) '+
   'VALUES(?,?,?, ?,?, ?,?,?,?,?,?,?, ?,?,?,?,?)'
  ).bind(revisionId,animationId,user.userId,current.published_version_id,
   replacing?'awaiting_upload':'pending_review',meta.title,meta.summary,meta.category,
   meta.license,meta.author_credit,meta.allows_remix?1:0,JSON.stringify(meta.tags),
   replacing?meta.size_bytes:null,reservationId,expires,idHash,requestHash));
  if(!replacing)changes.push(env.DB.prepare(
   "INSERT INTO moderation_events(id,animation_id,action,reason) VALUES(?,?,'submit','owner metadata edit pending review')"
  ).bind(randomId(),animationId));
  await env.DB.batch(changes);
  return send(201,{revision_id:revisionId,status:replacing?'awaiting_upload':'pending_review',
   review_required:true,expires_at:expires});
 }catch(_){return fail(409,'edit_conflict_or_quota');}
}
async function failUpload(env,revision){
 try{
  await env.DB.batch([
   env.DB.prepare("UPDATE owner_revisions SET status='failed',updated_at=unixepoch() WHERE id=? AND status='processing'")
    .bind(revision.id),
   env.DB.prepare("UPDATE upload_reservations SET status='cancelled' WHERE id=? AND status='reserved'")
    .bind(revision.reservation_id)
  ]);
 }catch(_){/* private orphan object must be reconciled, never guest-readable */}
}
async function completeRevision(request,env,user,revisionId){
 if(!ID.test(revisionId))return fail(404,'not_found');
 let revision;
 try{
  revision=await env.DB.prepare(
   "UPDATE owner_revisions SET status='processing',updated_at=unixepoch() "+
   "WHERE id=? AND owner_id=? AND status='awaiting_upload' AND expires_at>? "+
   "AND EXISTS(SELECT 1 FROM animations a WHERE a.id=owner_revisions.animation_id "+
   "AND a.status='published' AND a.published_version_id=owner_revisions.base_version_id) "+
   'RETURNING id,animation_id,reservation_id,expected_bytes'
  ).bind(revisionId,user.userId,timestamp()).first();
 }catch(_){return fail(503,'revision_unavailable');}
 if(!revision)return fail(409,'revision_unavailable_or_claimed');
 const bytes=await boundedZip(request,revision.expected_bytes);
 if(!bytes){await failUpload(env,revision);return fail(400,'invalid_zip_upload');}
 let archive;
 try{archive=await validateArchive(bytes);}
 catch(e){await failUpload(env,revision);return fail(422,e instanceof ArchiveRejected?'zip_'+e.code:'zip_validation_unavailable');}
 const versionId=randomId(),key='quarantine/'+revision.animation_id+'/'+versionId+'.zip';
 try{
  await env.DB.prepare('UPDATE owner_revisions SET object_key=? WHERE id=? AND status=\'processing\'').bind(key,revisionId).run();
  await reserveR2Write(env);
  await env.PRIVATE_UPLOADS.put(key,bytes,{httpMetadata:{contentType:'application/zip'},
   customMetadata:{sha256:archive.sha256,source:'owner-revision',quarantine:'true'}});
 }catch(_){await failUpload(env,revision);return fail(503,'private_storage_unavailable');}
 try{
  const last=await env.DB.prepare('SELECT COALESCE(MAX(revision),0) AS n FROM animation_versions WHERE animation_id=?')
   .bind(revision.animation_id).first();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) '+
    "VALUES(?,?,?,'pending',?,?,?,?,?,?)")
    .bind(versionId,revision.animation_id,last.n+1,key,archive.sha256,archive.size_bytes,archive.width,archive.height,archive.fps),
   env.DB.prepare("UPDATE owner_revisions SET status='pending_review',version_id=?,updated_at=unixepoch() "+
    "WHERE id=? AND status='processing'").bind(versionId,revisionId),
   env.DB.prepare("UPDATE upload_reservations SET status='committed' WHERE id=? AND status='reserved'")
    .bind(revision.reservation_id),
   env.DB.prepare("INSERT INTO moderation_events(id,animation_id,version_id,action,reason) VALUES(?,?,?,'submit','owner ZIP revision pending review')")
    .bind(randomId(),revision.animation_id,versionId)
  ]);
 }catch(_){
  // Only delete the new private object when the DB commit failed.
  try{await reserveR2Write(env);await env.PRIVATE_UPLOADS.delete(key);
   await env.DB.prepare('UPDATE owner_revisions SET object_key=NULL WHERE id=?').bind(revisionId).run();}
  catch(_){/* leave audit trail to recover */}
  await failUpload(env,revision);return fail(503,'revision_commit_failed');
 }
 return send(202,{revision_id:revisionId,status:'pending_review',review_required:true,
  archive:{width:archive.width,height:archive.height,fps:archive.fps}});
}
async function cancelRevision(env,user,id){
 if(!ID.test(id))return fail(404,'not_found');
 const rev=await env.DB.prepare(
  "SELECT id,animation_id,status,reservation_id,version_id FROM owner_revisions "+
  "WHERE id=? AND owner_id=? AND status IN ('awaiting_upload','pending_review') LIMIT 1"
 ).bind(id,user.userId).first();
 if(!rev)return fail(409,'revision_not_cancellable');
 try{
  const batch=[env.DB.prepare("UPDATE owner_revisions SET status='cancelled',updated_at=unixepoch() "+
    "WHERE id=? AND owner_id=? AND status=?").bind(id,user.userId,rev.status)];
  if(rev.status==='awaiting_upload')batch.push(env.DB.prepare(
   "UPDATE upload_reservations SET status='cancelled' WHERE id=? AND status='reserved'")
   .bind(rev.reservation_id));
  if(rev.version_id)batch.push(env.DB.prepare(
   "UPDATE animation_versions SET status='rejected',reviewed_at=unixepoch() WHERE id=? AND status='pending'")
   .bind(rev.version_id));
  batch.push(env.DB.prepare("INSERT INTO moderation_events(id,animation_id,version_id,action,reason) VALUES(?,?,?,'reject','owner cancelled edit')")
   .bind(randomId(),rev.animation_id,rev.version_id));
  await env.DB.batch(batch);
  return send(200,{revision_id:id,status:'cancelled'});
 }catch(_){return fail(409,'revision_cancel_conflict');}
}
async function withdraw(request,env,user,animationId){
 if(!ID.test(animationId))return fail(404,'not_found');
 const payload=await readJson(request,256);
 if(!payload||payload.confirm!==true||Object.keys(payload).length!==1)return fail(400,'confirmation_required');
 try{
  const row=await env.DB.prepare(
   "SELECT id,status FROM animations WHERE id=? AND owner_id=? AND status IN ('published','hidden','pending','rejected') LIMIT 1"
  ).bind(animationId,user.userId).first();
  if(!row)return fail(404,'not_found_or_withdrawn');
  const edits=(await env.DB.prepare(
   "SELECT id,version_id,reservation_id,status FROM owner_revisions WHERE animation_id=? "+
   "AND status IN ('awaiting_upload','processing','pending_review')"
  ).bind(animationId).all()).results||[];
  if(edits.some(r=>r.status==='processing'))return fail(409,'upload_in_progress');
  const batch=[env.DB.prepare(
   "UPDATE animations SET status='removed',updated_at=unixepoch() WHERE id=? AND owner_id=? "+
   "AND status IN ('published','hidden','pending','rejected')"
  ).bind(animationId,user.userId)];
  for(const edit of edits){
   batch.push(env.DB.prepare("UPDATE owner_revisions SET status='cancelled',updated_at=unixepoch() WHERE id=? AND status=?")
    .bind(edit.id,edit.status));
   if(edit.status==='awaiting_upload')batch.push(env.DB.prepare(
    "UPDATE upload_reservations SET status='cancelled' WHERE id=? AND status='reserved'")
    .bind(edit.reservation_id));
   if(edit.version_id)batch.push(env.DB.prepare(
    "UPDATE animation_versions SET status='rejected',reviewed_at=unixepoch() WHERE id=? AND status='pending'")
    .bind(edit.version_id));
  }
  batch.push(env.DB.prepare(
   "INSERT INTO moderation_events(id,animation_id,action,reason) VALUES(?,?,'remove','withdrawn by author')"
  ).bind(randomId(),animationId));
  await env.DB.batch(batch);
  return send(200,{animation_id:animationId,status:'removed',archive_retained_privately:true});
 }catch(_){return fail(409,'withdraw_conflict');}
}
export async function handleOwnerAnimations(request,env,url){
 const path=url.pathname,method=request.method;
 if(!path.startsWith('/v1/publishing/animations')&& !path.startsWith('/v1/publishing/revisions/'))return null;
 if(!publishingReady(env)||env.BETA_CATALOG_ENABLED!=='true')return fail(503,'owner_management_unavailable');
 if(url.origin!==env.AUTH_API_ORIGIN)return fail(403,'origin_mismatch');
 if(method==='OPTIONS')return new Response(null,{status:204});
 let identity;
 try{identity=method==='GET'?await verifyPrivateProfileReader(request,env):await verifyPublisher(request,env);}
 catch(_){return fail(503,'authentication_unavailable');}
 if(!identity||identity.clientKind!=='bas')return fail(403,'not_authorized');
 try{
  if(path==='/v1/publishing/animations'&&method==='GET')return listOwned(env,identity);
  const rejected=/^\/v1\/publishing\/animations\/([a-f0-9]{32})\/rejected\/zip$/.exec(path);
  if(rejected&&method==='GET')return rejectedAuthorZip(env,identity,rejected[1]);
  const revision=/^\/v1\/publishing\/animations\/([a-f0-9]{32})\/revisions$/.exec(path);
  if(revision&&method==='POST')return createRevision(request,env,identity,revision[1]);
  const removed=/^\/v1\/publishing\/animations\/([a-f0-9]{32})\/remove$/.exec(path);
  if(removed&&method==='POST')return withdraw(request,env,identity,removed[1]);
  const zip=/^\/v1\/publishing\/revisions\/([a-f0-9]{32})\/zip$/.exec(path);
  if(zip&&method==='PUT')return completeRevision(request,env,identity,zip[1]);
  const cancel=/^\/v1\/publishing\/revisions\/([a-f0-9]{32})\/cancel$/.exec(path);
  if(cancel&&method==='POST')return cancelRevision(env,identity,cancel[1]);
 }catch(_){return fail(503,'owner_management_unavailable');}
 return fail(404,'not_found');
}
