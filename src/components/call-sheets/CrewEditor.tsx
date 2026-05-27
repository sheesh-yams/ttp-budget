'use client'

import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { CrewDept, CrewMember } from '@/server/actions/call-sheets'

interface Props {
  crew: CrewDept[]
  onChange: (crew: CrewDept[]) => void
  readonly?: boolean
}

export function CrewEditor({ crew, onChange, readonly = false }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  function toggleCollapse(i: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function addDept() {
    onChange([...crew, { dept: 'New Department', members: [{ name: '', role: '', callTime: '' }] }])
  }

  function removeDept(i: number) {
    onChange(crew.filter((_, idx) => idx !== i))
  }

  function updateDeptName(i: number, name: string) {
    onChange(crew.map((d, idx) => idx === i ? { ...d, dept: name } : d))
  }

  function addMember(deptIdx: number) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? { ...d, members: [...d.members, { name: '', role: '', callTime: '' }] }
      : d
    ))
  }

  function removeMember(deptIdx: number, memberIdx: number) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? { ...d, members: d.members.filter((_, mIdx) => mIdx !== memberIdx) }
      : d
    ))
  }

  function updateMember(deptIdx: number, memberIdx: number, field: keyof CrewMember, value: string) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? {
          ...d,
          members: d.members.map((m, mIdx) => mIdx === memberIdx ? { ...m, [field]: value } : m),
        }
      : d
    ))
  }

  if (readonly) {
    return (
      <div className="space-y-4">
        {crew.map((dept, i) => (
          <div key={i}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{dept.dept}</p>
            <div className="divide-y rounded-lg border">
              {dept.members.map((m, mi) => (
                <div key={mi} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold text-foreground">{m.callTime || '—'}</p>
                    {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {crew.map((dept, deptIdx) => {
        const isCollapsed = collapsed.has(deptIdx)
        return (
          <div key={deptIdx} className="rounded-lg border border-border/70 overflow-hidden">
            {/* Dept header */}
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
              <button
                type="button"
                onClick={() => toggleCollapse(deptIdx)}
                className="text-muted-foreground hover:text-foreground"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </button>
              <input
                value={dept.dept}
                onChange={e => updateDeptName(deptIdx, e.target.value)}
                className="flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:outline-none focus:text-foreground"
              />
              <button
                type="button"
                onClick={() => removeDept(deptIdx)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Members */}
            {!isCollapsed && (
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1fr_80px_80px_24px] gap-2 px-3 py-1.5 border-b bg-muted/20 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Name</span>
                  <span>Role</span>
                  <span>Call</span>
                  <span>Phone</span>
                  <span />
                </div>

                {dept.members.map((m, memberIdx) => (
                  <div
                    key={memberIdx}
                    className="group/member grid grid-cols-[1fr_1fr_80px_80px_24px] gap-2 px-3 py-1.5 border-b last:border-0 items-center"
                  >
                    <input
                      placeholder="Name"
                      value={m.name}
                      onChange={e => updateMember(deptIdx, memberIdx, 'name', e.target.value)}
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      placeholder="Role"
                      value={m.role}
                      onChange={e => updateMember(deptIdx, memberIdx, 'role', e.target.value)}
                      className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      type="time"
                      value={m.callTime}
                      onChange={e => updateMember(deptIdx, memberIdx, 'callTime', e.target.value)}
                      className="w-full bg-transparent text-sm font-mono text-foreground focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      placeholder="—"
                      value={m.phone ?? ''}
                      onChange={e => updateMember(deptIdx, memberIdx, 'phone', e.target.value)}
                      className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <button
                      type="button"
                      onClick={() => removeMember(deptIdx, memberIdx)}
                      className="opacity-0 group-hover/member:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addMember(deptIdx)}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add member
                </button>
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={addDept}
        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add department
      </button>
    </div>
  )
}
