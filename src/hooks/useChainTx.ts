import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import type { Hash, TransactionReceipt } from 'viem'
import { CHAIN_ID } from '@/lib/contract'
import { friendlyError, isCancelled } from '@/lib/errors'

type Writer = ReturnType<typeof useWriteContract>['writeContractAsync']

export type TxPhase = 'idle' | 'wallet' | 'confirming'

/**
 * Runs a contract write end to end: switches to Arc Testnet, asks the wallet,
 * waits for the receipt. Returns null when the user cancels, throws nothing.
 */
export function useChainTx() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [error, setError] = useState<string | null>(null)

  const exec = useCallback(
    async (action: (write: Writer) => Promise<Hash>): Promise<{ hash: Hash; receipt: TransactionReceipt } | null> => {
      setError(null)
      try {
        if (!client) throw new Error('Network client is not ready')
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        setPhase('wallet')
        const hash = await action(writeContractAsync)
        setPhase('confirming')
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('The transaction was reverted onchain.')
        return { hash, receipt }
      } catch (e) {
        if (!isCancelled(e)) {
          const message = friendlyError(e)
          setError(message)
          toast.error(message)
        }
        return null
      } finally {
        setPhase('idle')
      }
    },
    [chainId, client, switchChainAsync, writeContractAsync],
  )

  return { exec, phase, busy: phase !== 'idle', error, clearError: () => setError(null) }
}
