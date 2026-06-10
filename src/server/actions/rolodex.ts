'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'

// ── Schema ─────────────────────────────────────────────────────────────────────

const contactSchema = z.object({
  name:            z.string().min(1).max(200),
  primaryRole:     z.string().min(1).max(200),
  secondaryRoles:  z.array(z.string().min(1).max(100)).default([]),
  email:           z.string().email().optional().or(z.literal('')).nullable(),
  phone:           z.string().optional().nullable(),
  instagram:       z.string().optional().nullable(),
  website:         z.string().optional().nullable(),
  notes:           z.string().optional().nullable(),
  avatarUrl:       z.string().optional().nullable(),
  defaultRateCents: z.number().int().min(0).optional().nullable(),
  defaultRateUnit: z.enum(['HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'FLAT', 'EACH', 'MILE']).default('DAY'),
})

export type ContactFormData = z.infer<typeof contactSchema>

// ── Read ───────────────────────────────────────────────────────────────────────

export async function getContacts() {
  const db = await getScopedDb()
  return db.contact.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id:               true,
      name:             true,
      primaryRole:      true,
      secondaryRoles:   true,
      email:            true,
      phone:            true,
      instagram:        true,
      website:          true,
      notes:            true,
      avatarUrl:        true,
      defaultRateCents: true,
      defaultRateUnit:  true,
      createdAt:        true,
      // count of projects via ProjectMember
      projectMembers: {
        select: { projectId: true },
      },
    },
  })
}

export type ContactRow = Awaited<ReturnType<typeof getContacts>>[number]

// Search for contacts by name or role — used by the project team member picker
export async function searchContacts(query: string) {
  const db = await getScopedDb()
  const q  = query.trim()
  if (!q) {
    return db.contact.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      take: 20,
      select: {
        id:               true,
        name:             true,
        primaryRole:      true,
        secondaryRoles:   true,
        email:            true,
        phone:            true,
        defaultRateCents: true,
        defaultRateUnit:  true,
      },
    })
  }
  return db.contact.findMany({
    where: {
      archivedAt: null,
      OR: [
        { name:        { contains: q, mode: 'insensitive' } },
        { primaryRole: { contains: q, mode: 'insensitive' } },
        { email:       { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { name: 'asc' },
    take: 20,
    select: {
      id:               true,
      name:             true,
      primaryRole:      true,
      secondaryRoles:   true,
      email:            true,
      phone:            true,
      defaultRateCents: true,
      defaultRateUnit:  true,
    },
  })
}

export type ContactSearchResult = Awaited<ReturnType<typeof searchContacts>>[number]

// ── Write ──────────────────────────────────────────────────────────────────────

export async function createContact(
  input: ContactFormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const db   = await getScopedDb()
    const data = contactSchema.parse(input)
    const contact = await db.contact.create({
      data: {
        ...data,
        secondaryRoles: data.secondaryRoles as unknown as Prisma.InputJsonValue,
      },
    } as unknown as { data: Prisma.ContactUncheckedCreateInput })
    revalidatePath('/rolodex')
    return { success: true, data: { id: contact.id } }
  } catch {
    return { success: false, error: 'Failed to create contact' }
  }
}

export async function updateContact(
  id: string,
  input: ContactFormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const db   = await getScopedDb()
    const data = contactSchema.parse(input)
    await db.contact.update({
      where: { id },
      data: {
        ...data,
        secondaryRoles: data.secondaryRoles as unknown as Prisma.InputJsonValue,
      },
    })
    revalidatePath('/rolodex')
    revalidatePath(`/rolodex/${id}`)
    return { success: true, data: { id } }
  } catch {
    return { success: false, error: 'Failed to update contact' }
  }
}

export async function archiveContact(id: string): Promise<ActionResult> {
  try {
    const db = await getScopedDb()
    await db.contact.update({
      where: { id },
      data: { archivedAt: new Date() },
    })
    revalidatePath('/rolodex')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to archive contact' }
  }
}
