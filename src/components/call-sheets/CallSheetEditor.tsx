'use client'

import { useState, useTransition, useCallback } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Check, Copy, ExternalLink, RefreshCw,
  MapPin, Cloud, Hospital, AlertTriangle, Lock, Send, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CrewEditor } from './CrewEditor'
import { ScheduleEditor } from './ScheduleEditor'
import { TalentEditor } from './TalentEditor'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { OtherContactsEditor } from './OtherContactsEditor'
import {
  updateCallSheet,
  sendCallSheet,
  finalizeCallSheet,
  reopenCallSheet,
  fetchLocationData,
  importCrewFromBudget,
  type CrewDept,
  type ScheduleBlock,
  type WeatherInfo,
  type HospitalInfo,
  type TalentMember,
  type PointOfContact,
  type OtherContact,
} from '@/server/actions/call-sheets'
import type { CallSheetStatus } from '@/types'
import type { RolodexContact } from './RolodexNameInput'

// =============================================================================
// Types
// =============================================================================

export interface CallSheetData {
  id: string
  projectId: string
  projectName: string
  budgetId: string | null    // for crew import; null if no budget on the project
  title: string
  shootDate: string          // ISO
  generalCall: string
  status: CallSheetStatus
  publicToken: string
  locationName: string | null
  locationAddress: string | null
  parkingAddress: string | null
  locationNotes: string | null
  pointOfContact: PointOfContact | null
  talent: TalentMember[]
  crew: CrewDept[]
  schedule: ScheduleBlock[]
  cateringInfo: string | null
  notes: string | null
  weather: WeatherInfo | null
  hospitalInfo: HospitalInfo | null
  otherContacts: OtherContact[]
  clientContact: {
    companyName: string
    contactName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
  } | null
}

// =============================================================================
// Status config
// =============================================================================

const STATUS_CONFIG: Record<CallSheetStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  SENT:  { label: 'Sent',  color: 'bg-blue-100 text-blue-700' },
  FINAL: { label: 'Final', color: 'bg-green-100 text-green-700' },
}

// =============================================================================
// Component
// =============================================================================

