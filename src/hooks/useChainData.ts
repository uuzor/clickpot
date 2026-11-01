import { useMemo } from 'react'
import { erc20Abi } from 'viem'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { CHAIN_ID, CLICKPOT_ADDRESS, USDC_ADDRESS, clickPotAbi, type ChainCampaign } from '@/lib/contract'

/** Live onchain state for a set of campaign ids (rate, pot, status). */
export function useChainCampaigns(ids: number[]) {
  const key = ids.join(',')
  const contracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CLICKPOT_ADDRESS,
        abi: clickPotAbi,
        functionName: 'getCampaign' as const,
        args: [BigInt(id)] as const,
        chainId: CHAIN_ID,
      })),
    // eslint-disable-next-line -- ids are keyed by their joined value
    [key],
  )
  const query = useReadContracts({
    contracts,
    query: { enabled: ids.length > 0, refetchInterval: 6_000 },
  })
  const map = useMemo(() => {
    const out = new Map<number, ChainCampaign>()
    query.data?.forEach((r, i) => {
      if (r.status === 'success') out.set(ids[i], r.result)
    })
    return out
    // eslint-disable-next-line -- ids are keyed by their joined value
  }, [query.data, key])
  return { map, isLoading: query.isLoading, refetch: query.refetch }
}

export function useChainCampaign(id: number) {
  const { map, isLoading, refetch } = useChainCampaigns([id])
  return { campaign: map.get(id), isLoading, refetch }
}

/** Wallet USDC balance and allowance for the Clickpot contract (ERC-20 view, 6 decimals). */
export function useUsdc() {
  const { address } = useAccount()
  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 8_000 },
  })
  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, CLICKPOT_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 8_000 },
  })
  return {
    balance: balance.data,
    allowance: allowance.data,
    isLoading: balance.isLoading,
    refetch: async () => {
      await Promise.all([balance.refetch(), allowance.refetch()])
    },
  }
}

/** Protocol-wide totals read straight from the contract. */
export function useProtocolTotals() {
  const res = useReadContracts({
    contracts: [
      { address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'totalPaidAll', chainId: CHAIN_ID },
      { address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'totalDepositedAll', chainId: CHAIN_ID },
      { address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'campaignCount', chainId: CHAIN_ID },
    ],
    query: { refetchInterval: 15_000 },
  })
  const [paid, deposited, count] = res.data ?? []
  return {
    paid: paid?.status === 'success' ? (paid.result) : undefined,
    deposited: deposited?.status === 'success' ? (deposited.result) : undefined,
    count: count?.status === 'success' ? Number(count.result) : undefined,
  }
}

/** Ids of every campaign this wallet funded, straight from the contract. */
export function useOwnedCampaignIds(owner?: `0x${string}`) {
  const res = useReadContract({
    address: CLICKPOT_ADDRESS,
    abi: clickPotAbi,
    functionName: 'campaignsOf',
    args: owner ? [owner] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!owner, refetchInterval: 10_000 },
  })
  return { ids: (res.data ?? []).map((n) => Number(n)), isLoading: res.isLoading, refetch: res.refetch }
}

/** Payouts that could not be sent directly and wait for the creator to claim. */
export function useClaimable(address?: `0x${string}`) {
  const res = useReadContract({
    address: CLICKPOT_ADDRESS,
    abi: clickPotAbi,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })
  return { amount: res.data ?? 0n, refetch: res.refetch }
}

/** Withdrawal-protection windows, set at deployment (seconds). */
export function useProtocolParams() {
  const res = useReadContracts({
    contracts: [
      { address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'closeNotice', chainId: CHAIN_ID },
      { address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'settleGrace', chainId: CHAIN_ID },
    ],
    query: { staleTime: Infinity },
  })
  const [notice, grace] = res.data ?? []
  return {
    closeNotice: notice?.status === 'success' ? Number(notice.result) : undefined,
    settleGrace: grace?.status === 'success' ? Number(grace.result) : undefined,
  }
}
