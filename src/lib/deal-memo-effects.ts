// Side effects of awarding a deal memo bid. Plain module (not 'use server'),
// called with a workspace-scoped client so every query stays in-tenant.

import type { ScopedDb } from '@/lib/db-scoped'

/**
 * Puts the awarded person into the project's crew roster and links the memo
 * to that slot. Slot resolution, in order:
 *   1. this contact is already on the crew IN THIS ROLE → update their rate
 *   2. an "Unassigned" placeholder for this role (created when the proposal
 *      was won) → fill it with this person
 *   3. otherwise → add a new crew member for this role
 * Matching on role as well as person matters: someone already on the crew as
 * Gaffer who wins Best Boy fills the Best Boy slot, not the Gaffer one.
 * Returns the ProjectMember id, or null when the memo has no rolodex contact.
 */
export async function applyDealMemoAwardEffects(sdb: ScopedDb, memoId: string): Promise<string | null> {
  const memo = await sdb.dealMemo.findFirst({
    where:  { id: memoId },
    select: {
      id: true, projectId: true, contactId: true, roleLabel: true,
      fees: { where: { kind: 'DAY_RATE' }, orderBy: { order: 'asc' }, take: 1, select: { rateCents: true, unit: true } },
    },
  })
  if (!memo?.contactId) return null

  const contact = await sdb.contact.findFirst({
    where:  { id: memo.contactId },
    select: { id: true, name: true, email: true, phone: true },
  })
  if (!contact) return null

  // Only carry a rate the memo actually has — never zero out a crew rate.
  const dayRate = memo.fees[0]
  const rate = dayRate && dayRate.rateCents > 0 ? { rateCents: dayRate.rateCents, rateUnit: dayRate.unit } : {}

  let memberId: string

  const existing = await sdb.projectMember.findFirst({
    where:  { projectId: memo.projectId, contactId: contact.id, role: memo.roleLabel },
    select: { id: true },
  })
  if (existing) {
    memberId = existing.id
    await sdb.projectMember.update({ where: { id: memberId }, data: { ...rate, mismatchFlag: false } })
  } else {
    const placeholder = await sdb.projectMember.findFirst({
      where:   { projectId: memo.projectId, name: 'Unassigned', role: memo.roleLabel },
      orderBy: { order: 'asc' },
      select:  { id: true },
    })
    if (placeholder) {
      memberId = placeholder.id
      await sdb.projectMember.update({
        where: { id: memberId },
        data:  {
          contactId: contact.id, name: contact.name,
          email: contact.email ?? null, phone: contact.phone ?? null,
          ...rate, mismatchFlag: false,
        },
      })
    } else {
      const count = await sdb.projectMember.count({ where: { projectId: memo.projectId } })
      const created = await sdb.projectMember.create({
        data: {
          projectId: memo.projectId, contactId: contact.id, name: contact.name,
          role: memo.roleLabel, email: contact.email ?? null, phone: contact.phone ?? null,
          ...rate, mismatchFlag: false, order: count,
        } as Parameters<typeof sdb.projectMember.create>[0]['data'],
        select: { id: true },
      })
      memberId = created.id
    }
  }

  await sdb.dealMemo.update({ where: { id: memo.id }, data: { projectMemberId: memberId } })
  return memberId
}
