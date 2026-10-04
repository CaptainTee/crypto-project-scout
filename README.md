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
