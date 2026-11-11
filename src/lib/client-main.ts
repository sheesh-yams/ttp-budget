// The client's Main person ↔ Client.contactName/Email/Phone.
//
// ClientContact is the one list of people; Client.contact* is only a mirror of
// the Main person, kept so existing readers (e-sign allow-list, public pages,
// PDFs, receipts) work unchanged. Write it ONLY through syncClientMain, inside
// the same transaction as the people change. Every query carries workspaceId.

import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

/** Proposals that are out with the client and may still be signed. */
const OPEN_PROPOSAL = ['SENT', 'VIEWED', 'CHANGES_NEEDED', 'EXPIRED'] as const

/**
 * Copy the Main person's name/email/phone onto the client (null when there's
 * no Main).
 *
 * A sent proposal addressed to the main contact stores toEmail = null ("the
 * client's contact email") and the e-sign check reads that live. So when the
 * main email changes, open proposals that relied on it get the address they
 * were actually sent to pinned as their To — their recipient can still sign.
 * Drafts keep following the client.
 */
export async function syncClientMain(tx: Tx, workspaceId: string, clientId: string, actorId: string | null = null): Promise<void> {
  // Sequential: one connection inside an interactive transaction.
  const main   = await tx.clientContact.findFirst({ where: { workspaceId, clientId, isMain: true }, select: { name: true, email: true, phone: true } })
  const before = await tx.client.findFirst({ where: { id: clientId, workspaceId }, select: { contactEmail: true } })
  if (!before) return
  const oldEmail = before.contactEmail?.trim().toLowerCase() || null
  const newEmail = main?.email?.trim().toLowerCase() || null
  if (oldEmail && oldEmail !== newEmail) {
    const pinned = await tx.proposal.findMany({
      where:  { workspaceId, project: { clientId, workspaceId }, toEmail: null, status: { in: [...OPEN_PROPOSAL] } },
      select: { id: true },
    })
    if (pinned.length) {
      await tx.proposal.updateMany({ where: { workspaceId, id: { in: pinned.map(p => p.id) }, toEmail: null }, data: { toEmail: oldEmail } })
      await tx.auditEvent.createMany({ data: pinned.map(p => ({
        workspaceId, actorId, action: 'proposal.to_pinned', entityType: 'Proposal', entityId: p.id,
        metadata: { toEmail: oldEmail, reason: 'client main contact changed' },
      })) })
    }
  }
  await tx.client.updateMany({
    where: { id: clientId, workspaceId },
    data:  { contactName: main?.name ?? null, contactEmail: main?.email ?? null, contactPhone: main?.phone ?? null },
  })
}

/**
 * The client form's "main contact" fields (create, edit, edit-from-project):
 * write them to the Main person, then mirror. Returns an error message instead
 * of saving when the change would break a role.
 * - All blank: the Main person (if any) stays in the list but is no longer Main.
 * - A Main person exists: updated in place (an emptied email is refused while
 *   they're tagged Billing or Proposals — those need an address).
 * - None yet: a person with the same email becomes Main (their other details
 *   are only filled in, never blanked), else a new one is added.
 */
export async function setMainFromFields(tx: Tx, workspaceId: string, clientId: string, fields: {
  contactName?:  string | null
  contactEmail?: string | null
  contactPhone?: string | null
}, actorId: string | null = null): Promise<string | null> {
  const name  = fields.contactName?.trim() || null
  const email = fields.contactEmail?.trim().toLowerCase() || null
  const phone = fields.contactPhone?.trim() || null
  const main  = await tx.clientContact.findFirst({ where: { workspaceId, clientId, isMain: true }, select: { id: true, name: true, roles: true } })

  if (!name && !email && !phone) {
    if (main) await tx.clientContact.updateMany({ where: { id: main.id, workspaceId }, data: { isMain: false } })
  } else if (main) {
    if (!email && main.roles.some(r => r === 'BILLING' || r === 'PROPOSALS')) {
      return `${main.name} is a billing or proposals contact, so they need an email. Change their role on the client's People card first.`
    }
    await tx.clientContact.updateMany({
      where: { id: main.id, workspaceId },
      data:  { name: name ?? email ?? main.name, email, phone },
    })
  } else {
    const sameEmail = email
      ? await tx.clientContact.findFirst({ where: { workspaceId, clientId, email }, select: { id: true } })
      : null
    if (sameEmail) {
      await tx.clientContact.updateMany({
        where: { id: sameEmail.id, workspaceId },
        data:  { isMain: true, ...(name ? { name } : {}), ...(phone ? { phone } : {}) },
      })
    } else {
      const last = await tx.clientContact.findFirst({ where: { workspaceId, clientId }, orderBy: { order: 'desc' }, select: { order: true } })
      await tx.clientContact.create({
        data: { workspaceId, clientId, isMain: true, name: name ?? email ?? 'Main contact', email, phone, order: (last?.order ?? -1) + 1 },
      })
    }
  }
  await syncClientMain(tx, workspaceId, clientId, actorId)
  return null
}
