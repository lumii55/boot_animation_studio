import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalServer, databaseBinding } from '../dev-server.mjs';
import { handleAuth, authConfigured } from '../src/auth.mjs';
import worker from '../src/index.mjs';

const API='http://127.0.0.1:8788';
const SITE='http://127.0.0.1:8088';
const mockFetch=async (url,options) => {
  if (url==='https://github.com/login/oauth/access_token') {
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'manual');
    assert.equal(options.body.get('code_verifier')?.length,43);
    assert.equal(options.body.get('redirect_uri'),API+'/v1/auth/github/callback');
    assert.equal(options.body.get('client_secret'),'FAKE_ONLY_TEST_OAUTH_SECRET_123');
    return new Response(JSON.stringify({access_token:'FAKE_EPHEMERAL_TOKEN',token_type:'bearer'}),{status:200});
  }
  if (url==='https://api.github.com/user') {
    assert.equal(options.headers.Authorization,'Bearer FAKE_EPHEMERAL_TOKEN');
    assert.equal(options.redirect,'manual');
    return new Response(JSON.stringify({id:12345,login:'test-moon',name:'Moonlight Creator'}),{status:200});
  }
  throw Error('Unexpected network request: '+url);
};
function environment(instance,overrides={}){
  return {
    DB:databaseBinding(instance.database),AUTH_ENABLED:'true',AUTH_DEPLOYMENT_APPROVED:'true',
    AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:SITE,
    GITHUB_CLIENT_ID:'Iv1_FAKE_TEST_ONLY',GITHUB_CLIENT_SECRET:'FAKE_ONLY_TEST_OAUTH_SECRET_123',
    AUTH_PEPPER:'PEPPER_FOR_TESTING_ONLY_0123456789abcdefghij',
    AUTH_SESSION_SECRET:'SESSION_KEY_FOR_TESTING_ONLY_0123456789abcdefghij',
    AUTH_BETA_GITHUB_IDS:'12345',AUTH_PUBLIC_SIGNUP_APPROVED:'false',
    ...overrides
  };
}
function req(path,method='GET',header={},body){
  return new Request(API+path,{method,headers:header,body});
}
async function call(request,env,providerFetch=mockFetch){
  return handleAuth(request,env,new URL(request.url),providerFetch);
}
function cookieFrom(res,name){
  const values=res.headers.getSetCookie();
  const pair=values.find(v=>v.startsWith(name+'='));
  return pair ? pair.split(';')[0] : null;
}
async function boot(t){
  const inst=createLocalServer({memory:true});
  t.after(()=>inst.database.close());
  return inst;
}
async function start(env,ip='192.0.2.1'){
  const res=await call(req('/v1/auth/github/start','GET',{'CF-Connecting-IP':ip}),env);
  assert.equal(res.status,302);
  const link=new URL(res.headers.get('Location'));
  assert.equal(link.origin,'https://github.com');
  assert.equal(link.searchParams.get('code_challenge_method'),'S256');
  assert.equal(link.searchParams.get('scope'),'read:user');
  assert.equal(link.searchParams.get('prompt'),'select_account');
  assert.equal(link.searchParams.get('code_challenge')?.length,43);
  const c=cookieFrom(res,'__Host-bas_oauth');
  assert.ok(c);
  assert.match(res.headers.get('set-cookie'),/HttpOnly/);
  assert.match(res.headers.get('set-cookie'),/SameSite=Lax/);
  assert.match(res.headers.get('set-cookie'),/Secure/);
  return {state:link.searchParams.get('state'),binder:c,challenge:link.searchParams.get('code_challenge')};
}
async function callback(env,startData,headers={}){
  return call(req('/v1/auth/github/callback?state='+startData.state+'&code=FAKE_AUTHORIZATION_CODE','GET',{
    Cookie:startData.binder,...headers
  }),env);
}
test('auth disabled by default; configuration and site topology must be complete',async t=>{
  const inst=await boot(t);
  assert.equal(authConfigured({...environment(inst),AUTH_ENABLED:'false'}),false);
  assert.equal(authConfigured({...environment(inst),GITHUB_CLIENT_SECRET:''}),false);
  assert.equal(authConfigured({...environment(inst),AUTH_SITE_ORIGIN:'https://lumii55.github.io',AUTH_API_ORIGIN:'https://sample.workers.dev'}),false);
  assert.equal(authConfigured({...environment(inst),AUTH_SITE_ORIGIN:'https://bas-preview.workers.dev',AUTH_API_ORIGIN:'https://bas-preview.workers.dev'}),true);
  const disabled=await call(req('/v1/auth/me'),environment(inst,{AUTH_ENABLED:'false'}));
  assert.equal(disabled.status,503);
  const publicWorker=await worker.fetch(req('/v1/uploads','POST'),environment(inst));
  assert.equal(publicWorker.status,403);
});
test('GitHub OAuth start uses state, PKCE, confidential cookies and rate limits',async t=>{
  const inst=await boot(t),env=environment(inst);
  const first=await start(env);
  const q=inst.database.prepare('SELECT pkce_verifier FROM oauth_flows').get();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(q.pkce_verifier));
  const challenge=Buffer.from(digest).toString('base64url');
  assert.equal(challenge,first.challenge);
  const next=await start(env); assert.notEqual(first.state,next.state);
  for(let n=2;n<8;n++) await start(env);
  const last=await call(req('/v1/auth/github/start','GET',{'CF-Connecting-IP':'192.0.2.1'}),env);
  assert.equal(last.status,429);
  assert.equal((await last.json()).error,'too_many_attempts');
  const other=await start(env,'192.0.2.2');
  assert.ok(other.state);
});
test('wrong OAuth state/cookie cannot authenticate, while valid callback is one-time',async t=>{
  const inst=await boot(t),env=environment(inst);
  const begin=await start(env);
  const invalid=await call(req('/v1/auth/github/callback?state='+begin.state+'&code=x','GET',{
    Cookie:'__Host-bas_oauth=1234567890123456789012345678901234567890123'
  }),env);
  assert.equal(invalid.status,400);
  const authenticated=await callback(env,begin);
  assert.equal(authenticated.status,302);
  const session=cookieFrom(authenticated,'__Host-bas_session');
  assert.ok(session);
  assert.equal(authenticated.headers.get('Location'),SITE+'/#bas-community');
  const replay=await callback(env,begin);
  assert.equal(replay.status,400);
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM community_users').get().n,1);
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM account_identities').get().n,1);
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM auth_sessions').get().n,1);
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM oauth_flows').get().n,0);
});
test('beta allowlist blocks a valid GitHub identity until approved',async t=>{
  const inst=await boot(t),env=environment(inst,{AUTH_BETA_GITHUB_IDS:'67890'});
  const begin=await start(env);
  const res=await callback(env,begin);
  assert.equal(res.status,403);
  assert.equal((await res.json()).error,'beta_not_allowed');
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM community_users').get().n,0);
});
test('staging-only signup admits a second GitHub account without disabling the beta catalogue',async t=>{
  const inst=await boot(t),env=environment(inst,{
    AUTH_BETA_GITHUB_IDS:'67890',
    AUTH_STAGING_TEST_SIGNUP_ENABLED:'true',
    BETA_CATALOG_ENABLED:'true',
    PUBLIC_CATALOG_ENABLED:'false',
    COMMUNITY_GUEST_READ_ENABLED:'true'
  });
  const begin=await start(env);
  const res=await callback(env,begin);
  assert.equal(res.status,302);
  assert.equal(inst.database.prepare('SELECT COUNT(*) AS n FROM community_users').get().n,1);
  const visibility=inst.database.prepare('SELECT avatar_public,banner_public FROM community_users LIMIT 1').get();
  assert.equal(visibility.avatar_public,1,'new avatar visibility starts on');
  assert.equal(visibility.banner_public,1,'new banner visibility starts on');
  const catalog=await worker.fetch(req('/v1/beta/catalog'),env);
  assert.equal(catalog.status,200,'new accounts must not disable the beta catalogue');
  assert.deepEqual((await catalog.json()).items,[]);
});
test('staging signup cannot bypass public-launch and disabled-catalogue safety gates',async t=>{
  const inst=await boot(t);
  for(const fields of [
    {PUBLIC_CATALOG_ENABLED:'true'},
    {BETA_CATALOG_ENABLED:'false'}
  ]){
    const env=environment(inst,{
      AUTH_BETA_GITHUB_IDS:'67890',
      AUTH_STAGING_TEST_SIGNUP_ENABLED:'true',
      BETA_CATALOG_ENABLED:'true',
      PUBLIC_CATALOG_ENABLED:'false',
      ...fields
    });
    const result=await callback(env,await start(env,'192.0.2.20'));
    assert.equal(result.status,403);
    assert.equal((await result.json()).error,'beta_not_allowed');
  }
});
test('profile updates require session, correct origin and CSRF, then enforce bounds',async t=>{
  const inst=await boot(t),env=environment(inst);
  const begin=await start(env);
  const accepted=await callback(env,begin);
  const session=cookieFrom(accepted,'__Host-bas_session');
  const authHeader={Cookie:session,Origin:SITE};
  const r=await call(req('/v1/auth/me','GET',authHeader),env);
  assert.equal(r.status,200);
  const result=await r.json();
  assert.equal(result.user.handle,'test_moon');
  assert.ok(/^[a-f0-9]{64}$/.test(result.csrf));
  assert.equal(r.headers.get('access-control-allow-origin'),SITE);
  assert.equal(r.headers.get('access-control-allow-credentials'),'true');
  const badOrigin=await call(req('/v1/auth/profile','PATCH',{
    Cookie:session,Origin:'https://attacker.example','X-CSRF-Token':result.csrf,'Content-Type':'application/json'
  },JSON.stringify({handle:'safe_x',display_name:'Okay',bio:'Hello'})),env);
  assert.equal(badOrigin.status,403);
  const noCsrf=await call(req('/v1/auth/profile','PATCH',{
    ...authHeader,'Content-Type':'application/json'
  },JSON.stringify({handle:'safe_x',display_name:'Okay',bio:'Hello'})),env);
  assert.equal(noCsrf.status,403);
  const headers={...authHeader,'X-CSRF-Token':result.csrf,'Content-Type':'application/json'};
  const invalid=await call(req('/v1/auth/profile','PATCH',headers,JSON.stringify({
    handle:'safe_x',display_name:'<script>alert(1)</script>',bio:''
  })),env);
  assert.equal(invalid.status,400);
  const huge=await call(req('/v1/auth/profile','PATCH',headers,JSON.stringify({
    handle:'safe_x',display_name:'Okay',bio:'x'.repeat(4000)
  })),env);
  assert.equal(huge.status,400);
  const updated=await call(req('/v1/auth/profile','PATCH',headers,JSON.stringify({
    handle:'moon_bloom',display_name:'Lua 🌙',bio:'Meu cantinho de animações!'
  })),env);
  assert.equal(updated.status,200);
  const data=await updated.json();
  assert.equal(data.user.display_name,'Lua 🌙');
  assert.equal(data.user.handle,'moon_bloom');
  assert.equal(data.user.bio,'Meu cantinho de animações!');
  assert.equal(JSON.stringify(data).includes('AUTH_PEPPER'),false);
  const invalidNext=await call(req('/v1/auth/profile','PATCH',headers,JSON.stringify({
    handle:'x',display_name:'Okay',bio:''
  })),env);
  assert.equal(invalidNext.status,400);
});
test('logout revokes server session and requires CSRF',async t=>{
  const inst=await boot(t),env=environment(inst);
  const begin=await start(env),login=await callback(env,begin);
  const session=cookieFrom(login,'__Host-bas_session');
  const info=await(await call(req('/v1/auth/me','GET',{Cookie:session}),env)).json();
  const forged=await call(req('/v1/auth/logout','POST',{Cookie:session,Origin:SITE}),env);
  assert.equal(forged.status,403);
  const logout=await call(req('/v1/auth/logout','POST',{Cookie:session,Origin:SITE,'X-CSRF-Token':info.csrf}),env);
  assert.equal(logout.status,200);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  const me=await call(req('/v1/auth/me','GET',{Cookie:session}),env);
  assert.equal(me.status,401);
});
test('existing verified GitHub identity is reused, never linked by handle',async t=>{
  const inst=await boot(t),env=environment(inst);
  const a=await start(env);await callback(env,a);
  const b=await start(env);await callback(env,b);
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM community_users').get().n,1);
  assert.equal(inst.database.prepare('SELECT count(*) as n FROM account_identities').get().n,1);
});

