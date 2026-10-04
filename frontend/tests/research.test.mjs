import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { researchProject, parsePage, normalizedUrl, projectIdentity, publicAddress, fetchOfficial, RuntimeRepository, LIMITS } from '../lib/scout/research.mjs';
import { parseEnrichment, enrichmentState } from '../lib/scout/enrichment.ts';
const source='https://project.example/';
const now=new Date('2026-10-04T12:00:00Z');
const html='<title>Project</title><p>Our platform offers encrypted storage for developers using distributed nodes.</p>';
const run=(content=html)=>researchProject(source,{now,fetchPage:async url=>({url,html:content})});
test('official website yields attributed capabilities without changing V3',async()=>{
 const data=await run();assert.equal(data.featuresAndServices.length,1);assert.equal(data.evidence[0].domain,'project.example');assert.ok(parseEnrichment(data,source));assert.equal(enrichmentState(data).status,'Partial');
});
test('direct official docs and blog links are bounded; external pages are not recursively crawled',async()=>{
 const calls=[];const data=await researchProject(source,{now,fetchPage:async url=>{calls.push(url);return {url,html:html+(url===source?'<a href="https://docs.project.example/">Documentation</a><a href="/blog">Blog</a>':'<a href="https://other.example/">Docs</a>')};}});
 assert.equal(calls.length,3);assert.equal(data.evidence.length,3);assert.ok(!calls.includes('https://other.example/'));
});
test('empty and malformed source content is unavailable',async()=>{for(const html of ['','<script>offers wallet</script>','<p><script>bad</script></p>','<a href="javascript:alert(1)">Docs</a>']) {const d=await run(html);assert.equal(d.featuresAndServices.length,0);assert.equal(enrichmentState(d).status,'Unable to verify');}});
for(const reason of ['Official website blocked automated access','Research timed out'])test(reason,async()=>{
 const d=await researchProject(source,{now,fetchPage:async()=>{throw Error(reason);}});assert.deepEqual(d.issues,[reason]);assert.equal(d.evidence.length,0);
});
test('failed linked source preserves partial research',async()=>{
 const d=await researchProject(source,{now,fetchPage:async url=>{if(url!==source)throw Error('Social source could not be accessed');return {url,html:html+'<a href="https://x.com/project">Twitter</a>'};}});assert.equal(enrichmentState(d).status,'Partial');assert.equal(d.issues.length,1);
});
test('duplicate redirect destinations and claims remove duplicate evidence',async()=>{
 const d=await researchProject(source,{now,fetchPage:async url=>({url:source,html:html+'<a href="/docs">Docs</a><a href="/docs#start">Docs</a>'})});assert.equal(d.evidence.length,1);assert.equal(d.featuresAndServices.length,1);
});
test('active requires explicit open registration and future deadline; expired and unknown never active',async()=>{
 for(const [text,status,trust] of [['Testnet registration is open until 2026-12-01','Active','VERIFIED'],['Testnet registration is open until 2025-12-01','Ended','VERIFIED'],['Join our testnet','Unknown','UNVERIFIED'],['Testnet is closed','Ended','VERIFIED']]){
 const d=await run(`<p>${text}</p>`);assert.equal(d.opportunities[0].value.status,status);assert.equal(d.opportunities[0].verification,trust);
 }
});
test('official funding with amount, date and explicitly named investors; no valuation inference',async()=>{
 const d=await run('<p>We raised $12 million in a seed round on 2026-01-02 led by Example Capital and Public Ventures.</p>');const r=d.funding.rounds[0];assert.equal(r.value.amount.value,'$12 million');assert.equal(r.value.date.value,'2026-01-02');assert.deepEqual(r.value.investors.value,['Example Capital','Public Ventures']);assert.ok(r.evidenceIds.length);
 for(const text of ['Our TVL reached $12 million','Partner investor logos','We plan to raise $12 million seed funding','Our token valuation is $12 million'])assert.equal((await run(`<p>${text}</p>`)).funding.rounds.length,0);
});
test('absent funding and conservative comparison/originality never fabricate',async()=>{const d=await run();assert.equal(d.funding.totalKnown.value,null);assert.equal(d.funding.rounds.length,0);assert.deepEqual(d.similarProjects,[]);assert.equal(d.originalitySignal.value,null);});
test('freshness is explicit and opportunities expire sooner; funding keeps evidence',async()=>{const d=await run();assert.equal(d.researchedAt,now.toISOString());assert.ok(Date.parse(d.opportunitiesStaleAfter)<Date.parse(d.staleAfter));assert.equal(d.sourceCheckedAt,d.evidence[0].checkedAt);});
test('stable identity normalizes www, fragments and tracking; shared-host paths stay distinct',()=>{assert.equal(projectIdentity(source),projectIdentity('https://www.project.example/?utm_source=x#foo'));assert.equal(projectIdentity('https://twitter.com/Project'),projectIdentity('https://x.com/project'));assert.notEqual(projectIdentity('https://shared.example/a'),projectIdentity('https://shared.example/b'));});
test('unsafe protocols, credentials, ports and private/localhost literals rejected',()=>{for(const url of ['file:///etc/passwd','http://localhost/','http://a.localhost','http://127.1','http://10.0.0.1','http://169.254.169.254','http://172.16.0.1','http://192.168.1.1','http://[::1]','http://[::ffff:127.0.0.1]','https://user:password@project.example','https://project.example:3000'])assert.throws(()=>normalizedUrl(url));});
test('all DNS answers checked; IPv6 local, mapped and transition addresses rejected',async()=>{for(const address of ['127.0.0.1','10.1.1.1','::1','fc00::1','fe80::1','::ffff:7f00:1','2002:7f00::1']){assert.equal(publicAddress(address),false);await assert.rejects(fetchOfficial(source,{resolve:async()=>[{address,family:4}]}),/Unsafe/);}});
function mockTransport(responses) {
 return {get(url,options,callback){const request=new EventEmitter();request.destroy=err=>{request.emit('error',err);request.emit('close');};queueMicrotask(()=>{
 const config=responses.shift();if(config==='timeout')return;
 const res=new PassThrough();res.statusCode=config.status||200;res.headers={'content-type':'text/html',...config.headers};callback(res);res.end(config.body||html);request.emit('close');
 });return request;}};
}
const resolve=async()=>[{address:'93.184.216.34',family:4}];
for (const pin of [{address:'93.184.216.34',family:4},{address:'2606:4700:4700::1111',family:6}]) {
 for (const all of [true,false]) test(`validated IPv${pin.family} pin supports ${all?'all-address':'scalar'} lookup`,async()=>{
  const transport=mockTransport([{}]);const get=transport.get;
  transport.get=(url,options,callback)=>{
   assert.equal(url.hostname,'project.example');assert.equal(url.protocol,'https:');
   assert.equal(options.rejectUnauthorized,undefined);assert.equal(options.checkServerIdentity,undefined);
   options.lookup(url.hostname,{all},(...args)=>assert.deepEqual(args,all?[null,[pin]]:[null,pin.address,pin.family]));
   return get(url,options,callback);
  };
  await fetchOfficial(source,{resolve:async(host,options)=>{assert.deepEqual(options,{all:true});return [pin,{address:'1.1.1.1',family:4}];},transport});
 });
}
test('mixed public/private DNS answers reject before connection',async()=>{
 await assert.rejects(fetchOfficial(source,{resolve:async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}],transport:{get(){assert.fail('unsafe DNS must not connect');}}}),/Unsafe/);
});
test('redirect hostname DNS is revalidated before connection',async()=>{
 let calls=0;await assert.rejects(fetchOfficial(source,{resolve:async()=>++calls===1?[{address:'1.1.1.1',family:4}]:[{address:'10.0.0.1',family:4}],transport:mockTransport([{status:302,headers:{location:'https://redirect.example/'}}])}),/Unsafe/);assert.equal(calls,2);
});
test('redirects revalidate private locations before any fetch',async()=>{await assert.rejects(fetchOfficial(source,{resolve,transport:mockTransport([{status:302,headers:{location:'http://127.0.0.1/'}}])}),/Unsafe/);});
test('public relative redirect succeeds and redirect loops are bounded',async()=>{const d=await fetchOfficial(source,{resolve,transport:mockTransport([{status:302,headers:{location:'/docs'}},{}])});assert.equal(d.url,source+'docs');await assert.rejects(fetchOfficial(source,{resolve,transport:mockTransport(Array(5).fill({status:302,headers:{location:'/loop'}}))}),/redirect limit/);});
test('HTML above the old 256 KB limit and at 512 KiB is accepted',async()=>{
 assert.equal(LIMITS.bytes,512*1024);
 for(const bytes of [267444,512*1024]) {
  const body=html+' '.repeat(bytes-Buffer.byteLength(html));
  const page=await fetchOfficial(source,{resolve,transport:mockTransport([{body}])});
  assert.equal(Buffer.byteLength(page.html),bytes);assert.equal(page.url,source);
 }
});
test('HTML above 512 KiB is rejected and its response is destroyed',async()=>{
 const transport=mockTransport([{body:'a'.repeat(512*1024+1)}]);const get=transport.get;let response;
 transport.get=(url,options,callback)=>get(url,options,res=>{response=res;callback(res);});
 await assert.rejects(fetchOfficial(source,{resolve,transport}),/size limit/);
 assert.equal(response.destroyed,true);
});
test('unsupported content type rejected',async()=>{await assert.rejects(fetchOfficial(source,{resolve,transport:mockTransport([{headers:{'content-type':'application/octet-stream'}}])}),/usable/);});
test('request timeout aborts transport',async()=>{await assert.rejects(fetchOfficial(source,{resolve,timeout:5,transport:mockTransport(['timeout'])}),/timed out/);});
test('runtime cache is bounded, detached and explicitly ephemeral',async()=>{const repo=new RuntimeRepository();const d=await run();repo.put(d.identity,d);const copy=repo.get(d.identity);copy.evidence.length=0;assert.equal(repo.get(d.identity).evidence.length,1);repo.entries.get(d.identity).expires=0;assert.equal(repo.get(d.identity),null);});
test('explicit linked comparison supports a cautious inferred common model',async()=>{const d=await run('<p>Our platform offers storage similar to <a href="https://peer.example/">Peer Storage</a> for developers.</p>');assert.equal(d.similarProjects[0].value.name,'Peer Storage');assert.equal(d.similarProjects[0].verification,'INFERRED');assert.equal(d.originalitySignal.value,'Common model');assert.equal(d.featuresAndServices[0].value.targetUsers.value,'developers');});
test('provider coalesces requests and uses repository without permanent persistence',async()=>{
 const {createResearchProvider}=await import('../lib/scout/research.mjs');let calls=0;const provider=createResearchProvider(new RuntimeRepository(),async url=>{calls++;return run();});await Promise.all([provider.enrichProject(source),provider.enrichProject(source)]);await provider.enrichProject(source);assert.equal(calls,1);
});
test('internal errors are sanitized and never exposed as diagnostics',async()=>{const d=await researchProject(source,{fetchPage:async()=>{throw Error('getaddrinfo EAI_AGAIN internal.host');}});assert.deepEqual(d.issues,['Official source could not be accessed']);});
test('freshness corruption rejected at client boundary',async()=>{const d=await run();d.staleAfter='yesterday';assert.equal(parseEnrichment(d,source),null);});
test('DNS timeout bounds research before transport connection',async()=>{await assert.rejects(fetchOfficial(source,{timeout:5,resolve:async()=>new Promise(resolve=>setTimeout(()=>resolve([{address:'93.184.216.34',family:4}]),20))}),/timed out/);});
test('opportunity display downgrades stale active evidence and expires deadlines without mutating records',async()=>{
 const {opportunityAtTime}=await import('../lib/scout/enrichment.ts');const d=await run('<p>Testnet registration is open until 2026-12-01</p>');const c=d.opportunities[0];
 assert.equal(opportunityAtTime(c,d.opportunitiesStaleAfter,+now+3600001).verification,'UNVERIFIED');assert.equal(opportunityAtTime(c,d.opportunitiesStaleAfter,+now+3600001).value.status,'Unknown');
 assert.equal(opportunityAtTime(c,d.opportunitiesStaleAfter,Date.parse('2027-01-01')).value.status,'Ended');assert.equal(c.value.status,'Active');
});
test('malformed deadline stays unknown and ended campaigns never use the Active campaign type',async()=>{const malformed=await run('<p>Testnet registration is open until 2026-99-99</p>');assert.equal(malformed.opportunities[0].value.status,'Unknown');const closed=await run('<p>Campaign registration is closed until 2025-12-01</p>');assert.equal(closed.opportunities[0].value.status,'Ended');assert.notEqual(closed.opportunities[0].value.type,'Active campaign');});

