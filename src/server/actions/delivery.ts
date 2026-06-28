'use server'

import { revalidatePath } from 'next/cache'
import { requireRole }    from '@/lib/auth'
import { getScopedDb }    from '@/lib/db-scoped'
import { db }             from '@/lib/db'
import { detectEmbed }    from '@/lib/embed-detection'
import type { ActionResult } from '@/types'
import type { DeliverableItemType } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function revalidateDelivery(projectId: string) {
  revalidatePath(`/projects/${projectId}/delivery/deliverables`)
  revalidatePath(`/projects/${projectId}/delivery/page`)
}

/** Resolve projectId from deliveryPageId (needed for revalidatePath). */
async function getProjectIdFromPage(sdb: Awaited<ReturnType<typeof getScopedDb>>, deliveryPageId: string) {
  const page = await sdb.deliveryPage.findFirst({
    where: { id: deliveryPageId },
    select: { projectId: true },
  })
  return page?.projectId ?? null
}

async function getProjectIdFromAsset(sdb: Awaited<ReturnType<typeof getScopedDb>>, assetId: string) {
  const asset = await sdb.deliverableAsset.findFirst({
    where: { id: assetId },
    select: { deliveryPage: { select: { projectId: true } } },
  })
  return asset?.deliveryPage.projectId ?? null
}

async function getProjectIdFromSection(sdb: Awaited<ReturnType<typeof getScopedDb>>, sectionId: string) {
  const section = await sdb.deliverableSection.findFirst({
    where: { id: sectionId },
    select: { deliveryPage: { select: { projectId: true } } },
  })
  return section?.deliveryPage.projectId ?? null
}

// ─── Delivery page ────────────────────────────────────────────────────────────

/** Get or create the DeliveryPage for a project (lazy creation). */
export async function ensureDeliveryPage(
  projectId: string,
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const existing = await sdb.deliveryPage.findFirst({ where: { projectId } })
    if (existing) return { success: true, data: { id: existing.id, publicToken: existing.publicToken } }

    const page = await sdb.deliveryPage.create({
      data: { projectId, workspaceId: gate.workspaceId },
    })
    revalidateDelivery(projectId)
    return { success: true, data: { id: page.id, publicToken: page.publicToken } }
  } catch (err) {
    console.error('[delivery] ensureDeliveryPage', err)
    return { success: false, error: 'Failed to create delivery page.' }
  }
}

export async function updateDeliveryPageMeta(
  deliveryPageId: string,
  patch: {
    title?:         string | null
    subtitle?:      string | null
    customMessage?: string | null
    coverImageUrl?: string | null
  },
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await sdb.deliveryPage.update({ where: { id: deliveryPageId }, data: patch })
    const projectId = await getProjectIdFromPage(sdb, deliveryPageId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] updateDeliveryPageMeta', err)
    return { success: false, error: 'Failed to update delivery page.' }
  }
}

export async function publishDeliveryPage(
  deliveryPageId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await sdb.deliveryPage.update({
      where: { id: deliveryPageId },
      data:  { status: 'PUBLISHED', lastPublishedAt: new Date() },
    })
    const projectId = await getProjectIdFromPage(sdb, deliveryPageId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] publishDeliveryPage', err)
    return { success: false, error: 'Failed to publish delivery page.' }
  }
}

export async function unpublishDeliveryPage(
  deliveryPageId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await sdb.deliveryPage.update({
      where: { id: deliveryPageId },
      data:  { status: 'DRAFT' },
    })
    const projectId = await getProjectIdFromPage(sdb, deliveryPageId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] unpublishDeliveryPage', err)
    return { success: false, error: 'Failed to unpublish delivery page.' }
  }
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function createSection(
  deliveryPageId: string,
  title:          string,
  orderIndex?:    number,
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    // Determine orderIndex: append after existing sections if not provided
    const idx = orderIndex ?? (await sdb.deliverableSection.count({ where: { deliveryPageId } }))
    const section = await sdb.deliverableSection.create({
      data: { deliveryPageId, title: title.trim(), orderIndex: idx, workspaceId: gate.workspaceId },
    })
    const projectId = await getProjectIdFromPage(sdb, deliveryPageId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: { id: section.id } }
  } catch (err) {
    console.error('[delivery] createSection', err)
    return { success: false, error: 'Failed to create section.' }
  }
}

