'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getWorkspaceId } from '@/lib/auth'
import { evaluateContractTriggers } from '@/lib/contract-triggers'
import type { ActionResult } from '@/types'
import type { ScopeItem, ProposalContent } from '@/types'
import type { AttachSource, ContractBlockCategory } from '@prisma/client'
import type { MergeTagContext } from '@/lib/merge-tags'

// ─── Public types ──────────────────────────────────────────────────────────────

export interface ContractSectionRow {
  id:               string
  proposalId:       string
  sourceBlockId:    string | null
  title:            string
  body:             string
  orderIndex:       number
  attachedBy:       AttachSource
  editedFromSource: boolean
  createdAt:        Date
  updatedAt:        Date
}

export interface SuggestedBlock {
  blockId:    string
  blockTitle: string
  category:   ContractBlockCategory
  matchedBy:  string
}

export interface EvaluateResult {
  suggested:     SuggestedBlock[]
  staleAttached: string[]  // section IDs whose AUTO trigger no longer fires
}

export interface LibraryBlockOption {
  id:        string
  title:     string
  category:  ContractBlockCategory
  isDefault: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getScopeItems(content: unknown): ScopeItem[] {
  const c = content as ProposalContent | null
  const scope = c?.sections?.find(s => s.type === 'scope')
  return scope?.type === 'scope' ? scope.items : []
}

type PCS = { create: (a: { data: unknown }) => Promise<unknown> }

function pcs(sdb: Awaited<ReturnType<typeof getScopedDb>>) {
  return (sdb as unknown as { proposalContractSection: PCS }).proposalContractSection
}

// ─── Merge-tag context for the preview panel ──────────────────────────────────

export async function getMergeTagContext(
  proposalId: string,
): Promise<ActionResult<MergeTagContext>> {
  try {
    const sdb = await getScopedDb()

    type ProposalRow = {
      expiresAt: Date | null
      content:   unknown
      project: {
        name:   string
        client: { name: string; company: string | null }
      }
      workspace: { name: string; legalName: string | null }
    }

    const proposal = await (sdb as unknown as {
      proposal: { findFirst: (a: object) => Promise<ProposalRow | null> }
    }).proposal.findFirst({
      where: { id: proposalId },
      select: {
        expiresAt: true,
        content:   true,
        project: {
          select: {
            name:   true,
            client: { select: { name: true, company: true } },
          },
        },
        workspace: { select: { name: true, legalName: true } },
      },
    })

    if (!proposal) return { success: false, error: 'Proposal not found.' }

    const snap      = (proposal.content as { budgetSnapshot?: { totalCents?: number } } | null)?.budgetSnapshot
    const totalStr  = snap?.totalCents != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(snap.totalCents / 100)
      : undefined
    const validThrough = proposal.expiresAt
      ? new Date(proposal.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : undefined

    return {
      success: true,
      data: {
        workspace: { name: proposal.workspace.name, legalName: proposal.workspace.legalName ?? undefined },
        client:    { name: proposal.project.client.name, company: proposal.project.client.company ?? undefined },
        project:   { name: proposal.project.name },
        proposal:  { total: totalStr, validThrough },
      },
    }
  } catch {
    return { success: false, error: 'Failed to fetch context.' }
  }
}

// ─── Toggle contract on/off for a proposal ────────────────────────────────────

export async function setContractEnabled(
  proposalId: string,
  enabled: boolean,
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    await (sdb as unknown as {
      proposal: { update: (a: object) => Promise<unknown> }
    }).proposal.update({
      where: { id: proposalId },
      data:  { contractEnabled: enabled },
    })
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update contract setting.' }
  }
}

// ─── List sections ─────────────────────────────────────────────────────────────

export async function listContractSections(
  proposalId: string
): Promise<ActionResult<ContractSectionRow[]>> {
  try {
    const sdb = await getScopedDb()
    const rows = await (sdb as unknown as {
      proposalContractSection: {
        findMany: (a: object) => Promise<ContractSectionRow[]>
      }
    }).proposalContractSection.findMany({
      where:   { proposalId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    })
    return { success: true, data: rows }
  } catch {
    return { success: false, error: 'Failed to load contract sections.' }
  }
}

// ─── Evaluate triggers ─────────────────────────────────────────────────────────

export async function evaluateProposalContractTriggers(
  proposalId: string
): Promise<ActionResult<EvaluateResult>> {
  try {
    const sdb = await getScopedDb()

    type BlockRow = {
      id: string; title: string; category: string; isDefault: boolean; isActive: boolean
      triggers: { kind: 'KEYWORD' | 'DELIVERABLE_TYPE' | 'BUDGET_ACCOUNT'; matchValue: string }[]
    }
    type AttachedRow = { id: string; sourceBlockId: string | null; attachedBy: string }

    const sdbAny = sdb as unknown as {
      proposal: { findFirst: (a: object) => Promise<{ content: unknown } | null> }
      contractBlock: { findMany: (a: object) => Promise<BlockRow[]> }
      proposalContractSection: { findMany: (a: object) => Promise<AttachedRow[]> }
    }

    const [proposal, blocks, attached] = await Promise.all([
      sdbAny.proposal.findFirst({ where: { id: proposalId }, select: { content: true } }),
      sdbAny.contractBlock.findMany({ where: { isActive: true }, include: { triggers: true }, orderBy: { orderIndex: 'asc' } }),
      sdbAny.proposalContractSection.findMany({ where: { proposalId }, select: { id: true, sourceBlockId: true, attachedBy: true } }),
    ])

    if (!proposal) return { success: false, error: 'Proposal not found.' }

    const scopeItems     = getScopeItems(proposal.content)
    const allMatches     = evaluateContractTriggers(blocks, scopeItems)
    const attachedSrcIds = new Set(attached.map(a => a.sourceBlockId).filter(Boolean))

    const suggested = allMatches
      .filter(m => !attachedSrcIds.has(m.blockId))
      .map(m => ({
        blockId:    m.blockId,
        blockTitle: m.blockTitle,
        category:   m.category as ContractBlockCategory,
        matchedBy:  m.matchedBy,
      }))

    const matchedIds  = new Set(allMatches.map(m => m.blockId))
    const staleAttached = attached
      .filter(a => a.attachedBy === 'AUTO' && a.sourceBlockId && !matchedIds.has(a.sourceBlockId))
      .map(a => a.id)

    return { success: true, data: { suggested, staleAttached } }
  } catch {
    return { success: false, error: 'Failed to evaluate triggers.' }
  }
}

// ─── Auto-attach defaults ──────────────────────────────────────────────────────

export async function attachDefaultBlocks(
  proposalId: string
): Promise<ActionResult<void>> {
  try {
    const workspaceId = await getWorkspaceId()
    const sdb = await getScopedDb()

    type SectionRow = { id: string }
    type BlockRow = { id: string; title: string; body: string; orderIndex: number }
    const sdbAny = sdb as unknown as {
      proposalContractSection: {
        findFirst: (a: object) => Promise<SectionRow | null>
        createMany: (a: object) => Promise<unknown>
      }
      contractBlock: { findMany: (a: object) => Promise<BlockRow[]> }
    }

    const existing = await sdbAny.proposalContractSection.findFirst({
      where: { proposalId }, select: { id: true },
    })
    if (existing) return { success: true, data: undefined }

    const defaults = await sdbAny.contractBlock.findMany({
      where: { isDefault: true, isActive: true }, orderBy: { orderIndex: 'asc' },
    })
    if (defaults.length === 0) return { success: true, data: undefined }

    await sdbAny.proposalContractSection.createMany({
      data: defaults.map((b, i) => ({
        workspaceId,
        proposalId,
        sourceBlockId:    b.id,
        title:            b.title,
        body:             b.body,
        orderIndex:       (i + 1) * 10,
        attachedBy:       'DEFAULT',
        editedFromSource: false,
      })),
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to attach default blocks.' }
  }
}

// ─── Attach a library block ────────────────────────────────────────────────────

export async function attachContractBlock(
  proposalId: string,
  blockId:    string,
  source:     AttachSource = 'MANUAL',
): Promise<ActionResult<{ id: string }>> {
  try {
    const workspaceId = await getWorkspaceId()
    const sdb = await getScopedDb()

    type BlockRow = { id: string; title: string; body: string }
    type AggRow = { _max: { orderIndex: number | null } }
    type CreateRes = { id: string }
    const sdbAny = sdb as unknown as {
      contractBlock: { findFirst: (a: object) => Promise<BlockRow | null> }
      proposalContractSection: {
        aggregate: (a: object) => Promise<AggRow>
        create: (a: object) => Promise<CreateRes>
      }
    }

    const block = await sdbAny.contractBlock.findFirst({ where: { id: blockId } })
    if (!block) return { success: false, error: 'Block not found.' }

    const maxOrder = await sdbAny.proposalContractSection.aggregate({
      where: { proposalId }, _max: { orderIndex: true },
    })

    const section = await sdbAny.proposalContractSection.create({
      data: {
        workspaceId,
        proposalId,
        sourceBlockId:    block.id,
        title:            block.title,
        body:             block.body,
        orderIndex:       (maxOrder._max.orderIndex ?? 0) + 10,
        attachedBy:       source,
        editedFromSource: false,
      },
    })

    revalidatePath('/projects')
    return { success: true, data: { id: section.id } }
  } catch {
    return { success: false, error: 'Failed to attach block.' }
  }
}

// ─── Add ad-hoc section ────────────────────────────────────────────────────────

export async function addAdHocSection(
  proposalId: string,
  title:      string,
  body:       string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const workspaceId = await getWorkspaceId()
    const sdb = await getScopedDb()

    type AggRow = { _max: { orderIndex: number | null } }
    type CreateRes = { id: string }
    const sdbAny = sdb as unknown as {
      proposalContractSection: {
        aggregate: (a: object) => Promise<AggRow>
        create: (a: object) => Promise<CreateRes>
      }
    }

    const maxOrder = await sdbAny.proposalContractSection.aggregate({
      where: { proposalId }, _max: { orderIndex: true },
    })

    const section = await sdbAny.proposalContractSection.create({
      data: {
        workspaceId,
        proposalId,
        sourceBlockId:    null,
        title:            title.trim() || 'Untitled section',
        body:             body,
        orderIndex:       (maxOrder._max.orderIndex ?? 0) + 10,
        attachedBy:       'MANUAL',
        editedFromSource: false,
      },
    })

    revalidatePath('/projects')
    return { success: true, data: { id: section.id } }
  } catch {
    return { success: false, error: 'Failed to add section.' }
  }
}

// ─── Update a section ─────────────────────────────────────────────────────────

export async function updateContractSection(
  sectionId: string,
  title:     string,
  body:      string,
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()

    type SectionRow = { sourceBlockId: string | null; title: string; body: string }
    const sdbAny = sdb as unknown as {
      proposalContractSection: {
        findFirst: (a: object) => Promise<SectionRow | null>
        update: (a: object) => Promise<unknown>
      }
    }

    const existing = await sdbAny.proposalContractSection.findFirst({
      where: { id: sectionId }, select: { sourceBlockId: true, title: true, body: true },
    })
    if (!existing) return { success: false, error: 'Section not found.' }

    const editedFromSource = !!existing.sourceBlockId &&
      (title.trim() !== existing.title || body !== existing.body)

    await sdbAny.proposalContractSection.update({
      where: { id: sectionId },
      data:  { title: title.trim(), body, editedFromSource },
    })

    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update section.' }
  }
}

// ─── Reset to library source ───────────────────────────────────────────────────

export async function resetContractSection(sectionId: string): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()

    type SectionRow = { sourceBlockId: string | null }
    type BlockRow   = { title: string; body: string }
    const sdbAny = sdb as unknown as {
      proposalContractSection: {
        findFirst: (a: object) => Promise<SectionRow | null>
        update: (a: object) => Promise<unknown>
      }
      contractBlock: { findFirst: (a: object) => Promise<BlockRow | null> }
    }

    const existing = await sdbAny.proposalContractSection.findFirst({
      where: { id: sectionId }, select: { sourceBlockId: true },
    })
    if (!existing?.sourceBlockId) return { success: false, error: 'No source block to reset to.' }

    const block = await sdbAny.contractBlock.findFirst({ where: { id: existing.sourceBlockId } })
    if (!block) return { success: false, error: 'Source block no longer exists.' }

    await sdbAny.proposalContractSection.update({
      where: { id: sectionId },
      data:  { title: block.title, body: block.body, editedFromSource: false },
    })

    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reset section.' }
  }
}

