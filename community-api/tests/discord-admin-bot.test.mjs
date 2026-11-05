import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {discordConfigured,discordHandshakeReady,verifyDiscordSignature,parseButtonId,adminButtons,
  buildPrivateDM,discordInteractions,dispatchAdminDMs} from '../src/discord-admin-bot.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const publicHex=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
const admin='123456789012345678',app='987654321098765432',id='a'.repeat(32);
const env={DISCORD_ADMIN_BOT_ENABLED:'true',DISCORD_APPLICATION_ID:app,
 DISCORD_ADMIN_USER_ID:admin,DISCORD_PUBLIC_KEY:publicHex,
 DISCORD_BOT_TOKEN:'TEST_ONLY_PLACEHOLDER_THIS_IS_NOT_A_REAL_TOKEN_ABCDEFGHIJ',
 MODERATION_STAGING_APPROVED:'true',ADMIN_PANEL_SEPARATED:'true',
 PUBLIC_CATALOG_ENABLED:'false',AUTH_PUBLIC_SIGNUP_APPROVED:'false',
 DB:{prepare(){return {bind(){return {async all(){return {results:[]}}}}}}}};
function req(obj,key=privateKey,stamp=String(Math.floor(Date.now()/1000))){
 const body=JSON.stringify(obj);return new Request('https://test.invalid/v1/discord/interactions',{
  method:'POST',headers:{'X-Signature-Ed25519':sign(null,Buffer.from(stamp+body),key).toString('hex'),
   'X-Signature-Timestamp':stamp,'Content-Type':'application/json'},body});
}
const component={type:3,application_id:app,user:{id:admin},context:1,
 data:{custom_id:'bas1:deny:publication:'+id}};
test('signed Discord handshake works with bot disabled; DM dispatch and moderation stay locked',async()=>{
 const disabled={...env,DISCORD_ADMIN_BOT_ENABLED:'false'};
 assert.equal(discordConfigured(disabled),false);
 assert.equal(discordHandshakeReady(disabled),true);
 const ping=await discordInteractions(req({type:1}),disabled);
 assert.equal(ping.status,200);
 assert.deepEqual(await ping.json(),{type:1});
 const action=await discordInteractions(req(component),disabled);
 assert.equal(action.status,404);
 assert.deepEqual(await action.json(),{error:'bot_disabled'});
 assert.deepEqual(await dispatchAdminDMs(disabled),{disabled:true});
});
test('handshake rejects incomplete config, stale and forged signatures, and GET',async()=>{
 const disabled={...env,DISCORD_ADMIN_BOT_ENABLED:'false'};
 assert.equal(discordHandshakeReady({...disabled,DISCORD_PUBLIC_KEY:'invalid'}),false);
 assert.equal((await discordInteractions(req({type:1}),{...disabled,DISCORD_PUBLIC_KEY:'invalid'})).status,404);
 assert.equal((await discordInteractions(req({type:1},privateKey,'1234567890'),disabled)).status,401);
 const forged=new Request('https://test.invalid/v1/discord/interactions',{method:'POST',body:'{"type":1}'});
 assert.equal((await discordInteractions(forged,disabled)).status,401);
 assert.equal((await discordInteractions(new Request('https://test.invalid/v1/discord/interactions'),disabled)).status,404);
});
test('Ed25519 signature exact body and 5-minute freshness',async()=>{
 const incoming=req({type:1});const body=await incoming.clone().text();
 assert.equal(await verifyDiscordSignature(incoming,body,publicHex),true);
 assert.equal(await verifyDiscordSignature(incoming,body+' ',publicHex),false);
 assert.equal(await verifyDiscordSignature(req({type:1},privateKey,'1234567890'),'{"type":1}',publicHex),false);
 const bad=new Request('https://test.invalid/',{method:'POST',body,headers:{'X-Signature-Timestamp':String(Math.floor(Date.now()/1000))}});
 assert.equal(await verifyDiscordSignature(bad,body,publicHex),false);
});
test('only exact administrator in direct bot DM may open rejection modal',async()=>{
 let response=await discordInteractions(req({type:1}),env);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{type:1});
 response=await discordInteractions(req({...component,user:{id:'111111111111111111'}}),env);
 assert.match((await response.json()).data.content,/negado/);
 response=await discordInteractions(req({...component,context:0,guild_id:admin}),env);
 assert.match((await response.json()).data.content,/negado/);
 response=await discordInteractions(req(component),env);
 const json=await response.json();assert.equal(json.type,9);
 assert.equal(json.data.components[0].component.required,true);
});
test('button IDs are typed, bounded, and avoid untrusted arbitrary actions',()=>{
 assert.deepEqual(parseButtonId('bas1:approve:revision:'+id),{action:'approve',kind:'revision',id});
 for(const invalid of ['bas1:approve:comment_report:'+id,'bas1:zip:post_report:'+id,
   'bas1:delete:publication:'+id,'bas1:approve:publication:../secret'])assert.equal(parseButtonId(invalid),null);
 assert.equal(adminButtons('publication',id)[0].components.length,4);
 assert.equal(adminButtons('comment_report',id)[0].components.length,3);
 const message=buildPrivateDM({kind:'publication',source_id:id,event_id:'publication:'+id},
   {title:'Demo',handle:'someone',license:'CC-BY-4.0',width:1080,height:2400,fps:30,size_bytes:3000},true);
 assert.deepEqual(message.allowed_mentions,{parse:[]});
 assert.equal(message.embeds[0].image.url,'attachment://bas-preview.gif');
});
