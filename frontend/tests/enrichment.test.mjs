import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEnrichment, enrichmentState, loadEnrichment, enrichmentProvider, TRUST_LABELS } from '../lib/scout/enrichment.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/enrichment.json', import.meta.url)));
const copy = () => structuredClone(fixture);
const missing = {verification:'UNAVAILABLE',value:null,evidenceIds:[]};
const analysis = {url:fixture.sourceUrl, project_name:'Historical V3',use_case:'Infrastructure'};
test('complete model preserves services, competitors, opportunities and funding rounds', () => {
  const data=parseEnrichment(fixture,analysis.url);
  assert.deepEqual(data,fixture);assert.equal(enrichmentState(data).status,'Available');
  assert.equal(data.funding.rounds[0].value.round,'Seed');
  assert.deepEqual(data.funding.rounds[0].value.investors.value,['Mock investor']);
  assert.equal(data.opportunities[0].value.sourceUrl,'https://research.example/announcement');
  assert.equal(data.opportunities[0].value.participationUrl,'https://research.example/join');
  assert.deepEqual(data.featuresAndServices[0].evidenceIds,['official','announcement']);
});
test('partial information and missing nested funding fields remain partial', () => {
  for(const mutate of [d=>d.opportunities=[],d=>d.funding.rounds[0].value.amount=missing,d=>d.featuresAndServices[0].value.targetUsers=missing]) {
    const d=copy();mutate(d);assert.equal(enrichmentState(parseEnrichment(d,analysis.url)).status,'Partial');
  }
});
test('unavailable fields remain null, without fabricated placeholders', () => {
  const d=copy();d.featuresAndServices=[];d.similarProjects=[];d.opportunities=[];d.originalitySignal=missing;d.funding={totalKnown:missing,rounds:[]};d.evidence=[];
  const parsed=parseEnrichment(d,analysis.url);assert.deepEqual(parsed,d);assert.equal(enrichmentState(parsed).status,'Unable to verify');
  assert.equal(parsed.funding.totalKnown.value,null);
});
test('trust labels distinguish verified, inferred, unverified and unavailable',()=> {
  assert.deepEqual(Object.values(TRUST_LABELS),['Verified','Inferred','Unverified','No reliable information found']);
  assert.equal(fixture.originalitySignal.verification,'INFERRED');
});
test('historical and legacy analyses load safely without enrichment or mutation',async()=> {
  const before=structuredClone(analysis);
  assert.deepEqual(await loadEnrichment(enrichmentProvider,analysis),{status:'Not yet enriched',data:null});
  assert.deepEqual(analysis,before);
  assert.equal((await loadEnrichment({enrichProject(){throw Error('must not call');}}, {project_name:'V2'})).status,'Not yet enriched');
});
test('provider receives detached analysis and failures cannot disrupt onchain results',async()=> {
  const before=structuredClone(analysis);
  const state=await loadEnrichment({async enrichProject(url,a){a.project_name='mutated';return fixture;}},analysis);
  assert.equal(state.status,'Available');assert.deepEqual(analysis,before);
  assert.equal((await loadEnrichment({async enrichProject(){throw Error('offline');}},analysis)).status,'Unable to verify');
  assert.equal((await loadEnrichment({async enrichProject(){return {};}},analysis)).status,'Unable to verify');
});
const invalidCases = [
  d=>d.schemaVersion=2,d=>d.sourceUrl='https://wrong.example/',d=>d.lastUpdated='yesterday',
  d=>d.evidence.push(d.evidence[0]),d=>d.evidence[0].url='javascript:alert(1)',
  d=>d.evidence[0].checkedAt='unknown',d=>d.featuresAndServices[0].evidenceIds=['missing'],
  d=>d.featuresAndServices[0].evidenceIds=[],d=>d.originalitySignal.value='Globally unique',
  d=>d.opportunities[0].value.participationUrl='data:text/html,unsafe',
  d=>d.opportunities[0].value.deadline='soon',d=>d.funding.rounds[0].value.investors.value=[42],
  d=>d.funding.totalKnown={...missing,value:'USD 0'},d=>d.evidence.forEach(e=>e.verification='UNVERIFIED'),
];
invalidCases.forEach((mutate,i)=>test(`malformed enrichment rejected (${i+1})`,()=>{const d=copy();mutate(d);assert.equal(parseEnrichment(d,analysis.url),null);}));
test('non-object payloads rejected',()=>{for(const d of [null,undefined,[],42,'fake'])assert.equal(parseEnrichment(d,analysis.url),null);});
test('announced features and unverified claims retain explicit statuses',()=>{
  const d=copy();d.featuresAndServices[0].value.availability='Announced';
  d.opportunities[0].verification='UNVERIFIED';
  const parsed=parseEnrichment(d,analysis.url);
  assert.equal(parsed.featuresAndServices[0].value.availability,'Announced');
  assert.equal(parsed.opportunities[0].verification,'UNVERIFIED');
  assert.equal(enrichmentState(parsed).status,'Partial');
});
test('unverified-only research is unable to verify and unavailable guesses are rejected',()=>{
  const d=copy();d.featuresAndServices=[];d.similarProjects=[];d.opportunities=[];d.funding={totalKnown:missing,rounds:[]};d.originalitySignal.verification='UNVERIFIED';
  assert.equal(enrichmentState(parseEnrichment(d,analysis.url)).status,'Unable to verify');
  d.originalitySignal={...missing,value:'Common model'};
  assert.equal(parseEnrichment(d,analysis.url),null);
});
