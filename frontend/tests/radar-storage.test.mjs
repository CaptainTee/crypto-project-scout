import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRadarRepository, PostgresRadarRepository, createMemoryStore } from '../lib/radar/repository.mjs';
import { runRadarMonitoring, readRadar, eventFingerprint, persistClassification } from '../lib/radar/monitoring.mjs';
import { parseDiscoveryText } from '../lib/radar/discovery.mjs';
import { emptyClassification } from '../lib/radar/classification.mjs';
import { monitorAuthorization, boundedJson } from '../lib/radar/auth.mjs';
const start='2026-10-01T00:00:00.000Z';
const source=(body,at=start,path='early')=>parseDiscoveryText(body,{source:'FrontRun Website',sourceType:'WEBSITE',sourceUrl:`https://frontrun.vc/${path}`,sourceTitle:path,sourcePublishedAt:null,checkedAt:at,verification:'FETCH_VERIFIED'});
const response=events=>({events,sources:{website:{status:'AVAILABLE'},x:{status:'AVAILABLE'}},issues:[]});
function harness(store=createMemoryStore()) {
 const repo=new InMemoryRadarRepository(store);let at=new Date(start);
 return {repo,store,next(){at=new Date(at.getTime()+86400000);},run(events,options={}){return runRadarMonitoring({repository:repo,discover:async()=>response(events),now:()=>at,...options});}};
}
test('cross-run dedup A/B then A/B/C, immutable first seen and advancing last seen',async()=>{
 const h=harness();const ab=source('EARLY: @projecta - product; EARLY: @projectb - product');
 const first=await h.run(ab);assert.equal(first.projectsCreated,2);h.next();
 const second=await h.run([...ab,...source('EARLY: @projectc - product')]);
 assert.equal(second.projectsCreated,1);assert.equal(second.projectsUpdated,2);assert.equal(second.duplicatesSkipped,2);assert.equal(second.eventsInserted,1);
 const view=await readRadar(h.repo);assert.equal(view.totalProjects,3);assert.equal(view.newCount,3);
 assert.equal(view.discoveries[0].firstSeenAt,start);assert.equal(view.discoveries[0].lastSeenAt,'2026-10-02T00:00:00.000Z');
});
test('handle gains website without changing ID and historical fingerprint',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - product'));const id=(await h.repo.listProjects())[0].id;h.next();
 await h.run(source('EARLY: @projecta - official website https://projecta.example/'));
 const p=(await h.repo.listProjects())[0];assert.equal(p.id,id);assert.equal(p.canonicalIdentityKey,'website:projecta.example');assert.equal(p.identityKeys.length,2);
 h.next();const run=await h.run(source('EARLY: @projecta - product'));assert.equal(run.duplicatesSkipped,1);
});
test('fundraise receipt adds event, updates funding, retains earlier event',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - product'));h.next();
 await h.run(source('Project A raised $5M seed project: @projecta',start,'Fundraise Receipt'));
 const projects=await h.repo.listProjects();assert.equal(projects.length,1);assert.match(projects[0].latestFundingMention,/\$5M/);
 const events=await h.repo.listDiscoveryEvents();assert.equal(events.length,2);assert.equal(events[1].eventType,'FUNDRAISE_RECEIPT');
});
test('classification transition history, review persistence and dismissal retains discoveries across service recreation',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - product'));const id=(await h.repo.listProjects())[0].id;
 const result=status=>({classification:{...emptyClassification(),status,classifiedAt:start},classificationEvidence:[]});
 await h.repo.transaction(async tx=>{await persistClassification(tx,id,result('POSSIBLY_CRYPTO'));await tx.updateReviewState(id,'REVIEWED');});
 const recreated=new InMemoryRadarRepository(h.store);
 await recreated.transaction(tx=>persistClassification(tx,id,result('CRYPTO_RELEVANT')));
 const history=await recreated.listClassifications(id);assert.equal(history.length,2);assert.equal(history[1].previousStatus,'POSSIBLY_CRYPTO');assert.equal(history[1].changed,true);
 assert.equal((await recreated.getReviewState(id)).state,'REVIEWED');await recreated.updateReviewState(id,'DISMISSED');
 assert.equal((await readRadar(new InMemoryRadarRepository(h.store))).discoveries[0].reviewState,'DISMISSED');assert.equal((await recreated.listDiscoveryEvents()).length,1);
 assert.equal((await recreated.getLatestMonitoringRun()).status,'SUCCESS');
 await assert.rejects(recreated.updateReviewState(id,'CRYPTO_RELEVANT'));
});
test('partial source failure retains successful discoveries and previous history',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - product'));h.next();
 const run=await h.run([], {discover:async()=>({...response(source('EARLY: @projectb - product')),sources:{website:{status:'AVAILABLE'},x:{status:'UNAVAILABLE'}},issues:['private stack']})});
 assert.equal(run.status,'PARTIAL');assert.equal(run.xStatus,'UNAVAILABLE');assert.equal((await h.repo.listProjects()).length,2);assert.doesNotMatch(JSON.stringify(run),/private stack/);
});
test('failed discovery records FAILED run and preserves earlier data',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - product'));h.next();
 await assert.rejects(h.run([],{discover:async()=>{throw Error('secret');}}),/unavailable/);
 assert.equal((await h.repo.getLatestMonitoringRun()).status,'FAILED');assert.equal((await h.repo.listProjects()).length,1);
});
test('ingestion failure rolls back partial writes and records sanitized failure',async()=>{
 const h=harness();const original=h.repo.appendDiscoveryEvent;h.repo.appendDiscoveryEvent=async()=>{throw Error('connection credentials');};
 await assert.rejects(h.run(source('EARLY: @projecta - product')));assert.equal((await h.repo.listProjects()).length,0);assert.equal((await h.repo.getLatestMonitoringRun()).status,'FAILED');h.repo.appendDiscoveryEvent=original;
});
test('concurrent runs rejected across repository instances sharing storage',async()=>{
 const h=harness();let release;const gate=new Promise(resolve=>{release=resolve;});
 const run=h.run([],{discover:async()=>{await gate;return response([]);}});
 await assert.rejects(runRadarMonitoring({repository:new InMemoryRadarRepository(h.store)}),/RADAR_BUSY/);release();await run;
});
test('cooldown blocks another source invocation',async()=>{
 const h=harness();await h.run([]);await assert.rejects(h.run([],{discover:()=>{throw Error('must not run');}}),/RADAR_COOLDOWN/);
});
test('fingerprint ignores retrieval time, normalizes URL and whitespace, differentiates source fragment',()=>{
 const e=source('EARLY: @projecta - product')[0].evidence[0];const f=eventFingerprint('stable',e);
 assert.equal(f,eventFingerprint('stable',{...e,checkedAt:'tomorrow',sourceUrl:e.sourceUrl+'/',text:e.text.replace(/ /g,'  ')}));assert.notEqual(f,eventFingerprint('stable',{...e,text:e.text+' update'}));
});
test('classification monitoring maximum five, existing classified projects not researched again',async()=>{
 const h=harness();let calls=0;const classifier={async batch(ds){calls++;return {results:ds.map(d=>({id:d.id,classification:{...emptyClassification(),status:'CRYPTO_RELEVANT',classifiedAt:start},classificationEvidence:[]}))};}};
 const events=source(Array.from({length:8},(_,i)=>`EARLY: @project${i} - product`).join('; '));const first=await h.run(events,{classifyNewProjects:true,classifier});assert.equal(first.classificationsAttempted,5);assert.equal(calls,5);
 h.next();await h.run(events,{classifyNewProjects:true,classifier});assert.equal(calls,8);
});
test('single classification failure isolates discovery and other classifications',async()=>{
 const h=harness();let attempts=0;const run=await h.run(source('EARLY: @projecta - product; EARLY: @projectb - product'),{classifyNewProjects:true,classifier:{async batch(ds){if(++attempts===1)throw Error('private');return {results:ds.map(d=>({id:d.id,classification:{...emptyClassification(),status:'CRYPTO_RELEVANT',classifiedAt:start}}))};}}});
 assert.equal(run.status,'PARTIAL');assert.equal(run.classificationsAttempted,2);assert.equal((await h.repo.listProjects()).length,2);
});
test('conflicting websites sharing handle do not merge',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - https://one.example'));h.next();const r=await h.run(source('EARLY: @projecta - https://two.example'));assert.equal(r.status,'PARTIAL');assert.equal((await h.repo.listProjects())[0].projectWebsite,'https://one.example/');
});
test('monitor auth is closed without secret, rejects wrong secret, accepts fixture secret without leaking it',()=>{
 assert.equal(monitorAuthorization(null,{production:true,secret:''}),503);assert.equal(monitorAuthorization('Bearer wrong',{secret:'fixture-only'}),401);assert.equal(monitorAuthorization('Bearer fixture-only',{secret:'fixture-only'}),200);
 assert.doesNotMatch(JSON.stringify(monitorAuthorization('Bearer fixture-only',{secret:'fixture-only'})),/fixture-only/);
});
test('request body streaming enforces byte bound',async()=>{
 await assert.rejects(boundedJson(new Request('http://localhost',{method:'POST',body:'x'.repeat(3000)})));
 assert.deepEqual(await boundedJson(new Request('http://localhost',{method:'POST',body:'{"state":"SEEN"}'})),{state:'SEEN'});
});
test('Postgres query contract parameterizes malicious input and uses advisory transaction lock',async()=>{
 const queries=[];const client={async query(sql,args){queries.push({sql,args});return {rows:sql.includes('pg_try')?[{acquired:true}]:[]};},release(){queries.push({sql:'release'});}};
 const repo=new PostgresRadarRepository({connect:async()=>client,query:client.query});
 const malicious="x'); DROP TABLE radar_projects; --";
 await repo.transaction(async tx=>{await tx.getProject(malicious);await tx.upsertProject({id:'a',canonicalIdentityKey:'x:a',identityKeys:['x:a'],createdAt:start,updatedAt:start});await tx.appendDiscoveryEvent({eventId:'e',projectId:'a',contentFingerprint:'f',retrievedAt:start});});
 assert(queries.some(q=>q.sql.includes('pg_try_advisory_xact_lock')));assert(queries.some(q=>q.sql==='COMMIT'));assert(queries.some(q=>q.args?.includes(malicious)));assert(!queries.some(q=>q.sql.includes(malicious)));assert(queries.some(q=>q.sql.includes('ON CONFLICT (content_fingerprint) DO NOTHING')));
});
test('durable adapter recreation reads shared deterministic SQL harness records',async()=>{
 const records=new Map();const pool={async query(sql,args){if(sql.startsWith('INSERT INTO radar_projects')){records.set(args[0],structuredClone(args[2]));return {rows:[]};}if(sql.startsWith('INSERT INTO radar_identity'))return {rows:[]};if(sql.startsWith('SELECT record FROM radar_projects WHERE'))return {rows:records.has(args[0])?[{record:records.get(args[0])}]:[]};throw Error('Unexpected SQL');}};
 await new PostgresRadarRepository(pool).upsertProject({id:'stable',canonicalIdentityKey:'x:stable',identityKeys:['x:stable'],createdAt:start,updatedAt:start});assert.equal((await new PostgresRadarRepository(pool).getProject('stable')).canonicalIdentityKey,'x:stable');
});
test('schema is additive and includes uniqueness, foreign keys and review constraints',async()=>{
 const {readFile}=await import('node:fs/promises');const sql=await readFile(new URL('../lib/radar/migrations/001_radar.sql',import.meta.url),'utf8');
 for(const name of ['projects','identity_aliases','discovery_events','classifications','review_state','monitor_runs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS radar_${name}`));assert.match(sql,/content_fingerprint text NOT NULL UNIQUE/);assert.match(sql,/CHECK \(state IN/);assert.doesNotMatch(sql,/DROP|DELETE|TRUNCATE/);
});
async function loadRoute(path,replacements={}) {
 const {readFileSync}=await import('node:fs');const {createRequire}=await import('node:module');const ts=createRequire(import.meta.url)('typescript');
 let code=readFileSync(new URL(path,import.meta.url),'utf8').replace(/import \{ NextResponse \} from ['"]next\/server['"];/,'const NextResponse=Response;');
 for(const [specifier,replacement] of Object.entries(replacements))code=code.replace(new RegExp(`import .* from ['"]${specifier.replaceAll('/','\\/')}['"];`),replacement);
 code=code.replace(/from ['"]@\/lib\/radar\/([^'"]+)['"]/g,(_,file)=>`from '${new URL('../lib/radar/'+file,import.meta.url).href}'`);
 code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
test('monitor HTTP route authentication and sanitized response without source calls when unauthorized',async()=>{
 const previousSecret=process.env.CAPTAINSCOUT_MONITOR_SECRET,previousMode=process.env.NODE_ENV;
 let calls=0;globalThis.__monitorFixture=async()=>{calls++;return {runId:'fixture-run',status:'SUCCESS'};};
 try {
  process.env.NODE_ENV='production';delete process.env.CAPTAINSCOUT_MONITOR_SECRET;
  const {POST}=await loadRoute('../app/api/radar/monitor/route.ts',{'@/lib/radar/monitoring.mjs':'const runRadarMonitoring=globalThis.__monitorFixture;'});
  const request=bearer=>new Request('https://captain.example/api/radar/monitor',{method:'POST',headers:bearer?{authorization:bearer}:{}});
  assert.equal((await POST(request())).status,503);process.env.CAPTAINSCOUT_MONITOR_SECRET='fixture-only';
  assert.equal((await POST(request('Bearer wrong'))).status,401);assert.equal(calls,0);
  const success=await POST(request('Bearer fixture-only'));assert.equal(success.status,200);assert.doesNotMatch(await success.text(),/fixture-only/);assert.equal(calls,1);
 } finally {if(previousSecret===undefined)delete process.env.CAPTAINSCOUT_MONITOR_SECRET;else process.env.CAPTAINSCOUT_MONITOR_SECRET=previousSecret;if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;delete globalThis.__monitorFixture;}
});
test('review HTTP route enforces bounded state-only mutation and preserves classification',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - product'));const id=(await h.repo.listProjects())[0].id;globalThis.__reviewRepo=h.repo;
 try {
  const {POST}=await loadRoute('../app/api/radar/review/route.ts',{'@/lib/radar/repository.mjs':"const getRadarRepository=async()=>globalThis.__reviewRepo;const REVIEW_STATES=['NEW','SEEN','REVIEWED','DISMISSED'];"});
  const request=(body,origin)=>new Request('https://captain.example/api/radar/review',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)});
  assert.equal((await POST(request({projectId:id,state:'REVIEWED'},'https://evil.example'))).status,403);
  for(const body of [{projectId:id,state:'arbitrary'},{projectId:id,state:'SEEN',classificationStatus:'NON_CRYPTO'},{projectId:'x'.repeat(3000),state:'SEEN'}])assert.equal((await POST(request(body))).status,400);
  assert.equal((await POST(request({projectId:'unknown',state:'SEEN'}))).status,404);
  assert.equal((await POST(request({projectId:id,state:'DISMISSED'}))).status,200);assert.equal((await h.repo.getReviewState(id)).state,'DISMISSED');assert.equal((await h.repo.getProject(id)).classificationStatus,'UNCLASSIFIED');assert.equal((await h.repo.listDiscoveryEvents()).length,1);
 } finally {delete globalThis.__reviewRepo;}
});
test('Postgres lock rejection and SQL error both roll back and release connection',async()=>{
 for(const acquired of [false,true]) {
  const calls=[];const client={async query(sql){calls.push(sql);if(sql.includes('pg_try'))return {rows:[{acquired}]};if(sql.startsWith('SELECT record'))throw Error('private DB detail');return {rows:[]};},release(){calls.push('release');}};
  const repo=new PostgresRadarRepository({connect:async()=>client});
  await assert.rejects(repo.transaction(tx=>tx.getProject('a')));assert(calls.includes('ROLLBACK'));assert(calls.includes('release'));assert(!calls.includes('COMMIT'));
 }
});
test('funding and founder metadata remain bound to their own historical source events',async()=>{
 const h=harness();await h.run([...source('EARLY: @projecta - founders: Alice;'),...source('Project A raised $5M seed project: @projecta',start,'receipt')]);
 const events=await h.repo.listDiscoveryEvents();assert.equal(events[0].fundingMention,null);assert.match(events[1].fundingMention,/\$5M/);assert.deepEqual((await readRadar(h.repo)).discoveries[0].founderNames,['Alice']);
});
test('shared hosting paths with distinct handles remain separate identities',async()=>{
 const h=harness();await h.run(source('EARLY: @projecta - https://host.example/project-a; EARLY: @projectb - https://host.example/project-b'));
 assert.equal((await h.repo.listProjects()).length,2);assert.equal((await h.repo.listDiscoveryEvents()).length,2);
});
test('classification storage failure rolls back discoveries instead of claiming partial persistence',async()=>{
 const h=harness();h.repo.saveClassification=async()=>{throw Error('private database failure');};
 const classifier={async batch(ds){return {results:ds.map(d=>({id:d.id,classification:{...emptyClassification(),status:'CRYPTO_RELEVANT',classifiedAt:start}}))};}};
 await assert.rejects(h.run(source('EARLY: @projecta - product'),{classifyNewProjects:true,classifier}),/unavailable/);
 assert.equal((await h.repo.listProjects()).length,0);assert.equal((await h.repo.listDiscoveryEvents()).length,0);assert.equal((await h.repo.getLatestMonitoringRun()).status,'FAILED');
});
