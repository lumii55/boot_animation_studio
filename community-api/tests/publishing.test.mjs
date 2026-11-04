import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import worker from '../src/index.mjs';
import {publishingReady} from '../src/publishing.mjs';
import {validateArchive,ArchiveRejected} from '../src/worker-zip.mjs';

const API='http://127.0.0.1:8788',SITE='http://127.0.0.1:8088';
const COOKIE='A'.repeat(43),SESSION_SECRET='STAGING_SESSION_FAKE_0123456789_abcdefghij';
function crc32(bytes){let c=0xffffffff;for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function makeZip({method=0,badPath=false,badCrc=false,compressedBomb=false}={}){
  const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png,0);
  png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1080,16);png.writeUInt32BE(2400,20);
  const entries=[
    {name:'desc.txt',data:Buffer.from('1080 2400 30\np 1 0 part0\n')},
    {name:badPath?'../bad.png':'part0/00000.png',data:compressedBomb?Buffer.alloc(100000):png}
  ];
  const locals=[],central=[];let offset=0;
  for(let i=0;i<entries.length;i++){
    const {name,data}=entries[i],filename=Buffer.from(name);
    const compressed=method===8?deflateRawSync(data):data;
    const crc=(crc32(data)^(badCrc&&i===1?1:0))>>>0;
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);
    l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(compressed.length,18);
    l.writeUInt32LE(data.length,22);l.writeUInt16LE(filename.length,26);
    const section=Buffer.concat([l,filename,compressed]);
    locals.push(section);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);
    c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);
    c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(data.length,24);
    c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
    central.push(c,filename);offset+=section.length;
  }
  const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);
  e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);
  e.writeUInt32LE(cd.length,12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,e]);
}
async function setup(t,opts={}){
  const local=createLocalServer({memory:true});
  t.after(()=>local.database.close());
  const db=local.database;
  db.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)').run('local-test-user','test_creator','Test Creator');
  const tokenHash=createHash('sha256').update('session:'+COOKIE).digest('hex');
  db.prepare('INSERT INTO auth_sessions(session_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(tokenHash,'local-test-user',Math.floor(Date.now()/1000)+900);
  const objects=new Map(),calls=[];
  const bucket={
    async put(key,data,options){
      calls.push({operation:'put',key,options});
      if(opts.failStorage)throw Error('fake-storage-unavailable');
      objects.set(key,Buffer.from(data));return {etag:'test-etag'};
    },
    async delete(key){calls.push({operation:'delete',key});objects.delete(key);}
  };
  const env={
    DB:databaseBinding(db),PRIVATE_UPLOADS:bucket,
    PUBLISH_ENABLED:'true',PUBLISH_STAGING_APPROVED:'true',STORAGE_ENABLED:'true',UPLOAD_ENABLED:'true',
    PUBLIC_CATALOG_ENABLED:'false',
    AUTH_ENABLED:'true',AUTH_DEPLOYMENT_APPROVED:'true',
    AUTH_API_ORIGIN:API,AUTH_SITE_ORIGIN:SITE,
    GITHUB_CLIENT_ID:'Iv1_FAKE',GITHUB_CLIENT_SECRET:'FAKE_PRIVATE_APP_SECRET_12345',
    AUTH_PEPPER:'FAKE_PEPPER_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234',
    AUTH_SESSION_SECRET:SESSION_SECRET,
    ...opts.env
  };
  const csrf=createHmac('sha256',SESSION_SECRET).update('csrf:'+COOKIE).digest('hex');
  const headers={Origin:SITE,Cookie:'__Host-bas_session='+COOKIE,'X-CSRF-Token':csrf};
  async function make(path,method='GET',extra={},data){
    const request=new Request(API+path,{method,headers:{...headers,...extra},body:data});
    const response=await worker.fetch(request,env);
    let body=null;if(response.status!==204)body=await response.json();
    return {status:response.status,body,headers:response.headers};
  }
  const metadata=(source='zip',zip=makeZip())=>({
    title:'Nebulosa de Testes',summary:'Animation for sandbox only',category:'cosmos',
    source,license:'CC-BY-4.0',author_credit:'Original Creator',allows_remix:true,
    rights_confirmed:true,size_bytes:zip.length,filename:'bootanimation.zip'
  });
  async function draft(meta,key='TEST_IDEMPOTENCY_KEY_00000001'){
    return make('/v1/publishing/drafts','POST',{'Content-Type':'application/json','Idempotency-Key':key},JSON.stringify(meta));
  }
  async function upload(draftId,zip){
    return make('/v1/publishing/drafts/'+draftId+'/zip','PUT',{'Content-Type':'application/zip'},zip);
  }
  return {db,env,objects,calls,make,metadata,draft,upload,headers};
}
test('fail-closed default: publishing disabled even when R2 exists',async t=>{
  const x=await setup(t,{env:{PUBLISH_ENABLED:'false'}});
  assert.equal(publishingReady(x.env),false);
  const r=await x.make('/v1/publishing/drafts');
  assert.equal(r.status,503);assert.equal(r.body.error,'publishing_unavailable');
  const publicWrite=await x.make('/v1/uploads','POST');
  assert.equal(publicWrite.status,403);
});
test('archive validator accepts stored and deflated ZIPs while never approving',async()=>{
  for(const method of [0,8]){
    const result=await validateArchive(makeZip({method}));
    assert.equal(result.width,1080);assert.equal(result.fps,30);
    assert.equal(result.frame_count,1);assert.equal(result.status,'quarantine_only');
    assert.match(result.sha256,/^[a-f0-9]{64}$/);
  }
});
test('archive validator rejects traversal, forged CRC and expansion bombs',async()=>{
  for(const [parameters,code] of [
    [{badPath:true},'unsafe_path'],[{badCrc:true},'crc_mismatch'],
    [{method:8,compressedBomb:true},'compression_ratio']
  ]){
    await assert.rejects(validateArchive(makeZip(parameters)),e=>e instanceof ArchiveRejected&&e.code===code,code);
  }
});
test('valid authenticated ZIP submission remains private and is sent to review queue',async t=>{
  const x=await setup(t),zip=makeZip();
  const creation=await x.draft(x.metadata('zip',zip));
  assert.equal(creation.status,201);
  const id=creation.body.draft_id;
  assert.match(id,/^[a-f0-9]{32}$/);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget').get().reserved_bytes,zip.length);
  const submitted=await x.upload(id,zip);
  assert.equal(submitted.status,202,JSON.stringify(submitted.body));
  assert.equal(submitted.body.status,'pending_review');
  assert.equal(submitted.body.review_required,true);
  assert.equal(x.objects.size,1);
  const key=[...x.objects.keys()][0];
  assert.match(key,/^quarantine\/[a-f0-9]{32}\/[a-f0-9]{32}\.zip$/);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM moderation_events WHERE action=?').get('submit').n,1);
  assert.equal(x.db.prepare('SELECT status FROM animations').get().status,'pending');
  assert.equal(x.db.prepare('SELECT status FROM animation_versions').get().status,'pending');
  assert.equal(x.db.prepare('SELECT status FROM publication_drafts').get().status,'pending_review');
  const ledger=x.db.prepare('SELECT used_bytes,reserved_bytes FROM storage_budget').get();
  assert.equal(ledger.used_bytes,zip.length);
  assert.equal(ledger.reserved_bytes,0);
  const catalog=await x.make('/v1/catalog');assert.equal(catalog.status,503);
  const owned=await x.make('/v1/publishing/drafts');assert.equal(owned.status,200);
  assert.equal(owned.body.drafts[0].status,'pending_review');
  assert.equal(JSON.stringify(owned.body).includes('quarantine/'),false);
  const replay=await x.upload(id,zip);assert.equal(replay.status,409);
  assert.equal(x.calls.filter(c=>c.operation==='put').length,1);
});
test('editor export shares the same safe archive validation and queue',async t=>{
  const x=await setup(t),zip=makeZip({method:8});
  const creation=await x.draft(x.metadata('editor',zip),'TEST_IDEMPOTENCY_KEY_EDITOR_00002');
  assert.equal(creation.status,201);
  const uploaded=await x.upload(creation.body.draft_id,zip);
  assert.equal(uploaded.status,202,JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.source,'editor');
  assert.equal(x.objects.size,1);
});
test('Companion is blocked until pairing/verified-device channel is implemented',async t=>{
  const x=await setup(t),zip=makeZip();
  const metadata=x.metadata('companion',zip);
  metadata.companion_permission_confirmed=true;
  const r=await x.draft(metadata);
  assert.equal(r.status,409);
  assert.equal(r.body.error,'companion_pairing_required');
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM publication_drafts').get().n,0);
});
test('valid idempotency replays do not double-reserve space; altered request conflicts',async t=>{
  const x=await setup(t),zip=makeZip(),meta=x.metadata('zip',zip);
  const one=await x.draft(meta);
  const again=await x.draft(meta);
  assert.equal(one.status,201);assert.equal(again.status,200);
  assert.equal(one.body.draft_id,again.body.draft_id);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget').get().reserved_bytes,zip.length);
  const conflict=await x.draft({...meta,title:'A different title'});
  assert.equal(conflict.status,409);
});
test('missing session, wrong Origin and forged CSRF cannot create drafts',async t=>{
  const x=await setup(t),zip=makeZip(),meta=x.metadata('zip',zip);
  for(const headers of [
    {Cookie:'',Origin:SITE},
    {Origin:'https://attacker.example'},
    {'X-CSRF-Token':'not-correct'}
  ]){
    const result=await x.make('/v1/publishing/drafts','POST',{
      'Content-Type':'application/json','Idempotency-Key':'TEST_IDEMPOTENCY_KEY_AUTH_00001',...headers
    },JSON.stringify(meta));
    assert.equal(result.status,403);
  }
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM publication_drafts').get().n,0);
});
test('missing rights/license and unsafe fields are refused',async t=>{
  const x=await setup(t),zip=makeZip();
  for(const [i,meta] of [
    {...x.metadata('zip',zip),rights_confirmed:false},
    {...x.metadata('zip',zip),title:'<script>alert(1)</script>'},
    {...x.metadata('zip',zip),license:'unknown'},
    {...x.metadata('zip',zip),secret:'unexpected'}
  ].entries()){
    const result=await x.draft(meta,'BAD_METADATA_TOKEN_00000'+String(i).padStart(4,'0'));
    assert.equal(result.status,400);
  }
});
test('malicious ZIP fails before R2 put and releases reservation',async t=>{
  const x=await setup(t),zip=makeZip({badPath:true});
  const draft=await x.draft(x.metadata('zip',zip));
  assert.equal(draft.status,201);
  const uploaded=await x.upload(draft.body.draft_id,zip);
  assert.equal(uploaded.status,422);
  assert.equal(x.objects.size,0);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget').get().reserved_bytes,0);
  assert.equal(x.db.prepare('SELECT status FROM publication_drafts').get().status,'failed');
});
test('R2 failures never publish and reservations are released',async t=>{
  const x=await setup(t,{failStorage:true}),zip=makeZip();
  const draft=await x.draft(x.metadata('zip',zip));
  const uploaded=await x.upload(draft.body.draft_id,zip);
  assert.equal(uploaded.status,503);
  assert.equal(x.objects.size,0);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget').get().reserved_bytes,0);
  assert.equal(x.db.prepare('SELECT status FROM animations').get().status,'draft');
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM animation_versions').get().n,0);
});
test('cancel restores reservation budget, but cannot cancel a submitted draft',async t=>{
  const x=await setup(t),zip=makeZip();
  const draft=await x.draft(x.metadata('zip',zip));
  const result=await x.make('/v1/publishing/drafts/'+draft.body.draft_id+'/cancel','POST');
  assert.equal(result.status,200);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget').get().reserved_bytes,0);
  assert.equal((await x.upload(draft.body.draft_id,zip)).status,409);
});
test('app-level R2 monthly operation budget counts writes and stays below cap',async t=>{
  const x=await setup(t),zip=makeZip();
  const draft=await x.draft(x.metadata('zip',zip));
  await x.upload(draft.body.draft_id,zip);
  const row=x.db.prepare('SELECT class_a,class_b FROM r2_operation_budget').get();
  assert.equal(row.class_a,1);
  assert.equal(row.class_b,0);
});
