'use client'

// Page-level autosave coordination around SaveQueue (src/lib/save-queue.ts):
//   • useSaveQueue — one queue per thing being edited (the memo, a fee row…)
//   • SaveScope   — knows every queue on the page: flushAll() before actions
//     that read saved data, flushes when the page is hidden or left, warns
//     before closing with unsaved/failed changes, and coalesces router.refresh
//     so the page re-syncs once after a pause (never over unsaved edits).
//   • SaveStatusLine — "Saving… / All changes saved / Couldn't save — Retry".

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { SaveQueue, type SaveResult, type SaveStatus } from '@/lib/save-queue'

export const AUTOSAVE_DELAY_MS = 2500

interface Scope {
  register:       (q: SaveQueue<object>) => () => void
  flushAll:       () => Promise<boolean>
  /** Drop edits that failed to save — the way out when one can never save. */
  discardFailed:  () => void
  exclusive:      <T>(fn: () => Promise<T>) => Promise<T>
  /** Bumped by discardFailed — editors remount on it to show the saved values again. */
  generation:     number
  /**
   * A one-off background save (e.g. a budget line saved after its pop-up
   * closed): counts as "saving" for the status line, refresh hold-back,
   * flushAll and the leave-page warning until it settles.
   */
  track:          <T>(p: Promise<T>) => Promise<T>
  requestRefresh: () => void
  /** Bumped on any queue status change — re-renders the status line. */
  notify:         () => void
  queues:         Set<SaveQueue<object>>
  tracked:        Set<Promise<unknown>>
  version:        number
}

const SaveScopeContext = createContext<Scope | null>(null)

export function SaveScope({ children, delay = AUTOSAVE_DELAY_MS }: { children: React.ReactNode; delay?: number }) {
  const router = useRouter()
  const queues = useRef(new Set<SaveQueue<object>>()).current
  const [version, setVersion] = useState(0)
  const [generation, setGeneration] = useState(0)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tracked = useRef(new Set<Promise<unknown>>()).current
  const anyBusy = useCallback(() => tracked.size > 0 || [...queues].some(q => q.busy), [queues, tracked])

  const track = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    tracked.add(p)
    setVersion(v => v + 1)
    const done = () => { tracked.delete(p); setVersion(v => v + 1) }
    p.then(done, done)
    return p
  }, [tracked])

  // One save at a time across the page (see SaveQueueOptions.exclusive).
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(fn, fn)
    chain.current = next.catch(() => undefined)
    return next
  }, [])

  // Discarded edits must also leave the screen: the editor remounts from the
  // saved values (SaveGeneration) and the page re-reads the server.
  const discardFailed = useCallback(() => {
    for (const q of queues) if (q.status === 'error') q.discard()
    setGeneration(g => g + 1)
    setVersion(v => v + 1)
    router.refresh()
  }, [queues, router])

  const notify = useCallback(() => setVersion(v => v + 1), [])

  // One refresh after things go quiet; postponed while anything is unsaved,
  // so server data never overwrites edits still on their way.
  const requestRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    const tick = () => {
      if (anyBusy()) { refreshTimer.current = setTimeout(tick, delay); return }
      refreshTimer.current = null
      router.refresh()
    }
    refreshTimer.current = setTimeout(tick, delay)
  }, [anyBusy, delay, router])

  const flushAll = useCallback(async () => {
    const results = await Promise.all([...queues].map(q => q.flush()))
    await Promise.allSettled([...tracked])
    return results.every(Boolean)
  }, [queues, tracked])

  const register = useCallback((q: SaveQueue<object>) => {
    queues.add(q)
    return () => { queues.delete(q) }
  }, [queues])

  // Leaving or hiding the page: save now. Closing with unsaved, saving or
  // failed changes: the browser asks first.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flushAll() }
    const onPageHide = () => { void flushAll() }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!anyBusy()) return
      void flushAll()
      e.preventDefault()
      e.returnValue = ''
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      // Navigating away inside the app: send what's pending (the request
      // outlives the component).
      void flushAll()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [anyBusy, flushAll])

  const value = useMemo<Scope>(
    () => ({ register, flushAll, discardFailed, exclusive, generation, track, tracked, requestRefresh, notify, queues, version }),
    [register, flushAll, discardFailed, exclusive, generation, track, tracked, requestRefresh, notify, queues, version],
  )
  return <SaveScopeContext.Provider value={value}>{children}</SaveScopeContext.Provider>
}

/**
 * Renders its children keyed by the scope's generation, so a Discard resets
 * every field (controlled or not) to the saved values.
 */
export function SaveGeneration({ children }: { children: React.ReactNode }) {
  const scope = useContext(SaveScopeContext)
  return <div key={scope?.generation ?? 0} className="contents">{children}</div>
}

export function useSaveScope(): Pick<Scope, 'flushAll' | 'discardFailed' | 'requestRefresh' | 'exclusive' | 'track'> {
  const scope = useContext(SaveScopeContext)
  if (!scope) throw new Error('useSaveScope must be used inside <SaveScope>')
  return scope
}

/**
 * A batched autosave for one thing being edited. `save` receives the merged
 * patch; it can change between renders (the latest is always used). Each
 * successful save requests a coalesced page refresh.
 */
export function useSaveQueue<P extends object>(save: (patch: P) => Promise<SaveResult>, opts: { refresh?: boolean } = {}) {
  const scope = useContext(SaveScopeContext)
  if (!scope) throw new Error('useSaveQueue must be used inside <SaveScope>')
  const saveRef = useRef(save)
  saveRef.current = save
  const refresh = opts.refresh ?? true

  const [queue] = useState(() => new SaveQueue<P>({
    save:     p => saveRef.current(p),
    onChange: () => scope.notify(),
    onSaved:  () => { if (refresh) scope.requestRefresh() },
    exclusive: scope.exclusive,
  }))

  const { register } = scope
  useEffect(() => register(queue as unknown as SaveQueue<object>), [register, queue])
  // A row/section going away mid-edit still saves what was typed.
  useEffect(() => () => { void queue.flush() }, [queue])

  return queue
}

/** Overall autosave state for the page — a quiet inline line, no toasts. */
export function SaveStatusLine({ className = '' }: { className?: string }) {
  const scope = useContext(SaveScopeContext)
  if (!scope) return null
  const all = [...scope.queues]
  const failed = all.find(q => q.status === 'error')
  const status: SaveStatus = failed ? 'error'
    : all.some(q => q.status === 'saving') || scope.tracked.size > 0 ? 'saving'
    : all.some(q => q.status === 'dirty') ? 'dirty'
    : all.some(q => q.status === 'saved') ? 'saved'
    : 'idle'

  if (status === 'idle') return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${status === 'error' ? 'text-destructive' : 'text-muted-foreground'} ${className}`} aria-live="polite">
      {status === 'error' ? (
        <>
          <AlertCircle className="h-3.5 w-3.5" />
          Couldn’t save{failed?.error ? ` — ${failed.error.replace(/[.!]+$/, '')}` : ''}.
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => void scope.flushAll()}>Retry</button>
          <button type="button" className="underline underline-offset-2" onClick={() => scope.discardFailed()}>Discard</button>
        </>
      ) : status === 'saving' || status === 'dirty' ? (
        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {status === 'saving' ? 'Saving…' : 'Unsaved changes'}</>
      ) : (
        <><Check className="h-3.5 w-3.5 text-emerald-600" /> All changes saved</>
      )}
    </span>
  )
}
