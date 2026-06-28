'use server'

/**
 * Delivery feature server actions — Phase 1 stubs.
 * All actions are gated by requireRole(['OWNER', 'PRODUCER']) and use getScopedDb().
 * Full implementations land in Phase 2.
 */

import { requireRole }  from '@/lib/auth'
import { getScopedDb }  from '@/lib/db-scoped'
import type { ActionResult } from '@/types'
import type { DeliverableItemType } from '@/types'

const NOT_IMPLEMENTED = { success: false, error: 'NOT_IMPLEMENTED' } as const

// ─── Delivery page ────────────────────────────────────────────────────────────

/** Get or create the DeliveryPage for a project. */
export async function ensureDeliveryPage(
  projectId: string,
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void getScopedDb  // will be used in Phase 2
  void projectId
  return NOT_IMPLEMENTED
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
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId; void patch
  return NOT_IMPLEMENTED
}

export async function publishDeliveryPage(
  deliveryPageId: string,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId
  return NOT_IMPLEMENTED
}

export async function unpublishDeliveryPage(
  deliveryPageId: string,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId
  return NOT_IMPLEMENTED
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function createSection(
  deliveryPageId: string,
  title:          string,
  orderIndex?:    number,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId; void title; void orderIndex
  return NOT_IMPLEMENTED
}

export async function renameSection(
  sectionId:    string,
  title:        string,
  description?: string | null,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void sectionId; void title; void description
  return NOT_IMPLEMENTED
}

export async function reorderSections(
  deliveryPageId:    string,
  orderedSectionIds: string[],
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId; void orderedSectionIds
  return NOT_IMPLEMENTED
}

export async function deleteSection(
  sectionId:           string,
  moveAssetsToSection?: string | null,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void sectionId; void moveAssetsToSection
  return NOT_IMPLEMENTED
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
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId; void sectionId; void fields
  return NOT_IMPLEMENTED
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
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void assetId; void patch
  return NOT_IMPLEMENTED
}

export async function reorderAssets(
  sectionId:      string,
  orderedAssetIds: string[],
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void sectionId; void orderedAssetIds
  return NOT_IMPLEMENTED
}

export async function moveAssetToSection(
  assetId:    string,
  toSectionId: string | null,
  orderIndex:  number,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void assetId; void toSectionId; void orderIndex
  return NOT_IMPLEMENTED
}

export async function deleteAsset(
  assetId: string,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void assetId
  return NOT_IMPLEMENTED
}

// ─── Versions ─────────────────────────────────────────────────────────────────

/**
 * Add a new version to an asset using a raw URL or iframe HTML snippet.
 * Uses embed-detection to classify the input. Auto-promotes to current version.
 */
export async function addVersion(
  assetId:   string,
  input: {
    urlOrEmbed: string
    note?:      string
  },
): Promise<ActionResult<{ id: string; versionNumber: number }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void assetId; void input
  return NOT_IMPLEMENTED
}

export async function updateVersion(
  versionId: string,
  patch: {
    note?:         string | null
    thumbnailUrl?: string | null
  },
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void versionId; void patch
  return NOT_IMPLEMENTED
}

export async function setCurrentVersion(
  assetId:   string,
  versionId: string,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void assetId; void versionId
  return NOT_IMPLEMENTED
}

/**
 * Refuses to delete if it is the current version or the only version —
 * caller must promote another version first.
 */
export async function deleteVersion(
  versionId: string,
): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void versionId
  return NOT_IMPLEMENTED
}

// ─── Generate from proposal ───────────────────────────────────────────────────

export async function generateFromProposal(
  deliveryPageId: string,
  choices: {
    deliverableId: string
    include:       boolean
    sectionTitle?: string
  }[],
): Promise<ActionResult<{ sectionsCreated: number; assetsCreated: number }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  void deliveryPageId; void choices
  return NOT_IMPLEMENTED
}
