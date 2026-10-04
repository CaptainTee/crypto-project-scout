import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_FILTERS, filterHistory, filterOptions, comparisonValue, toggleComparison } from '../lib/scout/history.ts';
import { retryProjects, runProjectBatch } from '../lib/scout/batch.ts';
const a = {project_name:'Gem Scout',url:'https://gem.example/',uses_crypto:true,category:'Infrastructure',chain:'Ethereum',token_status:'Live',development_stage:'Mainnet',confidence:90,use_case:'Payments',crypto_integration:'Onchain'};
const b = {...a,project_name:'Other',url:'',uses_crypto:false,category:'Gaming',chain:'Base',token_status:'None',development_stage:'Testnet',confidence:50};
test('search matches names and sources, including legacy records; sorting does not mutate history', () => {
  assert.deepEqual(filterHistory([a,b], {...EMPTY_FILTERS,search:' GEM '}),[a]);
  assert.deepEqual(filterHistory([a,b], {...EMPTY_FILTERS,search:'gem.example'}),[a]);
  assert.deepEqual(filterHistory([a,b], {...EMPTY_FILTERS,search:'other'}),[b]);
  const items=[b,a]; assert.deepEqual(filterHistory(items,{...EMPTY_FILTERS,sort:'confidence-high'}),[a,b]);assert.deepEqual(items,[b,a]);
  assert.deepEqual(filterHistory([a,b],{...EMPTY_FILTERS,sort:'confidence-low'}),[b,a]);
});
test('all field filters, crypto and minimum confidence compose', () => {
  for (const field of ['category','chain','token_status','development_stage']) {
    assert.deepEqual(filterHistory([a,b],{...EMPTY_FILTERS,[field]:a[field]}),[a]);
    assert.deepEqual(filterOptions([a,b,a],field),[a[field],b[field]].sort());
  }
  assert.deepEqual(filterHistory([a,b],{...EMPTY_FILTERS,crypto:'false'}),[b]);
  assert.deepEqual(filterHistory([a,b],{...EMPTY_FILTERS,minConfidence:75}),[a]);
  assert.deepEqual(filterHistory([a,b],{...EMPTY_FILTERS,chain:'Ethereum',crypto:'false'}),[]);
});
test('comparison selection toggles, caps at five, and formats authoritative fields', () => {
  assert.deepEqual(toggleComparison([0],1),[0,1]);assert.deepEqual(toggleComparison([0,1],0),[1]);
  assert.deepEqual(toggleComparison([0,1,2,3,4],5),[0,1,2,3,4]);
  assert.equal(comparisonValue(a,'uses_crypto'),'Yes');assert.equal(comparisonValue(b,'uses_crypto'),'No');
  assert.equal(comparisonValue(a,'confidence'),'90%');assert.equal(comparisonValue(a,'use_case'),'Payments');
});
for (const individual of [true,false]) test(individual ? 'individual retry only submits targeted failed project' : 'Retry Failed submits failed projects while retaining completed results', async () => {
  const queue=[{url:a.url,label:'Gem',state:'complete',result:a},{url:'https://fail.example/',label:'@fail',state:'failed',message:'Rejected'},{url:'https://retry.example/',label:'Retry',state:'failed'}];
  const targets=retryProjects(queue, individual ? 1 : undefined); const stored=[];const calls=[];
  const contract={getAnalysisCount:async()=>stored.length,analyzeProject:async(url,notify)=>{calls.push(url);notify();stored.push({...a,url});},getLatestForUrl:async url=>stored.find(item=>item.url===url)};
  await runProjectBatch(targets.map(t=>t.project.url),contract,{canSubmit:()=>true,onSuccess:async()=>{},onUpdate:(i,update)=>{queue[targets[i].index]={...targets[i].project,...update};}});
  assert.deepEqual(calls,individual ? ['https://fail.example/'] : ['https://fail.example/','https://retry.example/']);
  assert.equal(queue[0].result,a);assert.equal(queue[1].label,'@fail');assert.equal(queue[1].state,'complete');
  assert.deepEqual(retryProjects(queue,0),[]);
});
