// Contract block categories — labels and the "needs review" rule shared by
// the Settings → Contracts library and the deal memo editor.

import type { ContractBlockCategory } from '@prisma/client'

export const CONTRACT_CATEGORY_LABEL: Record<ContractBlockCategory, string> = {
  SOW:        'Scope of Work',
  TERMS:      'Terms',
  PAYMENT:    'Payment',
  IP_RIGHTS:  'IP & Rights',
  COMPLIANCE: 'Compliance',
  CUSTOM:     'Custom',
}

/** SOW and Custom blocks are templates to tailor — shown with a blue border. */
export function categoryNeedsReview(category: ContractBlockCategory | null | undefined): boolean {
  return category === 'SOW' || category === 'CUSTOM'
}