export async function renameSection(
  sectionId:    string,
  title:        string,
  description?: string | null,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await sdb.deliverableSection.update({
      where: { id: sectionId },
      data:  { title: title.trim(), ...(description !== undefined ? { description } : {}) },
    })
    const projectId = await getProjectIdFromSection(sdb, sectionId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] renameSection', err)
    return { success: false, error: 'Failed to rename section.' }
  }
}

export async function reorderSections(
  deliveryPageId:    string,
  orderedSectionIds: string[],
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await Promise.all(
      orderedSectionIds.map((id, i) =>
        sdb.deliverableSection.update({ where: { id }, data: { orderIndex: i } })
      )
    )
    const projectId = await getProjectIdFromPage(sdb, deliveryPageId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] reorderSections', err)
    return { success: false, error: 'Failed to reorder sections.' }
  }
}

export async function deleteSection(
  sectionId:            string,
  moveAssetsToSection?: string | null,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const projectId = await getProjectIdFromSection(sdb, sectionId)

    if (moveAssetsToSection) {
      // Move all assets to another section before deleting
      await sdb.deliverableAsset.updateMany({
        where: { sectionId },
        data:  { sectionId: moveAssetsToSection },
      })
    }
    await sdb.deliverableSection.delete({ where: { id: sectionId } })
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] deleteSection', err)
    return { success: false, error: 'Failed to delete section.' }
  }
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function createAsset(
  deliveryPageId: string,
  sectionId:      string | null,
  fields: {
    title:        string
    type:         DeliverableItemType
    description?: string
    orderIndex?:  number
  },
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const orderIndex = fields.orderIndex ?? (await sdb.deliverableAsset.count({ where: { deliveryPageId } }))
    const asset = await sdb.deliverableAsset.create({
      data: {
        deliveryPageId,
        sectionId:   sectionId ?? undefined,
        title:       fields.title.trim(),
        type:        fields.type,
        description: fields.description ?? undefined,
        orderIndex,
        workspaceId: gate.workspaceId,
      },
    })
    const projectId = await getProjectIdFromPage(sdb, deliveryPageId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: { id: asset.id, publicToken: asset.publicToken } }
  } catch (err) {
    console.error('[delivery] createAsset', err)
    return { success: false, error: 'Failed to create asset.' }
  }
}

export async function updateAsset(
  assetId: string,
  patch: {
    title?:       string
    description?: string | null
    type?:        DeliverableItemType
    status?:      'DRAFT' | 'SHARED'
  },
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const data: Record<string, unknown> = {}
    if (patch.title       !== undefined) data.title       = patch.title.trim()
    if (patch.description !== undefined) data.description = patch.description
    if (patch.type        !== undefined) data.type        = patch.type
    if (patch.status      !== undefined) data.status      = patch.status

    await sdb.deliverableAsset.update({ where: { id: assetId }, data })
    const projectId = await getProjectIdFromAsset(sdb, assetId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] updateAsset', err)
    return { success: false, error: 'Failed to update asset.' }
  }
}

export async function reorderAssets(
  sectionId:       string,
  orderedAssetIds: string[],
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await Promise.all(
      orderedAssetIds.map((id, i) =>
        sdb.deliverableAsset.update({ where: { id }, data: { orderIndex: i } })
      )
    )
    const projectId = await getProjectIdFromSection(sdb, sectionId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] reorderAssets', err)
    return { success: false, error: 'Failed to reorder assets.' }
  }
}

