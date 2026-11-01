import { CATEGORIES, type CampaignContent } from '@/shared/messages'

export interface CampaignForm {
  title: string
  tagline: string
  category: string
  destinationUrl: string
  imageUrl: string
  description: string
  requirements: string
  rate: string
  deposit: string
  days: number
}

export const EMPTY_FORM: CampaignForm = {
  title: '',
  tagline: '',
  category: CATEGORIES[0],
  destinationUrl: '',
  imageUrl: '',
  description: '',
  requirements: '',
  rate: '0.05',
  deposit: '50',
  days: 14,
}

export const DURATIONS = [7, 14, 30, 60]

export const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export function productErrors(f: CampaignForm) {
  return {
    title: f.title.trim().length >= 3 ? null : 'Add a name of at least 3 characters.',
    tagline: f.tagline.trim().length >= 3 ? null : 'Add a one-line pitch.',
    destinationUrl: isHttpUrl(f.destinationUrl) ? null : 'Enter a full link starting with https://',
    imageUrl: !f.imageUrl.trim() || isHttpUrl(f.imageUrl) ? null : 'Image must be a full https:// link.',
    description: f.description.trim().length >= 10 ? null : 'Tell creators a bit more (10+ characters).',
  }
}

export function toContent(f: CampaignForm): CampaignContent {
  return {
    title: f.title.trim(),
    tagline: f.tagline.trim(),
    description: f.description.trim(),
    category: f.category,
    destinationUrl: new URL(f.destinationUrl.trim()).toString(),
    imageUrl: f.imageUrl.trim() ? new URL(f.imageUrl.trim()).toString() : '',
    requirements: f.requirements.trim(),
  }
}
