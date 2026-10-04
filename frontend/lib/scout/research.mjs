import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

export const LIMITS = { pages: 6, bytes: 512 * 1024, redirects: 3, rootTimeout: 12000, timeout: 4000, total: 24000 };
const unavailable = () => ({ verification: 'UNAVAILABLE', value: null, evidenceIds: [] });
const claim = (value, id, verification = 'VERIFIED') => ({ value, verification, evidenceIds: [id] });
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a >= 224 || a === 198 && (b === 18 || b === 19));
  }
  // Only global-unicast IPv6; mapped IPv4, local, multicast and transition ranges rejected.
  if (isIP(address) !== 6) return false;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1,-1);
  return /^[23][0-9a-f]{3}:/i.test(canonical) && !/^2002:|^2001:(?::|0:|db8:|1[0-9a-f]:|2[0-9a-f]:)|^3fff:/i.test(canonical);
}
// Fixed categories only; never return raw network errors, URLs or upstream bodies.
export function fetchDiagnostic(error) {
  const message = error?.message || '';
  if (message === 'Unsafe source URL') return 'UNSAFE_URL';
  if (message === 'Unsafe source address') return 'NON_PUBLIC_DNS';
  if (message === 'Research timed out') return 'TIMEOUT';
  if (/size limit/.test(message)) return 'SIZE_LIMIT';
  if (/redirect limit/.test(message)) return 'REDIRECT_LIMIT';
  if (/Invalid source redirect/.test(message)) return 'INVALID_REDIRECT';
  if (/No usable official source content/.test(message)) return 'CONTENT_TYPE';
  if (/blocked automated/.test(message)) return 'HTTP_BLOCKED';
  if (/Official source could not be accessed/.test(message)) return 'HTTP_STATUS';
  if (['ENOTFOUND','EAI_AGAIN'].includes(error?.code)) return 'DNS_FAILURE';
  if (/CERT|TLS|SSL/.test(error?.code || '')) return 'TLS_FAILURE';
  return 'NETWORK_FAILURE';
}
export function normalizedUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['','80','443'].includes(url.port) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw Error('Unsafe source URL');
  if (isIP(url.hostname.replace(/[\[\]]/g,'')) && !publicAddress(url.hostname.replace(/[\[\]]/g,''))) throw Error('Unsafe source URL');
  url.hash = '';
  // Drop tracking only: meaningful article/program query parameters identify distinct sources.
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|tracking|fbclid|gclid)$/i.test(key) || key === 's' && /^(x\.com|twitter\.com)$/.test(url.hostname)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  return url.href;
}
export function projectIdentity(input) {
  const url = new URL(normalizedUrl(input));
  const host = url.hostname.replace(/^www\./,'');
  if (['x.com','twitter.com'].includes(host)) return `x:${url.pathname.split('/')[1]?.toLowerCase()}`;
  // Paths matter on shared hosting: do not conflate unrelated projects.
  return `website:${host}${url.pathname.replace(/\/$/,'')}`;
}
export async function fetchOfficial(input, {resolve = lookup, timeout = LIMITS.timeout, transport} = {}) {
  let current = normalizedUrl(input);
  const deadline = Date.now() + timeout;
  const remaining = () => {const ms = deadline-Date.now(); if (ms <= 0) throw Error('Research timed out'); return ms;};
  for (let redirects = 0; redirects <= LIMITS.redirects; redirects++) {
    const url = new URL(current);
    let dnsTimer;
    let addresses;
    try {
      addresses = await Promise.race([resolve(url.hostname.replace(/[\[\]]/g,''), {all:true}), new Promise((_,reject) => { dnsTimer=setTimeout(()=>reject(Error('Research timed out')),remaining()); })]);
    } finally {clearTimeout(dnsTimer);}
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw Error('Unsafe source address');
    const address = addresses[0];
    const requestTimeout = remaining();
    const response = await new Promise((resolveResponse, reject) => {
      const req = (transport || (url.protocol === 'https:' ? https : http)).get(url, {
        headers: {'User-Agent':'CaptainScout/2 official-source research','Accept':'text/html,text/plain','Accept-Encoding':'identity'},
        // Node's family autoselection requests all answers; return only the validated pin.
        // Keep the hostname URL so HTTPS still verifies its certificate and sends its SNI.
        lookup: (_host,options,callback) => options.all === true
          ? callback(null,[{address:address.address,family:address.family}])
          : callback(null,address.address,address.family),
      }, res => {
        if ([301,302,303,307,308].includes(res.statusCode)) { res.destroy(); if(!res.headers.location){reject(Error('Invalid source redirect'));return;} resolveResponse({redirect:res.headers.location}); return; }
        if (res.statusCode !== 200) {res.resume();reject(Error(res.statusCode === 403 || res.statusCode === 429 ? 'Official website blocked automated access' : 'Official source could not be accessed'));return;}
        if (!/^(text\/html|text\/plain)/i.test(res.headers['content-type'] || '')) {res.destroy();reject(Error('No usable official source content'));return;}
        let size=0;const chunks=[];
        res.on('data', chunk=>{size+=chunk.length;if(size>LIMITS.bytes){res.destroy();reject(Error('Official source exceeded research size limit'));}else chunks.push(chunk);});
        res.on('end',()=>resolveResponse({url:current,html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
      });
      const timer=setTimeout(()=>req.destroy(Error('Research timed out')),requestTimeout);
      req.on('close',()=>clearTimeout(timer));req.on('error',reject);
    });
    if (!response.redirect) return response;
    if (redirects === LIMITS.redirects) throw Error('Official source exceeded redirect limit');
    current=normalizedUrl(new URL(response.redirect,current).href);
  }
}
const clean = s => s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&[^;\s]{1,12};/g,' ').replace(/\s+/g,' ').trim();
export function parsePage(html, url) {
  const sanitized=html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const title=clean(sanitized.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname).slice(0,120);
  const content = sanitized.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const blocks=[...content.matchAll(/<(?:p|li|h[1-4])\b[^>]*>([\s\S]*?)<\/(?:p|li|h[1-4])>/gi)].map(m=>clean(m[1])).filter(s=>s.length>15 && s.length<700);
  const links=[];
  for(const m of sanitized.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {const target=normalizedUrl(new URL(m[1].replace(/&amp;/g,'&'),url).href); links.push({url:target,label:clean(m[2]).slice(0,100)});}catch{}
  }
  return {title,blocks:[...new Set(blocks)],links};
}
// Explicit execution-platform comparisons qualify; generic blockchain/AI/DeFi labels do not.
export const comparisonCategory = block => /\b(storage|lending|trading|payments|rollup|wallet|bridge|staking|data availability|prediction market|smart[- ]contract (?:execution|platforms?|networks?))\b/i.exec(block)?.[0];
export const explicitComparison = block => /\b(compared to|alternative to|similar to|unlike|versus|vs\.?)\b/i.test(block);
export function isCapability(block) {
  if (/^(?:where to|more on|explore|learn (?:about|how)|cryptocurrencies,? such as)/i.test(block.trim())) return false;
  if (/^(?:for (?:developers|users|enterprises|validators)|ecosystem support program|home|learn|explore|build|developers|community|documentation|products?|services?)$/i.test(block.trim())) return false;
  if (/ecosystem support program/i.test(block) && !/\b(provides?|offers?|enables?)\b/i.test(block)) return false;
  return /\b(provides?|offers?|enables?|supports?|platform|protocol|service|product|build)\b/i.test(block)
    && block.split(/\s+/).length >= 5
    && !/^(?:for (?:developers|users|enterprises|validators))\s*$/i.test(block);
}
const semanticText = value => value.toLowerCase().replace(/\b(nodes|validators|testnets|campaigns|waitlists|quests|ambassadors|hackathons)\b/g, word => word.slice(0,-1)).replace(/[^a-z0-9]+/g,' ').trim();
export function dedupeOpportunities(claims) {
  const output = [];
  for (const c of claims) {
    const v = c.value;
    const old = output.find(o => semanticText(o.value.type) === semanticText(v.type)
      && semanticText(o.value.title) === semanticText(v.title)
      && normalizedUrl(o.value.participationUrl) === normalizedUrl(v.participationUrl)
      && (normalizedUrl(o.value.sourceUrl) === normalizedUrl(v.sourceUrl) || o.evidenceIds.some(id => c.evidenceIds.includes(id)) || new URL(o.value.sourceUrl).hostname === new URL(v.sourceUrl).hostname));
    if (!old) { output.push(c); continue; }
    old.evidenceIds = [...new Set([...old.evidenceIds,...c.evidenceIds])];
    if (old.value.status !== v.status) { old.value.status = 'Unknown'; old.verification = 'UNVERIFIED'; }
  }
  return output;
}
export async function researchProject(sourceUrl, {fetchPage = fetchOfficial, now = new Date(), allowFunding = () => true, followLinks = true} = {}) {
  const checked=now.toISOString();const issues=[];const evidence=[];
  const data={schemaVersion:1,sourceUrl,identity:projectIdentity(sourceUrl),featuresAndServices:[],similarProjects:[],originalitySignal:unavailable(),originalityExplanation:'Insufficient evidence to assess differentiation.',opportunities:[],funding:{totalKnown:unavailable(),rounds:[]},evidence,lastUpdated:checked,researchedAt:checked,sourceCheckedAt:checked,staleAfter:new Date(+now+86400000).toISOString(),opportunitiesStaleAfter:new Date(+now+3600000).toISOString(),issues};
  const queue=[normalizedUrl(sourceUrl)];const visited=new Set();let rootOrigin;const started=Date.now();
  while(queue.length && visited.size<LIMITS.pages && Date.now()-started<LIMITS.total) {
    const requested=queue.shift();if(visited.has(requested))continue;visited.add(requested);
    let page;
    try {page=await fetchPage(requested, {timeout: Math.min(visited.size === 1 ? LIMITS.rootTimeout : LIMITS.timeout, Math.max(1, LIMITS.total-(Date.now()-started)))});}catch(e){issues.push(e.message?.startsWith('Unsafe')?'Source rejected by public-network safety checks': /^(Research timed out|Official website blocked automated access|Social source could not be accessed|No usable official source content|Official source exceeded (research size|redirect) limit)$/.test(e.message || '') ? e.message : /^(x\.com|twitter\.com)$/.test(new URL(requested).hostname) ? 'Social source could not be accessed' : 'Official source could not be accessed');continue;}
    const url=normalizedUrl(page.url);if(evidence.some(e=>e.url===url))continue;
    if(!rootOrigin) rootOrigin=new URL(url).origin;
    const parsed=parsePage(page.html,url);if(!parsed.blocks.length){issues.push('No usable official sources were discovered');continue;}
    if (visited.size === 1) {
      const titleName = parsed.title.split(/\s[|–—-]\s/)[0].trim().replace(/^welcome to\s+/i,'');
      const hostName = new URL(url).hostname.replace(/^www\./,'').split('.')[0];
      // Resolve a brand explicitly present in the fetched title, not marketing copy.
      const escapedHost = hostName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const name = parsed.title.toLowerCase() !== new URL(url).hostname.toLowerCase() && hostName.length >= 3 && new RegExp(`\\b${escapedHost}\\b`,'i').exec(titleName)?.[0] || titleName;
      if (name.length >= 3 && name.length <= 80 && name.toLowerCase() !== new URL(url).hostname.toLowerCase()) data.confirmedIdentity = {name, submittedUrl:normalizedUrl(sourceUrl), sourceUrl:url};
    }
    const id=`source-${evidence.length+1}`;evidence.push({id,url,name:parsed.title,domain:new URL(url).hostname,checkedAt:checked,verification:'VERIFIED'});
    // Only direct links from the submitted landing page; never recursively crawl external sites.
    if(visited.size===1 && followLinks) for(const link of parsed.links) {
      const same=new URL(link.url).origin===rootOrigin;
      if(same || /\b(docs|documentation|blog|news|github|twitter|testnet|waitlist|campaign)\b/i.test(link.label) || /^(?:[^.]+\.)?(github\.com|x\.com|twitter\.com)$/.test(new URL(link.url).hostname)) { if(queue.length<LIMITS.pages*2)queue.push(link.url); }
    }
    for(const block of parsed.blocks) {
      const idClaim= s=>claim(s,id);
      // Extract bounded, attributed factual clauses. Heuristic results are inferred, never treated as independent verification.
      if(isCapability(block) && data.featuresAndServices.length<12) {
        const description=block.split(/[.!?]\s/)[0].split(/\s+/).slice(0,24).join(' ').replace(/^(Our|We|The project)\s+/i,'').replace(/\bwe\b/gi,'the project');
        if(isCapability(description) && !data.featuresAndServices.some(c=>c.value.description===description)) data.featuresAndServices.push(claim({title: /\b(API|SDK|wallet|bridge|payments|staking|rollup|storage|trading|lending)\b/i.exec(block)?.[0] || 'Product capability',description:`Reported capability: ${description}`,availability:/coming soon|plan to|will launch|announc/i.test(block)?'Announced':'Offered',targetUsers: /\bfor (developers|enterprises|institutions|traders|users|creators|validators|businesses)\b/i.test(block) ? claim(block.match(/\bfor (developers|enterprises|institutions|traders|users|creators|validators|businesses)\b/i)[1],id,'INFERRED') : unavailable()},id,'INFERRED'));
      }
      for (const link of parsed.links) {
        if (explicitComparison(block) && comparisonCategory(block) && link.label.length > 2 && block.includes(link.label) && new URL(link.url).origin !== rootOrigin && !/docs|blog|twitter|github/i.test(link.label)) {
          if (!data.similarProjects.some(c=>c.value.url===link.url) && data.similarProjects.length<4) data.similarProjects.push(claim({name:link.label,url:link.url,category:comparisonCategory(block),similarity:'The official project source explicitly compares its product with this project.',differentiators:'No independently verified differentiator established.'},id,'INFERRED'));
        }
      }
      const kind=/\b(testnets?|waitlists?|points programs?|campaigns?|ambassadors?|quests?|early access|validators?|nodes?|incentive programs?|hackathons?)\b/i.exec(block)?.[0];
      if(kind && data.opportunities.length<8) {
        const date=block.match(/(?:deadline|ends|until|closes)(?:\s+on)?[:\s]+(20\d{2}-\d{2}-\d{2})/i)?.[1];
        const deadline=date && Number.isFinite(Date.parse(date)) && /deadline|ends|until|closes/i.test(block)?new Date(date+'T23:59:59Z').toISOString():undefined;
        const ended=/closed|ended|expired|concluded|no longer/i.test(block) || deadline && Date.parse(deadline)<+now;
        // Require explicit present-tense availability AND a future deadline to label Active.
        const active=!ended && deadline && /\b(join now|open now|currently open|registration is open|live now)\b/i.test(block);
        const nodeKind = /node|validator/i.test(kind);
        const link=parsed.links.find(l=>new URL(l.url).origin===new URL(url).origin
          && (nodeKind ? /\b(nodes?|validators?)\b/i : new RegExp(kind.replace(/ /g,'|'),'i')).test(l.label+' '+l.url)
          && (!nodeKind || /run[- /]?(?:a[- /]?)?nodes?|staking|stake|register|apply|join|\/(?:nodes?|validators?)(?:\/|$)/i.test(l.label+' '+l.url)));
        // General network explanations do not establish a node participation program.
        if (nodeKind && !link && !/\b(run|running|operate|operating|join|register|stake|staking|deposit|participate)\b/i.test(block)) continue;
        const value={title:kind,type:/testnet/i.test(kind)?'Testnet':/waitlist|early access/i.test(kind)?'Waitlist':/points/i.test(kind)?'Points program':/ambassador/i.test(kind)?'Ambassador/community program':/node|validator/i.test(kind)?'Node opportunity':active?'Active campaign':'Other',status:ended?'Ended':active?'Active':/\b(upcoming|opens on|launches on|will launch)\b/i.test(block)?'Announced':'Unknown',description:`Official source mentions ${kind}; ${ended?'participation has ended':active?'dated registration is open':'current participation is not confirmed'}.`,participationUrl:link?.url || url,sourceUrl:url,lastChecked:checked,...(deadline?{deadline}:{})};
        if(!data.opportunities.some(c=>c.value.title===kind && c.value.sourceUrl===url))data.opportunities.push(claim(value,id,active||ended?'VERIFIED':'UNVERIFIED'));
      }
      const total = block.match(/\btotal (?:disclosed )?(?:funding|raised)(?:\s+(?:is|of|to date|now|stands at|amounts to)){0,3}[:\s]+(\$\s?[\d,.]+\s?(?:million|billion|[MB])?\b)/i)?.[1];
      if (total && allowFunding(block) && !/valuation|TVL|market cap|target|plan|rumor|unconfirmed/i.test(block)) data.funding.totalKnown = idClaim(total);
      if(allowFunding(block) && /\b(raised|secured|closed)\b/i.test(block) && /\b(seed|series [a-f]|pre-seed|funding round)\b/i.test(block) && !/target|aim|plan|valuation|TVL|has not|have not|did not|didn't|rumor|unconfirmed|never raised|not raised/i.test(block)) {
        const amount=block.match(/\$\s?[\d,.]+\s?(?:million|billion|[MB])?\b/i)?.[0];
        if(amount && data.funding.rounds.length<4) data.funding.rounds.push(idClaim({announcementUrl:url,round:block.match(/pre-seed|seed|series [a-f]|funding round/i)[0],amount:idClaim(amount),date:block.match(/\b20\d{2}-\d{2}-\d{2}\b/)?idClaim(block.match(/\b20\d{2}-\d{2}-\d{2}\b/)[0]):unavailable(),leadInvestor: /led by\s+([A-Z][^.!;,]{2,80})/.test(block) ? idClaim(block.match(/led by\s+([A-Z][^.!;,]{2,80})/)[1].split(/ and /)[0].trim()) : unavailable(),investors: /(?:led by|investors include|participation from)\s+([A-Z][^.!;]{2,100})/.test(block) ? idClaim(block.match(/(?:led by|investors include|participation from)\s+([A-Z][^.!;]{2,100})/)[1].split(/,| and /).map(s=>s.trim()).filter(Boolean)) : unavailable()}));
      }
    }
  }
  if (queue.length && Date.now()-started >= LIMITS.total) issues.push('Official research budget exhausted; successful sources retained');
  if(data.similarProjects.length){data.originalitySignal={value:'Common model',verification:'INFERRED',evidenceIds:[...new Set(data.similarProjects.flatMap(c=>c.evidenceIds))]};data.originalityExplanation='Official product comparisons suggest a shared model; differentiation is not independently established.';}
  if(!evidence.length && !issues.length)issues.push('No usable official sources were discovered');
  Object.defineProperty(data,'opportunitiesBeforeDedupe',{value:data.opportunities.length});
  data.opportunities = dedupeOpportunities(data.opportunities);
  data.issues=[...new Set(issues)];return data;
}
export class RuntimeRepository {
  entries=new Map();
  get(identity) {const item=this.entries.get(identity);if(!item || item.expires<Date.now()){this.entries.delete(identity);return null;}return structuredClone(item.data);}
  put(identity,data,ttl = 3600000) {if(this.entries.size>=100)this.entries.delete(this.entries.keys().next().value);this.entries.set(identity,{data:structuredClone(data),expires:Date.now()+ttl});}
}
export const researchRepository=new RuntimeRepository();
// Per-process only: neither durable storage nor a distributed rate limiter.
export function createResearchProvider(repository = new RuntimeRepository(), research = researchProject) {
  const pending = new Map();
  return {async enrichProject(sourceUrl, {refresh = false} = {}) {
    const identity = projectIdentity(sourceUrl);
    const cached = repository.get(identity);
    if (cached && !refresh) return cached;
    if (pending.has(identity)) return pending.get(identity);
    if (pending.size >= 3) throw Error('Research is busy; please try again shortly');
    const work = research(sourceUrl).then(data => {repository.put(identity, data);return data;}).finally(() => pending.delete(identity));
    pending.set(identity, work);
    return work;
  }};
}
export const researchProvider = createResearchProvider(researchRepository);