test('public 2001 IPv6 accepted while reserved and transition ranges remain rejected',async()=>{
 for(const address of ['2001:4860:4860::8888','2001:41d0::1']) {
  assert.equal(publicAddress(address),true);
  assert.ok(await fetchOfficial(source,{resolve:async()=>[{address,family:6}],transport:mockTransport([{}])}));
 }
 for(const address of ['2001::1','2001:0000:1234::1','2001:db8::1','2001:10::1','2001:20::1','2002:abcd::1'])assert.equal(publicAddress(address),false);
});
test('literal public IPv6 DNS lookup receives hostname without URL brackets',async()=>{
 const url='https://[2606:4700:4700::1111]/';
 const p=await fetchOfficial(url,{resolve:async host=>{assert.equal(host,'2606:4700:4700::1111');return [{address:host,family:6}];},transport:mockTransport([{}])});assert.equal(p.url,url);
});
test('sanitized fetch categories distinguish safety, timeout, content, size, DNS and TLS',async()=>{
 const {fetchDiagnostic}=await import('../lib/scout/research.mjs');
 for(const [message,code,category] of [['Unsafe source URL',undefined,'UNSAFE_URL'],['Unsafe source address',undefined,'NON_PUBLIC_DNS'],['Research timed out',undefined,'TIMEOUT'],['Official source exceeded research size limit',undefined,'SIZE_LIMIT'],['No usable official source content',undefined,'CONTENT_TYPE'],['secret hostname','EAI_AGAIN','DNS_FAILURE'],['secret TLS certificate','CERT_HAS_EXPIRED','TLS_FAILURE']]) assert.equal(fetchDiagnostic(Object.assign(Error(message),{code})),category);
});
test('navigation and audience labels cannot become capabilities; ecosystem services remain',async()=>{
 const d=await run('<nav><p>Build on the protocol and explore services for developers.</p></nav><h2>For developers</h2><h2>Ecosystem Support Program</h2><p>Project offers developer grants and technical support for ecosystem developers.</p><p>Project enables staking participation for validators.</p>');
 assert.equal(d.featuresAndServices.length,2);assert.ok(d.featuresAndServices.every(c=>c.evidenceIds.length));assert.ok(d.featuresAndServices.some(c=>/developer grants/.test(c.value.description)));
});
test('duplicate node/testnet opportunities normalize titles, URLs and source relationships; distinct programs remain',async()=>{
 const {dedupeOpportunities}=await import('../lib/scout/research.mjs');
 const base=(await run('<p>Project invites users to run nodes for the protocol.</p><a href="/nodes">Nodes</a>')).opportunities[0];
 const one=structuredClone(base);const two=structuredClone(base);two.value.title='Node';two.value.participationUrl=source+'nodes?utm_source=test#join';two.value.sourceUrl=source+'docs';two.evidenceIds=['second'];
 const other=structuredClone(base);other.value.participationUrl=source+'validator-program';other.value.title='Validator program';
 const merged=dedupeOpportunities([one,two,other]);assert.equal(merged.length,2);assert.deepEqual(merged[0].evidenceIds,[...base.evidenceIds,'second']);assert.equal(merged[0].value.status,'Unknown');
 const testnet=structuredClone(base);testnet.value.type='Testnet';testnet.value.title='Testnets';testnet.value.participationUrl=source+'testnet';const same=structuredClone(testnet);same.value.title='testnet';assert.equal(dedupeOpportunities([testnet,same]).length,1);
});
test('meaningful article and program query parameters survive; tracking does not',()=>{
 assert.equal(normalizedUrl('https://public.example/article?id=123&utm_source=search#top'),'https://public.example/article?id=123');
 assert.notEqual(normalizedUrl('https://public.example/join?program=nodes'),normalizedUrl('https://public.example/join?program=validators'));
});
test('capability extraction validates the extracted clause rather than an entire mixed heading block',async()=>{
 const d=await run('<li>For developers. Build tools and explore the protocol.</li><li>Where to get help and support from developers.</li><li>Ecosystem Support Program. The protocol supports community grants.</li><p>Project enables staking participation for validators.</p><p>Project offers grants and technical support services for developers.</p>');
 assert.equal(d.featuresAndServices.length,2);assert.ok(d.featuresAndServices.every(c=>!/^Reported capability: (For developers|Ecosystem Support Program|Where to)/.test(c.value.description)));
});
test('generic node explanations do not become participation programs while running nodes remains Unknown',async()=>{
 const d=await run('<p>The network consists of independent computers called nodes.</p><p>Nodes support consensus for the protocol.</p><p>Project invites users to run a node.</p><a href="/run-a-node">Run a node</a>');
 assert.equal(d.opportunities.length,1);assert.equal(d.opportunities[0].value.participationUrl,source+'run-a-node');assert.equal(d.opportunities[0].value.status,'Unknown');
});

test('safe external fetch retains a body completed just below its absolute timeout', async () => {
 const transport={get(url,options,callback){const request=new EventEmitter();request.destroy=err=>{request.emit('error',err);request.emit('close');};
  const res=new PassThrough();res.statusCode=200;res.headers={'content-type':'text/html'};
  setTimeout(()=>{callback(res);res.end('<p>Project offers storage for developers.</p>');request.emit('close');},15);
  return request;
 }};
 const page=await fetchOfficial(source,{resolve,transport,timeout:40});assert.match(page.html,/storage/);
});
test('external timeout includes slow DNS and aborts before opening a transport',async()=>{
 let connected=false;
 await assert.rejects(fetchOfficial(source,{timeout:10,resolve:()=>new Promise(r=>setTimeout(()=>r([{address:'93.184.216.34',family:4}]),30)),transport:{get(){connected=true;}}}),/Research timed out/);
 assert.equal(connected,false);
});