export async function moveAssetToSection(
  assetId:     string,
  toSectionId: string | null,
  orderIndex:  number,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await sdb.deliverableAsset.update({
      where: { id: assetId },
      data:  { sectionId: toSectionId ?? null, orderIndex },
    })
    const projectId = await getProjectIdFromAsset(sdb, assetId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] moveAssetToSection', err)
    return { success: false, error: 'Failed to move asset.' }
  }
}

export async function deleteAsset(
  assetId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const projectId = await getProjectIdFromAsset(sdb, assetId)
    // currentVersionId FK must be cleared before we can cascade delete versions
    await sdb.deliverableAsset.update({ where: { id: assetId }, data: { currentVersionId: null } })
    await sdb.deliverableAsset.delete({ where: { id: assetId } })
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] deleteAsset', err)
    return { success: false, error: 'Failed to delete asset.' }
  }
}

// ─── Versions ─────────────────────────────────────────────────────────────────

/**
 * Add a new version to an asset.
 * Classifies the URL/iframe via detectEmbed, creates the version row,
 * then promotes it to currentVersion on the asset.
 */
export async function addVersion(
  assetId: string,
  input: {
    urlOrEmbed:   string
    note?:        string
    renderMode?:  'IFRAME' | 'NATIVE_MEDIA' | 'EXTERNAL_ONLY'
  },
): Promise<ActionResult<{ id: string; versionNumber: number }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    // Classify the input
    const detected = detectEmbed(input.urlOrEmbed.trim())
    if ('error' in detected) {
      return { success: false, error: detected.error }
    }

    const renderMode = input.renderMode ?? detected.renderMode

    // Next version number
    const existing = await sdb.deliverableVersion.count({ where: { deliverableId: assetId } })
    const versionNumber = existing + 1

    // Create version then promote atomically
    const version = await sdb.deliverableVersion.create({
      data: {
        deliverableId: assetId,
        versionNumber,
        url:           detected.canonicalUrl,
        provider:      detected.provider,
        renderMode,
        embedHtml:     detected.embedHtml ?? null,
        note:          input.note?.trim() ?? null,
        workspaceId:   gate.workspaceId,
      },
    })

    // Promote to current
    await sdb.deliverableAsset.update({
      where: { id: assetId },
      data:  { currentVersionId: version.id },
    })

    const projectId = await getProjectIdFromAsset(sdb, assetId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: { id: version.id, versionNumber } }
  } catch (err) {
    console.error('[delivery] addVersion', err)
    return { success: false, error: 'Failed to add version.' }
  }
}

export async function updateVersion(
  versionId: string,
  patch: {
    note?:         string | null
    thumbnailUrl?: string | null
  },
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    await sdb.deliverableVersion.update({ where: { id: versionId }, data: patch })
    // Revalidate via the asset
    const version = await sdb.deliverableVersion.findFirst({
      where: { id: versionId },
      select: { deliverableId: true },
    })
    if (version) {
      const projectId = await getProjectIdFromAsset(sdb, version.deliverableId)
      if (projectId) revalidateDelivery(projectId)
    }
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] updateVersion', err)
    return { success: false, error: 'Failed to update version.' }
  }
}

export async function setCurrentVersion(
  assetId:   string,
  versionId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    // Verify version belongs to this asset
    const version = await sdb.deliverableVersion.findFirst({
      where: { id: versionId, deliverableId: assetId },
    })
    if (!version) return { success: false, error: 'Version not found for this asset.' }

    await sdb.deliverableAsset.update({
      where: { id: assetId },
      data:  { currentVersionId: versionId },
    })
    const projectId = await getProjectIdFromAsset(sdb, assetId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] setCurrentVersion', err)
    return { success: false, error: 'Failed to set current version.' }
  }
}

/**
 * Delete a version. Refuses if it is the current version or the only version —
 * the caller must promote another version first.
 */
