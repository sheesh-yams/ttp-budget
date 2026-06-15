'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { X, Briefcase } from 'lucide-react'
import { createContact, updateContact, type ContactFormData } from '@/server/actions/rolodex'

const RATE_UNITS = [
  { value: 'HOUR',     label: 'per hour' },
  { value: 'HALF_DAY', label: 'per half-day' },
  { value: 'DAY',      label: 'per day' },
  { value: 'WEEK',     label: 'per week' },
  { value: 'FLAT',     label: 'flat' },
]

// Accepts both ContactRow (from the Rolodex list) and ContactForModal
// (from getContactForModal), so the Team page can open this modal without
// loading the full project-history-enriched ContactDetail.
export interface ContactModalContact {
  id:               string
  name:             string
  primaryRole:      string
  secondaryRoles:   unknown
  email:            string | null
  phone:            string | null
  instagram:        string | null
  website:          string | null
  notes:            string | null
  avatarUrl:        string | null
  defaultRateCents: number | null
  defaultRateUnit:  string
  hasKit?:          boolean
  kitRateCents?:    number | null
  kitName?:         string | null
}

interface Props {
  contact?:   ContactModalContact | null  // null / undefined = create mode
  crewRoles?: string[]                    // CREW rate card roles for suggestions
  projectId?: string                      // if set, revalidates project team on save
  onClose:    () => void
  onSaved?:   (id: string) => void
}

export function ContactModal({ contact, crewRoles = [], projectId, onClose, onSaved }: Props) {
  const isEdit = !!contact
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // ── Core fields ──────────────────────────────────────────────────────────────
  const [name,        setName]        = useState(contact?.name        ?? '')
  const [primaryRole, setPrimaryRole] = useState(contact?.primaryRole ?? '')
  const [email,       setEmail]       = useState(contact?.email       ?? '')
  const [phone,       setPhone]       = useState(contact?.phone       ?? '')
  const [instagram,   setInstagram]   = useState(contact?.instagram   ?? '')
  const [website,     setWebsite]     = useState(contact?.website     ?? '')
  const [notes,       setNotes]       = useState(contact?.notes       ?? '')
  const [rateDollars, setRateDollars] = useState(
    contact?.defaultRateCents != null ? String(contact.defaultRateCents / 100) : ''
  )
  const [rateUnit, setRateUnit] = useState<ContactFormData['defaultRateUnit']>(
    (contact?.defaultRateUnit as ContactFormData['defaultRateUnit']) ?? 'DAY'
  )

  // ── Kit fields ───────────────────────────────────────────────────────────────
  const [hasKit,         setHasKit]         = useState(contact?.hasKit         ?? false)
  const [kitName,        setKitName]        = useState(contact?.kitName        ?? '')
  const [kitRateDollars, setKitRateDollars] = useState(
    contact?.kitRateCents != null ? String(contact.kitRateCents / 100) : ''
  )

  // ── Secondary roles — chip input ──────────────────────────────────────────
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>(
    Array.isArray(contact?.secondaryRoles) ? contact.secondaryRoles as string[] : []
  )
  const [roleInput, setRoleInput] = useState('')
  const roleInputRef = useRef<HTMLInputElement>(null)

  function addRole(value: string) {
    const trimmed = value.trim()
    if (trimmed && !secondaryRoles.includes(trimmed)) {
      setSecondaryRoles(prev => [...prev, trimmed])
    }
    setRoleInput('')
  }

  function removeRole(role: string) {
    setSecondaryRoles(prev => prev.filter(r => r !== role))
  }

  function handleRoleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addRole(roleInput)
    }
    if (e.key === 'Backspace' && roleInput === '' && secondaryRoles.length > 0) {
      setSecondaryRoles(prev => prev.slice(0, -1))
    }
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !primaryRole.trim()) return

    const finalRoles = roleInput.trim()
      ? [...secondaryRoles, roleInput.trim()]
      : secondaryRoles

    const payload: ContactFormData = {
      name:             name.trim(),
      primaryRole:      primaryRole.trim(),
      secondaryRoles:   finalRoles,
      email:            email.trim() || null,
      phone:            phone.trim() || null,
      instagram:        instagram.trim() || null,
      website:          website.trim() || null,
      notes:            notes.trim() || null,
      avatarUrl:        null,
      defaultRateCents: rateDollars.trim() ? Math.round(parseFloat(rateDollars) * 100) : null,
      defaultRateUnit:  rateUnit,
      hasKit,
      kitRateCents: hasKit && kitRateDollars.trim()
        ? Math.round(parseFloat(kitRateDollars) * 100)
        : null,
      kitName: hasKit && kitName.trim() ? kitName.trim() : null,
    }

    setError('')
    startTransition(async () => {
      const result = isEdit
        ? await updateContact(contact.id, payload, projectId)
        : await createContact(payload)
      if (result.success) {
        onSaved?.(result.data.id)
        onClose()
      } else if ('error' in result) {
        setError(result.error)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit contact' : 'New contact'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name + Primary role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Primary role <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                list="crew-roles-datalist"
                value={primaryRole}
                onChange={e => setPrimaryRole(e.target.value)}
                placeholder="Director of Photography"
                required
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
              {crewRoles.length > 0 && (
                <datalist id="crew-roles-datalist">
                  {crewRoles.map(r => <option key={r} value={r} />)}
                </datalist>
              )}
            </div>
          </div>

          {/* Secondary roles — chip input */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Secondary roles
              <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/60">(press Enter or comma to add)</span>
            </label>
            <div
              className="flex flex-wrap gap-1.5 rounded-lg border bg-background px-3 py-2 cursor-text min-h-[42px]"
              onClick={() => roleInputRef.current?.focus()}
            >
              {secondaryRoles.map(role => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {role}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeRole(role) }}
                    className="text-primary/60 hover:text-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                ref={roleInputRef}
                type="text"
                value={roleInput}
                onChange={e => setRoleInput(e.target.value)}
                onKeyDown={handleRoleKeyDown}
                onBlur={() => addRole(roleInput)}
                placeholder={secondaryRoles.length === 0 ? 'Gaffer, Grip…' : ''}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Instagram</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">@</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={e => setInstagram(e.target.value.replace('@', ''))}
                  placeholder="janesmith"
                  className="w-full rounded-lg border bg-background pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Website</label>
              <input
                type="text"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="janesmith.com"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Default rate */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Default rate</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  value={rateDollars}
                  onChange={e => setRateDollars(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border bg-background pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <select
                value={rateUnit}
                onChange={e => setRateUnit(e.target.value as ContactFormData['defaultRateUnit'])}
                className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              >
                {RATE_UNITS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Equipment kit */}
          <div>
            <label className="mb-2 flex cursor-pointer items-center gap-2.5">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={hasKit}
                  onChange={e => setHasKit(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-4 w-4 rounded border border-border bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary" />
                {hasKit && (
                  <svg
                    className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-primary-foreground"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" />
                Has Equipment Kit
              </span>
            </label>

            {hasKit && (
              <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-dashed border-primary/25 bg-primary/[0.03] p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Kit name
                  </label>
                  <input
                    type="text"
                    value={kitName}
                    onChange={e => setKitName(e.target.value)}
                    placeholder="Sony FX3 Package"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Kit day rate
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={kitRateDollars}
                      onChange={e => setKitRateDollars(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full rounded-lg border bg-background pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground/70">
                  When this person is assigned as CREW on a budget, an Equipment line item for their kit will be auto-inserted below their row.
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about working with this person…"
              rows={3}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim() || !primaryRole.trim()}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {isPending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save contact' : 'Add contact')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
