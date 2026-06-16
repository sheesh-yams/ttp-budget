'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '@/lib/r2'
import { generatePublicToken } from '@/lib/secure-token'

// =============================================================================
// Validation schemas
// =============================================================================

const clientSchema = z.object({
  name:          z.string().min(1).max(200),
  contactName:   z.string().optional(),
  contactEmail:  z.string().email().optional().or(z.literal('')),
  contactPhone:  z.string().optional(),
  website:       z.string().url().optional().or(z.literal('')),
  billingAddress: z.string().optional(),
  notes:         z.string().optional(),
  specialNotes:  z.string().optional(),
})

// =============================================================================
// Client CRUD
// =============================================================================

export async function upsertClient(
  id: string | null,
  input: z.infer<typeof clientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const [db] = await Promise.all([getScopedDb(), getCurrentUser()])
    const data = clientSchema.parse(input)
    const client = id
      ? await db.client.update({ where: { id }, data })
      : await db.client.create({ data } as unknown as { data: Prisma.ClientUncheckedCreateInput })
    revalidatePath('/clients')
    return { success: true, data: { id: client.id } }
  } catch {
    return { success: false, error: 'Failed to save client' }
  }
}

export async function archiveClient(id: string): Promise<ActionResult> {
  try {
    const db = await getScopedDb()
    await db.client.update({ where: { id }, data: { archivedAt: new Date() } })
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to archive client' }
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
    const db = await getScopedDb()
    await db.project.update({ where: { id }, data: { status } })
    revalidatePath('/dashboard')
    revalidatePath(`/projects/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update status' }
  }
}
