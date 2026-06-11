'use client'

import { useState, useTransition } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, ExternalLink, Trash2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewCallSheetModal } from './NewCallSheetModal'
import { deleteCallSheet } from '@/server/actions/call-sheets'
import type { CallSheetStatus } from '@/types'

export interface CallSheetRow {
  id: string
  title: string
  shootDate: string
  generalCall: string
  status: CallSheetStatus
  publicToken: string
}

interface Props {
  callSheets: CallSheetRow[]
  projectId: string
  projectName: string
  shootStartDate: string | null
}

const STATUS_CONFIG: Record<CallSheetStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  SENT:  { label: 'Sent',  color: 'bg-blue-100 text-blue-700' },
  FINAL: { label: 'Final', color: 'bg-green-100 text-green-700' },
}

export function ProjectCallSheets({ callSheets, projectId, projectName, shootStartDate }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  async function handleDelete(id: string) {
    const ok = await confirmDialog('This call sheet will be permanently deleted.', { key: 'call-sheet-delete' })
    if (!ok) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteCallSheet(id)
      router.refresh()
      setDeletingId(null)
    })
  }

  return (
    <div>
      {ConfirmDialog}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Call Sheets</h2>
        <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New call sheet
        </Button>
      </div>

      {callSheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">No call sheets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create one to share crew calls, location details, and the day&apos;s schedule.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New call sheet
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Title</th>
                <th className="px-3 py-2.5 text-left w-32">Shoot date</th>
                <th className="px-3 py-2.5 text-left w-24">Call time</th>
                <th className="px-3 py-2.5 text-left w-24">Status</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {callSheets.map(cs => {
                const cfg = STATUS_CONFIG[cs.status]
                const dateLabel = new Date(cs.shootDate).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                })
                return (
                  <tr key={cs.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/projects/${projectId}/call-sheets/${cs.id}`}
                        className="font-medium text-foreground hover:text-violet-700 hover:underline underline-offset-2"
                      >
                        {cs.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{dateLabel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{cs.generalCall}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-0.5 justify-end">
                        {cs.status !== 'DRAFT' && (
                          <a
                            href={`/cs/${cs.publicToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Open crew view"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(cs.id)}
                          disabled={deletingId === cs.id}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex disabled:opacity-40"
                          title="Delete call sheet"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewCallSheetModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        projectId={projectId}
        projectName={projectName}
        defaultDate={shootStartDate ?? undefined}
      />
    </div>
  )
}
