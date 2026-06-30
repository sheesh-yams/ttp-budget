'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { createLocation, updateLocation, deleteLocation } from '@/server/actions/schedule'

interface LocationRow {
  id: string
  name: string
  address: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  locations: LocationRow[]
  canEdit: boolean
  onMutated: () => void
}

export function LocationsModal({ open, onClose, locations, canEdit, onMutated }: Props) {
  const [mounted, setMounted] = useState(false)
  const [, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!open) { setEditingId(null); setCreating(false); setError(null) }
  }, [open])

  if (!mounted || !open) return null

  function startEdit(loc: LocationRow) {
    setEditingId(loc.id)
    setName(loc.name)
    setAddress(loc.address ?? '')
    setCreating(false)
  }

  function startCreate() {
    setCreating(true)
    setEditingId(null)
    setName('')
    setAddress('')
  }

  function cancelForm() {
    setEditingId(null)
    setCreating(false)
  }

  function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setError(null)
    startTransition(async () => {
      const input = { name: name.trim(), address: address.trim() || undefined }
      const result = editingId
        ? await updateLocation(editingId, input)
        : await createLocation(input)
      if ('error' in result && result.error) { setError(result.error); return }
      cancelForm()
      onMutated()
    })
  }

  async function handleDelete(loc: LocationRow) {
    const ok = await confirm(
      `"${loc.name}" will be permanently removed.`,
      { title: 'Delete location?', key: 'delete-location', confirmLabel: 'Delete' },
    )
    if (!ok) return
    startTransition(async () => {
      const result = await deleteLocation(loc.id)
      if ('error' in result && result.error) { setError(result.error); return }
      onMutated()
    })
  }

  const formOpen = creating || editingId !== null

  const modal = (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
      {ConfirmDialog}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" /> Locations
          </h2>
          <button type="button" onClick={onClose} className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {locations.length === 0 && !formOpen && (
            <p className="text-sm text-muted-foreground text-center py-6">No locations yet.</p>
          )}
          {locations.map(loc => (
            <div key={loc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{loc.name}</p>
                {loc.address && <p className="text-xs text-muted-foreground truncate">{loc.address}</p>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => startEdit(loc)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded p-1.5 text-destructive hover:bg-muted transition-colors" onClick={() => handleDelete(loc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {formOpen && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Location name" className="h-8 text-sm" />
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address (optional)" className="h-8 text-sm" />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={cancelForm}>Cancel</Button>
                <Button size="sm" onClick={handleSave}>{editingId ? 'Save' : 'Add'}</Button>
              </div>
            </div>
          )}
        </div>

        {canEdit && !formOpen && (
          <div className="border-t border-border px-5 py-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              onClick={startCreate}
            >
              <Plus className="h-3.5 w-3.5" /> Add location
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