test('GitHub OAuth token errors use allowlisted diagnostics without leaking credentials',async t=>{
  const cases=[
    [{error:'incorrect_client_credentials'},'oauth_github_client_credentials'],
    [{error:'redirect_uri_mismatch'},'oauth_github_redirect_uri_mismatch'],
    [{error:'bad_verification_code'},'oauth_github_code_invalid'],
    [{error:'unverified_user_email'},'oauth_github_email_unverified'],
    [{error:'some_unknown_provider_value'},'oauth_github_token_rejected']
  ];
  for(const [json,expected] of cases){
    const instance=createLocalServer({memory:true});
    t.after(()=>instance.database.close());
    const env=environment(instance),begin=await start(env, '192.0.2.55');
    const provider=async()=>new Response(JSON.stringify(json),{status:200});
    const res=await call(req('/v1/auth/github/callback?state='+begin.state+'&code=FAKE_CODE','GET',
      {Cookie:begin.binder}),env,provider);
    assert.equal(res.status,503);
    const output=await res.json();
    assert.equal(output.error,expected);
    assert.equal(Object.keys(output).length,1);
    assert.equal(res.headers.get('Cache-Control'),'no-store, private');
    assert.match(res.headers.get('Set-Cookie'),/Max-Age=0/);
    assert.ok(!JSON.stringify(output).includes(env.GITHUB_CLIENT_SECRET));
    assert.equal(instance.database.prepare('SELECT count(*) as n FROM community_users').get().n,0);
  }
});

