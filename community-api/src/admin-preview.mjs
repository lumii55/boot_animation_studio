/* Staging private Discord GIF previews: user-supplied but created in BAS from the
 * original ZIP's frames; never publicly serve R2 objects. Strict bounds, owner
 * verification, pending-only state and R2/storage quotas. Human moderator still
 * checks the exact pending ZIP; a GIF cannot prove the contents of that ZIP.
 */
import {publishingReady,reserveR2Write} from './publishing.mjs';
import {verifyPublisher} from './auth.mjs';
const ID=/^[a-f0-9]{32}$/;
const LIMIT=2*1024*1024;
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private',
 'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"};
const reply=(status,error,more={})=>new Response(JSON.stringify(error?{error,...more}:more),{status,headers:HEAD});
async function bounded(req){
 const length=req.headers.get('Content-Length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>LIMIT||Number(length)<50))return null;
 const reader=req.body?.getReader();if(!reader)return null;
 const parts=[];let used=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;used+=value.byteLength;
   if(used>LIMIT){await reader.cancel().catch(()=>{});return null;}parts.push(value);}
 }catch(_){return null;}finally{try{reader.releaseLock();}catch(_){}}
 if(used<50)return null;
 const out=new Uint8Array(used);let n=0;
 for(const part of parts){out.set(part,n);n+=part.length;}
 return out;
}
export function validateReviewGif(b){
 if(!ArrayBuffer.isView(b)||b.BYTES_PER_ELEMENT!==1||b.length<50||b.length>LIMIT)return null;
 const ascii=(a,end)=>String.fromCharCode(...b.subarray(a,end));
 if(ascii(0,6)!=='GIF89a')return null;
 const w=b[6]|b[7]<<8,h=b[8]|b[9]<<8;
 if(w<2||h<2||w>256||h>256)return null;
 let pos=13+((b[10]&128)?3*(1<<((b[10]&7)+1)):0),frames=0;
 function blocks(){
  while(pos<b.length){const n=b[pos++];if(n===0)return true;
   if(pos+n>b.length)return false;pos+=n;}return false;
 }
 while(pos<b.length){
  const code=b[pos++];
  if(code===0x3b)return frames>=2&&frames<=20&&pos===b.length?{width:w,height:h,frames,bytes:b.length}:null;
  if(code===0x21){
   if(pos>=b.length||![0xf9,0xff].includes(b[pos++]))return null;
   if(!blocks())return null;
  }else if(code===0x2c){
   if(pos+9>b.length)return null;
   const x=b[pos]|b[pos+1]<<8,y=b[pos+2]|b[pos+3]<<8;
   const iw=b[pos+4]|b[pos+5]<<8,ih=b[pos+6]|b[pos+7]<<8,local=b[pos+8];
   if(!iw||!ih||x+iw>w||y+ih>h)return null;
   pos+=9;
   if(local&128)pos+=3*(1<<((local&7)+1));
   if(pos>=b.length||b[pos++]!==8||!blocks())return null;
   if(++frames>20)return null;
  }else return null;
 }
 return null;
}
export async function handleAdminPreview(req,env,url){
 const path=url.pathname;
 if(!path.startsWith('/v1/publishing/'))return null;
 const pub=/^\/v1\/publishing\/drafts\/([a-f0-9]{32})\/preview$/.exec(path);
 const rev=/^\/v1\/publishing\/revisions\/([a-f0-9]{32})\/preview$/.exec(path);
 if(!pub&&!rev)return null;
 if(req.method!=='PUT')return reply(405,'method_not_allowed');
 if(!publishingReady(env)||env.BETA_CATALOG_ENABLED!=='true'||
   env.PUBLIC_CATALOG_ENABLED!=='false'||env.AUTH_PUBLIC_SIGNUP_APPROVED!=='false')
   return reply(503,'preview_disabled');
 if(url.origin!==env.AUTH_API_ORIGIN||req.headers.get('Content-Type')!=='image/gif')
   return reply(400,'invalid_origin_or_format');
 let user;try{user=await verifyPublisher(req,env);}catch(_){return reply(503,'auth_unavailable');}
 if(!user||user.clientKind!=='bas')return reply(403,'not_authorized');
 const id=(pub||rev)[1];if(!ID.test(id))return reply(404,'not_found');
 let version;
 try{
  version=pub?await env.DB.prepare(
   'SELECT v.id,v.animation_id,v.preview_key FROM publication_drafts d '+
   'JOIN animation_versions v ON v.id=d.version_id '+
   "WHERE d.id=? AND d.owner_id=? AND d.status='pending_review' AND v.status='pending' LIMIT 1"
  ).bind(id,user.userId).first():
  await env.DB.prepare(
   'SELECT v.id,v.animation_id,v.preview_key FROM owner_revisions e '+
   'JOIN animation_versions v ON v.id=e.version_id '+
   "WHERE e.id=? AND e.owner_id=? AND e.status='pending_review' AND v.status='pending' LIMIT 1"
  ).bind(id,user.userId).first();
 }catch(_){return reply(503,'preview_lookup_failed');}
 if(!version)return reply(404,'not_pending_or_not_owned');
 if(version.preview_key)return reply(409,'preview_already_attached');
 const data=await bounded(req),gif=data&&validateReviewGif(data);
 if(!gif)return reply(422,'invalid_gif');
 const key='previews/'+version.animation_id+'/'+version.id+'.gif';
 let reserved=false,claimed=false,stored=false;
 try{
  // No unbounded R2 storage: GIFs count toward the SAME global cap as ZIPs.
  const budget=await env.DB.prepare(
   'UPDATE storage_budget SET used_bytes=used_bytes+? '+
   'WHERE id=1 AND used_bytes+reserved_bytes+?<=cap_bytes RETURNING used_bytes'
  ).bind(data.length,data.length).first();
  if(!budget)return reply(429,'preview_storage_budget');
  reserved=true;
  const claim=await env.DB.prepare(
   "UPDATE animation_versions SET preview_key=? WHERE id=? AND status='pending' AND preview_key IS NULL RETURNING id"
  ).bind(key,version.id).first();
  if(!claim)return reply(409,'preview_conflict');
  claimed=true;
  await reserveR2Write(env);
  await env.PRIVATE_UPLOADS.put(key,data,{
   httpMetadata:{contentType:'image/gif'},
   customMetadata:{private:'true',moderation:'only',animation:version.animation_id,version:version.id}
  });
  stored=true;
  return reply(200,null,{preview:'stored_privately',width:gif.width,height:gif.height,frames:gif.frames});
 }catch(_){return reply(503,'preview_upload_failed');}
 finally{
  if(!stored){
   if(claimed)try{await env.DB.prepare(
    'UPDATE animation_versions SET preview_key=NULL WHERE id=? AND preview_key=?'
   ).bind(version.id,key).run();}catch(_){}
   if(reserved)try{await env.DB.prepare(
    'UPDATE storage_budget SET used_bytes=used_bytes-? WHERE id=1 AND used_bytes>=?'
   ).bind(data.length,data.length).run();}catch(_){}
  }
 }
}
