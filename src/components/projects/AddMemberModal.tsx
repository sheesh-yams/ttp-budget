'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { X, Search, UserPlus, Users } from 'lucide-react'
import { searchContacts, type ContactSearchResult } from '@/server/actions/rolodex'
import { addProjectMember, type MemberFormData } from '@/server/actions/project-members'

const RATE_UNITS = [
  { value: 'HOUR',     label: 'per hour' },
  { value: 'HALF_DAY', label: 'per half-day' },
  { value: 'DAY',      label: 'per day' },
  { value: 'WEEK',     label: 'per week' },
  { value: 'FLAT',     label: 'flat' },
]

const DEPARTMENTS = [
  'Production', 'Camera', 'G&E', 'Sound', 'Art / Props',
  'Hair & Makeup', 'Talent', 'Post Production', 'Other',
]

interface Props {
  projectId: string
  onClose:   () => void
  onAdded:   () => void
}

type Mode = 'search' | 'confirm' | 'manual'

export function AddMemberModal({ projectId, onClose, onAdded }: Props) {
  const [mode, setMode] = useState<Mode>('search')

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {mode === 'manual' ? 'Add manually' : 'Add team member'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'search' && (
          <SearchPane
            projectId={projectId}
            onSelect={contact => setMode('confirm')}
            onSelectContact={(contact) => {
              // Pass selected contact to confirm pane
              setSelectedContact(contact)
              setMode('confirm')
            }}
            onManual={() => setMode('manual')}
            onClose={onClose}
            onAdded={onAdded}
          />
        )}
        {mode === 'confirm' && selectedContact && (
          <ConfirmPane
            projectId={projectId}
            contact={selectedContact}
            onBack={() => setMode('search')}
            onClose={onClose}
            onAdded={onAdded}
          />
        )}
        {mode === 'manual' && (
          <ManualPane
            projectId={projectId}
            onBack={() => setMode('search')}
            onClose={onClose}
            onAdded={onAdded}
          />
        )}
      </div>
    </div>
  )
}

// Hack: lift selectedContact above mode — use module-level variable for simplicity
let selectedContact: ContactSearchResult | null = null
function setSelectedContact(c: ContactSearchResult) { selectedContact = c }

// ── Search pane ───────────────────────────────────────────────────────────────

