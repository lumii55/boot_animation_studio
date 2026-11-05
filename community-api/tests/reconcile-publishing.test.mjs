import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import {reconcilePrivatePublications} from '../src/reconcile-publishing.mjs';

function setup(t,{deleteFails=false}={}){
  const local=createLocalServer({memory:true});
  t.after(()=>local.database.close());
  const db=local.database;
  const objects=new Map(),calls=[];
  const options={deleteFails};
  const env={
    DB:databaseBinding(db),
    PUBLISH_MAINTENANCE_APPROVED:'true',
    PRIVATE_UPLOADS:{
      async delete(key){calls.push(key);if(options.deleteFails)throw Error('fake delete failure');objects.delete(key);}
    }
  };
  const userId='test-owner';
  db.prepare('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)')
    .run(userId,'test_owner','Test Owner');
  let n=0;
  function makeDraft(){
    n++;
    const id=String(n).padStart(32,'a'),animationId=String(n).padStart(32,'b');
    const reservationId=String(n).padStart(32,'c'),expires=Math.floor(Date.now()/1000)+900;
    db.prepare("INSERT INTO animations(id,owner_id,title,summary,category,status) VALUES(?,?,?,'','cosmos','draft')")
      .run(animationId,userId,'Test Animation '+n);
    db.prepare("INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,?,'reserved',?,?)")
      .run(reservationId,userId,1024,String(n).padStart(64,'d'),expires);
    db.prepare("INSERT INTO publication_drafts(id,owner_id,animation_id,reservation_id,source,filename,expected_bytes,request_hash,expires_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id,userId,animationId,reservationId,'zip','bootanimation.zip',1024,String(n).padStart(64,'e'),expires);
    const key='quarantine/'+animationId+'/'+String(n).padStart(32,'f')+'.zip';
    return {id,reservationId,key};
  }
  return {db,env,options,objects,calls,makeDraft};
}
test('publishing maintenance is explicitly gated and parameter-bounded',async t=>{
  const x=setup(t);
  x.env.PUBLISH_MAINTENANCE_APPROVED='false';
  await assert.rejects(reconcilePrivatePublications(x.env),/maintenance_not_approved/);
  x.env.PUBLISH_MAINTENANCE_APPROVED='true';
  await assert.rejects(reconcilePrivatePublications(x.env,{limit:100}),/unsafe_maintenance_parameters/);
  await assert.rejects(reconcilePrivatePublications(x.env,{olderThanSeconds:1}),/unsafe_maintenance_parameters/);
  assert.equal(x.calls.length,0);
});
test('failed upload leaves an R2 orphan recoverable without releasing quota early',async t=>{
  const x=setup(t,{deleteFails:true});
  const d=x.makeDraft();
  x.db.prepare("UPDATE publication_drafts SET status='processing',object_key=? WHERE id=?").run(d.key,d.id);
  x.db.prepare("UPDATE publication_drafts SET status='failed' WHERE id=?").run(d.id);
  x.db.prepare("UPDATE upload_reservations SET status='cancelled' WHERE id=?").run(d.reservationId);
  x.objects.set(d.key,new Uint8Array([1,2,3]));
  let r=await reconcilePrivatePublications(x.env);
  assert.equal(r.failed,1);assert.equal(x.objects.size,1);
  assert.equal(x.db.prepare('SELECT object_key FROM publication_drafts WHERE id=?').get(d.id).object_key,d.key);
  x.options.deleteFails=false;
  r=await reconcilePrivatePublications(x.env);
  assert.equal(r.recovered,1);assert.equal(x.objects.size,0);
  assert.equal(x.db.prepare('SELECT object_key FROM publication_drafts WHERE id=?').get(d.id).object_key,null);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget WHERE id=1').get().reserved_bytes,0);
});
test('expired drafts release reservation after safe cutoff; fresh drafts are retained',async t=>{
  const x=setup(t);
  const d=x.makeDraft();
  const before=await reconcilePrivatePublications(x.env);
  assert.equal(before.scanned,0);
  assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget WHERE id=1').get().reserved_bytes,1024);
  const original=Date.now;
  try{
    Date.now=()=>original()+7200000;
    const after=await reconcilePrivatePublications(x.env);
    assert.equal(after.recovered,1);
    assert.equal(x.db.prepare('SELECT status FROM publication_drafts WHERE id=?').get(d.id).status,'failed');
    assert.equal(x.db.prepare('SELECT status FROM upload_reservations WHERE id=?').get(d.reservationId).status,'expired');
    assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget WHERE id=1').get().reserved_bytes,0);
  }finally{Date.now=original;}
});
test('old processing draft orphan is deleted before expiring reservation',async t=>{
  const x=setup(t);
  const d=x.makeDraft();
  x.db.prepare("UPDATE publication_drafts SET status='processing',object_key=? WHERE id=?").run(d.key,d.id);
  x.objects.set(d.key,new Uint8Array([6,7,8]));
  const original=Date.now;
  try{
    Date.now=()=>original()+7200000;
    const result=await reconcilePrivatePublications(x.env);
    assert.equal(result.recovered,1);
    assert.equal(x.objects.size,0);
    assert.equal(x.db.prepare('SELECT status FROM publication_drafts WHERE id=?').get(d.id).status,'failed');
    assert.equal(x.db.prepare('SELECT reserved_bytes FROM storage_budget WHERE id=1').get().reserved_bytes,0);
  }finally{Date.now=original;}
});
