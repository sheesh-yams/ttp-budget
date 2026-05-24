'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TemplateStructureEditor } from './TemplateStructureEditor'
import { BulkImportModal } from '@/components/budget/BulkImportModal'
import { updateTemplateMeta } from '@/server/actions/templates'
import type { TemplateStructure, TemplateKind, BudgetTemplateExtended } from '@/types'
import type { BudgetTemplate, ShootType } from '@prisma/client'

// ─── Shoot type options ───────────────────────────────────────────────────────

const SHOOT_TYPES: { value: ShootType; label: string }[] = [
  { value: 'MUSIC_VIDEO',    label: 'Music Video' },
  { value: 'BRAND_CAMPAIGN', label: 'Brand Campaign' },
  { value: 'PRODUCT_SHOOT',  label: 'Product Shoot' },
  { value: 'EVENT_RECAP',    label: 'Event Recap' },
  { value: 'SOCIAL_CONTENT', label: 'Social Content' },
  { value: 'INFLUENCER',     label: 'Influencer' },
  { value: 'DOCUMENTARY',    label: 'Documentary' },
  { value: 'OTHER',          label: 'Other' },
]

const SHOOT_COLORS: Partial<Record<ShootType, string>> = {
  MUSIC_VIDEO:    'bg-violet-100 text-violet-700',
  BRAND_CAMPAIGN: 'bg-blue-100 text-blue-700',
  PRODUCT_SHOOT:  'bg-amber-100 text-amber-700',
  EVENT_RECAP:    'bg-green-100 text-green-700',
  SOCIAL_CONTENT: 'bg-pink-100 text-pink-700',
  INFLUENCER:     'bg-orange-100 text-orange-700',
  DOCUMENTARY:    'bg-teal-100 text-teal-700',
  OTHER:          'bg-gray-100 text-gray-600',
}

// ─── Multi-select tags picker ─────────────────────────────────────────────────

function TagsPicker({
  selected,
  onChange,
}: {
  selected: ShootType[]
  onChange: (tags: ShootType[]) => void
}) {
  function toggle(value: ShootType) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SHOOT_TYPES.map(st => {
        const active = selected.includes(st.value)
        return (
          <button
            key={st.value}
            type="button"
            onClick={() => toggle(st.value)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all border ${
              active
                ? `${SHOOT_COLORS[st.value] ?? 'bg-gray-100 text-gray-700'} border-transparent ring-2 ring-offset-1 ring-violet-400`
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}
          >
            {st.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  template: BudgetTemplate
}

export function TemplateDetailClient({ template: rawTemplate }: Props) {
  const template = rawTemplate as unknown as BudgetTemplateExtended
  const router   = useRouter()
  const [saving, startSave]   = useTransition()
  const [saved,  setSaved]    = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Metadata state
  const [name,      setName]      = useState(template.name)
  const [desc,      setDesc]      = useState(template.description ?? '')
  const [kind,      setKind]      = useState<TemplateKind>((template.kind ?? 'FULL') as TemplateKind)
  const [shootType, setShootType] = useState<ShootType>(template.shootType)
  const [tags,      setTags]      = useState<ShootType[]>(template.tags ?? [])
  const [metaError, setMetaError] = useState('')

  const structure = template.structure ?? { accounts: [] }

  function handleSaveMeta() {
    if (!name.trim()) { setMetaError('Name is required'); return }
    setMetaError('')
    startSave(async () => {
      const res = await updateTemplateMeta(template.id, {
        name: name.trim(),
        description: desc.trim() || null,
        kind,
        shootType,
        tags,
      })
      if (res.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        router.refresh()
      } else {
        setMetaError((res as { success: false; error: string }).error)
      }
    })
  }

  const kindLabel   = kind === 'FULL' ? 'Full Template' : 'Add-on Package'
  const kindColor   = kind === 'FULL' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'

  return (
    <div className="space-y-8">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2">
        <Link
          href="/templates"
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Templates
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-[13px] text-foreground font-medium truncate max-w-xs">{template.name}</span>
        <span className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${kindColor}`}>
          {kindLabel}
        </span>
      </div>

      {/* ── Metadata card ── */}
      <div className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Template info</h2>
          <div className="flex items-center gap-2">
            {saved && <span className="text-[12px] text-green-600 font-medium">Saved ✓</span>}
            {metaError && <span className="text-[12px] text-red-600">{metaError}</span>}
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import
            </Button>
            <Button size="sm" onClick={handleSaveMeta} disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save info'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Name */}
          <div className="space-y-1.5 col-span-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Music Video — Standard Crew"
              className="text-[15px] font-medium"
            />
          </div>

          {/* Kind */}
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={v => setKind(v as TemplateKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL">
                  <div>
                    <p className="font-medium">Full Template</p>
                    <p className="text-[11px] text-muted-foreground">Seeds a complete project budget</p>
                  </div>
                </SelectItem>
                <SelectItem value="PACKAGE">
                  <div>
                    <p className="font-medium">Add-on Package</p>
                    <p className="text-[11px] text-muted-foreground">Building block — insert into any budget</p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Primary shoot type */}
          <div className="space-y-1.5">
            <Label>Primary type</Label>
            <Select value={shootType} onValueChange={v => setShootType(v as ShootType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHOOT_TYPES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5 col-span-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What's this template for? When would you use it?"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          {/* Tags — multi-select subtypes */}
          <div className="space-y-2 col-span-2">
            <div>
              <Label>Also applies to</Label>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Tag additional shoot types so this shows up when relevant — useful for packages that work across categories.
              </p>
            </div>
            <TagsPicker selected={tags} onChange={setTags} />
          </div>
        </div>
      </div>

      {/* ── Budget structure ── */}
      <div className="rounded-xl border border-border bg-white p-6">
        <TemplateStructureEditor
          templateId={template.id}
          initialStructure={structure}
        />
      </div>

      {/* ── Bulk import modal ── */}
      <BulkImportModal
        open={showImport}
        onOpenChange={setShowImport}
        target={{ type: 'template', templateId: template.id }}
        onImported={() => router.refresh()}
      />
    </div>
  )
}
