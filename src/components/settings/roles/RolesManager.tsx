'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronRight, Lock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  PROJECT_AREAS, WORKSPACE_AREAS, LEVELS, MAX_ROLES, ROLE_NAME_MAX,
  applyProjectDependencies, unmetViewRequirements, PROJECT_AREAS as ALL_PROJECT_AREAS,
  type Level, type ProjectArea, type ProjectPermissions, type ProjectScopeValue,
  type WorkspaceArea, type WorkspacePermissions,
} from '@/lib/permissions'
import {
  createWorkspaceRole, updateWorkspaceRole, deleteWorkspaceRole,
  createProjectRole, updateProjectRole, deleteProjectRole,
  type WorkspaceRoleRow, type ProjectRoleRow,
} from '@/server/actions/roles'

const LEVEL_LABEL: Record<Level, string> = { NONE: 'None', VIEW: 'View', EDIT: 'Edit' }

type ActionRes = { success: boolean; error?: string }

// ─── Level picker ─────────────────────────────────────────────────────────────

function LevelPicker({ value, onChange, disabled }: { value: Level; onChange: (l: Level) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-background p-0.5">
      {LEVELS.map(l => (
        <button
          key={l}
          type="button"
          disabled={disabled}
          onClick={() => onChange(l)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed',
            value === l
              ? l === 'NONE' ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {LEVEL_LABEL[l]}
        </button>
      ))}
    </div>
  )
}

// ─── Area matrix ──────────────────────────────────────────────────────────────

function AreaMatrix<K extends string>({
  areas, values, onChange, disabled,
}: {
  areas:    readonly { key: K; label: string; group: string; hint: string }[]
  values:   Record<K, Level>
  onChange: (key: K, level: Level) => void
  disabled?: boolean
}) {
  const groups = [...new Set(areas.map(a => a.group))]
  // Project matrices only: areas switched off because what they need isn't visible.
  const isProject = areas.some(a => a.key === ('actuals' as K))
  const unmet = isProject ? unmetViewRequirements(values as unknown as Parameters<typeof unmetViewRequirements>[0]) : []
  const labelOf = (key: string) => ALL_PROJECT_AREAS.find(a => a.key === key)?.label ?? key
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {groups.map(group => (
        <div key={group} className="px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
          {areas.filter(a => a.group === group).map(a => (
            <div key={a.key} className="flex items-center justify-between gap-4 py-1.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-foreground">
                  {a.label}
                </p>
                <p className="text-xs text-muted-foreground">{a.hint}</p>
              </div>
              <LevelPicker value={values[a.key]} onChange={l => onChange(a.key, l)} disabled={disabled} />
            </div>
          )).flatMap((row, i) => {
            const area = areas.filter(x => x.group === group)[i]
            const need = unmet.find(u => u.area === (area.key as string))
            return need ? [row, (
              <p key={`${area.key}-needs`} className="-mt-1 mb-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                {area.label} needs {labelOf(need.requires)} at View or above. Without it (from this or another role), {area.label} stays off.
              </p>
            )] : [row]
          })}
          {group === 'Budget' && (
            <p className="pb-1 text-[11px] text-muted-foreground">Costs can’t be more open than lines, and margin can’t be more open than costs — adjusted automatically.</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Saved indicator (no toasts) ──────────────────────────────────────────────

function useSaved() {
  const [saved, setSaved] = useState(false)
  return { saved, flash: () => { setSaved(true); setTimeout(() => setSaved(false), 1500) } }
}

// ─── Workspace role editor ────────────────────────────────────────────────────

function WorkspaceRoleEditor({ role, onDone }: { role: WorkspaceRoleRow; onDone: () => void }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const locked = role.systemKey === 'OWNER'
  const [name, setName]   = useState(role.name)
  const [scope, setScope] = useState<ProjectScopeValue>(role.projectScope)
  const [ws, setWs]       = useState<WorkspacePermissions>(role.workspacePermissions)
  const [base, setBase]   = useState<ProjectPermissions>(role.projectBaseline)
  const [error, setError] = useState<string | null>(null)
  const { saved, flash }  = useSaved()

  function save() {
    setError(null)
    start(async () => {
      const res = await updateWorkspaceRole(role.id, { name, projectScope: scope, workspacePermissions: ws, projectBaseline: base }) as ActionRes
      if (!res.success) { setError(res.error ?? 'Failed to save'); return }
      flash()
      router.refresh()
    })
  }

  async function remove() {
    const ok = await confirm(`The “${role.name}” role will be deleted. Pending invitations with it fall back to their built-in role.`, { title: 'Delete role?' })
    if (!ok) return
    start(async () => {
      const res = await deleteWorkspaceRole(role.id) as ActionRes
      if (!res.success) { setError(res.error ?? 'Failed to delete'); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
      {ConfirmDialog}
      {locked ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" /> The Owner role always has full access to everything and can’t be changed.</p>
      ) : (
        <div className="max-w-xs">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <Input value={name} maxLength={ROLE_NAME_MAX} onChange={e => setName(e.target.value)} />
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Projects</p>
        <div className="flex flex-wrap gap-2">
          {([['ALL', 'All projects in the workspace'], ['ASSIGNED', 'Only projects they’re added to']] as const).map(([v, label]) => (
            <button
              key={v} type="button" disabled={locked} onClick={() => setScope(v)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed',
                scope === v ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Workspace pages</p>
        <AreaMatrix<WorkspaceArea>
          areas={WORKSPACE_AREAS} values={ws} disabled={locked}
          onChange={(k, l) => setWs(prev => ({ ...prev, [k]: l }))}
        />
      </div>

      <div>
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Inside every project they can open</p>
        <p className="mb-1.5 text-xs text-muted-foreground">A minimum — a project role can add more on the projects where they hold it.</p>
        <AreaMatrix<ProjectArea>
          areas={PROJECT_AREAS} values={base} disabled={locked}
          onChange={(k, l) => setBase(prev => applyProjectDependencies({ ...prev, [k]: l }))}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!locked && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={isPending}>Save</Button>
          <Button size="sm" variant="ghost" onClick={onDone} disabled={isPending}>Close</Button>
          {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved</span>}
          {!role.systemKey && (
            <Button
              size="sm" variant="ghost" onClick={remove} disabled={isPending || role.memberCount > 0}
              title={role.memberCount > 0 ? 'Move its members to another role first' : undefined}
              className="ml-auto text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete role
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Project role editor ──────────────────────────────────────────────────────

function ProjectRoleEditor({ role, onDone }: { role: ProjectRoleRow; onDone: () => void }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const [name, setName]   = useState(role.name)
  const [perms, setPerms] = useState<ProjectPermissions>(role.permissions)
  const [error, setError] = useState<string | null>(null)
  const { saved, flash }  = useSaved()

  function save() {
    setError(null)
    start(async () => {
      const res = await updateProjectRole(role.id, { name, permissions: perms }) as ActionRes
      if (!res.success) { setError(res.error ?? 'Failed to save'); return }
      flash()
      router.refresh()
    })
  }

  async function remove() {
    const ok = await confirm(`The “${role.name}” project role will be deleted.`, { title: 'Delete project role?' })
    if (!ok) return
    start(async () => {
      const res = await deleteProjectRole(role.id) as ActionRes
      if (!res.success) { setError(res.error ?? 'Failed to delete'); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
      {ConfirmDialog}
      <div className="max-w-xs">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
        <Input value={name} maxLength={ROLE_NAME_MAX} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">On the projects where someone holds this role</p>
        <p className="mb-1.5 text-xs text-muted-foreground">Added on top of their workspace role — it can only give more, never less.</p>
        <AreaMatrix<ProjectArea>
          areas={PROJECT_AREAS} values={perms}
          onChange={(k, l) => setPerms(prev => applyProjectDependencies({ ...prev, [k]: l }))}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={isPending}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={isPending}>Close</Button>
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved</span>}
        {!role.systemKey && (
          <Button
            size="sm" variant="ghost" onClick={remove} disabled={isPending || role.everUsed}
            title={role.everUsed ? 'Used on a project (team history keeps it) — rename or change it instead' : undefined}
            className="ml-auto text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete role
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── New role form ────────────────────────────────────────────────────────────

function NewRoleForm({
  options, defaultCopyId, onCreate, onCancel,
}: {
  options:       { id: string; name: string }[]
  defaultCopyId: string
  onCreate:      (name: string, copyFromId: string) => Promise<ActionRes>
  onCancel:      () => void
}) {
  const [name, setName] = useState('')
  const [copyFrom, setCopyFrom] = useState(defaultCopyId)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
        <Input value={name} maxLength={ROLE_NAME_MAX} onChange={e => setName(e.target.value)} placeholder="e.g. Vendor coordinator" className="w-56" autoFocus />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Start from</label>
        <select
          value={copyFrom} onChange={e => setCopyFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <Button
        size="sm" disabled={isPending || !name.trim()}
        onClick={() => start(async () => {
          setError(null)
          const res = await onCreate(name, copyFrom)
          if (!res.success) setError(res.error ?? 'Failed to create')
        })}
      >
        Create
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RolesManager({ workspaceRoles, projectRoles }: { workspaceRoles: WorkspaceRoleRow[]; projectRoles: ProjectRoleRow[] }) {
  const router = useRouter()
  const [openId, setOpenId]   = useState<string | null>(null)
  const [adding, setAdding]   = useState<'workspace' | 'project' | null>(null)

  const defaultWsCopyId = workspaceRoles.find(r => r.systemKey === 'COLLABORATOR')?.id ?? workspaceRoles[0]?.id ?? ''
  const teamMemberId = projectRoles.find(r => r.systemKey === 'TEAM_MEMBER')?.id ?? projectRoles[0]?.id ?? ''

  return (
    <div className="space-y-8">
      {/* Workspace roles */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Workspace roles</h2>
            <p className="text-sm text-muted-foreground">Everyone in the workspace has one. It sets which pages they can open, which projects they see, and a minimum for inside those projects.</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{workspaceRoles.length} / {MAX_ROLES}</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {workspaceRoles.map(r => (
            <div key={r.id} className="border-b border-border last:border-0">
              <button
                type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
              >
                {openId === r.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-foreground">{r.name}</span>
                {r.systemKey && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Built-in</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.projectScope === 'ALL' ? 'All projects' : 'Assigned projects'} · {r.memberCount} {r.memberCount === 1 ? 'member' : 'members'}
                </span>
              </button>
              {openId === r.id && <WorkspaceRoleEditor key={r.id + JSON.stringify(r)} role={r} onDone={() => setOpenId(null)} />}
            </div>
          ))}
          {adding === 'workspace' ? (
            <NewRoleForm
              options={workspaceRoles.map(r => ({ id: r.id, name: r.name }))}
              defaultCopyId={defaultWsCopyId}
              onCancel={() => setAdding(null)}
              onCreate={async (name, copyFromId) => {
                const res = await createWorkspaceRole({ name, copyFromId }) as ActionRes & { data?: { id: string } }
                if (res.success) { setAdding(null); setOpenId(res.data?.id ?? null); router.refresh() }
                return res
              }}
            />
          ) : workspaceRoles.length < MAX_ROLES && (
            <button type="button" onClick={() => setAdding('workspace')} className="flex w-full items-center gap-1.5 border-t border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
              <Plus className="h-4 w-4" /> New workspace role
            </button>
          )}
        </div>
      </section>

      {/* Project roles */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Project roles</h2>
            <p className="text-sm text-muted-foreground">Given per person, per project, in the project’s Team panel. Adds to what their workspace role allows on that project.</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{projectRoles.length} / {MAX_ROLES}</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {projectRoles.map(r => (
            <div key={r.id} className="border-b border-border last:border-0">
              <button
                type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
              >
                {openId === r.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-foreground">{r.name}</span>
                {r.systemKey && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Built-in</span>}
                <span className="ml-auto text-xs text-muted-foreground">{r.activeCount} on projects now</span>
              </button>
              {openId === r.id && <ProjectRoleEditor key={r.id + JSON.stringify(r)} role={r} onDone={() => setOpenId(null)} />}
            </div>
          ))}
          {adding === 'project' ? (
            <NewRoleForm
              options={projectRoles.map(r => ({ id: r.id, name: r.name }))}
              defaultCopyId={teamMemberId}
              onCancel={() => setAdding(null)}
              onCreate={async (name, copyFromId) => {
                const res = await createProjectRole({ name, copyFromId }) as ActionRes & { data?: { id: string } }
                if (res.success) { setAdding(null); setOpenId(res.data?.id ?? null); router.refresh() }
                return res
              }}
            />
          ) : projectRoles.length < MAX_ROLES && (
            <button type="button" onClick={() => setAdding('project')} className="flex w-full items-center gap-1.5 border-t border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
              <Plus className="h-4 w-4" /> New project role
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
