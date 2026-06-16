'use client'

/**
 * ActivitySidebar — ClickUp/Linear-style project activity feed.
 *
 * Layout (fills its parent's height; only the thread scrolls):
 *   ┌────────────────────────────┐
 *   │ Client Notes callout (top) │  flex-shrink-0
 *   │ children slot (e.g. info)  │  flex-shrink-0
 *   │ ── comment thread ──       │  flex-1, min-h-0, overflow-y-auto
 *   │   (scrolls independently)  │
 *   │ Write a comment… (sticky)  │  flex-shrink-0
 *   └────────────────────────────┘
 */

import { useEffect, useRef, useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Info, Loader2, MessageSquare } from 'lucide-react'
import { getProjectActivity, type ActivityComment } from '@/server/actions/comments'
import { CommentInput } from './CommentInput'

interface Props {
  projectId:   string
  clientName:  string
  /** Client.specialNotes — high-level rules shown read-only at the top. */
  clientNotes: string | null
  /** Defer the fetch until the panel is actually visible (drawer opened). */
  active?:     boolean
  /** Optional slot rendered under the callout, above the thread (e.g. contact info). */
  children?:   React.ReactNode
}

function formatActivityTime(iso: string): string {
  const d = new Date(iso)
  if (isToday(d))     return `Today at ${format(d, 'h:mm a')}`
  if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`
  return format(d, "MMM d 'at' h:mm a")
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold uppercase text-violet-700 select-none">
      {initials(name) || '?'}
    </div>
  )
}

// ─── Single comment card ──────────────────────────────────────────────────────

function CommentCard({ comment }: { comment: ActivityComment }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <Avatar name={comment.author.name} url={comment.author.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {comment.author.name}
            </span>
            {comment.isLegacy && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                Pinned note
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatActivityTime(comment.createdAt)}
          </span>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">
        {comment.content}
      </p>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function ActivitySidebar({
  projectId,
  clientName,
  clientNotes,
  active = true,
  children,
}: Props) {
  const [comments, setComments] = useState<ActivityComment[] | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Lazy-load once the panel becomes active.
  useEffect(() => {
    if (!active || comments !== null) return
    let cancelled = false
    getProjectActivity(projectId).then(res => {
      if (cancelled) return
      if (res.success) setComments(res.data)
      else { setError((res as { success: false; error: string }).error); setComments([]) }
    })
    return () => { cancelled = true }
  }, [active, projectId, comments])

  // Auto-scroll the thread to the newest comment.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments])

  function handleAdded(comment: ActivityComment) {
    setComments(prev => [...(prev ?? []), comment])
  }

  const loading = comments === null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Client notes callout (very top) ──────────────────────────────── */}
      {clientNotes?.trim() && (
        <div className="flex-shrink-0 border-b border-amber-200/70 bg-amber-50/70 px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80">
                Client Notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-amber-900/90">
                {clientNotes}
              </p>
              <p className="mt-1 text-[10px] text-amber-700/50">
                Shared across all {clientName} projects
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Optional slot (contact info, etc.) ───────────────────────────── */}
      {children && <div className="flex-shrink-0">{children}</div>}

      {/* ── Activity thread (only this region scrolls) ───────────────────── */}
      <div
        ref={threadRef}
        className="flex-1 min-h-0 space-y-2.5 overflow-y-auto bg-muted/30 px-3 py-3"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <MessageSquare className="mb-2 h-7 w-7 text-muted-foreground/30" />
            <p className="text-[13px] font-medium text-foreground">No activity yet</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {error ?? 'Start the conversation — leave the first comment below.'}
            </p>
          </div>
        ) : (
          comments.map(c => <CommentCard key={c.id} comment={c} />)
        )}
      </div>

      {/* ── Sticky composer ──────────────────────────────────────────────── */}
      <div className="mt-auto flex-shrink-0">
        <CommentInput projectId={projectId} onAdded={handleAdded} />
      </div>
    </div>
  )
}