export function CallSheetEditor({
  initial,
  rolodexContacts = [],
}: {
  initial: CallSheetData
  rolodexContacts?: RolodexContact[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  // ── Form state ───────────────────────────────────────────────────────────────
  const [title,           setTitle]           = useState(initial.title)
  const [shootDate,       setShootDate]       = useState(initial.shootDate.split('T')[0])
  const [generalCall,     setGeneralCall]     = useState(initial.generalCall)
  const [locationName,    setLocationName]    = useState(initial.locationName ?? '')
  const [locationAddress, setLocationAddress] = useState(initial.locationAddress ?? '')
  const [parkingAddress,  setParkingAddress]  = useState(initial.parkingAddress ?? '')
  const [locationNotes,   setLocationNotes]   = useState(initial.locationNotes ?? '')
  const [pointOfContact,  setPointOfContact]  = useState<PointOfContact>(
    initial.pointOfContact ?? { name: '', title: '', phone: '', email: '' }
  )
  const [talent,          setTalent]          = useState<TalentMember[]>(initial.talent ?? [])
  const [otherContacts,   setOtherContacts]   = useState<OtherContact[]>(initial.otherContacts ?? [])
  const [crew,            setCrew]            = useState<CrewDept[]>(initial.crew)
  const [schedule,        setSchedule]        = useState<ScheduleBlock[]>(initial.schedule)
  const [cateringInfo,    setCateringInfo]    = useState(initial.cateringInfo ?? '')
  const [notes,           setNotes]           = useState(initial.notes ?? '')

  // ── Derived / UI state ───────────────────────────────────────────────────────
  const [status,      setStatus]      = useState<CallSheetStatus>(initial.status)
  const [weather,     setWeather]     = useState<WeatherInfo | null>(initial.weather)
  const [hospital,    setHospital]    = useState<HospitalInfo | null>(initial.hospitalInfo)
  const [dirty,       setDirty]       = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [fetchError,  setFetchError]  = useState('')
  const [fetching,    setFetching]    = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [importing,     setImporting]     = useState(false)
  const [importMsg,     setImportMsg]     = useState('')

  const isLocked = status === 'FINAL'
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/cs/${initial.publicToken}`

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const markDirty = useCallback(() => { setDirty(true); setSaved(false) }, [])

  function field<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); markDirty() }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  function handleSave() {
    setError('')
    startTransition(async () => {
      const result = await updateCallSheet(initial.id, {
        title:            title.trim() || initial.title,
        shootDate,
        generalCall,
        locationName:     locationName.trim()     || undefined,
        locationAddress:  locationAddress.trim()  || undefined,
        parkingAddress:   parkingAddress.trim()   || undefined,
        locationNotes:    locationNotes.trim()     || undefined,
        pointOfContact:   pointOfContact.name.trim() ? pointOfContact : null,
        talent,
        otherContacts,
        hospitalInfo:     hospital,
        crew,
        schedule,
        cateringInfo:     cateringInfo.trim()     || undefined,
        notes:            notes.trim()            || undefined,
      })
      if (result.success) {
        setDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        router.refresh()
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  // ── Send / Finalize / Reopen ──────────────────────────────────────────────────

  function handleSend() {
    startTransition(async () => {
      // Save first if dirty
      if (dirty) {
        const saveResult = await updateCallSheet(initial.id, {
          title, shootDate, generalCall,
          locationName, locationAddress, parkingAddress, locationNotes,
          pointOfContact: pointOfContact.name.trim() ? pointOfContact : null,
          talent, otherContacts, hospitalInfo: hospital, crew, schedule, cateringInfo, notes,
        })
        if (!saveResult.success) { setError((saveResult as { success: false; error: string }).error); return }
      }
      const result = await sendCallSheet(initial.id)
      if (result.success) {
        setStatus('SENT')
        setDirty(false)
        router.refresh()
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  async function handleFinalize() {
    const ok = await confirmDialog('This call sheet will be locked for editing.', {
      title: 'Finalize call sheet?',
      confirmLabel: 'Finalize',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await finalizeCallSheet(initial.id)
      if (result.success) { setStatus('FINAL'); router.refresh() }
      else setError((result as { success: false; error: string }).error)
    })
  }

  function handleReopen() {
    startTransition(async () => {
      const result = await reopenCallSheet(initial.id)
      if (result.success) { setStatus('DRAFT'); router.refresh() }
      else setError((result as { success: false; error: string }).error)
    })
  }

  // ── Fetch location data ───────────────────────────────────────────────────────

  async function handleFetchLocation() {
    setFetchError('')
    setFetching(true)
    try {
      // Save address first so the server has the latest value
      if (locationAddress.trim()) {
        await updateCallSheet(initial.id, {
          locationAddress: locationAddress.trim(),
          locationName: locationName.trim() || undefined,
        })
      }
      const result = await fetchLocationData(initial.id)
      if (result.success) {
        setWeather(result.data.weather)
        setHospital(result.data.hospital)
        // Don't router.refresh() here — the data is already in local state.
        // A refresh causes a full server re-render which can race with the
        // state update and trigger a client-side exception.
      } else {
        setFetchError((result as { success: false; error: string }).error)
      }
    } finally {
      setFetching(false)
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleImportCrew() {
    if (!initial.budgetId) return
    setImporting(true)
    setImportMsg('')
    const result = await importCrewFromBudget(initial.id, initial.budgetId)
    setImporting(false)
    if (result.success) {
      // Update local state immediately — no page reload needed
      setCrew(result.data.crew)
      setDirty(false)
      setImportMsg(result.data.added > 0
        ? `${result.data.added} crew slot${result.data.added !== 1 ? 's' : ''} imported — fill in names and call times`
        : 'All crew roles already present'
      )
    } else {
      setImportMsg((result as { success: false; error: string }).error)
    }
    setTimeout(() => setImportMsg(''), 5000)
  }

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="max-w-3xl mx-auto">
      {ConfirmDialog}
      {/* Back */}
      <Link
        href={`/projects/${initial.projectId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {initial.projectName}
      </Link>

      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isLocked ? (
            <h1 className="text-xl font-semibold text-foreground truncate">{title}</h1>
          ) : (
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); markDirty() }}
              className="flex-1 min-w-0 text-xl font-semibold bg-transparent text-foreground focus:outline-none border-b-2 border-transparent focus:border-violet-400"
            />
          )}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CONFIG[status].color}`}>
            {STATUS_CONFIG[status].label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Preview — always visible */}
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Eye className="h-3 w-3" />
            Preview
          </a>

          {isLocked ? (
            <>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Open crew view
              </a>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <Button size="sm" variant="outline" onClick={handleReopen} disabled={pending}>
                Reopen
              </Button>
            </>
          ) : (
            <>
              {/* Save */}
              {dirty && (
                <Button size="sm" variant="outline" onClick={handleSave} disabled={pending}>
                  {pending ? 'Saving…' : saved ? <><Check className="h-3 w-3 mr-1" />Saved</> : 'Save changes'}
                </Button>
              )}
              {saved && !dirty && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}

              {/* Send */}
              <Button size="sm" onClick={handleSend} disabled={pending}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {status === 'DRAFT' ? 'Send to crew' : 'Resend'}
              </Button>

              {/* Finalize */}
              {status === 'SENT' && (
                <Button size="sm" variant="outline" onClick={handleFinalize} disabled={pending}>
                  <Lock className="mr-1.5 h-3 w-3" />
                  Finalize
                </Button>
              )}

              {/* Share link (once sent) */}
              {status === 'SENT' && (
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Locked banner ── */}
      {isLocked && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <Lock className="h-4 w-4 shrink-0" />
          This call sheet is finalized and locked. Click Reopen to make changes.
        </div>
      )}

      <div className="space-y-6">

        {/* ── Shoot info ── */}
        <Section title="Shoot Info">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cs-date">Shoot date</Label>
              <Input
                id="cs-date"
                type="date"
                value={shootDate}
                disabled={isLocked}
                onChange={e => field(setShootDate)(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cs-call">General call time</Label>
              <Input
                id="cs-call"
                type="time"
                value={generalCall}
                disabled={isLocked}
                onChange={e => field(setGeneralCall)(e.target.value)}
              />
            </div>
          </div>
          {/* Point of Contact */}
          <div className="grid gap-2">
            <Label>Point of contact for the day</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Input
                  placeholder="Name"
                  value={pointOfContact.name}
                  disabled={isLocked}
                  onChange={e => { setPointOfContact(p => ({ ...p, name: e.target.value })); markDirty() }}
                />
              </div>
              <div className="grid gap-1.5">
                <Input
                  placeholder="Title / role"
                  value={pointOfContact.title ?? ''}
                  disabled={isLocked}
                  onChange={e => { setPointOfContact(p => ({ ...p, title: e.target.value })); markDirty() }}
                />
              </div>
              <div className="grid gap-1.5">
                <Input
                  placeholder="Phone"
                  value={pointOfContact.phone ?? ''}
                  disabled={isLocked}
                  onChange={e => { setPointOfContact(p => ({ ...p, phone: e.target.value })); markDirty() }}
                />
              </div>
              <div className="grid gap-1.5">
                <Input
                  type="email"
                  placeholder="Email"
                  value={pointOfContact.email ?? ''}
                  disabled={isLocked}
                  onChange={e => { setPointOfContact(p => ({ ...p, email: e.target.value })); markDirty() }}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* ── Client / Other Contacts ── */}
        <Section title="Client / Other Contacts">
          {initial.clientContact && (
            <div className="divide-y rounded-lg border mb-3">
              <div className="flex items-center justify-between px-3 py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{initial.clientContact.companyName}</p>
                  {initial.clientContact.contactName && (
                    <p className="text-xs text-muted-foreground">{initial.clientContact.contactName}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    {initial.clientContact.contactPhone && (
                      <p className="text-xs text-muted-foreground">{initial.clientContact.contactPhone}</p>
                    )}
                    {initial.clientContact.contactEmail && (
                      <p className="text-xs text-muted-foreground">{initial.clientContact.contactEmail}</p>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 italic shrink-0">from project</p>
              </div>
            </div>
          )}
          {!isLocked && (
            <OtherContactsEditor
              contacts={otherContacts}
              onChange={v => { setOtherContacts(v); markDirty() }}
            />
          )}
          {isLocked && <OtherContactsEditor contacts={otherContacts} onChange={() => {}} readonly />}
        </Section>

        {/* ── Location ── */}
        <Section
          title="Location"
          icon={<MapPin className="h-4 w-4" />}
          action={!isLocked && (
            <button
              type="button"
              onClick={handleFetchLocation}
              disabled={fetching || !locationAddress.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? 'Fetching…' : 'Fetch weather & hospital'}
            </button>
          )}
        >
          {fetchError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />{fetchError}
            </p>
          )}

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cs-locname">Location name</Label>
                <Input
                  id="cs-locname"
                  placeholder="Smashbox Studios Stage 4"
                  value={locationName}
                  disabled={isLocked}
                  onChange={e => field(setLocationName)(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cs-locaddr">Full address</Label>
                <AddressAutocomplete
                  id="cs-locaddr"
                  placeholder="1234 Main St, Los Angeles, CA 90001"
                  value={locationAddress}
                  disabled={isLocked}
                  onChange={v => field(setLocationAddress)(v)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cs-parking">Parking address</Label>
              <Input
                id="cs-parking"
                placeholder="Parking structure address or lot name"
                value={parkingAddress}
                disabled={isLocked}
                onChange={e => field(setParkingAddress)(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cs-locnotes">Entry / access notes</Label>
              <textarea
                id="cs-locnotes"
                rows={2}
                placeholder="Gate code, check-in desk, loading dock instructions…"
                value={locationNotes}
                disabled={isLocked}
                onChange={e => field(setLocationNotes)(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-60"
              />
            </div>
          </div>

          {/* Weather + Hospital cards */}
          {(weather || hospital) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-2">
              {weather && <WeatherCard weather={weather} shootDate={initial.shootDate} />}
              {hospital && <HospitalCard hospital={hospital} />}
            </div>
          )}

          {!weather && !hospital && locationAddress && (
            <p className="text-xs text-muted-foreground italic">
              Click &ldquo;Fetch weather &amp; hospital&rdquo; to auto-populate forecast and nearest hospital.
            </p>
          )}
        </Section>

        {/* ── Nearest Hospital ── */}
        <Section
          title="Nearest Hospital"
          icon={<Hospital className="h-4 w-4" />}
        >
          <p className="text-xs text-muted-foreground -mt-1">
            Auto-populated by &ldquo;Fetch weather &amp; hospital&rdquo; above, or enter manually.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cs-hosp-name">Hospital name</Label>
              <Input
                id="cs-hosp-name"
                placeholder="Cedars-Sinai Medical Center"
                value={hospital?.name ?? ''}
                disabled={isLocked}
                onChange={e => {
                  const v = e.target.value
                  setHospital(h => h ? { ...h, name: v } : { name: v, address: '', phone: '', distanceKm: 0, lat: 0, lng: 0 })
                  markDirty()
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cs-hosp-phone">Phone</Label>
              <Input
                id="cs-hosp-phone"
                placeholder="+1 (310) 423-3277"
                value={hospital?.phone ?? ''}
                disabled={isLocked}
                onChange={e => {
                  const v = e.target.value
                  setHospital(h => h ? { ...h, phone: v } : { name: '', address: '', phone: v, distanceKm: 0, lat: 0, lng: 0 })
                  markDirty()
                }}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cs-hosp-addr">Address</Label>
            <Input
              id="cs-hosp-addr"
              placeholder="8700 Beverly Blvd, Los Angeles, CA 90048"
              value={hospital?.address ?? ''}
              disabled={isLocked}
              onChange={e => {
                const v = e.target.value
                setHospital(h => h ? { ...h, address: v } : { name: '', address: v, phone: '', distanceKm: 0, lat: 0, lng: 0 })
                markDirty()
              }}
            />
          </div>
          {hospital?.distanceKm ? (
            <p className="text-xs text-muted-foreground">{hospital.distanceKm} km from location (auto-fetched)</p>
          ) : null}
        </Section>

        {/* ── Schedule ── */}
        <Section title="Schedule">
          <ScheduleEditor
            schedule={schedule}
            readonly={isLocked}
            onChange={s => { setSchedule(s); markDirty() }}
          />
        </Section>

        {/* ── Talent ── */}
        <Section title="Talent">
          <TalentEditor
            talent={talent}
            readonly={isLocked}
            rolodexContacts={rolodexContacts}
            onChange={t => { setTalent(t); markDirty() }}
          />
        </Section>

        {/* ── Crew ── */}
        <Section
          title="Crew"
          action={!isLocked && initial.budgetId && (
            <div className="flex items-center gap-3">
              {importMsg && (
                <span className="text-xs text-muted-foreground">{importMsg}</span>
              )}
              <button
                type="button"
                onClick={handleImportCrew}
                disabled={importing}
                className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${importing ? 'animate-spin' : ''}`} />
                {importing ? 'Importing…' : 'Import from budget'}
              </button>
            </div>
          )}
        >
          <CrewEditor
            crew={crew}
            readonly={isLocked}
            rolodexContacts={rolodexContacts}
            onChange={c => { setCrew(c); markDirty() }}
          />
        </Section>

        {/* ── Logistics ── */}
        <Section title="Logistics">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cs-catering">Catering / craft services</Label>
              <textarea
                id="cs-catering"
                rows={2}
                placeholder="Vendor name, delivery time, location on set…"
                value={cateringInfo}
                disabled={isLocked}
                onChange={e => field(setCateringInfo)(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-60"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cs-notes">Additional notes</Label>
              <textarea
                id="cs-notes"
                rows={3}
                placeholder="Wardrobe notes, special requirements, COVID protocols…"
                value={notes}
                disabled={isLocked}
                onChange={e => field(setNotes)(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-60"
              />
            </div>
          </div>
        </Section>

      </div>

      {/* Floating save (visible when dirty + not locked) */}
      {dirty && !isLocked && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button onClick={handleSave} disabled={pending} className="shadow-lg">
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Section wrapper
// =============================================================================

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-4">
        {children}
      </div>
    </section>
  )
}

// =============================================================================
// Weather card
// =============================================================================

function WeatherCard({ weather, shootDate }: { weather: WeatherInfo; shootDate?: string }) {
  const sunrise = new Date(weather.sunrise).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sunset  = new Date(weather.sunset).toLocaleTimeString('en-US',  { hour: 'numeric', minute: '2-digit' })
  const forDate = shootDate
    ? new Date(shootDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Cloud className="h-4 w-4 text-sky-600" />
        <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Weather</p>
        {forDate && <span className="ml-auto text-[10px] text-sky-500">Forecast for {forDate}</span>}
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold text-sky-900">{weather.high}°</span>
        <span className="text-lg text-sky-600 mb-0.5">/ {weather.low}°F</span>
      </div>
      <p className="text-sm font-medium text-sky-800 mb-3">{weather.conditions}</p>
      <div className="grid grid-cols-2 gap-1.5 text-xs text-sky-700">
        <span>💨 {weather.windMph} mph wind</span>
        <span>🌧 {weather.precipPct}% precip</span>
        <span>🌅 Sunrise {sunrise}</span>
        <span>🌇 Sunset {sunset}</span>
      </div>
    </div>
  )
}

// =============================================================================
// Hospital card
// =============================================================================

function HospitalCard({ hospital }: { hospital: HospitalInfo }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hospital.name} ${hospital.address}`)}`

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Hospital className="h-4 w-4 text-red-600" />
        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Nearest Hospital</p>
        <span className="ml-auto text-[10px] text-red-500">{hospital.distanceKm} km away</span>
      </div>
      <p className="text-sm font-semibold text-red-900 mb-1">{hospital.name}</p>
      <p className="text-xs text-red-700 mb-2 leading-relaxed">{hospital.address}</p>
      {hospital.phone && (
        <a href={`tel:${hospital.phone}`} className="text-xs font-medium text-red-700 hover:underline block mb-2">
          📞 {hospital.phone}
        </a>
      )}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        Open in Maps
      </a>
    </div>
  )
}
