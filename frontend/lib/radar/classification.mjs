import { createHash } from 'node:crypto';
import { fetchOfficial, parsePage, projectIdentity, researchRepository } from '../scout/research.mjs';
import { configuredSearchProvider } from '../scout/search.mjs';

export const CLASSIFICATION_LIMITS = Object.freeze({batch:5, pages:2, queries:1, results:3, timeout:4000, ttl:3600000, entries:100, concurrency:1});
export const emptyClassification = () => ({status:'UNCLASSIFIED',confidence:null,reason:'Required product evidence unavailable',cryptoSignals:[],networks:[],evidenceIds:[],classifiedAt:null,sourceCoverage:{frontrun:false,officialProject:false,broaderWeb:false},needsReview:true,tokenStatus:'UNKNOWN'});
const hash = text => createHash('sha256').update(text).digest('hex').slice(0,24);
const rules = [
  ['PRODUCT_BLOCKCHAIN','STRONG', /\b(?:uses?|using|built on|powered by|deploy(?:ed|s)? on|runs? on|records? on|settles? on)\b.{0,70}\b(?:blockchain|onchain|on-chain|Ethereum|Solana|Arbitrum|Bitcoin|Polygon|Optimism|Avalanche|Celestia|Starknet)\b/i],
  ['BASE_PRODUCT','STRONG', /\b(?:use|uses|using|built on|deploys? on|deployed on|records? on) Base\b/],
  ['EXECUTION','STRONG', /\b(?:smart contracts?|onchain settlement|on-chain settlement|stablecoin (?:settlement|payments?|payment rails)|staking mechanism|restaking|tokenized (?:assets|capital markets)|blockchain[- ]based provenance|verifiable onchain records)\b/i],
  ['WALLET','STRONG', /\b(?:wallet (?:required|connect|connection)|connect (?:your |a )?wallet)\b/i],
  ['ZK_PRODUCT','STRONG', /\b(?:ZK|zero[- ]knowledge) proofs?\b.{0,60}\b(?:verif|product|compute|computation|privacy|proof)/i],
  ['NETWORK_PRODUCT','STRONG', /\bdecentralized (?:network|nodes?)\b.{0,60}\b(?:participat|operat|incentiv|compute|provid)/i],
  ['TOKEN_PRODUCT','STRONG', /\b(?:token incentives|governance token|token (?:powers|secures|is required|is integral))\b/i],
  ['FUTURE_PRODUCT','MEDIUM', /\b(?:roadmap|plans?|will|coming soon|announc|testnet|waitlist)\b.{0,90}\b(?:blockchain|onchain|on-chain|token|wallet|chain integration|stablecoin)/i],
  ['CUSTODY_PRODUCT','MEDIUM', /\bself[- ]custodial (?:global )?accounts\b/i],
  ['UNCLEAR_SUPPORT','MEDIUM', /\b(?:wallet|onchain|on-chain) support\b/i],
  ['TESTNET','MEDIUM', /\btestnet\b/i],
  ['EARLY_TOKEN','MEDIUM', /\btoken\b.{0,40}\b(?:coming soon|planned|announced|waitlist)/i],
  ['MARKETING','WEAK', /\b(?:web3|decentralized AI|decentralized|blockchain skills|crypto conference|NFT campaign)\b/i],
];
const excluded = /\b(?:investors?|funded by|raised|cap table|previously worked|formerly|ex[- ](?:coinbase|binance)|founder background|merchandise|merch|marketing campaign|follows crypto|attended|partner is|partnership with)\b/i;
const networkPatterns = [['Ethereum',/\bethereum\b/i],['Base',/\b(?:on|use|using|uses|via|network|chain) Base\b|\bBase (?:network|chain|trajectory|mainnet|testnet)\b/i],['Arbitrum',/\barbitrum\b/i],['Solana',/\bsolana\b/i],['Bitcoin',/\bbitcoin\b/i],['Polygon',/\bpolygon\b/i],['Optimism',/\boptimism\b/i],['Avalanche',/\bavalanche\b/i],['Celestia',/\bcelestia\b/i],['Starknet',/\bstarknet\b/i]];
export function classifyEvidence(sources, {identitySafe=true, now=new Date()}={}) {
  const evidence=[]; const coverage={frontrun:false,officialProject:false,broaderWeb:false}; let stale=false; let negative=false;
  for(const source of sources) {
    if(!source.snippet?.trim())continue;
    const verified=source.verification==='VERIFIED';

    const old=!Number.isFinite(Date.parse(source.checkedAt)) || now.getTime()-Date.parse(source.checkedAt)>CLASSIFICATION_LIMITS.ttl;
    stale ||= old;
    if(verified && !old)coverage[source.sourceType==='FRONTRUN'?'frontrun':source.sourceType==='OFFICIAL'?'officialProject':'broaderWeb']=true;
    for(const sentence of source.snippet.split(/(?<=[.!?])\s+|\n/).slice(0,100)) {
      const context=excluded.test(sentence);
      const neg=/\b(?:no|not|without|doesn't|does not)\b.{0,35}\b(?:blockchain|crypto|token|wallet|onchain|smart contract)/i.test(sentence);negative ||= neg;
      const matches=neg?[]:rules.filter(([, ,pattern])=>pattern.test(sentence));
      const signals=context?[]:matches;
      const future=/\b(?:roadmap|plans? to|will|coming soon|future|waitlist)\b/i.test(sentence);
      const strength=future && signals.some(s=>s[1]==='STRONG')?'MEDIUM':signals.some(s=>s[1]==='STRONG')?'STRONG':signals.some(s=>s[1]==='MEDIUM')?'MEDIUM':signals.length?'WEAK':'NONE';
      if(evidence.some(e=>e.id===hash(source.sourceUrl+sentence)))continue;
      evidence.push({...source,id:hash(source.sourceUrl+sentence),snippet:sentence.slice(0,700),signalType:context?'CONTEXT_ONLY':signals.map(s=>s[0]).join(',') || (neg?'NEGATIVE':'NO_SIGNAL'),signalStrength:strength,stale:old});
    }
  }
  const usable=evidence.filter(e=>!e.stale && e.verification==='VERIFIED');
  const strong=usable.filter(e=>e.signalStrength==='STRONG');
  const medium=usable.filter(e=>e.signalStrength==='MEDIUM');
  const possible=evidence.filter(e=>e.signalStrength!=='NONE');
  const independent=new Set(medium.map(e=>new URL(e.sourceUrl).hostname)).size;
  let status='UNCLASSIFIED', confidence=null, reason='Required product evidence unavailable';
  if(identitySafe && (strong.length || independent>=2)) {status='CRYPTO_RELEVANT';confidence=strong.some(e=>e.sourceType==='OFFICIAL')?94:80;reason=`Verified product evidence: ${[...new Set((strong.length?strong:medium).map(e=>e.signalType))].join(', ')}`;}
  else if(possible.length) {status='POSSIBLY_CRYPTO';confidence=medium.length?60:40;reason=`Crypto indications (${[...new Set(possible.map(e=>e.signalType))].join(', ')}) need stronger or current product evidence`;}
  else if(identitySafe && coverage.frontrun && coverage.officialProject && usable.filter(e=>e.sourceType==='OFFICIAL').reduce((n,e)=>n+e.snippet.length,0)>=180) {status='NON_CRYPTO';confidence=15;reason='FrontRun and substantive official product coverage contain no meaningful crypto signal';}
  if(!identitySafe){status='UNCLASSIFIED';confidence=null;reason='Project identity is ambiguous; no name-only identity resolution';}
  const relevant=usable.filter(e=>['STRONG','MEDIUM'].includes(e.signalStrength));
  const networks=[...new Set(relevant.flatMap(e=>networkPatterns.filter(([,p])=>p.test(e.snippet)).map(([name])=>name)))];
  const tokenText=usable.filter(e=>e.signalStrength!=='NONE').map(e=>e.snippet).join(' ');
  const tokenStatus=/\btoken\b.{0,30}\b(?:live|launched|mainnet)/i.test(tokenText)?'LIVE':/\btoken\b.{0,30}\bannounced/i.test(tokenText)?'ANNOUNCED':/\btoken\b.{0,30}\b(?:planned|coming soon|waitlist)/i.test(tokenText)?'PLANNED':usable.length?'NO_TOKEN_EVIDENCE':'UNKNOWN';
  return {classification:{status,confidence,reason,cryptoSignals:[...new Set(possible.map(e=>e.signalType))],networks,evidenceIds:evidence.map(e=>e.id),classifiedAt:status==='UNCLASSIFIED'?null:now.toISOString(),sourceCoverage:coverage,needsReview:status==='UNCLASSIFIED'||status==='POSSIBLY_CRYPTO'||stale||negative&&possible.length>0||!coverage.officialProject,tokenStatus},evidence};
}

export function resolveClassificationIdentity(discovery) {
  if(discovery.projectWebsite || discovery.projectHandle)return {website:discovery.projectWebsite || null,handle:discovery.projectHandle || null};
  // Explicit project flag claims in retained FrontRun evidence are identity anchors, not name guesses.
  const handles=[...new Set((discovery.evidence || []).filter(e=>e.verification==='FETCH_VERIFIED').flatMap(e=>[...e.text.matchAll(/\bfrontrunvc\s+flagged\s+@([a-z0-9_]{1,15})\b/gi)].map(m=>m[1].toLowerCase())))];
  return {website:null,handle:handles.length===1?handles[0]:null};
}
export async function collectClassificationEvidence(discovery, {fetchPage=fetchOfficial, provider=configuredSearchProvider().provider, now=new Date(), refresh=false}={}) {
  const identity=resolveClassificationIdentity(discovery);
  discovery={...discovery,projectHandle:identity.handle,projectWebsite:identity.website};
  const checkedAt=now.toISOString();
  const sources=(discovery.evidence || []).map(e=>({sourceType:'FRONTRUN',sourceUrl:e.sourceUrl,title:e.sourceTitle,snippet:e.text,provider:e.provider || 'frontrun',verification:e.verification==='FETCH_VERIFIED'?'VERIFIED':'UNVERIFIED',checkedAt:e.lastCheckedAt || e.checkedAt}));
  if(classifyEvidence(sources,{now}).classification.status==='CRYPTO_RELEVANT')return sources;
  // A handle anchors only exact project-owned X search. Search snippets never establish an official website.
  if(!discovery.projectWebsite) {
    if(discovery.projectHandle && provider)try {
      const results=await provider.search(`site:x.com/${discovery.projectHandle} "${discovery.projectHandle}"`,{maxResults:3,timeout:4000});
      for(const r of results.slice(0,3)) {const u=new URL(r.url);if(/^(x|twitter)\.com$/.test(u.hostname)&&u.pathname.split('/')[1]?.toLowerCase()===discovery.projectHandle.toLowerCase())sources.push({sourceType:'PROJECT_X',sourceUrl:r.url,title:r.title,snippet:r.snippet,provider:r.provider,verification:'UNVERIFIED',checkedAt});}
    }catch { /* Missing search coverage cannot imply non-crypto. */ }
    return sources;
  }
  const website=discovery.projectWebsite;
  const cached=!refresh && researchRepository.get(projectIdentity(website));
  if(cached?.evidence?.length) {
    for(const e of cached.evidence) if(e.snippet && new URL(e.url).hostname===new URL(website).hostname)sources.push({sourceType:'OFFICIAL',sourceUrl:e.url,title:e.name,snippet:e.snippet,provider:'official-cache',verification:e.verification==='VERIFIED'?'VERIFIED':'UNVERIFIED',checkedAt:e.checkedAt});
    if(sources.some(e=>e.sourceType==='OFFICIAL'))return sources;
  }
  try {
    const page=await fetchPage(website,{timeout:4000});
    if(new URL(page.url).hostname.replace(/^www\./,'')!==new URL(website).hostname.replace(/^www\./,''))return sources;
    const parsed=parsePage(page.html,page.url);
    sources.push({sourceType:'OFFICIAL',sourceUrl:page.url,title:parsed.title,snippet:parsed.blocks.join('\n'),provider:'official',verification:'VERIFIED',checkedAt});
    if(classifyEvidence(sources,{now}).classification.status!=='CRYPTO_RELEVANT') {
      const docs=parsed.links.find(l=>new URL(l.url).origin===new URL(page.url).origin && /docs|technical|protocol|product/i.test(l.label+' '+new URL(l.url).pathname) && l.url!==page.url);
      if(docs)try {const p=await fetchPage(docs.url,{timeout:4000});if(new URL(p.url).origin===new URL(page.url).origin){const d=parsePage(p.html,p.url);sources.push({sourceType:'OFFICIAL',sourceUrl:p.url,title:d.title,snippet:d.blocks.join('\n'),provider:'official',verification:'VERIFIED',checkedAt});}}catch { /* Keep earlier evidence. */ }
    }
  }catch { /* Keep discoveries on source failure. */ }
  if(provider && classifyEvidence(sources,{now}).classification.status!=='CRYPTO_RELEVANT')try {
    const host=new URL(website).hostname;
    const results=await provider.search(`"${host}" "${discovery.projectHandle || host}" blockchain product`,{maxResults:3,timeout:4000});
    for(const r of results.slice(0,3)) if(r.snippet?.includes(host))sources.push({sourceType:'WEB',sourceUrl:r.url,title:r.title,snippet:r.snippet,provider:r.provider || 'search',verification:'UNVERIFIED',checkedAt});
  }catch { /* Secondary discovery failures do not remove official evidence. */ }
  return sources;
}
export function createClassificationService({collect=collectClassificationEvidence,now=()=>new Date()}={}) {
  const cache=new Map();let pending=null;
  const key=d=>[...d.identityKeys].sort().join('|');
  const fingerprint=d=>hash(JSON.stringify([d.projectWebsite,d.projectHandle,d.evidence]));
  function peek(d) {const entry=cache.get(key(d));if(!entry)return {classification:emptyClassification(),classificationEvidence:[],classificationCache:{status:'MISS',expiresAt:null}};const result=structuredClone(entry.result);
    if(entry.expires<=now().getTime() || entry.fingerprint!==fingerprint(d))result.classification.needsReview=true;
    return {...result,classificationCache:{status:entry.expires>now().getTime()&&entry.fingerprint===fingerprint(d)?'FRESH':'STALE',expiresAt:new Date(entry.expires).toISOString()}};}
  return {peek, async batch(discoveries,{refresh=false}={}) {
    if(!Array.isArray(discoveries)||!discoveries.length||discoveries.length>5)throw Error('Batch requires 1–5 discoveries');
    if(pending)throw Error('Classification is busy');
    pending=true;
    try {const results=[];for(const d of discoveries) {
      const previous=peek(d);
      if(!refresh&&previous.classificationCache.status==='FRESH'){results.push({id:d.id,status:'CACHED',...previous});continue;}
      try {const sources=await collect(d,{now:now(),refresh});const result=classifyEvidence(sources,{now:now(),identitySafe:Boolean(resolveClassificationIdentity(d).website || resolveClassificationIdentity(d).handle)});
        if(result.classification.status==='UNCLASSIFIED' && previous.classification.status!=='UNCLASSIFIED') {
          cache.get(key(d)).expires=0;
          results.push({id:d.id,status:'FAILED',error:'Required evidence unavailable; earlier classification retained',...peek(d)});
          continue;
        }
        const stored={classification:result.classification,classificationEvidence:result.evidence};
        if(cache.size>=100&&!cache.has(key(d)))cache.delete(cache.keys().next().value);
        cache.set(key(d),{result:stored,fingerprint:fingerprint(d),expires:now().getTime()+CLASSIFICATION_LIMITS.ttl});results.push({id:d.id,status:'CLASSIFIED',...peek(d)});
      }catch {results.push({id:d.id,status:'FAILED',error:'Classification evidence unavailable',...previous});}
    }return {results,limits:CLASSIFICATION_LIMITS};}finally{pending=null;}
  }};
}
export const classificationService=globalThis[Symbol.for('captainscout.radar.phase6b')] ||= createClassificationService();