export async function deleteVersion(
  versionId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const version = await sdb.deliverableVersion.findFirst({
      where:  { id: versionId },
      select: { id: true, deliverableId: true },
    })
    if (!version) return { success: false, error: 'Version not found.' }

    const asset = await sdb.deliverableAsset.findFirst({
      where:  { id: version.deliverableId },
      select: { id: true, currentVersionId: true },
    })
    if (!asset) return { success: false, error: 'Asset not found.' }

    if (asset.currentVersionId === versionId) {
      return { success: false, error: 'Cannot delete the current version. Promote another version first.' }
    }

    const versionCount = await sdb.deliverableVersion.count({ where: { deliverableId: version.deliverableId } })
    if (versionCount <= 1) {
      return { success: false, error: 'Cannot delete the only version. Add a new version first.' }
    }

    await sdb.deliverableVersion.delete({ where: { id: versionId } })
    const projectId = await getProjectIdFromAsset(sdb, version.deliverableId)
    if (projectId) revalidateDelivery(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[delivery] deleteVersion', err)
    return { success: false, error: 'Failed to delete version.' }
  }
}

// ─── Generate from proposal ───────────────────────────────────────────────────

type GenerateChoice = {
  deliverableId: string
  /** false = omit entirely */
  include:       boolean
  /** 'section' = create a section + N cards. 'single_card' = one card, no section. */
  mode?:         'section' | 'single_card'
  /** Section title override (defaults to deliverable title). */
  sectionTitle?: string
}

type PhaseDeliverable = {
  id?:          string
  title:        string
  description?: string
  type?:        string
  quantity?:    number
  sectionIds?:  string[]
}

/**
 * Generate DeliverableSections and DeliverableAssets from the project's
 * approved proposal's phase deliverables. Idempotent: skips assets that
 * already exist by (deliveryPageId, sourceDeliverableId, sourceCardIndex).
 */
