import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { z } from 'zod'
import { headers } from 'next/headers'
import { sendProposalApprovedEmail } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'

const schema = z.object({
  signatureName: z.string().min(2).max(120),
  proposalToken: z.string(),
})

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

  const { signatureName, proposalToken } = parsed.data

  const proposal = await db.proposal.findUnique({
    where: { id, publicToken: proposalToken },
    include: {
      project: { include: { client: true } },
      workspace: { select: { contactEmail: true } },
    },
  })

  if (!proposal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (proposal.status === 'APPROVED') {
    return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  }

  if (!['SENT', 'VIEWED'].includes(proposal.status)) {
    return NextResponse.json({ error: 'Cannot approve this proposal' }, { status: 400 })
  }

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'

  const now = new Date()

  // Compute the total from the budget phase linked to this proposal
  // For now we use the value stored in content; Phase 2 will compute from live line items
  const content = proposal.content as Record<string, unknown>
  const approvedTotal = typeof content.totalCents === 'number' ? content.totalCents : null

  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: {
      status: 'APPROVED',
      approvedAt: now,
      signatureName,
      signatureIp: ip,
      approvedTotalCents: approvedTotal,
    },
  })

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
      signatureIp:       ip,
      approvedTotalCents: approvedTotal ?? undefined,
      publicToken:       proposalToken,
    },
  })

  return NextResponse.json({ status: 'approved', approvedAt: now })
}
