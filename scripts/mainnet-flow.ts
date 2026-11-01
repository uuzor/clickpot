/**
 * Arc mainnet smoke run for ClickPot. RUN THIS ON YOUR OWN MACHINE, not in a shared sandbox.
 *
 *   bun scripts/mainnet-flow.ts keygen     create fresh wallets locally, print addresses only
 *   bun scripts/mainnet-flow.ts status     show balances and what has already run
 *   bun scripts/mainnet-flow.ts run        deploy, fund, create a campaign, approve a creator, pay clicks
 *   bun scripts/mainnet-flow.ts close      business requests early close (unlocks after the notice window)
 *   bun scripts/mainnet-flow.ts withdraw   business withdraws the leftover pot once unlocked
 *
 * Keys live in .env.mainnet.json and progress in .env.mainnet-state.json. Both match the
 * `.env.*` rule in .gitignore. Never commit or share them. Real USDC moves and cannot be undone.
 * Requires `forge build` first (reads contracts/out/ClickPot.sol/ClickPot.json).
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arc } from 'viem/chains'
import { clickPotAbi } from '../src/abi/clickPot'

const RPC_URL = 'https://rpc.mainnet.arc.io'
/** USDC ERC-20 view (6 decimals) on Arc, the same pool of funds as native gas. */
const USDC: Address = '0x3600000000000000000000000000000000000000'
const EXPLORER = 'https://explorer.arc.io'
const KEYS_FILE = '.env.mainnet.json'
const STATE_FILE = '.env.mainnet-state.json'
const README = 'README.md'
const MARK_START = '<!-- mainnet-txs:start -->'
const MARK_END = '<!-- mainnet-txs:end -->'
const MIN_FEE = 20_000_000_000n // Arc enforces a 20 Gwei maxFeePerGas floor

// Smoke-run parameters (USDC, 6 decimals).
const FUND_BUSINESS = parseUnits('0.15', 6) // pot plus the business wallet's gas
const RATE_PER_CLICK = parseUnits('0.01', 6)
const DEPOSIT = parseUnits('0.10', 6)
const DURATION = 24n * 3600n // contract minimum
const WINDOW = 3600n // contract minimum for close notice and settle grace
const CLICKS_PAID = 3

type Role = 'deployer' | 'business' | 'creator'
interface Keys {
  deployer: Hex
  business: Hex
  creator: Hex
}
interface Step {
  name: string
  hash: Hex
}
interface State {
  clickPot?: Address
  campaignId?: string
  steps: Step[]
}

const publicClient = createPublicClient({ chain: arc, transport: http(RPC_URL) })

function loadKeys(): Keys {
  if (!existsSync(KEYS_FILE)) throw new Error(`No ${KEYS_FILE}. Run: bun scripts/mainnet-flow.ts keygen`)
  return JSON.parse(readFileSync(KEYS_FILE, 'utf8')) as Keys
}
function loadState(): State {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State) : { steps: [] }
}
function saveState(state: State) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}
const account = (keys: Keys, role: Role) => privateKeyToAccount(keys[role])
const usdc = (value: bigint) => `${formatUnits(value, 6)} USDC`
const txUrl = (hash: Hex) => `${EXPLORER}/tx/${hash}`

function walletFor(keys: Keys, role: Role) {
  return createWalletClient({ account: account(keys, role), chain: arc, transport: http(RPC_URL) })
}

async function fees() {
  const est = await publicClient.estimateFeesPerGas()
  const maxFeePerGas = est.maxFeePerGas > MIN_FEE ? est.maxFeePerGas : MIN_FEE
  return { maxFeePerGas, maxPriorityFeePerGas: est.maxPriorityFeePerGas ?? 0n }
}

async function balanceOf(address: Address) {
  return publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
}