export async function generateFromProposal(
  deliveryPageId: string,
  choices:        GenerateChoice[],
): Promise<ActionResult<{ sectionsCreated: number; assetsCreated: number }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    // 1. Resolve delivery page → project
    const page = await sdb.deliveryPage.findFirst({
      where:  { id: deliveryPageId },
      select: { projectId: true },
    })
    if (!page) return { success: false, error: 'Delivery page not found.' }

    // 2. Verify project has an approved proposal
    const approvedProposal = await sdb.proposal.findFirst({
      where:   { projectId: page.projectId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      select:  { id: true },
    })
    if (!approvedProposal) return { success: false, error: 'NO_APPROVED_PROPOSAL' }

    // 3. Get primary phase deliverables
    const budget = await sdb.budget.findFirst({
      where:  { projectId: page.projectId },
      select: {
        phases: {
          where:   { isPrimary: true },
          take:    1,
          select:  { id: true, deliverables: true },
        },
      },
    })
    const primaryPhase = budget?.phases[0] ?? await sdb.phase.findFirst({
      where:  { budget: { projectId: page.projectId } },
      select: { id: true, deliverables: true },
    })
    const phaseDeliverables = (primaryPhase?.deliverables as PhaseDeliverable[] | null) ?? []

    // 4. Load existing assets to check idempotency
    const existingAssets = await sdb.deliverableAsset.findMany({
      where:  { deliveryPageId },
      select: { sourceDeliverableId: true, sourceCardIndex: true },
    })
    const existingKeys = new Set(
      existingAssets
        .filter(a => a.sourceDeliverableId)
        .map(a => `${a.sourceDeliverableId}:${a.sourceCardIndex}`)
    )

    // 5. Determine next orderIndex values
    let nextSectionOrder = await sdb.deliverableSection.count({ where: { deliveryPageId } })
    let nextAssetOrder   = await sdb.deliverableAsset.count({ where: { deliveryPageId } })

    let sectionsCreated = 0
    let assetsCreated   = 0

    // "Services" section — lazily created for single-card SERVICE/OTHER items
    let servicesSectionId: string | null = null
    async function getOrCreateServicesSection() {
      if (servicesSectionId) return servicesSectionId
      const existing = await sdb.deliverableSection.findFirst({
        where:  { deliveryPageId, title: 'Services' },
        select: { id: true },
      })
      if (existing) {
        servicesSectionId = existing.id
        return servicesSectionId
      }
      const created = await sdb.deliverableSection.create({
        data: { deliveryPageId, title: 'Services', orderIndex: nextSectionOrder++, workspaceId: gate.workspaceId },
      })
      sectionsCreated++
      servicesSectionId = created.id
      return servicesSectionId
    }

    for (const choice of choices) {
      if (!choice.include) continue

      const deliverable = phaseDeliverables.find(d => d.id === choice.deliverableId)
      if (!deliverable) continue

      const type     = (deliverable.type ?? 'DELIVERABLE') as DeliverableItemType
      const quantity = Math.max(1, deliverable.quantity ?? 1)
      const mode     = choice.mode ?? (type === 'SERVICE' || type === 'OTHER' ? 'single_card' : 'section')

      if (mode === 'section') {
        // One section + N asset cards
        const sectionTitle = (choice.sectionTitle ?? deliverable.title).trim()
        const section = await sdb.deliverableSection.create({
          data: {
            deliveryPageId,
            title:               sectionTitle,
            sourceDeliverableId: deliverable.id,
            orderIndex:          nextSectionOrder++,
            workspaceId:         gate.workspaceId,
          },
        })
        sectionsCreated++

        const digits = String(quantity).length
        for (let i = 0; i < quantity; i++) {
          const key = `${deliverable.id}:${i}`
          if (existingKeys.has(key)) continue

          const cardTitle = quantity > 1
            ? `${deliverable.title} ${String(i + 1).padStart(digits, '0')}`
            : deliverable.title

          await sdb.deliverableAsset.create({
            data: {
              deliveryPageId,
              sectionId:           section.id,
              title:               cardTitle,
              description:         deliverable.description ?? null,
              type,
              orderIndex:          i,
              sourceDeliverableId: deliverable.id,
              sourceCardIndex:     i,
              workspaceId:         gate.workspaceId,
            },
          })
          existingKeys.add(key)
          assetsCreated++
          nextAssetOrder++
        }
      } else {
        // Single card — goes into the "Services" section (or its own section if a title was given)
        const sectionId = choice.sectionTitle
          ? await (async () => {
              const s = await sdb.deliverableSection.create({
                data: { deliveryPageId, title: choice.sectionTitle!.trim(), orderIndex: nextSectionOrder++, workspaceId: gate.workspaceId },
              })
              sectionsCreated++
              return s.id
            })()
          : await getOrCreateServicesSection()

        const key = `${deliverable.id}:0`
        if (!existingKeys.has(key)) {
          await sdb.deliverableAsset.create({
            data: {
              deliveryPageId,
              sectionId,
              title:               deliverable.title,
              description:         deliverable.description ?? null,
              type,
              orderIndex:          nextAssetOrder++,
              sourceDeliverableId: deliverable.id,
              sourceCardIndex:     0,
              workspaceId:         gate.workspaceId,
            },
          })
          existingKeys.add(key)
          assetsCreated++
        }
      }
    }

    revalidateDelivery(page.projectId)
    return { success: true, data: { sectionsCreated, assetsCreated } }
  } catch (err) {
    console.error('[delivery] generateFromProposal', err)
    return { success: false, error: 'Failed to generate from proposal.' }
  }
}

