# Repository Guidelines

## Project Structure & Module Organization

This npm workspace combines a Next.js frontend with Python GenLayer intelligent contracts; there is no separate application backend.

- `frontend/app/`: page, layout, providers, and global styles.
- `frontend/components/`: reusable UI components; `frontend/public/`: static assets.
- `frontend/lib/contracts/CryptoProjectScout.ts`: typed contract wrapper and result schema.
- `frontend/lib/genlayer/`: client configuration, MetaMask context, and fee estimation.
- `contracts/crypto_project_scout.py`: website analysis, validator consensus, and onchain history.
- `tests/direct/` and `tests/integration/`: mocked and network-backed Python tests.
- `deploy/`, `config/`, and `gltest.config.yaml`: deployment and network tooling.

## Build, Test, and Development Commands

Run from the repository root unless noted:

- `npm ci`: install locked workspace dependencies.
- `pip install -r requirements.txt`: install Python tooling in an activated virtual environment.
- `npm run dev`: start the frontend development server.
- `npm run lint`: check TypeScript with `tsc --noEmit`; this is not ESLint.
- `npm run build`: build the production frontend.
- `pytest tests/direct/ -v`: run deterministic tests without Studio.
- `genvm-lint check contracts/crypto_project_scout.py`: lint the main contract.
- `gltest tests/integration/ -v -s --network studionet`: run live integration tests.
- `npm run deploy`: deploy through the GenLayer CLI after selecting the intended network.

## Coding Style & Naming Conventions

Match surrounding code: four-space Python indentation and two-space TypeScript/TSX indentation. Use `snake_case` for Python functions, `camelCase` for TypeScript functions, and `PascalCase` for React components and types. Keep contract calls in the wrapper and shared wallet state in `WalletProvider`. No formatter is configured; use TypeScript checking and GenVM linting.

## Testing Guidelines

Use pytest files named `test_*.py` and functions named `test_*`. Mock web and LLM responses in direct tests. Add regression coverage for changed contract behavior; integration tests exercise real external services and are excluded from CI. No coverage threshold or frontend test runner is configured. CI checks contract linting, direct tests, TypeScript, and production builds.

## Commit & Pull Request Guidelines

Recent commits use concise imperative subjects, such as `Fix HTTP fallback response status`. Follow that convention. PRs should explain behavior changes, list validation, link relevant issues, and include screenshots for UI changes. Document contract schema or deployment impacts explicitly.

## Configuration & Contract Compatibility

Copy `frontend/.env.example` to `frontend/.env.local`; never commit secrets. Verify RPC, chain, and contract address together. Preserve storage compatibility when upgrading contracts. Branding changes are frontend-only; new persisted analysis fields require coordinated contract, client, and test changes.

## CaptainScout Development Rules

- The active development branch is `captainscout-redesign`.
- Never modify, merge into, or push directly to `main` unless explicitly instructed. `main` is the stable GenLayer Portal reviewer-facing version.
- Do not deploy a new GenLayer contract or upgrade the existing deployed contract without explicit approval.
- Preserve the current GenLayer storage layout whenever an in-place contract upgrade is intended.
- Never commit `.env`, `frontend/.env.local`, wallet private keys, seed phrases, API keys, tokens, or credentials.
- Prefer frontend-only implementations when the existing contract already supports the required behavior.
- Avoid unnecessary new dependencies.
- Before declaring implementation work complete, run `npm run lint`, `npm run build`, `pytest tests/direct/ -q`, and `git diff --check` where applicable.
- Keep CaptainScout changes documented and testable.
- Do not change production deployment settings or the current reviewer-facing Vercel deployment unless explicitly instructed.
- Treat Git as the handoff layer between WSL/Codex Local and Codex Cloud; important work must be committed before being handed between environments.
