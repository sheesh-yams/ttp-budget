'use client'

import { useEffect } from 'react'
import { writeLastProject, type LastProject } from '@/lib/last-project'

/** Records this project as the last one opened — the mobile "+" sheet's default. */
export function RememberProject({ workspaceId, id, name, can }: { workspaceId: string } & LastProject) {
  const { dealMemos, callSheets, receipts } = can
  useEffect(() => {
    writeLastProject(workspaceId, { id, name, can: { dealMemos, callSheets, receipts } })
  }, [workspaceId, id, name, dealMemos, callSheets, receipts])
  return null
}