test('GitHub provider failures distinguish network/HTTP/invalid responses and identities',async t=>{
  const scenarios=[
    [async()=>{throw Error('FAKE_SENSITIVE_PROVIDER_ERROR');},'oauth_github_token_network_error'],
    [async()=>new Response(JSON.stringify({error:'incorrect_client_credentials'}),{status:401}),'oauth_github_client_credentials'],
    [async()=>new Response('not json',{status:502}),'oauth_github_token_invalid_response'],
    [async url=>url.includes('access_token')
      ? new Response(JSON.stringify({access_token:'FAKE_TOKEN'}))
      : new Response(JSON.stringify({message:'denied'}),{status:403}),'oauth_github_identity_forbidden'],
    [async url=>url.includes('access_token')
      ? new Response(JSON.stringify({access_token:'FAKE_TOKEN'}))
      : Promise.reject(Error('FAKE_SECRET_NETWORK')),'oauth_github_identity_network_error']
  ];
  for(const [provider,expected] of scenarios) {
    const instance=createLocalServer({memory:true});
    t.after(()=>instance.database.close());
    const env=environment(instance),begin=await start(env,'192.0.2.88');
    const res=await call(req('/v1/auth/github/callback?state='+begin.state+'&code=FAKE_CODE','GET',
      {Cookie:begin.binder}),env,provider);
    assert.equal(res.status,503,expected);
    const output=await res.json();
    assert.equal(output.error,expected);
    assert.ok(!JSON.stringify(output).includes('FAKE_SENSITIVE_PROVIDER_ERROR'));
    assert.ok(!JSON.stringify(output).includes('FAKE_SECRET_NETWORK'));
  }
});


