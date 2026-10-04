import { randomUUID } from 'node:crypto';
/** Explicit opt-in integration helper. Caller owns target approval and secure configuration.
 * createRepository returns {repository, close}; close must destroy its pool/service instance.
 * No external connection is created by importing this module. Fixture rows are retained.
 */
export async function checkRadarRestart({approved=false,createRepository}={}) {
  if(!approved)throw Error('Explicit database test approval required');
  const id=`radar-restart-fixture-${randomUUID()}`,at=new Date().toISOString();
  let instance=await createRepository();
  try {
    await instance.repository.transaction(async repo=>{
      await repo.upsertProject({id,canonicalIdentityKey:`name:${id}`,identityKeys:[`name:${id}`],projectName:id,createdAt:at,updatedAt:at,firstSeenAt:at,lastSeenAt:at});
      await repo.appendDiscoveryEvent({eventId:id,projectId:id,contentFingerprint:id,retrievedAt:at});
      await repo.updateReviewState(id,'REVIEWED',at);
      await repo.saveClassification(id,{classification:{status:'UNCLASSIFIED',classifiedAt:at}});
    });
  } finally {await instance.close();}
  instance=await createRepository();
  try {
    const repo=instance.repository;
    const verified=(await repo.getProject(id))?.firstSeenAt===at && (await repo.listDiscoveryEvents(id)).some(e=>e.eventId===id) && (await repo.getReviewState(id)).state==='REVIEWED' && (await repo.getClassification(id))?.classification.status==='UNCLASSIFIED';
    if(!verified)throw Error('Radar restart verification failed');
    return {verified:true,fixtureId:id,persistenceMode:repo.persistenceMode};
  } finally {await instance.close();}
}
