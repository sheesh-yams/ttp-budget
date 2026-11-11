'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { requirePermission, requireProjectPermission } from '@/lib/access'
import { archiveChangeAllowed } from '@/lib/project-access'
import { phaseForStatus } from '@/lib/project-phase'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '@/lib/r2'
import { generatePublicToken } from '@/lib/secure-token'
import { logAuditEvent } from '@/lib/audit'
import { normalizeEmails, MAX_DEFAULT_CC, type ClientContactInput } from '@/lib/client-recipients'
import { CLIENT_ROLES, normalizeRoles } from '@/lib/client-people'
import { setMainFromFields, syncClientMain } from '@/lib/client-main'
import { db as baseDb } from '@/lib/db'

// =============================================================================
// Validation schemas
// =============================================================================

// Normalize a website input: trim whitespace, prepend https:// if no protocol
function normalizeWebsite(v: string): string {
  const trimmed = v.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const clientSchema = z.object({
  name:           z.string().min(1).max(200),
  legalName:      z.string().optional(),
  contactName:    z.string().optional(),
  contactEmail:   z.string().email().optional().or(z.literal('')),
  contactPhone:   z.string().optional(),
  website:        z.string().optional().transform(v => (v ? normalizeWebsite(v) : v)).pipe(
    z.string().url().optional().or(z.literal(''))
  ),
  billingAddress: z.string().optional(),
  notes:          z.string().optional(),
  specialNotes:   z.string().optional(),
})

// =============================================================================
// Client CRUD
// =============================================================================

export async function upsertClient(
  id: string | null,
  input: z.infer<typeof clientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error

    const data = clientSchema.parse(input)
    const ws = gate.workspaceId
    // The contact fields belong to the Main person (the client's columns only
    // mirror it). The client and its Main person save together or not at all.
    const { contactName, contactEmail, contactPhone, ...clientData } = data
    class Refused extends Error {}
    let client: { id: string }
    try {
      client = await baseDb.$transaction(async tx => {
        let row: { id: string }
        if (id) {
          const res = await tx.client.updateMany({ where: { id, workspaceId: ws }, data: clientData })
          if (res.count === 0) throw new Refused('Client not found')
          row = { id }
        } else {
          row = await tx.client.create({ data: { ...clientData, workspaceId: ws } as Prisma.ClientUncheckedCreateInput, select: { id: true } })
        }
        const refused = await setMainFromFields(tx, ws, row.id, { contactName, contactEmail, contactPhone }, gate.userId)
        if (refused) throw new Refused(refused)
        return row
      })
    } catch (err) {
      if (err instanceof Refused) return { success: false, error: err.message }
      throw err
    }
    revalidatePath('/clients')
    revalidatePath(`/clients/${client.id}`)
    return { success: true, data: { id: client.id } }
  } catch (err) {
    console.error('[upsertClient]', err)
    return { success: false, error: 'Failed to save client' }
  }
}

export async function archiveClient(id: string): Promise<ActionResult> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    await db.client.update({ where: { id }, data: { archivedAt: new Date() } })
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to archive client' }
  }
}

