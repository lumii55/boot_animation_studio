import test from 'node:test';
import assert from 'node:assert/strict';
import {handleModeration} from '../src/beta-moderation.mjs';

function harness(role='admin'){
 const env={
  MODERATION_STAGING_APPROVED:'true',
  ADMIN_PANEL_SEPARATED:'true',
  BAS_ADMIN_ORIGIN:'http://127.0.0.1:8090',
  BAS_ADMIN_CLIENT_ENABLED:'true',
  MODERATOR_USER_IDS:'owner-id',
  DB:{
   prepare(sql){
    assert.match(sql,/FROM storage_budget/);
    return {bind(){return {first:async()=>({
     used_bytes:64000000,reserved_bytes:40000000,cap_bytes:9000000000,updated_at:10000
    })};}};
   }
  }
 };
 const user={userId:'owner-id',clientKind:role};
 const request=new Request('https://bas.test/v1/beta/moderation/storage',{
  headers:{Origin:'http://127.0.0.1:8090'}
 });
 return {env,user,request};
}
test('only admin can inspect accurate storage totals without leaking object keys',async()=>{
 const h=harness();
 const response=await handleModeration(h.request,h.env,new URL(h.request.url),h.user);
 assert.equal(response.status,200);
 assert.match(response.headers.get('Cache-Control'),/no-store/);
 const data=await response.json();
 assert.deepEqual(
  {cap:data.cap_bytes,used:data.used_bytes,reserved:data.reserved_bytes,free:data.available_bytes},
  {cap:9000000000,used:64000000,reserved:40000000,free:8896000000}
 );
 assert.equal(data.scope,'bas_private_r2_accounted');
 assert.ok(!JSON.stringify(data).includes('object_key'));
});
test('a non-admin and a mismatched origin cannot read the storage ledger',async()=>{
 const h=harness('bas');
 const denied=await handleModeration(h.request,h.env,new URL(h.request.url),h.user);
 assert.equal(denied.status,403);
 const auth=harness();
 const invalid=new Request(auth.request.url,{headers:{Origin:'https://attacker.example'}});
 assert.equal((await handleModeration(invalid,auth.env,new URL(invalid.url),auth.user)).status,403);
});
