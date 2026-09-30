/**
 * Read-only data-drift report for /health-check. Looks for row states the app
 * should never produce — each check exists because a real bug once produced it.
 * Makes no writes; fixing anything it finds goes through the backfill protocol
 * in CLAUDE.md (ask first, guarded transaction, AuditEvent per row).
 *
 * Run: npx tsx scripts/health-data-checks.ts
 */
import { db } from '../src/lib/db'

type Finding = { check: string; why: string; rows: string[] }
const findings: Finding[] = []

function add(check: string, why: string, rows: string[]) {
  findings.push({ check, why, rows })
}

async function main() {
  // Proposals: a recorded decision whose status no longer matches it.
  const approvedDrift = await db.proposal.findMany({
    where: { approvedAt: { not: null }, status: { not: 'APPROVED' } },
    select: { title: true, status: true, approvedAt: true, workspaceId: true },
  })
  add('Proposal approved but not APPROVED',
    'recordProposalView used to downgrade signed proposals on re-open (fixed fe6d9e2); could also be a deliberate manual change',
    approvedDrift.map(p => `${p.title} — ${p.status}, approved ${p.approvedAt?.toISOString().slice(0, 10)} [${p.workspaceId}]`))

  const declinedDrift = await db.proposal.findMany({
    where: { declinedAt: { not: null }, status: { not: 'DECLINED' } },
    select: { title: true, status: true, workspaceId: true },
  })
  add('Proposal declined but not DECLINED', 'same class as above',
    declinedDrift.map(p => `${p.title} — ${p.status} [${p.workspaceId}]`))

  // Projects that won a proposal but never left Lead.
  const stuckLead = await db.project.findMany({
    where: { status: 'LEAD', archivedAt: null, proposals: { some: { status: 'APPROVED' } } },
    select: { name: true, workspaceId: true },
  })
  add('Project still LEAD with an APPROVED proposal',
    'e-signature used to skip applyProposalWonEffects (fixed fe6d9e2)',
    stuckLead.map(p => `${p.name} [${p.workspaceId}]`))

  // Invoices whose status disagrees with the money recorded against them.
  const invoices = await db.invoice.findMany({
    where: { status: { not: 'VOID' }, totalCents: { gt: 0 } },
    select: { number: true, status: true, totalCents: true, amountPaidCents: true, workspaceId: true },
  })
  add('Invoice PAID but underpaid', 'status and payments disagree',
    invoices.filter(i => i.status === 'PAID' && i.amountPaidCents < i.totalCents)
      .map(i => `${i.number} — paid ${i.amountPaidCents}/${i.totalCents} [${i.workspaceId}]`))
  add('Invoice fully paid but not PAID', 'payment recorded without the status flip',
    invoices.filter(i => i.status !== 'PAID' && i.amountPaidCents >= i.totalCents)
      .map(i => `${i.number} — ${i.status}, paid ${i.amountPaidCents}/${i.totalCents} [${i.workspaceId}]`))

  // Budgets with more than one primary phase (proposals/invoices pick arbitrarily).
  const primaryCounts = await db.phase.groupBy({
    by: ['budgetId'],
    where: { isPrimary: true },
    _count: { _all: true },
  })
  const multiPrimary = primaryCounts.filter(g => g._count._all > 1)
  add('Budget with more than one primary phase',
    'makePhasePrimary/approval promotion must leave exactly one',
    multiPrimary.map(g => `budget ${g.budgetId} — ${g._count._all} primary phases`))

  // Denormalized tenancy columns that should always be set.
  const [phaseNoWs, accountNoWs, lineNoWs] = await Promise.all([
    db.phase.count({ where: { workspaceId: null } }),
    db.account.count({ where: { workspaceId: null } }),
    db.lineItem.count({ where: { workspaceId: null } }),
  ])
  add('Rows missing denormalized workspaceId',
    'scoped queries silently skip them (see scripts/backfill-workspace-ids.ts)',
    [
      ...(phaseNoWs   ? [`Phase: ${phaseNoWs}`]      : []),
      ...(accountNoWs ? [`Account: ${accountNoWs}`]  : []),
      ...(lineNoWs    ? [`LineItem: ${lineNoWs}`]    : []),
    ])

  // ── Report ──────────────────────────────────────────────────────────────────
  const dirty = findings.filter(f => f.rows.length > 0)
  console.log(`Data health: ${findings.length - dirty.length}/${findings.length} checks clean\n`)
  for (const f of findings) {
    console.log(`${f.rows.length === 0 ? 'ok  ' : 'FAIL'} ${f.check}${f.rows.length ? ` (${f.rows.length})` : ''}`)
    if (f.rows.length) {
      console.log(`     why: ${f.why}`)
      for (const r of f.rows.slice(0, 10)) console.log(`     - ${r}`)
      if (f.rows.length > 10) console.log(`     … ${f.rows.length - 10} more`)
    }
  }
  await db.$disconnect()
}

main().catch(async err => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
