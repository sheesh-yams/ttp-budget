import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { trustedClientIp } from '@/lib/client-ip'
import { RateLimitedPage } from '@/components/public/RateLimitedPage'
import { ProposalSignView } from '@/components/proposal/ProposalSignView'
import { sumAccount, calcBudgetTotals, type AccountInput } from '@/lib/totals'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const proposal = await db.proposal.findUnique({
    where:  { publicToken: token },
    select: { title: true },
  })
  if (!proposal) return { title: 'Contract not found' }
  return {
    title: { absolute: `${proposal.title} — Contract` },
    robots: { index: false },
  }
}

export default async function ProposalSignPage({ params }: Props) {
  const { token } = await params

  const reqHeaders = await headers()
  const ip = trustedClientIp(name => reqHeaders.get(name))
  const { success } = await checkRateLimit('publicDoc', ip)
  if (!success) return <RateLimitedPage />

  const proposal = await db.proposal.findUnique({
    where: { publicToken: token },
    include: {
      project: { include: { client: true } },
      workspace: {
        select: {
          name: true, legalName: true, contactEmail: true,
          website: true, invoiceNumberPrefix: true,
          logoUrl: true, logoDarkUrl: true,
          primaryColor: true, accentColor: true,
        },
      },
    },
  })

  if (!proposal) notFound()

  // Drafts can't be signed
  if (proposal.status === 'DRAFT') redirect(`/p/${token}`)

  // Expiry check
  const tokenExpiry = (proposal as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
  if (tokenExpiry && tokenExpiry < new Date()) redirect(`/p/${token}`)

  // Contract must be enabled with sections — otherwise sign inline on main page
  const contractEnabled = (proposal as unknown as { contractEnabled?: boolean }).contractEnabled ?? true
  if (!contractEnabled) redirect(`/p/${token}`)

  type ContractRow = { id: string; title: string; body: string; orderIndex: number; resolvedHtml?: string }

  // Signed proposals render the contract snapshot frozen at approval — the exact
  // text the client agreed to — never the live (still-editable) sections.
  const signedSnapshot = proposal.status === 'APPROVED'
    ? ((proposal.content as Record<string, unknown>)?.contractSnapshot as {
        sections?: { id: string; title: string; bodyHtml?: string }[]
      } | undefined)
    : undefined

  const contractSections: ContractRow[] = signedSnapshot?.sections?.length
    ? signedSnapshot.sections.map((s, i) => ({
        id: s.id, title: s.title, body: '', orderIndex: i, resolvedHtml: s.bodyHtml ?? '',
      }))
    : await (db as unknown as {
        proposalContractSection: { findMany: (a: object) => Promise<ContractRow[]> }
      }).proposalContractSection.findMany({
        where:   { proposalId: proposal.id },
        orderBy: { orderIndex: 'asc' },
        select:  { id: true, title: true, body: true, orderIndex: true },
      })

  // No sections → fall back to main page (inline sign-off)
  if (contractSections.length === 0) redirect(`/p/${token}`)

  // Resolve the proposal total for merge tags
  const content  = proposal.content as Record<string, unknown>
  const snapshot = content?.budgetSnapshot as { totalCents?: number } | undefined
  let totalCents = snapshot?.totalCents ?? 0

  if (!snapshot?.totalCents) {
    // Legacy: compute from live budget
    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: proposal.budgetId, isPrimary: true },
      include: {
        accounts: {
          where:   { parentId: null },
          orderBy: { order: 'asc' },
          include: {
            lineItems: { orderBy: { order: 'asc' } },
            children: {
              orderBy: { order: 'asc' },
              include: { lineItems: { orderBy: { order: 'asc' } } },
            },
          },
        },
      },
    }) ?? await db.phase.findFirst({
      where: { budgetId: proposal.budgetId },
      orderBy: { order: 'asc' },
      include: {
        accounts: {
          where:   { parentId: null },
          orderBy: { order: 'asc' },
          include: {
            lineItems: { orderBy: { order: 'asc' } },
            children: {
              orderBy: { order: 'asc' },
              include: { lineItems: { orderBy: { order: 'asc' } } },
            },
          },
        },
      },
    })

    const budgetForMarkup = proposal.budgetId
      ? await db.budget.findUnique({ where: { id: proposal.budgetId }, select: { markupPct: true, taxPct: true } })
      : null
    const markupPct = budgetForMarkup?.markupPct != null ? Number(budgetForMarkup.markupPct) : 0
    const taxPct    = budgetForMarkup?.taxPct    != null ? Number(budgetForMarkup.taxPct)    : 0

    const accounts = (primaryPhase?.accounts ?? []).map(acc => ({
      ...acc,
      lineItems: acc.lineItems.map(i => ({ ...i, quantity: Number(i.quantity), markupPct: i.markupPct != null ? Number(i.markupPct) : null })),
      children:  acc.children.map(child => ({ ...child, lineItems: child.lineItems.map(i => ({ ...i, quantity: Number(i.quantity), markupPct: i.markupPct != null ? Number(i.markupPct) : null })) })),
    }))
    const totals = calcBudgetTotals(accounts as unknown as AccountInput[], markupPct, taxPct)
    totalCents = totals.grandTotalCents
  }

  const serialisedProposal = {
    id:            proposal.id,
    title:         proposal.title,
    publicToken:   proposal.publicToken,
    version:       proposal.version,
    status:        proposal.status,
    expiresAt:     proposal.expiresAt?.toISOString()  ?? null,
    approvedAt:    proposal.approvedAt?.toISOString() ?? null,
    signatureName: proposal.signatureName,
    project: {
      name: proposal.project.name,
      client: { name: proposal.project.client.name },
    },
    workspace: {
      name:                proposal.workspace.name,
      legalName:           proposal.workspace.legalName,
      contactEmail:        proposal.workspace.contactEmail,
      website:             proposal.workspace.website,
      invoiceNumberPrefix: proposal.workspace.invoiceNumberPrefix,
      logoUrl:             proposal.workspace.logoUrl,
      logoDarkUrl:         proposal.workspace.logoDarkUrl,
      primaryColor:        proposal.workspace.primaryColor,
      accentColor:         proposal.workspace.accentColor,
    },
    totalCents,
  }

  return (
    <ProposalSignView
      proposal={serialisedProposal}
      contractSections={contractSections}
    />
  )
}
