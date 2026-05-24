'use client'

import { useState, useTransition, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { upsertClient } from '@/server/actions/clients'

interface Existing {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: Existing | null
  onSaved: () => void
}

export function ClientModal({ open, onOpenChange, existing, onSaved }: Props) {
  const [pending, startTransition] = useTransition()

  const [name,         setName]         = useState('')
  const [contactName,  setContactName]  = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [notes,        setNotes]        = useState('')
  const [error,        setError]        = useState('')

  useEffect(() => {
    if (!open) return
    if (existing) {
      setName(existing.name)
      setContactName(existing.contactName ?? '')
      setContactEmail(existing.contactEmail ?? '')
      setContactPhone(existing.contactPhone ?? '')
      setNotes(existing.notes ?? '')
    } else {
      setName('')
      setContactName('')
      setContactEmail('')
      setContactPhone('')
      setNotes('')
    }
    setError('')
  }, [open, existing])

  function handleSave() {
    if (!name.trim()) { setError('Client name is required'); return }
    setError('')

    startTransition(async () => {
      const result = await upsertClient(existing?.id ?? null, {
        name:          name.trim(),
        contactName:   contactName.trim()  || undefined,
        contactEmail:  contactEmail.trim() || undefined,
        contactPhone:  contactPhone.trim() || undefined,
        notes:         notes.trim()        || undefined,
      })
      if (result.success) {
        onSaved()
        onOpenChange(false)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit client' : 'New client'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cl-name">Company / Client name <span className="text-destructive">*</span></Label>
            <Input
              id="cl-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Hulu, Nike, Sony Music"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cl-contact">Contact name</Label>
            <Input
              id="cl-contact"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Primary contact at the company"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cl-email">Email</Label>
              <Input
                id="cl-email"
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="contact@company.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cl-phone">Phone</Label>
              <Input
                id="cl-phone"
                type="tel"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cl-notes">Notes</Label>
            <textarea
              id="cl-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes — rates, preferences, contacts…"
              className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? 'Saving…' : existing ? 'Save changes' : 'Create client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
