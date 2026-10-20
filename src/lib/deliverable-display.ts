// Proposal deliverables: Phase.deliverables → the scope items a proposal
// stores (frozen at send, live on drafts), and what a card shows of an item's
// type and quantity. Plain module, shared by the snapshot builder, the public
// page, the PDF and the overview preview (tested in __tests__).

import type { DeliverableItemType, ScopeItem } from '@/types'

export const DELIVERABLE_TYPE_LABELS: Record<DeliverableItemType, string> = {
  DELIVERABLE: 'Deliverable',
  SERVICE:     'Service',
  RAW_FOOTAGE: 'Raw footage',
  OTHER:       'Other',
}

/** A deliverable as stored on Phase.deliverables (JSON; older rows lack type/quantity). */
export interface PhaseDeliverable {
  title: string
  description: string
  sectionIds?: string[]
  type?: DeliverableItemType | null
  quantity?: number | null
}

/** Numbered scope items, keeping type and quantity (they used to be dropped). */
export function toScopeItems(deliverables: PhaseDeliverable[]): ScopeItem[] {
  return deliverables.map((d, i) => ({
    number:      String(i + 1).padStart(2, '0'),
    title:       d.title,
    description: d.description,
    ...(d.sectionIds?.length ? { sectionIds: d.sectionIds } : {}),
    ...(d.type ? { type: d.type } : {}),
    ...(typeof d.quantity === 'number' && Number.isFinite(d.quantity) ? { quantity: d.quantity } : {}),
  }))
}

/**
 * What a client-facing card shows: "× N" only above 1, and the type only when
 * it isn't the default "Deliverable" (so ordinary cards stay uncluttered).
 *
 * Only for items built by toScopeItems (they carry `number`). Option tabs on
 * proposals sent before 2026-10-20 froze the raw Phase.deliverables — type and
 * quantity included, but no `number` — and sent proposals must keep looking
 * exactly as the client saw them, so those get no badges.
 */
export function deliverableBadges(item: { number?: string | null; type?: string | null; quantity?: number | null }): { qty: string | null; typeLabel: string | null } {
  if (!item.number) return { qty: null, typeLabel: null }
  const q = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? Math.floor(item.quantity) : 1
  const t = item.type && item.type !== 'DELIVERABLE' ? DELIVERABLE_TYPE_LABELS[item.type as DeliverableItemType] ?? null : null
  return { qty: q > 1 ? `× ${q}` : null, typeLabel: t }
}