test('Cloudflare Workers OAuth outbound requests use supported manual redirect handling',async t=>{
  const instance=createLocalServer({memory:true});
  t.after(()=>instance.database.close());
  const env=environment(instance);
  const begin=await start(env,'192.0.2.91');
  const modes=[];
  const provider=async (url,options)=>{
    modes.push({url,redirect:options.redirect});
    if(options.redirect==='error')throw new TypeError('Cloudflare Workers does not implement error redirect mode');
    if(url.includes('access_token'))
      return new Response(JSON.stringify({access_token:'FAKE_WORKERS_TEST_TOKEN'}),{status:200});
    if(url==='https://api.github.com/user')
      return new Response(JSON.stringify({id:12345,login:'test-moon',name:'Cloudflare User'}),{status:200});
    throw Error('unexpected request');
  };
  const callbackResponse=await call(req('/v1/auth/github/callback?state='+begin.state+'&code=TEST_CODE','GET',
    {Cookie:begin.binder}),env,provider);
  assert.equal(callbackResponse.status,302);
  assert.equal(modes.length,2);
  assert.ok(modes.every(x=>x.redirect==='manual'));
  assert.equal(instance.database.prepare('SELECT count(*) as n FROM community_users').get().n,1);
});

test('provider redirects are denied without following Location or leaking response',async t=>{
  const cases=[
    ['token','oauth_github_token_redirect_blocked'],
    ['identity','oauth_github_identity_redirect_blocked']
  ];
  for(const [stage,expected] of cases){
    const instance=createLocalServer({memory:true});
    t.after(()=>instance.database.close());
    const env=environment(instance), begin=await start(env,'192.0.2.92');
    const provider=async(url,options)=>{
      assert.equal(options.redirect,'manual');
      const tokenStage=url.includes('access_token');
      if((stage==='token'&&tokenStage)||(stage==='identity'&&!tokenStage))
        return new Response(null,{status:302,headers:{Location:'https://untrusted.example/?sensitive=FAKE_CREDENTIAL'}});
      return new Response(JSON.stringify({access_token:'FAKE_EPHEMERAL_TOKEN'}),{status:200});
    };
    const res=await call(req('/v1/auth/github/callback?state='+begin.state+'&code=FAKE_CODE','GET',
      {Cookie:begin.binder}),env,provider);
    assert.equal(res.status,503);
    const output=await res.json();
    assert.equal(output.error,expected);
    assert.equal(JSON.stringify(output).includes('FAKE_CREDENTIAL'),false);
    assert.equal(instance.database.prepare('SELECT count(*) as n FROM community_users').get().n,0);
  }
});

