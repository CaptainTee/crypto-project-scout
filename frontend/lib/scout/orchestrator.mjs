import { researchProject, fetchOfficial, parsePage, normalizedUrl, RuntimeRepository, createResearchProvider, fetchDiagnostic, dedupeOpportunities, comparisonCategory, explicitComparison } from './research.mjs';
import { configuredSearchProvider, providerDiagnostic, SEARCH_LIMITS } from './search.mjs';

export const EXTERNAL_FETCH_LIMITS = Object.freeze({timeout:12000, concurrency:3});

// Reserve one slot per query, then fill fairly; rank sources within each group.
export function selectExternalCandidates(candidates, limit = SEARCH_LIMITS.pages) {
  const rank = {PRIMARY:5, REPUTABLE_SECONDARY:4, OFFICIAL:3, UNKNOWN:2, COMMUNITY:1};
  const groups = new Map();
  for (const candidate of candidates) {
    const group = groups.get(candidate.queryIndex) || [];
    group.push(candidate); groups.set(candidate.queryIndex,group);
  }
  for (const group of groups.values()) group.sort((a,b) => rank[b.sourceClass]-rank[a.sourceClass]);
  const chosen = [];
  while (chosen.length < limit && [...groups.values()].some(g => g.length)) {
    const round = [...groups.values()].filter(g => g.length).sort((a,b) => rank[b[0].sourceClass]-rank[a[0].sourceClass]);
    for (const group of round) { if (chosen.length === limit) break; chosen.push(group.shift()); }
  }
  return chosen;
}
export const FRESHNESS = Object.freeze({features:86400000, comparisons:604800000, funding:2592000000, opportunities:3600000});
export const SOURCE_RANK = Object.freeze({OFFICIAL:5, PRIMARY:4, REPUTABLE_SECONDARY:3, COMMUNITY:2, UNKNOWN:1});
const secondary = ['coindesk.com','theblock.co','decrypt.co','cointelegraph.com','crunchbase.com','defillama.com'];
const primary = ['a16zcrypto.com','paradigm.xyz','coinbase.com','binance.com','multicoin.capital','polychain.capital'];
const matches = (host, base) => host === base || host.endsWith('.'+base);
export function classifySource(url, officialUrls = []) {
  const host = new URL(url).hostname;
  if (officialUrls.some(u => new URL(u).hostname === host)) return 'OFFICIAL';
  if (primary.some(h => matches(host,h))) return 'PRIMARY';
  if (secondary.some(h => matches(host,h))) return 'REPUTABLE_SECONDARY';
  if (['reddit.com','x.com','twitter.com','discord.com'].some(h => matches(host,h))) return 'COMMUNITY';
  return 'UNKNOWN';
}
export class OfficialResearchProvider {
  constructor(fetchPage = fetchOfficial) { this.fetchPage = fetchPage; }
  enrichProject(url, now) { return researchProject(url, {fetchPage:this.fetchPage, now}); }
}
export function researchQueries(identity) {
  return [ ['features','crypto products features services'], ['comparisons','competitors alternatives comparison'], ['funding','funding seed series investors'], ['opportunities','testnet campaign points quests'], ['opportunities','node validator ambassador hackathon'], ['opportunities','waitlist early access'] ].map(([kind, suffix]) => ({kind, query:`"${identity}" ${suffix}`}));
}
const fingerprint = text => text.toLowerCase().replace(/reported capability:|[^a-z0-9]/g,'');
function sameClaim(a,b) {
  if (fingerprint(a) === fingerprint(b)) return true;
  const tokens = text => new Set(text.toLowerCase().replace(/reported capability:/g,'').match(/[a-z0-9]+/g) || []);
  const x = tokens(a), y = tokens(b);
  if (x.size < 8 || y.size < 8) return false;
  const sensitive = set => [...set].filter(t => /[0-9]|^(not|no|never|without)$/.test(t)).sort().join(',');
  if (sensitive(x) !== sensitive(y)) return false;
  const common = [...x].filter(t => y.has(t)).length;
  return common / new Set([...x,...y]).size >= 0.9;
}
function mergeClaims(target, incoming, key) {
  for (const c of incoming) {
    const old = target.find(o => sameClaim(key(o.value),key(c.value)));
    if (old) old.evidenceIds = [...new Set([...old.evidenceIds,...c.evidenceIds])]; else target.push(c);
  }
}
const money = text => {
  const match = text?.replace(/,/g,'').match(/\$\s*([\d.]+)\s*(million|billion|m|b)?/i);
  return match ? Number(match[1]) * (/^(million|m)$/i.test(match[2] || '') ? 1e6 : /^(billion|b)$/i.test(match[2] || '') ? 1e9 : 1) : text;
};
/** FundingResearchProvider merges rounds, preserves contradictory amounts and never sums ambiguous rounds. */
export class FundingResearchProvider {
  merge(target, incoming, issues) {
    for (const round of incoming) {
      const v = round.value;
      const same = target.find(c => c.value.round.toLowerCase() === v.round.toLowerCase() && c.value.date.value === v.date.value);
      if (!same) { target.push(round); continue; }
      if (money(same.value.amount.value) !== money(v.amount.value)) {
        same.verification = round.verification = 'UNVERIFIED'; same.value.amount.verification = round.value.amount.verification = 'UNVERIFIED';
        issues.push('Conflicting reported funding amounts; both reports retained.'); target.push(round); continue;
      }
      same.evidenceIds = [...new Set([...same.evidenceIds,...round.evidenceIds])];
      for (const field of ['amount','date','investors','leadInvestor']) {
        const old = same.value[field], next = v[field];
        if (!next) continue;
        if (!old) { same.value[field] = next; continue; }
        if (old.value === null && next.value !== null) same.value[field] = next;
        else if (old.value !== null && next.value !== null) { old.evidenceIds = [...new Set([...old.evidenceIds,...next.evidenceIds])]; if (field === 'investors') old.value = [...new Set([...old.value,...next.value])]; }
      }
    }
  }
}
function remapClaims(data, from, to, strong) {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.evidenceIds)) { value.evidenceIds = value.evidenceIds.map(id => id === from ? to : id); if (!strong && ['VERIFIED','INFERRED'].includes(value.verification)) value.verification = 'UNVERIFIED'; }
    for (const v of Object.values(value)) if (v && typeof v === 'object') visit(v);
  }; visit(data);
}
export class ResearchOrchestrator {
  constructor({official = new OfficialResearchProvider(), search = configuredSearchProvider(), fetchPage = fetchOfficial, repository = new RuntimeRepository(), historicalFunding = new RuntimeRepository(), now = () => new Date(), onDiagnostics = null} = {}) {
    Object.assign(this,{official,search,fetchPage,repository,historicalFunding,now,onDiagnostics}); this.funding = new FundingResearchProvider();
  }
  finish(data) {
    const previous = this.historicalFunding.get(data.identity);
    if (previous) {
      const old = structuredClone(previous);
      for (const e of old.evidence) {
        const existing = data.evidence.find(item => item.url === e.url);
        const id = existing?.id || `historical-${data.evidence.length+1}`;
        remapClaims(old.funding,e.id,id,true);
        if (!existing) data.evidence.push({...e,id});
        else existing.firstSeenAt = e.firstSeenAt || e.checkedAt;
      }
      this.funding.merge(data.funding.rounds,old.funding.rounds,data.issues);
      if (data.funding.totalKnown.value === null) data.funding.totalKnown = old.funding.totalKnown;
    }
    const ids = new Set();
    const collect = v => { if (!v || typeof v !== 'object') return; if (v.evidenceIds) v.evidenceIds.forEach(id => ids.add(id)); Object.values(v).forEach(item => {if (item && typeof item === 'object') collect(item);}); };
    collect(data.funding);
    this.historicalFunding.put(data.identity,{funding:data.funding,evidence:data.evidence.filter(e => ids.has(e.id))},Infinity);
    data.issues = [...new Set(data.issues)];
    return data;
  }
  async enrichProject(sourceUrl) {
    const now = this.now(); const start = Date.now(); const data = await this.official.enrichProject(sourceUrl, now);
    const officialUrls = [data.confirmedIdentity?.sourceUrl || sourceUrl];
    for (const e of data.evidence) Object.assign(e,{sourceClass:classifySource(e.url,officialUrls), provider:'official', firstSeenAt:e.checkedAt, evidenceKind:'FETCH_VERIFIED'});
    data.researchAvailability = {official:data.evidence.length ? (data.issues.length ? 'PARTIAL':'AVAILABLE'):'UNAVAILABLE', broader:this.search.provider ? 'AVAILABLE':this.search.status};
    data.comparisonsStaleAfter = new Date(+now+FRESHNESS.comparisons).toISOString(); data.fundingStaleAfter = new Date(+now+FRESHNESS.funding).toISOString();
    if (!this.search.provider) { data.issues.push('Broader research provider is not configured; only official-source research was attempted.'); return this.finish(data); }
    // Entity resolution must precede paid search, especially for blocked X handles.
    const name = data.confirmedIdentity?.name;
    if (!name) { data.researchAvailability.broader = 'BLOCKED'; data.issues.push('Broader research requires a confirmed project identity from official sources.'); return this.finish(data); }
    const diagnostics = {queries:[], opportunitiesBeforeDedupe:data.opportunitiesBeforeDedupe ?? data.opportunities.length};
    const seen = new Set(); let failures = 0, successfulSearches = 0;
    const candidates = [];
    const queries = researchQueries(name).slice(0,SEARCH_LIMITS.queries);
    // Search concurrently inside the same total budget, so early fetches cannot starve later groups.
    const searches = await Promise.all(queries.map(async ({kind,query}) => {
      const diagnostic = {queryType:kind === 'comparisons' ? 'competitors':kind, searchInvoked:false, providerStatus:'NOT_ATTEMPTED', httpStatus:null, normalizedResults:0, accepted:0, rejectedBeforeFetch:0, safeFetched:0, fetchFailures:0, classified:0, evidenceCreated:0, claimsCreated:0, duplicates:0, budgetSkipped:0, rejections:{}};
      diagnostics.queries.push(diagnostic);
      const cacheKey = `search:${this.search.provider.name}:${query}`;
      let results = this.repository.get(cacheKey);
      if (results) diagnostic.providerStatus = 'CACHED';
      else {
        const remaining = SEARCH_LIMITS.total-(Date.now()-start);
        if (remaining <= 0) { diagnostic.rejections.TOTAL_BUDGET = 1; return {kind,results:[],diagnostic}; }
        diagnostic.searchInvoked = true;
        try {
          results = await this.search.provider.search(query,{maxResults:SEARCH_LIMITS.results,timeout:Math.min(SEARCH_LIMITS.timeout,remaining)});
          diagnostic.providerStatus = 'SUCCEEDED';
          diagnostic.httpStatus = results.diagnostics?.httpStatus ?? null;
          diagnostic.rejectedBeforeFetch = results.diagnostics?.rejected || 0;
          if (diagnostic.rejectedBeforeFetch) diagnostic.rejections.UNSAFE_URL = diagnostic.rejectedBeforeFetch;
          this.repository.put(cacheKey,results,FRESHNESS[kind]);
        } catch (error) {
          const safe = providerDiagnostic(error);
          diagnostic.providerStatus = 'FAILED'; diagnostic.httpStatus = safe.status;
          diagnostic.rejections[safe.code] = 1;
          return {kind,results:[],diagnostic};
        }
      }
      diagnostic.normalizedResults = results.slice(0,SEARCH_LIMITS.results).length;
      return {kind,results,diagnostic};
    }));
    for (const [queryIndex,{kind,results,diagnostic}] of searches.entries()) {
      if (!['SUCCEEDED','CACHED'].includes(diagnostic.providerStatus)) {
        failures++; data.issues.push(`Broader ${kind} search unavailable; other research retained.`); continue;
      }
      successfulSearches++;

      for (const result of results.slice(0,SEARCH_LIMITS.results)) {
        let url; try { url = normalizedUrl(result.url); }
        catch { diagnostic.rejectedBeforeFetch++; diagnostic.rejections.UNSAFE_URL = (diagnostic.rejections.UNSAFE_URL || 0)+1; failures++; continue; }
        diagnostic.accepted++;
        const sourceClass = classifySource(url,officialUrls); diagnostic.classified++;
        let discovered = data.evidence.find(e => e.url === url && e.provider === (result.provider || this.search.provider.name));
        if (discovered) {
          discovered.queryTypes = [...new Set([...(discovered.queryTypes || []),diagnostic.queryType])];
          diagnostic.duplicates++; continue;
        }
        const checkedAt = now.toISOString();
        discovered = {id:`external-${data.evidence.length+1}`,url,resultUrl:url,name:result.title || new URL(url).hostname,title:result.title || new URL(url).hostname,snippet:result.snippet || '',domain:new URL(url).hostname,sourceClass,provider:result.provider || this.search.provider.name,queryTypes:[diagnostic.queryType],firstSeenAt:checkedAt,checkedAt,verification:'UNVERIFIED',evidenceKind:'DISCOVERY',...(result.publishedAt ? {publishedAt:result.publishedAt}:{})};
        data.evidence.push(discovered); diagnostic.evidenceCreated++;
        if (seen.has(url)) { diagnostic.duplicates++; continue; }
        seen.add(url);
        candidates.push({url,result,discovered,diagnostic,queryIndex,sourceClass});
      }
    }
    const selected = selectExternalCandidates(candidates);
    for (const candidate of candidates) if (!selected.includes(candidate)) { candidate.diagnostic.budgetSkipped++; failures++; }
    diagnostics.fetches = [];
    diagnostics.searchElapsedMs = Date.now()-start;
    let cursor = 0;
    const fetched = new Map();
    await Promise.all(Array.from({length:EXTERNAL_FETCH_LIMITS.concurrency},async () => {
      while (cursor < selected.length) {
        const candidate = selected[cursor++];
        const remaining = SEARCH_LIMITS.total-(Date.now()-start);
        if (remaining <= 0) { candidate.diagnostic.budgetSkipped++; failures++; continue; }
        const timeout = Math.min(EXTERNAL_FETCH_LIMITS.timeout,remaining);
        const started = Date.now();
        const metric = {hostname:new URL(candidate.url).hostname,sourceClass:candidate.sourceClass,queryGroup:candidate.diagnostic.queryType,timeout,elapsedMs:0,result:'SUCCESS'};
        try { fetched.set(candidate,await this.fetchPage(candidate.url,{timeout})); candidate.diagnostic.safeFetched++; }
        catch (error) {
          const category = fetchDiagnostic(error);
          metric.result = category;
          candidate.diagnostic.fetchFailures++;
          candidate.diagnostic.rejections[category] = (candidate.diagnostic.rejections[category] || 0)+1;
          failures++; data.issues.push('An external source could not be fetched; discovery metadata retained as Unverified.');
        } finally { metric.elapsedMs = Date.now()-started; diagnostics.fetches.push(metric); }
      }
    }));
    // Extract in selection order, independently of network completion order.
    for (const candidate of selected) {
      const page = fetched.get(candidate); if (!page) continue;
      const {result,discovered,diagnostic} = candidate;
      let url = normalizedUrl(page.url);
      Object.assign(discovered,{url,domain:new URL(url).hostname,sourceClass:classifySource(url,officialUrls),evidenceKind:'FETCH_VERIFIED'});
      try {
        const parsed = parsePage(page.html,url);
        // Scope every extracted paragraph to the known entity; unrelated snippets cannot introduce claims.
        const entity = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i');
        const blocks = parsed.blocks.filter(b => entity.test(b));
        if (!blocks.length) { diagnostic.rejections.NO_ENTITY_CONTENT = (diagnostic.rejections.NO_ENTITY_CONTENT || 0)+1; continue; }
        const sourceClass = discovered.sourceClass; const strong = SOURCE_RANK[sourceClass] >= 3;
        const filteredHtml = `<title>${parsed.title.replace(/[<>]/g,'')}</title>` + blocks.map(b => `<p>${b.replace(/[<>]/g,'')}</p>`).join('') + parsed.links.map(l => `<a href="${l.url.replace(/"/g,'%22')}">${l.label.replace(/[<>]/g,'')}</a>`).join('');
        // Bind a funding raise to this entity, rather than another company in the paragraph.
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fundingSubject = new RegExp(`\\b${escapedName}(?:\\s+(?:has|have|recently|successfully|announced it|announced that it)){0,3}\\s+(?:raised|secured|closed|total (?:disclosed )?(?:funding|raised))\\b`, 'i');
        const extracted = await researchProject(sourceUrl,{now,followLinks:false,allowFunding:block => fundingSubject.test(block),fetchPage:async () => ({url,html:filteredHtml})});
        const id = discovered.id;
        for (const e of extracted.evidence) remapClaims(extracted,e.id,id,strong);
        discovered.verification = strong ? 'VERIFIED':'UNVERIFIED';

        mergeClaims(data.featuresAndServices, extracted.featuresAndServices, v => v.description);
        if (strong) {
          for (const c of extracted.similarProjects) {
            const comparison = blocks.find(b => b.includes(c.value.name) && explicitComparison(b) && comparisonCategory(b));
            c.value.similarity = `The cited source explicitly compares their ${c.value.category || 'product'} capabilities.`;
            c.value.category = comparison && comparisonCategory(comparison);
            if (comparison && /unlike|differs from/i.test(comparison)) c.value.differentiators = comparison.slice(0,400);
          }
          mergeClaims(data.similarProjects,extracted.similarProjects.filter(c => c.value.category),v => v.url);
          this.funding.merge(data.funding.rounds, extracted.funding.rounds, data.issues);
          if (extracted.funding.totalKnown.value !== null) {
            const old = data.funding.totalKnown, next = extracted.funding.totalKnown;
            if (old.value === null) data.funding.totalKnown = next;
            else if (money(old.value) === money(next.value)) old.evidenceIds = [...new Set([...old.evidenceIds,...next.evidenceIds])];
            else { old.value = `Conflicting disclosed totals: ${old.value} / ${next.value}`; old.verification = 'UNVERIFIED'; old.evidenceIds = [...new Set([...old.evidenceIds,...next.evidenceIds])]; data.issues.push('Conflicting disclosed funding totals retained.'); }
          }
        }
        for (const c of extracted.opportunities) {
          c.value.description = c.value.description.replace('Official source', 'Fetched source');
          c.value.sourceClass = sourceClass;
          const published = result.publishedAt && Date.parse(result.publishedAt);
          if (c.value.status === 'Active' && (!strong || !published || +now-published > 7*86400000 || published > +now)) { c.value.status = 'Unknown'; c.verification = 'UNVERIFIED'; }
        }
        data.opportunities.push(...extracted.opportunities);
        diagnostics.opportunitiesBeforeDedupe += extracted.opportunities.length;
        diagnostic.claimsCreated += extracted.featuresAndServices.length+extracted.opportunities.length+(strong ? extracted.similarProjects.filter(c => c.value.category).length+extracted.funding.rounds.length+Number(extracted.funding.totalKnown.value !== null):0);
      } catch {
        diagnostic.rejections.EXTRACTION_FAILURE = (diagnostic.rejections.EXTRACTION_FAILURE || 0)+1;
        failures++; data.issues.push('External content extraction failed; discovery metadata retained.');
      }
    }
    data.opportunities = dedupeOpportunities(data.opportunities);
    diagnostics.opportunitiesAfterDedupe = data.opportunities.length;
    data.sectionAvailability = {};
    for (const kind of ['features','comparisons','funding','opportunities']) {
      const group = searches.filter(item => item.kind === kind).map(item => item.diagnostic);
      const successes = group.filter(d => ['SUCCEEDED','CACHED'].includes(d.providerStatus));
      // Funding search availability describes discovery, not proof of a funding round.
      if (kind === 'funding') { data.sectionAvailability[kind] = successes.length ? 'AVAILABLE':'UNAVAILABLE'; continue; }
      data.sectionAvailability[kind] = !successes.length ? 'UNAVAILABLE'
        : successes.length !== group.length || group.some(d => d.fetchFailures || d.rejectedBeforeFetch || d.budgetSkipped || d.rejections.EXTRACTION_FAILURE) ? 'PARTIAL':'AVAILABLE';
    }
    // Merge official duplicate rounds as well; no total is inferred from a partial corpus.
    const rounds = data.funding.rounds; data.funding.rounds = []; this.funding.merge(data.funding.rounds,rounds,data.issues);
    data.similarProjects = data.similarProjects.slice(0,5);
    if (data.similarProjects.length) {
      data.originalitySignal = {value:'Common model',verification:'INFERRED',evidenceIds:[...new Set(data.similarProjects.flatMap(c => c.evidenceIds))]};
      data.originalityExplanation = 'Cited explicit product comparisons support a shared model. Meaningful differentiation remains unconfirmed.';
      const differentiated = data.similarProjects.filter(c => c.verification !== 'UNVERIFIED' && /\b(unlike|differs from|differentiates)\b/i.test(c.value.differentiators));
      if (differentiated.length) { data.originalitySignal.value = 'Differentiated implementation'; data.originalitySignal.evidenceIds.push(...differentiated.flatMap(c => c.evidenceIds)); data.originalitySignal.evidenceIds = [...new Set(data.originalitySignal.evidenceIds)]; data.originalityExplanation = 'Sources describe specific implementation differences alongside comparable products; this does not establish uniqueness.'; }
    }
    if (failures) data.researchAvailability.broader = successfulSearches ? 'PARTIAL' : 'UNAVAILABLE';
    data.issues = [...new Set(data.issues)];
    if (this.onDiagnostics) this.onDiagnostics(structuredClone(diagnostics));
    return this.finish(data);
  }
}
const orchestrator = new ResearchOrchestrator();
export const broaderResearchProvider = createResearchProvider(new RuntimeRepository(), url => orchestrator.enrichProject(url));
