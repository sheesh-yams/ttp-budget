import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { z } from 'zod'
import { headers } from 'next/headers'
import { sendProposalApprovedEmail } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'
import { trustedClientIp } from '@/lib/client-ip'
import { toJsonSafe } from '@/lib/json-safe'
import { renderSmartText } from '@/lib/smart-text'
import { resolveMergeTags, resolveMergeTagsPlain, type MergeTagContext } from '@/lib/merge-tags'

const schema = z.object({
  signatureName: z.string().min(2).max(120),
  // Signer must verify with an email that the proposal was actually sent to
  // (the client contact email or an additional recipient). Validated below.
  signatureEmail: z.string().trim().email().max(200),
  proposalToken: z.string(),
  // Explicit assent must be asserted by the caller, not assumed — the client
  // checkbox alone is not evidence; this field is stored in the audit trail.
  agreedToTerms: z.literal(true),
})

/** Lowercase + trim for case-insensitive email comparison. */
function normEmail(e: string): string {
  return e.trim().toLowerCase()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 422 })
  }

  const { signatureName, signatureEmail, proposalToken } = parsed.data

  const proposal = await db.proposal.findUnique({
    where: { id, publicToken: proposalToken },
    include: {
      project: { include: { client: true } },
      workspace: { select: { contactEmail: true, name: true, legalName: true } },
    },
  })

  if (!proposal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Email verification ──────────────────────────────────────────────────────
  // The signer's email must match an address the proposal was actually sent to:
  // the client's contact email, or one of the additional recipients.
  const recipientEmails = (proposal as unknown as { recipientEmails: string[] }).recipientEmails ?? []
  const allowedEmails = new Set(
    [proposal.project.client.contactEmail, ...recipientEmails]
      .filter((e): e is string => !!e)
      .map(normEmail),
  )
  if (allowedEmails.size === 0) {
    return NextResponse.json(
      { error: 'No signer email is on file for this proposal. Please contact the sender to add one.' },
      { status: 422 },
    )
  }
  if (!allowedEmails.has(normEmail(signatureEmail))) {
    return NextResponse.json(
      { error: 'This email isn’t authorized to sign this proposal. Use the email address the proposal was sent to.' },
      { status: 403 },
    )
  }
  const verifiedEmail = normEmail(signatureEmail)

  if (proposal.status === 'APPROVED') {
    return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  }

  if (!['SENT', 'VIEWED'].includes(proposal.status)) {
    return NextResponse.json({ error: 'Cannot approve this proposal' }, { status: 400 })
  }

  // Expiry — both the share-link expiry and the business validity deadline
  // must be enforced here, not just on the page: this endpoint is the actual
  // signing surface and can be called directly.
  const now = new Date()
  const tokenExpiry = (proposal as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
  if (tokenExpiry && tokenExpiry < now) {
    return NextResponse.json({ error: 'This proposal link has expired' }, { status: 410 })
  }
  if (proposal.expiresAt && proposal.expiresAt < now) {
    return NextResponse.json({ error: 'This proposal is no longer valid — please request an updated proposal' }, { status: 410 })
  }

  const headersList = await headers()
  // Trusted client IP (rightmost proxy-appended XFF entry) — recorded as the
  // signature IP, so it must not be client-spoofable.
  const ip = trustedClientIp(name => headersList.get(name))

  // Compute the total from the budget phase linked to this proposal
  // For now we use the value stored in content; Phase 2 will compute from live line items
  const content = proposal.content as Record<string, unknown>
  const approvedTotal = typeof content.totalCents === 'number' ? content.totalCents : null

  // ── Contract snapshot ──────────────────────────────────────────────────────
  // Freeze the contract exactly as the client sees it at signing. Sections stay
  // editable pre-approval and merge tags resolve live, so without this snapshot
  // the "signed" contract could silently change afterwards. bodyHtml is the
  // final safe HTML the approved web views render; bodyText is the plain
  // resolved form the PDF renders.
  const contractEnabled = (proposal as unknown as { contractEnabled?: boolean }).contractEnabled ?? true
  type SectionRow = { id: string; title: string; body: string }
  const liveSections = contractEnabled
    ? await (db as unknown as {
        proposalContractSection: { findMany: (a: object) => Promise<SectionRow[]> }
      }).proposalContractSection.findMany({
        where:   { proposalId: proposal.id },
        orderBy: { orderIndex: 'asc' },
        select:  { id: true, title: true, body: true },
      })
    : []

  const snapTotal = (content?.budgetSnapshot as { totalCents?: number } | undefined)?.totalCents ?? approvedTotal
  const mergeCtx: MergeTagContext = {
    workspace: { name: proposal.workspace.name, legalName: proposal.workspace.legalName ?? undefined },
    client:    { name: proposal.project.client.name },
    project:   { name: proposal.project.name },
    proposal: {
      total: snapTotal != null
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(snapTotal / 100)
        : undefined,
      validThrough: proposal.expiresAt
        ? proposal.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : undefined,
    },
  }

  const contractSnapshot = liveSections.length > 0
    ? {
        signedAt: now.toISOString(),
        sections: liveSections.map(s => ({
          id:       s.id,
          title:    s.title,
          bodyHtml: resolveMergeTags(renderSmartText(s.body), mergeCtx, { warnUnresolved: false }),
          bodyText: resolveMergeTagsPlain(s.body, mergeCtx),
        })),
      }
    : null

  // Atomic compare-and-set: only a SENT/VIEWED proposal can flip to APPROVED.
  // Two concurrent approvals (double-click, two tabs) race here — the loser
  // matches zero rows and gets the same 409 as an already-approved proposal.
  const res = await db.proposal.updateMany({
    where: { id: proposal.id, status: { in: ['SENT', 'VIEWED'] } },
    data: {
      status: 'APPROVED',
      approvedAt: now,
      signatureName,
      signatureEmail: verifiedEmail,
      signatureIp: ip,
      approvedTotalCents: approvedTotal,
      ...(contractSnapshot
        ? { content: toJsonSafe({ ...content, contractSnapshot }) }
        : {}),
    },
  })
  if (res.count === 0) {
    return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  }

  // Fire notification email to workspace owner
  if (proposal.workspace.contactEmail) {
    void sendProposalApprovedEmail({
      to: proposal.workspace.contactEmail,
      proposalTitle: proposal.title,
      clientName: proposal.project.client.name,
      signatureName,
      approvedAt: now,
      proposalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/proposals/${proposal.id}/edit`,
    })
  }

  // Bust server cache so the Kanban reflects APPROVED → Closed immediately
  revalidatePath('/proposals')
  revalidatePath(`/projects/${proposal.projectId}`)

  // Audit: public client approval — actorId = 'public' (no user session)
  await logAuditEvent({
    workspaceId: proposal.workspaceId,
    actorId:     'public',
    action:      'proposal.approved',
    entityType:  'Proposal',
    entityId:    proposal.id,
    metadata: {
      signatureName:     signatureName,
      signatureEmail:    verifiedEmail,
      signatureIp:       ip,
      agreedToTerms:     true,
      approvedTotalCents: approvedTotal ?? undefined,
      publicToken:       proposalToken,
    },
  })

  return NextResponse.json({ status: 'approved', approvedAt: now })
}
