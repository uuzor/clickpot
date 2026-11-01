import { createPublicClient, createWalletClient, http, isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { clickPotAbi } from '../src/abi/clickPot'
import { requireChain } from '../src/onchain-facts'

export const CHAIN_ID = arcTestnet.id
const COMPASS_CHAIN = 'Arc_Testnet'

const clickPotEnv = process.env.VITE_CLICKPOT_ADDRESS
if (!clickPotEnv || !isAddress(clickPotEnv)) {
  throw new Error('VITE_CLICKPOT_ADDRESS is missing or invalid in .env')
}
export const CLICKPOT: Address = clickPotEnv

/** Prefer the sandbox RPC proxy; fall back to the public endpoint from the generated facts. */
function resolveRpcUrl(): string {
  const proxyChains = (process.env.RPC_PROXY_CHAINS || '').split(',')
  if (process.env.RPC_PROXY_BASE_URL && proxyChains.indexOf(COMPASS_CHAIN) !== -1) {
    return `${process.env.RPC_PROXY_BASE_URL}/api/rpc/${COMPASS_CHAIN}?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
  }
  return requireChain(CHAIN_ID).rpcUrls[0]
}

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(resolveRpcUrl()) })

const operatorKey = process.env.OPERATOR_PRIVATE_KEY as Hex | undefined
export const operatorAccount = operatorKey ? privateKeyToAccount(operatorKey) : undefined
export const walletClient = operatorAccount
  ? createWalletClient({ account: operatorAccount, chain: arcTestnet, transport: http(resolveRpcUrl()) })
  : undefined

export interface OnchainCampaign {
  owner: Address
  endsAt: bigint
  paused: boolean
  closing: boolean
  ratePerClick: bigint
  unlockAt: bigint
  balance: bigint
  totalDeposited: bigint
  totalPaid: bigint
}

const cache = new Map<number, { at: number; value: OnchainCampaign | null }>()
const TTL_MS = 3000

/** Reads a campaign from the contract; short cache keeps click handling cheap. */
export async function readCampaign(id: number, fresh = false): Promise<OnchainCampaign | null> {
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value
  let value: OnchainCampaign | null = null
  try {
    value = (await publicClient.readContract({
      address: CLICKPOT,
      abi: clickPotAbi,
      functionName: 'getCampaign',
      args: [BigInt(id)],
    })) as OnchainCampaign
  } catch {
    value = null
  }
  cache.set(id, { at: Date.now(), value })
  return value
}

/** 0 = none, 1 = approved, 2 = revoked */
export async function creatorStatus(id: number, creator: Address): Promise<number> {
  const status = await publicClient.readContract({
    address: CLICKPOT,
    abi: clickPotAbi,
    functionName: 'creatorStatus',
    args: [BigInt(id), creator],
  })
  return Number(status)
}

export async function creatorStatuses(id: number, creators: Address[]): Promise<number[]> {
  if (creators.length === 0) return []
  const results = await publicClient.multicall({
    allowFailure: true,
    contracts: creators.map((creator) => ({
      address: CLICKPOT,
      abi: clickPotAbi,
      functionName: 'creatorStatus' as const,
      args: [BigInt(id), creator] as const,
    })),
  })
  return results.map((r) => (r.status === 'success' ? Number(r.result) : 0))
}

export async function operatorBalance(): Promise<bigint> {
  if (!operatorAccount) return 0n
  return publicClient.getBalance({ address: operatorAccount.address })
}