test('BAS local OAuth PKCE handoff returns a single-use grant, never a second website',async t=>{
  const instance=await boot(t);
  const env=environment(instance,{
    AUTH_SITE_ORIGIN:API,
    BAS_LOCAL_CLIENT_ENABLED:'true',
    BAS_LOCAL_ORIGINS:'http://127.0.0.1:8088,https://lumii55.github.io',
    BETA_PORTAL_ENABLED:'false'
  });
  const verifier=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(verifier))).toString('base64url');
  const source='http://127.0.0.1:8088/';
  const startPath='/v1/auth/github/start?mode=bas-local&return_to='+
    encodeURIComponent(source)+'&challenge='+encodeURIComponent(challenge);
  let r=await call(req(startPath),env);
  assert.equal(r.status,302);
  const link=new URL(r.headers.get('Location'));
  const oauthCookie=cookieFrom(r,'__Host-bas_oauth');
  const state=link.searchParams.get('state');
  assert.ok(oauthCookie);assert.equal(link.searchParams.get('code_challenge_method'),'S256');
  r=await call(req('/v1/auth/github/callback?state='+state+'&code=FAKE_AUTHORIZATION_CODE','GET',
    {Cookie:oauthCookie}),env);
  assert.equal(r.status,302);
  const dest=new URL(r.headers.get('Location'));
  assert.equal(dest.origin,'http://127.0.0.1:8088');
  assert.equal(dest.pathname,'/');
  assert.match(dest.hash,/^#bas-community-auth=[A-Za-z0-9_-]{43}$/);
  assert.equal(cookieFrom(r,'__Host-bas_session'),null);
  const grant=dest.hash.slice('#bas-community-auth='.length);
  assert.equal(instance.database.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,0);
  const post=(v,origin='http://127.0.0.1:8088')=>worker.fetch(req('/v1/auth/local/exchange',
    'POST',{Origin:origin,'Content-Type':'application/json'},
    JSON.stringify(v)),env);
  r=await post({grant,verifier});
  assert.equal(r.status,200,await r.clone().text());
  assert.equal(r.headers.get('access-control-allow-origin'),'http://127.0.0.1:8088');
  const auth=await r.json();
  assert.match(auth.access_token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(auth.token_type,'Bearer');
  assert.equal((await post({grant,verifier})).status,403);
  const localHeaders={Origin:'http://127.0.0.1:8088',Authorization:'Bearer '+auth.access_token};
  r=await worker.fetch(req('/v1/auth/me','GET',localHeaders),env);
  assert.equal(r.status,200);
  const me=await r.json();assert.equal(me.user.handle,'test_moon');
  r=await worker.fetch(req('/v1/auth/profile','PATCH',{
    ...localHeaders,'X-CSRF-Token':me.csrf,'Content-Type':'application/json'},
    JSON.stringify({handle:'native_creator',display_name:'BAS Local',bio:'Directly in BAS'})),env);
  assert.equal(r.status,200,await r.clone().text());
  r=await worker.fetch(req('/v1/auth/me','GET',{...localHeaders,
    Origin:'https://evil.example'}),env);
  assert.equal(r.status,401);
  r=await worker.fetch(req('/v1/auth/logout','POST',{
    ...localHeaders,'X-CSRF-Token':me.csrf,'Content-Type':'application/json'},'{}'),env);
  assert.equal(r.status,200);
  assert.equal((await worker.fetch(req('/v1/auth/me','GET',localHeaders),env)).status,401);
});
test('BAS local login cannot redirect OAuth to unapproved sites or fake challenges',async t=>{
 const inst=await boot(t);
 const env=environment(inst,{
  AUTH_SITE_ORIGIN:API,BAS_LOCAL_CLIENT_ENABLED:'true',
  BAS_LOCAL_ORIGINS:'http://127.0.0.1:8088,https://lumii55.github.io'
 });
 const testCase=async(url,challenge='A'.repeat(43))=>{
  const path='/v1/auth/github/start?mode=bas-local&return_to='+encodeURIComponent(url)+
   '&challenge='+encodeURIComponent(challenge);
  const r=await call(req(path),env);
  assert.equal(r.status,403,url);assert.equal((await r.json()).error,'local_redirect_not_allowed');
 };
 await testCase('https://evil.example/');
 await testCase('https://lumii55.github.io/');
 await testCase('http://127.0.0.1:8088/?redirect=https://evil.example');
 await testCase('http://localhost:8088/');
 await testCase('http://127.0.0.1:8088/','invalid');
 assert.equal(inst.database.prepare('SELECT count(*) n FROM oauth_flows').get().n,0);
});

