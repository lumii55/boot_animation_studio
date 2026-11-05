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
