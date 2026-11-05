/* BAS Community: real text-only social layer. Public reading, authenticated writes.
 * No media uploads, HTML, markdown, comment links, public account signup or R2 access.
 */
import {verifyPublisher,verifyPrivateProfileReader,trustedBASOrigin} from './auth.mjs';
const ID=/^[a-f0-9]{32}$/;
const HANDLE=/^[A-Za-z0-9_]{3,32}$/;
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private',
 'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer'};
const send=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:JSON_HEADERS});
const fail=(status,error)=>send(status,{error});
const uuid=()=>crypto.randomUUID().replaceAll('-','');
const prepared=(env,sql,...params)=>env.DB.prepare(sql).bind(...params);
const read=(env,sql,...params)=>prepared(env,sql,...params).first();
const rows=async(env,sql,...params)=>(await prepared(env,sql,...params).all()).results||[];
const live=env=>env?.BETA_CATALOG_ENABLED==='true'&&env?.AUTH_PUBLIC_SIGNUP_APPROVED==='false'&&
  env?.PUBLIC_CATALOG_ENABLED==='false'&&typeof env?.DB?.prepare==='function';
async function jsonBody(req,maxBytes=1300){
 if(req.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return null;
 try{
  const raw=await req.text();if(raw.length>maxBytes)return null;
  const obj=JSON.parse(raw);
  return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:null;
 }catch(_){return null;}
}
function plain(value,min,max){
 if(typeof value!=='string')return null;
 const v=value.trim();
 const len=[...v].length;
 if(len<min||len>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v))return null;
 return v;
}
async function published(env,id){
 if(!ID.test(id))return null;
 return read(env,'SELECT a.id,a.owner_id,a.title,u.handle,u.display_name,r.license,r.allows_remix '+
  'FROM animations a JOIN community_users u ON u.id=a.owner_id '+
  'JOIN animation_versions v ON v.id=a.published_version_id '+
  'JOIN animation_rights r ON r.animation_id=a.id '+
  "WHERE a.id=? AND a.status='published' AND u.status='active' AND v.status='approved' LIMIT 1",id);
}
async function viewer(req,env){
 if(!trustedBASOrigin(req.headers.get('Origin'),env))return null;
 try{
  const s=await verifyPrivateProfileReader(req,env);
  return s?.clientKind==='bas'?s:null;
 }catch(_){return null;}
}
async function readAnimation(req,env,id,url){
 const post=await published(env,id);if(!post)return fail(404,'not_found');
 const me=await viewer(req,env);
 const offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isInteger(offset)||offset<0||offset>500)return fail(400,'invalid_offset');
 const uid=me?.userId||'';
 try{
  const [comments,summary,liked,following]=await Promise.all([
   rows(env,'SELECT c.id,c.content,c.created_at,u.handle,u.display_name, '+
    '(SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id=c.id) AS likes, '+
    '(SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id=c.id AND l.user_id=?) AS liked '+
    'FROM community_comments c JOIN community_users u ON u.id=c.author_id '+
    "WHERE c.animation_id=? AND c.status='visible' AND u.status='active' "+
    'ORDER BY c.created_at DESC,c.id DESC LIMIT 21 OFFSET ?',uid,id,offset),
   read(env,"SELECT (SELECT COUNT(*) FROM animation_likes WHERE animation_id=?) AS likes,"+
    "(SELECT COUNT(*) FROM community_comments WHERE animation_id=? AND status='visible') AS comments, "+
    "(SELECT COUNT(*) FROM creator_follows WHERE creator_id=?) AS followers",id,id,post.owner_id),
   read(env,'SELECT 1 AS value FROM animation_likes WHERE animation_id=? AND user_id=?',id,uid),
   read(env,'SELECT 1 AS value FROM creator_follows WHERE creator_id=? AND follower_id=?',post.owner_id,uid)
  ]);
  return send(200,{animation_id:id,likes:Number(summary?.likes||0),comments_count:Number(summary?.comments||0),
   followers:Number(summary?.followers||0),liked:Boolean(liked),following:Boolean(following),
   can_remix:Boolean(post.allows_remix&&post.license!=='all-rights-reserved'),
   comments:comments.slice(0,20).map(c=>({...c,likes:Number(c.likes||0),liked:Boolean(c.liked)})),
   next_offset:comments.length>20?offset+20:null});
 }catch(_){return fail(503,'social_unavailable');}
}
async function readCreator(req,env,handle){
 if(!HANDLE.test(handle))return fail(404,'not_found');
 const me=await viewer(req,env);
 try{
  const person=await read(env,'SELECT u.id,u.handle,u.display_name,u.bio FROM community_users u '+
   "WHERE u.handle=? AND u.status='active' AND EXISTS (SELECT 1 FROM animations a WHERE a.owner_id=u.id AND a.status='published')",handle);
  if(!person)return fail(404,'not_found');
  const followers=await read(env,'SELECT COUNT(*) AS n FROM creator_follows WHERE creator_id=?',person.id);
  const following=me?await read(env,'SELECT 1 AS n FROM creator_follows WHERE creator_id=? AND follower_id=?',person.id,me.userId):null;
  return send(200,{handle:person.handle,display_name:person.display_name,bio:person.bio,
   followers:Number(followers?.n||0),following:Boolean(following)});
 }catch(_){return fail(503,'social_unavailable');}
}
async function setAnimationLike(env,id,userId,enabled){
 const post=await published(env,id);if(!post)return fail(404,'not_found');
 try{
  if(enabled)await prepared(env,'INSERT OR IGNORE INTO animation_likes(animation_id,user_id) VALUES(?,?)',id,userId).run();
  else await prepared(env,'DELETE FROM animation_likes WHERE animation_id=? AND user_id=?',id,userId).run();
  const count=await read(env,'SELECT like_count FROM animations WHERE id=?',id);
  return send(200,{liked:enabled,likes:Number(count?.like_count||0)});
 }catch(_){return fail(503,'social_unavailable');}
}
async function setFollow(env,handle,userId,enabled){
 if(!HANDLE.test(handle))return fail(404,'not_found');
 try{
  const creator=await read(env,'SELECT u.id FROM community_users u WHERE u.handle=? AND u.status=\'active\' '+
   'AND EXISTS(SELECT 1 FROM animations a WHERE a.owner_id=u.id AND a.status=\'published\')',handle);
  if(!creator)return fail(404,'not_found');
  if(creator.id===userId)return fail(409,'cannot_follow_self');
  if(enabled)await prepared(env,'INSERT OR IGNORE INTO creator_follows(follower_id,creator_id) VALUES(?,?)',userId,creator.id).run();
  else await prepared(env,'DELETE FROM creator_follows WHERE follower_id=? AND creator_id=?',userId,creator.id).run();
  const count=await read(env,'SELECT COUNT(*) AS n FROM creator_follows WHERE creator_id=?',creator.id);
  return send(200,{following:enabled,followers:Number(count?.n||0)});
 }catch(_){return fail(503,'social_unavailable');}
}
async function postComment(req,env,animationId,userId){
 if(!await published(env,animationId))return fail(404,'not_found');
 const b=await jsonBody(req,1400);
 if(!b||Object.keys(b).some(k=>k!=='text'))return fail(400,'invalid_comment');
 const content=plain(b.text,1,600);
 if(!content)return fail(400,'invalid_comment');
 try{
  const id=uuid();
  await prepared(env,'INSERT INTO community_comments(id,animation_id,author_id,content) VALUES(?,?,?,?)',
   id,animationId,userId,content).run();
  return send(201,{id,status:'visible',text_only:true});
 }catch(_){return fail(429,'comment_rate_limited');}
}
async function setCommentLike(env,commentId,userId,enabled){
 if(!ID.test(commentId))return fail(404,'not_found');
 try{
  const comment=await read(env,'SELECT c.id FROM community_comments c JOIN animations a ON a.id=c.animation_id '+
   "JOIN animation_versions v ON v.id=a.published_version_id WHERE c.id=? AND c.status='visible' "+
   "AND a.status='published' AND v.status='approved'",commentId);
  if(!comment)return fail(404,'not_found');
  if(enabled)await prepared(env,'INSERT OR IGNORE INTO comment_likes(comment_id,user_id) VALUES(?,?)',commentId,userId).run();
  else await prepared(env,'DELETE FROM comment_likes WHERE comment_id=? AND user_id=?',commentId,userId).run();
  const total=await read(env,'SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id=?',commentId);
  return send(200,{liked:enabled,likes:Number(total?.n||0)});
 }catch(_){return fail(503,'social_unavailable');}
}
async function reportComment(req,env,commentId,userId){
 if(!ID.test(commentId))return fail(404,'not_found');
 const b=await jsonBody(req,1100);
 if(!b||Object.keys(b).some(k=>k!=='reason'))return fail(400,'invalid_report');
 const reason=plain(b.reason,5,500);if(!reason)return fail(400,'invalid_report');
 try{
  const comment=await read(env,'SELECT c.id,c.author_id FROM community_comments c JOIN animations a ON a.id=c.animation_id '+
   "WHERE c.id=? AND c.status='visible' AND a.status='published'",commentId);
  if(!comment)return fail(404,'not_found');
  if(comment.author_id===userId)return fail(409,'cannot_report_own_comment');
  const id=uuid();await prepared(env,'INSERT INTO comment_reports(id,comment_id,reporter_id,reason) VALUES(?,?,?,?)',
   id,commentId,userId,reason).run();
  return send(201,{report_id:id,status:'open'});
 }catch(_){return fail(409,'report_duplicate_or_limited');}
}
export async function handleSocial(request,env,url){
 if(!url.pathname.startsWith('/v1/social/'))return null;
 if(!live(env)||url.origin!==env.AUTH_API_ORIGIN)return fail(404,'not_found');
 const path=url.pathname.slice('/v1/social/'.length),method=request.method;
 try{
  if(method==='GET'){
   const a=/^animations\/([a-f0-9]{32})$/.exec(path);
   if(a)return readAnimation(request,env,a[1],url);
   const c=/^creators\/([A-Za-z0-9_]{3,32})$/.exec(path);
   if(c)return readCreator(request,env,c[1]);
  }
  const user=await verifyPublisher(request,env);
  if(!user||user.clientKind!=='bas')return fail(403,'not_authorized');
  const a=/^animations\/([a-f0-9]{32})\/like$/.exec(path);
  if(a&&(method==='PUT'||method==='DELETE'))return setAnimationLike(env,a[1],user.userId,method==='PUT');
  const f=/^creators\/([A-Za-z0-9_]{3,32})\/follow$/.exec(path);
  if(f&&(method==='PUT'||method==='DELETE'))return setFollow(env,f[1],user.userId,method==='PUT');
  const c=/^animations\/([a-f0-9]{32})\/comments$/.exec(path);
  if(c&&method==='POST')return postComment(request,env,c[1],user.userId);
  const l=/^comments\/([a-f0-9]{32})\/like$/.exec(path);
  if(l&&(method==='PUT'||method==='DELETE'))return setCommentLike(env,l[1],user.userId,method==='PUT');
  const r=/^comments\/([a-f0-9]{32})\/reports$/.exec(path);
  if(r&&method==='POST')return reportComment(request,env,r[1],user.userId);
 }catch(_){return fail(503,'social_unavailable');}
 return fail(404,'not_found');
}
