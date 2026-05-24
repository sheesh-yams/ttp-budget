'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, Mail, Phone, FolderOpen, FileText, MoreHorizontal, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { upsertClient, archiveClient } from '@/server/actions/clients'
import { ClientModal } from './ClientModal'

interface ClientRow {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  createdAt: string
  projectCount: number
  activeProjects: number
  totalBudgetCents: number
  invoiceCount: number
  recentProjectName: string | null
  recentProjectStatus: string | null
}

interface Props {
  clients: ClientRow[]
}

const STATUS_COLORS: Record<string, string> = {
  LEAD:     'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-green-100 text-green-800',
  WRAPPED:  'bg-blue-100 text-blue-800',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

export function ClientsPageClient({ clients }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState<ClientRow | null>(null)
  const [menuOpen, setMenuOpen]       = useState<string | null>(null)
  const [archivePending, startArchive] = useTransition()

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(c: ClientRow) {
    setEditing(c)
    setModalOpen(true)
    setMenuOpen(null)
  }

  function handleArchive(id: string) {
    setMenuOpen(null)
    startArchive(async () => {
      await archiveClient(id)
      router.refresh()
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clients.length} client{clients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
          <Building2 className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No clients yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first client to start creating projects and proposals.
          </p>
          <Button className="mt-4" onClick={openNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Client
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map(c => (
            <div
              key={c.id}
              className="group relative flex flex-col rounded-[10px] border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              style={{ borderColor: '#E8E0F0' }}
            >
              {/* Three-dot menu */}
              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === c.id ? null : c.id) }}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen === c.id && (
                  <div
                    className="absolute right-0 top-7 z-10 min-w-[140px] rounded-lg border bg-white py-1 shadow-lg"
                    style={{ borderColor: '#E8E0F0' }}
                  >
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-muted/50"
                    >
                      Edit client
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(c.id)}
                      disabled={archivePending}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  </div>
                )}
              </div>

              {/* Client name + contact */}
              <div className="mb-4 pr-6">
                <h2 className="text-[15px] font-semibold text-foreground">{c.name}</h2>
                {c.contactName && (
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{c.contactName}</p>
                )}
              </div>

              {/* Contact details */}
              <div className="mb-4 space-y-1.5">
                {c.contactEmail && (
                  <a
                    href={`mailto:${c.contactEmail}`}
                    className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground"
                    onClick={e => e.stopPropagation()}
                  >
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    {c.contactEmail}
                  </a>
                )}
                {c.contactPhone && (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    {c.contactPhone}
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div
                className="mt-auto flex items-center gap-4 rounded-lg px-3 py-2.5"
                style={{ background: '#F7F4FA' }}
              >
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span>
                    <span className="font-semibold text-foreground">{c.projectCount}</span>
                    {' '}project{c.projectCount !== 1 ? 's' : ''}
                    {c.activeProjects > 0 && (
                      <span className="ml-1 text-emerald-600">({c.activeProjects} active)</span>
                    )}
                  </span>
                </div>
                {c.totalBudgetCents > 0 && (
                  <div className="ml-auto text-right">
                    <p className="text-[10px] text-muted-foreground">Total value</p>
                    <p className="text-[12px] font-semibold tabular text-foreground">
                      {formatMoney(c.totalBudgetCents)}
                    </p>
                  </div>
                )}
              </div>

              {/* Recent project chip */}
              {c.recentProjectName && (
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Latest:</span>
                  <span className="text-[11px] font-medium text-foreground truncate">{c.recentProjectName}</span>
                  {c.recentProjectStatus && (
                    <span className={`ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.recentProjectStatus] ?? ''}`}>
                      {c.recentProjectStatus.charAt(0) + c.recentProjectStatus.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Click outside to close menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-[5]" onClick={() => setMenuOpen(null)} />
      )}

      <ClientModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        existing={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
