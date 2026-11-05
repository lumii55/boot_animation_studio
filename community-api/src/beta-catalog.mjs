/* P15.7 account-gated beta gallery. Public catalog stays disabled. */
import {verifyPublisher,verifyPrivateProfileReader} from './auth.mjs';
import {foldSearch} from './search-tags.mjs';
import {handleModeration} from './beta-moderation.mjs';
const responseHeaders={'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, private','Content-Security-Policy':"default-src 'none'",
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const result=(s,v)=>new Response(JSON.stringify(v),{status:s,headers:responseHeaders});
const err=(s,v)=>result(s,{error:v});
const idPattern=/^[a-f0-9]{32}$/;
export const betaCatalogReady=env=>env?.BETA_CATALOG_ENABLED==='true' &&
  env?.AUTH_PUBLIC_SIGNUP_APPROVED==='false'&&env?.PUBLIC_CATALOG_ENABLED==='false'&&
  typeof env?.DB?.prepare==='function';
const base=[
 'SELECT a.id,a.title,a.summary,a.category,a.published_at,a.download_count,a.like_count,',
 'v.size_bytes,v.width,v.height,v.fps,u.handle,u.display_name,r.license,',
 "(SELECT group_concat(tag,' ') FROM animation_tags t WHERE t.animation_id=a.id) AS tags",
 'FROM animations a JOIN community_users u ON u.id=a.owner_id',
 'JOIN animation_versions v ON v.id=a.published_version_id',
 'JOIN animation_rights r ON r.animation_id=a.id',
 'LEFT JOIN animation_search s ON s.animation_id=a.id',
 "WHERE a.status='published' AND v.status='approved' AND u.status='active'"
].join(' ');
function output(row){
 return {id:row.id,title:row.title,summary:row.summary,category:row.category,
  published_at:row.published_at,download_count:row.download_count,like_count:row.like_count,
  size_bytes:row.size_bytes,width:row.width,height:row.height,fps:row.fps,
  handle:row.handle,display_name:row.display_name,license:row.license,
  tags:row.tags?row.tags.split(' ').filter(Boolean):[]};
}
async function list(url,env){
 const size=Number(url.searchParams.get('limit')||12),
  offset=Number(url.searchParams.get('offset')||0),
  sort=url.searchParams.get('sort')||'newest',
  raw=url.searchParams.get('q')||'';
 const sorts={newest:'a.published_at DESC,a.id DESC',
  popular:'a.download_count DESC,a.published_at DESC,a.id DESC',
  liked:'a.like_count DESC,a.published_at DESC,a.id DESC'};
 if(!Number.isInteger(size)||size<1||size>24||!Number.isInteger(offset)||
  offset<0||offset>5000||!Object.hasOwn(sorts,sort)||raw.length>80)
  return err(400,'invalid_query');
 const q=foldSearch(raw),values=[];
 let sql=base,rank='';
 if(q){
  sql+=" AND (instr(COALESCE(s.title_fold,lower(a.title)),?)>0 OR "+
       "instr(lower(u.handle),?)>0 OR EXISTS(SELECT 1 FROM animation_tags t "+
       "WHERE t.animation_id=a.id AND instr(t.tag,?)>0))";
  values.push(q,q,q);
  rank="CASE WHEN s.title_fold=? THEN 0 WHEN instr(s.title_fold,?)=1 "+
       "THEN 1 WHEN instr(s.title_fold,?)>0 THEN 2 ELSE 3 END,";
 }
 sql+=' ORDER BY '+rank+sorts[sort]+' LIMIT ? OFFSET ?';
 if(q)values.push(q,q,q);
 values.push(size+1,offset);
 try{
  const rows=(await env.DB.prepare(sql).bind(...values).all()).results||[];
  return result(200,{items:rows.slice(0,size).map(output),
   next_offset:rows.length>size&&offset+size<=5000?offset+size:null});
 }catch(_){return err(503,'catalog_unavailable');}
}
async function detail(id,env){
 if(!idPattern.test(id))return err(404,'not_found');
 try{
  const row=await env.DB.prepare(base+' AND a.id=? LIMIT 1').bind(id).first();
  return row?result(200,{animation:output(row)}):err(404,'not_found');
 }catch(_){return err(503,'catalog_unavailable');}
}
async function download(id,env){
 if(!idPattern.test(id)||env.STAGING_DOWNLOADS_APPROVED!=='true'||
  typeof env.PRIVATE_UPLOADS?.get!=='function')return err(404,'not_found');
 try{
  const row=await env.DB.prepare(
   "SELECT v.object_key FROM animations a JOIN animation_versions v ON "+
   "v.id=a.published_version_id JOIN community_users u ON u.id=a.owner_id "+
   "WHERE a.id=? AND a.status='published' AND v.status='approved' AND u.status='active' LIMIT 1"
  ).bind(id).first();
  if(!row)return err(404,'not_found');
  const month=new Date().toISOString().slice(0,7);
  const reserved=await env.DB.prepare(
   'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,0,1) '+
   'ON CONFLICT(month) DO UPDATE SET class_b=class_b+1,updated_at=unixepoch() '+
   'WHERE class_b<5000 RETURNING class_b'
  ).bind(month).first();
  if(!reserved)return err(429,'download_limit_reached');
  const object=await env.PRIVATE_UPLOADS.get(row.object_key);
  if(!object?.body)return err(503,'archive_unavailable');
  return new Response(object.body,{status:200,headers:{
   'Content-Type':'application/zip','Cache-Control':'no-store, private',
   'Content-Disposition':'attachment; filename="bootanimation.zip"',
   'Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'}});
 }catch(_){return err(503,'archive_unavailable');}
}
export async function handleBetaCatalog(req,env,url){
 if(!url.pathname.startsWith('/v1/beta/'))return null;
 if(!betaCatalogReady(env)||url.origin!==env.AUTH_API_ORIGIN)
  return err(404,'not_found');
 const user=req.method==='GET'?await verifyPrivateProfileReader(req,env):
  await verifyPublisher(req,env);
 if(!user)return err(403,'not_authorized');
 const path=url.pathname.slice('/v1/beta/'.length);
 if(req.method==='GET'&&path==='catalog')return list(url,env);
 if(req.method==='GET'&&/^animations\/[a-f0-9]{32}$/.test(path))
  return detail(path.split('/')[1],env);
 if(req.method==='GET'&&/^downloads\/[a-f0-9]{32}$/.test(path))
  return download(path.split('/')[1],env);
 if(path==='reports'||path.startsWith('moderation/'))
  return handleModeration(req,env,url,user);
 return err(404,'not_found');
}
