import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { InvoiceLineItem } from '@/types'
import React from 'react'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const invoice = await db.invoice.findUnique({
    where: { publicToken: id },
    include: {
      client: true,
      project: true,
      workspace: {
        select: {
          name: true,
          legalName: true,
          contactEmail: true,
          website: true,
          wireInstructions: true,
          achInstructions: true,
          checkPayableTo: true,
          checkMailingAddress: true,
        },
      },
    },
  })

  if (!invoice || invoice.status === 'DRAFT') {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    // Dynamic imports keep @react-pdf/renderer and the PDF components in the
    // same module resolution context at runtime, preventing the duplicate-React-
    // instance problem that causes reconciler error #31.
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { InvoicePDF }     = await import('@/components/invoice/InvoicePDF')

    const invoiceData = {
      number:         invoice.number,
      title:          invoice.title,
      kind:           invoice.kind,
      status:         invoice.status,
      issueDate:      invoice.issueDate.toISOString(),
      dueDate:        invoice.dueDate.toISOString(),
      poNumber:       invoice.poNumber,
      lineItems:      invoice.lineItems as unknown as InvoiceLineItem[],
      subtotalCents:  invoice.subtotalCents,
      taxPct:         Number(invoice.taxPct),
      taxCents:       invoice.taxCents,
      discountCents:  invoice.discountCents,
      totalCents:     invoice.totalCents,
      amountPaidCents: invoice.amountPaidCents,
      notes:          invoice.notes,
      terms:          invoice.terms,
      publicToken:    invoice.publicToken,
      workspace: {
        name:                invoice.workspace.name,
        legalName:           invoice.workspace.legalName,
        contactEmail:        invoice.workspace.contactEmail,
        website:             invoice.workspace.website,
        wireInstructions:    invoice.workspace.wireInstructions,
        achInstructions:     invoice.workspace.achInstructions,
        checkPayableTo:      invoice.workspace.checkPayableTo,
        checkMailingAddress: invoice.workspace.checkMailingAddress,
      },
      client: {
        name:         invoice.client.name,
        contactName:  invoice.client.contactName,
        contactEmail: invoice.client.contactEmail,
        billingAddress: invoice.client.billingAddress,
      },
      project: {
        name: invoice.project.name,
      },
    }

    type RenderInput = Parameters<typeof renderToBuffer>[0]
    const buffer = await renderToBuffer(
      React.createElement(InvoicePDF as never, { invoice: invoiceData }) as unknown as RenderInput
    )

    const slug = invoice.project.name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-')
    const filename = `TTP-Invoice-${invoice.number}-${slug}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('Invoice PDF render error:', err)
    return new NextResponse('PDF generation failed', { status: 500 })
  }
}
