export const LABELS = {CRYPTO_RELEVANT:'Crypto Relevant',POSSIBLY_CRYPTO:'Possibly Crypto',NON_CRYPTO:'Non-Crypto',UNCLASSIFIED:'Unclassified'};
export const statusOf = d => d.classification?.status || d.classificationStatus || 'UNCLASSIFIED';
export function safeUrl(value) {try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const validHandle = value => typeof value === 'string' && /^@?[a-zA-Z0-9_]{1,15}$/.test(value);
const normalizeHandle = value => '@' + value.replace(/^@/, '').toLowerCase();
// Host boundaries prevent lookalike suffixes from being treated as trusted providers.
const thirdPartyHost = host => /(^|\.)(frontrun\.vc|x\.com|twitter\.com|t\.co|bing\.com|duckduckgo\.com|search\.yahoo\.com|medium\.com|substack\.com|mirror\.xyz|coindesk\.com|cointelegraph\.com|decrypt\.co|theblock\.co|cryptoslate\.com|news\.ycombinator\.com|reddit\.com|youtube\.com|github\.com|wikipedia\.org)$/.test(host) || /(^|\.)google\.[a-z.]+$/.test(host);
function websiteTarget(value, httpsOnly = false) {
 const safe = typeof value === 'string' ? safeUrl(value) : null;
 if (!safe) return null;
 const url = new URL(safe);
 if ((httpsOnly && url.protocol !== 'https:') || thirdPartyHost(url.hostname) || url.hostname.endsWith('.') || url.port || !url.hostname.includes('.') || url.hostname === 'localhost' || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) return null;
 return safe;
}
function profileTarget(value) {
 const safe = typeof value === 'string' ? safeUrl(value) : null;
 if (!safe) return null;
 const url = new URL(safe);
 if (url.protocol !== 'https:' || !/^(www\.)?(x\.com|twitter\.com)$/.test(url.hostname) || url.port || url.search || url.hash) return null;
 const match = /^\/([a-zA-Z0-9_]{1,15})\/?$/.exec(url.pathname);
 // Platform routes and the discovery publisher are not project profiles.
 if (!match || /^(home|explore|search|intent|share|settings|notifications|messages|i|login|logout|signup|tos|privacy|frontrunvc)$/i.test(match[1])) return null;
 return normalizeHandle(match[1]);
}
/** Pure, read-only resolution; persisted identity keys are never rewritten. */
export function resolveResearchTarget(discovery) {
 const d = discovery || {};
 const unavailable = reason => ({value:null,type:null,confidence:'LOW',source:'NONE',reason});
 const result = (value,type,confidence,source,reason) => ({value,type,confidence,source,reason});
 const website = websiteTarget(d.projectWebsite);
 if (website) return result(website,'WEBSITE','HIGH','DISCOVERY','Explicit project website from discovery.');
 if (validHandle(d.projectHandle)) return result(normalizeHandle(d.projectHandle),'X','HIGH','DISCOVERY','Explicit project X handle from discovery.');
 const handles = [...new Set((d.identityKeys || []).filter(key => typeof key === 'string' && key.startsWith('x:') && validHandle(key.slice(2))).map(key => normalizeHandle(key.slice(2))))];
 if (handles.length > 1) return unavailable('Conflicting persisted project X identities are available.');
 if (handles.length === 1) return result(handles[0],'X','MEDIUM','PERSISTED_IDENTITY','Valid project X handle from persisted identity keys.');
 const candidates = (d.classificationEvidence || []).flatMap(e => {
  if (e.verification !== 'VERIFIED') return [];
  const value = e.sourceType === 'OFFICIAL' ? websiteTarget(e.sourceUrl,true) : e.sourceType === 'PROJECT_X' ? profileTarget(e.sourceUrl) : null;
  return value ? [{value,type:e.sourceType === 'OFFICIAL' ? 'WEBSITE' : 'X'}] : [];
 });
 const unique = [...new Map(candidates.map(candidate => [candidate.type + ':' + candidate.value,candidate])).values()];
 const websites = unique.filter(candidate => candidate.type === 'WEBSITE');
 const profiles = unique.filter(candidate => candidate.type === 'X');
 if (websites.length > 1 || profiles.length > 1) return unavailable('Conflicting verified project identity candidates are available.');
 const preferred = websites[0] || profiles[0];
 if (preferred) return result(preferred.value,preferred.type,'MEDIUM','VERIFIED_EVIDENCE','Verified project identity from classification evidence.');
 return unavailable('No safe explicit or verified project website or X account is available.');
}
export function researchIdentity(d) {return resolveResearchTarget(d).value;}
// New Gem requires an explicit source date within 30 days, never retrieval time.
export function isNewGem(d, now=Date.now()) {const time=Date.parse(d.frontRunFlaggedAt || d.sourcePublishedAt);return statusOf(d)==='CRYPTO_RELEVANT'&&Number.isFinite(time)&&time<=now&&now-time<=30*86400000;}
export const defaults = () => ({statuses:['CRYPTO_RELEVANT','POSSIBLY_CRYPTO'],network:'',source:'',review:false,funding:false,recent:false});
export function selectDiscoveries(records, filters, search='', sort='newest', now=Date.now()) {
 const allUnclassified=records.length>0&&records.every(d=>statusOf(d)==='UNCLASSIFIED');
 const statuses=allUnclassified&&filters.statuses.join(',')===defaults().statuses.join(',')?['UNCLASSIFIED']:filters.statuses;
 const result=records.filter(d=>statuses.includes(statusOf(d))&&(!filters.network||d.classification?.networks?.includes(filters.network))&&(!filters.source||d.evidence.some(e=>e.source===filters.source))&&(!filters.review||d.classification?.needsReview)&&(!filters.funding||d.fundingMention)&&(!filters.recent||(Number.isFinite(Date.parse(d.discoveredAt))&&now-Date.parse(d.discoveredAt)>=0&&now-Date.parse(d.discoveredAt)<=30*86400000))&&[d.projectName,d.projectHandle,d.rawCategory,d.classification?.reason,...(d.classification?.networks||[])].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
 const date=v=>Number.isFinite(Date.parse(v))?Date.parse(v):null;
 const value=d=>sort==='confidence'?d.classification?.confidence:sort==='lead'?d.frontRunLeadTimeDays:sort==='funding'?Number(Boolean(d.fundingMention)):date(sort==='flag'?d.frontRunFlaggedAt:d.discoveredAt);
 return result.sort((a,b)=>{const av=value(a),bv=value(b);return av==null?(bv==null?a.id.localeCompare(b.id):1):bv==null?-1:(sort==='flag'?av-bv:bv-av)||a.id.localeCompare(b.id);});
}
