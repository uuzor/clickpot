import { useCallback } from 'react'
import { parseSignature } from 'viem'
import { useAccount, usePublicClient, useSignTypedData } from 'wagmi'
import { CHAIN_ID, CLICKPOT_ADDRESS, USDC_ADDRESS } from '@/lib/contract'
import { isCancelled } from '@/lib/errors'

const tokenAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'version', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export interface PermitSig {
  deadline: bigint
  v: number
  r: `0x${string}`
  s: `0x${string}`
}

/**
 * Signs a USDC permit so funding takes one transaction instead of approve + fund.
 * Returns null if the token or wallet cannot do it (callers fall back to approve);
 * rethrows if the user cancels the signature.
 */
export function usePermit() {
  const { address } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { signTypedDataAsync } = useSignTypedData()
  return useCallback(
    async (value: bigint): Promise<PermitSig | null> => {
      if (!address || !client) return null
      try {
        const [name, version, nonce] = await Promise.all([
          client.readContract({ address: USDC_ADDRESS, abi: tokenAbi, functionName: 'name' }),
          client.readContract({ address: USDC_ADDRESS, abi: tokenAbi, functionName: 'version' }),
          client.readContract({ address: USDC_ADDRESS, abi: tokenAbi, functionName: 'nonces', args: [address] }),
        ])
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60)
        const signature = await signTypedDataAsync({
          domain: { name, version, chainId: CHAIN_ID, verifyingContract: USDC_ADDRESS },
          types: {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          message: { owner: address, spender: CLICKPOT_ADDRESS, value, nonce, deadline },
        })
        const { r, s, v, yParity } = parseSignature(signature)
        return { deadline, v: v !== undefined ? Number(v) : 27 + (yParity ?? 0), r, s }
      } catch (e) {
        if (isCancelled(e)) throw e
        return null
      }
    },
    [address, client, signTypedDataAsync],
  )
}
