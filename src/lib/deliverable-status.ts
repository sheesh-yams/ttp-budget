export const DELIVERABLE_REVIEW_STATUSES = ['NEEDS_REVIEW', 'DELIVERED', 'APPROVED', 'POSTED'] as const
export type DeliverableReviewStatus = (typeof DELIVERABLE_REVIEW_STATUSES)[number]

export const REVIEW_STATUS_LABELS: Record<DeliverableReviewStatus, string> = {
  NEEDS_REVIEW: 'Needs Review',
  DELIVERED:    'Delivered',
  APPROVED:     'Approved',
  POSTED:       'Posted',
}

/** Tailwind classes for admin (class-based) surfaces. */
export const REVIEW_STATUS_TW: Record<DeliverableReviewStatus, string> = {
  NEEDS_REVIEW: 'bg-amber-100 text-amber-700',
  DELIVERED:    'bg-blue-100 text-blue-700',
  APPROVED:     'bg-green-100 text-green-700',
  POSTED:       'bg-violet-100 text-violet-700',
}

/** Hex pairs for the inline-styled public delivery pages. */
export const REVIEW_STATUS_HEX: Record<DeliverableReviewStatus, { bg: string; fg: string }> = {
  NEEDS_REVIEW: { bg: '#FEF3C7', fg: '#92400E' },
  DELIVERED:    { bg: '#DBEAFE', fg: '#1E40AF' },
  APPROVED:     { bg: '#DCFCE7', fg: '#15803D' },
  POSTED:       { bg: '#EDE9FE', fg: '#6D28D9' },
}
