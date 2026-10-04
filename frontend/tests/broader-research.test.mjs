import test from 'node:test';
import assert from 'node:assert/strict';
import { TavilySearchProvider, configuredSearchProvider, providerDiagnostic, SEARCH_LIMITS } from '../lib/scout/search.mjs';
import { ResearchOrchestrator, OfficialResearchProvider, classifySource, FundingResearchProvider, FRESHNESS, researchQueries } from '../lib/scout/orchestrator.mjs';
import { RuntimeRepository, createResearchProvider } from '../lib/scout/research.mjs';
import { parseEnrichment } from '../lib/scout/enrichment.ts';
const source = 'https://project.example/';
const now = new Date('2026-10-04T12:00:00Z');
const officialHtml = '<title>Project</title><p>Project offers encrypted storage for developers.</p>';
const official = new OfficialResearchProvider(async url => ({url,html:officialHtml}));
const result = (url='https://coindesk.com/report') => ({url,title:'Report',snippet:'Discovery only',provider:'mock',sourceType:'WEB',publishedAt:now.toISOString()});
const run = (html, options={}) => new ResearchOrchestrator({official, now:()=>now, search:{provider:{name:'mock',search:async()=>[result()]},status:'CONFIGURED'}, fetchPage:async url=>({url,html}),...options}).enrichProject(source);
const adapter = request => new TavilySearchProvider('test-only-noncredential',request);
for (const [label,env,status] of [['missing provider',{},'NOT_CONFIGURED'],['missing key',{CAPTAINSCOUT_SEARCH_PROVIDER:'tavily'},'MISSING_KEY'],['unsupported',{CAPTAINSCOUT_SEARCH_PROVIDER:'other'},'UNSUPPORTED']]) test(label,()=>{let calls=0;const s=configuredSearchProvider(env,()=>{calls++;});assert.equal(s.status,status);assert.equal(s.provider,null);assert.equal(calls,0);});
test('configured real adapter returns normalized bounded source fields and no credentials',async()=>{
 const provider=configuredSearchProvider({CAPTAINSCOUT_SEARCH_PROVIDER:'tavily',CAPTAINSCOUT_SEARCH_API_KEY:'test-only-noncredential'},async(url,options)=>{
  assert.equal(url,'https://api.tavily.com/search');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer test-only-noncredential');const body=JSON.parse(options.body);assert.equal(body.search_depth,'basic');assert.equal(body.auto_parameters,false);assert.equal(body.max_results,3);
  return Response.json({results:[{title:'Test',url:'https://public.example/?tracking=1#x',content:'Content',published_date:'2026-10-01'}, {title:'Unsafe',url:'http://127.0.0.1',content:'Unsafe'}]});
 }).provider;
 const results=await provider.search('Project');assert.equal(results.length,1);assert.equal(results[0].url,'https://public.example/');assert.equal(results[0].provider,'tavily');assert.equal(results[0].sourceType,'WEB');assert.ok(results[0].publishedAt);assert.ok(!JSON.stringify(results).includes('test-only-noncredential'));
});
test('provider timeout isolated and sanitized',async()=>{await assert.rejects(adapter(async()=>new Promise(()=>{})).search('Project',{timeout:5}),error => error.message === 'Broader search request failed or timed out' && error.code === 'TIMEOUT');});
for (const [name,response] of [['HTTP error',()=>new Response('sensitive error',{status:403})],['malformed JSON',()=>new Response('{')],['malformed results',()=>Response.json({results:[{}]})],['missing results',()=>Response.json({})],['oversized response',()=>new Response('a'.repeat(SEARCH_LIMITS.bytes+1))]]) test(`adapter ${name}`,async()=>{await assert.rejects(adapter(async()=>response()).search('Project'),/Broader search request failed/);});
test('official-only remains compatible with truthful disabled broader status',async()=>{const d=await run('',{search:configuredSearchProvider({})});assert.equal(d.featuresAndServices.length,1);assert.equal(d.researchAvailability.broader,'NOT_CONFIGURED');assert.ok(parseEnrichment(d,source));});
test('official plus external associates every claim to classified provider evidence',async()=>{
 const d=await run('<p>Project offers a wallet for traders.</p>');assert.equal(d.featuresAndServices.length,2);assert.equal(d.evidence[1].sourceClass,'REPUTABLE_SECONDARY');assert.equal(d.evidence[1].provider,'mock');assert.ok(parseEnrichment(d,source));assert.ok(d.featuresAndServices.every(c=>c.evidenceIds.every(id=>d.evidence.some(e=>e.id===id))));
});
test('ranking conservatively recognizes official, investor, reporting, community and unknown',()=>{for(const [url,rank] of [['https://project.example/docs','OFFICIAL'],['https://a16zcrypto.com/news','PRIMARY'],['https://coindesk.com/news','REPUTABLE_SECONDARY'],['https://reddit.com/thread','COMMUNITY'],['https://coindesk.com.evil.example','UNKNOWN']])assert.equal(classifySource(url,[source]),rank);});
test('duplicate sources and substantially identical claims merge citations',async()=>{const d=await run('<p>Project offers encrypted storage for developers.</p>');assert.equal(d.featuresAndServices.length,1);assert.equal(d.featuresAndServices[0].evidenceIds.length,2);assert.equal(d.evidence.length,2);});
test('provider failure preserves official research and safe partial diagnostics',async()=>{const d=await run('',{search:{provider:{name:'bad',search:async()=>{throw Error('secret upstream');}}}});assert.equal(d.featuresAndServices.length,1);assert.equal(d.researchAvailability.broader,'UNAVAILABLE');assert.ok(!JSON.stringify(d).includes('secret upstream'));});
test('page failures retain successful external sections',async()=>{let n=0;const d=await run('<p>Project offers a wallet for users.</p>',{search:{provider:{name:'mock',search:async()=>[result(`https://coindesk.com/${n++}`)]}},fetchPage:async url=>{if(url.endsWith('/1'))throw Error('bad');return {url,html:'<p>Project offers a wallet for users.</p>'};}});assert.equal(d.featuresAndServices.length,2);assert.equal(d.researchAvailability.broader,'PARTIAL');});
test('search snippets without fetched project evidence cannot become claims',async()=>{const d=await run('<p>Another company raised $99 million seed funding.</p>');assert.equal(d.funding.rounds.length,0);assert.equal(d.evidence.length,2);assert.equal(d.evidence[1].verification,'UNVERIFIED');});
test('explicit specific product comparison supports comparable and common model',async()=>{const d=await run('<p>Project offers storage similar to Peer Storage for developers.</p><a href="https://peer.example/">Peer Storage</a>');assert.equal(d.similarProjects[0].value.name,'Peer Storage');assert.equal(d.originalitySignal.value,'Common model');assert.ok(parseEnrichment(d,source));});
test('broad AI blockchain DeFi category comparisons rejected',async()=>{const d=await run('<p>Project is an AI blockchain similar to Broad Peer.</p><a href="https://peer.example/">Broad Peer</a>');assert.equal(d.similarProjects.length,0);assert.equal(d.originalitySignal.value,null);});
test('visible comparison limit never exceeds five',async()=>{let n=0;const d=await run('',{search:{provider:{name:'mock',search:async()=>[result(`https://coindesk.com/${n++}`)]}},fetchPage:async url=>({url,html:'<p>Project offers storage similar to '+Array.from({length:8},(_,i)=>`Peer ${url.slice(-1)}${i}`).join(', ')+'.</p>'+Array.from({length:8},(_,i)=>`<a href="https://peer${url.slice(-1)}${i}.example/">Peer ${url.slice(-1)}${i}</a>`).join('')})});assert.equal(d.similarProjects.length,5);});
test('specific implementation comparison supports differentiated inference',async()=>{const d=await run('<p>Project offers storage unlike Peer Storage with encrypted client storage for developers.</p><a href="https://peer.example/">Peer Storage</a>');assert.equal(d.originalitySignal.value,'Differentiated implementation');});
test('funding duplicate investor announcement merges citations and investor names',async()=>{
 const funded=new OfficialResearchProvider(async url=>({url,html:'<title>Project</title><p>Project raised $12 million seed funding on 2026-01-02 led by Example Capital.</p>'}));
 const d=await run('<p>Project raised $12 million seed funding on 2026-01-02 led by Example Capital and Public Ventures.</p>',{official:funded,search:{provider:{name:'mock',search:async()=>[result('https://a16zcrypto.com/news')]}}});
 assert.equal(d.funding.rounds.length,1);assert.equal(d.funding.rounds[0].evidenceIds.length,2);assert.deepEqual(d.funding.rounds[0].value.investors.value,['Example Capital','Public Ventures']);assert.ok(parseEnrichment(d,source));
});
test('conflicting funding amounts retained as unverified',async()=>{const funded=new OfficialResearchProvider(async url=>({url,html:'<title>Project</title><p>Project raised $12 million seed funding on 2026-01-02.</p>'}));const d=await run('<p>Project raised $15 million seed funding on 2026-01-02.</p>',{official:funded});assert.equal(d.funding.rounds.length,2);assert.ok(d.funding.rounds.every(c=>c.verification==='UNVERIFIED'));assert.ok(d.issues.some(i=>i.includes('Conflicting')));});
for(const text of ['Project TVL is $12 million','Project market cap is $12 million','Project token sale valuation is $12 million','Project has partnership investor logos'])test(`no funding inference: ${text}`,async()=>{assert.equal((await run(`<p>${text}</p>`)).funding.rounds.length,0);});
test('unknown/community funding not sufficient',async()=>{const d=await run('<p>Project raised $12 million seed funding led by Example Capital.</p>',{search:{provider:{name:'mock',search:async()=>[result('https://unknown.example/')]}}});assert.equal(d.funding.rounds.length,0);});
for(const [text,status] of [['Project testnet registration is open until 2026-12-01','Active'],['Project testnet will launch on 2026-12-01','Announced'],['Project testnet ended','Ended'],['Project has a testnet','Unknown']]) test(`opportunity ${status}`,async()=>{const d=await run(`<p>${text}</p><a href="/testnet">Join testnet</a>`);const c=d.opportunities[0];assert.equal(c.value.status,status);assert.equal(c.value.sourceClass,'REPUTABLE_SECONDARY');assert.equal(c.value.participationUrl,'https://coindesk.com/testnet');assert.ok(c.evidenceIds.length);assert.ok(parseEnrichment(d,source));});
test('stale and undated external opportunities never active',async()=>{for(const publishedAt of [undefined,'2025-01-01T00:00:00Z']){const d=await run('<p>Project testnet registration is open until 2026-12-01.</p>',{search:{provider:{name:'mock',search:async()=>[{...result(),publishedAt}]}}});assert.equal(d.opportunities[0].value.status,'Unknown');}});
test('unsafe discovered URLs rejected before fetching',async()=>{let calls=0;const d=await run('',{search:{provider:{name:'mock',search:async()=>[result('http://127.0.0.1/'),result('https://user:pass@example.com/'),result('https://example.com:3000/')] }},fetchPage:async()=>{calls++;throw Error();}});assert.equal(calls,0);assert.equal(d.evidence.length,1);});
test('bounded queries, fetched pages and separate freshness windows',async()=>{let queries=0,pages=0;const d=await run('',{search:{provider:{name:'mock',search:async()=>{queries++;return Array.from({length:10},(_,i)=>result(`https://coindesk.com/${queries}/${i}`));}}},fetchPage:async url=>{pages++;return {url,html:'<p>Project offers a wallet for users.</p>'};}});assert.equal(queries,6);assert.equal(pages,8);assert.equal(researchQueries('Project').length,6);assert.ok(Date.parse(d.fundingStaleAfter)>Date.parse(d.comparisonsStaleAfter));assert.equal(FRESHNESS.opportunities,3600000);});
test('fresh searches reused and stale searches refreshed by category',async()=>{let calls=0;const repository=new RuntimeRepository();const o=new ResearchOrchestrator({official,now:()=>now,repository,search:{provider:{name:'mock',search:async()=>{calls++;return [];}}}});await o.enrichProject(source);await o.enrichProject(source);assert.equal(calls,6);for(const item of repository.entries.values())item.expires=0;await o.enrichProject(source);assert.equal(calls,12);});
test('fresh whole results coalesced and stale result refreshes',async()=>{let calls=0;const repo=new RuntimeRepository();const provider=createResearchProvider(repo,async()=>{calls++;return run('',{search:configuredSearchProvider({})});});await Promise.all([provider.enrichProject(source),provider.enrichProject(source)]);await provider.enrichProject(source);assert.equal(calls,1);repo.entries.get('website:project.example').expires=0;await provider.enrichProject(source);assert.equal(calls,2);});
test('blocked X identity avoids paid search and keeps handle identity',async()=>{let calls=0;const o=new ResearchOrchestrator({official:new OfficialResearchProvider(async()=>{throw Error('Social source could not be accessed');}),search:{provider:{search:async()=>{calls++;return [];}}}});const d=await o.enrichProject('https://x.com/Project');assert.equal(calls,0);assert.equal(d.identity,'x:project');});
test('new source class and availability boundary rejects malformed metadata',async()=>{const d=await run('<p>Project offers a wallet for users.</p>');d.evidence[1].sourceClass='TRUST_ME';assert.equal(parseEnrichment(d,source),null);});
test('historical confirmed funding survives stale refresh with original citations',async()=>{
 let funded=true;
 const official=new OfficialResearchProvider(async url=>({url,html:'<title>Project</title>'+(funded?'<p>Project raised $12 million seed funding on 2020-01-02 led by Example Capital.</p>':'<p>Project offers encrypted storage for developers.</p>')}));
 const o=new ResearchOrchestrator({official,now:()=>now,search:configuredSearchProvider({})});
 const first=await o.enrichProject(source);funded=false;const next=await o.enrichProject(source);
 assert.equal(next.funding.rounds.length,1);assert.equal(next.funding.rounds[0].value.date.value,'2020-01-02');assert.equal(next.funding.rounds[0].verification,'VERIFIED');assert.ok(parseEnrichment(next,source));assert.equal(first.funding.rounds.length,1);
});
test('weak external features are unverified even when fetched',async()=>{const d=await run('<p>Project offers a wallet for users.</p>',{search:{provider:{name:'mock',search:async()=>[result('https://unknown.example/')]}}});assert.equal(d.featuresAndServices[1].verification,'UNVERIFIED');assert.equal(d.featuresAndServices[1].value.targetUsers.verification,'UNVERIFIED');});
test('lead investor only extracted from an explicit led-by statement',async()=>{const d=await run('<p>Project raised $12 million seed funding on 2026-01-02 led by Example Capital and Public Ventures.</p>');assert.equal(d.funding.rounds[0].value.leadInvestor.value,'Example Capital');assert.ok(parseEnrichment(d,source));});
test('funding for another company in a project article cannot be attributed to the project',async()=>{const d=await run('<p>Project competes with Other which raised $12 million seed funding on 2026-01-02.</p>');assert.equal(d.funding.rounds.length,0);});
test('equivalent funding amount formats merge instead of manufacturing a conflict',async()=>{const funded=new OfficialResearchProvider(async url=>({url,html:'<title>Project</title><p>Project raised $12 million seed funding on 2026-01-02.</p>'}));const d=await run('<p>Project raised $12M seed funding on 2026-01-02.</p>',{official:funded});assert.equal(d.funding.rounds.length,1);assert.equal(d.funding.rounds[0].evidenceIds.length,2);});
test('per-category page budgets reserve fetches for opportunity searches',async()=>{const queries=[];const urls=[];await run('',{search:{provider:{name:'mock',search:async q=>{queries.push(q);return Array.from({length:3},(_,i)=>result(`https://coindesk.com/${queries.length}/${i}`));}}},fetchPage:async url=>{urls.push(url);return {url,html:'<p>Project offers storage for developers.</p>'};}});assert.equal(urls.length,8);assert.ok(urls.some(u=>u.includes('/6/')));});
test('explicit disclosed funding total is retained without summing rounds',async()=>{const d=await run('<p>Project total disclosed funding is $20 million.</p>');assert.equal(d.funding.totalKnown.value,'$20 million');assert.equal(d.funding.rounds.length,0);assert.ok(parseEnrichment(d,source));});
test('funding totals with contradictory reports preserve conflict and citations',async()=>{const funded=new OfficialResearchProvider(async url=>({url,html:'<title>Project</title><p>Project total disclosed funding is $20 million.</p>'}));const d=await run('<p>Project total disclosed funding is $25 million.</p>',{official:funded});assert.equal(d.funding.totalKnown.verification,'UNVERIFIED');assert.ok(d.funding.totalKnown.value.includes('$20 million / $25 million'));assert.equal(d.funding.totalKnown.evidenceIds.length,2);});

