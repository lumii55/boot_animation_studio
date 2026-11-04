import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

const URL_BASE = 'https://staging.invalid';
const ORIGIN = 'http://127.0.0.1:8088';
const PUBLIC_ROW = {
  id:'test-approved-1',title:'Sample',summary:'A sample',category:'cosmos',
  published_at:1793000000,download_count:2,like_count:5,
  size_bytes:350000,width:1080,height:2400,fps:30,handle:'sample_user',
  display_name:'Sample User',
  object_key:'private/pending/do-not-expose.zip',
  preview_key:'private/previews/secret.webp',
  owner_id:'private-user-id',provider_subject_hash:'secret-identity'
};
function fakeDB({results=[PUBLIC_ROW],detail=PUBLIC_ROW,broken=false}={}){
  const calls=[];
  return {
    calls,
    prepare(sql){
      if (broken) throw Error('sensitive db failure');
      const ctx={sql,params:[]};
      calls.push(ctx);
      return {
        bind(...params){ctx.params=params;return this;},
        async all(){return {results};},
        async first(){return detail;}
      };
    }
  };
}
function request(path,method='GET',origin=null){
  const headers=origin?{Origin:origin}:{};
  return new Request(URL_BASE+path,{method,headers});
}
async function output(path,env={},method='GET',origin=null){
  const response=await worker.fetch(request(path,method,origin),env);
  return {response,body:method==='HEAD'||method==='OPTIONS'?null:await response.json()};
}
test('health is intentionally read-only, no account or storage details',async()=>{
  const {response,body}=await output('/v1/health');
  assert.equal(response.status,200);
  assert.equal(body.mode,'read_only');
  assert.equal(body.catalog_available,false);
  assert.equal(body.uploads_enabled,false);
  assert.equal(body.moderation_enabled,false);
  assert.equal(response.headers.get('cache-control'),'no-store, private');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});
test('all state-changing HTTP methods are denied, independent of environment flags',async()=>{
  for(const method of ['POST','PUT','PATCH','DELETE']){
    const {response,body}=await output('/v1/uploads',{PUBLIC_CATALOG_ENABLED:'true',UPLOAD_ENABLED:'true',ADMIN_ENABLED:'true'},method);
    assert.equal(response.status,403);
    assert.equal(body.error,'mutations_locked');
  }
});
test('catalog remains unavailable until explicitly enabled with bound D1',async()=>{
  assert.equal((await output('/v1/catalog')).response.status,503);
  assert.equal((await output('/v1/catalog',{PUBLIC_CATALOG_ENABLED:'true'})).response.status,503);
  assert.equal((await output('/v1/catalog',{DB:fakeDB()})).response.status,503);
});
test('only approved/public projected fields may leave database',async()=>{
  const DB=fakeDB();
  const {response,body}=await output('/v1/catalog?limit=4&sort=liked',{PUBLIC_CATALOG_ENABLED:'true',DB});
  assert.equal(response.status,200);
  assert.equal(body.items.length,1);
  assert.equal(body.items[0].title,'Sample');
  for(const secret of ['object_key','preview_key','owner_id','provider_subject_hash']) {
    assert.equal(Object.hasOwn(body.items[0],secret),false);
  }
  assert.match(DB.calls[0].sql,/a\.status = 'published'/);
  assert.match(DB.calls[0].sql,/v\.status = 'approved'/);
  assert.match(DB.calls[0].sql,/u\.status = 'active'/);
  assert.match(DB.calls[0].sql,/ORDER BY a\.like_count DESC/);
  assert.deepEqual(DB.calls[0].params,[5,0]);
});
test('catalog search and category are always parameterized; no SQL injection',async()=>{
  const DB=fakeDB({results:[]});
  const q="x' OR 1=1 --";
  const url='/v1/catalog?sort=popular&q='+encodeURIComponent(q)+'&category=neon';
  const {response}=await output(url,{PUBLIC_CATALOG_ENABLED:'true',DB});
  assert.equal(response.status,200);
  const {sql,params}=DB.calls[0];
  assert.ok(!sql.includes(q));
  assert.deepEqual(params,[q.toLowerCase(),q.toLowerCase(),'neon',13,0]);
  assert.match(sql,/instr\(lower\(a\.title\), \?\)/);
  assert.match(sql,/ORDER BY a\.download_count DESC/);
});
test('search and pagination reject invalid values',async()=>{
  const env={PUBLIC_CATALOG_ENABLED:'true',DB:fakeDB()};
  for(const query of ['?limit=100','?limit=-1','?offset=-1','?sort=object_key',
    '?offset=999999999','?category=x%20y','?q='+('z'.repeat(90))]){
    const r=await output('/v1/catalog'+query,env);
    assert.equal(r.response.status,400,query);
    assert.equal(r.body.error,'invalid_query');
  }
});
test('pagination never releases extra record and emits offset only when available',async()=>{
  const env={PUBLIC_CATALOG_ENABLED:'true',DB:fakeDB({results:[PUBLIC_ROW,PUBLIC_ROW,PUBLIC_ROW]})};
  const r=await output('/v1/catalog?limit=2&offset=10',env);
  assert.equal(r.body.items.length,2);
  assert.equal(r.body.next_offset,12);
});
test('detail only returns approved projection and conceals private object keys',async()=>{
  const DB=fakeDB();
  const env={PUBLIC_CATALOG_ENABLED:'true',DB};
  let r=await output('/v1/animations/test-approved-1',env);
  assert.equal(r.response.status,200);
  assert.equal(r.body.animation.title,'Sample');
  assert.equal(r.body.animation.object_key,undefined);
  assert.deepEqual(DB.calls[0].params,['test-approved-1']);
  r=await output('/v1/animations/not%20valid',env);
  assert.equal(r.response.status,404);
  r=await output('/v1/animations/doesnotexist',{...env,DB:fakeDB({detail:null})});
  assert.equal(r.response.status,404);
});
test('server errors are generic and do not leak database logs',async()=>{
  const r=await output('/v1/catalog',{PUBLIC_CATALOG_ENABLED:'true',DB:fakeDB({broken:true})});
  assert.equal(r.response.status,503);
  assert.equal(JSON.stringify(r.body).includes('sensitive'),false);
});
test('CORS is limited to configured exact origins and never uses wildcard',async()=>{
  const env={CORS_ALLOWED_ORIGINS:ORIGIN+',https://lumii55.github.io'};
  let r=await output('/v1/health',env,'GET',ORIGIN);
  assert.equal(r.response.headers.get('access-control-allow-origin'),ORIGIN);
  r=await output('/v1/health',env,'GET','https://evil.example');
  assert.equal(r.response.headers.get('access-control-allow-origin'),null);
  r=await output('/v1/health',env,'OPTIONS','https://evil.example');
  assert.equal(r.response.status,204);
  assert.equal(r.response.headers.get('access-control-allow-origin'),null);
  r=await output('/v1/health',env,'OPTIONS',ORIGIN);
  assert.equal(r.response.headers.get('access-control-allow-methods'),'GET, HEAD, OPTIONS');
});
test('HEAD never emits an HTTP body',async()=>{
  const {response,body}=await output('/v1/health',{},'HEAD');
  assert.equal(response.status,200);
  assert.equal(body,null);
  assert.equal(await response.text(),'');
});
