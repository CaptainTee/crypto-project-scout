# Crypto Project Scout

[![CI](https://github.com/CaptainTee/crypto-project-scout/actions/workflows/ci.yml/badge.svg)](https://github.com/CaptainTee/crypto-project-scout/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Crypto Project Scout is an AI-powered GenLayer dApp for analyzing and classifying early-stage crypto, Web3, blockchain, and crypto-enabled technology projects from their official websites.

The intelligent contract uses GenLayer web access, LLM reasoning, and validator consensus to extract structured project information and store the resulting analysis onchain.

## Live V3 Deployment

**Network:** GenLayer Studio / Studionet

**Contract address:**

```text
0xB93De863a654495FE6a22F0d7743D77750E61833
```

**Deployment transaction:**

https://explorer-studio.genlayer.com/tx/0x909549daa9ff23b1da79dc937adfeb0f5bc951b56ec1f93a1a568e25952acf79

V3 adds self-contained source URLs to every new history record and introduces an authorized contract upgrade mechanism for future compatible versions.

## What It Does

A user submits the official website URL of a project.

Crypto Project Scout then:

1. Validates the submitted URL.
2. Uses GenLayer web rendering to retrieve the website content.
3. Sends the website content to an LLM with a structured classification prompt.
4. Uses GenLayer validator consensus to validate core classification fields.
5. Stores the accepted analysis onchain.
6. Stores the original source URL with the analysis.
7. Makes historical analyses available through public read methods.
8. Displays the stored results in the frontend.

## Analysis Output

Each V3 analysis stores structured data containing:

- Project name
- Whether the project meaningfully uses crypto
- Category
- Blockchain or network
- Token status
- Development stage
- Use case
- Crypto integration
- Confidence score
- Source URL

Example:

```json
{
  "project_name": "Endure Network",
  "uses_crypto": true,
  "category": "DeFi",
  "chain": "Bittensor",
  "token_status": "Announced",
  "development_stage": "Pre-launch",
  "use_case": "Decentralized risk intelligence for financial markets.",
  "crypto_integration": "Uses Bittensor-based decentralized intelligence infrastructure.",
  "confidence": 94,
  "url": "https://endure.network/"
}
```

Actual LLM outputs may vary between analyses because website content and validator observations can change.

## Supported Categories

The intelligent contract classifies projects into one of:

- Blockchain-L1
- Blockchain-L2
- DeFi
- Wallet
- Infrastructure
- AI-Crypto
- Robotics-Crypto
- Gaming
- Other-Crypto
- Non-Crypto
- Unclear

## Token Status

Possible values:

- Live
- Announced
- Tokenless
- Unknown

## Development Stage

Possible values:

- Mainnet
- Testnet
- Devnet
- Pre-launch
- Unknown

## GenLayer Consensus

The project uses `gl.vm.run_nondet_unsafe()` with separate leader and validator execution.

The validator independently analyzes the same project website and checks agreement on the core classification fields:

- `uses_crypto`
- `category`
- `chain`

Only an accepted result is persisted by the contract.

Website content is explicitly treated as untrusted input in the LLM prompt so instructions embedded inside analyzed websites are not treated as contract instructions.

## Onchain History

V3 stores analysis history using GenLayer persistent storage.

Relevant public read methods include:

```text
get_last_url()
get_last_result()
get_analysis_count()
get_analysis_at(index)
get_latest_for_url(url)
```

The frontend loads this history and displays previous analyses in reverse chronological order.

Every new V3 history record contains its original source URL.

## Upgradability

V3 registers the deploying wallet as an authorized upgrader during construction.

The contract exposes:

```text
upgrade(new_code)
```

This allows future compatible contract code versions to replace the current code while preserving the existing V3 contract storage layout.

Future upgrades must maintain storage compatibility.

## Project Structure

```text
contracts/
  crypto_project_scout.py        Intelligent contract

tests/
  direct/
    test_crypto_project_scout.py Scout-specific direct tests
    test_patterns.py             GenLayer behavior/pattern tests

frontend/
  app/
    page.tsx                     Main Scout interface
  lib/
    contracts/
      CryptoProjectScout.ts      Contract client
    genlayer/                    Wallet, RPC, fee and client helpers

deploy/
  deployScript.ts                Contract deployment script

.github/workflows/
  ci.yml                         GitHub Actions CI

gltest.config.yaml               GenLayer test configuration
requirements.txt                 Python dependencies
```

## Requirements

- Python 3.12+
- Node.js
- npm
- GenLayer CLI
- GenLayer test/lint tooling
- MetaMask or another compatible wallet
- Testnet GEN for write transactions

Install the GenLayer CLI globally:

```bash
npm install -g genlayer
```

## Python Setup

This project can be set up with `uv`:

```bash
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

Verify:

```bash
python --version
genlayer --version
```

## Contract Linting

Run:

```bash
genvm-lint check contracts/crypto_project_scout.py
```

## Direct Tests

Run the Scout-specific tests:

```bash
pytest tests/direct/test_crypto_project_scout.py -v
```

Run the complete direct test suite:

```bash
pytest tests/direct/ -v
```

At the current V3 checkpoint, the direct suite contains 34 passing tests.

## Studionet Integration Test

A full end-to-end integration test is also included:

```bash
gltest tests/integration/test_crypto_project_scout.py -v -s --network studionet
```

This test deploys a fresh temporary `CryptoProjectScout` instance to GenLayer Studionet, performs a real website/LLM/validator-consensus analysis, and verifies that the resulting V3 analysis history is persisted correctly.

The integration test depends on the hosted Studionet and external validator execution, so it is intentionally kept separate from the deterministic GitHub CI suite.

## Frontend Setup

Move into the frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create your local environment configuration:

```bash
cp .env.example .env.local
```

Set:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
```

For the current V3 Studionet deployment, the contract address is:

```text
0xB93De863a654495FE6a22F0d7743D77750E61833
```

Do not commit `.env.local`.

## Run the Frontend

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Frontend Checks

Type-check the frontend:

```bash
npm run lint
```

Build the production frontend:

```bash
npm run build
```

## CI

GitHub Actions automatically runs contract linting and the direct test suite on pushes to the repository.

Repository:

https://github.com/CaptainTee/crypto-project-scout

## Security Considerations

Project websites are external and untrusted.

The contract prompt instructs validators to treat retrieved website content only as evidence about the analyzed project and to ignore instructions, prompts, commands, or requests embedded in that content.

The submitted URL itself is stored directly by contract logic rather than being generated by the LLM.

## Version History

### V3

- Stores the submitted project URL inside each new historical analysis
- Displays source URLs in the frontend
- Adds authorized contract upgradability
- Uses a fresh GenLayer Studionet deployment
- Current contract:
  `0xB93De863a654495FE6a22F0d7743D77750E61833`

### V2

- Added persistent analysis history
- Added lookup of latest analysis by URL
- Added richer crypto project classification fields

### V1

- Initial Crypto Project Scout intelligent contract
- Website rendering and LLM-based project classification

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
