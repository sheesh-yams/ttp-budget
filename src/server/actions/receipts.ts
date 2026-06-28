'use server'

import { revalidatePath } from 'next/cache'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '@/lib/r2'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { db } from '@/lib/db'
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
  amountCents:   number | null
  merchantName:  string | null
  receiptDate:   Date | null
  uploadedAt:    Date
  createdAt:     Date
  updatedAt:     Date
}

// Lightweight type for actuals matching picker
export type ActualEntryForMatching = {
  id:           string
  sheetId:      string
  description:  string
  actualCents:  number
  isAdHoc:      boolean
  lineItemId:   string | null
  receiptCount: number
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Recompute an entry's actualCents from its attached receipts that have amounts.
 * If no linked receipts carry amounts, the entry's manual value is left untouched.
 */
async function syncEntryActualCents(entryId: string): Promise<void> {
  const linked = await db.receipt.findMany({
    where:  { actualEntryId: entryId, amountCents: { not: null } },
    select: { amountCents: true },
  })
  if (linked.length === 0) return
  const total = linked.reduce((sum, r) => sum + (r.amountCents ?? 0), 0)
  await db.actualEntry.update({ where: { id: entryId }, data: { actualCents: total } })
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

    const receipt = await sdb.receipt.findFirst({
      where:  { id: receiptId, projectId },
      select: { id: true, amountCents: true },
    })
    if (!receipt) return { success: false, error: 'Receipt not found.' }

    await sdb.receipt.update({
      where: { id: receiptId },
      data:  { actualEntryId },
    })

    // If this receipt carries an amount, recompute the entry's actualCents
    if (receipt.amountCents != null) await syncEntryActualCents(actualEntryId)

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
      where:  { id: receiptId, projectId },
      select: { id: true, actualEntryId: true, amountCents: true },
    })
    if (!receipt) return { success: false, error: 'Receipt not found.' }

    const prevEntryId = receipt.actualEntryId

    await sdb.receipt.update({
      where: { id: receiptId },
      data:  { actualEntryId: null },
    })

    // Recompute the previously-linked entry after removal
    if (prevEntryId && receipt.amountCents != null) await syncEntryActualCents(prevEntryId)

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

// ─── updateReceiptDetails ─────────────────────────────────────────────────────

/**
 * Update the metadata a user enters after uploading a receipt.
 * If the receipt is already linked to an entry and amountCents changes,
 * the entry's actualCents is recomputed from all its attached receipts.
 */
export async function updateReceiptDetails(
  receiptId: string,
  projectId: string,
  patch: {
    amountCents?:  number | null
    merchantName?: string | null
    receiptDate?:  Date | null
  },
): Promise<ActionResult<ReceiptDb>> {
  try {
    const sdb = await getScopedDb()

    const existing = await sdb.receipt.findFirst({
      where:  { id: receiptId, projectId },
      select: { id: true, actualEntryId: true, amountCents: true },
    })
    if (!existing) return { success: false, error: 'Receipt not found.' }

    const updated = await sdb.receipt.update({
      where: { id: receiptId },
      data:  patch,
    }) as unknown as ReceiptDb

    // Resync the entry's actualCents if the amount changed and receipt is attached
    if (existing.actualEntryId && 'amountCents' in patch) {
      await syncEntryActualCents(existing.actualEntryId)
    }

    revalidatePath(`/projects/${projectId}/receipts`)
    if (existing.actualEntryId) revalidatePath(`/projects/${projectId}/actuals`)
    return { success: true, data: updated }
  } catch (err) {
    console.error('[receipts] updateReceiptDetails error', err)
    return { success: false, error: 'Failed to update receipt.' }
  }
}

// ─── getProjectActualEntries ──────────────────────────────────────────────────

/**
 * Return all ActualEntry records for a project's primary ActualSheet,
 * with description, current amount, and attached receipt count.
 * Used to populate the "Match existing" picker in the receipt detail panel.
 */
export async function getProjectActualEntries(
  projectId: string,
): Promise<ActualEntryForMatching[]> {
  try {
    const sdb   = await getScopedDb()
    const sheet = await sdb.actualSheet.findFirst({
      where:   { projectId },
      orderBy: { createdAt: 'desc' },
      select:  {
        id: true,
        entries: {
          orderBy: { order: 'asc' },
          select: {
            id:          true,
            description: true,
            actualCents: true,
            isAdHoc:     true,
            lineItemId:  true,
            receipts:    { select: { id: true } },
          },
        },
      },
    })
    if (!sheet) return []
    return sheet.entries.map(e => ({
      id:           e.id,
      sheetId:      sheet.id,
      description:  e.description,
      actualCents:  e.actualCents,
      isAdHoc:      e.isAdHoc,
      lineItemId:   e.lineItemId,
      receiptCount: e.receipts.length,
    }))
  } catch (err) {
    console.error('[receipts] getProjectActualEntries error', err)
    return []
  }
}

// ─── createAdHocEntryFromReceipt ──────────────────────────────────────────────

/**
 * Create a new ad-hoc ActualEntry for an unplanned expense and immediately
 * link the receipt to it.  actualCents is taken from the receipt's amountCents.
 */
export async function createAdHocEntryFromReceipt(
  projectId:  string,
  receiptId:  string,
  description: string,
): Promise<ActionResult<{ entryId: string; entryDescription: string }>> {
  try {
    const sdb = await getScopedDb()

    // Load receipt to get amount + verify ownership
    const receipt = await sdb.receipt.findFirst({
      where:  { id: receiptId, projectId },
      select: { id: true, amountCents: true, receiptDate: true },
    })
    if (!receipt) return { success: false, error: 'Receipt not found.' }

    // Find the project's primary sheet
    const sheet = await sdb.actualSheet.findFirst({
      where:   { projectId },
      orderBy: { createdAt: 'desc' },
      select:  { id: true },
    })
    if (!sheet) return { success: false, error: 'No actuals sheet found for this project.' }

    const count = await db.actualEntry.count({ where: { actualSheetId: sheet.id } })

    const entry = await db.actualEntry.create({
      data: {
        actualSheetId: sheet.id,
        description,
        actualCents:   receipt.amountCents ?? 0,
        isAdHoc:       true,
        order:         count,
        date:          receipt.receiptDate ?? null,
      },
    })

    // Link the receipt
    await sdb.receipt.update({
      where: { id: receiptId },
      data:  { actualEntryId: entry.id },
    })

    revalidatePath(`/projects/${projectId}/receipts`)
    revalidatePath(`/projects/${projectId}/actuals`)
    return { success: true, data: { entryId: entry.id, entryDescription: entry.description } }
  } catch (err) {
    console.error('[receipts] createAdHocEntryFromReceipt error', err)
    return { success: false, error: 'Failed to create actuals entry.' }
  }
}
