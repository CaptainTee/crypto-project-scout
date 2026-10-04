import { classificationService } from './classification.mjs';
import { createHash } from 'node:crypto';
import { fetchOfficial, fetchDiagnostic, normalizedUrl, parsePage } from '../scout/research.mjs';
import { configuredSearchProvider, providerDiagnostic } from '../scout/search.mjs';

export const RADAR_LIMITS = Object.freeze({ indexPages:3, articlePages:5, queries:2, results:3, timeout:4000, homepageTimeout:12000, searchTimeout:10000, total:30000, cooldown:60000 });
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,24);
export const normalizeHandle = value => /^@?[a-z0-9_]{1,15}$/i.test(value || '') ? value.replace(/^@/,'').toLowerCase() : null;
export function canonicalUrl(value) {
  const u = new URL(normalizedUrl(value));
  u.hostname = u.hostname.replace(/^www\./,'').replace(/^twitter\.com$/,'x.com');
  u.pathname = u.pathname.replace(/\/+$/,'') || '/';
  if (u.hostname === 'x.com') {u.pathname = u.pathname.toLowerCase();u.searchParams.delete('s');u.searchParams.delete('t');}
  return u.href;
}
export function ownsFrontRunPost(value) {
  try { const u = new URL(canonicalUrl(value)); return u.protocol === 'https:' && u.hostname === 'x.com' && /^\/frontrunvc\/status\/\d+$/.test(u.pathname) && !u.port; } catch { return false; }
}
const websiteOwned = value => { try {return new URL(value).protocol === 'https:' && /^(www\.)?frontrun\.vc$/.test(new URL(value).hostname);} catch {return false;} };
export function normalizeDate(value) {
  if (!value) return null;
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.isFinite(Date.parse(date)) && new Date(date).toISOString().startsWith(date) ? date : null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(date) && Number.isFinite(Date.parse(date))) return new Date(date).toISOString();
  if (/^[A-Z][a-z]+ \d{1,2},? \d{4}$/.test(date) && Number.isFinite(Date.parse(date + ' UTC'))) return new Date(date + ' UTC').toISOString().slice(0,10);
  return null;
}
/** Conservative explicit entries; never promotes ordinary editorial name mentions. */
export function parseDiscoveryText(text, provenance, links = []) {
  const segments = text.split(/(?=\bEARLY\s*:)|\s+\d+\.\s+(?=@)|[\n;·]/i).map(s=>s.trim()).filter(Boolean);
  return segments.flatMap(segment => {
    const early = /^EARLY\s*:\s*(?:@([\w]+)|([\w .&-]+?)(?=\s[-–—]|\s@|$))/i.exec(segment);
    const receipt = /^([A-Z][\w .&-]{1,70}?)\s+(?:raised|raises|secured|launched)\b/.exec(segment);
    const flag = /@([\w]+)\s+(?:[-–—]\s*)?flagged\b/i.exec(segment) || /\bfrontrun(?:vc)?\s+flagged\s+@([\w]+)/i.exec(segment);
    const numbered = /^@([\w]+)\s*[-–—]\s*\d+\s+days\s+ago\b/i.exec(segment);
    if (!early && !receipt && !flag && !numbered) return [];
    if (early?.[2] && /^\d+\b/.test(early[2])) return [];
    if (/\bstealth\b/i.test(early?.[2] || receipt?.[1] || '')) return [];
    const handle = normalizeHandle(early?.[1] || flag?.[1] || numbered?.[1] || /(?:project|company)\s*:?\s*@([\w]+)/i.exec(segment)?.[1]);
    const name = early?.[2]?.trim() || receipt?.[1]?.trim() || handle;
    if (!name || /^(?:we|they|it|he|she|today|now)$/i.test(name) || handle === 'frontrunvc' || (early?.[1] && !handle)) return [];
    const localLinks = links.filter(l=>segment.includes(l.label) && l.label.length > 2 && (ownsFrontRunPost(l.url) || /(?:official|project|company)?\s*website/i.test(l.label) || l.label.toLowerCase() === name.toLowerCase()));
    const urls = [...segment.matchAll(/https?:\/\/[^\s<>"')]+/g)].map(m=>m[0]).concat(localLinks.map(l=>l.url));
    const website = urls.flatMap(url=>{try {const u=canonicalUrl(url); const h=new URL(u).hostname; return !/(^|\.)(x\.com|frontrun\.vc|t\.co)$/.test(h) ? [u] : [];}catch{return [];}})[0] || null;
    const founders = /founders?\s*:?\s*([^.;]+?)(?=\s+(?:flagged|website|raised)|$)/i.exec(segment)?.[1] || '';
    const fundingText = segment.replace(/\s+\d+\s+days\s+(?:before|later|early|ago)\b/gi,'').replace(/\s+flagged\s+\d{4}-\d{2}-\d{2}/gi,'');
    const funding = /(?:raised|raises|secured)\s+(.+?)(?=\s+https?:\/\/|;|\.(?:\s|$)|$)/i.exec(fundingText)?.[0] || /\$[\d,.]+\s*[MBK]?\s+(?:pre-seed|seed|series\s+[A-Z])(?:\s+(?:led by|from)\s+[^.;]+)?/i.exec(fundingText)?.[0] || /\$[\d,.]+\s*[MBK]?\s+round(?:\s+led by\s+[^.;]+)?/i.exec(fundingText)?.[0] || null;
    const investorText = /(?:led by|from|investors?\s*:)\s+([^.;]+?)(?=\s+(?:flagged|website|https?:\/\/)|$)/i.exec(funding || '')?.[1];
    const flagDate = /flagged(?:\s+(?:on|at))?\s+(\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2},? \d{4})/.exec(segment)?.[1];
    const originating = urls.find(ownsFrontRunPost) || null;
    const evidence = {...provenance, eventId:hash(provenance.sourceUrl + ':' + segment), text:segment.slice(0,2000), originatingPostUrl:originating};
    return [{projectName:name, projectHandle:handle, projectWebsite:website, rawCategory:/\(([^()]+)\)/.exec(segment)?.[1] || null,
      rawDescription:segment, founderNames:founders.replace(/@[\w]+/g,'').replace(/[()]/g,'').split(/,| and /).map(s=>s.trim()).filter(Boolean),
      founderHandles:[...founders.matchAll(/@([\w]+)/g)].map(m=>normalizeHandle(m[1])).filter(Boolean),
      followerCount:segment.match(/([\d,]+)\s+followers/i) ? Number(segment.match(/([\d,]+)\s+followers/i)[1].replace(/,/g,'')) : null,
      fundingMention:funding, fundingAmount:/\$[\d,.]+\s*[MBK]?/i.exec(funding || '')?.[0]?.trim() || null,
      fundingRound:/\b(pre-seed|seed|series\s+[A-Z])\b/i.exec(funding || '')?.[0] || null,
      investors:investorText ? investorText.split(/,| and /).map(s=>s.trim()).filter(Boolean) : [],
      frontRunFlaggedAt:normalizeDate(flagDate), frontRunLeadTimeDays: Number(/(\d+)\s+days\s+(?:before|later|early|ago)/i.exec(segment)?.[1]) || null,
      evidence:[evidence], classificationStatus:'UNCLASSIFIED'}];
  });
}
export function normalizeDiscoveries(events) {
  const groups=[];
  for (const event of [...events].sort((a,b)=>(a.evidence[0].sourcePublishedAt || a.evidence[0].checkedAt).localeCompare(b.evidence[0].sourcePublishedAt || b.evidence[0].checkedAt) || a.evidence[0].sourceUrl.localeCompare(b.evidence[0].sourceUrl) || a.rawDescription.localeCompare(b.rawDescription))) {
    const keys=[];
    if(event.projectHandle) keys.push(`x:${normalizeHandle(event.projectHandle)}`);
    if(event.projectWebsite) keys.push(`website:${new URL(canonicalUrl(event.projectWebsite)).hostname}${new URL(canonicalUrl(event.projectWebsite)).pathname.replace(/\/$/,'')}`);
    const nameKey=`name:${event.projectName.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
    // Names alone are scoped to the exact source: similar names across sources cannot merge.
    if(!keys.length) keys.push(`${nameKey}:${event.evidence[0].sourceUrl}`);
    const matches=groups.filter(g=>g.identityKeys.some(k=>keys.includes(k)));
    let group=matches[0];
    if(!group) {group={...event,identityKeys:[],evidence:[]};groups.push(group);}
    for(const other of matches.slice(1)) {
      group.identityKeys.push(...other.identityKeys);group.evidence.push(...other.evidence);
      for(const key of ['projectWebsite','projectHandle','fundingMention','fundingAmount','fundingRound','rawCategory','followerCount','frontRunLeadTimeDays']) if(group[key]===null)group[key]=other[key];
      for(const key of ['founderNames','founderHandles','investors'])group[key]=[...new Set([...group[key],...other[key]])];
      if(other.frontRunFlaggedAt && (!group.frontRunFlaggedAt || other.frontRunFlaggedAt<group.frontRunFlaggedAt))group.frontRunFlaggedAt=other.frontRunFlaggedAt;
      groups.splice(groups.indexOf(other),1);
    }
    group.identityKeys=[...new Set([...group.identityKeys,...keys])].sort();
    for(const ev of event.evidence) if(!group.evidence.some(e=>e.sourceUrl===ev.sourceUrl && e.text===ev.text)) group.evidence.push(ev);
    for(const key of ['projectWebsite','projectHandle','fundingMention','fundingAmount','fundingRound','rawCategory','followerCount','frontRunLeadTimeDays']) if(group[key]===null) group[key]=event[key];
    for(const key of ['founderNames','founderHandles','investors']) group[key]=[...new Set([...group[key],...event[key]])];
    if(event.frontRunFlaggedAt && (!group.frontRunFlaggedAt || event.frontRunFlaggedAt<group.frontRunFlaggedAt)) group.frontRunFlaggedAt=event.frontRunFlaggedAt;
  }
  return groups.map(g=>{g.evidence.sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl)||a.text.localeCompare(b.text));const e=g.evidence[0]; return {...g,id:hash(g.identityKeys.find(k=>k.startsWith('x:')) || g.identityKeys[0]),source:e.source,sourceType:e.sourceType,sourceUrl:e.sourceUrl,sourcePublishedAt:e.sourcePublishedAt,discoveredAt:g.evidence.map(e=>e.checkedAt).sort()[0]};}).sort((a,b)=>a.id.localeCompare(b.id));
}
const pageCategory = error => {const code=fetchDiagnostic(error);return error?.message==='deadline' || code==='TIMEOUT' ? 'TIMEOUT' : code==='DNS_FAILURE' ? 'DNS' : code==='TLS_FAILURE' ? 'TLS' : code.startsWith('HTTP') ? 'HTTP' : /REDIRECT/.test(code) ? 'REDIRECT' : code==='CONTENT_TYPE' ? 'CONTENT_TYPE' : code==='SIZE_LIMIT' ? 'SIZE_LIMIT' : 'SAFETY_REJECTED';};
const diagnostic = () => ({status:'AVAILABLE',checkedAt:null,pagesRequested:0,pagesSuccessful:0,queriesAttempted:0,queriesSuccessful:0,resultsReturned:0,accepted:0,rejected:0,itemsFound:0,issues:[]});
const bounded = async (operation, timeout) => {let timer;try {return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),timeout);})]);}finally{clearTimeout(timer);}};
export function frontRunLink(value, base) {
  try {
    const url = new URL(normalizedUrl(new URL(value, base).href));
    if (!websiteOwned(url.href) || /\.[a-z0-9]{2,8}$/i.test(url.pathname) || /\/(?:privacy|terms|legal|assets|docs|login|signup)(?:\/|$)/i.test(url.pathname)) return null;
    if (!/^\/(?:blog|trending|startups|sectors|watchlists?|fundraises|receipts?|early|launch|flag|c)(?:\/|$)/i.test(url.pathname)) return null;
    url.hostname = 'www.frontrun.vc';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href;
  } catch { return null; }
}
export function parseFrontRunPage(html, url, provenance) {
  const passive = html.replace(/<\/?noscript\b[^>]*>/gi, '');
  const parsed = parsePage(passive, url);
  const post = parsed.links.find(l => ownsFrontRunPost(l.url))?.url;
  const links = post ? [...parsed.links, {url:post,label:'original post'}] : parsed.links;
  // Receipt sections bind explicit dates and funding to their own project heading.
  const sections = [...passive.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)];
  const sectionEvents = sections.flatMap(m => {
    const heading = m[1].replace(/<[^>]*>/g,' ').trim();
    if (!/^.+?:\s*\$[\d,.]+.*flagged/i.test(heading)) return [];
    const name = heading.split(':')[0].trim();
    const section = parsePage(`<p>${heading}</p>${m[2]}`, url);
    const handleLink = section.links.find(l => l.label.toLowerCase() === name.toLowerCase() && /^https:\/\/(?:x|twitter)\.com\/[^/]+\/?$/.test(l.url));
    const handle = handleLink ? new URL(handleLink.url).pathname.slice(1).replace(/\/$/,'') : null;
    const text = section.blocks.join(' ');
    const date = /flagged\s+([a-z]+ \d{1,2},? \d{4})/i.exec(text)?.[1];
    const explicitDate = date ? normalizeDate(date[0].toUpperCase()+date.slice(1)) : null;
    const funding = /(?:the round is (?:a |an )?)(\$.*?)(?=\.(?:\s|$)|$)/i.exec(text)?.[1] || heading.slice(heading.indexOf(':')+1).split(', flagged')[0].trim();
    return parseDiscoveryText(`EARLY: ${handle ? '@'+handle : name+' -'} ${funding} ${heading.match(/\d+ days (?:early|before)/i)?.[0] || ''}${explicitDate ? ' flagged '+explicitDate : ''}`,provenance,section.links).map(e=>({...e,projectName:name,rawDescription:text,evidence:e.evidence.map(ev=>({...ev,eventId:hash(provenance.sourceUrl+':'+text),text:text.slice(0,2000),originatingPostUrl:post ? canonicalUrl(post) : null}))}));
  });
  const events = parseDiscoveryText(parsed.blocks.join('\n'),provenance,links).map(e=>({...e,evidence:e.evidence.map(ev=>({...ev,originatingPostUrl:ev.originatingPostUrl || (post ? canonicalUrl(post) : null)}))}));
  // A receipt's full section supersedes its shorter embedded post entry.
  return {parsed,events:[...events.filter(e=>!sectionEvents.some(s=>s.projectHandle && s.projectHandle===e.projectHandle)),...sectionEvents]};
}
export class FrontRunWebsiteSource {
  id='frontrunWebsite';
  constructor(fetchPage=fetchOfficial) {this.fetchPage=fetchPage;}
  async discover({checkedAt,deadline}) {
    const d=diagnostic();d.checkedAt=checkedAt;const events=[];const queue=['https://www.frontrun.vc/'];const seen=new Set();let indices=0,articles=0;
    while(queue.length && Date.now()<deadline) {
      const rank = value => /\/(blog|fundraises|watchlists)\/?$/.test(new URL(value).pathname) ? 0 : /receipt|early|flag|fundrais|launch/i.test(value) ? 1 : /\/(trending|startups|sectors)\/?$/.test(new URL(value).pathname) ? 2 : 3;
      queue.sort((a,b)=>rank(a)-rank(b));
      const url=queue.shift();const key=canonicalUrl(url);if(seen.has(key))continue;
      const index=/^\/$|^\/(blog|trending|startups|sectors|watchlists|fundraises)\/?$/.test(new URL(url).pathname);
      if(index ? indices>=RADAR_LIMITS.indexPages : articles>=RADAR_LIMITS.articlePages)continue;
      seen.add(key);if(index)indices++;else articles++;d.pagesRequested++;
      const started=Date.now();const timeout=Math.max(1,Math.min(new URL(url).pathname==='/' ? RADAR_LIMITS.homepageTimeout : RADAR_LIMITS.timeout,deadline-started));
      const record=category=>(d.pages ||= []).push({path:new URL(url).pathname,timeout,elapsed:Date.now()-started,category});
      try {const page=await bounded(()=>this.fetchPage(url,{timeout}),timeout);
        if(!websiteOwned(page.url))throw Error('Unsafe source URL');record('SUCCESS');d.pagesSuccessful++;const parsed=parsePage(page.html.replace(/<\/?noscript\b[^>]*>/gi,''),page.url);
        if(!parsed.blocks.length && !parsed.links.length)d.issues.push('FrontRun page has no usable passive public content');
        const published=normalizeDate(/<time\b[^>]*datetime=["']([^"']+)/i.exec(page.html)?.[1] || /property=["']article:published_time["'][^>]*content=["']([^"']+)/i.exec(page.html)?.[1]);
        const provenance={sourceId:this.id,source:'FrontRun Website',sourceType:'WEBSITE',sourceUrl:canonicalUrl(page.url),sourceTitle:parsed.title,sourcePublishedAt:published,checkedAt,verification:'FETCH_VERIFIED'};
        const found=parseFrontRunPage(page.html,page.url,provenance).events;
        events.push(...found);
        const countField=new URL(url).pathname==='/' ? 'homepageDiscoveries' : index ? 'indexDiscoveries' : 'articleReceiptDiscoveries';
        d[countField]=(d[countField] || 0)+found.length;
        // Only public indices supply links: no recursive article crawl.
        if(index) for(const link of parsed.links) {const target=frontRunLink(link.url,page.url);if(target && !seen.has(canonicalUrl(target)) && !queue.includes(target) && queue.length<24)queue.push(target);}
      }catch(error){record(pageCategory(error));d.issues.push(`FrontRun website page unavailable (${fetchDiagnostic(error)})`);}
    }
    if(queue.length && Date.now()>=deadline)d.issues.push('FrontRun website refresh deadline reached');
    d.projectIdentities=normalizeDiscoveries(events).length;d.duplicateMerges=events.length-d.projectIdentities;
    d.itemsFound=events.length;d.status=d.issues.length ? (d.pagesSuccessful?'PARTIAL':'UNAVAILABLE'):'AVAILABLE';return {events,diagnostics:d};
  }
}
export class FrontRunXSource {
  id='frontrunX';
  constructor(provider=configuredSearchProvider().provider) {this.provider=provider;}
  async discover({checkedAt,deadline}) {
    const d=diagnostic();d.checkedAt=checkedAt;const events=[];
    if(!this.provider) {d.status='NOT_CONFIGURED';return {events,diagnostics:d};}
    for(const query of ['site:x.com/frontrunvc/status "EARLY"','site:x.com/frontrunvc/status "raised"']) {
      if(Date.now()>=deadline){d.issues.push('FrontRun X budget/deadline exhausted');break;}d.queriesAttempted++;
      try {const results=await bounded(()=>this.provider.search(query,{maxResults:RADAR_LIMITS.results,timeout:Math.min(RADAR_LIMITS.searchTimeout,deadline-Date.now())}),Math.max(1,Math.min(RADAR_LIMITS.searchTimeout,deadline-Date.now())));d.queriesSuccessful++;
        for(const result of results.slice(0,RADAR_LIMITS.results)) {d.resultsReturned++;if(!ownsFrontRunPost(result.url)){d.rejected++;continue;}d.accepted++;
          (d.statusDiscoveries ||= []).push({sourceUrl:canonicalUrl(result.url),sourceTitle:result.title,snippet:result.snippet || '',sourcePublishedAt:normalizeDate(result.publishedAt),checkedAt,verification:'UNVERIFIED',evidenceKind:'DISCOVERY_ONLY'});
          events.push(...parseDiscoveryText([result.title,result.snippet].filter(Boolean).join(' '),{sourceId:this.id,source:'FrontRun X',sourceType:'X',sourceUrl:canonicalUrl(result.url),sourceTitle:result.title,sourcePublishedAt:normalizeDate(result.publishedAt),checkedAt,verification:'UNVERIFIED',evidenceKind:'DISCOVERY_ONLY',provider:'tavily'}));
        }
      }catch(error){d.issues.push(`FrontRun X search unavailable (${error.message==='deadline'?'TIMEOUT':providerDiagnostic(error).code})`);}
    }
    d.itemsFound=events.length;d.status=d.issues.length?(d.queriesSuccessful?'PARTIAL':'UNAVAILABLE'):'AVAILABLE';return {events,diagnostics:d};
  }
}
export function createRadarService({adapters=[new FrontRunWebsiteSource(),new FrontRunXSource()],now=()=>new Date(),cooldown=RADAR_LIMITS.cooldown}={}) {
  let cache={discoveries:[],sources:{},refreshedAt:null,issues:[],counts:{rawEvents:0,projectIdentities:0,duplicateMerges:0}};let pending=null;let lastAttempt=0;const storedEvents=new Map();
  const view=()=>({...structuredClone(cache),discoveries:cache.discoveries.map(d=>{const result=classificationService.peek(d);return {...structuredClone(d),...result,classificationStatus:result.classification.status};})});
  let latestEvents=[];
  return {get:view,latestEvents:()=>structuredClone(latestEvents),refresh() {
    if(pending)return pending;
    if(lastAttempt && Date.now()-lastAttempt<cooldown)return Promise.resolve(view());
    lastAttempt=Date.now();
    pending=(async()=>{const checkedAt=now().toISOString();const deadline=Date.now()+RADAR_LIMITS.total;
      const results=await Promise.all(adapters.map(async adapter=>{try{return {id:adapter.id,...await bounded(()=>adapter.discover({checkedAt,deadline}),RADAR_LIMITS.total)};}catch{return {id:adapter.id,events:[],diagnostics:{...diagnostic(),checkedAt,status:'UNAVAILABLE',issues:['Radar source unavailable']}};}}));
      for(const r of results) if(r.diagnostics.statusDiscoveries || cache.sources[r.id]?.statusDiscoveries) {
        const previous=cache.sources[r.id]?.statusDiscoveries || [];
        const retained=new Map(previous.map(e=>[e.sourceUrl,e]));
        for(const e of r.diagnostics.statusDiscoveries || [])retained.set(e.sourceUrl,{...e,checkedAt:retained.get(e.sourceUrl)?.checkedAt || e.checkedAt,lastCheckedAt:checkedAt});
        r.diagnostics.statusDiscoveries=[...retained.values()];
      }
      const events=results.flatMap(r=>r.events);latestEvents=structuredClone(events);const discoveries=normalizeDiscoveries(events);
      // Keep source events across explicit refreshes, including first retrieval precision.
      for(const event of events) {
        const evidence=event.evidence[0];const key=evidence.eventId || hash(evidence.sourceUrl + ':' + evidence.text);
        const previous=storedEvents.get(key);
        storedEvents.set(key,{...event,evidence:[{...evidence,checkedAt:previous?.evidence[0].checkedAt || evidence.checkedAt,lastCheckedAt:checkedAt}]});
      }
      cache={discoveries:normalizeDiscoveries([...storedEvents.values()]),sources:Object.fromEntries(results.map(r=>[r.id,r.diagnostics])),refreshedAt:checkedAt,issues:results.flatMap(r=>r.diagnostics.issues),counts:{rawEvents:events.length,projectIdentities:discoveries.length,duplicateMerges:events.length-discoveries.length}};
      return view();
    })().finally(()=>{pending=null;});return pending;
  }};
}
const runtimeKey=Symbol.for('captainscout.radar.phase6a');
export const radarService=globalThis[runtimeKey] ||= createRadarService();
