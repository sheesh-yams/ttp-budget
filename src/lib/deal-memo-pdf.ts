// Signed deal memo PDF + who gets the "signed" email. Server-only; plain
// module, not 'use server'. The PDF is rendered on demand from the frozen
// sentSnapshot (exactly what was signed) — never stored.

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { DealMemoPDF } from '@/components/deal-memos/DealMemoPDF'
import type { VendorDealMemo } from '@/lib/deal-memo-vendor-view'

export interface SignedDealMemoForPdf {
  sentSnapshot:   unknown
  signedAt:       Date | null
  signatureName:  string | null
  signatureEmail: string | null
  signatureIp:    string | null
  cancelledAt?:   Date | null
  workspace:      { name: string; logoUrl: string | null; primaryColor: string | null }
}

/** Logo as a data: URI react-pdf can embed (png/jpeg only), or undefined. */
async function loadLogo(url: string | null): Promise<string | undefined> {
  if (!url || !/^https:\/\//.test(url)) return undefined
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!res.ok || !['image/png', 'image/jpeg'].includes(type)) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 2_000_000) return undefined
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}

function safeFilePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Deal memo'
}

/** ASCII-only download name for a Content-Disposition header (ByteString-safe). */
export function asciiPdfFilename(filename: string): string {
  return filename.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim() || 'Deal memo.pdf'
}

/** Renders the signed PDF. Throws if the memo isn't signed or rendering fails. */
export async function renderSignedDealMemoPdf(memo: SignedDealMemoForPdf): Promise<{ filename: string; buffer: Buffer }> {
  if (!memo.signedAt || !memo.signatureName || !memo.signatureEmail || !memo.sentSnapshot) {
    throw new Error('Deal memo is not signed')
  }
  const snapshot = memo.sentSnapshot as VendorDealMemo
  const logoSrc  = await loadLogo(memo.workspace.logoUrl)
  const buffer = await renderToBuffer(
    React.createElement(DealMemoPDF, {
      memo:      snapshot,
      brand:     memo.workspace.primaryColor || '#5D00A4',
      logoSrc,
      signature: { name: memo.signatureName, email: memo.signatureEmail, ip: memo.signatureIp, signedAtISO: memo.signedAt.toISOString() },
      cancelledAtISO: memo.cancelledAt?.toISOString() ?? null,
    }) as unknown as Parameters<typeof renderToBuffer>[0],
  )
  const filename = `Deal memo - ${safeFilePart(snapshot.position)} - ${safeFilePart(snapshot.projectName)}.pdf`
  return { filename, buffer }
}

/**
 * Who sent the memo to the vendor — the actor of the latest `dealMemo.sent`
 * audit event; else the memo's creator; else the workspace contact email.
 */
export async function loadDealMemoSender(memo: {
  id: string; workspaceId: string; createdById: string | null; workspaceContactEmail: string | null
}): Promise<{ email: string; name: string | null } | null> {
  const sent = await db.auditEvent.findFirst({
    where:   { workspaceId: memo.workspaceId, entityType: 'DealMemo', entityId: memo.id, action: 'dealMemo.sent' },
    orderBy: { createdAt: 'desc' },
    select:  { actorId: true },
  })
  for (const userId of [sent?.actorId, memo.createdById]) {
    if (!userId || userId === 'public') continue
    // Still a member of this workspace — a removed producer must not get the
    // signed PDF. (User.workspaceId is only the home workspace.)
    const member = await db.workspaceMember.findFirst({
      where:  { workspaceId: memo.workspaceId, userId },
      select: { user: { select: { email: true, name: true } } },
    })
    if (member?.user.email) return member.user
  }
  return memo.workspaceContactEmail ? { email: memo.workspaceContactEmail, name: null } : null
}
