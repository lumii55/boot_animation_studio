/* BAS P15.7 official Discord administrator bot (private DMs, never a self-bot).
 * Does nothing until an explicitly authorized Discord application is configured.
 * DMs and button/modal interactions are independent of the public BAS accounts.
 */
import {botModerateAction,botReadPendingZip,botQueue} from './beta-moderation.mjs';
const ID=/^[a-f0-9]{32}$/;
const SNOWFLAKE=/^[0-9]{17,22}$/;
const KEY=/^[a-fA-F0-9]{64}$/;
const SIGNATURE=/^[a-fA-F0-9]{128}$/;
const NOW=()=>Math.floor(Date.now()/1000);
const JHEAD={ 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"};
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:JHEAD});
const webhookResponse=(type,data)=>response(200,data?{type,data}:{type});
const plain=(x,max=900)=>String(x||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function hex(s){const a=new Uint8Array(s.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);return a;}
export function discordConfigured(env){
 return env?.DISCORD_ADMIN_BOT_ENABLED==='true'&&env?.DISCORD_NOTIFICATIONS_APPROVED==='true'&&
  SNOWFLAKE.test(String(env.DISCORD_APPLICATION_ID||''))&&
  SNOWFLAKE.test(String(env.DISCORD_ADMIN_USER_ID||''))&&KEY.test(String(env.DISCORD_PUBLIC_KEY||''))&&
  typeof env.DISCORD_BOT_TOKEN==='string'&&env.DISCORD_BOT_TOKEN.length>30&&
  env.MODERATION_STAGING_APPROVED==='true'&&env.ADMIN_PANEL_SEPARATED==='true'&&
  env.PUBLIC_CATALOG_ENABLED==='false'&&env.AUTH_PUBLIC_SIGNUP_APPROVED==='false'&&
  typeof env.DB?.prepare==='function';
}
export async function verifyDiscordSignature(request,raw,publicKey,clock=NOW()){
 const stamp=request.headers.get('X-Signature-Timestamp')||'',sig=request.headers.get('X-Signature-Ed25519')||'';
 if(!/^[0-9]{10}$/.test(stamp)||Math.abs(clock-Number(stamp))>300||
    !SIGNATURE.test(sig)||!KEY.test(publicKey)||raw.length>65536)return false;
 try{
  const key=await crypto.subtle.importKey('raw',hex(publicKey),{name:'Ed25519'},false,['verify']);
  const bytes=new TextEncoder().encode(stamp+raw);
  return await crypto.subtle.verify({name:'Ed25519'},key,hex(sig),bytes);
 }catch(_){return false;}
}
const KINDS=new Set(['publication','revision','post_report','comment_report']);
const ACTIONS=new Set(['approve','deny','details','zip','hide','dismiss']);
export function parseButtonId(value){
 const match=/^bas1:([a-z_]+):([a-z_]+):([a-f0-9]{32})$/.exec(String(value||''));
 if(!match||!ACTIONS.has(match[1])||!KINDS.has(match[2]))return null;
 const [_,action,kind,id]=match;
 if(['publication','revision'].includes(kind)&&!['approve','deny','details','zip'].includes(action))return null;
 if(['post_report','comment_report'].includes(kind)&&!['hide','dismiss','details'].includes(action))return null;
 return {action,kind,id};
}
export function adminButtons(kind,id){
 if(!KINDS.has(kind)||!ID.test(id))throw Error('invalid_admin_event');
 const actions=['publication','revision'].includes(kind)?
  [['approve','Aprovar',3],['deny','Negar',4],['details','Mais informações',2],['zip','Baixar ZIP',2]]:
  [['hide','Ocultar conteúdo',4],['dismiss','Dispensar',2],['details','Mais informações',2]];
 return [{type:1,components:actions.map(([action,label,style])=>({type:2,style,label,custom_id:`bas1:${action}:${kind}:${id}`}))}];
}
function adminModal(command){
 return webhookResponse(9,{custom_id:`bas1:deny:${command.kind}:${command.id}`,title:'Negar publicação',
  components:[{type:18,label:'Motivo da rejeição',component:{type:4,custom_id:'reason',style:2,
   min_length:5,max_length:500,required:true,placeholder:'Explique o motivo (mínimo 5 caracteres)'}}]});
}
function modalReason(interaction){
 const fields=interaction.data?.components||[];
 const found=fields.flatMap(c=>[c.component,...(c.components||[])]).find(c=>c?.custom_id==='reason');
 const value=typeof found?.value==='string'?found.value.trim():'';
 return [...value].length>=5&&[...value].length<=500?value:null;
}
async function discordFollowup(env,interaction,content,attachment=null){
 const url=`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`;
 if(attachment){
  const form=new FormData();
  const payload={content:plain(content,1800),flags:64,allowed_mentions:{parse:[]},
   attachments:[{id:0,filename:'bootanimation-review.zip'}]};
  form.set('payload_json',JSON.stringify(payload));
  form.set('files[0]',new Blob([attachment],{type:'application/zip'}),'bootanimation-review.zip');
  return fetch(url,{method:'POST',body:form,redirect:'manual'});
 }
 return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({content:plain(content,1800),flags:64,allowed_mentions:{parse:[]}}),redirect:'manual'});
}
async function processInteraction(env,interaction,command,reason=null){
 const {kind,id,action}=command;
 try{
  if(action==='details'){
   const data=await botQueue(env);
   const posts=data?.pending||[],reports=data?.reports||[],comments=data?.comment_reports||[];
   const item=kind==='publication'?posts.find(p=>p.review_kind==='publication'&&p.id===id):
    kind==='revision'?posts.find(p=>p.review_kind==='revision'&&p.edit_id===id):
    kind==='post_report'?reports.find(r=>r.id===id):comments.find(r=>r.id===id);
   if(!item)return discordFollowup(env,interaction,'Essa solicitação já não está pendente.');
   return discordFollowup(env,interaction,`📋 ${kind}\n${plain(item.title||item.animation_title||'Publicação')}\n@${plain(item.handle||item.comment_author||'?')}\n${plain(item.summary||item.reason||item.content||'')}`);
  }
  if(action==='zip'){
   const data=await botQueue(env),target=(data?.pending||[]).find(p=>kind==='revision'?p.edit_id===id:p.id===id);
   if(!target)return discordFollowup(env,interaction,'Publicação não está mais na fila de revisão.');
   const result=await botReadPendingZip(env,target.id,kind==='revision'?id:null);
   if(!result.ok)return discordFollowup(env,interaction,'ZIP indisponível. Confira pelo painel privado.');
   const limit=Math.min(Number(interaction.attachment_size_limit)||10485760,20971520);
   const bytes=await result.arrayBuffer();
   if(bytes.byteLength<1||bytes.byteLength>limit)return discordFollowup(env,interaction,'ZIP maior que o limite de upload do Discord. Use o painel privado.');
   return discordFollowup(env,interaction,'Arquivo da revisão pendente — acesso apenas administrativo.',bytes);
  }
  let value=action;
  if(action==='deny')value='reject';
  const result=await botModerateAction(env,kind,id,value,reason||'');
  const body=await result.json().catch(()=>({}));
  if(result.status===409)return discordFollowup(env,interaction,'Essa solicitação já foi analisada ou mudou de estado.');
  return discordFollowup(env,interaction,result.ok?
   `✅ ${plain(kind)}: ${plain(value)} registrado e auditado no BAS.`:
   'Não foi possível concluir: '+plain(body.error||'erro de moderação',90));
 }catch(_){return discordFollowup(env,interaction,'Falha ao processar a ação. Use o painel administrativo local.');}
}
// Discord requires a signed PING before accepting the Interactions Endpoint URL.
// Handshake does NOT authorize moderation or DM delivery. Keep those separately gated.
export function discordHandshakeReady(env){
 return SNOWFLAKE.test(String(env?.DISCORD_APPLICATION_ID||''))&&
  SNOWFLAKE.test(String(env?.DISCORD_ADMIN_USER_ID||''))&&
  KEY.test(String(env?.DISCORD_PUBLIC_KEY||''))&&
  env?.PUBLIC_CATALOG_ENABLED==='false'&&env?.AUTH_PUBLIC_SIGNUP_APPROVED==='false';
}
export async function discordInteractions(request,env,ctx){
 if(request.method!=='POST'||!discordHandshakeReady(env))return response(404,{error:'not_found'});
 const raw=await request.text();
 if(!await verifyDiscordSignature(request,raw,env.DISCORD_PUBLIC_KEY))return response(401,{error:'invalid_signature'});
 let message;try{message=JSON.parse(raw);}catch(_){return response(400,{error:'invalid_payload'});}
 if(message.type===1)return webhookResponse(1);
 // Absolutely no buttons or mutations until the owner explicitly enables the bot.
 if(!discordConfigured(env))return response(404,{error:'bot_disabled'});
 if(message.application_id!==env.DISCORD_APPLICATION_ID||message.user?.id!==env.DISCORD_ADMIN_USER_ID||
    message.guild_id||message.context!==1)return webhookResponse(4,{content:'Acesso administrativo negado.',flags:64});
 if(![3,5].includes(message.type))return webhookResponse(4,{content:'Interação não suportada.',flags:64});
 const cmd=parseButtonId(message.data?.custom_id);
 if(!cmd)return webhookResponse(4,{content:'Controle inválido ou expirado.',flags:64});
 if(message.type===3&&cmd.action==='deny')return adminModal(cmd);
 if(message.type===5&&cmd.action!=='deny')return webhookResponse(4,{content:'Formulário inválido.',flags:64});
 const reason=message.type===5?modalReason(message):null;
 if(message.type===5&&!reason)return webhookResponse(4,{content:'Informe um motivo com 5 a 500 caracteres.',flags:64});
 if(!ctx?.waitUntil)return webhookResponse(4,{content:'Processamento indisponível.',flags:64});
 ctx.waitUntil(processInteraction(env,message,cmd,reason));
 return webhookResponse(5,{flags:64});
}

