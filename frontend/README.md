# CaptainScout frontend

The Next.js frontend for CaptainScout, an AI-powered crypto project intelligence dApp using GenLayer consensus. It supports one project or a sequential batch of up to five websites / `@Xhandles`, with progress, expandable results, and onchain history. See the [repository README](../README.md) for the v1 release candidate, analysis fields, architecture, and validated baseline.

## Local development

Work on `captainscout-redesign`; `main` remains the stable GenLayer Portal reviewer-facing version. `captainscout-v1-rc1` is the live-tested application code checkpoint for CaptainScout phases 1–3. `captainscout-v1-rc2` is the current CaptainScout v1 release candidate including documentation.

Run these commands from the **repository root**, using Node.js 24 and npm:

```bash
npm ci
cp frontend/.env.example frontend/.env.local
```

Configure the local template with the intended public contract address, RPC, chain ID, network name, and symbol. Never commit local environment files or place secrets in browser-visible `NEXT_PUBLIC_*` variables. Then start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000); live writes require MetaMask and testnet GEN.

## Code map

- `app/page.tsx`: CaptainScout dashboard, input, progress, Latest Analysis, and Analysis History.
- `app/globals.css`: responsive scouting/radar visual design.
- `lib/scout/batch.ts`: URL / handle validation, normalization, deduplication, and sequential processing.
- `lib/contracts/CryptoProjectScout.ts`: existing GenLayer writes, receipt checks, reads, and result schema.
- `lib/genlayer/`: wallet implementation, RPC configuration, and fee helpers.
- `tests/`: frontend regression tests and browser QA utility.

A handle such as `@flop_labs` becomes `https://x.com/flop_labs` before submission. Equivalent profile sources are deduplicated while friendly handles remain visible in the queue. Each project uses a separate `analyze_project(url)` transaction and may require its own wallet approval. Failures receive per-project feedback and the remaining queue continues; successful results are verified and history is refreshed.

The circled × clears the draft input and transient input feedback without deleting history or cancelling the active queue. Keep the page open while a batch runs. X pages use the contract's existing website-fetching path, with no separate X API or OAuth integration.

## Checks

From the repository root:

```bash
npm run lint
node --test --test-isolation=none frontend/tests/*.test.mjs
npm run build
```

The RC1 application code checkpoint baseline is 28 frontend tests passed, TypeScript/lint passed, and a production build passed. The full release baseline also includes 34 GenLayer direct tests and successful live multi-project and `@Xhandle` validation; see the [root testing section](../README.md#testing-and-release-baseline).

After a production build, run browser QA in an environment with Playwright and Chromium available:

```bash
node frontend/tests/browser-qa.cjs
```

Playwright is a QA-environment prerequisite, not an application dependency installed by `npm ci`. The utility tests 1440px, 768px, 390px, and 320px layouts with controlled wallet/contract fixtures and blocks external requests. It covers mixed inputs, validation, deduplication, sequential failure recovery, results, and preservation of history when clearing. Screenshots are written to a temporary directory printed by the utility; it submits no live transactions.

### Established Cloud validation procedure

The prepared Cloud workspace uses a writable GenVM cache and its existing Python virtual environment:

```bash
cd /workspace/crypto-project-scout
HOME=/workspace \
GENVM_VERSION=v0.2.16 \
/workspace/.venvs/crypto-project-scout/bin/python -m pytest tests/direct/ -q
```

For the Cloud production build, temporarily add `experimental: { useTypeScriptCli: false }` to the existing configuration in `frontend/next.config.ts`, then run from the repository root:

```bash
npm run build --workspace=frontend -- --webpack
```

Restore the original `frontend/next.config.ts` **byte-for-byte afterward, even if the build fails**. This is a temporary Cloud validation workaround; do not commit it or apply it to production configuration.

## Preview deployments

Review CaptainScout through the Vercel Preview deployment associated with `captainscout-redesign`. Find the current preview URL in Vercel or the commit's deployment checks; avoid relying on an ephemeral URL in documentation. The stable reviewer-facing deployment associated with `main` and its production configuration remain unchanged unless a release is explicitly approved. Vercel hosts the frontend; the existing intelligent contract runs on GenLayer Studio / Studionet.

## Phase 4 archive and scouting UX

The dashboard retains Stored Analyses and Latest Analysis, while View History opens an accessible expandable archive. Search project names or source URLs, filter category, chain, token status, development stage, crypto usage and minimum confidence, and sort by stored order or confidence. Filters operate on fetched records only; they never write to or remove onchain history.

Select 2–5 archive records to compare their existing classification, confidence and use case. Selection stays intact while filtering and clears when history refreshes, so refreshed record positions cannot silently change the comparison. New batch completions appear in the archive after the existing history refresh.

Individual Retry project and Retry Failed run only failed queue entries with the existing sequential submission and receipt verification. Successful queue results remain available, including when clearing the draft. Retries still require the existing wallet approvals. Editing the draft does not alter a running batch or its retry sources.

Logo and wordmark slots retain the current radar mark and CaptainScout / Crypto Intelligence branding. Use Case and Crypto Integration have dedicated reading panels. Future intelligence modules are explicitly unavailable placeholders; no inferred or fabricated fields are displayed. The new logo, single-signature batch submission and additional contract data remain deferred.

`lib/scout/history.ts` holds pure filtering and comparison helpers. `tests/history.test.mjs` covers their behavior and retry snapshots. The browser harness also exercises hidden/revealed history, search, comparison, individual retry and Retry Failed against isolated fixtures with all live requests blocked.

Phase 4 validation in the local workspace: TypeScript passed; the requested Node test command passed all three test files (33 individual regressions verified by importing the suites in one Node process); all 34 direct Python tests passed; `git diff --check` passed. The default Turbopack build encountered an environment port-binding restriction, including an approved retry. `npm run build --workspace=frontend -- --webpack` passed with no configuration changes. Isolated Playwright browser QA passed at all four widths; no live GenLayer transactions were submitted. Playwright 1.51.1 and Chromium were installed only in `/tmp` for this environment.
