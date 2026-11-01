import { keccak256, toBytes } from 'viem'

/**
 * Shared between the browser and the tracker server.
 * Wallet-signed messages prove who is acting without any gas or password.
 */

export const CATEGORIES = [
  'Apps & SaaS',
  'Crypto & DeFi',
  'Gaming',
  'Fashion & Beauty',
  'Food & Drink',
  'Education',
  'Health & Fitness',
  'Other',
] as const

export const PLATFORMS = ['X', 'YouTube', 'TikTok', 'Instagram', 'Newsletter', 'Telegram', 'Other'] as const

export type Category = (typeof CATEGORIES)[number]
export type Platform = (typeof PLATFORMS)[number]

export interface CampaignContent extends Record<string, string> {
  title: string
  tagline: string
  description: string
  category: string
  destinationUrl: string
  imageUrl: string
  requirements: string
}

export interface ApplicationContent extends Record<string, string> {
  handle: string
  platform: string
  profileUrl: string
  audience: string
  note: string
}

/** Stable hash of a flat string record, independent of key order. */
export function contentHash(payload: Record<string, string>): `0x${string}` {
  const keys = Object.keys(payload).sort()
  return keccak256(toBytes(JSON.stringify(payload, keys)))
}

export const publishMessage = (campaignId: number, hash: string) =>
  `Clickpot: publish campaign #${campaignId}\nContent hash: ${hash}`

export const applyMessage = (campaignId: number, creator: string, hash: string) =>
  `Clickpot: apply to campaign #${campaignId}\nCreator: ${creator.toLowerCase()}\nContent hash: ${hash}`

export const dismissMessage = (campaignId: number, creator: string) =>
  `Clickpot: dismiss application\nCampaign: #${campaignId}\nCreator: ${creator.toLowerCase()}`
