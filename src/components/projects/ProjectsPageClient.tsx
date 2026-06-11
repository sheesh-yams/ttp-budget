'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen, Calendar, Archive, ArchiveRestore, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewProjectModal } from './NewProjectModal'
import { archiveProject, unarchiveProject } from '@/server/actions/projects'
import type { Client, BudgetTemplate, ProjectStatus, ShootType } from '@prisma/client'

const STATUS_COLORS: Record<ProjectStatus, string> = {
  LEAD:     'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-green-100 text-green-800',
  WRAPPED:  'bg-blue-100 text-blue-800',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

const SHOOT_LABELS: Record<ShootType, string> = {
  MUSIC_VIDEO:    'Music Video',
  BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT:  'Product Shoot',
  EVENT_RECAP:    'Event Recap',
  SOCIAL_CONTENT: 'Social Content',
  INFLUENCER:     'Influencer',
  DOCUMENTARY:    'Documentary',
  OTHER:          'Other',
}

interface Project {
  id: string
  name: string
  status: ProjectStatus
  shootType: ShootType
  shootStartDate: Date | null
  client: { name: string }
  _count: { budgets: number; proposals: number; invoices: number }
}

interface Props {
  projects: Project[]
  clients: Pick<Client, 'id' | 'name'>[]
  templates: Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
  showArchived?: boolean
}

export function ProjectsPageClient({ projects, clients, templates, showArchived = false }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  // IDs removed optimistically while archive/restore is in flight
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const visible = projects.filter(p => !hiddenIds.has(p.id))

  async function handleArchive(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    setHiddenIds(prev => new Set([...prev, id]))
    await archiveProject(id)
  }

  async function handleRestore(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    setHiddenIds(prev => new Set([...prev, id]))
    await unarchiveProject(id)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          {showArchived ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <Link
                  href="/projects"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Active projects
                </Link>
              </div>
              <h1 className="text-2xl font-semibold text-foreground">Archived projects</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {visible.length} {visible.length === 1 ? 'project' : 'projects'}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {visible.length} {visible.length === 1 ? 'project' : 'projects'}
                {' · '}
                <Link
                  href="/projects?archived=1"
                  className="text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 transition-colors"
                >
                  View archived
                </Link>
              </p>
            </>
          )}
        </div>

        {!showArchived && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        )}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          {showArchived ? (
            <>
              <p className="font-medium text-foreground">No archived projects</p>
              <p className="mt-1 text-sm text-muted-foreground">Projects you archive will appear here.</p>
              <Link href="/projects">
                <Button variant="outline" className="mt-4" size="sm">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back to active
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your first project to get started.</p>
              <Button className="mt-4" onClick={() => setModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New project
              </Button>
            </>
          )}
        </div>
      )}

      {/* Project grid */}
      {visible.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(project => (
            <div key={project.id} className="group relative">
              <Link
                href={`/projects/${project.id}`}
                className="flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md h-full"
              >
                {/* Status + type */}
                <div className="mb-3 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[project.status]}`}>
                    {project.status}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {SHOOT_LABELS[project.shootType]}
                  </span>
                </div>

                {/* Name */}
                <h2 className="flex-1 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {project.name}
                </h2>

                {/* Client */}
                <p className="mt-1 text-xs text-muted-foreground">{project.client.name}</p>

                {/* Shoot date */}
                {project.shootStartDate && (
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(project.shootStartDate).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </div>
                )}

                {/* Counts */}
                <div className="mt-3 flex gap-3 border-t pt-3 text-[11px] text-muted-foreground">
                  <span>{project._count.budgets} budget{project._count.budgets !== 1 ? 's' : ''}</span>
                  <span>{project._count.proposals} proposal{project._count.proposals !== 1 ? 's' : ''}</span>
                  <span>{project._count.invoices} invoice{project._count.invoices !== 1 ? 's' : ''}</span>
                </div>
              </Link>

              {/* Archive / Restore button — hover reveal */}
              <button
                type="button"
                title={showArchived ? 'Restore project' : 'Archive project'}
                onClick={e => showArchived ? handleRestore(e, project.id) : handleArchive(e, project.id)}
                className={[
                  'absolute top-3 right-3 rounded-md p-1.5 shadow-sm border transition-all',
                  'opacity-0 group-hover:opacity-100',
                  showArchived
                    ? 'bg-background/90 text-muted-foreground hover:text-green-600 hover:border-green-200'
                    : 'bg-background/90 text-muted-foreground hover:text-destructive hover:border-destructive/30',
                ].join(' ')}
              >
                {showArchived
                  ? <ArchiveRestore className="h-3.5 w-3.5" />
                  : <Archive className="h-3.5 w-3.5" />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      <NewProjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        clients={clients}
        templates={templates}
      />
    </div>
  )
}
