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
