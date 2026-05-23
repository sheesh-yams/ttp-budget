'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewProjectModal } from './NewProjectModal'
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
}

export function ProjectsPageClient({ projects, clients, templates }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first project to get started.</p>
          <Button className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        </div>
      )}

      {/* Project grid */}
      {projects.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
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