async function confirmPrompt(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${question}\nType MAINNET to continue: `)
  rl.close()
  if (answer.trim() !== 'MAINNET') throw new Error('Cancelled. Nothing was sent.')
}

/** Sends one transaction unless this step already ran, waits for it, and records the hash. */
async function step(state: State, name: string, send: () => Promise<Hex>): Promise<Hex> {
  const done = state.steps.find((s) => s.name === name)
  if (done) {
    console.log(`skip   ${name} (already ${done.hash})`)
    return done.hash
  }
  const hash = await send()
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${name} reverted: ${txUrl(hash)}`)
  state.steps.push({ name, hash })
  saveState(state)
  console.log(`done   ${name}\n       ${txUrl(hash)}`)
  return hash
}

function deployArtifact() {
  const path = 'contracts/out/ClickPot.sol/ClickPot.json'
  if (!existsSync(path)) throw new Error('Missing build output. Run: forge build')
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as { bytecode: { object: Hex } }
  return artifact.bytecode.object
}

function writeReadme(state: State) {
  if (!existsSync(README)) return
  const rows = state.steps.map((s) => `| ${s.name} | [\`${s.hash}\`](${txUrl(s.hash)}) |`).join('\n')
  const block = [
    MARK_START,
    `Arc mainnet (chain 5042) smoke run. ClickPot: ${state.clickPot ? `[\`${state.clickPot}\`](${EXPLORER}/address/${state.clickPot})` : 'not deployed'}, campaign #${state.campaignId ?? '-'}.`,
    '',
    '| Step | Transaction |',
    '| --- | --- |',
    rows,
    MARK_END,
  ].join('\n')
  const text = readFileSync(README, 'utf8')
  const start = text.indexOf(MARK_START)
  const end = text.indexOf(MARK_END)
  if (start === -1 || end === -1) {
    writeFileSync(README, `${text.trimEnd()}\n\n## Mainnet transactions\n\n${block}\n`)
  } else {
    writeFileSync(README, text.slice(0, start) + block + text.slice(end + MARK_END.length))
  }
  console.log(`README.md updated with ${state.steps.length} transaction hashes.`)
}

function keygen(): Promise<void> {
  if (existsSync(KEYS_FILE)) throw new Error(`${KEYS_FILE} already exists. Delete it yourself if you want new wallets.`)
  const keys: Keys = { deployer: generatePrivateKey(), business: generatePrivateKey(), creator: generatePrivateKey() }
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2))
  chmodSync(KEYS_FILE, 0o600)
  console.log(`Wallets created. Private keys are only in ${KEYS_FILE}.`)
  console.log(`Fund this one with about 0.3 USDC on Arc mainnet (chain 5042):\n  deployer ${account(keys, 'deployer').address}`)
  console.log(`Business ${account(keys, 'business').address} and creator ${account(keys, 'creator').address} are funded by the script.`)
  return Promise.resolve()
}

async function status() {
  const keys = loadKeys()
  const state = loadState()
  for (const role of ['deployer', 'business', 'creator'] as Role[]) {
    const address = account(keys, role).address
    console.log(`${role.padEnd(9)} ${address}  ${usdc(await balanceOf(address))}`)
  }
  console.log(`ClickPot ${state.clickPot ?? '-'}  campaign ${state.campaignId ?? '-'}`)
  state.steps.forEach((s) => console.log(`  ${s.name}: ${txUrl(s.hash)}`))
}

