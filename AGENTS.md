# Clickpot

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What This App Does

Pay-per-click creator ads in USDC on Arc Testnet. Businesses lock a USDC pot in an escrow contract with a per-click rate. Creators apply (signed message), the business approves them onchain, and each creator gets a tracked link `/r/<code>`. A tracker server counts verified clicks and the operator wallet batch-settles payouts to creators from the pot.

## Deployed contracts (Arc Testnet, chain 5042002)

- ClickPot: `0xb403dff43fb2ff80dda8e3c817f3b15730be1929` (constructor: USDC `0x3600...0000`, 24h close notice and 24h settle grace, operator `0xB2dd2b332252DB92c8AEe470583e8A4d64afD155`, owner = platform deployer; owner can only rotate the operator)
- Operator wallet (pays gas and calls `settle`): `0xB2dd2b332252DB92c8AEe470583e8A4d64afD155`. Its key is `OPERATOR_PRIVATE_KEY` in `.env`. It must hold a little USDC for gas.

## Tech Stack

- Design: monochrome editorial tokens in `src/index.css` (obsidian, paper, stage-black, concrete, stone, sky-tint, deep-sky, brand-blue). Pill buttons, light (300) display type, sky-tint bands for decoration only, never on controls. One typeface (Figtree stands in for Oracle, swap in `index.html`, `src/index.css` and `tailwind.config.js`).
- Frontend: React 18, Vite, TypeScript, Tailwind, React Router, wagmi v2, viem, ConnectKit
- Contracts: Solidity + Foundry, `contracts/ClickPot.sol`. ABI copied to `src/abi/clickPot.ts` (regenerate from `contracts/out` after any contract change)
- Backend: Bun + SQLite in `server/` (`index.ts` routes, `db.ts`, `chain.ts`, `settle.ts`). `bun run dev` runs web and tracker together via `server/dev.ts`. The web app reaches it through the Vite `/api` proxy (the tracker routes have no `/api` prefix).
- Typecheck: root `tsconfig.json` covers `src` and `scripts`; `server/tsconfig.json` covers the tracker with Bun types.

## Key Files

- `src/pages/*` one file per route; `src/components/create`, `src/components/manage` for the flows
- `src/hooks/useChainTx.ts` wallet write helper (chain switch, receipt wait, friendly errors)
- `src/shared/messages.ts` signed-message formats shared by browser and server
- `server/settle.ts` batches pending clicks and pays creators; batches are idempotent via `batchId`

## Trust and rules

- Offchain: click counting, dedupe (one click per visitor per link per `CLICK_DEDUPE_MINUTES`), applications. Onchain: deposits, approvals, payouts, withdrawal lock.
- Never print or commit `.env`, `OPERATOR_PRIVATE_KEY`, or `server/data`.
- Share links must be built with `buildShareLink` from `src/lib/share.ts`.