for (const errors of [['Research timed out'], ['Official website blocked automated access'], ['Research timed out','Official website blocked automated access','Official source could not be accessed']]) test(`verified root survives children: ${errors.join(', ')}`,async()=>{
 let calls=0;
 const root=new OfficialResearchProvider(async url=>{if(url!==source)throw Error(errors[Number(url.slice(-1))]);return {url,html:officialHtml+errors.map((_,i)=>`<a href="/docs/${i}">Docs</a>`).join('')};});
 const d=await run('',{official:root,search:{provider:{name:'mock',search:async()=>{calls++;return [];}}}});
 assert.equal(d.confirmedIdentity.name,'Project');assert.equal(d.evidence.length,1);assert.equal(d.featuresAndServices.length,1);assert.equal(d.researchAvailability.official,'PARTIAL');assert.equal(calls,6);assert.equal(d.issues.length,errors.length);assert.ok(parseEnrichment(d,source));
});
test('root failure blocks search',async()=>{
 let calls=0;const o=new ResearchOrchestrator({official:new OfficialResearchProvider(async()=>{throw Error('Research timed out');}),search:{provider:{search:async()=>{calls++;return [];}}}});
 const d=await o.enrichProject(source);assert.equal(calls,0);assert.equal(d.confirmedIdentity,undefined);assert.equal(d.researchAvailability.official,'UNAVAILABLE');assert.equal(d.researchAvailability.broader,'BLOCKED');
});
test('root final redirect source establishes identity before provider invocation',async()=>{
 const final='https://canonical.example/en/';let calls=0;
 const d=await run('',{official:new OfficialResearchProvider(async()=>({url:final,html:officialHtml})),search:{provider:{name:'mock',search:async q=>{assert.ok(q.startsWith('"Project"'));calls++;return [];}}}});
 assert.equal(d.confirmedIdentity.sourceUrl,final);assert.equal(d.confirmedIdentity.submittedUrl,source);assert.equal(d.evidence[0].url,final);assert.equal(calls,6);
});
test('explicit refresh retries cached root failure and coalesces concurrent attempts',async()=>{
 let calls=0;let fail=true;const provider=createResearchProvider(new RuntimeRepository(),url=>new OfficialResearchProvider(async()=>{calls++;if(fail)throw Error('Research timed out');return {url,html:officialHtml};}).enrichProject(url,now));
 await provider.enrichProject(source);fail=false;assert.equal((await provider.enrichProject(source)).evidence.length,0);
 const results=await Promise.all([provider.enrichProject(source,{refresh:true}),provider.enrichProject(source,{refresh:true})]);assert.equal(calls,2);assert.equal(results[0].evidence.length,1);
});
test('usable content without a root project name cannot unlock broad search',async()=>{
 let calls=0;const d=await run('',{official:new OfficialResearchProvider(async url=>({url,html:'<p>The platform offers storage for developers.</p>'})),search:{provider:{search:async()=>{calls++;return [];}}}});
 assert.equal(d.evidence.length,1);assert.equal(d.confirmedIdentity,undefined);assert.equal(d.researchAvailability.broader,'BLOCKED');assert.equal(calls,0);
});
test('official root has a dedicated bounded allowance and children retain bounded timeouts',async()=>{
 const budgets=[];await new OfficialResearchProvider(async(url,options)=>{budgets.push(options.timeout);return {url,html:officialHtml+(url===source?'<a href="/docs">Docs</a>':'')};}).enrichProject(source,now);
 assert.ok(budgets[0]>4000 && budgets[0]<=12000);assert.ok(budgets[1]>0 && budgets[1]<=4000);
});

