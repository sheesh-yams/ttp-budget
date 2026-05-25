import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, View, Text } from '@react-pdf/renderer'
import React from 'react'

// Step 1 diagnostic: static imports, React.createElement (no JSX), no custom components.
// Verifies the renderer pipeline works end-to-end before debugging component issues.

export async function GET() {
  try {
    const E = React.createElement

    const elem = E(Document, null,
      E(Page, { size: 'A4', style: { padding: 40, fontFamily: 'Helvetica' } } as never,
        E(View, { style: { marginBottom: 16 } } as never,
          E(Text, { style: { fontSize: 24 } } as never, 'Hello World')
        ),
        E(Text, { style: { fontSize: 12 } } as never,
          'If you can read this, renderToBuffer works with static imports.'
        )
      )
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