test('private administrator OAuth grant creates admin-scoped session only for server-allowed owner',async t=>{
 const instance=await boot(t);
 const adminSite='http://127.0.0.1:8090';
 const env=environment(instance,{
  AUTH_SITE_ORIGIN:API,
  ADMIN_PANEL_SEPARATED:'true',
  BAS_ADMIN_CLIENT_ENABLED:'true',
  BAS_ADMIN_ORIGIN:adminSite,
  MODERATION_STAGING_APPROVED:'true',
  MODERATOR_USER_IDS:''
 });
 // First establish an existing verified owner account in D1.
 const previous=await start(env);
 await callback(env,previous);
 const owner=instance.database.prepare("SELECT id FROM community_users LIMIT 1").get().id;
 const verifier=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
 const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(verifier))).toString('base64url');
 const path='/v1/auth/github/start?mode=bas-local&return_to='+
  encodeURIComponent(adminSite+'/')+'&challenge='+challenge;
 let r=await call(req(path),env);
 assert.equal(r.status,302);
 const state=new URL(r.headers.get('location')).searchParams.get('state');
 const binder=cookieFrom(r,'__Host-bas_oauth');
 // Fails closed even for valid GitHub identity until owner approved.
 r=await call(req('/v1/auth/github/callback?state='+state+'&code=VALID_TEST','GET',{
  Cookie:binder}),env);
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,'admin_access_denied');
 assert.equal(instance.database.prepare("SELECT COUNT(*) n FROM oauth_local_grants").get().n,0);
 env.MODERATOR_USER_IDS=owner;
 r=await call(req(path),env);
 assert.equal(r.status,302);
 const state2=new URL(r.headers.get('location')).searchParams.get('state');
 const cookie2=cookieFrom(r,'__Host-bas_oauth');
 r=await call(req('/v1/auth/github/callback?state='+state2+'&code=VALID_TEST','GET',
  {Cookie:cookie2}),env);
 assert.equal(r.status,302);
 const grant=new URL(r.headers.get('location')).hash.split('=')[1];
 r=await worker.fetch(req('/v1/auth/local/exchange','POST',{
  Origin:adminSite,'Content-Type':'application/json'
 },JSON.stringify({grant,verifier})),env);
 assert.equal(r.status,200,await r.clone().text());
 const adminToken=(await r.json()).access_token;
 const hash=await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode('session:'+adminToken));
 const hex=Buffer.from(hash).toString('hex');
 assert.equal(instance.database.prepare('SELECT client_kind FROM auth_sessions WHERE session_hash=?').get(hex).client_kind,'admin');
 r=await worker.fetch(req('/v1/auth/me','GET',{Origin:adminSite,Authorization:'Bearer '+adminToken}),env);
 assert.equal(r.status,200);
 env.BAS_LOCAL_CLIENT_ENABLED='true';
 env.BAS_LOCAL_ORIGINS='http://127.0.0.1:8088';
 r=await worker.fetch(req('/v1/auth/me','GET',{
  Origin:'http://127.0.0.1:8088',Authorization:'Bearer '+adminToken}),env);
 assert.equal(r.status,401);
});