async function run() {
  const keys = loadKeys()
  const state = loadState()
  const deployer = account(keys, 'deployer')
  const business = account(keys, 'business')
  const creator = account(keys, 'creator')

  const chainId = await publicClient.getChainId()
  if (chainId !== 5042) throw new Error(`RPC reports chain ${chainId}, expected Arc mainnet 5042`)
  const bal = await balanceOf(deployer.address)
  console.log(`Deployer ${deployer.address} holds ${usdc(bal)}`)
  if (!state.clickPot && bal < parseUnits('0.25', 6)) {
    throw new Error('Deployer needs about 0.3 USDC before the first run.')
  }
  await confirmPrompt(
    `This sends REAL transactions on Arc mainnet: deploy ClickPot, send ${usdc(FUND_BUSINESS)} to the business wallet, ` +
      `lock ${usdc(DEPOSIT)} in a campaign, then pay ${CLICKS_PAID} clicks (${usdc(RATE_PER_CLICK * BigInt(CLICKS_PAID))}) to the creator.`,
  )

  const deployerWallet = walletFor(keys, 'deployer')
  const businessWallet = walletFor(keys, 'business')

  // 1. Deploy. Deployer is both owner and operator for this smoke run.
  if (!state.clickPot) {
    const hash = await step(state, 'Deploy ClickPot', async () =>
      deployerWallet.deployContract({
        abi: clickPotAbi,
        bytecode: deployArtifact(),
        args: [USDC, deployer.address, deployer.address, WINDOW, WINDOW],
        ...(await fees()),
      }),
    )
    const receipt = await publicClient.getTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error('Deploy receipt has no contract address')
    state.clickPot = receipt.contractAddress
    saveState(state)
  }
  const clickPot = state.clickPot
  console.log(`ClickPot ${clickPot}`)

  // 2. Fund the business wallet (the creator needs no balance: payouts are sent to it).
  await step(state, 'Fund business wallet', async () =>
    deployerWallet.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [business.address, FUND_BUSINESS],
      ...(await fees()),
    }),
  )

  // 3. Business approves and creates the campaign.
  await step(state, 'Business approves USDC', async () =>
    businessWallet.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [clickPot, DEPOSIT],
      ...(await fees()),
    }),
  )
  const createHash = await step(state, 'Business creates campaign', async () =>
    businessWallet.writeContract({
      address: clickPot,
      abi: clickPotAbi,
      functionName: 'createCampaign',
      args: [RATE_PER_CLICK, DEPOSIT, DURATION],
      ...(await fees()),
    }),
  )
  if (!state.campaignId) {
    const ids = await publicClient.readContract({
      address: clickPot,
      abi: clickPotAbi,
      functionName: 'campaignsOf',
      args: [business.address],
    })
    state.campaignId = ids[ids.length - 1]?.toString()
    saveState(state)
    console.log(`campaign #${state.campaignId} (tx ${createHash})`)
  }
  const id = BigInt(state.campaignId ?? '0')

  // 4. Business approves the creator.
  await step(state, 'Business approves creator', async () =>
    businessWallet.writeContract({
      address: clickPot,
      abi: clickPotAbi,
      functionName: 'approveCreator',
      args: [id, creator.address],
      ...(await fees()),
    }),
  )

  // 5. Operator settles verified clicks, paying the creator from the pot.
  const before = await balanceOf(creator.address)
  const batchId = toHex(crypto.getRandomValues(new Uint8Array(32)))
  await step(state, `Operator settles ${CLICKS_PAID} clicks`, async () =>
    deployerWallet.writeContract({
      address: clickPot,
      abi: clickPotAbi,
      functionName: 'settle',
      args: [id, batchId, [creator.address], [CLICKS_PAID]],
      ...(await fees()),
    }),
  )
  const after = await balanceOf(creator.address)
  console.log(`Creator balance ${usdc(before)} -> ${usdc(after)}`)

  writeReadme(state)
}

async function businessCall(name: string, functionName: 'requestClose' | 'withdraw') {
  const keys = loadKeys()
  const state = loadState()
  if (!state.clickPot || !state.campaignId) throw new Error('Run the flow first.')
  await confirmPrompt(`This sends a REAL ${functionName} transaction on Arc mainnet for campaign #${state.campaignId}.`)
  await step(state, name, async () =>
    walletFor(keys, 'business').writeContract({
      address: state.clickPot as Address,
      abi: clickPotAbi,
      functionName,
      args: [BigInt(state.campaignId ?? '0')],
      ...(await fees()),
    }),
  )
  writeReadme(state)
}

const command = process.argv[2]
const commands: Record<string, () => Promise<void>> = {
  keygen,
  status,
  run,
  close: () => businessCall('Business requests close', 'requestClose'),
  withdraw: () => businessCall('Business withdraws leftover pot', 'withdraw'),
}
const handler = commands[command ?? '']
if (!handler) {
  console.log('Usage: bun scripts/mainnet-flow.ts <keygen|status|run|close|withdraw>')
  process.exit(1)
}
Promise.resolve().then(handler).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
