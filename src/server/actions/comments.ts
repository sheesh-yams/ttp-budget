'use server'

/**
 * Project activity / comment-thread server actions.
 *
 * Tenant isolation: every read/write goes through getScopedDb(), which injects
 * the active workspaceId into ProjectComment queries. A crafted projectId or
 * commentId from another workspace resolves to not-found rather than leaking.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import type { ActionResult } from '@/types'

// ─── Shared shape ─────────────────────────────────────────────────────────────

export interface ActivityComment {
  id:        string
  content:   string
  createdAt: string   // ISO string — serialisable across the server/client boundary
  /** True for the synthetic comment derived from the legacy Project.notes column. */
  isLegacy:  boolean
  author: {
    id:        string | null
    name:      string
    avatarUrl: string | null
  }
}

const SYSTEM_AUTHOR = { id: null, name: 'Project Notes', avatarUrl: null } as const

// ─── getProjectActivity ───────────────────────────────────────────────────────
// Returns the full thread, oldest-first. If the project still holds legacy text
// in Project.notes, it is surfaced as the first ("pinned") item authored by the
// project creator — never destructively migrated, so history is preserved.

export async function getProjectActivity(
  projectId: string,
): Promise<ActionResult<ActivityComment[]>> {
  try {
    const sdb = await getScopedDb()

    // Scoped findFirst → null if the project isn't in the active workspace.
    const project = await sdb.project.findFirst({
      where:  { id: projectId },
      select: {
        id:        true,
        notes:     true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })
    if (!project) return { success: false, error: 'Project not found' }

    const rows = await sdb.projectComment.findMany({
      where:   { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id:        true,
        content:   true,
        createdAt: true,
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })

    const thread: ActivityComment[] = []

    // Legacy notes → synthetic first comment (not persisted as a row).
    const legacy = project.notes?.trim()
    if (legacy) {
      const creator = project.createdBy
      thread.push({
        id:        'legacy-notes',
        content:   legacy,
        createdAt: project.createdAt.toISOString(),
        isLegacy:  true,
        author: creator
          ? { id: creator.id, name: creator.name ?? creator.email ?? 'Project Notes', avatarUrl: creator.avatarUrl }
          : SYSTEM_AUTHOR,
      })
    }

    for (const r of rows) {
      thread.push({
        id:        r.id,
        content:   r.content,
        createdAt: r.createdAt.toISOString(),
        isLegacy:  false,
        author: {
          id:        r.author?.id ?? null,
          name:      r.author?.name ?? r.author?.email ?? 'Unknown',
          avatarUrl: r.author?.avatarUrl ?? null,
        },
      })
    }

    return { success: true, data: thread }
  } catch {
    return { success: false, error: 'Failed to load activity' }
  }
}

// ─── addProjectComment ────────────────────────────────────────────────────────

const commentSchema = z.string().trim().min(1, 'Comment cannot be empty').max(5000)

export async function addProjectComment(
  projectId: string,
  content:   string,
): Promise<ActionResult<ActivityComment>> {
  try {
    const parsed = commentSchema.safeParse(content)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid comment' }
    }

    const [sdb, user, workspaceId] = await Promise.all([
      getScopedDb(),
      getCurrentUser(),
      getWorkspaceId(),
    ])

    // Ownership check: the project must belong to the active workspace.
    const project = await sdb.project.findFirst({
      where:  { id: projectId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    // workspaceId is auto-injected by the scoped client; passed explicitly here
    // too so the type-checker is satisfied (required column) — the values match.
    const created = await sdb.projectComment.create({
      data: { projectId, authorId: user.id, content: parsed.data, workspaceId },
      select: { id: true, content: true, createdAt: true },
    })

    revalidatePath(`/projects/${projectId}`)

    return {
      success: true,
      data: {
        id:        created.id,
        content:   created.content,
        createdAt: created.createdAt.toISOString(),
        isLegacy:  false,
        author: {
          id:        user.id,
          name:      user.name ?? user.email ?? 'You',
          avatarUrl: user.avatarUrl ?? null,
        },
      },
    }
  } catch {
    return { success: false, error: 'Failed to post comment' }
  }
}
