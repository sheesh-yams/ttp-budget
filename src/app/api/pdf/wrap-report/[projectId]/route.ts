import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { WrapReportPDF } from '@/components/actuals/WrapReportPDF'
import { getWrapReportData } from '@/server/actions/actuals'
import React from 'react'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params

  // Require auth
  const { orgId } = await auth()
  if (!orgId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Verify the project belongs to this org's workspace
  const workspace = await db.workspace.findFirst({
    where: { clerkOrgId: orgId },
    select: { id: true, name: true },
  })
  if (!workspace) {
    return new NextResponse('Workspace not found', { status: 404 })
  }

  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    select: { id: true },
  })
  if (!project) {
    return new NextResponse('Project not found', { status: 404 })
  }

  // getWrapReportData uses getScopedDb internally, which resolves via auth()
  const data = await getWrapReportData(projectId)
  if (!data) {
    return new NextResponse('No actuals data', { status: 404 })
  }

  // renderToBuffer expects ReactElement<DocumentProps>; WrapReportPDF wraps
  // a <Document> so this is correct at runtime. The cast bypasses a strict-mode
  // TypeScript incompatibility between FunctionComponentElement and DocumentProps.
  const buffer = await renderToBuffer(React.createElement(WrapReportPDF, { data, workspaceName: workspace.name }) as unknown as Parameters<typeof renderToBuffer>[0])
  const filename = `${data.projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-wrap-report.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buffer.byteLength),
    },
  })
}
