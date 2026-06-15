'use server'

import { revalidatePath } from 'next/cache'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '@/lib/r2'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { getScopedDb } from '@/lib/db-scoped'
import { generatePublicToken } from '@/lib/secure-token'
import type { ActionResult } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceiptDb = {
  id:            string
  workspaceId:   string
  projectId:     string
  actualEntryId: string | null
  fileUrl:       string
  fileName:      string
  fileType:      string
  fileSizeBytes: number | null
  uploadedAt:    Date
  createdAt:     Date
  updatedAt:     Date
}

// ─── Upload URL ───────────────────────────────────────────────────────────────

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'application/pdf': 'pdf',
}
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Issue a short-lived (60 s) presigned PUT URL for a receipt file.
 * Key is scoped to workspaceId/projectId — browser never sees secrets.
 */
export async function getReceiptUploadUrl(
  projectId:   string,
  contentType: string,
  byteSize:    number,
  fileName:    string,
): Promise<ActionResult<{ uploadUrl: string; publicUrl: string }>> {
  try {
    const [user, workspaceId] = await Promise.all([getCurrentUser(), getWorkspaceId()])
    void user // auth gate only; workspace is the scope

    const ext = ALLOWED_MIME[contentType]
    if (!ext) return { success: false, error: 'Only JPEG, PNG, WebP, and PDF files are allowed.' }
    if (byteSize > MAX_BYTES) return { success: false, error: 'File must be under 10 MB.' }
    if (!fileName || fileName.length > 260) return { success: false, error: 'Invalid filename.' }

    // Verify project belongs to workspace
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found.' }

    const uuid = generatePublicToken()
    const key  = `receipts/${workspaceId}/${projectId}/${uuid}.${ext}`

    const command = new PutObjectCommand({
      Bucket:        R2_BUCKET,
      Key:           key,
      ContentType:   contentType,
      ContentLength: byteSize,
    })
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 60 })

    const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')
    if (!publicBase) return { success: false, error: 'R2 public URL is not configured.' }

    return { success: true, data: { uploadUrl, publicUrl: `${publicBase}/${key}` } }
  } catch (err) {
    console.error('[receipts] getReceiptUploadUrl error', err)
    return { success: false, error: 'Failed to generate upload URL.' }
  }
}

// ─── createReceiptRecord ──────────────────────────────────────────────────────

/**
 * Persist a Receipt row after the browser has completed its R2 PUT.
 * Optionally links to an ActualEntry immediately.
 */
