import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import worker from '../src/index.mjs';
import {mediaReady} from '../src/profile-media.mjs';
import {reconcileCreatorMedia} from '../src/reconcile-media.mjs';

const API='http://127.0.0.1:8788',SITE='http://127.0.0.1:8088';
const COOKIE='M'.repeat(43),SECRET='TEST_MEDIA_SESSION_KEY_0123456789_abcdefghij';
const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0,0,0,0,0]);
const webp=Uint8Array.from([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0]);

async function setup(t,opts={}){
  const local=createLocalServer({memory:true});
  t.after(()=>local.database.close());
  const database=local.database;
  database.prepare("INSERT INTO community_users(id,handle,display_name) VALUES('media-user','media_test','Media Test')").run();
  const sha=createHash('sha256').update('session:'+COOKIE).digest('hex');
  database.prepare('INSERT INTO auth_sessions(session_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(sha,'media-user',Math.floor(Date.now()/1000)+600);
  const objects=new Map(),operations=[],transforms=[];
  const r2={
    async put(key,bytes){operations.push(['put',key]);
      if(opts.putFails)throw Error('fake put error');
      objects.set(key,Uint8Array.from(bytes));},
    async get(key){operations.push(['get',key]);const value=objects.get(key);
      return value?{arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)}:null;},
    async delete(key){operations.push(['delete',key]);
      if(opts.deleteFails)throw Error('fake delete error');
      objects.delete(key);}
  };
  const images={
    async info(){
      if(opts.badInfo)throw Error('decoder rejects');
      return {width:1200,height:1000};
    },
    input(){
      return {
        transform(cfg){transforms.push(cfg);return this;},
        async output(cfg){
          assert.equal(cfg.format,'image/webp');
          if(opts.transformFails)throw Error('decoder failed');
          const bytes=opts.bigOutput?new Uint8Array(524289):webp;
          return {response:()=>new Response(bytes,{status:200,headers:{'Content-Type':'image/webp'}})};
        }
      };
    }
  };
  const env={
    DB:databaseBinding(database),PRIVATE_UPLOADS:r2,IMAGES:images,
    MEDIA_ENABLED:'true',MEDIA_STAGING_APPROVED:'true',STORAGE_ENABLED:'true',
    PUBLIC_CATALOG_ENABLED:'false',
    AUTH_ENABLED:'true',AUTH_DEPLOYMENT_APPROVED:'true',AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:SITE,
    GITHUB_CLIENT_ID:'Iv1_FAKE',GITHUB_CLIENT_SECRET:'FAKE_PRIVATE_APP_SECRET_12345',
    AUTH_PEPPER:'FAKE_PEPPER_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234',AUTH_SESSION_SECRET:SECRET,
    ...opts.env
  };
  const csrf=createHmac('sha256',SECRET).update('csrf:'+COOKIE).digest('hex');
  const headers={Origin:SITE,Cookie:'__Host-bas_session='+COOKIE,'X-CSRF-Token':csrf};
  const make=async(path,method='GET',extra={},body)=>{
    const req=new Request(API+path,{method,headers:{...headers,...extra},body});
    const response=await worker.fetch(req,env);
    const parsed=response.headers.get('Content-Type')?.includes('json')?await response.json():null;
    return {status:response.status,body:parsed,response};
  };
  const upload=(kind='avatar',data=jpeg,mime='image/jpeg')=>
    make('/v1/profile-media/'+kind,'PUT',{'Content-Type':mime},data);
  const budget=()=>database.prepare('SELECT used_bytes,reserved_bytes FROM storage_budget WHERE id=1').get();
  return {env,database,objects,operations,transforms,make,upload,budget,headers};
}
test('profile media fail-closed when flags or decoder binding are missing',async t=>{
  const x=await setup(t);
  assert.equal(mediaReady(x.env),true);
  for(const field of ['MEDIA_ENABLED','MEDIA_STAGING_APPROVED','STORAGE_ENABLED']){
    const old=x.env[field];x.env[field]='false';
    assert.equal((await x.upload()).status,503);
    x.env[field]=old;
  }
  const old=x.env.IMAGES;delete x.env.IMAGES;
  assert.equal((await x.upload()).status,503);x.env.IMAGES=old;
  assert.equal(x.objects.size,0);
});
test('profile media is owner-only and rejects foreign Origin/CSRF/session',async t=>{
  const x=await setup(t);
  assert.equal((await x.make('/v1/profile-media/avatar','PUT',{'Content-Type':'image/jpeg',Origin:'https://attacker.example'},jpeg)).status,403);
  assert.equal((await x.make('/v1/profile-media/avatar','PUT',{'Content-Type':'image/jpeg','X-CSRF-Token':'wrong'},jpeg)).status,403);
  assert.equal((await x.make('/v1/profile-media/avatar','PUT',{'Content-Type':'image/jpeg',Cookie:''},jpeg)).status,403);
  assert.equal(x.database.prepare('SELECT count(*) AS n FROM creator_media').get().n,0);
});
test('avatar is decoded/re-encoded to WebP, kept private and read only by the owner',async t=>{
  const x=await setup(t);
  const posted=await x.upload();
  assert.equal(posted.status,200,JSON.stringify(posted.body));
  assert.equal(posted.body.bytes,webp.length);
  assert.equal(x.objects.size,1);
  const key=[...x.objects.keys()][0];
  assert.match(key,/^creator-private\/media-user\/avatar\/[a-f0-9]{32}\.webp$/);
  assert.equal(x.transforms[0].width,512);
  assert.equal(x.transforms[0].height,512);
  assert.equal(x.transforms[0].fit,'cover');
  assert.equal(x.budget().used_bytes,webp.length);
  assert.equal(x.budget().reserved_bytes,0);
  const get=await x.make('/v1/profile-media/avatar');
  assert.equal(get.status,200);
  assert.equal(get.response.headers.get('Content-Type'),'image/webp');
  assert.equal(get.response.headers.get('Cache-Control'),'no-store, private');
  const bytes=new Uint8Array(await get.response.arrayBuffer());
  assert.deepEqual(Array.from(bytes),Array.from(webp));
  assert.equal(JSON.stringify(posted.body).includes('creator-private/'),false);
  assert.equal(x.database.prepare('SELECT count(*) AS n FROM creator_media_current').get().n,1);
  // Same-origin browser GETs do not require an Origin header or CSRF.
  const browserGet=await x.make('/v1/profile-media/avatar','GET',{Origin:'','X-CSRF-Token':''});
  assert.equal(browserGet.status,200);
  const deniedNoCookie=await x.make('/v1/profile-media/avatar','GET',{Cookie:'',Origin:'','X-CSRF-Token':''});
  assert.equal(deniedNoCookie.status,403);
});
test('banner uses wide transform dimensions',async t=>{
  const x=await setup(t);
  const posted=await x.upload('banner');
  assert.equal(posted.status,200);
  assert.equal(x.transforms[0].width,1280);
  assert.equal(x.transforms[0].height,480);
});
test('replacing a photo waits for private delete before decrementing storage',async t=>{
  const x=await setup(t);
  assert.equal((await x.upload()).status,200);
  assert.equal((await x.upload()).status,200);
  assert.equal(x.objects.size,1);
  assert.equal(x.budget().used_bytes,webp.length);
  assert.equal(x.database.prepare("SELECT count(*) AS n FROM creator_media WHERE status='deleted'").get().n,1);
  assert.equal(x.operations.filter(op=>op[0]==='delete').length,1);
});
test('failed deletion retains old media in private orphan recovery ledger',async t=>{
  const x=await setup(t,{deleteFails:true});
  assert.equal((await x.upload()).status,200);
  assert.equal((await x.upload()).status,200);
  assert.equal(x.objects.size,2);
  assert.equal(x.budget().used_bytes,webp.length*2);
  assert.equal(x.database.prepare("SELECT count(*) AS n FROM creator_media WHERE status='delete_pending'").get().n,1);
  const get=await x.make('/v1/profile-media/avatar');
  assert.equal(get.status,200);
});
test('corrupted media, bad MIME and oversized image are rejected without storage',async t=>{
  const x=await setup(t);
  assert.equal((await x.upload('avatar',new Uint8Array([1,2,3]),'image/jpeg')).status,400);
  assert.equal((await x.upload('avatar',jpeg,'image/svg+xml')).status,415);
  assert.equal((await x.upload('avatar',new Uint8Array(2097153),'image/jpeg')).status,400);
  assert.equal(x.objects.size,0);
  assert.equal(x.budget().reserved_bytes,0);
});
test('failed decode and invalid processed response never store bytes or leak reserved quota',async t=>{
  for(const options of [{badInfo:true},{transformFails:true},{bigOutput:true}]){
    const x=await setup(t,options);
    const r=await x.upload();
    assert.ok(r.status===422||r.status===503);
    assert.equal(x.objects.size,0);
    assert.equal(x.budget().reserved_bytes,0);
    assert.equal(x.budget().used_bytes,0);
  }
});
test('private R2 failure releases media reservation and does not change active profile',async t=>{
  const x=await setup(t,{putFails:true});
  const r=await x.upload();
  assert.equal(r.status,503);
  assert.equal(x.database.prepare('SELECT count(*) AS n FROM creator_media_current').get().n,0);
  assert.equal(x.budget().reserved_bytes,0);
  assert.equal(x.budget().used_bytes,0);
});
test('daily media rate limiting prevents unlimited replacement operations',async t=>{
  const x=await setup(t);
  for(let i=0;i<8;i++)assert.equal((await x.upload()).status,200,'upload '+i);
  const denied=await x.upload();assert.equal(denied.status,429);
  assert.equal(x.database.prepare('SELECT COUNT(*) AS n FROM creator_media').get().n,8);
  assert.equal(x.budget().reserved_bytes,0);
});
test('monthly transformation budget halts before paid overages',async t=>{
  const x=await setup(t);
  const m=new Date().toISOString().slice(0,7);
  x.database.prepare('INSERT INTO media_transform_budget(month,count) VALUES(?,200)').run(m);
  const denied=await x.upload();assert.equal(denied.status,503);
  assert.equal(x.budget().used_bytes,0);
  assert.equal(x.budget().reserved_bytes,0);
});

