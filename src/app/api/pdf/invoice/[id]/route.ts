import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const invoice = await db.invoice.findUnique({
    where: { publicToken: id },
    include: { client: true, project: true, workspace: true },
  })

  if (!invoice || invoice.status === 'DRAFT') {
    return new NextResponse('Not found', { status: 404 })
  }

  // Full PDF render implemented in Phase 3
  // For now return a placeholder response
  return new NextResponse('Invoice PDF — Phase 3', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}
