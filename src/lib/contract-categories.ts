// Contract block categories — labels, the "needs review" colours and the
// library name, shared by the Settings → Contracts library, the Contract
// Builder and the deal memo / proposal editors.

import type { ContractBlockCategory } from '@prisma/client'

export const CONTRACT_CATEGORY_LABEL: Record<ContractBlockCategory, string> = {
  SOW:        'Scope of Work',
  TERMS:      'Terms',
  PAYMENT:    'Payment',
  IP_RIGHTS:  'IP & Rights',
  COMPLIANCE: 'Compliance',
  CUSTOM:     'Custom',
}

/**
 * Blocks that are templates to tailor for the job: SOW and Custom are blue,
 * IP & usage rights orange. null = boilerplate (no highlight).
 */
export type ReviewTone = 'blue' | 'orange'

export function categoryTone(category: ContractBlockCategory | null | undefined): ReviewTone | null {
  if (category === 'SOW' || category === 'CUSTOM') return 'blue'
  if (category === 'IP_RIGHTS') return 'orange'
  return null
}

export function categoryNeedsReview(category: ContractBlockCategory | null | undefined): boolean {
  return categoryTone(category) !== null
}

/** Tailwind classes per tone — borders / tints / text, so every surface matches. */
export const REVIEW_TONE_CLASS: Record<ReviewTone, { border: string; tint: string; text: string; badge: string; strong: string }> = {
  blue:   { border: 'border-blue-300',   tint: 'bg-blue-50/40',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',     strong: 'border-blue-400' },
  orange: { border: 'border-orange-300', tint: 'bg-orange-50/40', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', strong: 'border-orange-400' },
}

/**
 * How a block is named inside SlateSuite: its internal name ("SOW – Talent")
 * if set, else its public title. The public heading on contracts is always
 * the title.
 */
export function blockLabel(b: { title: string; internalName?: string | null }): string {
  return b.internalName?.trim() || b.title
}
