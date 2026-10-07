import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './fixtures/radar.cjs';
import {defaults,reviewCounts,selectDiscoveries,statusOf,researchIdentity,resolveResearchTarget,safeUrl,isNewGem} from '../lib/radar/view.mjs';
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
