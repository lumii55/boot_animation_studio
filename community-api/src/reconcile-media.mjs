/* P15.6 private media reconciler. Never expose as an HTTP endpoint.
 * Requires explicit maintenance authorization, private R2 binding and D1.
 * R2 deletions are idempotent; accounting moves ONLY after a successful delete.
 */
function now(){return Math.floor(Date.now()/1000);}
async function reserveOperation(env){
  const month=new Date().toISOString().slice(0,7);
  const result=await env.DB.prepare(
    'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,1,0) '+
    'ON CONFLICT(month) DO UPDATE SET class_a=class_a+1,updated_at=unixepoch() '+
    'WHERE class_a<10000 RETURNING class_a'
  ).bind(month).first();
  if(!result)throw Error('r2_budget_exhausted');
}
export async function reconcileCreatorMedia(env,{limit=10,olderThanSeconds=3600}={}){
  if(env?.MEDIA_MAINTENANCE_APPROVED!=='true' ||
     typeof env?.DB?.prepare!=='function' ||
     typeof env?.PRIVATE_UPLOADS?.delete!=='function')
    throw Error('maintenance_not_approved');
  if(!Number.isInteger(limit)||limit<1||limit>20 ||
     !Number.isInteger(olderThanSeconds)||olderThanSeconds<3600)
    throw Error('unsafe_maintenance_parameters');
  const deadline=now()-olderThanSeconds;
  const result=await env.DB.prepare(
    "SELECT id,object_key,status FROM creator_media "+
    "WHERE status='delete_pending' OR (status='processing' AND created_at<?) "+
    "ORDER BY updated_at ASC,id ASC LIMIT ?"
  ).bind(deadline,limit).all();
  const report={scanned:result.results?.length||0,recovered:0,failed:0};
  for(const item of result.results||[]){
    try{
      await reserveOperation(env);
      await env.PRIVATE_UPLOADS.delete(item.object_key);
      if(item.status==='delete_pending'){
        await env.DB.prepare(
          "UPDATE creator_media SET status='deleted',updated_at=unixepoch() "+
          "WHERE id=? AND status='delete_pending'"
        ).bind(item.id).run();
      }else{
        await env.DB.prepare(
          "UPDATE creator_media SET status='failed',updated_at=unixepoch() "+
          "WHERE id=? AND status='processing' AND created_at<?"
        ).bind(item.id,deadline).run();
      }
      report.recovered++;
    }catch(_){report.failed++;}
  }
  return report;
}
