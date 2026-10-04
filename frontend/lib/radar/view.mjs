export const LABELS = {CRYPTO_RELEVANT:'Crypto Relevant',POSSIBLY_CRYPTO:'Possibly Crypto',NON_CRYPTO:'Non-Crypto',UNCLASSIFIED:'Unclassified'};
export const statusOf = d => d.classification?.status || d.classificationStatus || 'UNCLASSIFIED';
export function safeUrl(value) {try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function researchIdentity(d) {return safeUrl(d.projectWebsite) || (/^@?[a-zA-Z0-9_]{1,15}$/.test(d.projectHandle || '')?'@'+d.projectHandle.replace(/^@/,''):null);}
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