/** The client page's notes, edited in place. */
export async function updateClientNotes(id: string, notes: string): Promise<ActionResult> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error
    if (typeof id !== 'string' || typeof notes !== 'string') return { success: false, error: 'Invalid input' }
    if (notes.length > 20_000) return { success: false, error: 'Notes are too long.' }

    const db = await getScopedDb()
    const res = await db.client.updateMany({ where: { id }, data: { notes: notes.trim() || null } })
    if (res.count === 0) return { success: false, error: 'Client not found' }
    revalidatePath('/clients')
    revalidatePath(`/clients/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save notes' }
  }
}

// =============================================================================
// Client people — one list; one may be Main (mirrored onto Client.contact*),
// roles pick who each document defaults to. Raw-db transactions carry
// workspaceId in every where.
// =============================================================================

const contactSchema = z.object({
  name:   z.string().trim().min(1, 'Add a name.').max(200),
  title:  z.string().trim().max(200).optional().or(z.literal('')),
  email:  z.string().trim().toLowerCase().email('That email isn’t valid.').optional().or(z.literal('')),
  phone:  z.string().trim().max(60).optional().or(z.literal('')),
  isMain: z.boolean().optional(),
  roles:  z.array(z.enum(CLIENT_ROLES)).max(CLIENT_ROLES.length).optional(),
})

function contactData(input: z.infer<typeof contactSchema>) {
  return {
    name:   input.name,
    title:  input.title || null,
    email:  input.email || null,
    phone:  input.phone || null,
    isMain: !!input.isMain,
    roles:  normalizeRoles(input.roles ?? []),
  }
}

/** Emails are needed to send them anything; on-set contacts can be phone-only. */
function missingEmail(d: ReturnType<typeof contactData>): string | null {
  if (d.email) return null
  if (d.roles.includes('BILLING'))   return 'A billing contact needs an email.'
  if (d.roles.includes('PROPOSALS')) return 'A proposals contact needs an email.'
  return null
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Invalid input'
}

export async function addClientContact(clientId: string, input: ClientContactInput): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error
    const parsed = contactSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
    const data = contactData(parsed.data)
    const noEmail = missingEmail(data)
    if (noEmail) return { success: false, error: noEmail }

    const ws = gate.workspaceId
    const client = await baseDb.client.findFirst({ where: { id: clientId, workspaceId: ws }, select: { id: true } })
    if (!client) return { success: false, error: 'Client not found' }

    const created = await baseDb.$transaction(async tx => {
      // One Main per client (also a partial unique index): clear it first.
      if (data.isMain) await tx.clientContact.updateMany({ where: { clientId, workspaceId: ws, isMain: true }, data: { isMain: false } })
      const last = await tx.clientContact.findFirst({ where: { clientId, workspaceId: ws }, orderBy: { order: 'desc' }, select: { order: true } })
      const row = await tx.clientContact.create({ data: { ...data, clientId, workspaceId: ws, order: (last?.order ?? -1) + 1 }, select: { id: true } })
      await syncClientMain(tx, ws, clientId, gate.userId)
      return row
    })
    await logAuditEvent({ workspaceId: ws, actorId: gate.userId, action: 'client.contact.added', entityType: 'Client', entityId: clientId, metadata: { contactId: created.id, name: data.name, isMain: data.isMain, roles: data.roles } })
    revalidatePath(`/clients/${clientId}`)
    revalidatePath('/clients')
    return { success: true, data: { id: created.id } }
  } catch (err) {
    console.error('[addClientContact]', err)
    return { success: false, error: 'Failed to add contact' }
  }
}

export async function updateClientContact(id: string, input: ClientContactInput): Promise<ActionResult> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error
    const parsed = contactSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
    const data = contactData(parsed.data)
    const noEmail = missingEmail(data)
    if (noEmail) return { success: false, error: noEmail }

    const ws = gate.workspaceId
    const existing = await baseDb.clientContact.findFirst({ where: { id, workspaceId: ws }, select: { clientId: true } })
    if (!existing) return { success: false, error: 'Contact not found' }

    await baseDb.$transaction(async tx => {
      if (data.isMain) {
        await tx.clientContact.updateMany({ where: { clientId: existing.clientId, workspaceId: ws, isMain: true, id: { not: id } }, data: { isMain: false } })
      }
      await tx.clientContact.updateMany({ where: { id, workspaceId: ws }, data })
      await syncClientMain(tx, ws, existing.clientId, gate.userId)
    })
    await logAuditEvent({ workspaceId: ws, actorId: gate.userId, action: 'client.contact.updated', entityType: 'Client', entityId: existing.clientId, metadata: { contactId: id, name: data.name, isMain: data.isMain, roles: data.roles } })
    revalidatePath(`/clients/${existing.clientId}`)
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[updateClientContact]', err)
    return { success: false, error: 'Failed to save contact' }
  }
}

export async function deleteClientContact(id: string): Promise<ActionResult> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error
    const ws = gate.workspaceId
    const existing = await baseDb.clientContact.findFirst({ where: { id, workspaceId: ws }, select: { clientId: true, name: true, isMain: true } })
    if (!existing) return { success: false, error: 'Contact not found' }
    // Documents keep their own snapshot of this person; removing the Main
    // person clears the client's main contact until another is picked.
    await baseDb.$transaction(async tx => {
      await tx.clientContact.deleteMany({ where: { id, workspaceId: ws } })
      if (existing.isMain) await syncClientMain(tx, ws, existing.clientId, gate.userId)
    })
    await logAuditEvent({ workspaceId: ws, actorId: gate.userId, action: 'client.contact.removed', entityType: 'Client', entityId: existing.clientId, metadata: { contactId: id, name: existing.name, wasMain: existing.isMain } })
    revalidatePath(`/clients/${existing.clientId}`)
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[deleteClientContact]', err)
    return { success: false, error: 'Failed to remove contact' }
  }
}

const defaultsSchema = z.object({
  paymentTermsDays: z.number().int().min(0).max(365).nullable(),
  invoiceCcEmails:  z.array(z.string()).max(50),
  proposalCcEmails: z.array(z.string()).max(50),
})

/** Payment terms + standard CC lists that pre-fill new invoices and proposals. */
export async function updateClientDefaults(clientId: string, input: { paymentTermsDays: number | null; invoiceCcEmails: string[]; proposalCcEmails: string[] }): Promise<ActionResult> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error
    const parsed = defaultsSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Payment terms must be 0–365 days.' }
    const d = parsed.data
    // Every non-blank entry must be an address; duplicates collapse.
    const bad = [...d.invoiceCcEmails, ...d.proposalCcEmails].map(e => e.trim()).find(e => e && normalizeEmails([e]).length === 0)
    if (bad) return { success: false, error: `“${bad}” isn’t a valid email.` }
    const unique = (list: string[]) => new Set(list.map(e => e.trim().toLowerCase()).filter(Boolean)).size
    if (unique(d.invoiceCcEmails) > MAX_DEFAULT_CC || unique(d.proposalCcEmails) > MAX_DEFAULT_CC) {
      return { success: false, error: `Up to ${MAX_DEFAULT_CC} addresses per list.` }
    }
    const invoiceCc  = normalizeEmails(d.invoiceCcEmails)
    const proposalCc = normalizeEmails(d.proposalCcEmails)

    const db = await getScopedDb()
    const res = await db.client.updateMany({
      where: { id: clientId },
      data:  { paymentTermsDays: d.paymentTermsDays, invoiceCcEmails: invoiceCc, proposalCcEmails: proposalCc },
    })
    if (res.count === 0) return { success: false, error: 'Client not found' }
    await logAuditEvent({ workspaceId: gate.workspaceId, actorId: gate.userId, action: 'client.defaults.updated', entityType: 'Client', entityId: clientId, metadata: { paymentTermsDays: d.paymentTermsDays, invoiceCcEmails: invoiceCc, proposalCcEmails: proposalCc } })
    revalidatePath(`/clients/${clientId}`)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[updateClientDefaults]', err)
    return { success: false, error: 'Failed to save defaults' }
  }
}

// =============================================================================
// Client logo upload — R2 presigned PUT
// Keys: client-logos/{workspaceId}/{clientId}-{uuid}.ext
// The browser PUTs directly to R2; we only issue the signed ticket.
// =============================================================================

const LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const LOGO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_LOGO_BYTES = 2 * 1024 * 1024

export async function getClientLogoUploadUrl(
  clientId:    string,
  contentType: string,
  byteSize:    number,
): Promise<ActionResult<{ uploadUrl: string; publicUrl: string }>> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error

    const [sdb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])

    // Ownership check — sdb auto-scopes to the active workspace
    const client = await sdb.client.findFirst({ where: { id: clientId }, select: { id: true } })
    if (!client) return { success: false, error: 'Client not found' }

    if (!LOGO_MIME.has(contentType)) return { success: false, error: 'Only JPEG, PNG, and WebP allowed.' }
    if (byteSize > MAX_LOGO_BYTES) return { success: false, error: 'Logo must be under 2 MB.' }

    const ext  = LOGO_EXT[contentType]
    const uuid = generatePublicToken()
    const key  = `client-logos/${workspaceId}/${clientId}-${uuid}.${ext}`

    const command = new PutObjectCommand({
      Bucket:        R2_BUCKET,
      Key:           key,
      ContentType:   contentType,
      ContentLength: byteSize,
    })
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 60 })
    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')
    if (!base) return { success: false, error: 'R2 public URL is not configured.' }

    return { success: true, data: { uploadUrl, publicUrl: `${base}/${key}` } }
  } catch {
    return { success: false, error: 'Failed to generate upload URL.' }
  }
}

export async function updateClientLogo(
  clientId: string,
  logoUrl:  string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requirePermission('clients', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    const client = await sdb.client.findFirst({ where: { id: clientId }, select: { id: true } })
    if (!client) return { success: false, error: 'Client not found' }

    await sdb.client.update({ where: { id: clientId }, data: { logoUrl } })
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update logo.' }
  }
}

// =============================================================================
// Project helpers (kept here — same file as before)
// =============================================================================

const projectSchema = z.object({
  clientId:       z.string(),
  name:           z.string().min(1).max(300),
  code:           z.string().optional(),
  shootType:      z.enum(['MUSIC_VIDEO','BRAND_CAMPAIGN','PRODUCT_SHOOT','EVENT_RECAP','SOCIAL_CONTENT','INFLUENCER','DOCUMENTARY','OTHER']),
  shootStartDate: z.string().optional().nullable(),
  shootEndDate:   z.string().optional().nullable(),
  description:    z.string().optional(),
  notes:          z.string().optional(),
})

export async function upsertProject(
  id: string | null,
  input: z.infer<typeof projectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await (id ? requireProjectPermission(id, 'overview', 'EDIT') : requirePermission('projects', 'EDIT'))
    if (!gate.ok) return gate.error
    if (id && !(await archiveChangeAllowed(id, (input as { status?: string })?.status))) {
      return { success: false, error: 'Archiving or restoring a project needs the Projects permission.' }
    }

    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const data = projectSchema.parse(input)
    const payload = {
      ...data,
      shootStartDate: data.shootStartDate ? new Date(data.shootStartDate) : null,
      shootEndDate:   data.shootEndDate   ? new Date(data.shootEndDate)   : null,
    }
    const project = id
      ? await db.project.update({ where: { id }, data: payload })
      : await db.project.create({ data: { ...payload, createdById: user.id } } as unknown as { data: Prisma.ProjectUncheckedCreateInput })
    revalidatePath('/projects')
    revalidatePath('/dashboard')
    return { success: true, data: { id: project.id } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to save project' }
  }
}

export async function updateProjectStatus(
  id: string,
  status: 'LEAD' | 'ACTIVE' | 'WRAPPED' | 'ARCHIVED'
): Promise<ActionResult> {
  try {
    const gate = await requireProjectPermission(id, 'overview', 'EDIT')
    if (!gate.ok) return gate.error
    if (!(await archiveChangeAllowed(id, status))) {
      return { success: false, error: 'Archiving or restoring a project needs the Projects permission.' }
    }

    if (!['LEAD', 'ACTIVE', 'WRAPPED', 'ARCHIVED'].includes(status)) return { success: false, error: 'Invalid status' }
    const db = await getScopedDb()
    const current = await db.project.findFirst({ where: { id }, select: { phase: true } })
    if (!current) return { success: false, error: 'Project not found' }
    await db.project.update({ where: { id }, data: { status, phase: phaseForStatus(status, current.phase), archivedAt: status === 'ARCHIVED' ? new Date() : null } })
    revalidatePath('/dashboard')
    revalidatePath(`/projects/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update status' }
  }
}
