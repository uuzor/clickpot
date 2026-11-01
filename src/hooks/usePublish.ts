import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSignMessage } from 'wagmi'
import { api } from '@/lib/api'
import { clearDraft } from '@/lib/local'
import { contentHash, publishMessage, type CampaignContent } from '@/shared/messages'

/** Signs the listing with the funding wallet and publishes it to the marketplace. */
export function usePublish() {
  const { signMessageAsync } = useSignMessage()
  const qc = useQueryClient()
  return useCallback(
    async (campaignId: number, content: CampaignContent) => {
      const signature = await signMessageAsync({ message: publishMessage(campaignId, contentHash(content)) })
      await api('/campaigns', { body: { id: campaignId, ...content, signature } })
      clearDraft(campaignId)
      await qc.invalidateQueries({ queryKey: ['campaigns'] })
    },
    [signMessageAsync, qc],
  )
}