for (const [status,code] of [[401,'AUTHENTICATION_FAILURE'],[403,'AUTHENTICATION_FAILURE'],[429,'RATE_LIMIT'],[432,'QUOTA_EXCEEDED'],[433,'QUOTA_EXCEEDED'],[500,'HTTP_FAILURE']]) test(`safe provider diagnostic for HTTP ${status}`,async()=>{
 await assert.rejects(adapter(async()=>Response.json({detail:{error:'Unauthorized: missing or invalid API key. test-only-noncredential'}},{status})).search('Project'),error=>{
  assert.deepEqual(providerDiagnostic(error),{code,status});
  assert.ok(!JSON.stringify(error).includes('test-only-noncredential'));
  assert.ok(!error.stack.includes('Unauthorized'));
  assert.equal(error.cause,undefined);
  return true;
 });
});
for (const response of [()=>new Response('{'),()=>Response.json(null),()=>Response.json({results:[{}]}),()=>new Response('x'.repeat(SEARCH_LIMITS.bytes+1))]) test('malformed response has safe diagnostic',async()=>{
 await assert.rejects(adapter(async()=>response()).search('Project'),error=>error.code==='MALFORMED_RESPONSE');
});
test('network failure does not retain raw upstream cause',async()=>{
 await assert.rejects(adapter(async()=>{throw Error('test-only-noncredential');}).search('Project'),error=>error.code==='NETWORK_FAILURE' && !error.stack.includes('test-only-noncredential'));
 assert.deepEqual(providerDiagnostic(Error('secret')),{code:'PROVIDER_FAILURE',status:null});
});
test('body-read timeout has timeout diagnostic',async()=>{
 await assert.rejects(adapter(async()=>new Response(new ReadableStream({start(){}}))).search('Project',{timeout:5}),error=>error.code==='TIMEOUT');
});
test('real adapter authentication failure preserves official evidence and browser sanitization',async()=>{
 const d=await run('',{search:{provider:adapter(async()=>Response.json({detail:{error:'Unauthorized: missing or invalid API key. test-only-noncredential'}},{status:401})),status:'CONFIGURED'}});
 assert.equal(d.researchAvailability.official,'AVAILABLE');
 assert.equal(d.researchAvailability.broader,'UNAVAILABLE');
 assert.equal(d.evidence.length,1);
 assert.equal(d.featuresAndServices.length,1);
 assert.ok(!JSON.stringify(d).includes('test-only-noncredential'));
 assert.ok(!JSON.stringify(d).includes('AUTHENTICATION_FAILURE'));
 assert.ok(parseEnrichment(d,source));
});

