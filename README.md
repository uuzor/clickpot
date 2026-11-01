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
Not run yet.
<!-- mainnet-txs:end -->

## Notes

- The tracker is the trusted party that counts clicks and pays creators. The contract only lets it pay approved creators from a campaign's own pot, and a business cannot withdraw before the campaign ends or a one hour notice passes.
- Click data lives in `server/data/` (SQLite). Do not delete it while campaigns are running.