function SearchPane({
  projectId,
  onSelectContact,
  onManual,
  onClose,
  onAdded,
}: {
  projectId:        string
  onSelect:         (c: ContactSearchResult) => void
  onSelectContact:  (c: ContactSearchResult) => void
  onManual:         () => void
  onClose:          () => void
  onAdded:          () => void
}) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<ContactSearchResult[]>([])
  const [loading,   setLoading]   = useState(false)
  const debounce    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setLoading(true)
      const r = await searchContacts(query)
      setResults(r)
      setLoading(false)
    }, 200)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query])

  return (
    <div className="px-6 py-5">
      {/* Search input */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search Rolodex by name or role…"
          autoFocus
          className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* Results */}
      <div className="max-h-[280px] overflow-y-auto rounded-lg border divide-y">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Searching…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {query ? `No contacts match "${query}"` : 'No contacts in your Rolodex yet'}
            </p>
          </div>
        )}
        {!loading && results.map(contact => (
          <button
            key={contact.id}
            onClick={() => onSelectContact(contact)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--brand-primary, #5D00A4)' }}
            >
              {contact.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{contact.name}</p>
              <p className="text-xs text-primary">{contact.primaryRole}</p>
            </div>
            {contact.defaultRateCents != null && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                ${(contact.defaultRateCents / 100).toLocaleString()}/{contact.defaultRateUnit.toLowerCase().replace('_', '-')}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={onManual}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add manually (not in Rolodex)
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Confirm pane (pre-fills from Rolodex, lets user customize) ────────────────

function ConfirmPane({
  projectId,
  contact,
  onBack,
  onClose,
  onAdded,
}: {
  projectId: string
  contact:   ContactSearchResult
  onBack:    () => void
  onClose:   () => void
  onAdded:   () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [role,       setRole]       = useState(contact.primaryRole)
  const [department, setDepartment] = useState('')
  const [email,      setEmail]      = useState(contact.email ?? '')
  const [phone,      setPhone]      = useState(contact.phone ?? '')
  const [callTime,   setCallTime]   = useState('')
  const [rateCents,  setRateCents]  = useState(
    contact.defaultRateCents != null ? String(contact.defaultRateCents / 100) : ''
  )
  const [rateUnit, setRateUnit] = useState<MemberFormData['rateUnit']>(
    (contact.defaultRateUnit as MemberFormData['rateUnit']) ?? 'DAY'
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await addProjectMember(projectId, {
        contactId:  contact.id,
        name:       contact.name,
        role:       role.trim(),
        department: department.trim() || null,
        email:      email.trim() || null,
        phone:      phone.trim() || null,
        callTime:   callTime.trim() || null,
        rateCents:  rateCents.trim() ? Math.round(parseFloat(rateCents) * 100) : null,
        rateUnit,
        order:      0,
      })
      if (result.success) {
        onAdded()
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
      {/* Selected contact summary */}
      <div className="flex items-center gap-3 rounded-lg bg-primary/8 px-4 py-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: 'var(--brand-primary, #5D00A4)' }}
        >
          {contact.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-foreground">{contact.name}</p>
          <p className="text-xs text-primary">{contact.primaryRole}</p>
        </div>
      </div>

      {/* Role + Department */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Role on project
          </label>
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            required
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Department</label>
          <select
            value={department}
            onChange={e => setDepartment(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="">No department</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Rate + Call time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate</label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <input
                type="number"
                value={rateCents}
                onChange={e => setRateCents(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className="w-full rounded-lg border bg-background pl-7 pr-2 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <select
              value={rateUnit}
              onChange={e => setRateUnit(e.target.value as MemberFormData['rateUnit'])}
              className="rounded-lg border bg-background px-2 py-2 text-xs text-foreground outline-none"
            >
              {RATE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Call time</label>
          <input
            type="time"
            value={callTime}
            onChange={e => setCallTime(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Contact info (pre-filled, editable) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2.5 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={isPending || !role.trim()}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
        >
          {isPending ? 'Adding…' : 'Add to project'}
        </button>
      </div>
    </form>
  )
}

// ── Manual pane (no Rolodex link) ─────────────────────────────────────────────

function ManualPane({
  projectId,
  onBack,
  onClose,
  onAdded,
}: {
  projectId: string
  onBack:    () => void
  onClose:   () => void
  onAdded:   () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [name,       setName]       = useState('')
  const [role,       setRole]       = useState('')
  const [department, setDepartment] = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [callTime,   setCallTime]   = useState('')
  const [rateCents,  setRateCents]  = useState('')
  const [rateUnit, setRateUnit] = useState<MemberFormData['rateUnit']>('DAY')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !role.trim()) return
    setError('')
    startTransition(async () => {
      const result = await addProjectMember(projectId, {
        contactId:  null,
        name:       name.trim(),
        role:       role.trim(),
        department: department.trim() || null,
        email:      email.trim() || null,
        phone:      phone.trim() || null,
        callTime:   callTime.trim() || null,
        rateCents:  rateCents.trim() ? Math.round(parseFloat(rateCents) * 100) : null,
        rateUnit,
        order:      0,
      })
      if (result.success) {
        onAdded()
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
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
            Role <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="Director of Photography"
            required
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Department</label>
        <select
          value={department}
          onChange={e => setDepartment(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="">No department</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate</label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <input
                type="number" value={rateCents} onChange={e => setRateCents(e.target.value)}
                placeholder="0" min="0" step="0.01"
                className="w-full rounded-lg border bg-background pl-7 pr-2 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <select value={rateUnit} onChange={e => setRateUnit(e.target.value as MemberFormData['rateUnit'])}
              className="rounded-lg border bg-background px-2 py-2 text-xs text-foreground outline-none">
              {RATE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Call time</label>
          <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={onBack}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
        <button
          type="submit"
          disabled={isPending || !name.trim() || !role.trim()}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
        >
          {isPending ? 'Adding…' : 'Add to project'}
        </button>
      </div>
    </form>
  )
}