export async function createReceiptRecord(
  projectId:     string,
  fileUrl:       string,
  fileName:      string,
  fileType:      string,
  fileSizeBytes: number | null,
  actualEntryId: string | null = null,
): Promise<ActionResult<ReceiptDb>> {
  try {
    const workspaceId = await getWorkspaceId()
    const sdb         = await getScopedDb()

    // Verify project belongs to this workspace
    const project = await sdb.project.findFirst({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found.' }

    // If linking to an entry, verify it belongs to this project's sheet
    if (actualEntryId) {
      const entry = await sdb.actualSheet.findFirst({
        where:  { projectId },
        select: { entries: { where: { id: actualEntryId }, select: { id: true } } },
      })
      const found = (entry?.entries ?? []).length > 0
      if (!found) return { success: false, error: 'Entry not found in this project.' }
    }

    const receipt = await sdb.receipt.create({
      data: {
        workspaceId,
        projectId,
        actualEntryId: actualEntryId ?? null,
        fileUrl,
        fileName,
        fileType,
        fileSizeBytes: fileSizeBytes ?? null,
      },
    }) as unknown as ReceiptDb

    revalidatePath(`/projects/${projectId}/receipts`)
    if (actualEntryId) revalidatePath(`/projects/${projectId}/actuals`)

    return { success: true, data: receipt }
  } catch (err) {
    console.error('[receipts] createReceiptRecord error', err)
    return { success: false, error: 'Failed to save receipt.' }
  }
}

// ─── linkReceiptToEntry ───────────────────────────────────────────────────────

/**
 * Attach an existing (unlinked) receipt to an ActualEntry.
 */
export async function linkReceiptToEntry(
  receiptId:     string,
  actualEntryId: string,
  projectId:     string,
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()

    // Verify receipt belongs to this workspace/project
    const receipt = await sdb.receipt.findFirst({
      where: { id: receiptId, projectId },
      select: { id: true },
    })
    if (!receipt) return { success: false, error: 'Receipt not found.' }

    await sdb.receipt.update({
      where: { id: receiptId },
      data:  { actualEntryId },
    })

    revalidatePath(`/projects/${projectId}/receipts`)
    revalidatePath(`/projects/${projectId}/actuals`)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[receipts] linkReceiptToEntry error', err)
    return { success: false, error: 'Failed to link receipt.' }
  }
}

// ─── unlinkReceipt ────────────────────────────────────────────────────────────

/**
 * Move a receipt back to the "Inbox" (unattached) pool.
 */
export async function unlinkReceipt(
  receiptId: string,
  projectId: string,
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()

    const receipt = await sdb.receipt.findFirst({
      where: { id: receiptId, projectId },
      select: { id: true },
    })
    if (!receipt) return { success: false, error: 'Receipt not found.' }

    await sdb.receipt.update({
      where: { id: receiptId },
      data:  { actualEntryId: null },
    })

    revalidatePath(`/projects/${projectId}/receipts`)
    revalidatePath(`/projects/${projectId}/actuals`)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[receipts] unlinkReceipt error', err)
    return { success: false, error: 'Failed to unlink receipt.' }
  }
}

// ─── deleteReceipt ────────────────────────────────────────────────────────────

/**
 * Hard-delete a receipt record. The R2 object is NOT deleted (no lifecycle
 * penalty; orphaned objects are cheap and avoid accidental data loss).
 */
export async function deleteReceipt(
  receiptId: string,
  projectId: string,
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()

    const receipt = await sdb.receipt.findFirst({
      where: { id: receiptId, projectId },
      select: { id: true, actualEntryId: true },
    })
    if (!receipt) return { success: false, error: 'Receipt not found.' }

    await sdb.receipt.delete({ where: { id: receiptId } })

    revalidatePath(`/projects/${projectId}/receipts`)
    if (receipt.actualEntryId) revalidatePath(`/projects/${projectId}/actuals`)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[receipts] deleteReceipt error', err)
    return { success: false, error: 'Failed to delete receipt.' }
  }
}

// ─── getProjectReceipts ───────────────────────────────────────────────────────

/**
 * Fetch all receipts for a project, ordered newest-first.
 * Used by the /receipts page and ActualEntrySidebar inbox picker.
 */
export async function getProjectReceipts(
  projectId: string,
): Promise<ReceiptDb[]> {
  try {
    const sdb      = await getScopedDb()
    const receipts = await sdb.receipt.findMany({
      where:   { projectId },
      orderBy: { uploadedAt: 'desc' },
    })
    return receipts as unknown as ReceiptDb[]
  } catch (err) {
    console.error('[receipts] getProjectReceipts error', err)
    return []
  }
}

// ─── getEntryReceipts ─────────────────────────────────────────────────────────

/**
 * Fetch receipts linked to a specific ActualEntry.
 * Used by ActualEntrySidebar when opening an entry.
 */
export async function getEntryReceipts(
  actualEntryId: string,
  projectId:     string,
): Promise<ReceiptDb[]> {
  try {
    const sdb      = await getScopedDb()
    const receipts = await sdb.receipt.findMany({
      where:   { actualEntryId, projectId },
      orderBy: { uploadedAt: 'desc' },
    })
    return receipts as unknown as ReceiptDb[]
  } catch (err) {
    console.error('[receipts] getEntryReceipts error', err)
    return []
  }
}