test('successful Tavily result retains optional snippet, provider and sanitized normalization counts',async()=>{
 const found=await adapter(async()=>Response.json({results:[{title:'Public report',url:'https://coindesk.com/report'},{title:'Unsafe',url:'http://127.0.0.1/',content:'x'}]})).search('Project');
 assert.equal(found.length,1);assert.equal(found[0].provider,'tavily');assert.equal(found[0].snippet,'');
 assert.deepEqual(found.diagnostics,{httpStatus:200,rejected:1});
});
test('Tavily evidence remains traceable across discovery, verified fetch, claims and boundary',async()=>{
 let diagnostics;
 const d=await run('<p>Project offers a wallet for developers.</p>',{search:{provider:adapter(async()=>Response.json({results:[{title:'Wallet report',url:'https://coindesk.com/report',content:'Discovery summary'}]})),status:'CONFIGURED'},onDiagnostics:value=>{diagnostics=value;}});
 const e=d.evidence.find(e=>e.provider==='tavily');
 assert.equal(e.evidenceKind,'FETCH_VERIFIED');assert.equal(e.sourceClass,'REPUTABLE_SECONDARY');assert.equal(e.verification,'VERIFIED');
 assert.equal(e.resultUrl,'https://coindesk.com/report');assert.equal(e.title,'Wallet report');assert.equal(e.snippet,'Discovery summary');assert.equal(e.checkedAt,now.toISOString());
 assert.deepEqual(e.queryTypes,['features','competitors','funding','opportunities']);
 assert.ok(d.featuresAndServices.some(c=>c.evidenceIds.includes(e.id)));assert.ok(parseEnrichment(d,source));
 assert.equal(diagnostics.queries.length,6);assert.equal(diagnostics.queries[0].safeFetched,1);assert.equal(diagnostics.queries[0].httpStatus,200);
 assert.ok(!JSON.stringify(d).includes('providerStatus'));assert.ok(!JSON.stringify(diagnostics).includes('test-only-noncredential'));
});
test('safe discovery retained after private DNS rejection supplies no funding or verified claims',async()=>{
 let diagnostics;
 const d=await run('',{search:{provider:{name:'tavily',search:async()=>[{...result(),provider:'tavily',snippet:'Project raised $10 million seed funding.'}]}},fetchPage:async()=>{throw Error('Unsafe source address');},onDiagnostics:value=>{diagnostics=value;}});
 const e=d.evidence[1];assert.equal(e.evidenceKind,'DISCOVERY');assert.equal(e.verification,'UNVERIFIED');assert.equal(e.provider,'tavily');assert.equal(d.funding.rounds.length,0);
 assert.ok(!d.featuresAndServices.some(c=>c.evidenceIds.includes(e.id)));assert.equal(d.researchAvailability.broader,'PARTIAL');
 assert.equal(diagnostics.queries[0].rejections.NON_PUBLIC_DNS,1);assert.equal(diagnostics.queries[0].fetchFailures,1);assert.ok(parseEnrichment(d,source));
});
test('successful searches with zero useful findings have AVAILABLE empty funding and opportunities',async()=>{
 let diagnostics;const d=await run('',{search:{provider:{name:'tavily',search:async()=>[]}},onDiagnostics:value=>{diagnostics=value;}});
 assert.equal(d.researchAvailability.broader,'AVAILABLE');assert.equal(d.sectionAvailability.funding,'AVAILABLE');assert.equal(d.sectionAvailability.opportunities,'AVAILABLE');
 assert.equal(d.funding.rounds.length,0);assert.equal(d.opportunities.length,0);assert.ok(!d.issues.some(i=>/search unavailable/.test(i)));
 assert.ok(diagnostics.queries.every(q=>q.providerStatus==='SUCCEEDED'&&q.normalizedResults===0));assert.ok(parseEnrichment(d,source));
});
for(const kind of ['funding','opportunities'])test(`${kind} provider failure distinguished from empty findings`,async()=>{
 const d=await run('',{search:{provider:{name:'tavily',search:async q=>{if(kind==='funding'?q.includes('funding seed'):!q.includes('features services')&&!q.includes('competitors alternatives')&&!q.includes('funding seed'))throw Error('private upstream detail');return [];}}}});
 assert.equal(d.sectionAvailability[kind],'UNAVAILABLE');assert.equal(d.researchAvailability.broader,'PARTIAL');assert.ok(d.issues.includes(`Broader ${kind} search unavailable; other research retained.`));
 assert.equal(d.evidence[0].provider,'official');assert.ok(!JSON.stringify(d).includes('private upstream'));
});
test('opportunity mixed provider outcome is PARTIAL while empty successful groups remain AVAILABLE',async()=>{
 const d=await run('',{search:{provider:{name:'tavily',search:async q=>{if(q.includes('points quests'))throw Error();return [];}}}});
 assert.equal(d.sectionAvailability.opportunities,'PARTIAL');assert.equal(d.sectionAvailability.funding,'AVAILABLE');
});
test('Tavily competitor metadata does not exclude a fetched specific execution-platform comparison',async()=>{
 const d=await run('<p>Project is a smart contract platform similar to Peer Execution with programmable transaction execution.</p><a href="https://peer.example/">Peer Execution</a>',{search:{provider:{name:'tavily',search:async()=>[{...result(),provider:'tavily'}]}}});
 assert.equal(d.similarProjects.length,1);assert.equal(d.similarProjects[0].value.name,'Peer Execution');assert.equal(d.evidence[1].provider,'tavily');assert.ok(parseEnrichment(d,source));
});
test('external unknown domain never becomes official simply because Tavily found it',async()=>{
 const d=await run('<p>Project offers encrypted storage for developers.</p>',{search:{provider:{name:'tavily',search:async()=>[{...result('https://unknown.example/'),provider:'tavily'}]}}});
 assert.equal(d.evidence[1].sourceClass,'UNKNOWN');assert.equal(d.evidence[1].verification,'UNVERIFIED');
});
test('unrelated fetched result survives as unverified metadata without fabricated claims',async()=>{
 let diagnostics;const d=await run('<p>Another entity offers wallet storage for traders.</p>',{onDiagnostics:value=>{diagnostics=value;}});
 assert.equal(d.evidence[1].evidenceKind,'FETCH_VERIFIED');assert.equal(d.evidence[1].verification,'UNVERIFIED');assert.equal(d.featuresAndServices.length,1);assert.equal(diagnostics.queries[0].claimsCreated,0);
});
test('brand explicitly present in title scopes searches to Ethereum rather than welcome copy',async()=>{
 for(const title of ['Welcome to Ethereum | ethereum.org','Ethereum.org: The complete guide to Ethereum']) {
  const queries=[];const d=await run('',{official:new OfficialResearchProvider(async url=>({url:"https://ethereum.org/",html:`<title>${title}</title><p>Ethereum offers a smart contract platform for developers.</p>`})),search:{provider:{name:'tavily',search:async q=>{queries.push(q);return [];}}}});
  assert.ok(queries.every(q=>q.startsWith('"Ethereum"')));assert.equal(d.confirmedIdentity.name,'Ethereum');
 }
});

