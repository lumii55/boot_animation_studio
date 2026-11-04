import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalServer } from '../dev-server.mjs';

async function boot(t, enabled = false) {
  const instance = createLocalServer({ memory:true, catalogEnabled:enabled });
  await new Promise((resolve,reject) => {
    instance.server.once('error',reject);
    instance.server.listen(0,'127.0.0.1',resolve);
  });
  t.after(async()=>instance.stop());
  const port = instance.server.address().port;
  return { ...instance, url:'http://127.0.0.1:'+port };
}

test('local API uses loopback and defaults to no public catalog',async t=>{
  const instance=await boot(t);
  assert.equal(instance.server.address().address,'127.0.0.1');
  const health=await fetch(instance.url+'/v1/health');
  const payload=await health.json();
  assert.equal(health.status,200);
  assert.equal(payload.catalog_available,false);
  assert.equal(payload.uploads_enabled,false);
  const catalog=await fetch(instance.url+'/v1/catalog');
  assert.equal(catalog.status,503);
});
test('local API blocks state changes even when catalog read is enabled',async t=>{
  const instance=await boot(t,true);
  const result=await fetch(instance.url+'/v1/upload',{method:'POST',body:'test'});
  assert.equal(result.status,403);
  assert.deepEqual(await result.json(),{error:'mutations_locked'});
});
test('real SQLite catalog exposes approved version metadata, not private keys',async t=>{
  const instance=await boot(t,true),db=instance.database;
  db.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)')
    .run('demo-user','demo_creator','Test Creator');
  db.prepare('INSERT INTO animations(id,owner_id,title,category) VALUES(?,?,?,?)')
    .run('demo-animation','demo-user','Approved Sample','cosmos');
  db.prepare(
    'INSERT INTO animation_versions '+
    '(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run('version-1','demo-animation',1,'approved','private/never-expose.zip','a'.repeat(64),123456,1080,2400,30);
  db.prepare('UPDATE animations SET status=?,published_at=?,published_version_id=? WHERE id=?')
    .run('published',1793781000,'version-1','demo-animation');
  const res=await fetch(instance.url+'/v1/catalog?category=cosmos');
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.items.length,1);
  assert.equal(body.items[0].title,'Approved Sample');
  assert.equal(body.items[0].handle,'demo_creator');
  assert.equal(body.items[0].object_key,undefined);
  assert.equal(JSON.stringify(body).includes('never-expose'),false);
  db.prepare("UPDATE animations SET status='hidden' WHERE id='demo-animation'").run();
  const hidden=await fetch(instance.url+'/v1/catalog');
  assert.equal((await hidden.json()).items.length,0);
});