/** Returns the deliverable items from the project's approved proposal's primary phase. */
export async function getProposalDeliverables(
  projectId: string,
): Promise<ActionResult<{ deliverables: PhaseDeliverable[]; hasApprovedProposal: boolean }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const approvedProposal = await sdb.proposal.findFirst({
      where:   { projectId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      select:  { id: true },
    })

    const budget = await sdb.budget.findFirst({
      where:  { projectId },
      select: {
        phases: {
          where:  { isPrimary: true },
          take:   1,
          select: { deliverables: true },
        },
      },
    })
    const primaryPhase = budget?.phases[0] ?? await sdb.phase.findFirst({
      where:  { budget: { projectId } },
      select: { deliverables: true },
    })
    const deliverables = (primaryPhase?.deliverables as PhaseDeliverable[] | null) ?? []

    return {
      success: true,
      data: {
        deliverables,
        hasApprovedProposal: !!approvedProposal,
      },
    }
  } catch (err) {
    console.error('[delivery] getProposalDeliverables', err)
    return { success: false, error: 'Failed to load deliverables.' }
  }
}

/**
 * Record that a client viewed a deliverable version.
 * Called server-side from the public asset page on load.
 * Uses db directly (no workspace scoping — called from a public route).
 * Hashes the IP with a salt so no raw IPs are stored.
 */
export async function recordDeliverableView(
  deliverableId: string,
  versionId:     string,
  workspaceId:   string,
  ip:            string,
  userAgent:     string | null,
): Promise<void> {
  try {
    const salt    = process.env.DELIVERY_VIEW_SALT ?? 'delivery-view-salt'
    const encoder = new TextEncoder()
    const data    = encoder.encode(ip + salt)
    const hashBuf = await crypto.subtle.digest('SHA-256', data)
    const ipHash  = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    await db.$transaction(async tx => {
      await tx.deliverableView.create({
        data: { deliverableId, versionId, workspaceId, ipHash, userAgent },
      })
      // Set firstClientViewAt on the version if this is the first real view
      await tx.deliverableVersion.updateMany({
        where: { id: versionId, firstClientViewAt: null },
        data:  { firstClientViewAt: new Date() },
      })
    })
  } catch (err) {
    // Non-critical — don't crash the page if view recording fails
    console.error('[delivery] recordDeliverableView', err)
  }
}

export type AssetStat = {
  assetId:       string
  viewCount:     number
  uniqueViewers: number
  firstViewAt:   Date | null
  lastViewAt:    Date | null
}

/**
 * Aggregate view stats for every asset on a delivery page.
 * Returns one row per asset regardless of whether it has views yet.
 */
export async function getDeliveryAnalytics(
  deliveryPageId: string,
): Promise<ActionResult<AssetStat[]>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    // Fetch all asset IDs on the page
    const assets = await sdb.deliverableAsset.findMany({
      where:  { deliveryPageId },
      select: { id: true },
    })
    const assetIds = assets.map(a => a.id)

    if (assetIds.length === 0) return { success: true, data: [] }

    // Fetch all view rows for those assets (view counts are modest per-asset)
    const views = await db.deliverableView.findMany({
      where:  { deliverableId: { in: assetIds } },
      select: { deliverableId: true, ipHash: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Aggregate in JS: total loads + distinct IPs + date range
    const byAsset = new Map<string, { total: number; ipHashes: Set<string>; first: Date; last: Date }>()
    for (const v of views) {
      const existing = byAsset.get(v.deliverableId)
      if (existing) {
        existing.total++
        existing.ipHashes.add(v.ipHash)
        if (v.createdAt < existing.first) existing.first = v.createdAt
        if (v.createdAt > existing.last)  existing.last  = v.createdAt
      } else {
        byAsset.set(v.deliverableId, { total: 1, ipHashes: new Set([v.ipHash]), first: v.createdAt, last: v.createdAt })
      }
    }

    const data: AssetStat[] = assetIds.map(id => {
      const agg = byAsset.get(id)
      return {
        assetId:       id,
        viewCount:     agg?.total         ?? 0,
        uniqueViewers: agg?.ipHashes.size ?? 0,
        firstViewAt:   agg?.first ?? null,
        lastViewAt:    agg?.last  ?? null,
      }
    })

    return { success: true, data }
  } catch (err) {
    console.error('[delivery] getDeliveryAnalytics', err)
    return { success: false, error: 'Failed to load analytics.' }
  }
}
