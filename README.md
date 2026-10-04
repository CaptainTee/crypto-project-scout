# CaptainScout

[![CI](https://github.com/CaptainTee/crypto-project-scout/actions/workflows/ci.yml/badge.svg)](https://github.com/CaptainTee/crypto-project-scout/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

CaptainScout is an AI-powered crypto project intelligence dApp using **GenLayer consensus**. It analyzes project websites and X profiles, produces structured classifications, and preserves accepted analyses onchain. CaptainScout evolved from the original **Crypto Project Scout** prototype.

**Current release candidate:** `captainscout-v1-rc2` — the CaptainScout v1 release candidate including documentation. `captainscout-v1-rc1` remains the live-tested application code checkpoint for phases 1–3: the dashboard redesign, sequential multi-project analysis, and X-handle support. CaptainScout v1 is the application release; the deployed intelligent contract remains V3, with its existing `CryptoProjectScout` identifier and storage layout.

## Analyze projects

Connect your wallet and enter one project source, or up to **5 unique sources**, one per line:

```text
https://ethereum.org/
@flop_labs
https://endure.network/
@base
```

- Website URLs must begin with `http://` or `https://`. Full X/Twitter URLs are supported.
- Shorthand handles require `@` followed by 1–15 letters, numbers, or underscores. Bare words, internal spaces, dots, and dashes are rejected.
- `@flop_labs` becomes `https://x.com/flop_labs` before GenLayer analysis. The queue retains the friendly handle label.
- Input is trimmed, blank lines are ignored, and equivalent sources are deduplicated **after normalization**. Shorthand, common X/Twitter profile aliases, profile casing, trailing slashes, and recognized sharing parameters are handled. Ordinary website URLs, post URLs, and meaningful query parameters are preserved.
- The entire batch is validated before transactions begin. The five-project limit applies after deduplication.
- One **Analyze Project / Analyze N Projects** action starts sequential processing. Each project may require its own wallet approval. The next project starts only after the previous project completes or fails; a failure does not stop the remaining queue.

The scouting/intelligence dashboard provides batch progress, individual **Waiting**, **Awaiting wallet / submitting**, **Analyzing**, **Complete**, and **Failed** statuses, expandable results, Latest Analysis, Stored Analyses count, and Analysis History. The design supports desktop and mobile screens.

The circled **×** control clears the input and transient input feedback without deleting onchain Analysis History. Clearing or editing input does not cancel a running queue; keep the page open while it processes.

When a source, including an X page, cannot be accessed by validators, the affected project receives this feedback and the queue continues:

> Analysis could not be completed. The website may be blocking GenLayer validators or may be temporarily inaccessible.

X support uses GenLayer's existing website-fetching mechanism. No X API integration, API keys, OAuth, or separate scraper is required.

## Analysis output

| Field | Meaning |
| --- | --- |
| Project Name | Identified project name |
| Source URL | URL submitted to GenLayer after normalization |
| Uses Crypto | Whether the project meaningfully uses crypto |
| Category | Project classification, such as DeFi, Infrastructure, or AI-Crypto |
| Chain | Blockchain or network associated with the project |
| Token Status | Live, Announced, Tokenless, or Unknown |
| Development Stage | Mainnet, Testnet, Devnet, Pre-launch, or Unknown |
| Use Case | Concise summary of the project's purpose |
| Crypto Integration | How the project uses crypto or blockchain technology |
| Confidence | Integer score from 0 to 100, displayed as a percentage |

Results depend on available source content and may vary between analyses. Every new V3 history record includes its source URL; legacy V2 records may lack it. The result schema is unchanged by batching and X-handle support.

## Architecture

| Component | Responsibility |
| --- | --- |
| Next.js frontend | React/TypeScript dashboard, input normalization, validation, sequential queue, persistence verification, and result/history display |
| Frontend GenLayer contract client | `frontend/lib/contracts/CryptoProjectScout.ts`: submits transactions, waits for accepted receipts, checks execution outcomes, and exposes contract reads |
| GenLayer intelligent contract | `contracts/crypto_project_scout.py`: retrieves website content, runs LLM analysis and validator consensus, and stores accepted results onchain |
| GenLayer Studio / Studionet | Execution network and RPC used by the deployed intelligent contract and frontend |
| Vercel | Hosts the Next.js frontend, with stable and branch-preview deployment contexts; contract execution remains on GenLayer |

Multi-project analysis calls the existing **`analyze_project(url)` method separately and sequentially**. There is no new batch contract method. Each successful transaction is checked for a count increase and a persisted result matching its submitted URL before the next project proceeds. Stored Analyses and Analysis History refresh after successes.

The contract uses `gl.vm.run_nondet_unsafe()` with independent leader and validator analysis, including agreement on `uses_crypto`, `category`, and `chain`. Retrieved content is treated as untrusted evidence. Public history reads include `get_analysis_count()`, `get_analysis_at(index)`, `get_latest_for_url(url)`, `get_last_result()`, and `get_last_url()`.

There is no separate application backend. Wallet implementation, contract identifiers, and onchain storage remain compatible with the prototype. The existing authorized contract upgrade mechanism requires explicit approval and storage compatibility for any future upgrade.

## Branches and deployments

| Reference | Purpose |
| --- | --- |
| `main` | Stable GenLayer Portal reviewer-facing version |
| `captainscout-redesign` | CaptainScout development branch; make development changes here |
| `captainscout-v1-rc1` | Live-tested application code checkpoint **tag** for CaptainScout phases 1–3 |
| `captainscout-v1-rc2` | Current CaptainScout v1 release-candidate **tag**, including documentation |

**Stable reviewer app:** [Crypto Project Scout on Vercel](https://crypto-project-scout.vercel.app). This is the stable reviewer-facing deployment associated with `main`; CaptainScout development is reviewed separately through a branch preview.

**Existing V3 contract:** `0xB93De863a654495FE6a22F0d7743D77750E61833` on GenLayer Studio / Studionet. [Deployment transaction](https://explorer-studio.genlayer.com/tx/0x909549daa9ff23b1da79dc937adfeb0f5bc951b56ec1f93a1a568e25952acf79).

Use a Vercel **Preview** deployment associated with `captainscout-redesign` to review CaptainScout. Obtain its current URL from the Vercel project dashboard or deployment checks for the relevant commit; preview URLs can change. Preview configuration must use the intended public contract address, RPC, and chain settings. Production settings and the stable reviewer deployment remain unchanged until an explicitly approved release.

Do not develop directly on `main`. Changes to the stable version go through review and explicit release approval. A frontend preview does not require deploying or upgrading a GenLayer contract.

## Run locally

Use Node.js 24 and npm for the frontend and the test commands below. An installed MetaMask wallet and testnet GEN are needed for live write transactions.

```bash
git clone --branch captainscout-redesign https://github.com/CaptainTee/crypto-project-scout.git
cd crypto-project-scout
npm ci
cp frontend/.env.example frontend/.env.local
```

Configure the local template for the intended contract and network: `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_GENLAYER_RPC_URL`, `NEXT_PUBLIC_GENLAYER_CHAIN_ID`, `NEXT_PUBLIC_GENLAYER_CHAIN_NAME`, and `NEXT_PUBLIC_GENLAYER_SYMBOL`. These are browser-visible configuration values. Never put secrets in `NEXT_PUBLIC_*` variables or commit local environment files.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). See the [frontend guide](frontend/README.md) for code locations, browser QA prerequisites, and the Cloud build procedure.

For Python contract tooling, install Python 3.12+ and `uv`, then:

```bash
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
npm install -g genlayer
```

The GenLayer CLI supports network and integration tooling; using the existing deployed contract does not require a new deployment.

## Testing and release baseline

Recorded validation for the live-tested application code checkpoint **`captainscout-v1-rc1`**:

| Check | Result |
| --- | --- |
| Frontend unit/regression tests | **28 passed** |
| GenLayer direct tests | **34 passed** |
| TypeScript / lint | Passed |
| Production build | Passed |
| Responsive browser QA | Passed at 1440px, 390px, and 320px |
| Real live multi-project GenLayer batch | Validated successfully |
| Live `@Xhandle` processing | Validated successfully |

Run from the repository root, with the Python environment activated for contract checks:

```bash
npm run lint
node --test --test-isolation=none frontend/tests/*.test.mjs
pytest tests/direct/ -q
genvm-lint check contracts/crypto_project_scout.py
npm run build
```

`npm run lint` runs TypeScript's `tsc --noEmit`. Direct tests mock external web/LLM behavior; frontend tests cover validation, normalization, deduplication, sequential processing, and failures. The [browser QA utility](frontend/tests/browser-qa.cjs) checks the actual UI with isolated wallet/contract fixtures, including clearing without losing history. Live validation is a separate release check against GenLayer and accessible sources.

Optional network-backed integration test:

```bash
gltest tests/integration/test_crypto_project_scout.py -v -s --network studionet
```

This test **deploys a fresh temporary contract** and executes a real analysis. Run it only with deployment approval and the appropriate wallet/network setup. It is separate from the deterministic CI suite.

Existing GitHub CI runs contract lint, direct tests, TypeScript, and a production build on pushes and pull requests targeting `main`. Frontend regression tests and browser QA are also run explicitly for release validation.

## License

[MIT](LICENSE).

## CaptainScout v2 Phase 5A: enriched intelligence foundation

Development is on `captainscout-v2`. Phase 4 collapsed history, filters, comparison,
sequential batching and X-handle support remain intact. Captain's Radar stays
“Coming in CaptainScout v2”; monitoring is not implemented.

V3 stores JSON strings in `analysis_history` and `latest_by_url`, with
`last_url`, `last_result` and `analysis_count`. Its exact analysis schema contains
project name, crypto usage, category, chain, token status, development stage,
use case, crypto integration, confidence and the stored source URL. History is
read newest first through `get_analysis_count` and `get_analysis_at`; legacy V2
records may omit the URL. Existing records and the contract wrapper are unchanged.
The V3 prompt and validator do not produce structured enrichment or claim citations.
Extracting those from its short narratives would not provide verified research.
Adding persisted enrichment to GenLayer would require an explicitly approved
contract/schema design and deployment or upgrade; Phase 5A does neither.

`frontend/lib/scout/enrichment.ts` defines the separate `ProjectEnrichment` sidecar,
claim/evidence types, provider interface, payload validation and derived availability.
Features distinguish offered from announced services and include separately sourced
target users. Competitors include similarities and differentiators; originality is
a bounded signal that does not establish global uniqueness. Opportunities include
status, participation/source links, check time and optional deadline. Funding tracks
known totals, individual rounds, amounts, dates and named investors with their own
claim statuses. Evidence supplies URL, name/domain, check timestamp and verification.
Every populated claim must reference evidence; Verified claims need a Verified
source. These structural checks cannot establish factual truth: a future provider
must actually review sources and justify the claim-level verification it assigns.
Unavailable claims have null values, with no guessed zeros or invented names.
Malformed payloads, unsafe links and unresolved source references are rejected.

The provider receives a detached V3 record and returns an untrusted payload for
validation. It returns null in production today: no research, credentials, network
calls, enrichment persistence or new application backend is introduced. Result
cards show onchain completion separately from enrichment availability. Enrichment,
when supplied, renders in collapsible sections with claim labels and linked sources.
Historical records safely show “Additional intelligence has not been enriched yet.”
Comparison continues to use the existing eight onchain fields. Radar can implement
the same provider interface and emit sidecars for discovered project URLs, without
requiring those fields to exist in an onchain analysis.

### Phase 5B requirements for real intelligence

- Select and implement an approved live research adapter and its execution location.
  Official website/announcement research needs source retrieval, content extraction,
  project identity matching, citations and checked timestamps for offered versus
  promised services and target users.
- Similar projects require a researched candidate corpus, cited similarity and
  differentiator claims, and bounded originality reasoning. Never infer global
  uniqueness from a limited search.
- Live opportunities need official participation links, evidence for status and
  deadlines, periodic rechecks and expiry/staleness handling.
- Funding/investor information needs official round announcements or an approved
  database, entity matching, currency/date handling and deduplication of rounds so
  totals do not double count. Preserve unknown totals and unconfirmed investors.
- Decide persistence, stable project/analysis identity, cache expiry, refresh/error
  behavior and provider provenance. Current sidecars are transient, not onchain.
  If retrieval requires secrets or scheduled/server-side research, explicitly approve
  credentials and backend infrastructure before implementing it. Paid services are
  optional provider choices, not dependencies of this foundation. Any GenLayer
  enrichment contract path requires separate approval and compatibility review.

Validation: `node --test frontend/tests/*.test.mjs` includes complete/partial/missing
information, trust labels, multi-source evidence, funding/opportunity representation,
malformed payloads, provider failures and legacy records. `browser-qa.cjs` isolates
wallet/contract/provider fixtures and checks populated research plus the truthful
production empty state at 1440, 768, 390 and 320 pixels. Synthetic research lives only
in `frontend/tests/fixtures/enrichment.json` and the explicitly mocked QA harness.

### Phase 5B-1: live official-source enrichment

After a V3 analysis exists, **Research Project** requests `/api/research` on the
Next.js Node runtime. Research remains a detached sidecar; it never writes to
GenLayer. Opening history or rerendering does not start research. No API key,
paid service, new dependency, or deployment setting is required.

The server checks the submitted website and at most five directly linked pages:
same-origin pages, labeled official docs/blog/news/campaign links, GitHub and
X/Twitter. Discovery is one hop, not an open-web search. A linked source is treated
as project-published evidence, not independent fact verification. Capability
extraction and explicit linked product comparisons are **Inferred**; directly
observed dated opportunity announcements and funding disclosures are **Verified**
as official statements. Source HTML is never rendered or executed. The extractor
uses bounded factual clauses and conservative rules rather than an LLM; unusual
wording, non-English text, JavaScript-only pages and PDFs may be missed.

Capabilities include offered/announced classification and explicit audience
labels. Opportunities require explicit open registration plus a future ISO-date
deadline to show Active; closed/expired items show Ended, and unclear status is
Unverified/Unknown. This deliberately misses some genuine evergreen programs.
Funding requires explicit raised/secured/closed wording, a named round and an
amount; dates/investors appear only when explicitly parsed. Total funding is not
inferred or summed. Only explicitly linked product comparisons populate similar
projects; otherwise no reliable comparison and insufficient originality evidence
are displayed. No claims of global uniqueness are generated.

Every claim refers to deduplicated sources with URL, title, domain and checked
UTC time. Features have a 24-hour freshness policy, opportunities one hour;
stale Active items render Unknown. Historical funding evidence is not removed
based on its announcement date. HTTP failures, blocks and empty pages yield
partial/unavailable intelligence without affecting the existing onchain result.

Fetch protections reject credentials, non-HTTP schemes, nonstandard ports,
localhost/private/link-local IPs, local domains and unsafe DNS answers. Each
redirect is revalidated; requests pin the validated DNS address while preserving
TLS hostname checks. Limits: six pages, 512 KiB per response, three redirects,
four-second request/DNS deadlines and a 24-second research budget. Only HTML/plain
text is accepted; scripts/styles are stripped. API bodies are limited to 4 KB,
with same-origin browser requests and three concurrent jobs per runtime.

`RuntimeRepository` holds at most 100 detached results for one hour and coalesces
concurrent requests for the same normalized identity. It is **not persistence**:
Vercel cold starts, runtime recycling and separate instances lose/share no cache.
Website identities normalize protocol/www/tracking aliases, retain meaningful
paths (to avoid conflating shared-host projects), and normalize X/Twitter handles.
Future durable research needs a repository keyed by project identity with append-only
funding/evidence history, shared job/rate limits and scheduled refresh. Broader
research also needs vetted search/index providers, better entity resolution and
content extraction/rendering; protected social sources may require authorized
API access. No public-access reliability is promised for sites that block bots.

Regression commands: `npm run lint`, `node --test frontend/tests/*.test.mjs`,
`python -m pytest tests/direct/ -q`, `npm run build`, `git diff --check`.
The mocked browser harness covers 1440/768/390/320 px without live transactions.

Validation note: mocked official-source/security tests and the responsive browser
harness pass. A read-only live check of `https://ipfs.tech/` timed out in the
current execution environment (sandbox DNS also failed); live source reliability
has not been demonstrated here. The final production build uses Next's webpack
CLI option because Turbopack's CSS worker hit a local-port permission error, even
after escalation. No build script or deployment setting was changed.

### Phase 5B-2: broader web intelligence

Research remains an explicit **Research Project / Refresh Research** action. The
Node-only API uses `OfficialResearchProvider`, a normalized `ExternalSearchProvider`
(`search(query, options)`), `FundingResearchProvider`, and `ResearchOrchestrator`.
The UI consumes the existing validated sidecar, never vendor response objects.
`search.mjs` contains the Tavily adapter; `orchestrator.mjs` owns discovery, trust,
claim merging and failure isolation. Neither module is imported by client code.
No contract, V3 history/storage, wallet, deployment, or dependency changes are made.

To activate broader research, set these **server-only** variables in the local
Next environment (or, when separately authorized, the hosting environment):

```text
CAPTAINSCOUT_SEARCH_PROVIDER=tavily
CAPTAINSCOUT_SEARCH_API_KEY=<your actual Tavily API key>
```

Restart the Next server after setting them. Do not use `NEXT_PUBLIC_` prefixes.
Do not commit the local environment file. The adapter posts to the fixed Tavily
search endpoint using basic search, explicitly disables automatic parameters,
answers, images and raw content, and returns only normalized URL/title/snippet,
optional publication date, provider and source type. See the
[Tavily search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search).
Missing provider/key or unsupported configuration makes **no provider request**;
official research continues and the UI states broader research is not configured.
Upstream errors are sanitized; API keys, billing and vendor error bodies are never
returned. Search snippets are discovery hints only, never verified claims.

Research limits per project: six queries, three inspected results per query,
eight external pages (one features, two comparisons, two funding, and one for
each opportunity query), 512 KiB per search response/page, ten-second search timeout,
four-second page timeout, three redirects, and a 45-second combined budget.
Official research retains its six-page/24-second limits and DNS-pinned transport.
Queries cover features/services, comparisons, funding/investors, testnets/points/
quests, nodes/validators/ambassadors/hackathons and waitlists/early access.
Paid discovery requires a usable identity from the official page title; blocked
X-only sources do not trigger guessed searches. No automatic or background paid
research occurs. Refresh reuses fresh caches rather than forcing paid calls.

Search-result pages use the same SSRF-safe HTML/plain-text fetcher as official
pages: public DNS answers only, pinned connections, preserved TLS hostname checks,
redirect revalidation, safe schemes/ports, no credentials, bounded bodies and no
script execution or headless rendering. External paragraphs must explicitly name
the resolved project to supply claims. This conservative English heuristic can
miss valid sources, renamed entities, unusual wording and JavaScript/PDF content.

Evidence preserves provider, source class, trust, checked time and first seen
where available. Classes rank OFFICIAL > PRIMARY > REPUTABLE_SECONDARY > COMMUNITY
> UNKNOWN. Exact known official hosts, a conservative investor/announcement domain
list and a conservative publication/database list determine classification;
unknown publishers are not automatically trusted. Domain ranking is a heuristic,
not editorial fact checking. Every extracted claim refers to fetched evidence.
Duplicate URLs and normalized identical claims merge citations. External unknown/
community capabilities remain Unverified; these sources cannot establish funding
or comparable projects. Official statements keep the Phase 5B-1 semantics.

Features include offered/announced capabilities and explicit target users.
Comparisons require an explicit linked comparison and a concrete product category
such as storage/lending/payments/rollups rather than broad AI/blockchain/DeFi labels.
At most five comparisons appear; specific stated implementation differences are
shown when present, otherwise the difference is explicitly unconfirmed. Originality
is Common model or Differentiated implementation only when supported by comparisons
and stated differences; otherwise Insufficient evidence. Highly differentiated and
Potentially novel remain schema options, never invented by this heuristic.

Funding requires explicit raised/secured/closed wording, an amount and named round.
Explicit dates/investors and an explicitly named lead investor are retained; duplicate round/date/amount reports merge
citations and investor names. Conflicting amounts retain both Unverified reports.
Only explicit disclosed totals are accepted; contradictory totals remain Unverified
with both amounts and citations. No total is guessed from partial rounds, logos,
token metrics, TVL or valuations.
Verified historical funding is retained during refresh in a bounded per-process
snapshot with its original evidence; its announcement age never expires the round.
External Active opportunities require a trusted fetched statement, explicit open
registration, a future dated deadline, and publication within seven days. Upcoming
language maps to Announced, closed/expired campaigns to Ended, and stale/undated
claims to Unknown. Participation URLs, source class, checked time and citations
are retained. The UI downgrades stale Active items after one hour without modifying
stored sidecars.

Caches are behind `RuntimeRepository`: at most 100 detached entries per repository,
one-hour whole-result cache with in-flight identity coalescing and at most three
concurrent jobs. Search query caches use 24 hours for features, seven days for
comparisons, 30 days for funding, and one hour for opportunities. Historical funding
snapshots are capped at 100 projects, with no age expiry. All caches are ephemeral
and instance-local; cold starts/eviction lose state and separate instances may
repeat searches. Future durable persistence needs identity-keyed evidence/claim
records, funding conflict history, per-type freshness, shared coalescing/rate limits
and source provenance. No database or scheduled service is added. This same identity
→ evidence → enrichment pipeline can later accept Radar/feed discoveries; FrontRun
monitoring, authorized X access, and Radar ingestion are not implemented here.

Initial Phase 5B-2 validation (historical; superseded by repair results below): TypeScript passes; all six JavaScript
suite files pass (137 individual tests with non-isolated reporting, including 47
new provider/orchestration cases); all 34 direct Python tests pass. Production
webpack build passes using the authorized CLI fallback after the known Turbopack
port-binding restriction. Mocked browser QA passes at 1440/768/390/320 px for both
populated broader research and official-only/disabled-provider states, with no
overflow or runtime errors and no live wallet transactions. No provider or API key
is configured locally, so paid/live broader research was not attempted. A bounded
live official-source check retrieved one IPFS source and six capabilities; a
linked-page timeout was isolated. Provider semantics are validated with mocked
HTTP responses; a minimal live adapter check remains necessary after supplying a
real server-side key. Extraction is conservative and does not promise exhaustive
competitor, funding, or opportunity coverage.

Phase 5B-2 identity gate repair: broader queries require an identity derived from
usable HTML at the submitted official root, fetched with public DNS validation,
pinned SSRF-safe transport, and validated redirects. Child failures retain that
identity and successful evidence and make official research Partial. Root failure
blocks broader research; historical analysis text alone never unlocks search.
The root has a 12-second allowance, child pages 4 seconds, and the official stage
keeps its 24-second total budget. DNS and redirects share each fetch deadline.
Explicit Refresh retries official research even after a cached root failure;
fresh category search caches and concurrent-request coalescing still avoid
unnecessary provider calls. Provider failure retains official evidence.

Phase 5B-2 external-evidence repair: Tavily authentication has been confirmed
separately; this repair never changes credentials. Successful search results now
retain safe discovery metadata (provider, title, summary, result URL, query groups,
class, domain and checked time) even when fetch or extraction yields no claims.
`DISCOVERY` evidence is always Unverified and cannot support any extracted claim.
`FETCH_VERIFIED` describes a fetched page; its source rank and entity context still
determine claim trust. Funding continues to require reliable fetched statements.
Meaningful URL query parameters survive normalization; tracking is removed.

The former external catch collapsed DNS, HTTP, timeout, TLS, content and size
failures into one misleading safety message and discarded every failed source.
An optional server-only `onDiagnostics` callback now reports bounded per-query
counts and fixed categories, without upstream bodies, raw errors, or credentials.
Diagnostics never enter the API response. Search groups run concurrently within
the unchanged 45-second combined budget, so earlier page fetches cannot prevent
later search invocation. Per-section availability separates empty successful
searches from provider failure, partial fetches, and budget skips. Empty funding
is displayed as “No reliable funding information found.”

IPv6 checks now accept public `2001:` addresses while still rejecting transition,
documentation, local and reserved ranges; all DNS answers remain validated before
pinning, and redirects are revalidated. Public IPv6 literals are resolved without
URL brackets. External source classes are determined by the source domain, not
by Tavily metadata or arbitrary links found on the official site.

Feature extraction checks the final extracted clause, excludes navigation and
audience headings, and retains actual grant/support services. Generic node network
explanations no longer establish participation programs. Opportunities merge using
normalized type/title, participation URL and source/evidence relationships; distinct
program URLs stay separate. Source status stays bound to its own statement.
The existing sidecar uses Active / Announced / Ended / Unknown (corresponding to
ACTIVE / UPCOMING / ENDED / UNKNOWN); it adds no persisted contract fields.

One fresh Ethereum broader validation was performed, with empty runtime caches:
all six Tavily requests hit the unchanged five-second timeout; no HTTP response,
normalized result, or external fetch was obtained. Six official sources survived,
with official AVAILABLE, broader UNAVAILABLE, and final enrichment Partial.
The recorded snapshot had zero comparables/funding, and opportunities 8 → 7.
It exposed additional mixed-heading and generic-node extraction cases, subsequently
fixed and covered by mocks; the snapshot therefore precedes those final extraction
refinements. No second Tavily run was made. The earlier generic external failure
cannot be retrospectively attributed to DNS, IPv6, HTTP, size or timeout without
its original diagnostics. Successful external flow is demonstrated by regression
fixtures, not by this timeout-limited live attempt.

Final repair verification: TypeScript passes; all six JavaScript test files pass
(179 individual cases); 34 direct Python tests pass; `git diff --check` passes.
Turbopack hits the known local port-binding restriction; the authorized webpack
production build passes without configuration changes. Mocked responsive QA passes
at 1440 / 768 / 390 / 320 px, including discovery-only labels and absence of raw
diagnostics, with no overflow, browser errors, live requests or wallet transactions.

Phase 5B-2 Tavily timing validation (2026-10-04): three sequential minimal direct
searches returned HTTP 200 and one result in 2,394 / 5,528 / 2,046 ms. The external
provider deadline is now 10,000 ms (previously 5,000 ms); the six searches remain
concurrent within the unchanged 45,000 ms combined budget, which starts before
bounded official research. Query/result/page/byte limits, caching, explicit
Research/Refresh actions and evidence trust rules are unchanged.

One fresh Ethereum validation returned six successful Tavily queries, zero
provider timeouts or other failures, and 18 normalized results. Successful search
latencies were min/median/max 4,894 / 5,169 / 5,433 ms. Eighteen URLs were accepted,
zero safety-rejected, eight page fetches timed out and ten were skipped by the
existing page limits. No external page was fetched successfully. Official research
was AVAILABLE (six evidence records); broader research was PARTIAL (18 Unverified
discovery records, zero fetch-verified external records). Providers: official 6,
tavily 18; source classes: OFFICIAL 6, UNKNOWN 16, REPUTABLE_SECONDARY 2.
Comparables 0, funding rounds 0, deduplicated opportunities 4, features 12;
enrichment Partial. Issue: an external source could not be fetched; discovery
metadata retained as Unverified. No GenLayer transaction was submitted.

Timing regression tests cover responses just below/above the default deadline
with a mocked clock and six concurrent bounded searches with one provider timeout,
retained official evidence, partial groups, retained discovery metadata and deadlines
clipped to the remaining overall budget. Existing
empty-success and sanitized provider-category coverage remains intact. All 183
JavaScript tests (179 existing plus four timing/budget tests), 34 direct Python tests,
and TypeScript validation pass.
`git diff --check` passes. Turbopack failed on the known local port-binding
restriction; the requested webpack production build passed. Responsive mocked
browser QA passed at 1440 / 768 / 390 / 320 px without overflow or runtime errors.
Timing work changes only this documentation, the external search timeout and
mocked regression tests. No commit, push, merge, deployment or credential change.

Phase 5B-2 external fetch repair: external pages have a dedicated 12-second
absolute allowance (including DNS, redirects, TLS and body reads), capped by the
remaining 45-second combined research deadline. Three workers fetch at most eight
pages; the 512 KiB ceiling and all public-network safety checks remain unchanged.
Selection reserves a candidate per query group before filling remaining slots,
ranking PRIMARY, REPUTABLE_SECONDARY, OFFICIAL, UNKNOWN, then COMMUNITY within
those groups. Discovery metadata survives skipped/failed fetches as Unverified;
only fetched entity-scoped content can support claims. Funding search availability
reflects successful discovery, independently of whether a reliable round exists;
page failures still keep broader enrichment Partial.

Live diagnostics found DNS resolution exceeding the previous four-second page
allowance (4.642 and 5.964 seconds), rather than Tavily consuming the deadline.
The Tavily ten-second timeout, official 12-second root/four-second child allowances,
and 24-second official budget are unchanged. Fetch diagnostics expose only host,
source class, query group, assigned timeout, elapsed time and fixed result codes.

## Captain’s Radar — Phase 6A

Radar is a separate, read-only server subsystem in `frontend/lib/radar/`. Its generic
`RadarSourceAdapter.discover({checkedAt, deadline})` boundary allows future sources
without changing project research, wallets, contracts, or historical records.
`types.ts` describes its normalized discovery/evidence/diagnostic response.

`FrontRunWebsiteSource` starts at the public homepage, follows same-site public
blog, trending, startup/sector, watchlist and receipt links, and parses passive HTML
(including noscript content). It does not execute JavaScript or recursively crawl
external sites. Explicit EARLY entries, project-handle flag receipts, and named
launch/funding statements qualify; ordinary editorial mentions and unidentified
stealth founders do not. Missing data stays null/empty. Categories are raw source
labels, including AI, Robotics and Healthcare; every identity is UNCLASSIFIED.

`FrontRunXSource` uses the existing server-only configured Tavily provider for two
fixed account-scoped queries. Only HTTPS `x.com/frontrunvc/status/<numeric-id>`
URLs (including twitter.com aliases) are accepted. Search snippets remain
UNVERIFIED / DISCOVERY_ONLY, even when their URLs establish account ownership.
Exact status metadata also survives when a snippet cannot identify a project;
these records live in source diagnostics rather than inventing project identities. No X credentials,
cookies, browser sessions or direct X scraping are used. Provider error codes are
sanitized; response bodies, keys and upstream exception messages are excluded.

Every event retains exact canonical source URL, title, text, publication date when
available, check time, verification status and deterministic event ID. Identifiable
embedded FrontRun post links are retained as `originatingPostUrl`. Publication dates
and explicit flag dates are separate; calendar-only dates retain date precision.
Vague relative dates do not acquire invented timestamps. Funding/investor fields
are FrontRun claims, not independently verified CaptainScout funding intelligence.

Project identities use normalized handles and website host/path keys (www,
tracking parameters, trailing slashes and X/twitter aliases normalized). Shared
hosting paths remain distinct. Exact strong-key overlap merges identities and
retains all distinct source/text events, earliest flag date and retrieval time.
Names without strong identity are scoped to the exact FrontRun source URL to avoid
merging unrelated names. Such cautious name-only identities may remain separate
until a later phase establishes an explicit identity bridge. Handle-based IDs stay
stable when a website appears later; website-only IDs may change when a handle is
subsequently established. No fuzzy name matching is performed.

`GET /api/radar` returns a snapshot only; it never retrieves sources. Explicit
`POST /api/radar/refresh` runs one bounded refresh and rejects mismatched browser
origins. Both return no-store responses. In-flight refreshes coalesce, and a
60-second cooldown prevents repeated calls from spending credits. Process-local
memory keeps the latest result until restart; GET responses are cloned to prevent
mutation. Source events accumulate during the runtime session, preserving first retrieval
and latest check times. A failed source does not erase previously successful evidence. Diagnostics reflect the current attempt; counts describe
fresh events, while retained evidence may also appear in the discovery pool.
There is no durable persistence, multi-process cache guarantee, authentication or
distributed rate limiting; a publicly exposed endpoint will need access controls
and a shared budget before broader deployment.

Refresh limits: at most 3 index pages plus 5 article pages, a bounded 24-link queue,
2 basic Tavily queries with at most 3 results each, a 12-second homepage bootstrap,
4-second linked-page fetches, 10-second search operations and a 30-second overall
deadline. The homepage allowance was raised after the final sample timed out;
that change has mocked coverage but has not received a second live refresh. Fetches reuse Phase 5 SSRF protections: public
DNS/address validation, pinned DNS, validated redirects, credential rejection,
512 KiB bodies, safe content types and at most 3 redirects. No new dependencies
or weakened network controls. Adapter deadlines also bound misbehaving injected
providers; the built-in fetch/search implementations cancel their own timed-out IO.

Phase 6A does **not** classify crypto relevance, show the production Radar UI,
persist discoveries durably, run on a schedule/background monitor, or submit
GenLayer transactions. Phase 6B should consume identity keys, raw descriptions and
categories, all event evidence, source trust/availability and explicit funding/flag
claims rather than treating any category as a final crypto decision.

Deterministic fixtures and regression tests: `node --test frontend/tests/radar.test.mjs`.

Phase 6A local live validation (2026-10-04): one homepage acquisition plus five
linked-page attempts, with the homepage reused from memory while adapting noscript
parsing; no homepage re-crawl. Website: 6 pages requested, 1 successful, 3 raw
events / 3 identities / 0 merges, five sanitized page-unavailable issues. X: 2
queries attempted, 0 successful, 0 returned/accepted/rejected/extracted, two
sanitized provider failures. Combined: 3 events / 3 identities / 0 merges, all 3
with handles, 0 with websites, 2 with funding mentions, 0 with explicit calendar
flag dates. Final parsing of the saved HTML (no further network requests) yielded
`techdollarhq` ($3M pre-seed; 123-day claim), `orthogonal_sh` ($4.3M round led by
Pantera; 184-day claim), and `rialto_xyz` (26-day claim). All evidence originated
at `https://frontrun.vc/`, with no inferred originating X post or publication date.
Only three real records were available, so a five-record live sample cannot be
provided honestly. The validation is partial; it does not establish live article
or X extraction success. Deterministic fixtures cover those adapters separately.


Phase 6A repair validation (2026-10-04): the public homepage provides noscript
anchors and schema metadata; the blog index provides normal receipt/watchlist
anchors. No remote JavaScript was executed. `sitemap.xml` was rejected as an
unsupported content type by the unchanged shared fetcher and is not used.
Relative links now normalize retrieval hosts/trailing slashes, deduplicate queue
entries, exclude static/legal/navigation resources, and prioritize public indices
and receipts. Only indices enqueue links; articles do not crawl recursively.
Receipt sections preserve original source text, bind explicit full dates to their
own heading, and retain exact originating FrontRun status links. Missing official
project websites remain null. Numbered post entries, optional handle/flag dashes,
"days early" and pronoun/aggregate rejection have regression coverage.

The previous five page failures and two X failures saved generic errors only,
so their exact historical categories/timings cannot be recovered. Diagnostic
fetches of the five reconstructed linked paths all succeeded outside the sandbox:
`/blog`, `/trending`, `/startups`, `/blog/how-to-build-an-ai-deal-flow-agent`, and
`/blog/harmonic-alternatives`. Each was assigned 4 seconds. Captured live homepage
and article HTML replay produced 7 events, 4 identities and 3 real same-handle
merges; this is diagnostic HTML replay, not a second fresh validation. The receipt
`/blog/fundraise_receipts-2026-10-01/` exposed full flag dates, funding and a
FrontRun-owned originating status link, but no official project websites.

One direct Tavily diagnostic succeeded (HTTP 200, 6.847 seconds, 3 exact FrontRun
statuses). That exceeds the previous 4-second Radar search allowance; Radar alone
now allows 10 seconds per query. The exact historical errors remain unknown.
Queries remain account scoped, two per refresh, three results per query. Direct X
HTML is never fetched. Search results cannot establish independently verified
funding, and a quoted "We raised" cannot become a project named "We".

Exactly one final fresh bounded refresh ran in 17.315 seconds. Website: 1 page
requested, 0 successful, homepage timed out after 4.004 seconds; 0 homepage or
article events. X: 2 attempted, 1 successful, 3 raw results, 3 accepted exact
FrontRun status URLs, 0 unrelated rejections; the other query timed out. The fresh
run initially produced one invalid pronoun identity. That defect was fixed and
its captured results replayed without network access: 1 project event/identity,
0 merges, 1 handle, 0 websites, 1 funding mention, 0 full flag dates and 1 lead-time
claim. The real identity is `@rtp`, from status `2097764994087534956`, a $35M Series A
claim and 160-day lead claim. Three UNVERIFIED / DISCOVERY_ONLY status metadata
records survive independently of project extraction. These corrected counts are
explicitly offline replay counts, not a second live refresh.

Phase 6A is **not checkpoint-ready** under the requested final live acceptance
criteria: website extraction did not succeed during the sole final fresh run, and
the homepage timeout adjustment and final parser correction remain live-unvalidated.
No further live refresh, commit, push, tag, merge, contract change or deployment
was performed. Deterministic coverage includes 38 Radar tests (25 original plus
13 regressions); all seven frontend test files and 34 direct Python tests pass.

### Phase 6B — Radar crypto relevance

Phase 6B adds a server-only deterministic classifier in `frontend/lib/radar/classification.mjs`. It augments normalized Phase 6A identities through a separate runtime cache; discovery events, first-seen times, funding, flag dates, provenance and identity keys remain intact. It reuses Phase 5 safe fetch, passive page parsing, official research cache and configured search provider without invoking the full research orchestrator or a GenLayer transaction. No category is used in the decision.

`GET /api/radar` remains read-only and includes `classification`, `classificationEvidence`, `classificationCache` and the compatibility `classificationStatus`. `POST /api/radar/classify` accepts `{ "ids": ["existing-radar-id"], "refresh": false }`, with 1–5 unique existing identities. Explicit discovery refresh must happen first. Cross-origin requests, unknown identities and invalid batches are rejected. Each result reports CLASSIFIED, CACHED or FAILED; failures retain earlier results and never remove discoveries. Only one batch can run per process.

Classification schema: status, confidence (0–100 or null), reason, cryptoSignals, networks, evidenceIds, classifiedAt, sourceCoverage (frontrun/officialProject/broaderWeb), needsReview, tokenStatus. Outcomes are CRYPTO_RELEVANT, POSSIBLY_CRYPTO, NON_CRYPTO and UNCLASSIFIED. Unclassified records have null confidence/date. Evidence records contain id, sourceType, sourceUrl, title, bounded snippet, provider, verification, checkedAt, signalType, signalStrength and stale. FETCH_VERIFIED FrontRun evidence maps to VERIFIED (retrieval verification, not independent truth verification); search snippets remain UNVERIFIED.

Strong signals include explicit blockchain product usage, contract execution, wallet connect, stablecoin settlement, staking/restaking, product ZK verification, network participation, tokenized assets and integral governance/incentive tokens. Future roadmap statements, testnets and token announcements are medium. Generic Web3/decentralized marketing is weak. One fresh verified strong signal scores 94 with official evidence or 80 with FrontRun evidence. Two medium signals from different source hosts score 80. Incomplete medium signals score 60; weak, stale or unverified indications score 40 and remain POSSIBLY_CRYPTO. Weak evidence alone never produces CRYPTO_RELEVANT. NON_CRYPTO scores 15 and requires fresh verified FrontRun coverage plus at least 180 characters of official product coverage with no meaningful crypto indication. Poor coverage with no signal remains UNCLASSIFIED. Confidence represents crypto relevance, not confidence that a business is legitimate.

Identity starts with the explicit Phase 6A website or project handle, including a single unambiguous `frontrunvc flagged @project` claim in verified retained evidence. No website is guessed from a name. Website fetches may redirect only within the same normalized hostname; optional docs must be same-origin. Handle-only identities allow one exact owned-X search, but snippets cannot resolve a website or become verified technical evidence. Website identities allow one anchored broader search when official evidence is insufficient; secondary snippets remain unverified. Project-owned profile website resolution and secondary full-page corroboration are intentionally deferred until stronger identity verification is available.

Investor/cap-table references, founder work history, conference attendance, account follows, unrelated partnerships, merchandise payment and NFT marketing sentences are context only. Negated crypto claims do not become positive signals. Networks are extracted only from fresh verified product signal sentences; Base requires explicit usage/chain context. Token status (LIVE, ANNOUNCED, PLANNED, UNKNOWN, NO_TOKEN_EVIDENCE) is ancillary: tokenless products qualify. Ambiguity, conflicting claims, weak-only evidence, stale evidence and missing official coverage set needsReview.

Limits: five projects per explicit run, sequential concurrency, two official pages per project, one search query with three results, four-second fetch/search timeouts (at most approximately 12 seconds per project / 60 seconds per batch). Existing fresh official research is reused when useful. Runtime classification cache holds at most 100 normalized identity entries for one hour, stores evidence references and timestamps, returns MISS/FRESH/STALE and uses a discovery-evidence fingerprint to invalidate changed inputs. `refresh:true` bypasses both classification and official research cache. Stale results stay visible with needsReview; reads never reclassify. This is per-process memory, not distributed rate limiting.

Limitations: conservative English sentence rules can miss nuanced technical claims or suppress mixed investor/product sentences; source retrieval does not prove claims true; snippets may omit relevant details. A manual review flag is a handoff to Phase 6C. Phase 6B does NOT persist classification durably, automatically schedule Radar monitoring, build production Radar cards, or auto-submit projects to GenLayer. Phase 6C can consume the classification/evidence/cache metadata for filters, badges, sorting, review and explicit Research Project actions.

Phase 6B bounded live validation (2026-10-04): 31 FrontRun identities were retrieved; only five distinct projects were processed. Raw category was unavailable (`null`) for all five, so no category distribution was forced. HIFI → CRYPTO_RELEVANT / 80 (explicit “builds infrastructure for tokenized capital markets”, 10 evidence sentences); Limited → POSSIBLY_CRYPTO / 60 (self-custodial global accounts, 8 evidence sentences); Preview and Enigma → UNCLASSIFIED / null (ambiguous name-only identity, 2 evidence sentences each); Doxxnet → UNCLASSIFIED / null (insufficient product coverage, 59 collected evidence sentences before the final duplicate-reference protection). All five had empty network lists and needsReview=true. The two technical claims came from the retrieved [September 24 FrontRun receipt](https://frontrun.vc/blog/fundraise_receipts-2026-09-24); official coverage was absent, so review remains appropriate. All original discovery evidence was preserved. The live sample did not provide a safely supported NON_CRYPTO example; deterministic fixtures cover that outcome and cross-sector Robotics/Base, AI/ZK and FinTech/stablecoin cases.

### Phase 6C — Captain’s Radar UI

Captain’s Radar sits below Analysis History in the existing navy/mint dashboard.
Initial load reads only `GET /api/radar` from the process-local cache. Refresh Radar
explicitly invokes the bounded server discovery refresh; cards remain visible while
refreshing and when a refresh fails. Source health reports partial availability
without exposing provider errors.

The default view includes Crypto Relevant and Possibly Crypto discoveries. All
four stored classification states can be selected; an entirely unclassified cache
is shown with an explanation. Local search covers project, handle, category,
networks and server classification reason. Filters include classification, network,
source event, Needs Review, funding mention and retrieval within 30 days. Sorts
include newest retrieval, earliest explicit FrontRun flag, confidence, lead-time
claim and presence of a funding mention, with unknown values last and stable ID ties.

Cards show attributed funding, distinct flag dates and lead-time claims, explicit
classified networks, confidence, review status, first retrieval and classification
freshness. Expandable details expose server reasons, crypto signals, raw discovery
metadata, classification evidence and FrontRun provenance events. External links
accept only HTTP(S) without embedded credentials.

**New Gem rule:** Crypto Relevant plus an explicit FrontRun flag date (or source
publication date when no flag exists) within the preceding 30 days; future dates
and missing/invalid source dates do not qualify. Retrieval time is never used.

Classify and Refresh Classification explicitly call the Phase 6B API for one
identity. Failures remain local to that card and preserve its previous state.
Research Project fills and focuses Analyze Projects using an explicit website,
then a valid @handle. Missing reliable identity disables the action. It does not
press Analyze, request wallet approval or submit a transaction.

Radar uses 12 cards plus Show more, two desktop columns and one column at tablet
and mobile sizes. Wrapping controls, readable status text, labeled filters, visible
focus outlines and accessible disclosures support keyboard and narrow-screen use.
Deterministic Radar fixtures and mocked browser checks extend the existing QA suite.

Phase 6C does **not** schedule FrontRun monitoring, persist discoveries durably,
run background jobs, auto-analyze discoveries or auto-submit GenLayer transactions.

## CaptainScout v2 Phase 6D-1: durable Radar foundation

Radar domain logic uses a vendor-independent repository in
`frontend/lib/radar/repository.mjs`. The memory and Postgres adapters expose project,
append-only discovery, classification history, review-state, monitoring-run and
transaction operations. SQL stays inside the Postgres adapter. The only new runtime
dependency is `pg`, the server-side Postgres driver.

With no `CAPTAINSCOUT_RADAR_DATABASE_URL`, the app uses **MEMORY** (Session memory).
It retains state across service recreation within this process, but loses it on
restart and does not share it across instances. This is the local fallback, not
production durability. With the server-only URL configured, it uses **POSTGRES**.
Production durability requires configuring a Postgres-compatible database.
Credentials never belong in `NEXT_PUBLIC_*`. Connection failure returns a sanitized
503; it never silently falls back to memory or claims a durable write succeeded.

Apply `frontend/lib/radar/migrations/001_radar.sql` explicitly before enabling
Postgres. The migration is additive, transactional and repeatable; the application
does not apply it automatically. Tables normalize projects, identity aliases,
discovery events, classification history, review state and monitoring runs.
Bounded structured records use JSONB, with stable keys, unique canonical identities
and fingerprints, foreign keys and lookup indexes. No raw HTML is stored. Projects,
events, classification history and monitoring runs are retained; no deletion or
cleanup job runs in this phase.

Explicit Refresh Radar calls the same `runRadarMonitoring` ingestion engine as the
future scheduler endpoint, in both storage modes. It preserves manual classification
semantics: refreshing sources does not automatically research projects. GET Radar
reads the repository without crawling and returns safe persistence mode, latest run,
total project and new review counts. Classify still accepts 1–5 identities and now
persists classifications and evidence with history, previous status, change indicator
and `staleAfter`. Classification changes never reset review state or delete discoveries.

Project identity prefers explicit official website keys (hostname plus path to preserve
Phase 6A shared-hosting safety), then explicit X handle; aliases
allow a handle-only project to gain a website while keeping its ID. Name-only keys
are scoped to the source URL. Conflicting established domains or multiple matching
identities are skipped with a partial-run issue rather than merged automatically.
First seen is the initial monitoring observation, never a historical lead-time claim;
last seen advances only for identities observed again. First FrontRun flag and latest
source event dates remain separate from retrieval dates.

Discovery fingerprints include the stable project ID, canonical source URL, safely
established event type, source publication date and normalized source fragment.
Retrieval time and identity upgrades do not change event identity. Repeated events
are skipped across runs. Funding receipts remain separate historical events and
advance the latest funding mention. Event types are conservatively evidence-based:
FRONTRUN_EARLY, FRONTRUN_MENTION, FUNDRAISE_RECEIPT, FUNDING_UPDATE or UNKNOWN.
No first-discovery/funding claim is inferred solely from when monitoring started.

Review state is independent of relevance: NEW, SEEN, REVIEWED or DISMISSED.
`POST /api/radar/review` accepts only `projectId` and an allowed `state` (2 KiB body
limit and same-origin checks). Cards offer Mark Seen, Mark Reviewed and Dismiss.
Dismissal retains the card and all evidence; it never deletes data. NEW means the
persistent identity has not been acknowledged. The existing New Gem badge keeps
its Phase 6C time/classification meaning. Review state is currently shared across
Radar users; per-wallet/user review ownership is outside this phase.

`POST /api/radar/monitor` is scheduler-ready, authenticated with
`Authorization: Bearer <CAPTAINSCOUT_MONITOR_SECRET>`. Missing secret makes it
unavailable (503), including in production; wrong credentials return 401. It accepts
no client monitoring parameters and stores no request headers or secrets. Successful
requests run with SCHEDULED trigger, bounded source discovery and at most **5**
automatic classification attempts. Newly discovered or UNCLASSIFIED projects are
eligible; stale refresh requires an explicit engine policy (`refreshStale: true`)
and is disabled by default. Existing classified projects are not researched on every
cycle. Phase 6A source budgets remain unchanged: 3 index pages, 5 article pages,
2 X search queries with 3 results each, 30-second discovery budget. Existing Phase
6B per-project research bounds also remain unchanged. Automatic classification can
add research time after discovery; scheduler timeout/cadence must account for it.

Every admitted run records RUNNING then SUCCESS, PARTIAL or FAILED, trigger,
timestamps, source statuses, discovery/upsert/dedup counters, classification counters,
safe issues and duration. Cooldown/busy attempts are rejected before starting a run.
The minimum cooldown is 60 seconds. Memory transactions use a shared-store mutex
and rollback snapshot; an engine mutex also rejects duplicate concurrent calls.
Postgres uses `pg_try_advisory_xact_lock(684601)` in a database transaction, protecting
against overlap across instances using the same database, including review and
classification writes. Discovery/research runs under this transaction; a connection
is held for its duration. RUNNING is visible inside the transaction, and final records
become visible at commit. A process crash rolls back the transaction and can leave
no run record; independent crash-recovery/run leases are future hardening work.

Source failures retain prior discoveries and commit successful sources as PARTIAL.
Classification failure retains discovery and continues other projects. Unexpected
ingestion/storage failures roll back all writes; the engine attempts a separate
sanitized FAILED run record. If the database itself is unavailable, no failure record
can be guaranteed. Existing repository and UI data remain intact; runtime discovery
cache is independent and is not the source of truth returned by GET. SQL is
parameterized; requests are bounded while streaming. Persistence bounds names to
160 characters, handles to 15, URLs to 2048, funding text to 500, descriptions/source
fragments to 2000, reason to 1000, and issue messages to fixed safe strings. Arrays
and classification evidence are bounded. Read responses currently include retained
history; pagination/retention tuning should be assessed as production volume grows.

Deterministic tests cover cross-run A/B → A/B/C dedup, funding updates, identity
upgrades, classification transitions, review/dismissal, first/last seen, partial and
failed runs, rollback, locks, cooldown, auth, body bounds, migration shape and
parameterized SQL. Shared-store and injected SQL harness recreation checks do not
require an external database; they do not substitute for a real Postgres activation
test. Mocked browser QA covers 1440, 768, 390 and 320 pixels without live scouting.

**Production automatic monitoring is NOT activated yet.** No cron, database account,
external migration, deployment setting or contract change is part of Phase 6D-1.
Phase 6D-2 requires explicitly approved database provisioning/selection, applying
this migration, securely setting the database URL and monitor secret, real Postgres
restart/rollback/concurrency validation, choosing hosting execution timeout and
monitoring cadence/cost policy, then explicitly configuring and validating an
authenticated production scheduler. No GenLayer transaction is required.
