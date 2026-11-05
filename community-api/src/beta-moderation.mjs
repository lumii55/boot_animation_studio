import {foldSearch} from './search-tags.mjs';
/* P15.7 private admin actions: ADMIN-scoped login, server RBAC, audited. */
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private',
  'Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'};
const send=(status,body)=>new Response(JSON.stringify(body),{status,headers:H});
const fail=(s,code)=>send(s,{error:code});
const uuid=()=>[...crypto.getRandomValues(new Uint8Array(16))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
const ID=/^[a-f0-9]{32}$/;
const valid=(s,min,max)=>typeof s==='string'&&[...s.trim()].length>=min&&
  [...s.trim()].length<=max&&!/[\u0000-\u001f\u007f<>]/.test(s);
// Administrator annotations are optional, but still validated if supplied.
// Ordinary user-submitted report reasons stay mandatory (5–500 chars).
const optionalAdminReason=s=>s===undefined||valid(s,0,500);
async function body(req){
 if(req.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return null;
 try{
  const text=await req.text();if(text.length>2048)return null;
  const data=JSON.parse(text);
  return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 }catch(_){return null;}
}
function isModerator(env,user,request){
 if(env.MODERATION_STAGING_APPROVED!=='true'||!user)return false;
 if(env.ADMIN_PANEL_SEPARATED==='true' &&
    (user.clientKind!=='admin'||request.headers.get('Origin')!==env.BAS_ADMIN_ORIGIN ||
     env.BAS_ADMIN_CLIENT_ENABLED!=='true'))return false;
 const ids=String(env.MODERATOR_USER_IDS||'').split(',').map(v=>v.trim()).filter(Boolean);
 return ids.length>0&&ids.includes(user.userId);
}
async function report(req,env,user){
 const data=await body(req);
 if(!data||!ID.test(data.animation_id)||!valid(data.reason,5,500)||
  Object.keys(data).some(k=>!['animation_id','reason'].includes(k)))
  return fail(400,'invalid_report');
 try{
  const exists=await env.DB.prepare("SELECT id FROM animations WHERE id=? AND status='published'")
   .bind(data.animation_id).first();
  if(!exists)return fail(404,'not_found');
  const id=uuid();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO community_reports(id,animation_id,reporter_id,reason) VALUES(?,?,?,?)")
    .bind(id,data.animation_id,user.userId,data.reason.trim()),
   env.DB.prepare("INSERT INTO moderation_events(id,animation_id,action,reason) VALUES(?,?,'report',?)")
    .bind(uuid(),data.animation_id,'report received'),
   env.DB.prepare("INSERT INTO discord_outbox(id,animation_id,action) VALUES(?,?,'report')")
    .bind(uuid(),data.animation_id)
  ]);
  return send(201,{report_id:id,status:'open'});
 }catch(_){return fail(409,'report_duplicate_or_limited');}
}
async function queue(env){
 try{
  const pending=(await env.DB.prepare(
   "SELECT a.id,a.title,a.summary,u.handle,d.source,d.created_at,v.width,v.height,"+
   "v.fps,v.size_bytes,r.license FROM animations a "+
   "JOIN publication_drafts d ON d.animation_id=a.id "+
   "JOIN community_users u ON u.id=a.owner_id "+
   "JOIN animation_versions v ON v.id=d.version_id "+
   "JOIN animation_rights r ON r.animation_id=a.id "+
   "WHERE a.status='pending' AND d.status='pending_review' AND v.status='pending' "+
   "ORDER BY d.created_at ASC LIMIT 50").bind().all()).results||[];
  const revisions=(await env.DB.prepare(
   "SELECT a.id,e.id AS edit_id,e.title,e.summary,u.handle,'revision' AS source,"+
   'e.created_at,COALESCE(n.width,v.width) AS width,COALESCE(n.height,v.height) AS height,'+
   'COALESCE(n.fps,v.fps) AS fps,COALESCE(n.size_bytes,v.size_bytes) AS size_bytes,'+
   'e.license FROM owner_revisions e JOIN animations a ON a.id=e.animation_id '+
   'JOIN community_users u ON u.id=a.owner_id '+
   'JOIN animation_versions v ON v.id=e.base_version_id '+
   'LEFT JOIN animation_versions n ON n.id=e.version_id '+
   "WHERE e.status='pending_review' AND a.status='published' AND a.published_version_id=e.base_version_id "+
   'ORDER BY e.created_at ASC LIMIT 50'
  ).bind().all()).results||[];
  const reports=(await env.DB.prepare(
   "SELECT r.id,r.animation_id,a.title,u.handle,r.reason,r.created_at "+
   "FROM community_reports r JOIN animations a ON a.id=r.animation_id "+
   "JOIN community_users u ON u.id=r.reporter_id "+
   "WHERE r.status='open' ORDER BY r.created_at ASC LIMIT 50").bind().all()).results||[];
  const comment_reports=(await env.DB.prepare(
   'SELECT r.id,r.comment_id,r.reason,r.created_at,c.animation_id,c.content,'+
   'u.handle AS comment_author,p.handle AS reporter_handle,a.title AS animation_title '+
   'FROM comment_reports r JOIN community_comments c ON c.id=r.comment_id '+
   'JOIN community_users u ON u.id=c.author_id '+
   'JOIN community_users p ON p.id=r.reporter_id '+
   'JOIN animations a ON a.id=c.animation_id '+
   "WHERE r.status='open' AND c.status='visible' ORDER BY r.created_at ASC LIMIT 50"
  ).bind().all()).results||[];
  return send(200,{pending:[...pending.map(p=>({...p,review_kind:'publication'})),
    ...revisions.map(p=>({...p,review_kind:'revision'}))].sort((a,b)=>a.created_at-b.created_at).slice(0,75),reports,comment_reports});
 }catch(_){return fail(503,'moderation_unavailable');}
}
async function decideOwnerRevision(env,user,id,rev,action,reason){
 const now=Math.floor(Date.now()/1000);
 if(!rev||rev.status!=='pending_review')return fail(409,'invalid_revision_transition');
 if(rev.version_id&&rev.version_status!=='pending')return fail(409,'invalid_revision_transition');
 const changes=[env.DB.prepare(
  "UPDATE owner_revisions SET status=?,updated_at=? WHERE id=? AND status='pending_review'"
 ).bind(action==='approve'?'approved':'rejected',now,rev.id)];
 if(action==='approve'){
  if(rev.version_id)changes.push(env.DB.prepare(
   "UPDATE animation_versions SET status='approved',reviewed_at=? WHERE id=? AND status='pending'"
  ).bind(now,rev.version_id));
  changes.push(env.DB.prepare(
   "UPDATE animations SET title=?,summary=?,category=?,published_version_id=?,updated_at=? "+
   "WHERE id=? AND status='published' AND published_version_id=?"
  ).bind(rev.title,rev.summary,rev.category,rev.version_id||rev.base_version_id,now,id,rev.base_version_id));
  changes.push(env.DB.prepare(
   'UPDATE animation_rights SET license=?,author_credit=?,allows_remix=?,rights_confirmed_at=? WHERE animation_id=?'
  ).bind(rev.license,rev.author_credit,rev.allows_remix,now,id));
  changes.push(env.DB.prepare('DELETE FROM animation_tags WHERE animation_id=?').bind(id));
  const tags=JSON.parse(rev.tags_json||'[]');
  for(const tag of tags)changes.push(env.DB.prepare(
   'INSERT INTO animation_tags(animation_id,tag) VALUES(?,?)'
  ).bind(id,tag));
  changes.push(env.DB.prepare(
   'INSERT INTO animation_search(animation_id,title_fold,updated_at) VALUES(?,?,?) '+
   'ON CONFLICT(animation_id) DO UPDATE SET title_fold=excluded.title_fold,updated_at=excluded.updated_at'
  ).bind(id,foldSearch(rev.title),now));
 }else if(rev.version_id){
  changes.push(env.DB.prepare(
   "UPDATE animation_versions SET status='rejected',reviewed_at=? WHERE id=? AND status='pending'"
  ).bind(now,rev.version_id));
 }
 changes.push(env.DB.prepare(
  'INSERT INTO moderation_events(id,animation_id,version_id,moderator_id,action,reason) VALUES(?,?,?,?,?,?)'
 ).bind(uuid(),id,rev.version_id||rev.base_version_id,user.userId,action,
  'owner revision '+rev.id+(reason?': '+reason:'')));
 changes.push(env.DB.prepare('INSERT INTO discord_outbox(id,animation_id,action) VALUES(?,?,?)')
  .bind(uuid(),id,action));
 try{
  await env.DB.batch(changes);
  return send(200,{animation_id:id,edit_id:rev.id,decision:action,
   status:'published',revision_status:action==='approve'?'approved':'rejected'});
 }catch(_){return fail(409,'revision_moderation_conflict');}
}
async function decide(req,env,user,id){
 if(!ID.test(id))return fail(404,'not_found');
 const data=await body(req);
 if(!data||!['approve','reject','hide','restore'].includes(data.action)||
  !optionalAdminReason(data.reason)||Object.keys(data).some(k=>!['action','reason'].includes(k)))
  return fail(400,'invalid_decision');
 const current=await env.DB.prepare(
  "SELECT a.status,a.published_version_id,d.version_id,d.status AS draft_status,"+
  "v.status AS version_status FROM animations a "+
  "LEFT JOIN publication_drafts d ON d.animation_id=a.id "+
  "LEFT JOIN animation_versions v ON v.id=d.version_id WHERE a.id=? LIMIT 1"
 ).bind(id).first();
 if(!current)return fail(404,'not_found');
 if(['approve','reject'].includes(data.action)&&current.status==='published'){
  const rev=await env.DB.prepare(
   'SELECT e.*,v.status AS version_status FROM owner_revisions e '+
   'LEFT JOIN animation_versions v ON v.id=e.version_id '+
   "WHERE e.animation_id=? AND e.status='pending_review' LIMIT 1"
  ).bind(id).first();
  if(rev)return decideOwnerRevision(env,user,id,rev,data.action,(data.reason||'').trim());
 }
 const a=data.action;
 const pending=current.status==='pending'&&current.draft_status==='pending_review'&&current.version_status==='pending',
  published=current.status==='published'&&!!current.published_version_id,
  hidden=current.status==='hidden'&&!!current.published_version_id;
 if((['approve','reject'].includes(a)&&!pending)||
    (a==='hide'&&!published)||(a==='restore'&&!hidden))
  return fail(409,'invalid_moderation_transition');
 const t=Math.floor(Date.now()/1000),changes=[];
 if(a==='approve'){
  changes.push(env.DB.prepare(
   "UPDATE animation_versions SET status='approved',reviewed_at=? WHERE id=? AND status='pending'"
  ).bind(t,current.version_id));
  changes.push(env.DB.prepare(
   "UPDATE animations SET status='published',published_version_id=?,published_at=?,updated_at=? "+
   "WHERE id=? AND status='pending'"
  ).bind(current.version_id,t,t,id));
 }else if(a==='reject'){
  changes.push(env.DB.prepare(
   "UPDATE animation_versions SET status='rejected',reviewed_at=? WHERE id=? AND status='pending'"
  ).bind(t,current.version_id));
  changes.push(env.DB.prepare("UPDATE animations SET status='rejected',updated_at=? WHERE id=? AND status='pending'")
   .bind(t,id));
 }else if(a==='hide'){
  changes.push(env.DB.prepare("UPDATE animations SET status='hidden',updated_at=? WHERE id=? AND status='published'")
   .bind(t,id));
 }else{
  changes.push(env.DB.prepare(
   "UPDATE animations SET status='published',updated_at=? WHERE id=? AND status='hidden' AND published_version_id IS NOT NULL"
  ).bind(t,id));
 }
 changes.push(env.DB.prepare(
  'INSERT INTO moderation_events(id,animation_id,version_id,moderator_id,action,reason) VALUES(?,?,?,?,?,?)'
 ).bind(uuid(),id,current.version_id,user.userId,a,(data.reason||'').trim()));
 if(['approve','reject','hide'].includes(a))changes.push(env.DB.prepare(
  'INSERT INTO discord_outbox(id,animation_id,action) VALUES(?,?,?)'
 ).bind(uuid(),id,a));
 if(a==='hide')changes.push(env.DB.prepare(
  "UPDATE community_reports SET status='resolved',resolved_at=? WHERE animation_id=? AND status='open'"
 ).bind(t,id));
 try{
  await env.DB.batch(changes);
  return send(200,{animation_id:id,decision:a,status:a==='approve'||a==='restore'?'published':
   a==='reject'?'rejected':'hidden'});
 }catch(_){return fail(503,'moderation_unavailable');}
}
async function settleReport(req,env,user,id){
 if(!ID.test(id))return fail(404,'not_found');
 const data=await body(req);
 if(!data||!['dismiss','resolve'].includes(data.action)||
  !optionalAdminReason(data.reason)||Object.keys(data).some(k=>!['action','reason'].includes(k)))
  return fail(400,'invalid_decision');
 try{
  const report=await env.DB.prepare(
   "UPDATE community_reports SET status=?,resolved_at=unixepoch() "+
   "WHERE id=? AND status='open' RETURNING animation_id"
  ).bind(data.action==='dismiss'?'dismissed':'resolved',id).first();
  if(!report)return fail(409,'report_not_open');
  await env.DB.prepare(
   "INSERT INTO moderation_events(id,animation_id,moderator_id,action,reason) VALUES(?,?,?,'report',?)"
  ).bind(uuid(),report.animation_id,user.userId,data.action+((data.reason||'').trim()?': '+data.reason.trim():'')).run();
  return send(200,{report_id:id,status:data.action==='dismiss'?'dismissed':'resolved'});
 }catch(_){return fail(503,'moderation_unavailable');}
}
async function moderateComment(req,env,user,id){
 if(!ID.test(id))return fail(404,'not_found');
 const data=await body(req);
 if(!data||!['hide','dismiss'].includes(data.action)||!optionalAdminReason(data.reason)||
  Object.keys(data).some(k=>!['action','reason'].includes(k)))return fail(400,'invalid_decision');
 const row=await env.DB.prepare('SELECT r.id,r.comment_id,c.animation_id,c.status AS comment_status '+
  "FROM comment_reports r JOIN community_comments c ON c.id=r.comment_id WHERE r.id=? AND r.status='open'").bind(id).first();
 if(!row)return fail(409,'report_not_open');
 const action=data.action,now=Math.floor(Date.now()/1000),batch=[];
 if(action==='hide'){
  if(row.comment_status!=='visible')return fail(409,'comment_not_visible');
  batch.push(env.DB.prepare("UPDATE community_comments SET status='hidden',updated_at=? WHERE id=? AND status='visible'")
   .bind(now,row.comment_id));
  batch.push(env.DB.prepare("UPDATE comment_reports SET status='resolved',reviewed_at=? WHERE comment_id=? AND status='open'")
   .bind(now,row.comment_id));
 }else batch.push(env.DB.prepare("UPDATE comment_reports SET status='dismissed',reviewed_at=? WHERE id=? AND status='open'").bind(now,id));
 batch.push(env.DB.prepare(
  'INSERT INTO moderation_events(id,animation_id,moderator_id,action,reason) VALUES(?,?,?,?,?)'
 ).bind(uuid(),row.animation_id,user.userId,action==='hide'?'hide':'report',
  'comment '+row.comment_id+(data.reason?': '+data.reason:'')));
 try{await env.DB.batch(batch);return send(200,{report_id:id,action,comment_id:row.comment_id});}
 catch(_){return fail(409,'comment_moderation_conflict');}
}
async function pendingDownload(env,id,editId=null){
 if(!ID.test(id)||env.STAGING_DOWNLOADS_APPROVED!=='true'||
    typeof env.PRIVATE_UPLOADS?.get!=='function')return fail(404,'not_found');
 try{
  if(editId&&!ID.test(editId))return fail(404,'not_found');
  const row=editId?await env.DB.prepare(
   'SELECT v.object_key,v.size_bytes FROM owner_revisions e '+
   'JOIN animations a ON a.id=e.animation_id '+
   'JOIN animation_versions v ON v.id=COALESCE(e.version_id,e.base_version_id) '+
   "WHERE e.id=? AND e.animation_id=? AND e.status='pending_review' "+
   "AND a.status='published' AND a.published_version_id=e.base_version_id LIMIT 1"
  ).bind(editId,id).first():await env.DB.prepare(
   "SELECT v.object_key,v.size_bytes FROM animations a "+
   "JOIN publication_drafts d ON d.animation_id=a.id "+
   "JOIN animation_versions v ON v.id=d.version_id "+
   "WHERE a.id=? AND a.status='pending' AND "+
   "d.status='pending_review' AND v.status='pending' LIMIT 1"
  ).bind(id).first();
  if(!row||row.size_bytes>20*1024*1024)return fail(404,'not_found');
  const month=new Date().toISOString().slice(0,7);
  const reserved=await env.DB.prepare(
   'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,0,1) '+
   'ON CONFLICT(month) DO UPDATE SET class_b=class_b+1,updated_at=unixepoch() '+
   'WHERE class_b<5000 RETURNING class_b'
  ).bind(month).first();
  if(!reserved)return fail(429,'download_limit_reached');
  const zip=await env.PRIVATE_UPLOADS.get(row.object_key);
  if(!zip?.body)return fail(503,'archive_unavailable');
  return new Response(zip.body,{status:200,headers:{
   'Content-Type':'application/zip','Cache-Control':'no-store, private',
   'Content-Disposition':'attachment; filename="bootanimation-review.zip"',
   'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"
  }});
 }catch(_){return fail(503,'archive_unavailable');}
}
async function notifyDiscord(){
 // Legacy text-only webhook dispatch has been permanently disabled.
 // The requested bot must use signed Discord Interactions, a private admin
 // allowlist, preview GIF attachments, and authenticated review actions.
 return fail(503,'discord_admin_bot_not_ready');
}
export async function handleModeration(req,env,url,user){
 const path=url.pathname.slice('/v1/beta/'.length);
 if(path==='reports'&&req.method==='POST')return report(req,env,user);
 if(!isModerator(env,user,req))return fail(403,'moderator_required');
 if(path==='moderation/queue'&&req.method==='GET')return queue(env);
 if(/^moderation\/pending\/[a-f0-9]{32}\/zip$/.test(path)&&req.method==='GET')
   return pendingDownload(env,path.split('/')[2],url.searchParams.get('edit'));
 if(path.startsWith('moderation/decision/')&&req.method==='POST')
  return decide(req,env,user,path.slice('moderation/decision/'.length));
 if(path.startsWith('moderation/reports/')&&req.method==='POST')
  return settleReport(req,env,user,path.slice('moderation/reports/'.length));
 if(path.startsWith('moderation/comments/')&&req.method==='POST')
  return moderateComment(req,env,user,path.slice('moderation/comments/'.length));
 if(path==='moderation/discord/dispatch'&&req.method==='POST')return notifyDiscord(env);
 return fail(404,'not_found');
}

