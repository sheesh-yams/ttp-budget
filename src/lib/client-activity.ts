// The client page's activity feed, built from row timestamps (not the audit
// log): only rows the viewer may see are passed in, so visibility comes for
// free. Plain module (jest-tested).

export type ActivityKind =
  | 'project.created'
  | 'proposal.sent' | 'proposal.viewed' | 'proposal.won' | 'proposal.declined'
  | 'invoice.sent' | 'invoice.viewed' | 'invoice.paid'
  | 'deliverable.viewed'

export interface ActivityEntry {
  at:   string
  kind: ActivityKind
  text: string
  href: string
}

type D = Date | string | null | undefined

export interface ActivityInput {
  projects:     { id: string; name: string; createdAt: D }[]
  /** Proposals the viewer may see (Proposals access on their project). */
  proposals:    { projectId: string; projectName: string; title: string; status: string; sentAt: D; firstViewedAt: D; approvedAt: D; declinedAt: D }[]
  /** Invoices the viewer may see (Invoices access on their project). */
  invoices:     { projectId: string; number: string; sentAt: D; firstViewedAt: D; paidAt: D }[]
  /** First client view per deliverable version. */
  deliverables: { projectId: string; title: string; firstClientViewAt: D }[]
}

const iso = (d: D) => (d ? new Date(d).toISOString() : null)

export function buildClientActivity(input: ActivityInput, limit = 25): ActivityEntry[] {
  const out: ActivityEntry[] = []
  const push = (at: D, kind: ActivityKind, text: string, href: string) => {
    const a = iso(at)
    if (a) out.push({ at: a, kind, text, href })
  }

  for (const p of input.projects) push(p.createdAt, 'project.created', `Project created · ${p.name}`, `/projects/${p.id}`)

  for (const p of input.proposals) {
    const href = `/projects/${p.projectId}`
    const what = p.title?.trim() || p.projectName
    push(p.sentAt, 'proposal.sent', `Proposal sent · ${what}`, href)
    push(p.firstViewedAt, 'proposal.viewed', `Proposal opened · ${what}`, href)
    // approvedAt is only set by e-signature; a manual win has no timestamp of its own.
    if (p.status === 'APPROVED') push(p.approvedAt, 'proposal.won', `Proposal won · ${what}`, href)
    if (p.status === 'DECLINED') push(p.declinedAt, 'proposal.declined', `Proposal declined · ${what}`, href)
  }

  for (const i of input.invoices) {
    const href = `/projects/${i.projectId}/invoices`
    push(i.sentAt, 'invoice.sent', `Invoice ${i.number} sent`, href)
    push(i.firstViewedAt, 'invoice.viewed', `Invoice ${i.number} opened`, href)
    push(i.paidAt, 'invoice.paid', `Invoice ${i.number} paid`, href)
  }

  for (const d of input.deliverables) {
    push(d.firstClientViewAt, 'deliverable.viewed', `Deliverable viewed · ${d.title}`, `/projects/${d.projectId}/delivery`)
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit)
}
