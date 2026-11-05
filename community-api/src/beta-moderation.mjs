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
  const reports=(await env.DB.prepare(
   "SELECT r.id,r.animation_id,a.title,u.handle,r.reason,r.created_at "+
   "FROM community_reports r JOIN animations a ON a.id=r.animation_id "+
   "JOIN community_users u ON u.id=r.reporter_id "+
   "WHERE r.status='open' ORDER BY r.created_at ASC LIMIT 50").bind().all()).results||[];
  return send(200,{pending,reports});
 }catch(_){return fail(503,'moderation_unavailable');}
}
async function decide(req,env,user,id){
 if(!ID.test(id))return fail(404,'not_found');
 const data=await body(req);
 if(!data||!['approve','reject','hide','restore'].includes(data.action)||
  !valid(data.reason,5,500)||Object.keys(data).some(k=>!['action','reason'].includes(k)))
  return fail(400,'invalid_decision');
 const current=await env.DB.prepare(
  "SELECT a.status,a.published_version_id,d.version_id,d.status AS draft_status,"+
  "v.status AS version_status FROM animations a "+
  "LEFT JOIN publication_drafts d ON d.animation_id=a.id "+
  "LEFT JOIN animation_versions v ON v.id=d.version_id WHERE a.id=? LIMIT 1"
 ).bind(id).first();
 if(!current)return fail(404,'not_found');
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
 ).bind(uuid(),id,current.version_id,user.userId,a,data.reason.trim()));
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
  !valid(data.reason,5,500)||Object.keys(data).some(k=>!['action','reason'].includes(k)))
  return fail(400,'invalid_decision');
 try{
  const report=await env.DB.prepare(
   "UPDATE community_reports SET status=?,resolved_at=unixepoch() "+
   "WHERE id=? AND status='open' RETURNING animation_id"
  ).bind(data.action==='dismiss'?'dismissed':'resolved',id).first();
  if(!report)return fail(409,'report_not_open');
  await env.DB.prepare(
   "INSERT INTO moderation_events(id,animation_id,moderator_id,action,reason) VALUES(?,?,?,'report',?)"
  ).bind(uuid(),report.animation_id,user.userId,data.action+': '+data.reason.trim()).run();
  return send(200,{report_id:id,status:data.action==='dismiss'?'dismissed':'resolved'});
 }catch(_){return fail(503,'moderation_unavailable');}
}
async function pendingDownload(env,id){
 if(!ID.test(id)||env.STAGING_DOWNLOADS_APPROVED!=='true'||
    typeof env.PRIVATE_UPLOADS?.get!=='function')return fail(404,'not_found');
 try{
  const row=await env.DB.prepare(
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
   return pendingDownload(env,path.split('/')[2]);
 if(path.startsWith('moderation/decision/')&&req.method==='POST')
  return decide(req,env,user,path.slice('moderation/decision/'.length));
 if(path.startsWith('moderation/reports/')&&req.method==='POST')
  return settleReport(req,env,user,path.slice('moderation/reports/'.length));
 if(path==='moderation/discord/dispatch'&&req.method==='POST')return notifyDiscord(env);
 return fail(404,'not_found');
}
