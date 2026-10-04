import { normalizedUrl } from './research.mjs';

export const SEARCH_LIMITS = Object.freeze({ queries: 6, results: 3, pages: 8, bytes: 512 * 1024, timeout: 10000, total: 45000 });
// Fixed messages and numeric HTTP status only: never retain upstream bodies or causes.
export class SearchProviderError extends Error {
  constructor(code, status = null) {
    super('Broader search request failed or timed out');
    this.name = 'SearchProviderError';
    this.code = code;
    this.status = status;
  }
}
export function providerDiagnostic(error) {
  return error instanceof SearchProviderError
    ? {code:error.code, status:error.status}
    : {code:'PROVIDER_FAILURE', status:null};
}
/** ExternalSearchProvider: search(query, {maxResults, timeout}) -> normalized sources only. */
export class TavilySearchProvider {
  constructor(apiKey, request = fetch) { this.apiKey = apiKey; this.request = request; this.name = 'tavily'; }
  async search(query, {maxResults = SEARCH_LIMITS.results, timeout = SEARCH_LIMITS.timeout} = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await Promise.race([
        this.request('https://api.tavily.com/search', {method:'POST', redirect:'error', signal:controller.signal,
          headers:{'Content-Type':'application/json', Authorization:`Bearer ${this.apiKey}`},
          body:JSON.stringify({query:query.slice(0,300), max_results:Math.min(maxResults, SEARCH_LIMITS.results), search_depth:'basic', topic:'general', include_answer:false, include_raw_content:false, include_images:false, auto_parameters:false})}),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error()), {once:true})),
      ]);
      if (!response.ok) {
        // Tavily uses 432/433 for plan/credit limits; no error body is needed.
        const code = [401,403].includes(response.status) ? 'AUTHENTICATION_FAILURE'
          : response.status === 429 ? 'RATE_LIMIT'
          : [402,432,433].includes(response.status) ? 'QUOTA_EXCEEDED' : 'HTTP_FAILURE';
        void response.body?.cancel().catch(() => {});
        throw new SearchProviderError(code, response.status);
      }
      if (!response.body) throw new SearchProviderError('MALFORMED_RESPONSE');
      const reader = response.body.getReader(); let size = 0; const chunks = [];
      const abort = () => { void reader.cancel(); };
      controller.signal.addEventListener('abort', abort, {once:true});
      try {
        while (true) { const {value,done} = await reader.read(); if (controller.signal.aborted) throw Error(); if (done) break;
          size += value.byteLength; if (size > SEARCH_LIMITS.bytes) { await reader.cancel(); throw new SearchProviderError('MALFORMED_RESPONSE'); } chunks.push(value); }
      } finally { controller.signal.removeEventListener('abort', abort); }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new SearchProviderError('MALFORMED_RESPONSE'); }
      if (!data || !Array.isArray(data.results) || data.results.some(r => !r || typeof r.title !== 'string' || typeof r.url !== 'string' || (r.content !== undefined && typeof r.content !== 'string'))) throw new SearchProviderError('MALFORMED_RESPONSE');
      const diagnostics = {httpStatus:response.status, rejected:0};
      const results = data.results.slice(0, SEARCH_LIMITS.results).flatMap(r => {
        try { return [{title:r.title.slice(0,160), url:normalizedUrl(r.url), snippet:(r.content || '').slice(0,1200), provider:this.name, sourceType:'WEB', ...(typeof r.published_date === 'string' && Number.isFinite(Date.parse(r.published_date)) ? {publishedAt:new Date(r.published_date).toISOString()} : {})}]; } catch { diagnostics.rejected++; return []; }
      });
      Object.defineProperty(results,'diagnostics',{value:diagnostics});
      return results;
    } catch (error) {
      if (controller.signal.aborted) throw new SearchProviderError('TIMEOUT');
      if (error instanceof SearchProviderError) throw error;
      throw new SearchProviderError('NETWORK_FAILURE');
    }
    finally { clearTimeout(timer); }
  }
}
export function configuredSearchProvider(env = process.env, request = fetch) {
  if (!env.CAPTAINSCOUT_SEARCH_PROVIDER) return {provider:null, status:'NOT_CONFIGURED'};
  if (env.CAPTAINSCOUT_SEARCH_PROVIDER !== 'tavily') return {provider:null, status:'UNSUPPORTED'};
  if (!env.CAPTAINSCOUT_SEARCH_API_KEY?.trim()) return {provider:null, status:'MISSING_KEY'};
  return {provider:new TavilySearchProvider(env.CAPTAINSCOUT_SEARCH_API_KEY, request), status:'CONFIGURED'};
}
