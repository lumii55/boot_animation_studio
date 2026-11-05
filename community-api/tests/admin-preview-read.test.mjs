import test from 'node:test';
import assert from 'node:assert/strict';
import {handleModeration} from '../src/beta-moderation.mjs';
const id='a'.repeat(32),version='b'.repeat(32),key='previews/'+id+'/'+version+'.gif';
const bytes=new Uint8Array(64);bytes.set([71,73,70,56,57,97],0);
function setup({hasPreview=true,validOwner=true,validGif=true}={}){
 let r2Reads=0;
 const env={
  MODERATION_STAGING_APPROVED:'true',ADMIN_PANEL_SEPARATED:'true',
  BAS_ADMIN_ORIGIN:'http://127.0.0.1:8090',BAS_ADMIN_CLIENT_ENABLED:'true',
  STAGING_DOWNLOADS_APPROVED:'true',MODERATOR_USER_IDS:'owner-id',
  DB:{prepare(sql){return{bind(){return{
   async first(){
    if(sql.includes('SELECT v.preview_key'))return hasPreview?{preview_key:key}:{preview_key:null};
    if(sql.includes('r2_operation_budget'))return {class_b:1};
    throw Error('Unexpected SQL '+sql.slice(0,60));
   }
  }}}}},
  PRIVATE_UPLOADS:{async get(path){r2Reads++;assert.equal(path,key);
   return {body:true,size:bytes.length,async arrayBuffer(){return validGif?bytes.buffer:new Uint8Array(64).buffer}};
  }}
 };
 const user={userId:'owner-id',clientKind:validOwner?'admin':'bas'};
 const request=new Request('https://bas.test/v1/beta/moderation/pending/'+id+'/preview',
  {headers:{Origin:'http://127.0.0.1:8090'}});
 return {env,user,request,readCount:()=>r2Reads};
}
test('private GIF is delivered only through administrator route without reusable R2 URL',async()=>{
 const h=setup();const r=await handleModeration(h.request,h.env,new URL(h.request.url),h.user);
 assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/gif');
 assert.match(r.headers.get('Cache-Control'),/no-store/);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
 assert.equal(h.readCount(),1);
});
test('private preview denies other BAS accounts and missing GIFs',async()=>{
 let h=setup({validOwner:false});let r=await handleModeration(h.request,h.env,new URL(h.request.url),h.user);
 assert.equal(r.status,403);assert.equal(h.readCount(),0);
 h=setup({hasPreview:false});r=await handleModeration(h.request,h.env,new URL(h.request.url),h.user);
 assert.equal(r.status,404);assert.equal(h.readCount(),0);
 h=setup({validGif:false});r=await handleModeration(h.request,h.env,new URL(h.request.url),h.user);
 assert.equal(r.status,503);
});
