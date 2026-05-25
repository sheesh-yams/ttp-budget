import { NextResponse } from 'next/server'
import React from 'react'

// Diagnostic endpoint: renders a minimal PDF using raw React.createElement only
// (no JSX, no imported TSX component files).
// If this works but /api/pdf/proposal/[id] fails → the issue is JSX compilation.
// If this also fails → the issue is the rendering setup itself.
export async function GET() {
  try {
    const { renderToBuffer, Document, Page, View, Text } =
      await import('@react-pdf/renderer')

    const E = React.createElement

    const elem = E(
      Document as unknown as React.ElementType,
      null,
      E(
        Page as unknown as React.ElementType,
        { size: 'A4', style: { padding: 40 } },
        E(
          View as unknown as React.ElementType,
          { style: { marginBottom: 12 } },
          E(Text as unknown as React.ElementType, { style: { fontSize: 20 } }, 'TTP PDF Test'),
        ),
        E(Text as unknown as React.ElementType, { style: { fontSize: 12 } }, 'If you can read this, renderToBuffer works.'),
      ),
    )

    type RenderInput = Parameters<typeof renderToBuffer>[0]
    const buffer = await renderToBuffer(elem as unknown as RenderInput)

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