/* INTERNAL only. Never expose these helpers as generic routes. The Discord caller
 * must first verify Ed25519 and the explicit Discord owner DM allowlist.
 */
export async function botQueue(env){
 const r=await queue(env);
 return r.ok?await r.json():null;
}
export function botReadPendingZip(env,animationId,editId=null){
 return pendingDownload(env,animationId,editId);
}
export async function botModerateAction(env,kind,id,action,reason=''){
 const moderators=String(env.MODERATOR_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(env.MODERATION_STAGING_APPROVED!=='true'||moderators.length!==1||!ID.test(id))return fail(403,'moderator_required');
 const user={userId:moderators[0]};
 if(typeof reason!=='string'||reason.length>500||action==='reject'&&reason.trim().length<5)
  return fail(400,'invalid_reason');
 const method='POST',headers={'Content-Type':'application/json'};
 const create=(route,payload)=>new Request('https://bas.internal/'+route,{method,headers,body:JSON.stringify(payload)});
 if(kind==='publication'||kind==='revision'){
  if(!['approve','reject'].includes(action))return fail(400,'invalid_decision');
  const animationId=kind==='revision'?(await env.DB.prepare('SELECT animation_id FROM owner_revisions WHERE id=?').bind(id).first())?.animation_id:id;
  if(!animationId||!ID.test(animationId))return fail(404,'not_found');
  return decide(create('decision',{action,reason}),env,user,animationId);
 }
 if(kind==='post_report'){
  if(action==='dismiss')return settleReport(create('report',{action:'dismiss',reason}),env,user,id);
  if(action==='hide'){
   const report=await env.DB.prepare("SELECT animation_id FROM community_reports WHERE id=? AND status='open'").bind(id).first();
   if(!report)return fail(409,'report_not_open');
   return decide(create('decision',{action:'hide',reason}),env,user,report.animation_id);
  }
 }
 if(kind==='comment_report'&&['hide','dismiss'].includes(action))
  return moderateComment(create('comment',{action,reason}),env,user,id);
 return fail(400,'invalid_decision');
}
