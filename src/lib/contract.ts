import { isAddress, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { clickPotAbi } from '@/abi/clickPot'
import { getUsdc } from '@/onchain-facts'

export { clickPotAbi }

export const CHAIN_ID = arcTestnet.id

const rawAddress = import.meta.env.VITE_CLICKPOT_ADDRESS as string | undefined
if (!rawAddress || !isAddress(rawAddress)) {
  throw new Error('VITE_CLICKPOT_ADDRESS is missing from .env')
}
export const CLICKPOT_ADDRESS: Address = rawAddress

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
export const USDC_ADDRESS = usdcFact.address as Address

export interface ChainCampaign {
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

export type Phase = 'live' | 'paused' | 'closing' | 'ended' | 'exhausted'

export function phaseOf(c: ChainCampaign, nowSec = Math.floor(Date.now() / 1000)): Phase {
  if (c.closing) return 'closing'
  if (BigInt(nowSec) >= c.endsAt) return 'ended'
  if (c.paused) return 'paused'
  if (c.balance < c.ratePerClick) return 'exhausted'
  return 'live'
}

export const PHASE_LABEL: Record<Phase, string> = {
  live: 'Live',
  paused: 'Paused',
  closing: 'Closing',
  ended: 'Ended',
  exhausted: 'Pot empty',
}

/** The business can pull what is left once this passes. */
export function canWithdraw(c: ChainCampaign, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return BigInt(nowSec) >= c.unlockAt && c.balance > 0n
}
