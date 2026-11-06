/* BAS P15.6 private, authenticated publishing API: disabled by default.
 * All sources funnel through same validation/quarantine pipeline.
 * Never serves R2 keys or downloadable objects. Never approves an upload.
 * Requires private R2, real auth, operator activation, and D1 schema 0001-0004.
 */
import { authConfigured, verifyPublisher, verifyPrivateProfileReader } from './auth.mjs';
import { validateArchive, ArchiveRejected, ARCHIVE_CAP_BYTES } from './worker-zip.mjs';
import {foldSearch,normalizeTags} from './search-tags.mjs';

const PREFIX='/v1/publishing';
const TITLES=new Set(['cosmos','neon','pixel','abstract','nature','minimal']);
const LICENSES=new Set(['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','all-rights-reserved']);
const SOURCES=new Set(['editor','zip','companion']);
const RESPONSE_HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, private',
  'Content-Security-Policy':"default-src 'none'",
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'
};
export function publishingReady(env){
  return env?.PUBLISH_ENABLED==='true' &&
    env?.PUBLISH_STAGING_APPROVED==='true' &&
    env?.STORAGE_ENABLED==='true' &&
    env?.UPLOAD_ENABLED==='true' &&
    env?.PUBLIC_CATALOG_ENABLED!=='true' &&
    authConfigured(env) &&
    typeof env?.DB?.prepare==='function' && typeof env?.DB?.batch==='function' &&
    typeof env?.PRIVATE_UPLOADS?.put==='function' &&
    typeof env?.PRIVATE_UPLOADS?.delete==='function';
}
function respond(request,env,status,payload){
  const headers=new Headers(RESPONSE_HEADERS);
  const origin=request.headers.get('Origin');
  if(origin&&origin===env.AUTH_SITE_ORIGIN){
    headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Credentials','true');
    headers.set('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Accept, Content-Type, X-CSRF-Token, Idempotency-Key');
  }
  return new Response(payload===null?null:JSON.stringify(payload),{status,headers});
}
function fail(req,env,code,status=400){return respond(req,env,status,{error:code});}
export function randomId(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function hash(input){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function timestamp(){return Math.floor(Date.now()/1000);}
function validText(s,min,max){
  return typeof s==='string' && [...s.trim()].length>=min && [...s.trim()].length<=max
    && !/[\x00-\x1f\x7f<>]/.test(s);
}
export async function readJson(request,max=4096){
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return null;
  const size=Number(request.headers.get('Content-Length')||'0');
  if(!Number.isFinite(size)||size>max||size<0||!request.body)return null;
  const reader=request.body.getReader(),chunks=[];let received=0;
  try{
    while(true){
      const item=await reader.read();if(item.done)break;
      received+=item.value.byteLength;
      if(received>max){await reader.cancel();return null;}
      chunks.push(item.value);
    }
    const buffer=new Uint8Array(received);let offset=0;
    for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
    const obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
    if(!obj||Array.isArray(obj)||typeof obj!=='object')return null;
    return obj;
  }catch(_){return null;}finally{try{reader.releaseLock();}catch(_){}}
}
export function validateMetadata(input,env){
  if(!input||typeof input!=='object')return null;
  const allowed=['source','title','summary','category','license','author_credit','allows_remix',
    'rights_confirmed','size_bytes','filename','companion_permission_confirmed','tags','remix_of'];
  if(Object.keys(input).some(k=>!allowed.includes(k)))return null;
  const source=input.source;
  if(!SOURCES.has(source))return null;
  if(!validText(input.title,3,100))return null;
  if(typeof input.summary!=='string'||[...input.summary].length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/.test(input.summary))return null;
  if(input.category!==undefined && !TITLES.has(input.category))return null;
  const tags=normalizeTags(input.tags??[]);
  if(!tags)return null;
  if(!LICENSES.has(input.license))return null;
  if(typeof input.author_credit!=='string'||[...input.author_credit].length>120||/[<>\x00-\x1f\x7f]/.test(input.author_credit))return null;
  if(typeof input.allows_remix!=='boolean'||input.rights_confirmed!==true)return null;
  if(input.license==='all-rights-reserved' && input.allows_remix)return null;
  if(input.license!=='all-rights-reserved' && !input.allows_remix)return null;
  if(!Number.isInteger(input.size_bytes)||input.size_bytes<1||input.size_bytes>ARCHIVE_CAP_BYTES)return null;
  if(typeof input.filename!=='string'||!/^[A-Za-z0-9_. -]{1,86}\.zip$/.test(input.filename))return null;
  // The cloud worker NEVER requests a file from a device. The already paired
  // local BAS bridge retrieves bytes only after the Android owner's approval.
  // This flag is a user attestation of *source provenance*, not device auth,
  // and cannot bypass session, CSRF, ZIP validation, rights or quota checks.
  if(source==='companion' && input.companion_permission_confirmed!==true)
    return {blocked:'companion_pairing_required'};
  if(source!=='companion' && Object.hasOwn(input,'companion_permission_confirmed'))return null;
  if(input.remix_of!==undefined&&(!/^[a-f0-9]{32}$/.test(input.remix_of)||source!=='editor'))return null;
  return {
    source,title:input.title.trim(),summary:input.summary.trim(),category:input.category||'abstract',
    license:input.license,author_credit:input.author_credit.trim(),allows_remix:input.allows_remix,
    size_bytes:input.size_bytes,filename:input.filename,tags,remix_of:input.remix_of||null
  };
}
export async function reserveR2Write(env){
  const month=new Date().toISOString().slice(0,7);
  const result=await env.DB.prepare(
    'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,1,0) '+
    'ON CONFLICT(month) DO UPDATE SET class_a=class_a+1,updated_at=unixepoch() '+
    'WHERE class_a<10000 RETURNING class_a'
  ).bind(month).first();
  if(!result)throw Error('r2_operation_cap');
}
async function createDraft(request,env,user){
  const idempotency=request.headers.get('Idempotency-Key');
  if(!idempotency||!/^[a-zA-Z0-9_-]{16,64}$/.test(idempotency))
    return fail(request,env,'idempotency_key_required',400);
  const raw=await readJson(request);
  const meta=validateMetadata(raw,env);
  if(meta?.blocked)return fail(request,env,meta.blocked,409);
  if(!meta)return fail(request,env,'invalid_metadata',400);
  // An adaptation must reference a real approved licensed source. A client flag is
  // never sufficient permission to remix or to loosen ShareAlike obligations.
  let remix=null;
  if(meta.remix_of){
    remix=await env.DB.prepare(
     'SELECT a.id,a.published_version_id,r.license,r.allows_remix,u.handle FROM animations a '+
     'JOIN community_users u ON u.id=a.owner_id '+
     'JOIN animation_rights r ON r.animation_id=a.id '+
     'JOIN animation_versions v ON v.id=a.published_version_id '+
     "WHERE a.id=? AND a.status='published' AND v.status='approved' LIMIT 1"
    ).bind(meta.remix_of).first();
    if(!remix||remix.allows_remix!==1||remix.license==='all-rights-reserved')
      return fail(request,env,'remix_not_permitted',403);
    if(remix.license==='CC-BY-SA-4.0'&&meta.license!=='CC-BY-SA-4.0')
      return fail(request,env,'remix_sharealike_required',409);
    if(remix.license==='CC-BY-4.0'&&!['CC-BY-4.0','CC-BY-SA-4.0'].includes(meta.license))
      return fail(request,env,'remix_attribution_required',409);
    if(['CC-BY-4.0','CC-BY-SA-4.0'].includes(remix.license)&&
       !meta.author_credit.toLowerCase().includes('@'+remix.handle.toLowerCase()))
      return fail(request,env,'remix_author_credit_required',409);
  }
  const keyHash=await hash('publish:'+user.userId+':'+idempotency);
  const requestHash=await hash(JSON.stringify(meta));
  const existing=await env.DB.prepare(
    'SELECT d.id,d.status,d.request_hash FROM publication_drafts d '+
    'JOIN upload_reservations r ON r.id=d.reservation_id '+
    'WHERE d.owner_id=? AND r.idempotency_hash=? LIMIT 1'
  ).bind(user.userId,keyHash).first();
  if(existing){
    if(existing.request_hash!==requestHash)return fail(request,env,'idempotency_conflict',409);
    return respond(request,env,200,{draft_id:existing.id,status:existing.status,source:meta.source});
  }
  // Distinguish storage saturation from an actual draft/idempotency conflict.
  // Never clean up historical R2 assets as a side effect of an upload.
  const storage=await env.DB.prepare(
   'SELECT used_bytes,reserved_bytes,cap_bytes FROM storage_budget WHERE id=1'
  ).bind().first();
  if(!storage)return fail(request,env,'storage_budget_unavailable',503);
  const remaining=Math.max(0,storage.cap_bytes-storage.used_bytes-storage.reserved_bytes);
  if(meta.size_bytes>remaining)return respond(request,env,409,{
   error:'storage_quota_exceeded',remaining_bytes:remaining,cap_bytes:storage.cap_bytes
  });
  const draftId=randomId(),animationId=randomId(),reservationId=randomId();
  const expires=timestamp()+900;
  try{
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO animations(id,owner_id,title,summary,category,status) VALUES(?,?,?,?,?,'draft')"
      ).bind(animationId,user.userId,meta.title,meta.summary,meta.category),
      env.DB.prepare(
        'INSERT INTO animation_search(animation_id,title_fold) VALUES(?,?)'
      ).bind(animationId,foldSearch(meta.title)),
      ...meta.tags.map(tag=>env.DB.prepare(
        'INSERT INTO animation_tags(animation_id,tag) VALUES(?,?)'
      ).bind(animationId,tag)),
      env.DB.prepare(
        'INSERT INTO animation_rights(animation_id,license,author_credit,allows_remix) VALUES(?,?,?,?)'
      ).bind(animationId,meta.license,meta.author_credit,meta.allows_remix?1:0),
      ...(remix?[env.DB.prepare(
       'INSERT INTO animation_remixes(animation_id,source_animation_id,source_version_id,source_license) VALUES(?,?,?,?)'
      ).bind(animationId,remix.id,remix.published_version_id,remix.license)]:[]),
      env.DB.prepare(
        "INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,?,'reserved',?,?)"
      ).bind(reservationId,user.userId,meta.size_bytes,keyHash,expires),
      env.DB.prepare(
        'INSERT INTO publication_drafts(id,owner_id,animation_id,reservation_id,source,filename,expected_bytes,request_hash,expires_at) '+
        'VALUES(?,?,?,?,?,?,?,?,?)'
      ).bind(draftId,user.userId,animationId,reservationId,meta.source,meta.filename,meta.size_bytes,requestHash,expires)
    ]);
  }catch(_){
    // A second concurrent writer can consume the budget after preflight.
    try{
      const latest=await env.DB.prepare(
       'SELECT used_bytes,reserved_bytes,cap_bytes FROM storage_budget WHERE id=1'
      ).bind().first();
      if(latest&&meta.size_bytes>latest.cap_bytes-latest.used_bytes-latest.reserved_bytes)
       return fail(request,env,'storage_quota_exceeded',409);
    }catch(_budgetError){}
    return fail(request,env,'draft_conflict',409);
  }
  return respond(request,env,201,{draft_id:draftId,status:'awaiting_upload',expires_at:expires,
    source:meta.source,max_bytes:meta.size_bytes,review_required:true});
}
export async function boundedZip(request,expected){
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/zip')return null;
  const length=request.headers.get('Content-Length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==expected))return null;
  if(!request.body)return null;
  const bytes=new Uint8Array(expected);
  const reader=request.body.getReader();let count=0;
  try{
    while(true){
      const next=await reader.read();if(next.done)break;
      if(count+next.value.byteLength>expected){await reader.cancel().catch(()=>{});return null;}
      bytes.set(next.value,count);count+=next.value.length;
    }
    return count===expected?bytes:null;
  }catch(_){return null;}finally{try{reader.releaseLock();}catch(_){}}
}
async function markFailed(env,draft){
  try{
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE publication_drafts SET status='failed',updated_at=unixepoch() WHERE id=? AND status='processing'"
      ).bind(draft.id),
      env.DB.prepare(
        "UPDATE upload_reservations SET status='cancelled' WHERE id=? AND status='reserved'"
      ).bind(draft.reservation_id)
    ]);
  }catch(_){/* Stay inaccessible; operator must reconcile the draft and ledger. */}
}
async function completeDraft(request,env,user,id){
  if(!/^[a-f0-9]{32}$/.test(id))return fail(request,env,'not_found',404);
  // Atomic claim ensures that simultaneous requests cannot duplicate an R2 put.
  let draft;
  try{
    draft=await env.DB.prepare(
      "UPDATE publication_drafts SET status='processing',updated_at=unixepoch() "+
      "WHERE id=? AND owner_id=? AND status='awaiting_upload' AND expires_at>? "+
      "RETURNING id,animation_id,reservation_id,source,expected_bytes"
    ).bind(id,user.userId,timestamp()).first();
  }catch(_){return fail(request,env,'draft_unavailable',503);}
  if(!draft)return fail(request,env,'draft_unavailable_or_claimed',409);
  const body=await boundedZip(request,draft.expected_bytes);
  if(!body){await markFailed(env,draft);return fail(request,env,'invalid_zip_upload',400);}
  let metadata;
  try{metadata=await validateArchive(body);}
  catch(e){await markFailed(env,draft);
    return fail(request,env,e instanceof ArchiveRejected?'zip_'+e.code:'zip_validation_unavailable',422);
  }
  const versionId=randomId();
  const objectKey='quarantine/'+draft.animation_id+'/'+versionId+'.zip';
  // Record intent before R2 write so orphaned objects are discoverable for manual recovery.
  try{
    await env.DB.prepare(
      "UPDATE publication_drafts SET object_key=? WHERE id=? AND status='processing'"
    ).bind(objectKey,id).run();
    await reserveR2Write(env);
    await env.PRIVATE_UPLOADS.put(objectKey,body,{
      httpMetadata:{contentType:'application/zip'},
      customMetadata:{sha256:metadata.sha256,source:draft.source,quarantine:'true'}
    });
  }catch(_){
    await markFailed(env,draft);
    return fail(request,env,'private_storage_unavailable',503);
  }
  try{
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) "+
        "VALUES(?,?,1,'pending',?,?,?,?,?,?)"
      ).bind(versionId,draft.animation_id,objectKey,metadata.sha256,metadata.size_bytes,metadata.width,metadata.height,metadata.fps),
      env.DB.prepare(
        "UPDATE animations SET status='pending',updated_at=unixepoch() WHERE id=? AND status='draft'"
      ).bind(draft.animation_id),
      env.DB.prepare(
        "UPDATE publication_drafts SET status='pending_review',version_id=?,updated_at=unixepoch() "+
        "WHERE id=? AND status='processing'"
      ).bind(versionId,id),
      env.DB.prepare(
        "INSERT INTO moderation_events(id,animation_id,version_id,action,reason) VALUES(?,?,?,'submit','pending review')"
      ).bind(randomId(),draft.animation_id,versionId),
      env.DB.prepare(
        "UPDATE upload_reservations SET status='committed' WHERE id=? AND status='reserved'"
      ).bind(draft.reservation_id)
    ]);
  }catch(_){
    // Never publish an orphan. Try private deletion and leave a recovery trail if it fails.
    try{
      await reserveR2Write(env);
      await env.PRIVATE_UPLOADS.delete(objectKey);
      await env.DB.prepare("UPDATE publication_drafts SET object_key=NULL WHERE id=?").bind(id).run();
    }catch(_){/* Keep object_key for private cleanup before enabling real traffic. */}
    await markFailed(env,draft);
    return fail(request,env,'publication_commit_failed',503);
  }
  return respond(request,env,202,{draft_id:id,status:'pending_review',source:draft.source,
    archive:{width:metadata.width,height:metadata.height,fps:metadata.fps,frames:metadata.frame_count},
    review_required:true});
}
async function cancelDraft(request,env,user,id){
  if(!/^[a-f0-9]{32}$/.test(id))return fail(request,env,'not_found',404);
  const existing=await env.DB.prepare(
    "UPDATE publication_drafts SET status='cancelled',updated_at=unixepoch() "+
    "WHERE id=? AND owner_id=? AND status='awaiting_upload' RETURNING reservation_id"
  ).bind(id,user.userId).first();
  if(!existing)return fail(request,env,'draft_unavailable_or_claimed',409);
  await env.DB.prepare("UPDATE upload_reservations SET status='cancelled' WHERE id=? AND status='reserved'").bind(existing.reservation_id).run();
  return respond(request,env,200,{draft_id:id,status:'cancelled'});
}
async function listDrafts(request,env,user){
  const items=await env.DB.prepare(
    "SELECT d.id,d.source,d.status,d.filename,d.expected_bytes,d.created_at,a.title,a.category,a.status AS animation_status "+
    "FROM publication_drafts d JOIN animations a ON a.id=d.animation_id "+
    "WHERE d.owner_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT 25"
  ).bind(user.userId).all();
  return respond(request,env,200,{drafts:(items.results||[]).map(row=>({
    draft_id:row.id,source:row.source,status:row.status,filename:row.filename,
    expected_bytes:row.expected_bytes,created_at:row.created_at,title:row.title,category:row.category,
    moderation_status:row.animation_status
  }))});
}
export async function handlePublishing(request,env,url){
  if(!url.pathname.startsWith(PREFIX))return null;
  if(!publishingReady(env))return fail(request,env,'publishing_unavailable',503);
  if(url.origin!==env.AUTH_API_ORIGIN)return fail(request,env,'origin_mismatch',403);
  if(request.method==='OPTIONS')return respond(request,env,204,null);
  let user;
  try{user=request.method==='GET' && url.pathname===PREFIX+'/drafts'
    ?await verifyPrivateProfileReader(request,env)
    :await verifyPublisher(request,env);}
  catch(_){return fail(request,env,'authentication_unavailable',503);}
  if(!user)return fail(request,env,'not_authorized',403);
  try{
    if(url.pathname===PREFIX+'/drafts'&&request.method==='POST')return createDraft(request,env,user);
    if(url.pathname===PREFIX+'/drafts'&&request.method==='GET')return listDrafts(request,env,user);
    const found=/^\/v1\/publishing\/drafts\/([a-zA-Z0-9]+)\/(zip|cancel)$/.exec(url.pathname);
    if(found&&request.method==='PUT'&&found[2]==='zip')return completeDraft(request,env,user,found[1]);
    if(found&&request.method==='POST'&&found[2]==='cancel')return cancelDraft(request,env,user,found[1]);
  }catch(_){return fail(request,env,'publishing_unavailable',503);}
  return fail(request,env,'not_found',404);
}
