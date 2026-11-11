// Loading a client's people (server side). Raw-db friendly: every query
// carries workspaceId. Works with a transaction client too.

import type { Prisma } from '@prisma/client'
import { defaultBillTo, snapshotOf, type ClientPerson, type PersonSnapshot } from '@/lib/client-people'

type Reader = { clientContact: Pick<Prisma.TransactionClient['clientContact'], 'findMany'> }

/** Main first, then in the order they were added. */
export async function loadClientPeople(db: Reader, workspaceId: string, clientId: string): Promise<ClientPerson[]> {
  return db.clientContact.findMany({
    where:   { workspaceId, clientId },
    orderBy: [{ isMain: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
    select:  { id: true, name: true, title: true, email: true, phone: true, isMain: true, roles: true },
  })
}

/** Who a new invoice is addressed to: the Billing person, else Main (null with neither). */
export async function defaultBillToSnapshot(db: Reader, workspaceId: string, clientId: string): Promise<PersonSnapshot | null> {
  const person = defaultBillTo(await loadClientPeople(db, workspaceId, clientId))
  return person ? snapshotOf(person) : null
}
