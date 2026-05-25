import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, View, Text } from '@react-pdf/renderer'
import React from 'react'

// Step 1: Bare minimum — static imports, JSX, no custom components.
// Hit GET /api/pdf/test to verify the renderer pipeline works end-to-end.
// If this passes, the renderer is fine and the bug is inside InvoicePDF/ProposalPDF.
// If this fails, the bug is in the module loading or renderer setup itself.

export async function GET() {
  try {
    const elem = (
      <Document>
        <Page size="A4" style={{ padding: 40, fontFamily: 'Helvetica' }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Hello World</Text>
          </View>
          <Text style={{ fontSize: 12 }}>
            If you can read this, renderToBuffer works with static imports and JSX.
          </Text>
        </Page>
      </Document>
    )

    const buffer = await renderToBuffer(elem as Parameters<typeof renderToBuffer>[0])

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="test.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
    return new NextResponse(`TEST PDF FAILED:\n\n${msg}`, { status: 500 })
  }
}
