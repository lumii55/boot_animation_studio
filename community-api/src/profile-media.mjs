/* BAS P15.6: authenticated creator avatar/banner media, private-by-default.
 * The Cloudflare Images binding decodes and re-encodes uploaded files. Never trust
 * browser-side MIME, dimensions, cropping or EXIF removal.
 * P15.6 staging only. No unauthenticated image reads, no public bucket exposure.
 */
import {authConfigured, verifyPublisher, verifyPrivateProfileReader} from './auth.mjs';

const PREFIX='/v1/profile-media/';
const RESERVATION=524288;
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const LIMITS={avatar:{input:2*1024*1024,width:512,height:512},
              banner:{input:4*1024*1024,width:1280,height:480}};
const HEADERS={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer','Vary':'Origin'};

export function mediaReady(env){
  return env?.MEDIA_ENABLED==='true' && env?.MEDIA_STAGING_APPROVED==='true' &&
    env?.STORAGE_ENABLED==='true' && env?.PUBLIC_CATALOG_ENABLED!=='true' &&
    authConfigured(env) && typeof env?.DB?.prepare==='function'&&typeof env?.DB?.batch==='function' &&
    typeof env?.PRIVATE_UPLOADS?.put==='function'&&typeof env?.PRIVATE_UPLOADS?.get==='function' &&
    typeof env?.PRIVATE_UPLOADS?.delete==='function' &&
    typeof env?.IMAGES?.info==='function'&&typeof env?.IMAGES?.input==='function';
}
function reply(request,env,status,value=null,extra={}){
  const h=new Headers(HEADERS);
  for(const [k,v] of Object.entries(extra))h.set(k,v);
  const origin=request.headers.get('Origin');
  if(origin&&origin===env.AUTH_SITE_ORIGIN){
    h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Credentials','true');
    h.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
    h.set('Access-Control-Allow-Headers','X-CSRF-Token, Content-Type');
  }
  if(value!==null && !(value instanceof Uint8Array))h.set('Content-Type','application/json; charset=utf-8');
  return new Response(value===null?null:value instanceof Uint8Array?value:JSON.stringify(value),{status,headers:h});
}
function error(req,env,message,status=400){return reply(req,env,status,{error:message});}
function ident(){
  const x=crypto.getRandomValues(new Uint8Array(16));
  return [...x].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function now(){return Math.floor(Date.now()/1000);}
function month(){return new Date().toISOString().slice(0,7);}
async function streamBytes(req,max){
  const header=req.headers.get('Content-Length');
  if(header!==null&&(!/^\d+$/.test(header)||Number(header)>max||Number(header)<1))return null;
  if(!req.body)return null;
  const pieces=[];let used=0;
  const reader=req.body.getReader();
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      used+=value.byteLength;
      if(used>max){await reader.cancel().catch(()=>{});return null;}
      pieces.push(value);
    }
  }catch(_){return null;}finally{try{reader.releaseLock();}catch(_){}}
  if(!used)return null;
  const out=new Uint8Array(used);let at=0;
  for(const part of pieces){out.set(part,at);at+=part.length;}
  return out;
}
function imageMagic(bytes){
  if(bytes.byteLength<12)return null;
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((x,i)=>bytes[i]===x))return 'image/png';
  if(String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return 'image/webp';
  return null;
}
async function reserveOperation(env,method='class_a'){
  const field=method==='class_b'?'class_b':'class_a';
  const m=month();
  const result=await env.DB.prepare(
    'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,?,?) '+
    'ON CONFLICT(month) DO UPDATE SET '+field+'='+field+'+1,updated_at=unixepoch() '+
    'WHERE '+field+'<10000 RETURNING '+field
  ).bind(m,field==='class_a'?1:0,field==='class_b'?1:0).first();
  if(!result)throw Error('r2_budget_exhausted');
}
async function reserveTransform(env){
  const result=await env.DB.prepare(
    'INSERT INTO media_transform_budget(month,count) VALUES(?,1) '+
    'ON CONFLICT(month) DO UPDATE SET count=count+1 WHERE count<200 RETURNING count'
  ).bind(month()).first();
  if(!result)throw Error('media_transform_cap');
}
async function failReservation(env,id){
  try{await env.DB.prepare(
    "UPDATE creator_media SET status='failed',updated_at=unixepoch() WHERE id=? AND status='processing'"
  ).bind(id).run();}catch(_){/* fail closed; manual ledger repair required */}
}
async function getCurrent(env,userId,kind){
  return env.DB.prepare(
    'SELECT m.id,m.object_key,m.size_bytes FROM creator_media_current c '+
    "JOIN creator_media m ON m.id=c.media_id WHERE c.user_id=? AND c.kind=? AND m.status='active' LIMIT 1"
  ).bind(userId,kind).first();
}
async function getMedia(req,env,user,kind){
  const m=await getCurrent(env,user.userId,kind);
  if(!m)return error(req,env,'not_found',404);
  await reserveOperation(env,'class_b');
  const value=await env.PRIVATE_UPLOADS.get(m.object_key);
  if(!value)return error(req,env,'media_unavailable',503);
  const b=await value.arrayBuffer();
  if(!b.byteLength||b.byteLength>RESERVATION)return error(req,env,'media_unavailable',503);
  return reply(req,env,200,new Uint8Array(b),{'Content-Type':'image/webp'});
}
async function uploadMedia(req,env,user,kind){
  const limit=LIMITS[kind];
  const mime=req.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if(!TYPES.has(mime))return error(req,env,'invalid_media_type',415);
  const bytes=await streamBytes(req,limit.input);
  if(!bytes||imageMagic(bytes)!==mime)return error(req,env,'invalid_image',400);
  // This is a real server-side decoder; source EXIF and metadata never go to R2.
  let info;
  try{info=await env.IMAGES.info(new Blob([bytes]).stream());}
  catch(_){return error(req,env,'invalid_image',422);}
  if(!info||!Number.isInteger(info.width)||!Number.isInteger(info.height)||
    info.width<1||info.height<1||info.width>10000||info.height>10000||
    info.width*info.height>32000000)return error(req,env,'image_dimensions',422);
  const id=ident(),key='creator-private/'+user.userId+'/'+kind+'/'+id+'.webp';
  try{
    await env.DB.prepare(
      "INSERT INTO creator_media(id,owner_id,kind,object_key,status) VALUES(?,?,?,?,'processing')"
    ).bind(id,user.userId,kind,key).run();
  }catch(_){return error(req,env,'profile_media_quota',429);}
  let processed,stored=false;
  try{
    await reserveTransform(env);
    const output=await env.IMAGES.input(new Blob([bytes]).stream())
      .transform({width:limit.width,height:limit.height,fit:'cover'})
      .output({format:'image/webp'});
    const result=output.response();
    if(!result.ok)throw Error('media_processing_failed');
    const array=new Uint8Array(await result.arrayBuffer());
    if(!array.length||array.byteLength>RESERVATION||imageMagic(array)!=='image/webp')
      throw Error('transformed_media_invalid');
    processed=array;
    await reserveOperation(env,'class_a');
    await env.PRIVATE_UPLOADS.put(key,processed,{
      httpMetadata:{contentType:'image/webp'},
      customMetadata:{owner:user.userId,kind,private:'true'}
    });
    stored=true;
    const previous=await getCurrent(env,user.userId,kind);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE creator_media SET status='active',size_bytes=?,updated_at=unixepoch() "+
        "WHERE id=? AND status='processing'"
      ).bind(processed.byteLength,id),
      env.DB.prepare(
        "INSERT INTO creator_media_current(user_id,kind,media_id) VALUES(?,?,?) "+
        "ON CONFLICT(user_id,kind) DO UPDATE SET media_id=excluded.media_id"
      ).bind(user.userId,kind,id),
      ...(previous?[env.DB.prepare(
        "UPDATE creator_media SET status='delete_pending',updated_at=unixepoch() "+
        "WHERE id=? AND status='active'"
      ).bind(previous.id)]:[])
    ]);
    // Old media is still counted in storage_budget until R2 confirms deletion.
    if(previous){
      try{
        await reserveOperation(env,'class_a');
        await env.PRIVATE_UPLOADS.delete(previous.object_key);
        await env.DB.prepare(
          "UPDATE creator_media SET status='deleted',updated_at=unixepoch() "+
          "WHERE id=? AND status='delete_pending'"
        ).bind(previous.id).run();
      }catch(_){/* Orphan recovery ledger keeps previous object_key private. */}
    }
    return reply(req,env,200,{kind,updated:true,bytes:processed.byteLength});
  }catch(_){
    // If an object reached R2 but the DB transaction failed, never erase its
    // recovery record or release budget until R2 deletion has succeeded.
    if(stored){
      try{
        await reserveOperation(env,'class_a');
        await env.PRIVATE_UPLOADS.delete(key);
        stored=false;
      }catch(_){return error(req,env,'media_requires_reconciliation',503);}
    }
    await failReservation(env,id);
    return error(req,env,'image_processing_or_storage_unavailable',503);
  }
}
export async function handleProfileMedia(request,env,url){
  if(!url.pathname.startsWith(PREFIX))return null;
  if(!mediaReady(env))return error(request,env,'media_unavailable',503);
  if(url.origin!==env.AUTH_API_ORIGIN)return error(request,env,'origin_mismatch',403);
  if(request.method==='OPTIONS')return reply(request,env,204);
  const kind=url.pathname.slice(PREFIX.length);
  if(!Object.hasOwn(LIMITS,kind))return error(request,env,'not_found',404);
  let user;
  try{user=request.method==='GET'
    ?await verifyPrivateProfileReader(request,env)
    :await verifyPublisher(request,env);}
  catch(_){return error(request,env,'auth_unavailable',503);}
  if(!user)return error(request,env,'not_authorized',403);
  try{
    if(request.method==='PUT')return await uploadMedia(request,env,user,kind);
    if(request.method==='GET')return await getMedia(request,env,user,kind);
  }catch(_){return error(request,env,'media_unavailable',503);}
  return error(request,env,'method_not_allowed',405);
}
