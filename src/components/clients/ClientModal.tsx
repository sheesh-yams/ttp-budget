'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { upsertClient, getClientLogoUploadUrl, updateClientLogo } from '@/server/actions/clients'
import { Upload, Loader2 } from 'lucide-react'
import type { ClientRow } from './ClientCard'

interface Props {
  open:         boolean
  onOpenChange: (v: boolean) => void
  existing:     ClientRow | null
  onSaved:      () => void
}

export function ClientModal({ open, onOpenChange, existing, onSaved }: Props) {
  const [pending,      startTransition] = useTransition()
  const [logoUploading, setLogoUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [name,         setName]         = useState('')
  const [contactName,  setContactName]  = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [website,      setWebsite]      = useState('')
  const [notes,        setNotes]        = useState('')
  const [specialNotes, setSpecialNotes] = useState('')
  const [logoUrl,      setLogoUrl]      = useState<string | null>(null)
  const [error,        setError]        = useState('')

  useEffect(() => {
    if (!open) return
    if (existing) {
      setName(existing.name)
      setContactName(existing.contactName  ?? '')
      setContactEmail(existing.contactEmail ?? '')
      setContactPhone(existing.contactPhone ?? '')
      setWebsite(existing.website          ?? '')
      setNotes(existing.notes              ?? '')
      setSpecialNotes(existing.specialNotes ?? '')
      setLogoUrl(existing.logoUrl)
    } else {
      setName('')
      setContactName('')
      setContactEmail('')
      setContactPhone('')
      setWebsite('')
      setNotes('')
      setSpecialNotes('')
      setLogoUrl(null)
    }
    setError('')
  }, [open, existing])

  // ── Logo upload via presigned PUT ────────────────────────────────────────────
  async function handleLogoFile(file: File) {
    if (!existing?.id) return
    setLogoUploading(true)
    try {
      const res = await getClientLogoUploadUrl(existing.id, file.type, file.size)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }

      const { uploadUrl, publicUrl } = res.data
      const put = await fetch(uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) { setError('Upload failed — please try again.'); return }

      await updateClientLogo(existing.id, publicUrl)
      setLogoUrl(publicUrl)
    } finally {
      setLogoUploading(false)
    }
  }

  function handleSave() {
    if (!name.trim()) { setError('Client name is required'); return }
    setError('')

    startTransition(async () => {
      const result = await upsertClient(existing?.id ?? null, {
        name:          name.trim(),
        contactName:   contactName.trim()   || undefined,
        contactEmail:  contactEmail.trim()  || undefined,
        contactPhone:  contactPhone.trim()  || undefined,
        website:       website.trim()       || undefined,
        notes:         notes.trim()         || undefined,
        specialNotes:  specialNotes.trim()  || undefined,
      })
      if (result.success) {
        onSaved()
        onOpenChange(false)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  const initials = name.trim()
    ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit client' : 'New client'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">

          {/* ── Logo uploader (edit mode only) ── */}
          {existing && (
            <div className="flex items-center gap-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-14 w-14 rounded-full object-contain border border-border/40"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-violet-700 select-none">
                  {initials}
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f) }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoUploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {logoUploading ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading…</>
                  ) : (
                    <><Upload className="mr-1.5 h-3.5 w-3.5" />{logoUrl ? 'Replace logo' : 'Upload logo'}</>
                  )}
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">JPEG, PNG, WebP · max 2 MB</p>
              </div>
            </div>
          )}

          {/* ── Company name ── */}
          <div className="grid gap-1.5">
            <Label htmlFor="cl-name">Company / Client name <span className="text-destructive">*</span></Label>
            <Input
              id="cl-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Hulu, Nike, Sony Music"
              autoFocus={!existing}
            />
          </div>

          {/* ── Contact info ── */}
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
            <Label htmlFor="cl-website">Website</Label>
            <Input
              id="cl-website"
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://brand.com"
            />
          </div>

          {/* ── Special notes — amber callout context ── */}
          <div className="grid gap-1.5">
            <div className="flex items-baseline gap-2">
              <Label htmlFor="cl-special">Account Notes</Label>
              <span className="text-[11px] text-amber-600 font-medium">Highlighted on card</span>
            </div>
            <textarea
              id="cl-special"
              rows={3}
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              placeholder="High-priority callouts — billing terms, relationship details, escalation contacts…"
              className="flex min-h-[72px] w-full rounded-md border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 resize-none"
            />
          </div>

          {/* ── Internal notes ── */}
          <div className="grid gap-1.5">
            <Label htmlFor="cl-notes">Internal notes</Label>
            <textarea
              id="cl-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Rates, preferences, general context…"
              className="flex min-h-[52px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* ── Logo hint for new clients ── */}
          {!existing && (
            <p className="text-[11px] text-muted-foreground">
              You can upload a client logo after saving.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending || logoUploading}>
            {pending ? 'Saving…' : existing ? 'Save changes' : 'Create client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