test('default provider deadline accepts response just below ten seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 assert.equal(SEARCH_LIMITS.timeout,10000);
 const pending=adapter(async()=>new Promise(resolve=>setTimeout(()=>resolve(Response.json({results:[]})),SEARCH_LIMITS.timeout-1))).search('Project');
 t.mock.timers.tick(SEARCH_LIMITS.timeout-1);
 assert.deepEqual(await pending,[]);
});
test('default provider deadline rejects response exceeding ten seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=adapter(async()=>new Promise(resolve=>setTimeout(()=>resolve(Response.json({results:[]})),SEARCH_LIMITS.timeout+1))).search('Project');
 const rejected=assert.rejects(pending,e=>e.code==='TIMEOUT' && e.status===null);
 t.mock.timers.tick(SEARCH_LIMITS.timeout);
 await rejected;
});
test('six searches start concurrently with bounded deadlines and retain successes after one timeout',async()=>{
 let active=0,maxActive=0;const waiting=[];let diagnostics;
 const provider=adapter(async(_url,options)=>{
  active++;maxActive=Math.max(maxActive,active);
  return new Promise((resolve,reject)=>{
   const complete=()=>{active--;resolve(Response.json({results:[{title:'Discovery',url:'https://coindesk.com/report',content:'Discovery metadata retained'}]}));};
   options.signal.addEventListener('abort',()=>{active--;reject(Error());},{once:true});
   waiting.push(complete);
   if(waiting.length===6)waiting.slice(0,5).forEach(done=>done());
  });
 });
 const search=provider.search.bind(provider);let calls=0;
 provider.search=(query,options)=>{
  calls++;assert.equal(options.maxResults,3);assert.ok(options.timeout>0 && options.timeout<=10000);
  return search(query,{...options,timeout:50});
 };
 const d=await run('',{search:{provider},fetchPage:async()=>{throw Error('Research timed out');},onDiagnostics:value=>{diagnostics=value;}});
 assert.equal(calls,6);assert.equal(maxActive,6);assert.equal(active,0);
 assert.equal(diagnostics.queries.filter(q=>q.providerStatus==='SUCCEEDED').length,5);
 assert.equal(diagnostics.queries.filter(q=>q.providerStatus==='FAILED' && q.rejections.TIMEOUT).length,1);
 assert.equal(d.researchAvailability.broader,'PARTIAL');
 assert.equal(d.sectionAvailability.opportunities,'PARTIAL');
 assert.equal(d.evidence[0].provider,'official');
 const discovery=d.evidence.find(e=>e.provider==='tavily');
 assert.equal(discovery.evidenceKind,'DISCOVERY');assert.equal(discovery.snippet,'Discovery metadata retained');assert.ok(discovery.queryTypes.length);
 assert.equal(SEARCH_LIMITS.total,45000);assert.equal(SEARCH_LIMITS.pages,8);assert.equal(SEARCH_LIMITS.bytes,512*1024);
});
test('search deadlines shrink to the remaining combined research budget',async t=>{
 t.mock.timers.enable({apis:['Date'],now:+now});
 let calls=0;
 const d=await run('',{
  official:{async enrichProject(url,checkedAt){const data=await official.enrichProject(url,checkedAt);t.mock.timers.tick(40000);return data;}},
  search:{provider:{name:'mock',async search(_query,options){calls++;assert.equal(options.timeout,5000);return [];}}},
 });
 assert.equal(calls,6);assert.equal(d.researchAvailability.broader,'AVAILABLE');
});

