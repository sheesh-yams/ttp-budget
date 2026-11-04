'use server'

// Shot list actions. Every export is a public RPC endpoint: each one gates on
// the "Shot list" project area (EDIT) for the row it touches, then writes
// through the scoped db (findFirst / updateMany — no findUnique / upsert).
// Shapes and rules live in src/lib/shot-list.ts.

import { z } from 'zod'
import { getScopedDb, type ScopedDb } from '@/lib/db-scoped'
import { requireProductionPermission } from '@/lib/production-access'
import { logAuditEvent } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'
import { normaliseLink } from '@/lib/link-preview'
import { BlockedUrlError, fetchLinkPreview, storeReferenceJpeg } from '@/lib/link-preview-fetch'
import { SHOT_SELECT } from '@/lib/shot-list-load'
import { generatePublicToken } from '@/lib/secure-token'
import {
  defaultSectionCode, readColumnPrefs, sceneSectionTitle, shareExpiry, SHOT_STATUSES,
  type ColumnPrefs, type ShotPatch, type ShotReferenceView, type ShotSectionView, type ShotStatusValue, type ShotView,
} from '@/lib/shot-list'
import type { ActionResult } from '@/types'

const MAX_REFERENCES = 20

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

async function listFor(sdb: ScopedDb, projectId: string) {
  const existing = await sdb.shotList.findFirst({ where: { projectId }, select: { id: true } })
  if (existing) return existing
  try {
    return await sdb.shotList.create({ data: { projectId } as never, select: { id: true } })
  } catch {
    // Two first edits at once: the other request created it (projectId is unique).
    const again = await sdb.shotList.findFirst({ where: { projectId }, select: { id: true } })
    if (!again) throw new Error('Could not create the shot list')
    return again
  }
}

async function nextOrder(rows: Promise<{ orderIndex: number } | null>): Promise<number> {
  const last = await rows
  return last ? last.orderIndex + 1 : 0
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function addShotSection(
  projectId: string,
  input: { title?: string; sceneId?: string },
): Promise<ActionResult<ShotSectionView>> {
  try {
    const gate = await requireProductionPermission({ projectId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    let title: string
    let sceneId: string | null = null
    let code: string | null = null
    if (input.sceneId) {
      const scene = await sdb.scene.findFirst({
        where: { id: input.sceneId, projectId },
        select: { id: true, sceneNumber: true, setting: true, intExt: true, timeOfDay: true },
      })
      if (!scene) return fail('Scene not found.')
      title = sceneSectionTitle(scene)
      sceneId = scene.id
    } else {
      title = (input.title ?? '').trim().slice(0, 120) || 'New section'
      code = defaultSectionCode(title)
    }

    const list = await listFor(sdb, projectId)
    if (sceneId && await sdb.shotSection.findFirst({ where: { shotListId: list.id, sceneId }, select: { id: true } })) {
      return fail('That scene already has a section.')
    }
    const orderIndex = await nextOrder(sdb.shotSection.findFirst({ where: { shotListId: list.id }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } }))
    const sec = await sdb.shotSection.create({
      data: { shotListId: list.id, title, sceneId, code, orderIndex } as never,
      select: { id: true, title: true, code: true, sceneId: true },
    })
    return { success: true, data: { ...sec, shots: [] } }
  } catch (err) {
    console.error('[shot-list] addShotSection', err)
    return fail('Could not add the section.')
  }
}

const sectionPatch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  code:  z.string().trim().max(4).optional(),
})

