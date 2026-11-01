import type { CampaignContent } from '@/shared/messages'

const VISITOR_KEY = 'clickpot:visitor'
const DRAFT_KEY = 'clickpot:drafts'

/** Anonymous id so one browser counts once per link per window. */
export function visitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id || id.length < 16) {
    id = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

type Drafts = Record<string, CampaignContent>

function readDrafts(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Drafts
  } catch {
    return {}
  }
}

/** Remembers campaign copy between "funded onchain" and "published", so nothing is lost on a closed tab. */
export function saveDraft(campaignId: number, content: CampaignContent) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readDrafts(), [String(campaignId)]: content }))
}

export function loadDraft(campaignId: number): CampaignContent | null {
  return readDrafts()[String(campaignId)] ?? null
}

export function clearDraft(campaignId: number) {
  const drafts = readDrafts()
  delete drafts[String(campaignId)]
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
}
