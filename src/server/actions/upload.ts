'use server'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '@/lib/r2'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { generatePublicToken } from '@/lib/secure-token'
import type { ActionResult } from '@/types'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}

type UploadFolder = 'avatars' | 'logos' | 'client-logos' | 'delivery-covers'

/**
 * Issue a short-lived (60 s) presigned PUT URL so the browser can upload
 * directly to R2 — our server never touches the binary payload.
 *
 * Returns both the presigned `uploadUrl` (for the PUT) and the permanent
 * `publicUrl` (to persist in the database after upload completes).
 */
export async function getPresignedUploadUrl(
  filename:    string,
  contentType: string,
  byteSize:    number,
  folder:      UploadFolder,
): Promise<ActionResult<{ uploadUrl: string; publicUrl: string }>> {
  try {
    // Auth gate — resolve both user and workspace
    const [user, workspaceId] = await Promise.all([getCurrentUser(), getWorkspaceId()])

    // ── Validate on the server before issuing any credentials ──────────────────
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return { success: false, error: 'Only JPEG, PNG, and WebP images are allowed.' }
    }
    if (byteSize > MAX_BYTES) {
      return { success: false, error: 'File must be under 2 MB.' }
    }
    if (!filename || filename.length > 260) {
      return { success: false, error: 'Invalid filename.' }
    }

    // ── Build a collision-safe, correctly-scoped path ─────────────────────────
    // avatars/       → user-scoped (userId): a user is the same person across workspaces.
    // logos/         → workspace-scoped (workspaceId): branding belongs to the workspace.
    // client-logos/  → workspace-scoped prefix; client-specific id is in the filename.
    const ext    = MIME_TO_EXT[contentType]
    const uuid   = generatePublicToken()           // crypto.randomUUID() UUID v4
    const prefix = folder === 'avatars' ? user.id : workspaceId
    const key    = `${folder}/${prefix}-${uuid}.${ext}`

    // ── Presign a PutObject ticket — 60 seconds to upload ─────────────────────
    const command = new PutObjectCommand({
      Bucket:        R2_BUCKET,
      Key:           key,
      ContentType:   contentType,
      ContentLength: byteSize,
    })
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 60 })

    const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')
    if (!publicBase) return { success: false, error: 'R2 public URL is not configured.' }

    const publicUrl = `${publicBase}/${key}`

    return { success: true, data: { uploadUrl, publicUrl } }
  } catch (err) {
    console.error('[upload] getPresignedUploadUrl error', err)
    return { success: false, error: 'Failed to generate upload URL.' }
  }
}
