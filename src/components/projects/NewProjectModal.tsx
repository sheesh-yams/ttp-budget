'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createProjectWithBudget } from '@/server/actions/projects'
import type { Client, BudgetTemplate, ShootType } from '@prisma/client'

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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Pick<Client, 'id' | 'name'>[]
  templates: Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
}

export function NewProjectModal({ open, onOpenChange, clients, templates }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName]           = useState('')
  const [clientId, setClientId]   = useState('')
  const [clientName, setClientName] = useState('') // for "new client" mode
  const [newClient, setNewClient] = useState(false)
  const [shootType, setShootType] = useState<ShootType>('MUSIC_VIDEO')
  const [templateId, setTemplateId] = useState<string>('')
  const [error, setError]         = useState('')

  // Filter templates to match selected shoot type
  const matchingTemplates = templates.filter(t => t.shootType === shootType)

  function handleShootTypeChange(val: string) {
    setShootType(val as ShootType)
    // Auto-select first matching template
    const match = templates.find(t => t.shootType === val)
    setTemplateId(match?.id ?? '')
  }

  function reset() {
    setName('')
    setClientId('')
    setClientName('')
    setNewClient(false)
    setShootType('MUSIC_VIDEO')
    setTemplateId(templates.find(t => t.shootType === 'MUSIC_VIDEO')?.id ?? '')
    setError('')
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function handleSubmit() {
    if (!name.trim()) { setError('Project name is required'); return }
    if (!newClient && !clientId) { setError('Select a client or create one'); return }
    if (newClient && !clientName.trim()) { setError('Enter a client name'); return }
    setError('')

    startTransition(async () => {
      const result = await createProjectWithBudget({
        name: name.trim(),
        clientId: newClient ? undefined : clientId,
        clientName: newClient ? clientName.trim() : undefined,
        shootType,
        templateId: templateId || null,
      })
      if (result.success) {
        handleOpenChange(false)
        router.push(`/projects/${result.data.id}`)
        return
      }
      setError((result as { success: false; error: string }).error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Project name */}
          <div className="grid gap-1.5">
            <Label htmlFor="proj-name">Project name</Label>
            <Input
              id="proj-name"
              placeholder="e.g. Nike Air Max — Summer Drop"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Client */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Client</Label>
              <button
                type="button"
                className="text-xs text-violet-600 hover:underline"
                onClick={() => { setNewClient(v => !v); setClientId(''); setClientName('') }}
              >
                {newClient ? 'Select existing' : '+ New client'}
              </button>
            </div>
            {newClient ? (
              <Input
                placeholder="Client name"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            ) : (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Shoot type */}
          <div className="grid gap-1.5">
            <Label>Shoot type</Label>
            <Select value={shootType} onValueChange={handleShootTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOOT_TYPES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template */}
          <div className="grid gap-1.5">
            <Label>Budget template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Blank budget (no template)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__blank__">Blank budget</SelectItem>
                {matchingTemplates.length > 0 && matchingTemplates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
                {/* Show all templates if none match */}
                {matchingTemplates.length === 0 && templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateId && templateId !== '__blank__' && (() => {
              const t = templates.find(x => x.id === templateId)
              return t?.description ? (
                <p className="text-xs text-muted-foreground">{t.description}</p>
              ) : null
            })()}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
