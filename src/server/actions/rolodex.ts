'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
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
        hasKit:           true,
        kitRateCents:     true,
        kitName:          true,
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
      hasKit:           true,
      kitRateCents:     true,
      kitName:          true,
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

// ── Duplicate detection + merge ───────────────────────────────────────────────

export interface DuplicateContact {
  id:           string
  name:         string
  primaryRole:  string
  email:        string | null
  phone:        string | null
  projectCount: number
}

export interface DuplicateGroup {
  matchReason: 'phone' | 'email' | 'name'
  matchValue:  string
  contacts:    DuplicateContact[]
}

export async function findDuplicateContacts(): Promise<DuplicateGroup[]> {
  try {
    const db = await getScopedDb()
    const contacts = await db.contact.findMany({
      where: { archivedAt: null },
      select: {
        id:           true,
        name:         true,
        primaryRole:  true,
        email:        true,
        phone:        true,
        projectMembers: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const mapped: DuplicateContact[] = contacts.map(c => ({
      id:           c.id,
      name:         c.name,
      primaryRole:  c.primaryRole,
      email:        c.email,
      phone:        c.phone,
      projectCount: c.projectMembers.length,
    }))

    const groups: DuplicateGroup[] = []
    const seenPairs = new Set<string>()

    function addGroup(reason: DuplicateGroup['matchReason'], value: string, ids: string[]) {
      // Deduplicate: sort ids to create a canonical key
      const key = `${reason}:${[...ids].sort().join(',')}`
      if (seenPairs.has(key)) return
      seenPairs.add(key)
      const dupeContacts = mapped.filter(c => ids.includes(c.id))
      if (dupeContacts.length >= 2) {
        groups.push({ matchReason: reason, matchValue: value, contacts: dupeContacts })
      }
    }

    // Layer 1 — Phone (normalize: strip non-digits, must be ≥7 digits)
    const byPhone = new Map<string, string[]>()
    for (const c of mapped) {
      if (!c.phone) continue
      const normalized = c.phone.replace(/\D/g, '')
      if (normalized.length < 7) continue
      const existing = byPhone.get(normalized) ?? []
      existing.push(c.id)
      byPhone.set(normalized, existing)
    }
    for (const [val, ids] of byPhone) {
      if (ids.length >= 2) addGroup('phone', val, ids)
    }

    // Layer 2 — Email (normalize: lowercase + trim)
    const byEmail = new Map<string, string[]>()
    for (const c of mapped) {
      if (!c.email) continue
      const normalized = c.email.toLowerCase().trim()
      const existing = byEmail.get(normalized) ?? []
      existing.push(c.id)
      byEmail.set(normalized, existing)
    }
    for (const [val, ids] of byEmail) {
      if (ids.length >= 2) addGroup('email', val, ids)
    }

    // Layer 3 — Name (normalize: lowercase + collapse whitespace)
    const byName = new Map<string, string[]>()
    for (const c of mapped) {
      const normalized = c.name.toLowerCase().replace(/\s+/g, ' ').trim()
      const existing = byName.get(normalized) ?? []
      existing.push(c.id)
      byName.set(normalized, existing)
    }
    for (const [val, ids] of byName) {
      if (ids.length >= 2) addGroup('name', val, ids)
    }

    return groups
  } catch {
    return []
  }
}

// Merge duplicateId into primaryId:
// - Fills any null/empty fields on primary from duplicate
// - Merges secondaryRoles arrays
// - Re-points all ProjectMember rows from duplicate → primary
// - Archives the duplicate
export async function mergeContacts(
  primaryId:   string,
  duplicateId: string,
): Promise<ActionResult> {
  try {
    const db = await getScopedDb()

    const [primary, duplicate] = await Promise.all([
      db.contact.findFirst({ where: { id: primaryId } }),
      db.contact.findFirst({ where: { id: duplicateId } }),
    ])

    if (!primary || !duplicate) {
      return { success: false, error: 'One or both contacts not found' }
    }

    // Merge fields: primary wins; fall back to duplicate for nulls/empty
    const mergedSecondaryRoles = [
      ...new Set([
        ...(Array.isArray(primary.secondaryRoles)   ? primary.secondaryRoles   as string[] : []),
        ...(Array.isArray(duplicate.secondaryRoles) ? duplicate.secondaryRoles as string[] : []),
      ]),
    ]

    const mergedData = {
      email:            primary.email            || duplicate.email,
      phone:            primary.phone            || duplicate.phone,
      instagram:        primary.instagram        || duplicate.instagram,
      website:          primary.website          || duplicate.website,
      notes:            primary.notes && duplicate.notes
                          ? `${primary.notes}\n\n${duplicate.notes}`
                          : (primary.notes || duplicate.notes),
      avatarUrl:        primary.avatarUrl        || duplicate.avatarUrl,
      defaultRateCents: primary.defaultRateCents ?? duplicate.defaultRateCents,
      secondaryRoles:   mergedSecondaryRoles as unknown as Prisma.InputJsonValue,
    }

    await db.contact.update({
      where: { id: primaryId },
      data:  mergedData,
    })

    // Re-point project members — sdb auto-scopes to this workspace.
    await db.projectMember.updateMany({
      where: { contactId: duplicateId },
      data:  { contactId: primaryId },
    })

    // Archive the duplicate
    await db.contact.update({
      where: { id: duplicateId },
      data:  { archivedAt: new Date() },
    })

    revalidatePath('/rolodex')
    return { success: true, data: undefined }
  } catch (e) {
    console.error('mergeContacts error:', e)
    return { success: false, error: 'Failed to merge contacts' }
  }
}

// ── Single contact with history ───────────────────────────────────────────────

export async function getContactById(id: string) {
  const sdb = await getScopedDb()
  return sdb.contact.findFirst({
    where: { id, archivedAt: null },
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
      projectMembers: {
        select: {
          role:     true,
          rateCents: true,
          rateUnit:  true,
          project: {
            select: {
              id:             true,
              name:           true,
              status:         true,
              shootStartDate: true,
            },
          },
        },
      },
    },
  })
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactById>>>

// Patch a single phone or email field on a contact — used by call sheet editors
// when crew/talent rows are linked to a Rolodex contact.
export async function patchContactField(
  contactId: string,
  field: 'phone' | 'email',
  value: string | null,
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    await sdb.contact.update({
      where: { id: contactId },
      data:  { [field]: value ?? null },
    })
    revalidatePath('/rolodex')
    revalidatePath(`/rolodex/${contactId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update contact' }
  }
}

// Scan all call sheets for rows linked to a given contact (via contactId in JSON).
// Returns lightweight call sheet + project records for display on the contact detail page.
export async function getContactCallSheets(contactId: string) {
  const sdb = await getScopedDb()
  const callSheets = await sdb.callSheet.findMany({
    select: {
      id:        true,
      title:     true,
      shootDate: true,
      status:    true,
      crew:      true,
      talent:    true,
      project: {
        select: { id: true, name: true },
      },
    },
    orderBy: { shootDate: 'desc' },
  })

  // Filter in-app: scan crew + talent JSON for this contactId
  return callSheets.filter(cs => {
    const crewGroups = (cs.crew as { members?: { contactId?: string }[] }[]) ?? []
    const hasCrew = crewGroups.some(g =>
      g.members?.some(m => m.contactId === contactId)
    )
    if (hasCrew) return true
    const talent = (cs.talent as { contactId?: string }[]) ?? []
    return talent.some(t => t.contactId === contactId)
  }).map(cs => ({
    id:          cs.id,
    title:       cs.title,
    shootDate:   cs.shootDate,
    status:      cs.status,
    projectId:   cs.project.id,
    projectName: cs.project.name,
  }))
}

export type ContactCallSheet = Awaited<ReturnType<typeof getContactCallSheets>>[number]

// ── Crew roles — sourced from CREW rate cards ─────────────────────────────────
// Used to populate role dropdowns in ContactModal and the Rolodex filter.

export async function getCrewRoles(): Promise<string[]> {
  try {
    const db = await getScopedDb()
    const cards = await db.rateCard.findMany({
      where: { category: 'CREW', archivedAt: null },
      select: { role: true },
      orderBy: { role: 'asc' },
    })
    // Deduplicate (rate cards can have multiple rows with the same role)
    return [...new Set(cards.map(c => c.role))].sort()
  } catch {
    return []
  }
}

// ── Call sheet → Rolodex import ───────────────────────────────────────────────

export interface ImportableMember {
  name:       string
  role:       string
  phone:      string | null
  email:      string | null
  department: string | null  // crew dept from call sheet
  source:     string         // call sheet title for display
  alreadyInRolodex:   boolean
  existingContactId:  string | null
}

// Aggregates every crew + talent member across all call sheets in the workspace,
// cross-references against existing contacts (by name, case-insensitive),
// and deduplicates so each unique name appears once.
export async function getCallSheetCrewForImport(): Promise<ImportableMember[]> {
  try {
    const db = await getScopedDb()

    // Fetch call sheets (crew + talent JSON + title)
    const callSheets = await db.callSheet.findMany({
      select: { title: true, crew: true, talent: true },
      orderBy: { shootDate: 'desc' },
    })

    // Fetch existing contact names for duplicate detection
    const existing = await db.contact.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
    })
    const existingMap = new Map(
      existing.map(c => [c.name.toLowerCase().trim(), c.id])
    )

    // Collect members — key by lowercase name to deduplicate
    const seen = new Map<string, ImportableMember>()

    for (const cs of callSheets) {
      // Crew groups: [{ dept, members: [{ name, role, callTime, phone, email }] }]
      const crewGroups = (cs.crew as { dept?: string; members?: { name?: string; role?: string; phone?: string; email?: string }[] }[]) ?? []
      for (const group of crewGroups) {
        for (const m of group.members ?? []) {
          if (!m.name?.trim()) continue
          const key = m.name.trim().toLowerCase()
          if (!seen.has(key)) {
            const existingId = existingMap.get(key) ?? null
            seen.set(key, {
              name:               m.name.trim(),
              role:               m.role?.trim() ?? '',
              phone:              m.phone?.trim() || null,
              email:              m.email?.trim() || null,
              department:         group.dept?.trim() || null,
              source:             cs.title,
              alreadyInRolodex:   !!existingId,
              existingContactId:  existingId,
            })
          }
        }
      }

      // Talent: [{ name, role, callTime, phone, email }]
      const talent = (cs.talent as { name?: string; role?: string; phone?: string; email?: string }[]) ?? []
      for (const t of talent) {
        if (!t.name?.trim()) continue
        const key = t.name.trim().toLowerCase()
        if (!seen.has(key)) {
          const existingId = existingMap.get(key) ?? null
          seen.set(key, {
            name:               t.name.trim(),
            role:               t.role?.trim() ?? 'Talent',
            phone:              t.phone?.trim() || null,
            email:              t.email?.trim() || null,
            department:         'Talent',
            source:             cs.title,
            alreadyInRolodex:   !!existingId,
            existingContactId:  existingId,
          })
        }
      }
    }

    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

// Bulk-create contacts from selected call sheet crew.
// Skips members that are already in the Rolodex (matched by alreadyInRolodex flag).
export async function bulkImportContacts(
  members: ImportableMember[]
): Promise<ActionResult<{ count: number }>> {
  try {
    const db = await getScopedDb()
    const toCreate = members.filter(m => !m.alreadyInRolodex)

    for (const m of toCreate) {
      await db.contact.create({
        data: {
          name:            m.name,
          primaryRole:     m.role || 'Crew',
          secondaryRoles:  [] as unknown as Prisma.InputJsonValue,
          email:           m.email,
          phone:           m.phone,
          instagram:       null,
          website:         null,
          notes:           null,
          avatarUrl:       null,
          defaultRateCents: null,
          defaultRateUnit: 'DAY',
        },
      } as unknown as { data: Prisma.ContactUncheckedCreateInput })
    }

    revalidatePath('/rolodex')
    return { success: true, data: { count: toCreate.length } }
  } catch {
    return { success: false, error: 'Failed to import contacts' }
  }
}
