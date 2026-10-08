// Contract templates — named, ordered groups of contract blocks (Settings →
// Contracts → Contract Builder). Plain module, shared by the deal memo and
// proposal actions; the pure helper is unit-tested.

import type { ContractAudience } from '@prisma/client'
import type { ScopedDb } from '@/lib/db-scoped'

export interface TemplateBlock { id: string; title: string; body: string }

/**
 * Which template blocks to add to a memo/proposal that already has sections:
 * the ones not already there (matched by source block), in template order.
 * Applying a template never removes or overwrites anything.
 */
export function mergeTemplateSections(
  existingSourceBlockIds: (string | null)[],
  templateBlocks: TemplateBlock[],
): TemplateBlock[] {
  const present = new Set(existingSourceBlockIds.filter((id): id is string => !!id))
  const seen = new Set<string>()
  return templateBlocks.filter(b => {
    if (present.has(b.id) || seen.has(b.id)) return false
    seen.add(b.id)
    return true
  })
}

/**
 * The blocks a memo/proposal starts with (or a chosen template adds):
 *   1. the chosen template's active blocks, in order;
 *   2. else the audience's default template;
 *   3. else (no templates yet) the blocks marked "attach by default".
 * Returns null when a template id was given but isn't this workspace's
 * template for this audience.
 */
export async function resolveTemplateBlocks(
  sdb: ScopedDb,
  audience: ContractAudience,
  templateId?: string | null,
): Promise<TemplateBlock[] | null> {
  const select = {
    blocks: {
      orderBy: { orderIndex: 'asc' as const },
      select:  { block: { select: { id: true, title: true, body: true, isActive: true, audience: true } } },
    },
  }
  const template = templateId
    ? await sdb.contractTemplate.findFirst({ where: { id: templateId, audience }, select })
    : await sdb.contractTemplate.findFirst({ where: { audience, isDefault: true }, select })
  if (templateId && !template) return null

  if (template) {
    return template.blocks
      .map(b => b.block)
      // Same audience is enforced on save; re-checked here so a vendor block
      // can never reach a client proposal (or the reverse).
      .filter(b => b.isActive && b.audience === audience)
      .map(({ id, title, body }) => ({ id, title, body }))
  }

  return sdb.contractBlock.findMany({
    where:   { audience, isActive: true, isDefault: true },
    orderBy: { orderIndex: 'asc' },
    select:  { id: true, title: true, body: true },
  })
}
