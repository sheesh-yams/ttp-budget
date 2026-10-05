import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logAuditEvent } from '@/lib/audit'
import { trustedClientIp } from '@/lib/client-ip'
import { sendDealMemoSignedEmails } from '@/lib/email'
import { isDealMemoOutdated, normEmail } from '@/lib/deal-memo-signing'

// Public vendor e-signature for a deal memo — no session. Mirrors the proposal
// approve route: the token proves the link, the signer must use the email the
// memo was sent to, and a compare-and-set makes signing happen exactly once.
// Rate-limited by middleware (the `approve` policy).

const schema = z.object({
  signatureName:  z.string().trim().min(2).max(120),
  signatureEmail: z.string().trim().email().max(200),
  token:          z.string().min(16).max(200),
  // The version the vendor reviewed — a re-send since then must not be signed blind.
  sentAt:         z.string().datetime(),
  // Explicit assent, stored in the audit trail — the checkbox alone isn't evidence.
  agreedToTerms:  z.literal(true),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please enter your full name and email, and tick the box.' }, { status: 422 })
  const { signatureName, signatureEmail, token } = parsed.data
  const seenSentAt = new Date(parsed.data.sentAt)

  const memo = await db.dealMemo.findFirst({
    where:  { id, publicToken: token },
    select: {
      id: true, workspaceId: true, projectId: true, status: true, position: true,
      publicTokenExpiresAt: true, sentAt: true, sentToEmail: true, sentSnapshot: true, signedAt: true, createdById: true,
      contact:   { select: { name: true } },
      project:   { select: { name: true } },
      workspace: { select: { name: true, contactEmail: true, primaryColor: true, accentColor: true } },
    },
  })
  if (!memo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (memo.status === 'CANCELLED') return NextResponse.json({ error: 'This deal memo was cancelled and can’t be signed.' }, { status: 410 })
  if (memo.signedAt) return NextResponse.json({ error: 'Already signed' }, { status: 409 })
  if (memo.status !== 'CONFIRMED' || !memo.sentAt || !memo.sentToEmail) {
    return NextResponse.json({ error: 'This deal memo isn’t ready to sign.' }, { status: 400 })
  }
  const now = new Date()
  if (memo.publicTokenExpiresAt && memo.publicTokenExpiresAt < now) {
    return NextResponse.json({ error: 'This link has expired — ask for a new one.' }, { status: 410 })
  }
  if (memo.sentAt.getTime() !== seenSentAt.getTime()) {
    return NextResponse.json({ error: 'This deal memo was updated since you opened it. Reload the page to review the latest version.', stale: true }, { status: 409 })
  }
  if (normEmail(signatureEmail) !== normEmail(memo.sentToEmail)) {
    return NextResponse.json({ error: 'Use the email address this deal memo was sent to.' }, { status: 403 })
  }

  // The producer changed the terms after sending — the vendor's copy no longer applies.
  if (await isDealMemoOutdated(memo)) {
    return NextResponse.json({ error: `${memo.workspace.name} has changed the terms since this was sent. Ask them to send you the updated deal memo.`, stale: true }, { status: 409 })
  }

  // Trusted client IP (rightmost proxy-appended XFF entry) — not spoofable.
  const headersList = await headers()
  const ip = trustedClientIp(name => headersList.get(name))

  // Compare-and-set: only the exact sent version, unsigned, still awarded, with this token.
  const res = await db.dealMemo.updateMany({
    where: { id: memo.id, publicToken: token, status: 'CONFIRMED', signedAt: null, sentAt: seenSentAt },
    data:  { signedAt: now, signatureName, signatureEmail: normEmail(signatureEmail), signatureIp: ip },
  })
  if (res.count === 0) return NextResponse.json({ error: 'This deal memo changed — reload the page.', stale: true }, { status: 409 })

  // The signature is committed — the audit record must always be written,
  // and nothing after it may undo the signing.
  await logAuditEvent({
    workspaceId: memo.workspaceId, actorId: 'public', action: 'dealMemo.signed',
    entityType: 'DealMemo', entityId: memo.id,
    metadata: { signatureName, signatureEmail: normEmail(signatureEmail), signatureIp: ip, agreedToTerms: true },
  })

  try {
    const sender = memo.createdById
      ? await db.user.findFirst({ where: { id: memo.createdById, workspaceId: memo.workspaceId }, select: { email: true, name: true } })
      : null
    const app = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    await sendDealMemoSignedEmails({
      vendorTo: memo.sentToEmail, teamTo: sender?.email ?? memo.workspace.contactEmail ?? null,
      vendorName: memo.contact?.name ?? signatureName, signatureName,
      position: memo.position, projectName: memo.project.name,
      vendorUrl: `${app}/dm/${token}`, teamUrl: `${app}/projects/${memo.projectId}/deal-memos/${memo.id}`,
      signedAt: now, actorEmail: sender?.email ?? null,
      workspaceName: memo.workspace.name, brandPrimary: memo.workspace.primaryColor, brandAccent: memo.workspace.accentColor,
    })
  } catch (err) {
    console.error('[deal memo sign] confirmation emails failed (signature recorded):', memo.id, err)
  }

  revalidatePath(`/projects/${memo.projectId}/deal-memos`)
  revalidatePath(`/projects/${memo.projectId}/deal-memos/${memo.id}`)
  return NextResponse.json({ status: 'signed', signedAt: now })
}
