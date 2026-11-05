import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {Script} from 'node:vm';
const base='https://beta-test.workers.dev';
const env={
 AUTH_ENABLED:'true',AUTH_DEPLOYMENT_APPROVED:'true',AUTH_API_ORIGIN:base,AUTH_SITE_ORIGIN:base,
 AUTH_BETA_GITHUB_IDS:'12345',AUTH_PUBLIC_SIGNUP_APPROVED:'false',BETA_PORTAL_ENABLED:'true',
 GITHUB_CLIENT_ID:'Iv1_TEST',GITHUB_CLIENT_SECRET:'TEST_ONLY_SECRET_1234567890',
 AUTH_PEPPER:'TEST_PEPPER_12345678901234567890',
 AUTH_SESSION_SECRET:'TEST_SESSION_12345678901234567890',DB:{prepare(){return {}}}
};
const get=(path,method='GET',e=env,origin=base)=>worker.fetch(new Request(origin+path,{method}),e);
test('portal needs active private beta and rejects wrong origin',async()=>{
  for(const change of [{BETA_PORTAL_ENABLED:'false'},{AUTH_BETA_GITHUB_IDS:''},
    {AUTH_PUBLIC_SIGNUP_APPROVED:'true'},{AUTH_ENABLED:'false'},{GITHUB_CLIENT_SECRET:''}]){
    assert.equal((await get('/','GET',{...env,...change})).status,404);
  }
  assert.equal((await get('/','GET',env,'https://evil.example')).status,404);
});
test('real login/profile routes exist in a private same-origin page',async()=>{
  const r=await get('/');
  assert.equal(r.status,200);
  assert.match(await r.text(),/href="\/v1\/auth\/github\/start"/);
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
  assert.doesNotMatch(r.headers.get('content-security-policy'),/unsafe-inline/);
  assert.equal(r.headers.get('cache-control'),'no-store, private');
  const js=await get('/beta/app.js');assert.equal(js.status,200);
  const s=await js.text();new Script(s);
  for(const endpoint of ['/v1/auth/me','/v1/auth/profile','/v1/auth/logout'])assert.ok(s.includes(endpoint));
  assert.doesNotMatch(s,/AUTH_SESSION_SECRET|GITHUB_CLIENT_SECRET/);
});
test('only GET/HEAD render assets',async()=>{
  assert.equal((await get('/beta/app.js','POST')).status,405);
  const h=await get('/','HEAD');assert.equal(h.status,200);
  assert.equal(await h.text(),'');
  assert.equal((await get('/beta/style.css')).headers.get('content-type'),'text/css; charset=utf-8');
});

test('BAS profile replaces the old form-only portal and keeps editing separate',async()=>{
  const html=await(await get('/')).text();
  for(const fragment of ['id="profile-view"','id="profile-edit"','id="change-avatar"',
    'id="change-banner"','id="avatar-image"','id="banner-image"',
    'id="creations"','id="crop-dialog"','id="save"']){
    assert.ok(html.includes(fragment),fragment);
  }
  const css=(await(await get('/beta/style.css')).text());
  assert.ok(css.includes('.profile-card'));
  assert.ok(css.includes('.cover'));
  assert.ok(css.includes('.avatar'));
  assert.ok(css.includes('.crop-stage'));
  const js=(await(await get('/beta/app.js')).text());
  assert.ok(js.includes("user=d.user;profile();"));
  assert.ok(js.includes('showModal()'));
  assert.ok(js.includes('/v1/profile-media/'));
  assert.ok(js.includes("method:'PUT'"));
  assert.ok(js.includes("method:'PATCH'"));
  assert.match((await get('/')).headers.get('content-security-policy'),/img-src 'self' blob:/);
  assert.doesNotMatch(js,/innerHTML\\s*=/);
});

test('BAS saved profile navigates to read-only profile view, editing remains reversible',async()=>{
  const {Script}=await import('node:vm');
  const code=await(await get('/beta/app.js')).text();
  const listeners=new Map(),elements=new Map(),paths=[],hashes=[];
  function mock(id){
    if(!elements.has(id)){
      const e={hidden:false,textContent:'',value:'',disabled:false,style:{},classList:{add(){},remove(){}},
        addEventListener(type,cb){listeners.set(id+':'+type,cb)},
        focus(){},click(){},removeAttribute(){},reportValidity(){return true}};
      elements.set(id,e);
    }
    return elements.get(id);
  }
  const form=mock('profile-form');
  form.elements={handle:mock('form-handle'),display_name:mock('form-name'),bio:mock('form-bio')};
  const responses={
    '/v1/auth/me':{user:{handle:'test_creator',display_name:'Test Creator',bio:'',created_at:1793837000},csrf:'SAFE_FAKE_CSRF'},
    '/v1/auth/profile':{user:{handle:'test_creator',display_name:'My BAS name',bio:'New bio',created_at:1793837000}}
  };
  const context={
    document:{getElementById:mock},
    history:{replaceState(_state,_unused,hash){hashes.push(hash)}},
    window:{addEventListener(){}},
    fetch:async(path,options)=>{
      paths.push(path);
      if(path.includes('/v1/profile-media/'))return {status:503,ok:false,json:async()=>({})};
      return {status:200,ok:true,json:async()=>responses[path]};
    },
    Intl,Date,Number,Promise,URL,
    requestAnimationFrame:()=>{}
  };
  new Script(code).runInNewContext(context);
  await new Promise(r=>setImmediate(r));
  assert.equal(mock('profile-view').hidden,false);
  assert.equal(mock('profile-edit').hidden,true);
  listeners.get('edit-profile:click')();
  assert.equal(mock('profile-edit').hidden,false);
  assert.equal(mock('profile-view').hidden,true);
  form.elements.display_name.value='My BAS name';form.elements.bio.value='New bio';
  await listeners.get('profile-form:submit')({preventDefault(){}});
  assert.equal(mock('profile-view').hidden,false);
  assert.equal(mock('profile-edit').hidden,true);
  assert.equal(mock('view-name').textContent,'My BAS name');
  assert.equal(mock('view-bio').textContent,'New bio');
  assert.equal(hashes.at(-1),'#meu-perfil');
  assert.ok(paths.includes('/v1/auth/profile'));
});
