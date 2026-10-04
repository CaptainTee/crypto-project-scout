import { createHash, randomUUID } from 'node:crypto';
import { canonicalUrl, normalizeHandle, normalizeDiscoveries, radarService } from './discovery.mjs';
import { classificationService, emptyClassification, CLASSIFICATION_LIMITS } from './classification.mjs';
import { getRadarRepository } from './repository.mjs';
export const MONITOR_LIMITS=Object.freeze({classifications:5,cooldown:60000});
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=(value,max=2000)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max):null;
const url=value=>{try{return canonicalUrl(text(value,2048));}catch{return null;}};
const normalized=value=>(value||'').toLowerCase().replace(/\s+/g,' ').trim();
export function eventType(e) {
  if(/fundraise receipt/i.test(e.sourceTitle||''))return 'FUNDRAISE_RECEIPT';
  if(/^early\s*:/i.test(e.text||''))return 'FRONTRUN_EARLY';
  if(/\b(?:raised|raises|secured)\s+(?:\$|\d)/i.test(e.text||''))return 'FUNDING_UPDATE';
  if(/\bflagged\b/i.test(e.text||''))return 'FRONTRUN_MENTION';
  return 'UNKNOWN';
}
export function eventFingerprint(projectId,e) {
  return hash(JSON.stringify([projectId,url(e.sourceUrl),eventType(e),e.sourcePublishedAt||null,normalized(text(e.text))]));
}
function safeDiscovery(d) {
  return {...d,projectName:text(d.projectName,160),projectHandle:normalizeHandle(d.projectHandle),projectWebsite:url(d.projectWebsite),rawCategory:text(d.rawCategory,120),rawDescription:text(d.rawDescription),fundingMention:text(d.fundingMention,500),fundingAmount:text(d.fundingAmount,80),fundingRound:text(d.fundingRound,80),investors:(d.investors||[]).slice(0,30).map(v=>text(v,160)),founderNames:(d.founderNames||[]).slice(0,30).map(v=>text(v,160)),founderHandles:(d.founderHandles||[]).slice(0,30).map(normalizeHandle).filter(Boolean),evidence:(d.evidence||[]).slice(0,100).map(e=>({...e,sourceUrl:url(e.sourceUrl),sourceTitle:text(e.sourceTitle,200),text:text(e.text)})).filter(e=>e.sourceUrl)};
}
function safeSources(sources) {
  return Object.fromEntries(Object.entries(sources||{}).slice(0,10).map(([id,value])=>{
    const source={status:['AVAILABLE','PARTIAL','UNAVAILABLE','NOT_CONFIGURED'].includes(value.status)?value.status:'UNAVAILABLE',checkedAt:text(value.checkedAt,40),issues:(value.issues||[]).slice(0,30).map(()=> 'Radar source unavailable')};
    for(const key of ['pagesRequested','pagesSuccessful','queriesAttempted','queriesSuccessful','resultsReturned','accepted','rejected','itemsFound','homepageDiscoveries','indexDiscoveries','articleReceiptDiscoveries','projectIdentities','duplicateMerges'])source[key]=Number.isFinite(value[key])?Math.max(0,value[key]):0;
    if(value.statusDiscoveries)source.statusDiscoveries=value.statusDiscoveries.slice(0,30).map(e=>({sourceUrl:url(e.sourceUrl),sourceTitle:text(e.sourceTitle,200),snippet:text(e.snippet),sourcePublishedAt:text(e.sourcePublishedAt,40),checkedAt:text(e.checkedAt,40),lastCheckedAt:text(e.lastCheckedAt,40),verification:'UNVERIFIED',evidenceKind:'DISCOVERY_ONLY'}));
    return [text(id,80),source];
  }));
}
function keys(d) {
  const result=[];
  if(d.projectWebsite) {const website=new URL(d.projectWebsite);result.push(`website:${website.hostname}${website.pathname.replace(/\/$/,'')}`);}
  if(d.projectHandle)result.push(`x:${d.projectHandle}`);
  if(!result.length)result.push(`name:${normalized(d.projectName)}:${d.sourceUrl}`);
  return result;
}
export async function persistClassification(repo,id,result,now=new Date()) {
  if(result.status==='FAILED'||!result.classification)return false;
  const previous=await repo.getClassification(id);
  const c=result.classification;
  const changed=(previous?.classification.status||'UNCLASSIFIED')!==c.status;
  const stored={classification:{...c,reason:text(c.reason,1000),cryptoSignals:c.cryptoSignals.slice(0,30).map(v=>text(v,200)),networks:c.networks.slice(0,30).map(v=>text(v,100)),evidenceIds:c.evidenceIds.slice(0,100).map(v=>text(v,100)),staleAfter:new Date(now.getTime()+CLASSIFICATION_LIMITS.ttl).toISOString()},classificationEvidence:(result.classificationEvidence||[]).slice(0,100).map(e=>({...e,sourceUrl:url(e.sourceUrl),title:text(e.title,200),snippet:text(e.snippet)})),previousStatus:previous?.classification.status||'UNCLASSIFIED',changed};
  await repo.saveClassification(id,stored);
  const p=await repo.getProject(id);
  await repo.upsertProject({...p,classificationStatus:c.status,classificationConfidence:c.confidence,needsReview:c.needsReview,updatedAt:now.toISOString()});return changed;
}
const active=new WeakSet();
export async function runRadarMonitoring({trigger='MANUAL',refreshSources=true,classifyNewProjects=false,refreshStale=false,repository,discover, classifier=classificationService,now=()=>new Date()}={}) {
  const repo=repository||await getRadarRepository();
  if(active.has(repo))throw Error('RADAR_BUSY');active.add(repo);
  let run;
  try {
    return await repo.transaction(async tx=>{
      const latest=await tx.getLatestMonitoringRun();
      if(latest && Date.parse(latest.startedAt)+MONITOR_LIMITS.cooldown>now().getTime())throw Error('RADAR_COOLDOWN');
      run={runId:randomUUID(),startedAt:now().toISOString(),finishedAt:null,status:'RUNNING',trigger,websiteStatus:'UNKNOWN',xStatus:'UNKNOWN',rawEventsFound:0,projectsCreated:0,projectsUpdated:0,eventsInserted:0,duplicatesSkipped:0,classificationsAttempted:0,classificationsChanged:0,issues:[],durationMs:0,sources:{}};
      await tx.beginMonitoringRun(run);
      try {
        const response=discover?await discover():refreshSources?await radarService.refresh():radarService.get();
        const raw=discover?(response.events||response.discoveries):radarService.latestEvents();
        const safeEvents=raw.map(safeDiscovery).filter(d=>d.evidence.length);
        const discoveries=normalizeDiscoveries(safeEvents);
        run.rawEventsFound=raw.length;
        run.sources=safeSources(response.sources);
        run.websiteStatus=Object.entries(run.sources).find(([id])=>/website/i.test(id))?.[1].status||'UNKNOWN';
        run.xStatus=Object.entries(run.sources).find(([id])=>/x/i.test(id))?.[1].status||'UNKNOWN';
        run.issues=(response.issues||[]).slice(0,30).map(()=> 'Radar source unavailable');
        const statuses=Object.values(run.sources).map(s=>s.status);
        run.status=statuses.length && statuses.every(s=>['UNAVAILABLE','NOT_CONFIGURED'].includes(s))?'FAILED':statuses.some(s=>s!=='AVAILABLE')?'PARTIAL':'SUCCESS';
        const projects=await tx.listProjects();
        for(const d of discoveries) {
          const identityKeys=keys(d);
          const matches=projects.filter(p=>p.identityKeys.some(k=>identityKeys.includes(k)));
          // Never join two established identities or conflicting official domains on a handle alone.
          if(matches.length>1 || matches[0]?.projectWebsite && d.projectWebsite && new URL(matches[0].projectWebsite).hostname!==new URL(d.projectWebsite).hostname) {run.issues.push('Ambiguous project identity skipped');run.status='PARTIAL';continue;}
          const old=matches[0];const at=now().toISOString();
          const allKeys=[...new Set([...(old?.identityKeys||[]),...identityKeys])];
          const funding=safeEvents.filter(v=>v.fundingMention && v.evidence.some(e=>d.evidence.some(de=>de.eventId===e.eventId))).sort((a,b)=>(a.evidence[0].sourcePublishedAt||a.evidence[0].checkedAt).localeCompare(b.evidence[0].sourcePublishedAt||b.evidence[0].checkedAt)).at(-1);
          const p={...(old||{}),id:old?.id||d.id,canonicalIdentityKey:allKeys.find(k=>k.startsWith('website:'))||allKeys.find(k=>k.startsWith('x:'))||allKeys[0],identityKeys:allKeys,projectName:d.projectName,projectHandle:d.projectHandle||old?.projectHandle||null,projectWebsite:d.projectWebsite||old?.projectWebsite||null,rawCategory:d.rawCategory||old?.rawCategory||null,firstSeenAt:old?.firstSeenAt||at,lastSeenAt:old?.lastSeenAt>at?old.lastSeenAt:at,firstFrontRunFlagAt:[old?.firstFrontRunFlagAt,d.frontRunFlaggedAt].filter(Boolean).sort()[0]||null,latestFrontRunEventAt:[old?.latestFrontRunEventAt,...d.evidence.map(e=>e.sourcePublishedAt)].filter(Boolean).sort().at(-1)||null,latestFundingMention:funding?.fundingMention||old?.latestFundingMention||null,latestLeadTimeClaim:d.frontRunLeadTimeDays??old?.latestLeadTimeClaim??null,createdAt:old?.createdAt||at,updatedAt:at,classificationStatus:old?.classificationStatus||'UNCLASSIFIED',classificationConfidence:old?.classificationConfidence??null,needsReview:old?.needsReview??true};
          await tx.upsertProject(p);if(!old){projects.push(p);await tx.updateReviewState(p.id,'NEW',at);run.projectsCreated++;}else {projects[projects.indexOf(old)]=p;run.projectsUpdated++;}
          for(const e of d.evidence) {
            const original=safeEvents.find(v=>v.evidence.some(ev=>ev.eventId===e.eventId))||d;
            const fingerprint=eventFingerprint(p.id,e);
            const event={eventId:fingerprint,projectId:p.id,source:e.source,sourceType:e.sourceType,sourceUrl:e.sourceUrl,eventType:eventType(e),sourcePublishedAt:e.sourcePublishedAt,frontRunFlaggedAt:original.frontRunFlaggedAt,retrievedAt:at,rawCategory:original.rawCategory,rawDescription:e.text,fundingMention:original.fundingMention,fundingAmount:original.fundingAmount,fundingRound:original.fundingRound,investors:original.investors,founderNames:original.founderNames,founderHandles:original.founderHandles,followerCount:original.followerCount,leadTimeClaim:original.frontRunLeadTimeDays,evidence:e,contentFingerprint:fingerprint};
            if(await tx.appendDiscoveryEvent(event))run.eventsInserted++;else run.duplicatesSkipped++;
          }
          const previous=await tx.getClassification(p.id);
          const eligible=!old || p.classificationStatus==='UNCLASSIFIED' || refreshStale && Date.parse(previous?.classification.staleAfter||'')<now().getTime();
          if(classifyNewProjects && eligible && run.classificationsAttempted<MONITOR_LIMITS.classifications) {
            run.classificationsAttempted++;
            let result;
            try {result=(await classifier.batch([{...d,id:p.id}],{refresh:!!previous})).results[0];if(result.status==='FAILED')throw Error();}
            catch {run.issues.push('Project classification unavailable');run.status='PARTIAL';continue;}
            // Research failure is isolated; a storage failure must roll back ingestion.
            if(await persistClassification(tx,p.id,result,now()))run.classificationsChanged++;
          }
        }
      } catch {throw Error('RADAR_MONITORING_FAILED');}
      run.issues=run.issues.slice(0,30);
      run.finishedAt=now().toISOString();run.durationMs=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.startedAt));
      await tx.finishMonitoringRun(run);return run;
    });
  } catch(error) {
    if(run) {run.status='FAILED';run.finishedAt=now().toISOString();run.durationMs=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.startedAt));run.issues=['Radar monitoring unavailable'];run.projectsCreated=0;run.projectsUpdated=0;run.eventsInserted=0;run.classificationsChanged=0;
      try {await repo.transaction(tx=>tx.finishMonitoringRun(run));} catch { /* Database outage: no failure record can be guaranteed. */ }
    }
    throw Error(error.message==='RADAR_BUSY'||error.message==='RADAR_COOLDOWN'?error.message:'Radar monitoring unavailable');
  } finally {active.delete(repo);}
}
export async function readRadar(repository) {
  const repo=repository||await getRadarRepository();
  const run=await repo.getLatestMonitoringRun();const discoveries=[];
  for(const p of await repo.listProjects()) {
    const events=await repo.listDiscoveryEvents(p.id);const e=events.at(-1);if(!e)continue;
    const result=await repo.getClassification(p.id);const c=structuredClone(result?.classification||emptyClassification());
    if(result && Date.parse(c.staleAfter)<=Date.now())c.needsReview=true;
    const review=await repo.getReviewState(p.id);
    discoveries.push({...p,source:e.source,sourceType:e.sourceType,sourceUrl:e.sourceUrl,sourcePublishedAt:e.sourcePublishedAt,discoveredAt:p.firstSeenAt,rawDescription:e.rawDescription,frontRunFlaggedAt:p.firstFrontRunFlagAt,frontRunLeadTimeDays:p.latestLeadTimeClaim,fundingMention:p.latestFundingMention,fundingAmount:e.fundingAmount,fundingRound:e.fundingRound,investors:e.investors,founderNames:[...new Set(events.flatMap(e=>e.founderNames||[]))],founderHandles:[...new Set(events.flatMap(e=>e.founderHandles||[]))],followerCount:events.map(e=>e.followerCount).filter(v=>v!=null).at(-1)??null,evidence:events.map(e=>e.evidence),classification:c,classificationStatus:c.status,classificationEvidence:result?.classificationEvidence||[],classificationCache:{status:result?(Date.parse(c.staleAfter)>Date.now()?'FRESH':'STALE'):'MISS',expiresAt:c.staleAfter||null},reviewState:review.state});
  }
  return {discoveries,sources:run?.sources||{},refreshedAt:run?.finishedAt||null,issues:run?.issues||[],counts:{rawEvents:run?.rawEventsFound||0,projectIdentities:discoveries.length,duplicateMerges:run?.duplicatesSkipped||0},persistenceMode:repo.persistenceMode,lastMonitoringRun:run,totalProjects:discoveries.length,newCount:discoveries.filter(d=>d.reviewState==='NEW').length};
}
