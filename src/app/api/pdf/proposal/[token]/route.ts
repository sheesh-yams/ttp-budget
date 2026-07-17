import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { ProposalPDF } from '@/components/proposal/ProposalPDF'
import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'
import { resolveMergeTagsPlain, type MergeTagContext } from '@/lib/merge-tags'
import React from 'react'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Token IS the credential — never accept a raw database ID here.
  const proposal = await db.proposal.findUnique({
    where: { publicToken: token },
    include: {
      project: { include: { client: true } },
      workspace: {
        select: {
          name: true, legalName: true,
          contactEmail: true, website: true,
          invoiceNumberPrefix: true,
        },
      },
    },
  })

  if (!proposal || proposal.status === 'DRAFT') {
    return new NextResponse('Not found', { status: 404 })
  }

  // Contract sections attached to this proposal (skipped if contractEnabled is false).
  // Merge tags are resolved further down, once totalCents is known.
  type ContractRow = { id: string; title: string; body: string }
  const contractEnabled = (proposal as unknown as { contractEnabled?: boolean }).contractEnabled ?? true
  const liveContractSections = contractEnabled
    ? await (db as unknown as {
        proposalContractSection: { findMany: (a: object) => Promise<ContractRow[]> }
      }).proposalContractSection.findMany({
        where:   { proposalId: proposal.id },
        orderBy: { orderIndex: 'asc' },
        select:  { id: true, title: true, body: true },
      })
    : []

  // Use frozen budget snapshot if present, fall back to live query for legacy proposals
  const proposalContent = proposal.content as Record<string, unknown>
  const snapshot = proposalContent?.budgetSnapshot as {
    accounts: unknown[]
    totalCents: number
    discountCents?: number
    discountLabel?: string
  } | undefined

  let accounts: unknown[]
  let totalCents: number
  let discountCents = 0
  let discountLabel = 'Discount'
  let budgetSections: { id: string; title: string }[] = []
  let pageBreakBetweenAccounts = false

  if (snapshot?.accounts) {
    accounts     = snapshot.accounts
    totalCents   = snapshot.totalCents
    discountCents = snapshot.discountCents ?? 0
    discountLabel = snapshot.discountLabel || 'Discount'
    const snap = snapshot as unknown as { sections?: { id: string; title: string }[]; pageBreakBetweenAccounts?: boolean }
    budgetSections           = snap.sections ?? []
    pageBreakBetweenAccounts = snap.pageBreakBetweenAccounts ?? false
  } else {
    const phaseInclude = {
      sections: {
        orderBy: { orderIndex: 'asc' as const },
        select:  { id: true, title: true },
      },
      accounts: {
        where:   { parentId: null as null },
        orderBy: { order: 'asc' as const },
        include: {
          lineItems: { orderBy: { order: 'asc' as const } },
          children:  {
            orderBy: { order: 'asc' as const },
            include: { lineItems: { orderBy: { order: 'asc' as const } } },
          },
        },
      },
    }
    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: proposal.budgetId, isPrimary: true },
      include: phaseInclude,
    }) ?? await db.phase.findFirst({
      where:   { budgetId: proposal.budgetId },
      orderBy: { order: 'asc' as const },
      include: phaseInclude,
    })

    budgetSections           = (primaryPhase?.sections ?? []).map(s => ({ id: s.id, title: s.title }))
    pageBreakBetweenAccounts = (primaryPhase as unknown as { pageBreakBetweenAccounts?: boolean })?.pageBreakBetweenAccounts ?? false

    const rawAccounts = primaryPhase?.accounts ?? []
    accounts = rawAccounts.map(acc => ({
      ...acc,
      sectionId: (acc as unknown as { sectionId?: string }).sectionId ?? null,
      lineItems: acc.lineItems.map(i => ({
        ...i, quantity: Number(i.quantity), markupPct: i.markupPct != null ? Number(i.markupPct) : null,
      })),
      children: acc.children.map(child => ({
        ...child,
        lineItems: child.lineItems.map(i => ({
          ...i, quantity: Number(i.quantity), markupPct: i.markupPct != null ? Number(i.markupPct) : null,
        })),
      })),
    }))

    // Historical edge case: proposals sent before the snapshot feature existed
    // have no frozen totals, so this reads the *live* budget's current discount
    // (never applied budget-level markup/tax here either — narrow, pre-existing
    // legacy-only path, not touched beyond adding discount-awareness).
    const legacyBudget = proposal.budgetId
      ? await db.budget.findUnique({
          where: { id: proposal.budgetId },
          select: { discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true },
        })
      : null
    const legacyDiscountConfig: BudgetDiscountConfig | null = legacyBudget?.discountType ? {
      type:       legacyBudget.discountType as 'flat' | 'pct',
      label:      legacyBudget.discountLabel,
      valueCents: legacyBudget.discountValueCents,
      valuePct:   legacyBudget.discountValuePct != null ? Number(legacyBudget.discountValuePct) : null,
    } : null
    const legacyTotals = calcBudgetTotals(accounts as unknown as AccountInput[], 0, 0, legacyDiscountConfig)
    discountCents = legacyTotals.discountCents
    discountLabel = legacyTotals.discountLabel || 'Discount'
    totalCents    = legacyTotals.grandTotalCents
  }

  // ── Resolve contract merge tags ────────────────────────────────────────────
  // Signed proposals render from the contract snapshot frozen at approval (the
  // exact text the client agreed to). Unsigned ones resolve live against the
  // same context the public pages use — the PDF must never show raw {{tags}}.
  const contractSnapshot = proposalContent?.contractSnapshot as {
    sections?: { id: string; title: string; bodyText?: string }[]
  } | undefined

  let contractSections: ContractRow[]
  if (proposal.status === 'APPROVED' && contractSnapshot?.sections?.length) {
    contractSections = contractSnapshot.sections.map(s => ({
      id: s.id, title: s.title, body: s.bodyText ?? '',
    }))
  } else {
    const mergeCtx: MergeTagContext = {
      workspace: { name: proposal.workspace.name, legalName: proposal.workspace.legalName ?? undefined },
      client:    { name: proposal.project.client.name },
      project:   { name: proposal.project.name },
      proposal: {
        total: totalCents > 0
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCents / 100)
          : undefined,
        validThrough: proposal.expiresAt
          ? proposal.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : undefined,
      },
    }
    contractSections = liveContractSections.map(s => ({
      id: s.id, title: s.title, body: resolveMergeTagsPlain(s.body, mergeCtx),
    }))
  }

  // Signature block data — rendered on the PDF once the proposal is signed.
  const signature = proposal.status === 'APPROVED' && proposal.signatureName && proposal.approvedAt
    ? { name: proposal.signatureName, dateISO: proposal.approvedAt.toISOString() }
    : undefined

  let logoSrc: string | undefined
  try {
    const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png'))
    logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`
  } catch { /* logo missing — component falls back to text */ }

  try {
    const serialisedProposal = {
      id:           proposal.id,
      title:        proposal.title,
      publicToken:  proposal.publicToken,
      version:      proposal.version,
      content:      proposal.content,
      createdAt:    proposal.createdAt.toISOString(),
      expiresAt:    proposal.expiresAt?.toISOString()  ?? null,
      logoSrc,
      project: {
        name:           proposal.project.name,
        shootType:      proposal.project.shootType,
        shootStartDate: proposal.project.shootStartDate?.toISOString() ?? null,
        shootEndDate:   proposal.project.shootEndDate?.toISOString()   ?? null,
        client: { name: proposal.project.client.name },
      },
      workspace: {
        name:                proposal.workspace.name,
        legalName:           proposal.workspace.legalName,
        contactEmail:        proposal.workspace.contactEmail,
        website:             proposal.workspace.website,
        invoiceNumberPrefix: proposal.workspace.invoiceNumberPrefix,
      },
    }

    const buffer = await renderToBuffer(
      React.createElement(ProposalPDF as never, {
        proposal: serialisedProposal,
        accounts,
        totalCents,
        discountCents,
        discountLabel,
        budgetSections,
        contractSections,
        signature,
        pageBreakBetweenAccounts,
      }) as Parameters<typeof renderToBuffer>[0]
    )

    const slug = proposal.project.name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-')
    const filename = `TTP-Proposal-${slug}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    console.error('PDF render error:', err)
    return new NextResponse(`PDF generation failed:\n\n${msg}`, { status: 500 })
  }
}