test('external selection ranks sources while reserving competitors funding and every query group', async () => {
 const {selectExternalCandidates} = await import('../lib/scout/orchestrator.mjs');
 const candidates = Array.from({length:6},(_,queryIndex)=>['UNKNOWN','REPUTABLE_SECONDARY','PRIMARY'].map(sourceClass=>({queryIndex,sourceClass}))).flat();
 const chosen = selectExternalCandidates(candidates);
 assert.equal(chosen.length,8);
 assert.equal(new Set(chosen.map(c=>c.queryIndex)).size,6);
 assert.ok(chosen.slice(0,6).every(c=>c.sourceClass==='PRIMARY'));
 assert.ok(chosen.slice(6).every(c=>c.sourceClass==='REPUTABLE_SECONDARY'));
 assert.ok(chosen.some(c=>c.queryIndex===1));assert.ok(chosen.some(c=>c.queryIndex===2));
});
test('three bounded workers isolate a slow failure, cap attempts at eight and preserve discoveries', async () => {
 let queryIndex=0,active=0,maxActive=0,attempts=0;const completed=[];let diagnostics;
 const d=await run('',{
  onDiagnostics:value=>diagnostics=value,
  search:{provider:{name:'tavily',search:async()=>{const index=queryIndex++;return Array.from({length:3},(_,i)=>({...result(`https://coindesk.com/${index}/${i}`),provider:'tavily'}));}}},
  fetchPage:async(url,{timeout})=>{
   assert.equal(timeout,12000);attempts++;active++;maxActive=Math.max(maxActive,active);
   try { await new Promise(resolve=>setTimeout(resolve,url.endsWith('/0/0')?30:2));
    if(url.endsWith('/0/0'))throw Error('Research timed out');
    completed.push(url);return {url,html:'<p>Project offers storage for developers.</p>'};
   }finally{active--;}
  },
 });
 assert.equal(attempts,8);assert.equal(maxActive,3);assert.equal(active,0);assert.equal(completed.length,7);
 assert.equal(d.evidence.filter(e=>e.evidenceKind==='FETCH_VERIFIED' && e.provider==='tavily').length,7);
 const failed=d.evidence.find(e=>e.url.endsWith('/0/0'));assert.equal(failed.evidenceKind,'DISCOVERY');assert.equal(failed.verification,'UNVERIFIED');assert.equal(failed.provider,'tavily');
 assert.ok(d.featuresAndServices.some(c=>c.evidenceIds.some(id=>d.evidence.find(e=>e.id===id)?.evidenceKind==='FETCH_VERIFIED')));
 assert.equal(diagnostics.fetches.filter(f=>f.result==='TIMEOUT').length,1);
 assert.equal(diagnostics.queries.reduce((n,q)=>n+q.budgetSkipped,0),10);
 assert.ok(diagnostics.fetches.some(f=>f.queryGroup==='funding'));assert.ok(diagnostics.fetches.some(f=>f.queryGroup==='competitors'));
});
test('external deadline shrinks to combined budget and a just-in-time page is retained', async t => {
 t.mock.timers.enable({apis:['Date'],now:+now});let timeoutSeen;
 const d=await run('',{
  official:{async enrichProject(url,checkedAt){const data=await official.enrichProject(url,checkedAt);t.mock.timers.tick(44000);return data;}},
  fetchPage:async(url,{timeout})=>{timeoutSeen=timeout;t.mock.timers.tick(999);return {url,html:'<p>Project offers storage for developers.</p>'};},
 });
 assert.equal(timeoutSeen,1000);assert.equal(d.evidence[1].evidenceKind,'FETCH_VERIFIED');assert.equal(d.featuresAndServices.length,2);
});
test('all external timeouts retain official evidence and unverified discovery metadata',async()=>{
 const d=await run('',{fetchPage:async()=>{throw Error('Research timed out');}});
 assert.equal(d.evidence[0].provider,'official');assert.equal(d.evidence[0].verification,'VERIFIED');
 assert.equal(d.evidence[1].provider,'mock');assert.equal(d.evidence[1].verification,'UNVERIFIED');assert.equal(d.evidence[1].evidenceKind,'DISCOVERY');
 assert.equal(d.funding.rounds.length,0);assert.equal(d.researchAvailability.broader,'PARTIAL');
});
test('successful funding discovery is AVAILABLE even when page verification times out, without fabricated rounds',async()=>{
 const d=await run('',{fetchPage:async()=>{throw Error('Research timed out');}});
 assert.equal(d.sectionAvailability.funding,'AVAILABLE');assert.equal(d.funding.rounds.length,0);assert.equal(d.funding.totalKnown.value,null);assert.equal(d.researchAvailability.broader,'PARTIAL');
});
