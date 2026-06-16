'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { archiveClient } from '@/server/actions/clients'
import { ClientModal } from './ClientModal'
import { ClientCard, type ClientRow } from './ClientCard'

interface Props {
  clients: ClientRow[]
}

export function ClientsPageClient({ clients }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<ClientRow | null>(null)
  const [_, startArchive]               = useTransition()

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(c: ClientRow) {
    setEditing(c)
    setModalOpen(true)
  }

  function handleArchive(id: string) {
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
            <ClientCard
              key={c.id}
              client={c}
              onEdit={() => openEdit(c)}
              onArchive={() => handleArchive(c.id)}
            />
          ))}
        </div>
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
