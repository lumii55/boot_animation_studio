/* BAS Community P15.6: bounded, explicit maintenance of private publication
 * draft reservations and orphan ZIPs. Never registered as an HTTP endpoint.
 * Do not expose object keys; never delete pending_review / approved archives.
 */
function now(){return Math.floor(Date.now()/1000);}
async function reserveDelete(env){
  const m=new Date().toISOString().slice(0,7);
  const result=await env.DB.prepare(
    'INSERT INTO r2_operation_budget(month,class_a,class_b) VALUES(?,1,0) '+
    'ON CONFLICT(month) DO UPDATE SET class_a=class_a+1,updated_at=unixepoch() '+
    'WHERE class_a<10000 RETURNING class_a'
  ).bind(m).first();
  if(!result)throw Error('r2_operation_cap');
}
export async function reconcilePrivatePublications(env,{limit=10,olderThanSeconds=3600}={}){
  if(env?.PUBLISH_MAINTENANCE_APPROVED!=='true' ||
     typeof env?.DB?.prepare!=='function'||typeof env?.DB?.batch!=='function'||
     typeof env?.PRIVATE_UPLOADS?.delete!=='function')
    throw Error('maintenance_not_approved');
  if(!Number.isInteger(limit)||limit<1||limit>20||
     !Number.isInteger(olderThanSeconds)||olderThanSeconds<3600||
     olderThanSeconds>604800)
    throw Error('unsafe_maintenance_parameters');
  const cutoff=now()-olderThanSeconds;
  const rows=await env.DB.prepare(
    "SELECT id,reservation_id,status,object_key FROM publication_drafts "+
    "WHERE (status='failed' AND object_key IS NOT NULL) "+
    "OR (status='awaiting_upload' AND expires_at<?) "+
    "OR (status='processing' AND updated_at<?) "+
    "ORDER BY updated_at ASC,id ASC LIMIT ?"
  ).bind(cutoff,cutoff,limit).all();
  const report={scanned:rows.results?.length||0,recovered:0,failed:0};
  for(const draft of rows.results||[]){
    try{
      if(draft.object_key){
        // A delete succeeds even if R2 object is already absent; accounting
        // and draft state change only after deletion is acknowledged by R2.
        await reserveDelete(env);
        await env.PRIVATE_UPLOADS.delete(draft.object_key);
      }
      if(draft.status==='failed'){
        await env.DB.prepare(
          "UPDATE publication_drafts SET object_key=NULL,updated_at=unixepoch() "+
          "WHERE id=? AND status='failed' AND object_key=?"
        ).bind(draft.id,draft.object_key).run();
      }else{
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE publication_drafts SET status='failed',object_key=NULL,updated_at=unixepoch() "+
            "WHERE id=? AND status=?"
          ).bind(draft.id,draft.status),
          env.DB.prepare(
            "UPDATE upload_reservations SET status='expired' WHERE id=? AND status='reserved'"
          ).bind(draft.reservation_id)
        ]);
      }
      report.recovered++;
    }catch(_){report.failed++;}
  }
  return report;
}
