import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './fixtures/radar.cjs';
import {classificationAction,classificationCacheLabel,defaults,reviewActions,reviewCounts,selectDiscoveries,statusOf,researchIdentity,resolveResearchTarget,safeUrl,isNewGem} from '../lib/radar/view.mjs';
const records=fixtures.response.discoveries;
test('default visibility prioritizes crypto and preserves unclassified-only cache',()=>{assert(selectDiscoveries(records,defaults()).every(d=>['CRYPTO_RELEVANT','POSSIBLY_CRYPTO'].includes(statusOf(d))));assert.equal(selectDiscoveries([records[3]],defaults()).length,1);});
test('classification filters reveal all stored states',()=>{for(const status of ['CRYPTO_RELEVANT','POSSIBLY_CRYPTO','NON_CRYPTO','UNCLASSIFIED'])assert(selectDiscoveries(records,{...defaults(),statuses:[status]}).every(d=>statusOf(d)===status));});
test('local search includes name, handle, category, reason and networks',()=>{for(const term of ['Signal a','signal_a','Infrastructure','trajectory','Base'])assert(selectDiscoveries(records,defaults(),term).length);assert.equal(selectDiscoveries(records,defaults(),'absent').length,0);});
test('network, classification review, source, funding and retrieval recency filters',()=>{assert(selectDiscoveries(records,{...defaults(),network:'Base'}).every(d=>d.classification.networks.includes('Base')));assert.equal(selectDiscoveries(records,{...defaults(),classificationNeedsReview:true}).length,1);assert.equal(selectDiscoveries(records,{...defaults(),funding:true}).length,1);assert(selectDiscoveries(records,{...defaults(),source:'FrontRun X'}).length);assert.equal(selectDiscoveries(records,{...defaults(),source:'absent'}).length,0);assert.equal(selectDiscoveries(records,{...defaults(),recent:true},'','newest',Date.parse('2027-01-01')).length,0);});
test('sorts are deterministic with unknown values last',()=>{assert.equal(selectDiscoveries(records,defaults(),'','funding')[0].id,'a');assert.equal(selectDiscoveries(records,defaults(),'','confidence').at(-1).id,'b');for(const sort of ['newest','flag','lead'])assert.deepEqual(selectDiscoveries(records,defaults(),'',sort),selectDiscoveries([...records].reverse(),defaults(),'',sort));});
test('research uses explicit website then valid handle without guessing',()=>{assert.equal(researchIdentity(records[0]),'https://official.example/');assert.equal(researchIdentity(records[1]),'@signal_b');assert.equal(researchIdentity(records[4]),null);assert.equal(researchIdentity(records[5]),null);});
test('external links reject unsafe schemes and credentials',()=>{for(const url of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com','invalid'])assert.equal(safeUrl(url),null);assert.equal(safeUrl('https://example.com'),'https://example.com/');});
test('New Gem requires crypto relevance and explicit source recency, not retrieval',()=>{const now=Date.parse('2026-10-04');assert(isNewGem(records[0],now));assert(!isNewGem(records[1],now));assert(!isNewGem({...records[0],frontRunFlaggedAt:null,sourcePublishedAt:null},now));assert(!isNewGem(records[0],Date.parse('2027-01-01')));assert(!isNewGem(records[0],Date.parse('2026-09-01')));});

const d = overrides => ({projectName:'Project',identityKeys:[],classificationEvidence:[],...overrides});
const e = (sourceType,sourceUrl,verification='VERIFIED') => ({sourceType,sourceUrl,verification});
const check = (input,value,type,confidence,source) => {const result=resolveResearchTarget(input);assert.deepEqual([result.value,result.type,result.confidence,result.source],[value,type,confidence,source]);assert(result.reason);assert.equal(researchIdentity(input),result.value);};
test('safe website wins over explicit handle',()=>check(d({projectWebsite:'https://project.example',projectHandle:'project'}),'https://project.example/','WEBSITE','HIGH','DISCOVERY'));
test('explicit handle is normalized',()=>check(d({projectHandle:'@Project'}),'@project','X','HIGH','DISCOVERY'));
test('names and protocol-less website keys never become targets',()=>{for(const identityKeys of [[],['name:project'],['website:project.example/path']])check(d({identityKeys}),null,null,'LOW','NONE');});
test('valid persisted X keys have medium confidence and priority over evidence',()=>check(d({identityKeys:['name:project','x:Project'],classificationEvidence:[e('OFFICIAL','https://other.example')]}),'@project','X','MEDIUM','PERSISTED_IDENTITY'));
test('verified official HTTPS evidence is a medium fallback',()=>check(d({classificationEvidence:[e('OFFICIAL','https://project.example')]}),'https://project.example/','WEBSITE','MEDIUM','VERIFIED_EVIDENCE'));
test('verified project X profiles are medium fallbacks',()=>{for(const url of ['https://x.com/Project','https://www.twitter.com/Project/'])check(d({classificationEvidence:[e('PROJECT_X',url)]}),'@project','X','MEDIUM','VERIFIED_EVIDENCE');});
for(const sourceType of ['WEB','FRONTRUN'])test(`${sourceType} evidence cannot become an identity`,()=>check(d({classificationEvidence:[e(sourceType,'https://project.example')]}),null,null,'LOW','NONE'));
for(const verification of ['UNVERIFIED','INFERRED','UNAVAILABLE'])test(`${verification} evidence cannot become an identity`,()=>{for(const sourceType of ['OFFICIAL','PROJECT_X'])check(d({classificationEvidence:[e(sourceType,sourceType==='OFFICIAL'?'https://project.example':'https://x.com/project',verification)]}),null,null,'LOW','NONE');});
test('unsafe and credentialed URLs and third-party websites are rejected',()=>{
 for(const url of ['https://user:pass@project.example','javascript:alert(1)','data:text/html,test','ftp://project.example','https://frontrun.vc/article','https://frontrun.vc./article','https://www.frontrun.vc/article','https://x.com/project','https://twitter.com/project','https://google.co.uk/search?q=project','https://bing.com/search','https://medium.com/project/article','https://coindesk.com/article','https://127.0.0.1','https://[::1]','https://project.example:8443']) {
  check(d({projectWebsite:url}),null,null,'LOW','NONE');check(d({classificationEvidence:[e('OFFICIAL',url)]}),null,null,'LOW','NONE');
 }
 check(d({classificationEvidence:[e('OFFICIAL','http://project.example')]}),null,null,'LOW','NONE');
 check(d({projectWebsite:'https://frontrun.vc',projectHandle:'project'}),'@project','X','HIGH','DISCOVERY');
});
test('project X evidence rejects posts, routes, lookalikes and extra URL components',()=>{
 for(const url of ['https://x.com/project/status/123','https://x.com/search','https://x.com/intent','https://x.com/frontrunvc','https://x.com/project?q=test','https://x.com/project#test','https://x.com.evil.example/project','http://x.com/project','https://user:pass@x.com/project'])check(d({classificationEvidence:[e('PROJECT_X',url)]}),null,null,'LOW','NONE');
 for(const projectHandle of ['bad-handle','abcdefghijklmnop','']) {check(d({projectHandle}),null,null,'LOW','NONE');check(d({identityKeys:['x:'+projectHandle]}),null,null,'LOW','NONE');}
});
test('conflicting equally trusted candidates fail closed and duplicate profiles agree',()=>{
 for(const classificationEvidence of [[e('OFFICIAL','https://one.example'),e('OFFICIAL','https://two.example')],[e('PROJECT_X','https://x.com/one'),e('PROJECT_X','https://twitter.com/two')]]) {
  const input=d({classificationEvidence});check(input,null,null,'LOW','NONE');assert.match(resolveResearchTarget(input).reason,/Conflicting/);
 }
 check(d({identityKeys:['x:one','x:two']}),null,null,'LOW','NONE');
 check(d({classificationEvidence:[e('PROJECT_X','https://x.com/Project'),e('PROJECT_X','https://twitter.com/project/')]}),'@project','X','MEDIUM','VERIFIED_EVIDENCE');
});
test('verified official website takes priority over a complementary project X profile',()=>{
 const classificationEvidence=[e('OFFICIAL','https://one.example'),e('PROJECT_X','https://x.com/one')];
 for(const evidence of [classificationEvidence,[...classificationEvidence].reverse()])check(d({classificationEvidence:evidence}),'https://one.example/','WEBSITE','MEDIUM','VERIFIED_EVIDENCE');
});
test('duplicate equivalent verified official websites agree',()=>check(d({classificationEvidence:[e('OFFICIAL','https://Project.example'),e('OFFICIAL','https://project.example/')]}),'https://project.example/','WEBSITE','MEDIUM','VERIFIED_EVIDENCE'));
test('resolver is pure, ignores snippet URLs, and wrapper returns final value',()=>{
 const input=d({classificationEvidence:[{...e('WEB','https://third.example'),snippet:'Official: https://project.example'}]});const before=JSON.stringify(input);check(input,null,null,'LOW','NONE');assert.equal(JSON.stringify(input),before);
});

const reviewRecords=['NEW','SEEN','REVIEWED','DISMISSED'].flatMap((reviewState,i)=>[
 fixtures.discovery(`${i}-a`,'CRYPTO_RELEVANT',{reviewState,discoveredAt:'2026-10-01',fundingMention:'Seed',classification:{...records[0].classification,needsReview:i%2===0}}),
 fixtures.discovery(`${i}-b`,'POSSIBLY_CRYPTO',{reviewState,discoveredAt:'2026-10-02'}),
]);
const ids=list=>list.map(d=>d.id);
test('no review selection includes all persisted states including dismissed',()=>assert.deepEqual(new Set(selectDiscoveries(reviewRecords,defaults()).map(d=>d.reviewState)),new Set(['NEW','SEEN','REVIEWED','DISMISSED'])));
for(const state of ['NEW','SEEN','REVIEWED','DISMISSED'])test(`review filter selects only ${state}`,()=>assert.deepEqual(ids(selectDiscoveries(reviewRecords,{...defaults(),reviewStates:[state]})),ids(reviewRecords.filter(d=>d.reviewState===state).reverse())));
test('multiple review selections compose with classification and search',()=>{
 const filters={...defaults(),reviewStates:['NEW','DISMISSED']};
 assert.deepEqual(ids(selectDiscoveries(reviewRecords,filters)),['0-b','3-b','0-a','3-a']);
 assert.deepEqual(ids(selectDiscoveries(reviewRecords,{...filters,statuses:['CRYPTO_RELEVANT']})),['0-a','3-a']);
 assert.deepEqual(ids(selectDiscoveries(reviewRecords,filters,'Signal 3')),['3-b','3-a']);
});
test('review selection composes with network, source, funding and recency',()=>{
 const filters={...defaults(),reviewStates:['SEEN'],network:'Base',source:'FrontRun X',funding:true,recent:true};
 assert.deepEqual(ids(selectDiscoveries(reviewRecords,filters,'','newest',Date.parse('2026-10-04'))),['1-a']);
 for(const change of [{network:'Absent'},{source:'Absent'},{reviewStates:['UNKNOWN']}])assert.equal(selectDiscoveries(reviewRecords,{...filters,...change}).length,0);
 assert.equal(selectDiscoveries(reviewRecords,filters,'','newest',Date.parse('2027-01-01')).length,0);
});
test('review counts are deterministic exact stored states independent of classification flags',()=>{
 const input=[...reviewRecords,fixtures.discovery('missing','NON_CRYPTO',{reviewState:undefined})];
 assert.deepEqual(reviewCounts(input),{NEW:2,SEEN:2,REVIEWED:2,DISMISSED:2});
 assert.deepEqual(reviewCounts([...input].reverse()),reviewCounts(input));
 assert.deepEqual(reviewCounts([]),{NEW:0,SEEN:0,REVIEWED:0,DISMISSED:0});
});
test('review priority uses state then newest date then ID with missing states last',()=>{
 const input=[...reviewRecords,fixtures.discovery('0-c','CRYPTO_RELEVANT',{reviewState:'NEW',discoveredAt:'2026-10-02'}),fixtures.discovery('missing','CRYPTO_RELEVANT',{reviewState:undefined})];
 for(const list of [input,[...input].reverse()])assert.deepEqual(ids(selectDiscoveries(list,defaults(),'','reviewPriority')),['0-b','0-c','0-a','1-b','1-a','2-b','2-a','3-b','3-a','missing']);
});
test('oldest and newest sort by date then ID with invalid dates last',()=>{
 const input=[fixtures.discovery('z','CRYPTO_RELEVANT',{discoveredAt:'invalid'}),...reviewRecords];
 for(const list of [input,[...input].reverse()]){
  assert.deepEqual(ids(selectDiscoveries(list,defaults(),'','oldest')),['0-a','1-a','2-a','3-a','0-b','1-b','2-b','3-b','z']);
  assert.deepEqual(ids(selectDiscoveries(list,defaults(),'','newest')),['0-b','1-b','2-b','3-b','0-a','1-a','2-a','3-a','z']);
 }
});
test('reset defaults clear review selections and auxiliary filters with fresh arrays',()=>{
 const changed=defaults();changed.reviewStates.push('DISMISSED');changed.statuses.length=0;
 assert.deepEqual(defaults(),{statuses:['CRYPTO_RELEVANT','POSSIBLY_CRYPTO'],reviewStates:[],classificationNeedsReview:false,network:'',source:'',funding:false,recent:false});
});
test('classification needsReview remains independent from reviewState',()=>{
 assert.deepEqual(ids(selectDiscoveries(reviewRecords,{...defaults(),reviewStates:['NEW'],classificationNeedsReview:true})),['0-b','0-a']);
 assert.deepEqual(ids(selectDiscoveries(reviewRecords,{...defaults(),reviewStates:['SEEN'],classificationNeedsReview:true})),['1-b']);
 assert.equal(selectDiscoveries(reviewRecords,{...defaults(),reviewStates:['DISMISSED']}).length,2);
});
test('filtering sorting and counts are read-only',()=>{
 const before=JSON.stringify(reviewRecords),filters={...defaults(),reviewStates:['NEW','DISMISSED']},filterBefore=JSON.stringify(filters);
 for(const sort of ['newest','oldest','reviewPriority','flag','confidence','lead','funding'])selectDiscoveries(reviewRecords,filters,'',sort);
 reviewCounts(reviewRecords);assert.equal(JSON.stringify(reviewRecords),before);assert.equal(JSON.stringify(filters),filterBefore);
});

const transitions={NEW:[['Mark Seen','SEEN'],['Mark Reviewed','REVIEWED'],['Dismiss','DISMISSED']],SEEN:[['Mark New','NEW'],['Mark Reviewed','REVIEWED'],['Dismiss','DISMISSED']],REVIEWED:[['Reopen Review','SEEN'],['Dismiss','DISMISSED']],DISMISSED:[['Restore to Review','NEW']]};
for(const [state,expected] of Object.entries(transitions))test(`contextual ${state} actions are exact, ordered, fresh and omit no-ops`,()=>{
 assert.deepEqual(reviewActions(state),expected.map(([label,state])=>({label,state})));
 assert(reviewActions(state).every(action=>action.state!==state));
 const actions=reviewActions(state);actions.reverse();actions[0].label='changed';
 assert.deepEqual(reviewActions(state),expected.map(([label,state])=>({label,state})));
});
test('missing and unknown review states fail closed',()=>{for(const state of [undefined,null,'','UNKNOWN','new','toString','__proto__'])assert.deepEqual(reviewActions(state),[]);});
test('successful fixture state transition updates counts and naturally leaves filtered results without changing classification or identity',()=>{
 const before=structuredClone(reviewRecords),project=before.find(d=>d.reviewState==='REVIEWED');
 const filters={...defaults(),reviewStates:['REVIEWED']};assert(ids(selectDiscoveries(before,filters)).includes(project.id));
 const after=before.map(d=>d.id===project.id?{...d,reviewState:'SEEN'}:d);
 assert.deepEqual(reviewCounts(after),{NEW:2,SEEN:3,REVIEWED:1,DISMISSED:2});
 assert(!ids(selectDiscoveries(after,filters)).includes(project.id));
 assert.deepEqual(after.find(d=>d.id===project.id),{...project,reviewState:'SEEN'});
 assert.deepEqual(ids(selectDiscoveries(after,{...defaults(),classificationNeedsReview:true})),ids(selectDiscoveries(before,{...defaults(),classificationNeedsReview:true})));
});
test('component contract uses contextual labels, explicit local confirmation and independent review locks',async()=>{
 const {readFile}=await import('node:fs/promises');const code=await readFile(new URL('../components/CaptainsRadar.tsx',import.meta.url),'utf8');
 assert.match(code,/reviewActions\(d.reviewState\)\.map/);assert.match(code,/\{action.label\}/);assert.match(code,/REVIEW_LABELS\[d.reviewState/);
 assert.match(code,/if\(action.state==='DISMISSED'\)setDismissConfirm/);
 assert.match(code,/dismissConfirm.includes\(d.id\)/);assert.match(code,/onClick=\{\(\)=>review\(d,'DISMISSED'\)\}>Confirm dismiss/);
 assert.match(code,/onClick=\{\(\)=>setDismissConfirm\(v=>v.filter\(id=>id!==d.id\)\)\}>Cancel/);
 assert.match(code,/reviewLocks.current.has\(d.id\)/);assert.match(code,/reviewLocks.current.add\(d.id\)/);assert.match(code,/finally\{reviewLocks.current.delete\(d.id\)/);
 assert.match(code,/disabled=\{reviewBusy.includes\(d.id\)\}/);assert.match(code,/role="status" aria-live="polite"/);
 const review=code.slice(code.indexOf(' async function review('),code.indexOf('\n const records='));
 assert(review.indexOf("setReviewMessages(v=>({...v,[d.id]:''}))")<review.indexOf('await fetch'));
 assert(review.indexOf('await r.json()')<review.indexOf('setData('));assert.match(review,/\{\.\.\.item,reviewState:result.state\}/);
 assert.doesNotMatch(review,/setErrors|setBusy|classification:/);
});


for(const status of ['CRYPTO_RELEVANT','POSSIBLY_CRYPTO','NON_CRYPTO'])test(`classification action refreshes usable ${status} and retries stale retained evidence`,()=>{
 const input={classification:{status},classificationCache:{status:'FRESH'}};
 assert.deepEqual([classificationAction(input).label,classificationAction(input).mode,classificationAction(input).refresh],['Refresh Classification','REFRESH',true]);
 for(const extra of [{classificationCache:{status:'STALE'}},{classificationFailed:true}]){
  const action=classificationAction({...input,...extra});assert.deepEqual([action.label,action.mode,action.refresh],['Retry Classification','RETRY',true]);
 }
});
for(const [cacheStatus,label,mode,refresh] of [
 ['MISS','Classify','CLASSIFY',false],
 ['FRESH','Refresh Classification','REFRESH',true],
 ['STALE','Retry Classification','RETRY',true],
])test(`UNCLASSIFIED with ${cacheStatus} selects the correct classification action`,()=>{
 const input={classification:{status:'UNCLASSIFIED'},classificationCache:{status:cacheStatus}};
 const action=classificationAction(input);
 assert.deepEqual([action.label,action.mode,action.refresh,action.disabled],[label,mode,refresh,false]);
 assert(action.reason);
});
test('failed persisted UNCLASSIFIED classification retries while a cache miss remains a first attempt',()=>{
 for(const status of ['FRESH','STALE']){
  const action=classificationAction({classification:{status:'UNCLASSIFIED'},classificationCache:{status},classificationFailed:true});
  assert.deepEqual([action.label,action.mode,action.refresh,action.disabled],['Retry Classification','RETRY',true,false]);
 }
 assert.equal(classificationAction({classificationCache:{status:'MISS'},classificationFailed:true}).refresh,false);
});
test('missing and unknown metadata fail closed without inventing freshness',()=>{
 for(const input of [undefined,null,{}, {classificationStatus:'UNCLASSIFIED'}, {classificationStatus:'UNKNOWN'}]){
  const action=classificationAction(input);assert.deepEqual([action.label,action.mode,action.refresh,action.disabled],['Classify','CLASSIFY',false,true]);assert.match(action.reason,/history is unavailable/);
  assert.equal(classificationCacheLabel(input),null);
 }
 for(const status of [undefined,'UNKNOWN','toString','__proto__']){
  for(const classificationStatus of ['UNCLASSIFIED','CRYPTO_RELEVANT']){
   const input={classification:{status:classificationStatus},classificationCache:{status}};
   assert.equal(classificationCacheLabel(input),null);
   assert.equal(classificationAction(input).disabled,classificationStatus==='UNCLASSIFIED');
   assert.equal(classificationAction(input).mode,classificationStatus==='UNCLASSIFIED'?'CLASSIFY':'REFRESH');
  }
 }
 for(const [status,label] of [['FRESH','Fresh'],['STALE','Stale'],['MISS','Not classified']])assert.equal(classificationCacheLabel({classificationCache:{status}}),label);
});
test('classification action is deterministic pure and independent of review state',()=>{
 for(const status of ['UNCLASSIFIED','POSSIBLY_CRYPTO'])for(const cacheStatus of ['MISS','FRESH','STALE',undefined])for(const classificationFailed of [false,true]){
  const input=Object.freeze({classification:Object.freeze({status,needsReview:true}),classificationCache:Object.freeze({status:cacheStatus}),classificationFailed});
  const before=JSON.stringify(input),expected=classificationAction(input);
  for(const reviewState of ['NEW','SEEN','REVIEWED','DISMISSED',undefined,'UNKNOWN'])assert.deepEqual(classificationAction({...input,reviewState}),expected);
  assert.deepEqual(classificationAction(input),expected);assert.equal(JSON.stringify(input),before);
  expected.label='changed';assert.notEqual(classificationAction(input).label,'changed');
 }
});
async function classificationHarness() {
 const {readFile}=await import('node:fs/promises');
 const code=await readFile(new URL('../components/CaptainsRadar.tsx',import.meta.url),'utf8');
 const body=code.slice(code.indexOf(' async function classify('),code.indexOf(' async function review('));
 const {createRequire}=await import('node:module');const ts=createRequire(import.meta.url)('typescript');
 const compiled=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const project=structuredClone(records[0]);project.reviewState='REVIEWED';
 const state={data:{discoveries:[project,{...project,id:'other'}]},busy:[],errors:{a:'old error'},messages:{a:'old status'}};
 const locks={current:new Set()};const requests=[];
 const fetch=async(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
 const setter=key=>fn=>{state[key]=fn(state[key]);};
 const classify=new Function('classificationAction','classificationLocks','setBusy','setErrors','setClassificationMessages','fetch','LABELS','setData',compiled+';return classify;')(classificationAction,locks,setter('busy'),setter('errors'),setter('messages'),fetch,{CRYPTO_RELEVANT:'Crypto Relevant',POSSIBLY_CRYPTO:'Possibly Crypto',NON_CRYPTO:'Non-Crypto',UNCLASSIFIED:'Unclassified'},setter('data'));
 return {code,body,state,locks,requests,classify,project};
}
test('classification component locks only each project, clears messages and mutates only after success',async()=>{
 const h=await classificationHarness(),before=structuredClone(h.state.data);
 const pending=h.classify(h.project);await h.classify(h.project);
 assert.equal(h.requests.length,1);assert.equal(h.state.errors.a,'');assert.equal(h.state.messages.a,'');assert.deepEqual(h.state.data,before);
 assert.deepEqual(JSON.parse(h.requests[0].options.body),{ids:['a'],refresh:true});
 const other=h.classify(h.state.data.discoveries[1]);assert.equal(h.requests.length,2);assert.deepEqual(h.state.busy,['a','other']);
 const result={id:'a',status:'CLASSIFIED',classification:{...h.project.classification,status:'POSSIBLY_CRYPTO'},classificationEvidence:[],classificationCache:{status:'FRESH'}};
 h.requests[0].resolve({ok:true,json:async()=>({results:[result]})});await pending;
 assert.equal(h.state.data.discoveries[0].classification.status,'POSSIBLY_CRYPTO');assert.equal(h.state.data.discoveries[0].reviewState,'REVIEWED');assert.match(h.state.messages.a,/successfully/);assert.deepEqual(h.state.busy,['other']);
 h.requests[1].resolve({ok:false});await other;assert.equal(h.locks.current.size,0);
});
test('failed refresh retains exact local result, sanitized feedback and retry remains explicit',async()=>{
 const h=await classificationHarness(),before=structuredClone(h.state.data);
 const pending=h.classify(h.project);
 h.requests[0].resolve({ok:true,json:async()=>({results:[{id:'a',status:'FAILED',classification:{status:'UNCLASSIFIED'},error:'private provider stack'}]})});await pending;
 assert.deepEqual(h.state.data,before);assert.equal(h.state.errors.a,'Classification refresh failed. Earlier classification retained.');assert.equal(h.state.messages.a,'');
 assert.equal(classificationAction({...h.project,classificationFailed:true}).mode,'RETRY');
 const retry=h.classify(h.project);assert.equal(h.state.errors.a,'');assert.equal(JSON.parse(h.requests[1].options.body).refresh,true);
 h.requests[1].resolve({ok:false});await retry;assert.deepEqual(h.state.data,before);
});
test('first classify sends refresh false and failure keeps unclassified project intact',async()=>{
 const h=await classificationHarness(),project={...h.project,classification:null,classificationStatus:'UNCLASSIFIED',classificationCache:{status:'MISS'}};
 h.state.data.discoveries[0]=project;const before=structuredClone(h.state.data),pending=h.classify(project);
 assert.equal(JSON.parse(h.requests[0].options.body).refresh,false);
 h.requests[0].resolve({ok:false});await pending;assert.deepEqual(h.state.data,before);assert.equal(h.state.errors.a,'Classification could not be completed.');
});
test('classification source contract separates review, research and monitoring controls',async()=>{
 const {code,body}=await classificationHarness();
 assert.match(body,/refresh:action.refresh/);assert.match(body,/classificationAction\(d\)/);
 assert.doesNotMatch(body,/reviewBusy|reviewLocks|setReview|reviewState:|radar\/refresh|radar\/monitor/);
 assert.equal((body.match(/await fetch/g)||[]).length,1);
 assert.match(code,/disabled=\{busy.includes\(d.id\)\|\|action.disabled\}/);
 assert.match(code,/disabled=\{!identity\}/);assert.match(code,/disabled=\{reviewBusy.includes\(d.id\)\}/);
 assert.match(code,/classificationFailed:Boolean\(errors\[d.id\]\)/);
 assert.match(code,/Evidence status: \{cacheLabel\}/);assert.match(code,/Classification: \{LABELS/);
});
