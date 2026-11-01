import { useQuery } from '@tanstack/react-query'

export interface CampaignMeta {
  id: number
  owner: string
  title: string
  tagline: string
  description: string
  category: string
  destinationUrl: string
  destinationHost: string
  imageUrl: string
  requirements: string
  createdAt: number
  clicks: number
  partners: number
  applicants: number
}

export interface CampaignDetail extends CampaignMeta {
  views: number
  paid: number
  inFlight: number
  daily: { day: string; clicks: number }[]
}

export interface ApplicationItem {
  creator: string
  handle: string
  platform: string
  profileUrl: string
  audience: string
  note: string
  createdAt: number
  status: 'pending' | 'approved' | 'revoked'
  code: string | null
  clicks: number
  paid: number
}

export interface MyStatus {
  applied: boolean
  dismissed: boolean
  status: 'none' | 'approved' | 'revoked'
  code: string | null
  handle: string | null
}

export interface Partnership {
  campaignId: number
  title: string
  tagline: string
  destinationHost: string
  ratePerClick: string
  status: 'pending' | 'approved' | 'revoked'
  appliedAt: number
  code: string | null
  clicks: number
  views: number
  earned: number
  pendingClicks: number
  live: boolean
}

export interface Payout {
  id: number
  campaignId: number
  title: string
  clicks: number
  amount: number
  txHash: string
  ts: number
}

export interface CreatorOverview {
  earned: number
  clicks: number
  pendingClicks: number
  daily: { day: string; clicks: number }[]
  partnerships: Partnership[]
  payouts: Payout[]
}

export interface FeedItem {
  id: number
  campaignId: number
  title: string | null
  creator: string
  clicks: number
  amount: number
  txHash: string
  ts: number
}

export interface LinkInfo {
  code: string
  campaignId: number
  creator: string
  creatorHandle: string | null
  title: string
  tagline: string
  description: string
  category: string
  imageUrl: string
  owner: string
  destinationHost: string
  destinationUrl: string
  ratePerClick: string
}

export interface Health {
  ok: boolean
  operator: string | null
  operatorFunded: boolean
  dedupeMinutes: number
  holdSeconds: number
  lastError: string
  lastSettledAt: number
}

export interface GlobalStats {
  campaigns: number
  clicks: number
  paid: number
  creators: number
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    keepalive: init?.keepalive,
  })
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
  if (!isJson) throw new ApiError(503, 'The campaign service is not reachable right now.')
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed')
  return data as T
}

export const useCampaignList = (owner?: string) =>
  useQuery({
    queryKey: ['campaigns', owner ?? 'all'],
    queryFn: () => api<CampaignMeta[]>(owner ? `/campaigns?owner=${owner}` : '/campaigns'),
    refetchInterval: 15_000,
  })

export const useCampaignDetail = (id: number) =>
  useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<CampaignDetail>(`/campaigns/${id}`),
    refetchInterval: 8_000,
    retry: false,
  })

export const useApplications = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['applications', id],
    queryFn: () => api<ApplicationItem[]>(`/campaigns/${id}/applications`),
    refetchInterval: 8_000,
    enabled,
  })

export const useMyStatus = (id: number, creator?: string) =>
  useQuery({
    queryKey: ['me', id, creator],
    queryFn: () => api<MyStatus>(`/campaigns/${id}/me?creator=${creator}`),
    enabled: !!creator,
    refetchInterval: 6_000,
  })

export const useCreatorOverview = (creator?: string) =>
  useQuery({
    queryKey: ['creator', creator],
    queryFn: () => api<CreatorOverview>(`/creators/${creator}`),
    enabled: !!creator,
    refetchInterval: 6_000,
  })

export const useFeed = () =>
  useQuery({ queryKey: ['feed'], queryFn: () => api<FeedItem[]>('/feed'), refetchInterval: 8_000 })

export const useGlobalStats = () =>
  useQuery({ queryKey: ['stats'], queryFn: () => api<GlobalStats>('/stats'), refetchInterval: 15_000 })

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health'), refetchInterval: 20_000, retry: false })
