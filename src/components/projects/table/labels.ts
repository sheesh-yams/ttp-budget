// Display labels for the projects table. Plain module.

const SHOOT_TYPES: Record<string, string> = {
  MUSIC_VIDEO:    'Music video',
  BRAND_CAMPAIGN: 'Brand campaign',
  PRODUCT_SHOOT:  'Product shoot',
  EVENT_RECAP:    'Event recap',
  SOCIAL_CONTENT: 'Social content',
  INFLUENCER:     'Influencer',
  DOCUMENTARY:    'Documentary',
  OTHER:          'Other',
}

export const SHOOT_TYPE_OPTIONS = Object.entries(SHOOT_TYPES).map(([value, label]) => ({ value, label }))

export function shootTypeLabel(t: string): string {
  return SHOOT_TYPES[t] ?? t
}
