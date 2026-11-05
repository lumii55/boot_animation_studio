import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';

const API='http://127.0.0.1:8788';
function env(t,opts={}){
 const local=createLocalServer({memory:true});
 t.after(()=>local.database.close());
 return {DB:databaseBinding(local.database),AUTH_ENABLED:'true',
  AUTH_DEPLOYMENT_APPROVED:'true',AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:API,
  BETA_PORTAL_ENABLED:'true',BAS_UNIFIED_STUDIO_ENABLED:'true',
  BAS_LOCAL_CLIENT_ENABLED:'true',BAS_LOCAL_ORIGINS:'http://127.0.0.1:8088,https://lumii55.github.io',
  AUTH_BETA_GITHUB_IDS:'12345',AUTH_PUBLIC_SIGNUP_APPROVED:'false',
  PUBLIC_CATALOG_ENABLED:'false',BETA_CATALOG_ENABLED:'true',
  GITHUB_CLIENT_ID:'Iv1_TEST',GITHUB_CLIENT_SECRET:'TEST_ONLY_SECRET_1234567890',
  AUTH_PEPPER:'TEST_PEPPER_12345678901234567890',
  AUTH_SESSION_SECRET:'TEST_SESSION_12345678901234567890',...opts};
}
test('Cloudflare acts as API only, even if obsolete page flags are on',async t=>{
 const bindings=env(t);
 for(const path of ['/','/beta','/beta/licenses?lang=pt','/beta/app.js','/studio/',
   '/studio/index.html']){
  const response=await worker.fetch(new Request(API+path),bindings);
  assert.equal(response.status,404,path);
  assert.notEqual(response.headers.get('Content-Type'),'text/html');
 }
 const health=await worker.fetch(new Request(API+'/v1/health'),bindings);
 assert.equal(health.status,200);
 assert.equal((await health.json()).catalog_available,false);
});
test('Local BAS allowed origin obtains CORS but unknown websites cannot read accounts',async t=>{
 const bindings=env(t);
 const valid='http://127.0.0.1:8088';
 let res=await worker.fetch(new Request(API+'/v1/auth/me',{
  method:'OPTIONS',headers:{Origin:valid,
    'Access-Control-Request-Method':'GET',
    'Access-Control-Request-Headers':'Authorization'}}),bindings);
 assert.equal(res.status,204);
 assert.equal(res.headers.get('access-control-allow-origin'),valid);
 assert.match(res.headers.get('access-control-allow-headers'),/Authorization/);
 res=await worker.fetch(new Request(API+'/v1/auth/me',{
  headers:{Origin:valid}}),bindings);
 assert.equal(res.status,401);
 assert.equal(res.headers.get('access-control-allow-origin'),valid);
 res=await worker.fetch(new Request(API+'/v1/auth/me',{
  headers:{Origin:'https://evil.example'}}),bindings);
 assert.equal(res.status,401);
 assert.equal(res.headers.get('access-control-allow-origin'),null);
});
