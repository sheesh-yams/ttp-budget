'use client'

import { useId } from 'react'
import { Trash2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useSaveQueue, SaveStatusLine } from '@/components/autosave/SaveScope'
import { updateShot } from '@/server/actions/shot-list'
import {
  SHOT_ANGLES, SHOT_ASPECTS, SHOT_EQUIPMENT, SHOT_FRAME_RATES, SHOT_LENSES, SHOT_MOVEMENTS, SHOT_SIZES, SHOT_SOUND,
  sizeValue, type ShotPatch, type ShotStatusValue, type ShotTextField, type ShotView, type ShotReferenceView,
} from '@/lib/shot-list'
import { ReferencePicker } from './ReferencePicker'
import { StatusBox } from './StatusBox'
import { SL } from './styles'

export interface DrawerShot {
  shot:         ShotView
  code:         string
  sectionLabel: string
  sectionColor: string | null
}

export function ShotDrawer({
  open, current, canEdit, onClose, onLocalChange, onStatus, onDelete,
}: {
  open:          boolean
  current:       DrawerShot | null
  canEdit:       boolean
  onClose:       () => void
  onLocalChange: (shotId: string, patch: Partial<ShotView>) => void
  onStatus:      (shotId: string, s: ShotStatusValue) => void
  onDelete:      (shotId: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-[#E2E0DC] p-0 sm:max-w-[460px] [&>button]:hidden">
        {current && (
          <DrawerBody
            key={current.shot.id}
            current={current} canEdit={canEdit} onClose={onClose}
            onLocalChange={onLocalChange} onStatus={onStatus} onDelete={onDelete}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function DrawerBody({
  current, canEdit, onClose, onLocalChange, onStatus, onDelete,
}: {
  current: DrawerShot; canEdit: boolean; onClose: () => void
  onLocalChange: (shotId: string, patch: Partial<ShotView>) => void
  onStatus: (shotId: string, s: ShotStatusValue) => void
  onDelete: (shotId: string) => void
}) {
  const { shot } = current
  const queue = useSaveQueue<ShotPatch>(p => updateShot(shot.id, p), { refresh: false })

  function set(field: ShotTextField, value: string) {
    onLocalChange(shot.id, { [field]: field === 'description' ? value : (value || null) } as Partial<ShotView>)
    queue.queue({ [field]: value } as ShotPatch)
  }
  function setMinutes(raw: string) {
    const n = raw.trim() === '' ? null : Math.max(0, Math.min(1440, Math.round(Number(raw))))
    if (n !== null && !Number.isFinite(n)) return
    onLocalChange(shot.id, { estMinutes: n })
    queue.queue({ estMinutes: n })
  }

  const field = (f: ShotTextField, label: string, presets?: readonly string[], map?: (p: string) => string) => (
    <FieldCell key={f} label={label}>
      <SuggestInput value={shot[f] ?? ''} onChange={v => set(f, v)} presets={presets} map={map} disabled={!canEdit} />
    </FieldCell>
  )

  return (
    <div className="px-6 pb-8 pt-6">
      <div className="flex items-center gap-2.5">
        <StatusBox status={shot.status} onChange={canEdit ? s => onStatus(shot.id, s) : undefined} />
        <SheetTitle className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">Shot {current.code}</SheetTitle>
        {shot.size && <span className={SL.sizeTag}>{shot.size}</span>}
        <button type="button" onClick={onClose} className={`ml-auto rounded-[4px] p-1 ${SL.mut} hover:text-[#1A1A1A]`} aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <SheetDescription className={`mt-1 flex items-center gap-1.5 text-[13px] ${SL.t2}`}>
        {current.sectionColor && <span className="h-2 w-2 rounded-[2px]" style={{ background: current.sectionColor }} />}
        {current.sectionLabel}
      </SheetDescription>

      <Label>References</Label>
      <ReferencePicker
        shotId={shot.id}
        references={shot.references}
        canEdit={canEdit}
        onChange={(refs: ShotReferenceView[]) => onLocalChange(shot.id, { references: refs })}
      />

      <Label>Description</Label>
      <textarea
        value={shot.description}
        onChange={e => set('description', e.target.value)}
        disabled={!canEdit}
        rows={3}
        placeholder="What happens in this shot"
        className={`${SL.input} resize-y leading-relaxed`}
      />
      <input
        value={shot.subject ?? ''}
        onChange={e => set('subject', e.target.value)}
        disabled={!canEdit}
        placeholder="Subject — who or what is in frame"
        className={`${SL.input} mt-2`}
      />

      <div className="mt-4 grid grid-cols-2 border-t border-[#EEEDEA]">
        {field('size', 'Size', SHOT_SIZES, sizeValue)}
        {field('angle', 'Angle', SHOT_ANGLES)}
        {field('movement', 'Movement', SHOT_MOVEMENTS)}
        {field('lens', 'Lens', SHOT_LENSES)}
        {field('equipment', 'Equipment', SHOT_EQUIPMENT)}
        {field('camera', 'Camera', ['A cam', 'B cam', 'C cam'])}
        {field('frameRate', 'Frame rate', SHOT_FRAME_RATES)}
        {field('aspect', 'Aspect', SHOT_ASPECTS)}
        {field('sound', 'Sound', SHOT_SOUND)}
        {field('setup', 'Setup #')}
        <FieldCell label="Est. time (min)">
          <input
            type="number" min={0} max={1440} inputMode="numeric"
            value={shot.estMinutes ?? ''} onChange={e => setMinutes(e.target.value)} disabled={!canEdit}
            className="w-full bg-transparent text-sm text-[#1A1A1A] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </FieldCell>
        {field('location', 'Location')}
      </div>
      <div className="grid grid-cols-1 border-b border-[#EEEDEA] pt-2.5">
        <label className={`block pb-1 text-[12.5px] ${SL.mut}`}>Cast</label>
        <SuggestInput value={shot.cast ?? ''} onChange={v => set('cast', v)} disabled={!canEdit} />
        <div className="h-2.5" />
      </div>
      <p className={`mt-2 text-xs ${SL.mut}`}>Every list also takes your own text.</p>

      <Label>Notes</Label>
      <textarea
        value={shot.notes ?? ''} onChange={e => set('notes', e.target.value)} disabled={!canEdit} rows={2}
        placeholder="Crew notes — not shown on the share link"
        className={`${SL.input} resize-y`}
      />

      <div className="mt-6 flex items-center justify-between">
        <SaveStatusLine />
        {canEdit && (
          <button type="button" onClick={() => onDelete(shot.id)} className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
            <Trash2 className="h-4 w-4" /> Delete shot
          </button>
        )}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className={`mb-2 mt-6 text-[13px] ${SL.t2}`}>{children}</div>
}

function FieldCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#EEEDEA] py-2.5 odd:border-r odd:pr-3.5 even:pl-3.5">
      <label className={`block pb-1 text-[12.5px] ${SL.mut}`}>{label}</label>
      {children}
    </div>
  )
}

/** Free text with preset suggestions (a native datalist — no lock-in to the list). */
export function SuggestInput({
  value, onChange, presets, map, disabled, className,
}: {
  value: string; onChange: (v: string) => void; presets?: readonly string[]
  map?: (preset: string) => string; disabled?: boolean; className?: string
}) {
  const id = useId()
  return (
    <>
      <input
        value={value}
        list={presets ? id : undefined}
        onChange={e => {
          const v = e.target.value
          // Picking "MCU — Medium close-up" stores "MCU".
          onChange(map && presets?.includes(v) ? map(v) : v)
        }}
        disabled={disabled}
        className={className ?? 'w-full bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#9A9A9A] focus:outline-none disabled:cursor-default'}
        placeholder="—"
      />
      {presets && <datalist id={id}>{presets.map(p => <option key={p} value={p} />)}</datalist>}
    </>
  )
}
