'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditProjectModal } from './EditProjectModal'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { archiveProject, unarchiveProject } from '@/server/actions/projects'
import { DeleteProjectDialog } from './DeleteProjectDialog'

interface Props {
  project: {
    id: string
    name: string
    status: string
    phase: string
    shootType: string
    shootStartDate: string | null
    shootEndDate: string | null
  }
  /** Workspace Projects EDIT — archive / restore (roles 2b). */
  canArchive: boolean
  /** Project Overview EDIT — edit details. */
  canEdit: boolean
  /** Workspace owner — may permanently delete it once archived. */
  isOwner?: boolean
}

export function ProjectHeaderActions({ project, canArchive, canEdit, isOwner = false }: Props) {
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  const isArchived = project.status === 'ARCHIVED'

  async function handleArchive() {
    const ok = await confirmDialog(
      `"${project.name}" will be archived and hidden from your active projects. You can restore it at any time.`,
      { title: 'Archive project?', confirmLabel: 'Archive', key: 'project-archive' }
    )
    if (!ok) return
    setBusy(true)
    await archiveProject(project.id)
    router.push('/projects')
  }

  async function handleUnarchive() {
    setBusy(true)
    await unarchiveProject(project.id)
    router.refresh()
    setBusy(false)
  }

  return (
    <>
      {ConfirmDialog}

      {isArchived ? (
        <>
          {canArchive && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleUnarchive}
              disabled={busy}
              className="flex-shrink-0"
            >
              <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
              Restore project
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeleting(true)}
              disabled={busy}
              className="flex-shrink-0 text-destructive hover:text-destructive hover:border-destructive/40"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete permanently
            </Button>
          )}
          {deleting && (
            <DeleteProjectDialog
              projectId={project.id} projectName={project.name} open
              onClose={() => setDeleting(false)}
              onDeleted={() => { setDeleting(false); router.push('/projects') }}
            />
          )}
        </>
      ) : (
        <>
          {canArchive && <Button
            size="sm"
            variant="outline"
            onClick={handleArchive}
            disabled={busy}
            className="flex-shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive/40"
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Archive
          </Button>}

          {canEdit && <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="flex-shrink-0"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit project
          </Button>}
        </>
      )}

      <EditProjectModal
        open={open}
        onOpenChange={setOpen}
        project={project}
        onSaved={() => router.refresh()}
        canArchive={canArchive}
      />
    </>
  )
}
