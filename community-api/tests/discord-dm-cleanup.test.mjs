import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalServer,databaseBinding} from '../dev-server.mjs';
import {cleanupResolvedDMs} from '../src/discord-admin-bot.mjs';

const A='a'.repeat(32), B='b'.repeat(32);
const APP='1567910338223935488',USER='1442186243000500355';
function fixture(t){
 const local=createLocalServer({memory:true});t.after(()=>local.database.close());
 const db=local.database;
 const env={DB:databaseBinding(db),DISCORD_ADMIN_BOT_ENABLED:'true',
  DISCORD_NOTIFICATIONS_APPROVED:'true',DISCORD_APPLICATION_ID:APP,
  DISCORD_ADMIN_USER_ID:USER,DISCORD_PUBLIC_KEY:'f'.repeat(64),
  DISCORD_BOT_TOKEN:'EXAMPLE_BOT_TOKEN_NOT_REAL_0123456789',
  MODERATION_STAGING_APPROVED:'true',ADMIN_PANEL_SEPARATED:'true',
  PUBLIC_CATALOG_ENABLED:'false',AUTH_PUBLIC_SIGNUP_APPROVED:'false'};
 db.prepare("INSERT INTO discord_admin_events(event_id,kind,source_id,state,discord_message_id,dm_channel_id) VALUES(?,?,?,'delivered',?,?)")
  .run('publication:'+A,'publication',A,'234567891234567890','123456789123456789');
 db.prepare("INSERT INTO discord_admin_events(event_id,kind,source_id,state) VALUES(?,?,?,'queued')")
  .run('publication:'+B,'publication',B);
 return {db,env};
}
test('only resolved bot DMs are deleted; durable audit and pending items remain',async t=>{
 const h=fixture(t),calls=[];
 const fetcher=async (url,options)=>{calls.push({url,method:options.method});return new Response(null,{status:204});};
 const result=await cleanupResolvedDMs(h.env,fetcher);
 assert.equal(result.deleted,1);assert.equal(calls.length,1);
 assert.match(calls[0].url,/channels\/123456789123456789\/messages\/234567891234567890/);
 assert.equal(calls[0].method,'DELETE');
 const done=h.db.prepare('SELECT state,cleaned_at FROM discord_admin_events WHERE event_id=?').get('publication:'+A);
 assert.equal(done.state,'delivered');assert.ok(done.cleaned_at>0);
 const pending=h.db.prepare('SELECT state,cleaned_at FROM discord_admin_events WHERE event_id=?').get('publication:'+B);
 assert.equal(pending.state,'queued');assert.equal(pending.cleaned_at,null);
 assert.equal((await cleanupResolvedDMs(h.env,fetcher)).checked,0);
 assert.equal(calls.length,1);
});
test('Discord delete failure hides buttons and retries without losing audit',async t=>{
 const h=fixture(t),methods=[];let deleted=false;
 const fetcher=async (_url,options)=>{
  methods.push(options.method);
  if(options.method==='DELETE'&&!deleted)return Response.json({message:'Try later'},{status:403});
  if(options.method==='PATCH'){assert.deepEqual(JSON.parse(options.body).components,[]);return Response.json({});}
  return new Response(null,{status:404});
 };
 const first=await cleanupResolvedDMs(h.env,fetcher);
 assert.equal(first.failed,1);assert.deepEqual(methods,['DELETE','PATCH']);
 const row=h.db.prepare('SELECT cleanup_attempts,cleaned_at FROM discord_admin_events WHERE event_id=?').get('publication:'+A);
 assert.equal(row.cleanup_attempts,1);assert.equal(row.cleaned_at,null);
 assert.equal((await cleanupResolvedDMs(h.env,fetcher)).checked,0,'backoff blocks immediate repeat');
 h.db.prepare('UPDATE discord_admin_events SET cleanup_retry_at=0 WHERE event_id=?').run('publication:'+A);
 deleted=true;
 assert.equal((await cleanupResolvedDMs(h.env,fetcher)).deleted,1);
 assert.ok(h.db.prepare('SELECT cleaned_at FROM discord_admin_events WHERE event_id=?').get('publication:'+A).cleaned_at);
});
