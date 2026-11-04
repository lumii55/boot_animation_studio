/* BAS Community P15.4 — server-side GitHub OAuth + PKCE and profile endpoints.
 * OFF BY DEFAULT. No OAuth secrets/tokens may be committed to source or sent to browsers.
 * Requires a same-site deployment topology, reviewed OAuth app, D1 migrations and owner opt-in.
 */
const CLOCK_SKEW_SECONDS = 10;
const FLOW_TTL = 600;
const SESSION_TTL = 7 * 24 * 3600;
const AUTH_API_PREFIX = '/v1/auth/';
const LOGIN_COOKIE = '__Host-bas_oauth';
const SESSION_COOKIE = '__Host-bas_session';
const encoder = new TextEncoder();
const HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, private',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'",
  'Vary':'Origin'
};
function urlOrigin(value) {
  try {
    const url = new URL(value);
    if (url.href !== url.origin + '/') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch (_) { return null; }
}
function checkedTopology(env) {
  const api = urlOrigin(env.AUTH_API_ORIGIN);
  const site = urlOrigin(env.AUTH_SITE_ORIGIN);
  if (!api || !site) return false;
  if (api.origin.startsWith('http://127.0.0.1') && site.origin.startsWith('http://127.0.0.1')) return true;
  if (api.protocol !== 'https:' || site.protocol !== 'https:') return false;
  const aparts = api.hostname.split('.'), sparts = site.hostname.split('.');
  if (aparts.length < 3 || sparts.length < 3) return false;
  const apair = aparts.slice(-2).join('.');
  const spair = sparts.slice(-2).join('.');
  if (['github.io','workers.dev','pages.dev','cloudflare.dev'].includes(apair)) return false;
  return apair === spair;
}
export function authConfigured(env) {
  return env?.AUTH_ENABLED === 'true' &&
    env?.AUTH_DEPLOYMENT_APPROVED === 'true' &&
    typeof env?.DB?.prepare === 'function' &&
    Boolean(env?.GITHUB_CLIENT_ID && /^[a-zA-Z0-9_]+$/.test(env.GITHUB_CLIENT_ID)) &&
    typeof env?.GITHUB_CLIENT_SECRET === 'string' && env.GITHUB_CLIENT_SECRET.length >= 16 &&
    typeof env?.AUTH_PEPPER === 'string' && env.AUTH_PEPPER.length >= 32 &&
    typeof env?.AUTH_SESSION_SECRET === 'string' && env.AUTH_SESSION_SECRET.length >= 32 &&
    checkedTopology(env);
}
function allowOrigin(request, env) {
  const origin=request.headers.get('Origin');
  return origin && origin === env.AUTH_SITE_ORIGIN ? origin : null;
}
function response(request,env,value,status=200,extra={}) {
  const headers=new Headers(HEADERS);
  for(const [key,val] of Object.entries(extra))headers.set(key,val);
  const origin=allowOrigin(request,env);
  if(origin){
    headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Credentials','true');
    headers.set('Access-Control-Allow-Headers','Accept, Content-Type, X-CSRF-Token');
    headers.set('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
  }
  return new Response(value === null ? null : JSON.stringify(value),{status,headers});
}
function fail(req,env,code,status=400,extra={}) {
  return response(req,env,{error:code},status,extra);
}
function randomToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function hex(bytes) {return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
}
async function hmac(key,value) {
  const material=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',material,encoder.encode(value)));
}
function constantEquals(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function cookie(request,name) {
  const str=request.headers.get('Cookie')||'';
  if(str.length>4096)return null;
  const match=str.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  const value=match?.slice(name.length+1)||'';
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
function makeCookie(name,value,seconds) {
  return name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+seconds;
}
function expireCookie(name) {return makeCookie(name,'',0);}
function sameOrigin(request,env) {return request.headers.get('Origin') === env.AUTH_SITE_ORIGIN;}
function now() {return Math.floor(Date.now()/1000);}
function safeGitHubName(value) {
  const text=typeof value==='string'?value:'';
  const base=text.replace(/[^a-zA-Z0-9_]/g,'_').replace(/^_+|_+$/g,'').slice(0,20);
  return base.length>=3?base:'creator';
}
function displayName(value,fallback) {
  if(typeof value!=='string')return fallback;
  const trimmed=value.trim();
  return trimmed.length>0 && Array.from(trimmed).length<=80 && !/[\x00-\x1f\x7f<>]/.test(trimmed)
    ? trimmed : fallback;
}
function pickUser(row) {
  return {handle:row.handle,display_name:row.display_name,bio:row.bio??'',created_at:row.created_at};
}
function safeHandle(value) {
  return typeof value==='string'&&/^[A-Za-z0-9_]{3,32}$/.test(value);
}
function validationProfile(value) {
  if(!value||Array.isArray(value)||typeof value!=='object')return null;
  if(Object.keys(value).some(key=>!['handle','display_name','bio'].includes(key)))return null;
  if(!['handle','display_name','bio'].every(k=>Object.hasOwn(value,k)))return null;
  const {handle,display_name,bio}=value;
  if(!safeHandle(handle))return null;
  if(typeof display_name!=='string'||!display_name.trim()||Array.from(display_name.trim()).length>80)return null;
  if(typeof bio!=='string'||Array.from(bio).length>500)return null;
  if(/[\x00-\x1f\x7f<>]/.test(display_name)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/.test(bio))return null;
  return {handle,display_name:display_name.trim(),bio:bio.trim()};
}
async function jsonBody(request,maxBytes=2048) {
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return null;
  const declared=Number(request.headers.get('Content-Length')||0);
  if(declared>maxBytes)return null;
  if(!request.body)return null;
  const reader=request.body.getReader();
  let size=0,parts=[];
  try {
    for(;;){
      const next=await reader.read();
      if(next.done)break;
      size+=next.value.byteLength;
      if(size>maxBytes){await reader.cancel();return null;}
      parts.push(next.value);
    }
    const all=new Uint8Array(size);
    let index=0;for(const part of parts){all.set(part,index);index+=part.byteLength;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  }catch(_){return null;}
}
async function validateSession(request,env) {
  const token=cookie(request,SESSION_COOKIE);
  if(!token)return null;
  const hash=await sha256('session:'+token);
  const user=await env.DB.prepare(
    "SELECT u.id, u.handle, u.display_name, u.bio, u.created_at, s.expires_at "+
    "FROM auth_sessions s JOIN community_users u ON u.id=s.user_id "+
    "WHERE s.session_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1"
  ).bind(hash,now()).first();
  return user?{user,token,hash,csrf:await hmac(env.AUTH_SESSION_SECRET,'csrf:'+token)}:null;
}
async function recordLoginAttempt(request,env) {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const windowStart=Math.floor(now()/900)*900;
  const hash=await hmac(env.AUTH_PEPPER,'rate:'+ip);
  const row=await env.DB.prepare(
    'INSERT INTO auth_rate_windows(bucket_hash,window_start,count) VALUES(?,?,1) '+
    'ON CONFLICT(bucket_hash) DO UPDATE SET count=CASE WHEN auth_rate_windows.window_start=excluded.window_start '+
    'THEN auth_rate_windows.count+1 ELSE 1 END, window_start=excluded.window_start '+
    'WHERE auth_rate_windows.window_start!=excluded.window_start OR auth_rate_windows.count<8 RETURNING count'
  ).bind(hash,windowStart).first();
  return Boolean(row);
}
async function loginStart(request,env) {
  if(!(await recordLoginAttempt(request,env)))return fail(request,env,'too_many_attempts',429);
  const state=randomToken(),verifier=randomToken(),binder=randomToken();
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(verifier));
  const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  await env.DB.prepare(
    'INSERT INTO oauth_flows(state_hash,binder_hash,pkce_verifier,expires_at) VALUES(?,?,?,?)'
  ).bind(await sha256('state:'+state),await sha256('bind:'+binder),verifier,now()+FLOW_TTL).run();
  const redirect=env.AUTH_API_ORIGIN+'/v1/auth/github/callback';
  const url=new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id',env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri',redirect);
  url.searchParams.set('state',state);
  url.searchParams.set('scope','read:user');
  url.searchParams.set('code_challenge',challenge);
  url.searchParams.set('code_challenge_method','S256');
  return response(request,env,null,302,{
    'Location':url.toString(),'Set-Cookie':makeCookie(LOGIN_COOKIE,binder,FLOW_TTL)
  });
}
async function githubAccount(code,verifier,env,providerFetch) {
  const tokenResponse=await providerFetch('https://github.com/login/oauth/access_token',{
    method:'POST',redirect:'error',headers:{
      'Content-Type':'application/x-www-form-urlencoded',
      'Accept':'application/json','User-Agent':'BAS-Community-Auth'
    },
    body:new URLSearchParams({
      client_id:env.GITHUB_CLIENT_ID,
      client_secret:env.GITHUB_CLIENT_SECRET,
      code,redirect_uri:env.AUTH_API_ORIGIN+'/v1/auth/github/callback',code_verifier:verifier
    })
  });
  if(!tokenResponse.ok)throw Error('oauth_code_exchange_failed');
  const token=await tokenResponse.json();
  if(typeof token?.access_token!=='string'||!token.access_token)return null;
  const identityResponse=await providerFetch('https://api.github.com/user',{
    method:'GET',redirect:'error',
    headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+token.access_token,'User-Agent':'BAS-Community-Auth'}
  });
  if(!identityResponse.ok)throw Error('oauth_identity_failed');
  const identity=await identityResponse.json();
  const subject=String(identity?.id??'');
  if(!/^[1-9][0-9]{0,19}$/.test(subject))return null;
  return {subject,handle:safeGitHubName(identity.login),display:displayName(identity.name,safeGitHubName(identity.login))};
}
async function upsertIdentity(env,profile) {
  const subjectHash=await hmac(env.AUTH_PEPPER,'identity:github:'+profile.subject);
  const existing=await env.DB.prepare(
    'SELECT u.id,u.handle,u.display_name,u.status FROM account_identities i '+
    "JOIN community_users u ON u.id=i.user_id WHERE i.provider='github' AND i.provider_subject_hash=? LIMIT 1"
  ).bind(subjectHash).first();
  if(existing)return existing.status==='active'?existing:null;
  // Collision-safe account creation, never link by an unverified username or display name.
  for(let attempt=0;attempt<3;attempt++){
    const userId=randomToken(),identityId=randomToken();
    const suffix=attempt?('_'+randomToken().slice(0,6)):'';
    const handle=profile.handle.slice(0,32-suffix.length)+suffix;
    try{
      await env.DB.batch([
        env.DB.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)').bind(userId,handle,profile.display),
        env.DB.prepare('INSERT INTO account_identities(id,user_id,provider,provider_subject_hash) VALUES(?,?,?,?)').bind(identityId,userId,'github',subjectHash)
      ]);
      return {id:userId,handle,display_name:profile.display,status:'active'};
    }catch(_){
      const raced=await env.DB.prepare(
        "SELECT u.id,u.handle,u.display_name,u.status FROM account_identities i "+
        "JOIN community_users u ON u.id=i.user_id WHERE i.provider='github' AND i.provider_subject_hash=? LIMIT 1"
      ).bind(subjectHash).first();
      if(raced)return raced.status==='active'?raced:null;
    }
  }
  return null;
}
async function loginCallback(request,env,url,providerFetch) {
  const state=url.searchParams.get('state'),code=url.searchParams.get('code'),binder=cookie(request,LOGIN_COOKIE);
  const gone={'Set-Cookie':expireCookie(LOGIN_COOKIE)};
  if(!state||!code||!binder||!(/^[A-Za-z0-9_-]{43}$/.test(state))||code.length>2048) {
    return fail(request,env,'oauth_state_invalid',400,gone);
  }
  const row=await env.DB.prepare(
    'DELETE FROM oauth_flows WHERE state_hash=? AND binder_hash=? AND expires_at>? RETURNING pkce_verifier'
  ).bind(await sha256('state:'+state),await sha256('bind:'+binder),now()-CLOCK_SKEW_SECONDS).first();
  if(!row)return fail(request,env,'oauth_state_invalid',400,gone);
  let profile;
  try{profile=await githubAccount(code,row.pkce_verifier,env,providerFetch);}
  catch(_){return fail(request,env,'oauth_provider_unavailable',503,gone);}
  if(!profile)return fail(request,env,'oauth_identity_invalid',403,gone);
  // Private beta: an explicit provider-ID allowlist is mandatory until a separate public signup approval.
  const betaIds=String(env.AUTH_BETA_GITHUB_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!betaIds.includes(profile.subject) && env.AUTH_PUBLIC_SIGNUP_APPROVED!=='true')
    return fail(request,env,'beta_not_allowed',403,gone);
  const user=await upsertIdentity(env,profile);
  if(!user)return fail(request,env,'account_unavailable',403,gone);
  const sessionToken=randomToken();
  await env.DB.prepare(
    'INSERT INTO auth_sessions(session_hash,user_id,expires_at) VALUES(?,?,?)'
  ).bind(await sha256('session:'+sessionToken),user.id,now()+SESSION_TTL).run();
  const res=response(request,env,null,302,{
    'Location':env.AUTH_SITE_ORIGIN+'/#bas-community',
    'Set-Cookie':makeCookie(SESSION_COOKIE,sessionToken,SESSION_TTL)
  });
  // Clearing flow cookie requires a second Set-Cookie header. Headers.append preserves both.
  res.headers.append('Set-Cookie',expireCookie(LOGIN_COOKIE));
  return res;
}
async function me(request,env) {
  const session=await validateSession(request,env);
  if(!session)return fail(request,env,'not_authenticated',401);
  return response(request,env,{user:pickUser(session.user),csrf:session.csrf},200);
}
async function profileUpdate(request,env) {
  if(!sameOrigin(request,env))return fail(request,env,'origin_forbidden',403);
  const session=await validateSession(request,env);
  if(!session)return fail(request,env,'not_authenticated',401);
  if(!constantEquals(request.headers.get('X-CSRF-Token'),session.csrf))return fail(request,env,'csrf_invalid',403);
  const profile=validationProfile(await jsonBody(request));
  if(!profile)return fail(request,env,'invalid_profile',400);
  try{
    const result=await env.DB.prepare(
      "UPDATE community_users SET handle=?,display_name=?,bio=?,updated_at=unixepoch() "+
      "WHERE id=? AND status='active' RETURNING id,handle,display_name,bio,created_at"
    ).bind(profile.handle,profile.display_name,profile.bio,session.user.id).first();
    if(!result)return fail(request,env,'account_unavailable',403);
    return response(request,env,{user:pickUser(result)},200);
  }catch(_){return fail(request,env,'profile_update_conflict',409);}
}
async function logout(request,env) {
  if(!sameOrigin(request,env))return fail(request,env,'origin_forbidden',403);
  const session=await validateSession(request,env);
  if(!session)return fail(request,env,'not_authenticated',401);
  if(!constantEquals(request.headers.get('X-CSRF-Token'),session.csrf))return fail(request,env,'csrf_invalid',403);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE session_hash=?').bind(session.hash).run();
  return response(request,env,{ok:true},200,{'Set-Cookie':expireCookie(SESSION_COOKIE)});
}
export async function handleAuth(request,env,url,providerFetch=fetch) {
  if(!url.pathname.startsWith(AUTH_API_PREFIX))return null;
  if(!authConfigured(env))return fail(request,env,'auth_unavailable',503);
  if(url.origin!==env.AUTH_API_ORIGIN)return fail(request,env,'origin_mismatch',403);
  if(request.method==='OPTIONS'){
    const allowed=allowOrigin(request,env);
    return response(request,env,null,204,allowed?{}:{});
  }
  if(url.pathname==='/v1/auth/github/start' && request.method==='GET') {
    try{return await loginStart(request,env);}catch(_){return fail(request,env,'auth_unavailable',503);}
  }
  if(url.pathname==='/v1/auth/github/callback' && request.method==='GET') {
    try{return await loginCallback(request,env,url,providerFetch);}catch(_){return fail(request,env,'auth_unavailable',503);}
  }
  if(url.pathname==='/v1/auth/me' && request.method==='GET') {
    try{return await me(request,env);}catch(_){return fail(request,env,'auth_unavailable',503);}
  }
  if(url.pathname==='/v1/auth/profile' && request.method==='PATCH') {
    try{return await profileUpdate(request,env);}catch(_){return fail(request,env,'auth_unavailable',503);}
  }
  if(url.pathname==='/v1/auth/logout' && request.method==='POST') {
    try{return await logout(request,env);}catch(_){return fail(request,env,'auth_unavailable',503);}
  }
  return fail(request,env,'not_found',404);
}
