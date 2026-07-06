/**
 * contract-triggers.ts — pure trigger evaluation (no DB, no side-effects)
 *
 * Evaluates which contract blocks should be suggested for a proposal based on
 * its scope items and budget account names. Returns matched blocks; the caller
 * decides which are already attached and filters accordingly.
 *
 * Rules:
 *  - KEYWORD:          match value appears (case-insensitive) in item title,
 *                      description, or tags. One matching item is sufficient.
 *  - DELIVERABLE_TYPE: item.type equals the match value exactly.
 *  - BUDGET_ACCOUNT:   account name contains the match value (case-insensitive).
 *  - A block matches if ANY of its triggers fire.
 *  - isDefault blocks are excluded (they attach unconditionally, not via triggers).
 *  - Inactive blocks are excluded.
 */

import type { ScopeItem } from '@/types'

export interface BlockForEval {
  id:       string
  title:    string
  category: string
  isDefault: boolean
  isActive:  boolean
  triggers: {
    kind:       'KEYWORD' | 'DELIVERABLE_TYPE' | 'BUDGET_ACCOUNT'
    matchValue: string
  }[]
}

export interface TriggerMatch {
  blockId:    string
  blockTitle: string
  category:   string
  matchedBy:  string  // human-readable, e.g. "keyword: video"
}

export function evaluateContractTriggers(
  blocks:             BlockForEval[],
  scopeItems:         ScopeItem[],
  budgetAccountNames: string[] = [],
): TriggerMatch[] {
  const results: TriggerMatch[] = []

  for (const block of blocks) {
    if (!block.isActive || block.isDefault) continue

    for (const trigger of block.triggers) {
      let matched = false
      let matchedBy = ''

      if (trigger.kind === 'KEYWORD') {
        const kw = trigger.matchValue.toLowerCase()
        matched = scopeItems.some(item => {
          const haystack = [
            item.title,
            item.description,
            ...(item.tags ?? []),
          ].join(' ').toLowerCase()
          return haystack.includes(kw)
        })
        if (matched) matchedBy = `keyword: ${trigger.matchValue}`
      }

      if (trigger.kind === 'DELIVERABLE_TYPE') {
        matched = scopeItems.some(item => item.type === trigger.matchValue)
        if (matched) matchedBy = `type: ${trigger.matchValue}`
      }

      if (trigger.kind === 'BUDGET_ACCOUNT') {
        const acctKw = trigger.matchValue.toLowerCase()
        matched = budgetAccountNames.some(name => name.toLowerCase().includes(acctKw))
        if (matched) matchedBy = `account: ${trigger.matchValue}`
      }

      if (matched) {
        results.push({
          blockId:    block.id,
          blockTitle: block.title,
          category:   block.category,
          matchedBy,
        })
        break  // one trigger match is enough for this block
      }
    }
  }

  return results
}