test('reconciler requires explicit approval and safe bounded parameters',async t=>{
  const x=await setup(t);
  await assert.rejects(reconcileCreatorMedia(x.env),/maintenance_not_approved/);
  x.env.MEDIA_MAINTENANCE_APPROVED='true';
  await assert.rejects(reconcileCreatorMedia(x.env,{limit:100}),/unsafe_maintenance_parameters/);
  assert.equal(x.operations.length,0);
});
test('reconciler deletes orphaned old avatar before reducing storage ledger',async t=>{
  const options={deleteFails:true};
  const x=await setup(t,options);
  assert.equal((await x.upload()).status,200);
  assert.equal((await x.upload()).status,200);
  assert.equal(x.objects.size,2);
  assert.equal(x.budget().used_bytes,webp.length*2);
  x.env.MEDIA_MAINTENANCE_APPROVED='true';
  let report=await reconcileCreatorMedia(x.env);
  assert.equal(report.failed,1);
  assert.equal(x.budget().used_bytes,webp.length*2);
  options.deleteFails=false;
  report=await reconcileCreatorMedia(x.env);
  assert.equal(report.recovered,1);
  assert.equal(report.failed,0);
  assert.equal(x.objects.size,1);
  assert.equal(x.budget().used_bytes,webp.length);
});
test('reconciler expires only old interrupted writes, never a fresh request',async t=>{
  const x=await setup(t);
  const id='e'.repeat(32),key='creator-private/media-user/avatar/'+id+'.webp';
  x.database.prepare(
    "INSERT INTO creator_media(id,owner_id,kind,object_key,status,created_at) VALUES(?,?,?,?,'processing',?)"
  ).run(id,'media-user','avatar',key,Math.floor(Date.now()/1000)-7200);
  assert.equal(x.budget().reserved_bytes,524288);
  x.env.MEDIA_MAINTENANCE_APPROVED='true';
  const report=await reconcileCreatorMedia(x.env,{olderThanSeconds:3600});
  assert.equal(report.recovered,1);
  assert.equal(x.budget().reserved_bytes,0);
  assert.equal(x.database.prepare("SELECT status FROM creator_media WHERE id=?").get(id).status,'failed');
});
