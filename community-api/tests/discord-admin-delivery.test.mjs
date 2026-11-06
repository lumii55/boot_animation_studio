import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {dispatchAdminDMs} from '../src/discord-admin-bot.mjs';

const aid='a'.repeat(32);
const uid='1442186243000500355';
const app='1567910338223935488';
const key='previews/'+aid+'/'+'b'.repeat(32)+'.gif';
const eventId='publication:'+aid;
const frames=[new Uint8Array(8*8*4),new Uint8Array(8*8*4)];
for(let i=0;i<64;i++){
 frames[0].set([255,20,40,255],i*4);
 frames[1].set([30,240,150,255],i*4);
}
const browser={window:{}};
runInNewContext(readFileSync(new URL('../../js/community-gif.js',import.meta.url),'utf8'),browser);
const gif=browser.window.BASCommunityGif.encodeRGB332(frames,8,8,18);
const recorded=[];
function harness({missingGif=false,apiFails=false}={}){
 let state='queued',attempts=0,lastError='',messageId=null,readOps=0;
 const db={
  prepare(sql){
   return {
    async all(){
     assert.match(sql,/FROM discord_admin_events/);
     return {results:state==='queued'||state==='retry'?
      [{event_id:eventId,kind:'publication',source_id:aid,attempts}]:[]};
    },
    bind(...args){
     return {
      async all(){if(sql.includes('cleaned_at'))return {results:[]};throw Error('unexpected-bound-all '+sql);},
      async first(){
       if(sql.includes('FROM publication_drafts'))return {title:'Demo private ZIP',summary:'Review me',handle:'demo',
        license:'CC0-1.0',preview_key:missingGif?null:key,size_bytes:20000,fps:30,width:1080,height:2400};
       if(sql.includes('r2_operation_budget')){readOps++;return {class_b:readOps};}
       if(sql.includes("SET state='sending'")){state='sending';attempts++;return {event_id:eventId};}
       throw Error('unexpected-first-query '+sql);
      },
      async run(){
       if(sql.includes("state='delivered'")){state='delivered';messageId=args[0];lastError='';return {success:true};}
       if(sql.includes("state='retry'")){state='retry';lastError='delivery_failed'===sql.match(/delivery_failed/)?.[0]?
        'delivery_failed':'gif_preview_required';return {success:true};}
       if(sql.includes("state='blocked'")){state='blocked';return {success:true};}
       throw Error('unexpected-run-query '+sql);
      }
     };
    }
   };
  }
 };
 const env={
  DISCORD_ADMIN_BOT_ENABLED:'true',DISCORD_NOTIFICATIONS_APPROVED:'true',
  DISCORD_APPLICATION_ID:app,DISCORD_ADMIN_USER_ID:uid,
  DISCORD_PUBLIC_KEY:'a'.repeat(64),
  DISCORD_BOT_TOKEN:'FAKE_TOKEN_FOR_OFFLINE_TEST_ONLY_AND_NOT_REAL',
  MODERATION_STAGING_APPROVED:'true',ADMIN_PANEL_SEPARATED:'true',
  PUBLIC_CATALOG_ENABLED:'false',AUTH_PUBLIC_SIGNUP_APPROVED:'false',
  DB:db,
  PRIVATE_UPLOADS:{get:async actual=>{assert.equal(actual,key);return {size:gif.length,arrayBuffer:async()=>gif.buffer.slice(gif.byteOffset,gif.byteOffset+gif.byteLength)};}}
 };
 const requests=[];
 const fetcher=async (url,opt)=>{
  requests.push({url,method:opt.method,auth:opt.headers?.Authorization});
  assert.equal(opt.headers.Authorization,'Bot '+env.DISCORD_BOT_TOKEN);
  if(url.endsWith('/users/@me/channels')){
   assert.equal(JSON.parse(opt.body).recipient_id,uid);
   return Response.json({id:'123456789123456789'});
  }
  if(url.endsWith('/channels/123456789123456789/messages')){
   if(apiFails)return Response.json({message:'Forbidden'},{status:403});
   assert.ok(opt.body instanceof FormData,'GIF uses multipart attachment');
   const data=JSON.parse(opt.body.get('payload_json'));
   assert.deepEqual(data.allowed_mentions,{parse:[]});
   assert.match(data.embeds[0].title,/Nova publicação/);
   assert.equal(data.embeds[0].image.url,'attachment://bas-preview.gif');
   assert.equal(data.components[0].components.length,4);
   assert.equal(data.attachments[0].filename,'bas-preview.gif');
   const file=opt.body.get('files[0]');
   assert.equal(file.type,'image/gif');assert.equal(file.size,gif.length);
   recorded.push({buttons:data.components[0].components.length,filename:file.name,size:file.size});
   return Response.json({id:'234567891234567890'});
  }
  throw Error('unexpected Discord API call');
 };
 return {env,fetcher,requests,readState:()=>({state,attempts,lastError,messageId,readOps})};
}
test('real GIF is attached privately with four admin buttons, then delivered only once',async()=>{
 const h=harness();
 const first=await dispatchAdminDMs(h.env,h.fetcher);
 assert.equal(first.delivered,1);assert.equal(first.blocked,0);
 assert.deepEqual(h.readState(),{state:'delivered',attempts:1,lastError:'',messageId:'234567891234567890',readOps:1});
 assert.equal(recorded.at(-1).buttons,4);
 assert.equal((await dispatchAdminDMs(h.env,h.fetcher)).checked,0);
 assert.equal(h.requests.length,2);
});
test('missing GIF is not delivered and does not spend attempt budget',async()=>{
 const h=harness({missingGif:true});
 const result=await dispatchAdminDMs(h.env,h.fetcher);
 assert.equal(result.blocked,1);assert.equal(result.delivered,0);
 assert.deepEqual(h.readState(),{state:'retry',attempts:0,lastError:'gif_preview_required',messageId:null,readOps:0});
 assert.equal(h.requests.length,0);
});
test('Discord rejection remains retryable; disabling notifications prevents all sends',async()=>{
 const h=harness({apiFails:true});
 await dispatchAdminDMs(h.env,h.fetcher);
 assert.deepEqual(h.readState(),{state:'retry',attempts:1,lastError:'delivery_failed',messageId:null,readOps:1});
 const noSend=await dispatchAdminDMs({...h.env,DISCORD_NOTIFICATIONS_APPROVED:'false'},h.fetcher);
 assert.deepEqual(noSend,{disabled:true});
 assert.equal(h.requests.length,2);
});