export async function updateShotSection(sectionId: string, patch: { title?: string; code?: string }): Promise<ActionResult<void>> {
  try {
    const parsed = sectionPatch.safeParse(patch)
    if (!parsed.success) return fail('Check the section name.')
    const gate = await requireProductionPermission({ shotSectionId: sectionId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const data: { title?: string; code?: string | null } = {}
    if (parsed.data.title !== undefined) data.title = parsed.data.title
    if (parsed.data.code !== undefined) data.code = parsed.data.code.toUpperCase() || null
    await sdb.shotSection.updateMany({ where: { id: sectionId }, data })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] updateShotSection', err)
    return fail('Could not save the section.')
  }
}

/** Deletes the section and its shots. */
export async function deleteShotSection(sectionId: string): Promise<ActionResult<void>> {
  try {
    const gate = await requireProductionPermission({ shotSectionId: sectionId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    await sdb.shotSection.deleteMany({ where: { id: sectionId } })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] deleteShotSection', err)
    return fail('Could not delete the section.')
  }
}

/** Unlink a scene: the section stays, as a free section under its current title. */
export async function unlinkShotSectionScene(sectionId: string): Promise<ActionResult<{ code: string }>> {
  try {
    const gate = await requireProductionPermission({ shotSectionId: sectionId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const sec = await sdb.shotSection.findFirst({ where: { id: sectionId }, select: { title: true } })
    if (!sec) return fail('Section not found.')
    const code = defaultSectionCode(sec.title.replace(/^Sc\.\s*\S+\s*·\s*/, ''))
    await sdb.shotSection.updateMany({ where: { id: sectionId }, data: { sceneId: null, code } })
    return { success: true, data: { code } }
  } catch (err) {
    console.error('[shot-list] unlinkShotSectionScene', err)
    return fail('Could not unlink the scene.')
  }
}

export async function reorderShotSections(projectId: string, orderedIds: string[]): Promise<ActionResult<void>> {
  try {
    if (!Array.isArray(orderedIds) || orderedIds.length > 500) return fail('Invalid order.')
    const gate = await requireProductionPermission({ projectId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const list = await sdb.shotList.findFirst({ where: { projectId }, select: { id: true } })
    if (!list) return fail('Shot list not found.')
    // Ids from another list match nothing.
    await Promise.all(orderedIds.map((id, i) => sdb.shotSection.updateMany({ where: { id, shotListId: list.id }, data: { orderIndex: i } })))
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] reorderShotSections', err)
    return fail('Could not reorder the sections.')
  }
}

// ─── Shots ────────────────────────────────────────────────────────────────────

/** Adds a shot at the end of the section, or right after `afterShotId`. */
export async function addShot(sectionId: string, afterShotId?: string): Promise<ActionResult<ShotView>> {
  try {
    const gate = await requireProductionPermission({ shotSectionId: sectionId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const sec = await sdb.shotSection.findFirst({ where: { id: sectionId }, select: { id: true, shotListId: true } })
    if (!sec) return fail('Section not found.')

    let orderIndex: number
    const after = afterShotId
      ? await sdb.shot.findFirst({ where: { id: afterShotId, sectionId }, select: { orderIndex: true } })
      : null
    if (after) {
      orderIndex = after.orderIndex + 1
      await sdb.shot.updateMany({ where: { sectionId, orderIndex: { gte: orderIndex } }, data: { orderIndex: { increment: 1 } } })
    } else {
      orderIndex = await nextOrder(sdb.shot.findFirst({ where: { sectionId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } }))
    }
    const shot = await sdb.shot.create({
      data: { shotListId: sec.shotListId, sectionId, orderIndex } as never,
      select: SHOT_SELECT,
    })
    return { success: true, data: shot as ShotView }
  } catch (err) {
    console.error('[shot-list] addShot', err)
    return fail('Could not add the shot.')
  }
}

const short = z.string().max(120)
const shotPatch = z.object({
  description: z.string().max(4000),
  subject:     short, size: short, angle: short, movement: short, lens: short, equipment: short,
  camera:      short, frameRate: short, aspect: short, sound: short, setup: short,
  cast:        z.string().max(500), location: z.string().max(200),
  notes:       z.string().max(4000),
  estMinutes:  z.number().int().min(0).max(1440).nullable(),
}).partial().strict()


export async function updateShot(shotId: string, patch: ShotPatch): Promise<ActionResult<void>> {
  try {
    const parsed = shotPatch.safeParse(patch)
    if (!parsed.success) return fail('Some shot details are too long.')
    const gate = await requireProductionPermission({ shotId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const data: Record<string, string | number | null> = {}
    for (const [k, v] of Object.entries(parsed.data)) {
      if (k === 'description') data[k] = (v as string).trim()
      else if (typeof v === 'string') data[k] = v.trim() || null   // empty optional field → null
      else data[k] = v as number | null
    }
    await sdb.shot.updateMany({ where: { id: shotId }, data })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] updateShot', err)
    return fail('Could not save the shot.')
  }
}

export async function setShotStatus(shotId: string, status: ShotStatusValue): Promise<ActionResult<void>> {
  try {
    if (!SHOT_STATUSES.includes(status)) return fail('Invalid status.')
    const gate = await requireProductionPermission({ shotId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    await sdb.shot.updateMany({ where: { id: shotId }, data: { status, statusChangedAt: new Date() } })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] setShotStatus', err)
    return fail('Could not update the shot.')
  }
}

export async function deleteShot(shotId: string): Promise<ActionResult<void>> {
  try {
    const gate = await requireProductionPermission({ shotId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    await sdb.shot.deleteMany({ where: { id: shotId } })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] deleteShot', err)
    return fail('Could not delete the shot.')
  }
}

/**
 * Move a shot within or across sections. `orderedIds` is the target section's
 * full new order (including the moved shot); the source section is renumbered.
 */
export async function moveShot(shotId: string, toSectionId: string, orderedIds: string[]): Promise<ActionResult<void>> {
  try {
    if (!Array.isArray(orderedIds) || orderedIds.length > 1000 || !orderedIds.includes(shotId)) return fail('Invalid order.')
    const [g1, g2] = await Promise.all([
      requireProductionPermission({ shotId }, 'shotList', 'EDIT'),
      requireProductionPermission({ shotSectionId: toSectionId }, 'shotList', 'EDIT'),
    ])
    if (!g1.ok) return g1.error!
    if (!g2.ok) return g2.error!
    const sdb = await getScopedDb()
    const [shot, target] = await Promise.all([
      sdb.shot.findFirst({ where: { id: shotId }, select: { sectionId: true, shotListId: true } }),
      sdb.shotSection.findFirst({ where: { id: toSectionId }, select: { shotListId: true } }),
    ])
    if (!shot || !target || shot.shotListId !== target.shotListId) return fail('Shot not found.')

    if (shot.sectionId !== toSectionId) {
      await sdb.shot.updateMany({ where: { id: shotId }, data: { sectionId: toSectionId } })
    }
    await Promise.all(orderedIds.map((id, i) => sdb.shot.updateMany({ where: { id, sectionId: toSectionId }, data: { orderIndex: i } })))
    if (shot.sectionId !== toSectionId) {
      const rest = await sdb.shot.findMany({ where: { sectionId: shot.sectionId }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
      await Promise.all(rest.map((r, i) => sdb.shot.updateMany({ where: { id: r.id }, data: { orderIndex: i } })))
    }
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] moveShot', err)
    return fail('Could not move the shot.')
  }
}

// ─── References ───────────────────────────────────────────────────────────────

const REF_SELECT = { id: true, kind: true, imageUrl: true, sourceUrl: true, sourceHost: true } as const

async function appendReference(
  sdb: ScopedDb, shotId: string,
  data: { kind: 'UPLOAD' | 'LINK'; imageUrl: string | null; sourceUrl?: string | null; sourceHost?: string | null },
): Promise<ActionResult<ShotReferenceView>> {
  const count = await sdb.shotReference.count({ where: { shotId } })
  if (count >= MAX_REFERENCES) return fail(`A shot can have up to ${MAX_REFERENCES} references.`)
  const orderIndex = await nextOrder(sdb.shotReference.findFirst({ where: { shotId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } }))
  const ref = await sdb.shotReference.create({ data: { shotId, orderIndex, ...data } as never, select: REF_SELECT })
  return { success: true, data: ref }
}

/** After a browser upload to R2 — only our own shot-references objects for this workspace are accepted. */
export async function addUploadedReference(shotId: string, publicUrl: string): Promise<ActionResult<ShotReferenceView>> {
  try {
    const gate = await requireProductionPermission({ shotId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')
    const prefix = `${base}/shot-references/${gate.workspaceId}-`
    if (!base || typeof publicUrl !== 'string' || !publicUrl.startsWith(prefix)
        || !/^[A-Za-z0-9-]+\.(jpe?g|png|webp)$/.test(publicUrl.slice(prefix.length))) {
      return fail('That upload could not be used.')
    }
    const sdb = await getScopedDb()
    return await appendReference(sdb, shotId, { kind: 'UPLOAD', imageUrl: publicUrl })
  } catch (err) {
    console.error('[shot-list] addUploadedReference', err)
    return fail('Could not add the reference.')
  }
}

/** A pasted link: we fetch its preview image (SSRF-guarded) and keep a JPEG copy in R2. */
export async function addLinkReference(shotId: string, rawUrl: string): Promise<ActionResult<ShotReferenceView>> {
  try {
    const gate = await requireProductionPermission({ shotId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const url = typeof rawUrl === 'string' ? normaliseLink(rawUrl) : null
    if (!url) return fail('That doesn’t look like a web link.')
    const sdb0 = await getScopedDb()
    if (await sdb0.shotReference.count({ where: { shotId } }) >= MAX_REFERENCES) return fail(`A shot can have up to ${MAX_REFERENCES} references.`)
    const limited = await checkRateLimit('linkPreview', gate.userId)
    if (!limited.success) return fail('Too many links at once — try again in a minute.')

    let preview
    try {
      preview = await fetchLinkPreview(url)
    } catch (err) {
      if (err instanceof BlockedUrlError) return fail('That link can’t be used.')
      throw err
    }
    const imageUrl = preview.jpeg ? await storeReferenceJpeg(gate.workspaceId, preview.jpeg) : null
    const sdb = await getScopedDb()
    return await appendReference(sdb, shotId, {
      kind: 'LINK', imageUrl, sourceUrl: preview.sourceUrl.slice(0, 2000), sourceHost: preview.sourceHost.slice(0, 200),
    })
  } catch (err) {
    console.error('[shot-list] addLinkReference', err)
    return fail('Could not add the link.')
  }
}

/** ★ — move a reference to the front (the first one is the thumbnail). */
export async function makeHeroReference(referenceId: string): Promise<ActionResult<void>> {
  try {
    const gate = await requireProductionPermission({ shotReferenceId: referenceId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const ref = await sdb.shotReference.findFirst({ where: { id: referenceId }, select: { shotId: true } })
    if (!ref) return fail('Reference not found.')
    const all = await sdb.shotReference.findMany({ where: { shotId: ref.shotId }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
    const order = [referenceId, ...all.map(r => r.id).filter(id => id !== referenceId)]
    await Promise.all(order.map((id, i) => sdb.shotReference.updateMany({ where: { id, shotId: ref.shotId }, data: { orderIndex: i } })))
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] makeHeroReference', err)
    return fail('Could not update the reference.')
  }
}

export async function deleteReference(referenceId: string): Promise<ActionResult<void>> {
  try {
    const gate = await requireProductionPermission({ shotReferenceId: referenceId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    await sdb.shotReference.deleteMany({ where: { id: referenceId } })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[shot-list] deleteReference', err)
    return fail('Could not remove the reference.')
  }
}

// ─── Share link and columns ───────────────────────────────────────────────────

/**
 * Turn the view-only link on or off. Turning it off revokes the link: turning
 * it back on issues a new token, so a link you meant to cancel stays dead.
 */
export async function setShotListShare(projectId: string, on: boolean): Promise<ActionResult<{ publicToken: string; shareEnabled: boolean; shareExpiresAt: string | null }>> {
  try {
    const gate = await requireProductionPermission({ projectId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()
    const list = await listFor(sdb, projectId)
    const current = await sdb.shotList.findFirst({ where: { id: list.id }, select: { shareEnabled: true, shareEnabledAt: true } })
    const now = new Date()
    await sdb.shotList.updateMany({
      where: { id: list.id },
      data: on
        ? { shareEnabled: true, shareEnabledAt: now, ...(current?.shareEnabledAt && !current.shareEnabled ? { publicToken: generatePublicToken() } : {}) }
        : { shareEnabled: false },
    })
    const row = await sdb.shotList.findFirst({ where: { id: list.id }, select: { publicToken: true, shareEnabled: true } })
    const lastDay = on ? await sdb.shootDay.findFirst({ where: { projectId }, orderBy: { date: 'desc' }, select: { date: true } }) : null
    const expires = on ? shareExpiry(now, lastDay?.date ?? null) : null
    await logAuditEvent({
      workspaceId: gate.workspaceId, actorId: gate.userId,
      action: on ? 'shotList.shared' : 'shotList.unshared', entityType: 'ShotList', entityId: list.id,
      metadata: { projectId },
    })
    return { success: true, data: { ...row!, shareExpiresAt: expires?.toISOString() ?? null } }
  } catch (err) {
    console.error('[shot-list] setShotListShare', err)
    return fail('Could not change the share link.')
  }
}

export async function setShotListColumns(projectId: string, visible: string[]): Promise<ActionResult<ColumnPrefs>> {
  try {
    const gate = await requireProductionPermission({ projectId }, 'shotList', 'EDIT')
    if (!gate.ok) return gate.error!
    const prefs = readColumnPrefs({ visible })
    const sdb = await getScopedDb()
    const list = await listFor(sdb, projectId)
    await sdb.shotList.updateMany({ where: { id: list.id }, data: { columnPrefs: prefs as unknown as object } })
    return { success: true, data: prefs }
  } catch (err) {
    console.error('[shot-list] setShotListColumns', err)
    return fail('Could not save the columns.')
  }
}
