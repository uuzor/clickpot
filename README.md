# Clickpot

Pay-per-click creator ads settled in USDC on Arc Testnet. Businesses list a product and lock a pot of USDC with a price per click. Creators apply, get approved, share a personal tracked link, and are paid automatically for every verified click.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- Businesses: list a product, lock USDC at a per-click rate, approve creators, pause or top up, and withdraw what is left after the campaign ends.
- Creators: browse campaigns, apply with a signed message, share a tracked link, and watch USDC payouts arrive with explorer receipts.
- Visitors: open a creator's link, then continue to the product site.

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS, React Router
- wagmi, viem, ConnectKit (wallet connection)
- Solidity 0.8.28 and Foundry (escrow contract in `contracts/ClickPot.sol`)
- Bun server with SQLite for click tracking and automatic payouts (`server/`)

## Development

Prerequisites: Bun, Foundry.

```bash
bun install
bun run dev        # web app on :5173 and the tracker on :3001
bun run check      # lint and typecheck
bun run build      # production build of the website
bun run start      # serves the built website and the tracker on one port (set NODE_ENV=production)
bun run contracts:build
bun run contracts:test
```

`bun run dev` starts both the web app and the tracker. The web app proxies `/api` to the tracker.

### Environment variables

- `VITE_CLICKPOT_ADDRESS`: address of the deployed escrow contract on Arc Testnet.
- `OPERATOR_PRIVATE_KEY`: key of the payout wallet that settles verified clicks. It needs a little USDC for gas. Keep it secret.
- `VITE_OPERATOR_ADDRESS`: public address of the payout wallet.
- `CLICK_DEDUPE_MINUTES`: optional, how long one visitor counts once per link (default 60).
- `TRACKER_PORT`: optional, tracker port (default 3001).
- `DATA_DIR`: optional, where the tracker database is stored (default `server/data`).
- `CLICK_HOLD_SECONDS`: optional, how long a click is held before payout (default 30).
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional outside Arc Studio. When present the tracker uses them for RPC, otherwise it uses the public Arc Testnet RPC.

## Mainnet smoke run

`scripts/mainnet-flow.ts` runs one full business and creator cycle on Arc mainnet with fresh wallets. It moves real USDC, so run it on your own machine and review it first. Needs about 0.3 USDC on Arc mainnet.

```bash
forge build
bun scripts/mainnet-flow.ts keygen     # prints the deployer address to fund
bun scripts/mainnet-flow.ts run        # deploy, fund, create campaign, approve creator, pay clicks
bun scripts/mainnet-flow.ts close      # later: request early close
bun scripts/mainnet-flow.ts withdraw   # after the one hour notice: take back the leftover pot
```

Keys are saved in `.env.mainnet.json` (ignored by git). Never share or commit it. Each run records transaction hashes in the section below.

### Mainnet transactions

<!-- mainnet-txs:start -->
Arc mainnet (chain 5042) smoke run, recorded 2026-11-01. ClickPot: [`0x8199b96ea4ee0668f6e14d8da92aa1c43c866a4c`](https://explorer.arc.io/address/0x8199b96ea4ee0668f6e14d8da92aa1c43c866a4c), campaign #1. USDC (6 decimals): `0x3600000000000000000000000000000000000000`. Deployer is both owner and operator; close notice and settle grace are both 1 hour.

Wallets for this run (the deployer was funded with 0.3 USDC; the script funds the business from it, and payouts fund the creator):

| Role | Address | Start | End |
| --- | --- | --- | --- |
| Deployer (owner + operator) | [`0x61EAE88bE7566A5E2850858204Daf81cc9281332`](https://explorer.arc.io/address/0x61EAE88bE7566A5E2850858204Daf81cc9281332) | 0.3 USDC | 0.105169 USDC |
| Business | [`0x2738066bBB6C8fDaC68B247371bFc4ed89Cc473f`](https://explorer.arc.io/address/0x2738066bBB6C8fDaC68B247371bFc4ed89Cc473f) | 0 USDC | 0.042166 USDC |
| Creator | [`0xCe9AfD68c376283b8fbfd44Cc4D2A0Fa5b737cB1`](https://explorer.arc.io/address/0xCe9AfD68c376283b8fbfd44Cc4D2A0Fa5b737cB1) | 0 USDC | 0.03 USDC |

Campaign #1: rate 0.01 USDC per click, deposit 0.10 USDC, duration 24h. The operator settled 3 clicks (0.03 USDC) to the creator, leaving 0.07 USDC escrowed until withdrawal.

| # | Step | Transaction |
| --- | --- | --- |
| 1 | Deploy ClickPot | [`0x4666f1eb339c99fcc5418b94598bc3b29750e05c6e0d1ae61ea7c44e2453f399`](https://explorer.arc.io/tx/0x4666f1eb339c99fcc5418b94598bc3b29750e05c6e0d1ae61ea7c44e2453f399) |
| 2 | Fund business wallet (0.15 USDC) | [`0x4ff7842b9db1d9db2d52f2af3feb483550a4c7379fd94638867f6bffc4832bd9`](https://explorer.arc.io/tx/0x4ff7842b9db1d9db2d52f2af3feb483550a4c7379fd94638867f6bffc4832bd9) |
| 3 | Business approves USDC (0.10 USDC) | [`0xa8a81e1b7a16a24609eb788da031ec463ae8c09a3c39f2cb3ce9fdaada720771`](https://explorer.arc.io/tx/0xa8a81e1b7a16a24609eb788da031ec463ae8c09a3c39f2cb3ce9fdaada720771) |
| 4 | Business creates campaign #1 | [`0x42955935ec1213299ffca12ba07cbc5b8539e7e10cad58be3bc4fee05d731258`](https://explorer.arc.io/tx/0x42955935ec1213299ffca12ba07cbc5b8539e7e10cad58be3bc4fee05d731258) |
| 5 | Business approves creator | [`0x3fd21c6a792dc97de68ed8ec9eb6ef96c1231d23c1809d9644447b177716fbef`](https://explorer.arc.io/tx/0x3fd21c6a792dc97de68ed8ec9eb6ef96c1231d23c1809d9644447b177716fbef) |
| 6 | Operator settles 3 clicks (0.03 USDC to creator) | [`0x9158c8c507fdae43d8b1f6dbbfaa4224f6c75ba4a87db66d217acf70d59468e0`](https://explorer.arc.io/tx/0x9158c8c507fdae43d8b1f6dbbfaa4224f6c75ba4a87db66d217acf70d59468e0) |
| 7 | Business requests close (starts the 1h notice) | [`0x255049c7cd4ff767b6192b1a5d60bf31877eed451b71bae224ad3d3de5046339`](https://explorer.arc.io/tx/0x255049c7cd4ff767b6192b1a5d60bf31877eed451b71bae224ad3d3de5046339) |

Pending: `withdraw` (step 8) runs once the one hour notice from step 7 has elapsed; it returns the 0.07 USDC left in the pot to the business.
<!-- mainnet-txs:end -->

## Notes

- The tracker is the trusted party that counts clicks and pays creators. The contract only lets it pay approved creators from a campaign's own pot, and a business cannot withdraw before the campaign ends or a one hour notice passes.
- Click data lives in `server/data/` (SQLite). Do not delete it while campaigns are running.
