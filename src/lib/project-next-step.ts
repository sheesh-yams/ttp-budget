// The Status column on /projects: what needs to happen next on a project,
// worked out from its proposals, invoices, call sheets and dates. Nobody sets
// it. The first matching rule wins. Red and amber steps make up the "Needs
// attention" tab; rules 1–4 use the same thresholds as the old attention
// sidebar. Plain module, computed server-side — `showMoney: false` keeps
// amounts out of the payload for margin-blind roles.

import { formatMoney } from '@/lib/money'
import { isPaidInFull } from '@/lib/project-phase'

export type StepTone = 'red' | 'amber' | 'violet' | 'green' | 'grey'

export interface NextStep {
  tone:    StepTone
  label:   string
  detail?: string
}

export interface NextStepFacts {
  status: string
  /** "YYYY-MM-DD" (UTC) or null. */
  shootStart: string | null
  proposals: {
    status: string
    viewCount: number
    lastViewedAt: string | null
    sentAt: string | null
    expiresAt: string | null
  }[]
  invoices: {
    kind?: string | null
    status: string
    totalCents: number
    amountPaidCents: number
    dueDate: string
    invoiceNumber?: string | null
  }[]
  callSheets: { status: string }[]
  expectedCents: number
}

const DAY = 86_400_000
const OPEN = ['SENT', 'VIEWED', 'OVERDUE']
const PENDING_PROPOSAL = ['SENT', 'VIEWED']

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function needsAttention(step: NextStep): boolean {
  return step.tone === 'red' || step.tone === 'amber'
}

export function nextStep(f: NextStepFacts, now: Date, opts: { showMoney: boolean }): NextStep {
  if (f.status === 'ARCHIVED') return { tone: 'grey', label: 'Archived' }
  const t = now.getTime()
  const todayKey = now.toISOString().slice(0, 10)
  const won = f.proposals.some(p => p.status === 'APPROVED')

  // 1. Overdue invoice (the most overdue one).
  const overdue = f.invoices
    .filter(i => OPEN.includes(i.status) && i.amountPaidCents < i.totalCents && new Date(i.dueDate).getTime() < t)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]
  if (overdue) {
    const days = Math.max(1, Math.floor((t - new Date(overdue.dueDate).getTime()) / DAY))
    const detail = [overdue.invoiceNumber, opts.showMoney ? `${formatMoney(overdue.totalCents - overdue.amountPaidCents)} balance` : null]
      .filter(Boolean).join(' · ')
    return { tone: 'red', label: `Invoice overdue ${plural(days, 'day')}`, detail: detail || undefined }
  }

  if (f.status === 'WRAPPED') return { tone: 'grey', label: 'Wrapped' }

  // 2. Shoot within 4 days with no call sheet sent.
  if (f.shootStart && f.shootStart >= todayKey) {
    const days = Math.round((Date.parse(`${f.shootStart}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / DAY)
    if (days <= 4 && !f.callSheets.some(c => c.status === 'SENT' || c.status === 'FINAL')) {
      return { tone: 'amber', label: 'Call sheet not sent', detail: days === 0 ? 'Shoot is today' : `Shoot in ${plural(days, 'day')}` }
    }
  }

  if (!won) {
    const pending = f.proposals.filter(p => PENDING_PROPOSAL.includes(p.status))
    // 3. A pending proposal expiring within 2 days.
    const expiring = pending
      .filter(p => p.expiresAt && Date.parse(p.expiresAt) >= t && Date.parse(p.expiresAt) <= t + 2 * DAY)
      .sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!))[0]
    if (expiring) {
      const days = Math.max(1, Math.ceil((Date.parse(expiring.expiresAt!) - t) / DAY))
      return { tone: 'amber', label: `Proposal expires in ${plural(days, 'day')}`, detail: expiring.viewCount ? `Viewed ${expiring.viewCount}×` : 'Not opened yet' }
    }
    // 4. Viewed more than 5 days ago, no answer.
    const stale = pending
      .filter(p => p.status === 'VIEWED' && p.lastViewedAt && t - Date.parse(p.lastViewedAt) > 5 * DAY)
      .sort((a, b) => Date.parse(b.lastViewedAt!) - Date.parse(a.lastViewedAt!))[0]
    if (stale) {
      const days = Math.floor((t - Date.parse(stale.lastViewedAt!)) / DAY)
      return { tone: 'amber', label: `No reply in ${plural(days, 'day')}`, detail: `Proposal viewed ${stale.viewCount}× · last ${shortDate(stale.lastViewedAt!)}` }
    }
  }

  // 5. Won, deposit invoice out but unpaid.
  const deposit = f.invoices.find(i => i.kind === 'DEPOSIT' && OPEN.includes(i.status) && i.amountPaidCents < i.totalCents)
  if (won && deposit) {
    return { tone: 'amber', label: 'Awaiting deposit', detail: `Due ${shortDate(deposit.dueDate)}` }
  }

  if (!won) {
    // 6. Proposal out.
    const latest = f.proposals
      .filter(p => PENDING_PROPOSAL.includes(p.status))
      .sort((a, b) => Date.parse(b.sentAt ?? '1970') - Date.parse(a.sentAt ?? '1970'))[0]
    if (latest) {
      return latest.status === 'VIEWED'
        ? { tone: 'violet', label: `Proposal viewed ${latest.viewCount}×`, detail: latest.lastViewedAt ? `Last ${shortDate(latest.lastViewedAt)}` : undefined }
        : { tone: 'violet', label: 'Proposal sent', detail: latest.sentAt ? `Sent ${shortDate(latest.sentAt)} · not opened yet` : undefined }
    }
    // 7. A lead with nothing sent (an invoice already out counts as sent).
    if (f.status === 'LEAD' && !f.invoices.some(i => i.status !== 'DRAFT' && i.status !== 'VOID')) {
      const changes = f.proposals.some(p => p.status === 'CHANGES_NEEDED')
      return changes
        ? { tone: 'amber', label: 'Client asked for changes' }
        : { tone: 'grey', label: 'Draft the proposal' }
    }
  }

  // 8. Paid in full.
  if (isPaidInFull({ invoices: f.invoices.map(i => ({ ...i, issueDate: '' })), expectedCents: f.expectedCents })) {
    return { tone: 'green', label: 'Paid in full' }
  }

  // 9.
  const out = f.invoices.filter(i => OPEN.includes(i.status) && i.amountPaidCents < i.totalCents)
  if (out.length) {
    const next = out.sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate))[0]
    return { tone: 'grey', label: 'On track', detail: `Invoice due ${shortDate(next.dueDate)}` }
  }
  return { tone: 'grey', label: 'On track' }
}
