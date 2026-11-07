// Permanent project delete (owners only, archived projects only). Plain
// module: the preview type and the typed-name check, shared by the action and
// DeleteProjectDialog (jest-tested).

/** What deleting a project removes — shown in the confirm dialog. */
export interface ProjectDeletePreview {
  name:       string
  budgets:    number
  proposals:  number
  invoices:   number
  /** Money recorded as paid on its invoices (cents). Deleting refunds nothing. */
  paidCents:  number
  callSheets: number
  dealMemos:  number
  receipts:   number
}

/** The typed confirmation must be the project's name (case and outer spaces ignored). */
export function deleteNameMatches(typed: string, projectName: string): boolean {
  const t = typed.trim().toLowerCase()
  return t.length > 0 && t === projectName.trim().toLowerCase()
}

/** "5 proposals · 1 invoice · 2 call sheets" — non-zero counts only. */
export function describeDeletePreview(p: ProjectDeletePreview): string {
  const part = (n: number, one: string, many = `${one}s`) => (n > 0 ? `${n} ${n === 1 ? one : many}` : null)
  return [
    part(p.budgets, 'budget'), part(p.proposals, 'proposal'), part(p.invoices, 'invoice'),
    part(p.callSheets, 'call sheet'), part(p.dealMemos, 'deal memo'), part(p.receipts, 'receipt'),
  ].filter(Boolean).join(' · ') || 'No budgets, proposals or invoices'
}
