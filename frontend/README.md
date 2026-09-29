# Crypto Project Scout

Crypto Project Scout is an AI-powered dApp built on GenLayer.

Enter a project's official website and GenLayer validators analyze the project using web access, LLM reasoning, and consensus.

## Features

- Analyze crypto and Web3 project websites
- Determine whether a project meaningfully uses crypto
- Classify projects by category
- Identify blockchain and network usage
- Detect token status
- Determine development stage
- Generate concise use-case summaries
- Explain crypto integration
- Store analysis history onchain
- Retrieve previous analyses by URL

## GenLayer Contract

The application interacts with the CryptoProjectScout intelligent contract deployed on GenLayer Studio.

Configure your local deployment in .env.local.

Required variables:

NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN

Do not commit .env.local.

## Development

Install dependencies:

npm install

Run type checking:

npm run lint

Start the frontend:

npm run dev

Then open http://localhost:3000
