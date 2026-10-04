import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

export const LIMITS = { pages: 6, bytes: 512 * 1024, redirects: 3, timeout: 4000, total: 24000 };
const unavailable = () => ({ verification: 'UNAVAILABLE', value: null, evidenceIds: [] });
const claim = (value, id, verification = 'VERIFIED') => ({ value, verification, evidenceIds: [id] });
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a >= 224 || a === 198 && (b === 18 || b === 19));
  }
  // Only global-unicast IPv6; mapped IPv4, local, multicast and transition ranges rejected.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address);
}
export function normalizedUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['','80','443'].includes(url.port) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw Error('Unsafe source URL');
  if (isIP(url.hostname.replace(/[\[\]]/g,'')) && !publicAddress(url.hostname.replace(/[\[\]]/g,''))) throw Error('Unsafe source URL');
  url.hash = ''; url.search = ''; url.hostname = url.hostname.toLowerCase();
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
  for (let redirects = 0; redirects <= LIMITS.redirects; redirects++) {
    const url = new URL(current);
    const addresses = await Promise.race([resolve(url.hostname, {all:true}), new Promise((_,reject) => { const t=setTimeout(()=>reject(Error('Research timed out')),timeout);t.unref?.(); })]);
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw Error('Unsafe source address');
    const address = addresses[0];
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
      const timer=setTimeout(()=>req.destroy(Error('Research timed out')),timeout);
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
  const blocks=[...sanitized.matchAll(/<(?:p|li|h[1-4])\b[^>]*>([\s\S]*?)<\/(?:p|li|h[1-4])>/gi)].map(m=>clean(m[1])).filter(s=>s.length>15 && s.length<700);
  const links=[];
  for(const m of sanitized.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {const target=normalizedUrl(new URL(m[1].replace(/&amp;/g,'&'),url).href); links.push({url:target,label:clean(m[2]).slice(0,100)});}catch{}
  }
  return {title,blocks:[...new Set(blocks)],links};
}
export async function researchProject(sourceUrl, {fetchPage = fetchOfficial, now = new Date()} = {}) {
  const checked=now.toISOString();const issues=[];const evidence=[];
  const data={schemaVersion:1,sourceUrl,identity:projectIdentity(sourceUrl),featuresAndServices:[],similarProjects:[],originalitySignal:unavailable(),originalityExplanation:'Insufficient evidence to assess differentiation.',opportunities:[],funding:{totalKnown:unavailable(),rounds:[]},evidence,lastUpdated:checked,researchedAt:checked,sourceCheckedAt:checked,staleAfter:new Date(+now+86400000).toISOString(),opportunitiesStaleAfter:new Date(+now+3600000).toISOString(),issues};
  const queue=[normalizedUrl(sourceUrl)];const visited=new Set();let rootOrigin;const started=Date.now();
  while(queue.length && visited.size<LIMITS.pages && Date.now()-started<LIMITS.total) {
    const requested=queue.shift();if(visited.has(requested))continue;visited.add(requested);
    let page;
    try {page=await fetchPage(requested, {timeout: Math.min(LIMITS.timeout, Math.max(1, (LIMITS.total-(Date.now()-started))/8))});}catch(e){issues.push(e.message?.startsWith('Unsafe')?'Source rejected by public-network safety checks': /^(Research timed out|Official website blocked automated access|Social source could not be accessed|No usable official source content|Official source exceeded (research size|redirect) limit)$/.test(e.message || '') ? e.message : /^(x\.com|twitter\.com)$/.test(new URL(requested).hostname) ? 'Social source could not be accessed' : 'Official source could not be accessed');continue;}
    const url=normalizedUrl(page.url);if(evidence.some(e=>e.url===url))continue;
    if(!rootOrigin) rootOrigin=new URL(url).origin;
    const parsed=parsePage(page.html,url);if(!parsed.blocks.length){issues.push('No usable official sources were discovered');continue;}
    const id=`source-${evidence.length+1}`;evidence.push({id,url,name:parsed.title,domain:new URL(url).hostname,checkedAt:checked,verification:'VERIFIED'});
    // Only direct links from the submitted landing page; never recursively crawl external sites.
    if(visited.size===1) for(const link of parsed.links) {
      const same=new URL(link.url).origin===rootOrigin;
      if(same || /\b(docs|documentation|blog|news|github|twitter|testnet|waitlist|campaign)\b/i.test(link.label) || /^(?:[^.]+\.)?(github\.com|x\.com|twitter\.com)$/.test(new URL(link.url).hostname)) { if(queue.length<LIMITS.pages*2)queue.push(link.url); }
    }
    for(const block of parsed.blocks) {
      const idClaim= s=>claim(s,id);
      // Extract bounded, attributed factual clauses. Heuristic results are inferred, never treated as independent verification.
      if(/\b(provides?|offers?|enables?|supports?|build|platform|protocol|service|product)\b/i.test(block) && data.featuresAndServices.length<12) {
        const description=block.split(/[.!?]\s/)[0].split(/\s+/).slice(0,24).join(' ').replace(/^(Our|We|The project)\s+/i,'').replace(/\bwe\b/gi,'the project');
        if(!data.featuresAndServices.some(c=>c.value.description===description)) data.featuresAndServices.push(claim({title: /\b(API|SDK|wallet|bridge|payments|staking|rollup|storage|trading|lending)\b/i.exec(block)?.[0] || 'Product capability',description:`Reported capability: ${description}`,availability:/coming soon|plan to|will launch|announc/i.test(block)?'Announced':'Offered',targetUsers: /\bfor (developers|enterprises|institutions|traders|users|creators|validators|businesses)\b/i.test(block) ? claim(block.match(/\bfor (developers|enterprises|institutions|traders|users|creators|validators|businesses)\b/i)[1],id,'INFERRED') : unavailable()},id,'INFERRED'));
      }
      for (const link of parsed.links) {
        if (/\b(compared to|alternative to|similar to|unlike)\b/i.test(block) && link.label.length > 2 && block.includes(link.label) && new URL(link.url).origin !== rootOrigin && !/docs|blog|twitter|github/i.test(link.label)) {
          if (!data.similarProjects.some(c=>c.value.url===link.url) && data.similarProjects.length<4) data.similarProjects.push(claim({name:link.label,url:link.url,similarity:'The official project source explicitly compares its product with this project.',differentiators:'No independently verified differentiator established.'},id,'INFERRED'));
        }
      }
      const kind=/\b(testnet|waitlist|points program|campaign|ambassador|quest|early access|validator|node participation|incentive program)\b/i.exec(block)?.[0];
      if(kind && data.opportunities.length<8) {
        const date=block.match(/(?:deadline|ends|until|closes)(?:\s+on)?[:\s]+(20\d{2}-\d{2}-\d{2})/i)?.[1];
        const deadline=date && Number.isFinite(Date.parse(date)) && /deadline|ends|until|closes/i.test(block)?new Date(date+'T23:59:59Z').toISOString():undefined;
        const ended=/closed|ended|expired|concluded|no longer/i.test(block) || deadline && Date.parse(deadline)<+now;
        // Require explicit present-tense availability AND a future deadline to label Active.
        const active=!ended && deadline && /\b(join now|open now|currently open|registration is open|live now)\b/i.test(block);
        const link=parsed.links.find(l=>new URL(l.url).origin===new URL(url).origin && new RegExp(kind.replace(/ /g,'|'),'i').test(l.label+' '+l.url));
        const value={title:kind,type:/testnet/i.test(kind)?'Testnet':/waitlist|early access/i.test(kind)?'Waitlist':/points/i.test(kind)?'Points program':/ambassador/i.test(kind)?'Ambassador/community program':/node|validator/i.test(kind)?'Node opportunity':active?'Active campaign':'Other',status:ended?'Ended':active?'Active':'Unknown',description:`Official source mentions ${kind}; ${ended?'participation has ended':active?'dated registration is open':'current participation is not confirmed'}.`,participationUrl:link?.url || url,sourceUrl:url,lastChecked:checked,...(deadline?{deadline}:{})};
        if(!data.opportunities.some(c=>c.value.title===kind && c.value.sourceUrl===url))data.opportunities.push(claim(value,id,active||ended?'VERIFIED':'UNVERIFIED'));
      }
      if(/\b(raised|secured|closed)\b/i.test(block) && /\b(seed|series [a-f]|pre-seed|funding round)\b/i.test(block) && !/target|aim|plan|valuation|TVL|has not|have not|did not|didn't|rumor|unconfirmed|never raised|not raised/i.test(block)) {
        const amount=block.match(/\$\s?[\d,.]+\s?(?:million|billion|[MB])?\b/i)?.[0];
        if(amount && data.funding.rounds.length<4) data.funding.rounds.push(idClaim({announcementUrl:url,round:block.match(/pre-seed|seed|series [a-f]|funding round/i)[0],amount:idClaim(amount),date:block.match(/\b20\d{2}-\d{2}-\d{2}\b/)?idClaim(block.match(/\b20\d{2}-\d{2}-\d{2}\b/)[0]):unavailable(),investors: /(?:led by|investors include|participation from)\s+([A-Z][^.!;]{2,100})/.test(block) ? idClaim(block.match(/(?:led by|investors include|participation from)\s+([A-Z][^.!;]{2,100})/)[1].split(/,| and /).map(s=>s.trim()).filter(Boolean)) : unavailable()}));
      }
    }
  }
  if(data.similarProjects.length){data.originalitySignal={value:'Common model',verification:'INFERRED',evidenceIds:[...new Set(data.similarProjects.flatMap(c=>c.evidenceIds))]};data.originalityExplanation='Official product comparisons suggest a shared model; differentiation is not independently established.';}
  if(!evidence.length && !issues.length)issues.push('No usable official sources were discovered');
  data.issues=[...new Set(issues)];return data;
}
export class RuntimeRepository {
  entries=new Map();
  get(identity) {const item=this.entries.get(identity);if(!item || item.expires<Date.now()){this.entries.delete(identity);return null;}return structuredClone(item.data);}
  put(identity,data) {if(this.entries.size>=100)this.entries.delete(this.entries.keys().next().value);this.entries.set(identity,{data:structuredClone(data),expires:Date.now()+3600000});}
}
export const researchRepository=new RuntimeRepository();
// Per-process only: neither durable storage nor a distributed rate limiter.
export function createResearchProvider(repository = new RuntimeRepository(), research = researchProject) {
  const pending = new Map();
  return {async enrichProject(sourceUrl) {
    const identity = projectIdentity(sourceUrl);
    const cached = repository.get(identity);
    if (cached) return cached;
    if (pending.has(identity)) return pending.get(identity);
    if (pending.size >= 3) throw Error('Research is busy; please try again shortly');
    const work = research(sourceUrl).then(data => {repository.put(identity, data);return data;}).finally(() => pending.delete(identity));
    pending.set(identity, work);
    return work;
  }};
}
export const researchProvider = createResearchProvider(researchRepository);