/* A Cron Trigger calls this only after the owner authorizes and enables the app.
 * Queue entries are created by DB triggers, not by untrusted HTTP clients.
 * Missing REAL GIFs block publication DMs (no fake or unrelated GIF).
 */
async function loadAdminEvent(env,kind,id){
 const db=env.DB;
 if(kind==='publication')return db.prepare(
  "SELECT a.title,a.summary,u.handle,r.license,v.preview_key,v.size_bytes,v.fps,v.width,v.height FROM publication_drafts d "+
  'JOIN animations a ON a.id=d.animation_id JOIN community_users u ON u.id=a.owner_id '+
  'JOIN animation_rights r ON r.animation_id=a.id JOIN animation_versions v ON v.id=d.version_id '+
  "WHERE a.id=? AND d.status='pending_review' AND v.status='pending' LIMIT 1").bind(id).first();
 if(kind==='revision')return db.prepare(
  "SELECT e.title,e.summary,u.handle,e.license,v.preview_key,v.size_bytes,v.fps,v.width,v.height FROM owner_revisions e "+
  'JOIN animations a ON a.id=e.animation_id JOIN community_users u ON u.id=a.owner_id '+
  'JOIN animation_versions v ON v.id=COALESCE(e.version_id,e.base_version_id) '+
  "WHERE e.id=? AND e.status='pending_review' AND a.status='published' LIMIT 1").bind(id).first();
 if(kind==='post_report')return db.prepare(
  "SELECT a.title,r.reason,u.handle FROM community_reports r JOIN animations a ON a.id=r.animation_id "+
  "JOIN community_users u ON u.id=r.reporter_id WHERE r.id=? AND r.status='open' LIMIT 1").bind(id).first();
 if(kind==='comment_report')return db.prepare(
  "SELECT c.content AS summary,a.title,r.reason,u.handle FROM comment_reports r "+
  'JOIN community_comments c ON c.id=r.comment_id JOIN animations a ON a.id=c.animation_id '+
  "JOIN community_users u ON u.id=r.reporter_id WHERE r.id=? AND r.status='open' LIMIT 1").bind(id).first();
 return null;
}
async function reservePreviewRead(env){
 const month=new Date().toISOString().slice(0,7);
 return env.DB.prepare('INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,0,1) '+
   'ON CONFLICT(month) DO UPDATE SET class_b=class_b+1,updated_at=unixepoch() '+
   'WHERE class_b<5000 RETURNING class_b').bind(month).first();
}
async function loadRealGif(env,key){
 if(typeof key!=='string'||!key.startsWith('previews/')||!key.endsWith('.gif')||!env.PRIVATE_UPLOADS?.get)return null;
 if(!await reservePreviewRead(env))return null;
 const object=await env.PRIVATE_UPLOADS.get(key);
 if(!object||object.size<40||object.size>2*1024*1024)return null;
 const bytes=await object.arrayBuffer();const header=new TextDecoder().decode(bytes.slice(0,6));
 return ['GIF87a','GIF89a'].includes(header)?bytes:null;
}
export function buildPrivateDM(event,row,hasGif=false){
 const title=plain(row.title||'Denúncia',200),summary=plain(row.summary||row.reason||'',1000);
 const fields=[{name:'Criador / solicitante',value:'@'+plain(row.handle||'?'),inline:true}];
 if(row.license)fields.push({name:'Licença',value:plain(row.license),inline:true});
 if(row.fps)fields.push({name:'Animação',value:`${row.width}×${row.height} · ${row.fps} fps · ${row.size_bytes} bytes`});
 const embed={title:('publication'===event.kind?'📦 Nova publicação':event.kind==='revision'?'✏️ Revisão pendente':'🚩 Denúncia')+' · '+title,
  description:summary,fields,color:event.kind.endsWith('report')?0xED6C7B:0x9776C8,
  footer:{text:'BAS · administração privada · '+event.event_id.slice(-32)}};
 if(hasGif)embed.image={url:'attachment://bas-preview.gif'};
 return {allowed_mentions:{parse:[]},embeds:[embed],components:adminButtons(event.kind,event.source_id),
  nonce:'b'+event.source_id.slice(0,24),enforce_nonce:true};
}
export async function dispatchAdminDMs(env,fetcher=fetch){
 if(!discordConfigured(env))return {disabled:true};
 const events=(await env.DB.prepare("SELECT event_id,kind,source_id,attempts FROM discord_admin_events "+
  "WHERE state IN ('queued','retry') AND next_attempt_at<=unixepoch() AND attempts<5 "+
  'ORDER BY created_at ASC,event_id ASC LIMIT 3').all()).results||[];
 let delivered=0,blocked=0;
 for(const event of events){
  const row=await loadAdminEvent(env,event.kind,event.source_id);
  if(!row){await env.DB.prepare("UPDATE discord_admin_events SET state='blocked',last_error='no_longer_pending' WHERE event_id=?").bind(event.event_id).run();blocked++;continue;}
  let gif=null;
  if(['publication','revision'].includes(event.kind)){
   gif=await loadRealGif(env,row.preview_key);
   if(!gif){
    // GIF may still be encoding/uploading after the ZIP enters moderation.
    // Never send a fake preview, spend attempt budget waiting for GIF,
    // or permanently discard a pending item.
    await env.DB.prepare("UPDATE discord_admin_events SET state='retry',"+
     "last_error='gif_preview_required',next_attempt_at=unixepoch()+300 "+
     "WHERE event_id=? AND state IN ('queued','retry')").bind(event.event_id).run();
    blocked++;continue;
   }
  }
  const claimed=await env.DB.prepare("UPDATE discord_admin_events SET state='sending',attempts=attempts+1 "+
   "WHERE event_id=? AND state IN ('queued','retry') RETURNING event_id").bind(event.event_id).first();
  if(!claimed)continue;
  try{
   const user=env.DISCORD_ADMIN_USER_ID;
   const channelResult=await fetcher('https://discord.com/api/v10/users/@me/channels',{
    method:'POST',headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({recipient_id:user}),redirect:'manual'});
   if(!channelResult.ok||channelResult.status>=300)throw Error('dm_unavailable');
   const channel=await channelResult.json();if(!SNOWFLAKE.test(channel?.id||''))throw Error('invalid_dm');
   const content=buildPrivateDM(event,row,!!gif);
   let options={method:'POST',headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify(content),redirect:'manual'};
   if(gif){const form=new FormData();form.set('payload_json',JSON.stringify({
    ...content,attachments:[{id:0,filename:'bas-preview.gif',description:'Prévia real do ZIP em análise'}]}));
    form.set('files[0]',new Blob([gif],{type:'image/gif'}),'bas-preview.gif');
    options={method:'POST',headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN},body:form,redirect:'manual'};}
   const sent=await fetcher(`https://discord.com/api/v10/channels/${channel.id}/messages`,options);
   if(!sent.ok||sent.status>=300)throw Error('discord_send_failed');
   const message=await sent.json();
   if(!SNOWFLAKE.test(message?.id||''))throw Error('invalid_discord_ack');
   await env.DB.prepare("UPDATE discord_admin_events SET state='delivered',discord_message_id=?,delivered_at=unixepoch(),last_error='' WHERE event_id=?")
    .bind(message.id,event.event_id).run();delivered++;
  }catch(_){
   await env.DB.prepare("UPDATE discord_admin_events SET state='retry',last_error='delivery_failed',next_attempt_at=unixepoch()+300 WHERE event_id=? AND state='sending'")
    .bind(event.event_id).run();
  }
 }
 return {checked:events.length,delivered,blocked};
}