// ─── Remove a section ─────────────────────────────────────────────────────────

export async function removeContractSection(sectionId: string): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    await (sdb as unknown as {
      proposalContractSection: { delete: (a: object) => Promise<unknown> }
    }).proposalContractSection.delete({ where: { id: sectionId } })
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to remove section.' }
  }
}

// ─── Reorder sections ─────────────────────────────────────────────────────────

export async function reorderContractSections(
  orderedIds: string[]
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    const sdbAny = sdb as unknown as {
      proposalContractSection: { update: (a: object) => Promise<unknown> }
    }
    await Promise.all(
      orderedIds.map((id, i) =>
        sdbAny.proposalContractSection.update({ where: { id }, data: { orderIndex: (i + 1) * 10 } })
      )
    )
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reorder sections.' }
  }
}

// ─── Library picker ───────────────────────────────────────────────────────────

export async function listLibraryBlocksForPicker(): Promise<ActionResult<LibraryBlockOption[]>> {
  try {
    const sdb = await getScopedDb()
    const blocks = await (sdb as unknown as {
      contractBlock: { findMany: (a: object) => Promise<LibraryBlockOption[]> }
    }).contractBlock.findMany({
      where:   { isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { title: 'asc' }],
      select:  { id: true, title: true, category: true, isDefault: true },
    })
    return { success: true, data: blocks }
  } catch {
    return { success: false, error: 'Failed to load library blocks.' }
  }
}
